import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { addDaysISO, todayClinicISO } from "@/lib/dates";
import type { SessionUser } from "@/lib/auth";
import { bookAppointment } from "@/lib/slots";
import { checkInAppointment } from "@/lib/queue";
import { findDuplicatePatients, createPatient } from "@/lib/patients";
import { getPatientClinicalHistory } from "@/lib/visits";
import { queueNotification, processNotificationQueue } from "@/lib/notify";
import { exportBackup, restoreBackup } from "@/lib/backup";
import { attendanceReport, waitTimeReport } from "@/lib/reports";

const admin: SessionUser = { userId: 1, username: "admin", role: "administrator", displayName: "System Administrator" };
const manager: SessionUser = { userId: 2, username: "manager", role: "manager", displayName: "Clinic Manager" };
const reception: SessionUser = { userId: 3, username: "reception", role: "receptionist", displayName: "Reception" };

async function insertSlot(
  practitionerId: number,
  slotDate: string,
  startTime: string,
  endTime: string
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO availability_slot (practitioner_id, slot_date, start_time, end_time, slot_status)
     VALUES ($1, $2, $3, $4, 'open') RETURNING slot_id`,
    [practitionerId, slotDate, startTime, endTime]
  );
  return Number(r.rows[0].slot_id);
}

async function tableCounts(): Promise<Record<string, number>> {
  const tables = [
    "department",
    "user_account",
    "patient",
    "practitioner",
    "availability_slot",
    "appointment",
    "queue_entry",
    "visit_record",
    "notification",
    "activity_log",
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    counts[t] = Number(r.rows[0].n);
  }
  return counts;
}

describe("Acceptance tests (AT-01 .. AT-07)", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("AT-01: two users confirm the same slot simultaneously - exactly one commits", async () => {
    const slotId = await insertSlot(1, addDaysISO(todayClinicISO(), 30), "12:00", "13:00");
    try {
      const results = await Promise.all([
        bookAppointment({ patientId: 1, slotId, bookingSource: "front_desk", visitReason: "AT-01 patient A" }, reception),
        bookAppointment({ patientId: 2, slotId, bookingSource: "front_desk", visitReason: "AT-01 patient B" }, reception),
      ]);
      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      const loser = losers[0];
      if (!loser.ok) {
        expect(loser.reason).toBe("already_booked");
        expect(Array.isArray(loser.alternatives)).toBe(true);
      }
      if (winners[0].ok) {
        await pool.query(`DELETE FROM notification WHERE appointment_id = $1`, [winners[0].appointment.appointment_id]);
        await pool.query(`DELETE FROM appointment WHERE appointment_id = $1`, [winners[0].appointment.appointment_id]);
      }
    } finally {
      await pool.query(`DELETE FROM availability_slot WHERE slot_id = $1`, [slotId]);
    }
  });

  it("AT-02: reception user denied visit-record access and the attempt is logged", async () => {
    const result = await getPatientClinicalHistory(1, reception);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Clinical records");
    }
    const logged = await pool.query(
      `SELECT * FROM activity_log
       WHERE action_type = 'denied_access' AND user_id = 3 AND object_type = 'visit_record'
       ORDER BY activity_id DESC LIMIT 1`
    );
    expect(logged.rowCount).toBe(1);
    expect(Number(logged.rows[0].object_id)).toBe(1);
    await pool.query(`DELETE FROM activity_log WHERE activity_id = $1`, [logged.rows[0].activity_id]);
  });

  it("AT-03: registration with existing phone and matching DOB surfaces a duplicate first", async () => {
    const candidates = await findDuplicatePatients({
      first_name: "Amarachi",
      last_name: "Okafor",
      date_of_birth: "1992-04-18",
      phone: "08033124567",
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.hospital_number === "VS-000001")).toBe(true);
    const fresh = await findDuplicatePatients({
      first_name: "Zainab",
      last_name: "Yusuf",
      date_of_birth: "1990-01-01",
      phone: "08099999999",
    });
    expect(fresh).toHaveLength(0);
  });

  it("AT-04: checking in one appointment twice keeps a single queue entry", async () => {
    const slotId = await insertSlot(1, todayClinicISO(), "20:30", "21:30");
    let appointmentId: number | null = null;
    try {
      const booked = await bookAppointment(
        { patientId: 3, slotId, bookingSource: "front_desk", visitReason: "AT-04" },
        reception
      );
      expect(booked.ok).toBe(true);
      if (booked.ok) {
        appointmentId = Number(booked.appointment.appointment_id);
        const first = await checkInAppointment(appointmentId, reception);
        expect(first.ok).toBe(true);
        if (first.ok) {
          expect(first.firstCheckIn).toBe(true);
          const second = await checkInAppointment(appointmentId, reception);
          expect(second.ok).toBe(false);
          if (!second.ok) {
            expect(second.message).toMatch(/queue number \d+/);
          }
        }
      }
      if (appointmentId !== null) {
        const entries = await pool.query(
          `SELECT COUNT(*)::int AS n FROM queue_entry WHERE appointment_id = $1`,
          [appointmentId]
        );
        expect(Number(entries.rows[0].n)).toBe(1);
      }
    } finally {
      if (appointmentId !== null) {
        await pool.query(`DELETE FROM queue_entry WHERE appointment_id = $1`, [appointmentId]);
        await pool.query(`DELETE FROM notification WHERE appointment_id = $1`, [appointmentId]);
        await pool.query(`DELETE FROM appointment WHERE appointment_id = $1`, [appointmentId]);
      }
      await pool.query(`DELETE FROM availability_slot WHERE slot_id = $1`, [slotId]);
    }
  });

  it("AT-05: temporary provider failure moves a notification to retrying, then final delivery is recorded", async () => {
    for (let i = 0; i < 5; i += 1) {
      const flushed = await processNotificationQueue();
      if (flushed.processed + flushed.retrying + flushed.failed === 0) break;
    }
    const slotId = await insertSlot(1, addDaysISO(todayClinicISO(), 30), "12:00", "13:00");
    let appointmentId: number | null = null;
    let notificationId: number | null = null;
    try {
      const booked = await bookAppointment(
        { patientId: 1, slotId, bookingSource: "front_desk", visitReason: "AT-05" },
        reception
      );
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error("bookAppointment failed in AT-05");
      appointmentId = Number(booked.appointment.appointment_id);

      await queueNotification({
        appointmentId,
        messageType: "reminder",
        channel: "sms",
        destination: "08033124567",
      });
      const n = await pool.query(
        `SELECT notification_id FROM notification
         WHERE appointment_id = $1 AND message_type = 'reminder' ORDER BY notification_id DESC LIMIT 1`,
        [appointmentId]
      );
      notificationId = Number(n.rows[0].notification_id);

      await processNotificationQueue({ failSimulation: "fail_once" });
      const retrying = await pool.query(
        `SELECT delivery_status, attempts FROM notification WHERE notification_id = $1`,
        [notificationId]
      );
      expect(retrying.rows[0].delivery_status).toBe("retrying");
      expect(Number(retrying.rows[0].attempts)).toBe(1);

      await processNotificationQueue();
      const delivered = await pool.query(
        `SELECT delivery_status, attempts, processed_at FROM notification WHERE notification_id = $1`,
        [notificationId]
      );
      expect(delivered.rows[0].delivery_status).toBe("delivered");
      expect(Number(delivered.rows[0].attempts)).toBe(2);
      expect(delivered.rows[0].processed_at).not.toBeNull();
    } finally {
      if (appointmentId !== null) {
        await pool.query(`DELETE FROM notification WHERE appointment_id = $1`, [appointmentId]);
        await pool.query(`DELETE FROM appointment WHERE appointment_id = $1`, [appointmentId]);
      }
      await pool.query(`DELETE FROM availability_slot WHERE slot_id = $1`, [slotId]);
    }
  });

  it("AT-07: manager's June General Outpatient report totals reconcile with underlying data and median wait uses queue timestamps", async () => {
    const day = "2026-06-15";
    const slotA = await insertSlot(1, day, "09:00", "10:00");
    const slotB = await insertSlot(1, day, "10:00", "11:00");
    const slotC = await insertSlot(1, day, "11:00", "12:00");
    const appIds: number[] = [];
    try {
      const ins = await pool.query(
        `INSERT INTO appointment (patient_id, practitioner_id, slot_id, recorded_by, booking_source, visit_reason, status)
         VALUES ($1, 1, $2, 1, 'front_desk', 'AT-07 A', 'completed'),
                ($3, 1, $4, 1, 'front_desk', 'AT-07 B', 'completed'),
                ($5, 1, $6, 1, 'front_desk', 'AT-07 C', 'cancelled')
         RETURNING appointment_id`,
        [1, slotA, 2, slotB, 3, slotC]
      );
      for (const row of ins.rows) appIds.push(Number(row.appointment_id));

      await pool.query(
        `INSERT INTO queue_entry (appointment_id, checked_in_at, queue_number, queue_status, called_at, completed_at)
         VALUES ($1, '2026-06-15T09:02:00+00:00', 1, 'completed', '2026-06-15T09:12:00+00:00', '2026-06-15T09:30:00+00:00'),
                ($2, '2026-06-15T10:05:00+00:00', 2, 'completed', '2026-06-15T10:35:00+00:00', '2026-06-15T10:50:00+00:00')`,
        [appIds[0], appIds[1]]
      );

      const attendance = await attendanceReport({ from: "2026-06-01", to: "2026-06-30", departmentId: 1 }, manager);
      expect(attendance.total).toBe(3);
      expect(attendance.byStatus).toEqual({ completed: 2, cancelled: 1 });
      expect(attendance.cancelledCount).toBe(1);
      expect(attendance.noShowCount).toBe(0);
      expect(attendance.attendanceRate).toBe(100);

      const wait = await waitTimeReport({ from: "2026-06-01", to: "2026-06-30", departmentId: 1 }, manager);
      expect(wait.count).toBe(2);
      expect(wait.medianMinutes).toBe(20);
      expect(wait.byPractitioner).toHaveLength(1);
      expect(wait.byPractitioner[0]).toMatchObject({
        practitioner_id: 1,
        count: 2,
        median_minutes: 20,
      });
    } finally {
      if (appIds.length > 0) {
        await pool.query(
          `DELETE FROM queue_entry WHERE appointment_id = ANY($1::bigint[])`,
          [appIds]
        );
        await pool.query(
          `DELETE FROM appointment WHERE appointment_id = ANY($1::bigint[])`,
          [appIds]
        );
      }
      await pool.query(`DELETE FROM availability_slot WHERE slot_id = ANY($1::bigint[])`, [
        [slotA, slotB, slotC],
      ]);
      await pool.query(
        `DELETE FROM activity_log WHERE action_type = 'report_view' AND user_id = 2`
      );
    }
  });

  it("AT-06: backup restoration exercise - export, restore, and the service reconciles afterwards", async () => {
    const before = await tableCounts();
    const backup = await exportBackup(admin);
    for (const [table, count] of Object.entries(before)) {
      expect(backup.counts[table]).toBe(count);
    }
    expect(backup.tables.patient.rows.some((p) => p.hospital_number === "VS-000001")).toBe(true);

    const restored = await restoreBackup(backup, admin);
    for (const [table, count] of Object.entries(backup.counts)) {
      expect(restored[table]).toBe(count);
    }

    const after = await tableCounts();
    for (const [table, count] of Object.entries(before)) {
      if (table === "activity_log") {
        expect(after[table]).toBe(count + 1);
      } else {
        expect(after[table]).toBe(count);
      }
    }

    const patient = await createPatient(
      {
        first_name: "AT06",
        last_name: "Restored",
        date_of_birth: "2000-01-01",
        sex: "Female",
        phone: "08044443333",
        address: "Test address",
        emergency_contact: "Test contact",
      },
      admin
    );
    expect(patient.hospital_number).toMatch(/^VS-\d{6}$/);
    await pool.query(`DELETE FROM patient WHERE patient_id = $1`, [patient.patient_id]);

    const slotId = await insertSlot(1, addDaysISO(todayClinicISO(), 30), "12:00", "13:00");
    const booked = await bookAppointment(
      { patientId: 1, slotId, bookingSource: "front_desk", visitReason: "AT-06 post-restore" },
      reception
    );
    expect(booked.ok).toBe(true);
    if (booked.ok) {
      await pool.query(`DELETE FROM notification WHERE appointment_id = $1`, [booked.appointment.appointment_id]);
      await pool.query(`DELETE FROM appointment WHERE appointment_id = $1`, [booked.appointment.appointment_id]);
    }
    await pool.query(`DELETE FROM availability_slot WHERE slot_id = $1`, [slotId]);
  });
});

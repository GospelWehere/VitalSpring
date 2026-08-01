import { pool, query } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { todayClinicISO, clinicDateISO } from "@/lib/dates";
import { queueNotification } from "@/lib/notify";

export interface SlotRow {
  slot_id: number;
  practitioner_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  slot_status: "open" | "reserved" | "blocked" | "expired";
}

export interface DepartmentRow {
  department_id: number;
  department_name: string;
  location: string;
}

export interface PractitionerRow {
  practitioner_id: number;
  department_id: number;
  staff_number: string;
  full_name: string;
  professional_role: string;
  phone: string;
  email: string;
  active: boolean;
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  return query(`SELECT * FROM department ORDER BY department_name`);
}

export async function listPractitioners(departmentId?: number): Promise<(PractitionerRow & { department_name: string })[]> {
  const params: unknown[] = [];
  let where = "WHERE p.active = TRUE";
  if (departmentId) {
    params.push(departmentId);
    where += ` AND p.department_id = $${params.length}`;
  }
  return query(
    `SELECT p.*, d.department_name
     FROM practitioner p
     JOIN department d ON d.department_id = p.department_id
     ${where}
     ORDER BY d.department_name, p.full_name`,
    params
  );
}

export async function listPractitionersAll(): Promise<(PractitionerRow & { department_name: string })[]> {
  return query(
    `SELECT p.*, d.department_name
     FROM practitioner p
     JOIN department d ON d.department_id = p.department_id
     ORDER BY d.department_name, p.full_name`
  );
}

export async function listSlots(practitionerId: number, from: string, to: string): Promise<SlotRow[]> {
  return query(
    `SELECT * FROM availability_slot
     WHERE practitioner_id = $1 AND slot_date BETWEEN $2 AND $3
     ORDER BY slot_date, start_time`,
    [practitionerId, from, to]
  );
}

export async function createSlots(
  input: { practitionerId: number; days: number; startHour: number; endHour: number },
  actor: SessionUser
): Promise<{ created: number; skipped: number }> {
  const { practitionerId, days, startHour, endHour } = input;
  const from = todayClinicISO();
  const dates: string[] = [];
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  let created = 0;
  let skipped = 0;
  for (const date of dates) {
    for (let h = startHour; h < endHour; h += 1) {
      const start = `${String(h).padStart(2, "0")}:00`;
      const end = `${String(h + 1).padStart(2, "0")}:00`;
      const result = await pool.query(
        `INSERT INTO availability_slot (practitioner_id, slot_date, start_time, end_time, slot_status)
         VALUES ($1, $2, $3, $4, 'open')
         ON CONFLICT (practitioner_id, slot_date, start_time) DO NOTHING`,
        [practitionerId, date, start, end]
      );
      if (result.rowCount && result.rowCount > 0) created += 1;
      else skipped += 1;
    }
  }
  await logActivity({
    userId: actor.userId,
    action: "slot_create",
    objectType: "availability_slot",
    objectId: practitionerId,
  });
  return { created, skipped };
}

export async function setSlotStatus(slotId: number, status: "blocked" | "open", actor: SessionUser): Promise<void> {
  await pool.query(`UPDATE availability_slot SET slot_status = $1 WHERE slot_id = $2`, [status, slotId]);
  await logActivity({
    userId: actor.userId,
    action: "slot_block",
    objectType: "availability_slot",
    objectId: slotId,
  });
}

export interface AppointmentRow {
  appointment_id: number;
  patient_id: number;
  practitioner_id: number;
  slot_id: number;
  recorded_by: number | null;
  booking_source: string;
  visit_reason: string;
  status: string;
  booked_at: Date;
}

export type BookingResult =
  | { ok: true; appointment: AppointmentRow }
  | { ok: false; reason: "already_booked" | "slot_not_available" | "past_slot" | "invalid"; message: string; alternatives: SlotRow[] };

export async function listOpenSlotsForBooking(practitionerId: number): Promise<SlotRow[]> {
  const today = todayClinicISO();
  const rows = await query<SlotRow>(
    `SELECT * FROM availability_slot
     WHERE practitioner_id = $1 AND slot_date >= $2
     ORDER BY slot_date, start_time
     LIMIT 90`,
    [practitionerId, today]
  );
  const now = new Date();
  return rows.map((r) => {
    if (clinicDateISO(r.slot_date) === today) {
      const [h, m] = r.start_time.split(":").map(Number);
      const slotDate = new Date(now);
      slotDate.setHours(h, m, 0, 0);
      if (slotDate.getTime() <= now.getTime()) return { ...r, slot_status: "expired" as const };
    }
    return r;
  });
}

/**
 * FR-09 / §4.6.1 conflict-control transaction:
 * BEGIN → lock the selected slot → verify slot_status='open' and the slot is in the
 * future → INSERT the appointment → UPDATE slot to 'reserved' → COMMIT.
 * The UNIQUE slot_id on appointment is the second database-level barrier
 * (AT-01: exactly one of two concurrent confirmations commits).
 */
export async function bookAppointment(
  input: { patientId: number; slotId: number; bookingSource: string; visitReason: string },
  actor: SessionUser | null
): Promise<BookingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockResult = await client.query(
      `SELECT * FROM availability_slot WHERE slot_id = $1 FOR UPDATE`,
      [input.slotId]
    );
    const slot: SlotRow | undefined = lockResult.rows[0];
    if (!slot) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid", message: "That slot does not exist.", alternatives: [] };
    }
    if (slot.slot_status !== "open") {
      await client.query("ROLLBACK");
      const alternatives = await listOpenSlotsForBooking(slot.practitioner_id);
      return {
        ok: false,
        reason: slot.slot_status === "reserved" ? "already_booked" : "slot_not_available",
        message:
          slot.slot_status === "reserved"
            ? "That time was just booked by another patient. Choose a different time."
            : "That slot is not available.",
        alternatives,
      };
    }
    if ((clinicDateISO(slot.slot_date) ?? "") < todayClinicISO()) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "past_slot", message: "You cannot book a time in the past.", alternatives: [] };
    }

    let appointment: AppointmentRow;
    try {
      const insert = await client.query(
        `INSERT INTO appointment (patient_id, practitioner_id, slot_id, recorded_by, booking_source, visit_reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [input.patientId, slot.practitioner_id, slot.slot_id, actor?.userId ?? null, input.bookingSource, input.visitReason]
      );
      appointment = insert.rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        await client.query("ROLLBACK");
        const alternatives = await listOpenSlotsForBooking(slot.practitioner_id);
        return {
          ok: false,
          reason: "already_booked",
          message: "That time was just booked by another patient. Choose a different time.",
          alternatives,
        };
      }
      throw err;
    }

    await client.query(`UPDATE availability_slot SET slot_status = 'reserved' WHERE slot_id = $1`, [slot.slot_id]);

    if (actor) {
      await logActivity({
        userId: actor.userId,
        action: "appointment_create",
        objectType: "appointment",
        objectId: Number(appointment.appointment_id),
        client,
      });
    }

    const patientPhone = await client.query(`SELECT phone FROM patient WHERE patient_id = $1`, [input.patientId]);
    const destination = patientPhone.rows[0]?.phone ?? null;

    await client.query("COMMIT");

    if (destination) {
      await queueNotification({
        appointmentId: Number(appointment.appointment_id),
        messageType: "confirmation",
        channel: "sms",
        destination,
      });
    }
    return { ok: true, appointment };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getAppointment(appointmentId: number): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT a.*, s.slot_date, s.start_time, s.end_time,
            p.full_name AS practitioner_name, p.professional_role,
            d.department_name,
            pat.first_name AS patient_first_name, pat.last_name AS patient_last_name,
            pat.hospital_number, pat.phone AS patient_phone
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     JOIN patient pat ON pat.patient_id = a.patient_id
     WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  return rows[0] ?? null;
}

export async function cancelAppointment(
  appointmentId: number,
  actor: SessionUser
): Promise<{ ok: true; reopened: boolean } | { ok: false; message: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(`SELECT * FROM appointment WHERE appointment_id = $1 FOR UPDATE`, [appointmentId]);
    const app = locked.rows[0];
    if (!app) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Appointment not found." };
    }
    if (app.status === "cancelled" || app.status === "no_show") {
      await client.query("ROLLBACK");
      return { ok: false, message: "This appointment is already closed." };
    }
    await client.query(`UPDATE appointment SET status = 'cancelled' WHERE appointment_id = $1`, [appointmentId]);

    const slot = await client.query(`SELECT * FROM availability_slot WHERE slot_id = $1`, [app.slot_id]);
    let reopened = false;
    if (slot.rows[0] && (clinicDateISO(slot.rows[0].slot_date) ?? "") >= todayClinicISO()) {
      await client.query(
        `UPDATE availability_slot SET slot_status = 'open' WHERE slot_id = $1`,
        [app.slot_id]
      );
      reopened = true;
    }

    await logActivity({
      userId: actor.userId,
      action: "appointment_cancel",
      objectType: "appointment",
      objectId: appointmentId,
      client,
    });
    const dest = await client.query(
      `SELECT phone FROM patient WHERE patient_id = $1`,
      [app.patient_id]
    );
    const destination = dest.rows[0]?.phone;
    await client.query("COMMIT");

    if (destination) {
      await queueNotification({
        appointmentId,
        messageType: "cancellation",
        channel: "sms",
        destination,
      });
    }
    return { ok: true, reopened };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rescheduleAppointment(
  appointmentId: number,
  newSlotId: number,
  actor: SessionUser
): Promise<BookingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query(`SELECT * FROM appointment WHERE appointment_id = $1 FOR UPDATE`, [appointmentId]);
    const oldApp = old.rows[0];
    if (!oldApp) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid", message: "Appointment not found.", alternatives: [] };
    }
    if (oldApp.status === "cancelled" || oldApp.status === "no_show" || oldApp.status === "completed") {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid", message: "This appointment can no longer be rescheduled.", alternatives: [] };
    }

    const lockResult = await client.query(`SELECT * FROM availability_slot WHERE slot_id = $1 FOR UPDATE`, [newSlotId]);
    const newSlot: SlotRow | undefined = lockResult.rows[0];
    if (!newSlot || newSlot.slot_status !== "open" || (clinicDateISO(newSlot.slot_date) ?? "") < todayClinicISO()) {
      await client.query("ROLLBACK");
      const alternatives = await listOpenSlotsForBooking(oldApp.practitioner_id);
      return {
        ok: false,
        reason: "slot_not_available",
        message: "The requested new time is no longer available.",
        alternatives,
      };
    }

    await client.query(`UPDATE appointment SET status = 'cancelled' WHERE appointment_id = $1`, [appointmentId]);
    const oldSlot = await client.query(`SELECT slot_date FROM availability_slot WHERE slot_id = $1`, [oldApp.slot_id]);
    if (oldSlot.rows[0] && (clinicDateISO(oldSlot.rows[0].slot_date) ?? "") >= todayClinicISO()) {
      await client.query(`UPDATE availability_slot SET slot_status = 'open' WHERE slot_id = $1`, [oldApp.slot_id]);
    }

    const insert = await client.query(
      `INSERT INTO appointment (patient_id, practitioner_id, slot_id, recorded_by, booking_source, visit_reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [oldApp.patient_id, newSlot.practitioner_id, newSlot.slot_id, actor.userId, oldApp.booking_source, oldApp.visit_reason]
    );
    const newApp: AppointmentRow = insert.rows[0];
    await client.query(`UPDATE availability_slot SET slot_status = 'reserved' WHERE slot_id = $1`, [newSlot.slot_id]);

    await logActivity({
      userId: actor.userId,
      action: "appointment_reschedule",
      objectType: "appointment",
      objectId: appointmentId,
      client,
    });

    const dest = await client.query(`SELECT phone FROM patient WHERE patient_id = $1`, [oldApp.patient_id]);
    const destination = dest.rows[0]?.phone;
    await client.query("COMMIT");

    if (destination) {
      await queueNotification({
        appointmentId: Number(newApp.appointment_id),
        messageType: "reschedule",
        channel: "sms",
        destination,
      });
    }
    return { ok: true, appointment: newApp };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

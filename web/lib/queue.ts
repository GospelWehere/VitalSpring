import { pool, query } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { todayClinicISO, clinicDateISO } from "@/lib/dates";

export interface QueueRow {
  queue_entry_id: number;
  appointment_id: number;
  checked_in_at: Date;
  queue_number: number;
  queue_status: string;
  called_at: Date | null;
  completed_at: Date | null;
}

export interface LiveQueueRow {
  queue_entry_id: number;
  queue_number: number;
  queue_status: string;
  checked_in_at: Date;
  called_at: Date | null;
  appointment_id: number;
  visit_reason: string;
  patient_id: number;
  hospital_number: string;
  patient_name: string;
  sex: string;
  date_of_birth: string;
  practitioner_id: number;
  practitioner_name: string;
  professional_role: string;
  department_name: string;
  slot_date: string;
  start_time: string;
  waiting_minutes: number;
}

/**
 * FR-10 / AT-04: a valid appointment creates exactly one numbered queue entry.
 * A second check-in attempt returns the existing entry with its number instead
 * of creating a duplicate.
 */
export async function checkInAppointment(
  appointmentId: number,
  actor: SessionUser
): Promise<{ ok: true; queueEntry: QueueRow; firstCheckIn: boolean } | { ok: false; message: string; queueEntry?: QueueRow }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM appointment WHERE appointment_id = $1 FOR UPDATE`,
      [appointmentId]
    );
    const app = locked.rows[0];
    if (!app) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Appointment not found." };
    }
    if (app.status === "cancelled" || app.status === "no_show") {
      await client.query("ROLLBACK");
      return { ok: false, message: "This appointment is no longer active." };
    }
    if (app.status === "completed") {
      await client.query("ROLLBACK");
      return { ok: false, message: "This visit has already been completed." };
    }
    if (app.status === "checked_in" || app.status === "called" || app.status === "in_consultation") {
      const existing = await client.query(
        `SELECT * FROM queue_entry WHERE appointment_id = $1`,
        [appointmentId]
      );
      await client.query("ROLLBACK");
      if (existing.rows[0]) {
        return {
          ok: false,
          message: `This patient is already checked in with queue number ${existing.rows[0].queue_number}.`,
          queueEntry: existing.rows[0],
        };
      }
      return { ok: false, message: "This patient is already checked in." };
    }

    const today = todayClinicISO();
    const slotRow = await client.query(
      `SELECT slot_date FROM availability_slot WHERE slot_id = $1`,
      [app.slot_id]
    );
    const slotDate = clinicDateISO(slotRow.rows[0]?.slot_date);
    if (slotDate !== today) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        message:
          slotDate && slotDate < today
            ? "This appointment was for a past date and cannot be checked in."
            : "Check-in is only allowed on the appointment date.",
      };
    }

    const numResult = await client.query(
      `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_number
       FROM queue_entry qe
       JOIN appointment a ON a.appointment_id = qe.appointment_id
       JOIN availability_slot s ON s.slot_id = a.slot_id
       WHERE s.slot_date = $1`,
      [today]
    );
    const queueNumber = Number(numResult.rows[0].next_number);

    const inserted = await client.query(
      `INSERT INTO queue_entry (appointment_id, checked_in_at, queue_number, queue_status)
       VALUES ($1, now(), $2, 'waiting')
       RETURNING *`,
      [appointmentId, queueNumber]
    );
    await client.query(`UPDATE appointment SET status = 'checked_in' WHERE appointment_id = $1`, [appointmentId]);

    await logActivity({
      userId: actor.userId,
      action: "check_in",
      objectType: "appointment",
      objectId: appointmentId,
      client,
    });
    await client.query("COMMIT");
    return { ok: true, queueEntry: inserted.rows[0], firstCheckIn: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const QUEUE_TO_APPOINTMENT: Record<string, string> = {
  waiting: "checked_in",
  vitals: "checked_in",
  called: "called",
  with_practitioner: "in_consultation",
  completed: "completed",
  left: "no_show",
};

export const VALID_QUEUE_TRANSITIONS: Record<string, string[]> = {
  waiting: ["vitals", "called", "left"],
  vitals: ["called", "waiting", "left"],
  called: ["with_practitioner", "left"],
  with_practitioner: ["completed", "left"],
  completed: [],
  left: [],
};

export async function transitionQueue(
  queueEntryId: number,
  toStatus: string,
  actor: SessionUser
): Promise<{ ok: true; queueEntry: QueueRow } | { ok: false; message: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM queue_entry WHERE queue_entry_id = $1 FOR UPDATE`,
      [queueEntryId]
    );
    const entry: QueueRow | undefined = locked.rows[0];
    if (!entry) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Queue entry not found." };
    }
    if (entry.queue_status === "completed" || entry.queue_status === "left") {
      await client.query("ROLLBACK");
      return { ok: false, message: "This queue entry is already closed." };
    }
    if (!VALID_QUEUE_TRANSITIONS[entry.queue_status]?.includes(toStatus)) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        message: `Cannot move from "${entry.queue_status}" to "${toStatus}".`,
      };
    }

    const updates: string[] = [`queue_status = $1`];
    const params: unknown[] = [toStatus];
    if (toStatus === "called") {
      params.push(new Date());
      updates.push(`called_at = $${params.length}`);
    }
    if (toStatus === "completed" || toStatus === "left") {
      params.push(new Date());
      updates.push(`completed_at = $${params.length}`);
    }
    params.push(queueEntryId);
    const result = await client.query(
      `UPDATE queue_entry SET ${updates.join(", ")} WHERE queue_entry_id = $${params.length} RETURNING *`,
      params
    );
    const appointmentStatus = QUEUE_TO_APPOINTMENT[toStatus];
    if (appointmentStatus) {
      await client.query(
        `UPDATE appointment SET status = $1 WHERE appointment_id = $2`,
        [appointmentStatus, entry.appointment_id]
      );
    }
    await logActivity({
      userId: actor.userId,
      action: "queue_transition",
      objectType: "queue_entry",
      objectId: queueEntryId,
      client,
    });
    await client.query("COMMIT");
    return { ok: true, queueEntry: result.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLiveQueue(): Promise<LiveQueueRow[]> {
  return query(
    `SELECT qe.queue_entry_id, qe.queue_number, qe.queue_status, qe.checked_in_at, qe.called_at,
            a.appointment_id, a.visit_reason,
            pat.patient_id, pat.hospital_number,
            (pat.first_name || ' ' || pat.last_name) AS patient_name,
            pat.sex, pat.date_of_birth,
            p.practitioner_id, p.full_name AS practitioner_name, p.professional_role,
            d.department_name, s.slot_date, s.start_time,
            EXTRACT(EPOCH FROM (now() - qe.checked_in_at)) / 60 AS waiting_minutes
     FROM queue_entry qe
     JOIN appointment a ON a.appointment_id = qe.appointment_id
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN patient pat ON pat.patient_id = a.patient_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE s.slot_date = $1 AND qe.queue_status NOT IN ('completed', 'left')
     ORDER BY qe.queue_number`,
    [todayClinicISO()]
  );
}

export async function getTodayQueueEntries(): Promise<LiveQueueRow[]> {
  return query(
    `SELECT qe.queue_entry_id, qe.queue_number, qe.queue_status, qe.checked_in_at, qe.called_at, qe.completed_at,
            a.appointment_id, a.visit_reason,
            pat.patient_id, pat.hospital_number,
            (pat.first_name || ' ' || pat.last_name) AS patient_name,
            pat.sex, pat.date_of_birth,
            p.practitioner_id, p.full_name AS practitioner_name, p.professional_role,
            d.department_name, s.slot_date, s.start_time,
            EXTRACT(EPOCH FROM (now() - qe.checked_in_at)) / 60 AS waiting_minutes
     FROM queue_entry qe
     JOIN appointment a ON a.appointment_id = qe.appointment_id
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN patient pat ON pat.patient_id = a.patient_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE s.slot_date = $1
     ORDER BY qe.queue_number`,
    [todayClinicISO()]
  );
}

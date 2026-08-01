import { pool, query } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/roles";

export async function getVisitRecord(appointmentId: number): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT vr.* FROM visit_record vr WHERE vr.appointment_id = $1`,
    [appointmentId]
  );
  return rows[0] ?? null;
}

export async function saveVisitRecord(
  input: {
    appointmentId: number;
    presentingComplaint: string;
    clinicalFindings?: string;
    diagnosis?: string;
    carePlan?: string;
  },
  actor: SessionUser
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!hasPermission(actor.role, "visit.write")) {
    await logActivity({
      userId: actor.userId,
      action: "denied_access",
      objectType: "visit_record",
      objectId: input.appointmentId,
    });
    return { ok: false, message: "Only authorised clinical users can document a visit." };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const app = await client.query(
      `SELECT a.* FROM appointment a WHERE a.appointment_id = $1 FOR UPDATE`,
      [input.appointmentId]
    );
    if (app.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Appointment not found." };
    }
    await client.query(
      `INSERT INTO visit_record (appointment_id, presenting_complaint, clinical_findings, diagnosis, care_plan)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (appointment_id)
       DO UPDATE SET presenting_complaint = EXCLUDED.presenting_complaint,
                     clinical_findings = EXCLUDED.clinical_findings,
                     diagnosis = EXCLUDED.diagnosis,
                     care_plan = EXCLUDED.care_plan,
                     documented_at = now()`,
      [
        input.appointmentId,
        input.presentingComplaint,
        input.clinicalFindings || null,
        input.diagnosis || null,
        input.carePlan || null,
      ]
    );
    await logActivity({
      userId: actor.userId,
      action: "visit_record_save",
      objectType: "visit_record",
      objectId: input.appointmentId,
      client,
    });
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * FR-12 / AT-02: clinical history is only returned to roles with clinical
 * permission (doctor, nurse). Any other attempt is denied and logged.
 */
export async function getPatientClinicalHistory(
  patientId: number,
  actor: SessionUser
): Promise<{ ok: true; records: Record<string, unknown>[] } | { ok: false; message: string }> {
  if (!hasPermission(actor.role, "visit.view")) {
    await logActivity({
      userId: actor.userId,
      action: "denied_access",
      objectType: "visit_record",
      objectId: patientId,
    });
    return { ok: false, message: "Clinical records are only available to authorised clinical staff." };
  }
  const records = await query<Record<string, unknown>>(
    `SELECT vr.visit_record_id, vr.appointment_id, vr.presenting_complaint, vr.clinical_findings,
            vr.diagnosis, vr.care_plan, vr.documented_at,
            s.slot_date, s.start_time,
            p.full_name AS practitioner_name, d.department_name
     FROM visit_record vr
     JOIN appointment a ON a.appointment_id = vr.appointment_id
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE a.patient_id = $1
     ORDER BY vr.documented_at DESC
     LIMIT 30`,
    [patientId]
  );
  await logActivity({
    userId: actor.userId,
    action: "patient_search",
    objectType: "visit_record",
    objectId: patientId,
  });
  return { ok: true, records };
}

export async function getPatientVisitsForNurse(patientId: number): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT vr.visit_record_id, vr.appointment_id, vr.presenting_complaint, vr.documented_at,
            s.slot_date, p.full_name AS practitioner_name, d.department_name
     FROM visit_record vr
     JOIN appointment a ON a.appointment_id = vr.appointment_id
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE a.patient_id = $1
     ORDER BY vr.documented_at DESC
     LIMIT 30`,
    [patientId]
  );
}

import { pool, query, queryOne } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";

export interface PatientRow {
  patient_id: number;
  hospital_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  email: string | null;
  address: string;
  emergency_contact: string;
  registered_at: Date;
}

export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s()-]/g, "");
  if (p.startsWith("+234")) p = `0${p.slice(4)}`;
  else if (p.startsWith("234")) p = `0${p.slice(3)}`;
  return p.slice(0, 15);
}

export function rowToPatient(r: Record<string, unknown>): PatientRow {
  return r as unknown as PatientRow;
}

export async function searchPatients(q: string, limit = 20): Promise<PatientRow[]> {
  const term = q.trim();
  const like = `%${term}%`;
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM patient
     WHERE hospital_number = $1
        OR phone = $1
        OR first_name ILIKE $2
        OR last_name ILIKE $2
     ORDER BY last_name, first_name
     LIMIT $3`,
    [term, like, limit]
  );
  return rows.map(rowToPatient);
}

export interface DuplicateCandidate {
  patient_id: number;
  hospital_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
}

export async function findDuplicatePatients(input: {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
}): Promise<DuplicateCandidate[]> {
  const phone = normalizePhone(input.phone);
  const rows = await query<Record<string, unknown>>(
    `SELECT patient_id, hospital_number, first_name, last_name, date_of_birth, phone
     FROM patient
     WHERE phone = $1
        OR (last_name = $2 AND date_of_birth = $3)
        OR (first_name ILIKE $4 AND last_name ILIKE $5 AND date_of_birth = $3)
     LIMIT 10`,
    [phone, input.last_name, input.date_of_birth, input.first_name, input.last_name]
  );
  return rows as unknown as DuplicateCandidate[];
}

export async function createPatient(
  data: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    sex: string;
    phone: string;
    email?: string;
    address: string;
    emergency_contact: string;
  },
  actor: SessionUser
): Promise<PatientRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const seq = await client.query(`SELECT nextval('hospital_number_seq') AS n`);
    const hospitalNumber = `VS-${String(Number(seq.rows[0].n)).padStart(6, "0")}`;
    const result = await client.query(
      `INSERT INTO patient (hospital_number, first_name, last_name, date_of_birth, sex, phone, email, address, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        hospitalNumber,
        data.first_name,
        data.last_name,
        data.date_of_birth,
        data.sex,
        normalizePhone(data.phone),
        data.email || null,
        data.address,
        data.emergency_contact,
      ]
    );
    const patient = result.rows[0];
    await logActivity({
      userId: actor.userId,
      action: "patient_create",
      objectType: "patient",
      objectId: Number(patient.patient_id),
      client,
    });
    await client.query("COMMIT");
    return rowToPatient(patient);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePatient(
  patientId: number,
  data: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    sex: string;
    phone: string;
    email?: string;
    address: string;
    emergency_contact: string;
  },
  actor: SessionUser
): Promise<PatientRow | null> {
  const result = await pool.query(
    `UPDATE patient
     SET first_name = $1, last_name = $2, date_of_birth = $3, sex = $4, phone = $5,
         email = $6, address = $7, emergency_contact = $8
     WHERE patient_id = $9
     RETURNING *`,
    [
      data.first_name,
      data.last_name,
      data.date_of_birth,
      data.sex,
      normalizePhone(data.phone),
      data.email || null,
      data.address,
      data.emergency_contact,
      patientId,
    ]
  );
  if (result.rows.length === 0) return null;
  await logActivity({
    userId: actor.userId,
    action: "patient_update",
    objectType: "patient",
    objectId: patientId,
  });
  return rowToPatient(result.rows[0]);
}

export async function getPatient(patientId: number): Promise<PatientRow | null> {
  const row = await queryOne<Record<string, unknown>>(`SELECT * FROM patient WHERE patient_id = $1`, [patientId]);
  return row ? rowToPatient(row) : null;
}

export async function getPatientByHospitalNumber(hospitalNumber: string): Promise<PatientRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM patient WHERE hospital_number = $1`,
    [hospitalNumber]
  );
  return row ? rowToPatient(row) : null;
}

export async function getPatientAppointments(patientId: number): Promise<unknown[]> {
  return query(
    `SELECT a.appointment_id, a.status, a.visit_reason, a.booking_source, a.booked_at,
            a.practitioner_id,
            s.slot_date, s.start_time, s.end_time, s.slot_status,
            p.full_name AS practitioner_name, p.professional_role,
            d.department_name
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE a.patient_id = $1
     ORDER BY s.slot_date DESC, s.start_time DESC
     LIMIT 50`,
    [patientId]
  );
}

export async function getPatientByPhone(phone: string): Promise<PatientRow | null> {
  const row = await queryOne<Record<string, unknown>>(`SELECT * FROM patient WHERE phone = $1`, [normalizePhone(phone)]);
  return row ? rowToPatient(row) : null;
}

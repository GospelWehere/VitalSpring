import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { pool } from "./client";
import { addDaysISO, todayClinicISO } from "@/lib/dates";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Create web/.env.local with your Neon connection string.");
    process.exit(1);
  }

  console.log("Resetting public schema...");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

  console.log("Applying schema...");
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(schema);

  const users: { username: string; role: string; display_name: string; password: string }[] = [
    { username: "admin", role: "administrator", display_name: "System Administrator", password: "Administrator@123" },
    { username: "manager", role: "manager", display_name: "Clinic Manager", password: "Manager@123" },
    { username: "reception", role: "receptionist", display_name: "Amarachi Okafor (Reception)", password: "Reception@123" },
    { username: "records", role: "records", display_name: "Kelechi Umeh (Records)", password: "Records@123" },
    { username: "nurse", role: "nurse", display_name: "Chioma Eze (Nurse)", password: "Nurse@123" },
    { username: "doctor", role: "doctor", display_name: "Dr. Adaeze Nwosu", password: "Doctor@123" },
  ];

  console.log("Seeding user accounts...");
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO user_account (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4)`,
      [u.username, hash, u.role, u.display_name]
    );
  }
  const portalHash = await bcrypt.hash(crypto.randomUUID(), 10);
  await pool.query(
    `INSERT INTO user_account (username, password_hash, role, display_name, active)
     VALUES ('portal', $1, 'receptionist', 'Patient Portal (system)', FALSE)`,
    [portalHash]
  );

  const departments: [string, string][] = [
    ["General Outpatient", "Ground Floor, Wing A"],
    ["Paediatrics", "First Floor, Wing B"],
    ["Obstetrics & Gynaecology", "First Floor, Wing C"],
    ["Internal Medicine", "Second Floor, Wing A"],
    ["Surgery", "Second Floor, Wing B"],
    ["Dental Clinic", "Ground Floor, Wing D"],
  ];

  console.log("Seeding departments...");
  const deptIds: Record<string, number> = {};
  for (const [name, location] of departments) {
    const r = await pool.query(
      `INSERT INTO department (department_name, location) VALUES ($1, $2) RETURNING department_id`,
      [name, location]
    );
    deptIds[name] = Number(r.rows[0].department_id);
  }

  const practitioners: [string, string, string, string][] = [
    ["Adaeze Nwosu", "General Outpatient", "Physician", "adaeze.nwosu@vitalspring.example"],
    ["Emeka Okafor", "Paediatrics", "Paediatrician", "emeka.okafor@vitalspring.example"],
    ["Ngozi Adeyemi", "Obstetrics & Gynaecology", "Obstetrician", "ngozi.adeyemi@vitalspring.example"],
    ["Tunde Bakare", "Internal Medicine", "Internist", "tunde.bakare@vitalspring.example"],
    ["Chinedu Obi", "Surgery", "Surgeon", "chinedu.obi@vitalspring.example"],
    ["Funmi Alabi", "Dental Clinic", "Dentist", "funmi.alabi@vitalspring.example"],
  ];

  console.log("Seeding practitioners...");
  const practitionerIds: number[] = [];
  for (const [i, [fullName, dept, role, email]] of practitioners.entries()) {
    const r = await pool.query(
      `INSERT INTO practitioner (department_id, staff_number, full_name, professional_role, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING practitioner_id`,
      [deptIds[dept], `VSP-${String(i + 1).padStart(3, "0")}`, fullName, role, `080${String(3000000 + i * 11111).slice(0, 7)}`, email]
    );
    practitionerIds.push(Number(r.rows[0].practitioner_id));
  }

  console.log("Seeding availability slots (next 14 working days)...");
  let insertedSlots = 0;
  for (let day = 1; day <= 14; day += 1) {
    const date = addDaysISO(todayClinicISO(), day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const practitionerId of practitionerIds) {
      for (let h = 9; h <= 16; h += 1) {
        const start = `${String(h).padStart(2, "0")}:00`;
        const end = `${String(h + 1).padStart(2, "0")}:00`;
        await pool.query(
          `INSERT INTO availability_slot (practitioner_id, slot_date, start_time, end_time, slot_status)
           VALUES ($1, $2, $3, $4, 'open')`,
          [practitionerId, date, start, end]
        );
        insertedSlots += 1;
      }
    }
  }
  console.log(`  ${insertedSlots} slots inserted`);

  const patients: [string, string, string, string, string, string | null, string, string][] = [
    ["Amarachi", "Okafor", "1992-04-18", "Female", "08033124567", "amarachi.okafor@example.com", "14 Umuahia Street, Owerri", "Emeka Okafor, 08055217890"],
    ["Chinedu", "Uche", "1988-11-02", "Male", "07061239045", null, "22 Wetheral Road, Owerri", "Ada Uche, 08123456789"],
    ["Ngozi", "Emecheta", "1965-07-25", "Female", "08134567890", "ngozi.emecheta@example.com", "5 Douglas Road, Owerri", "Ike Emecheta, 09087654321"],
    ["Tobiloba", "Adeyemi", "2019-02-10", "Male", "09023456781", null, "8 Ikenegbu Layout, Owerri", "Folake Adeyemi, 08076543210"],
    ["Halima", "Bello", "1995-09-30", "Female", "08012345678", "halima.bello@example.com", "31 MCC Road, Owerri", "Sani Bello, 07088888888"],
    ["Ibrahim", "Suleiman", "1978-01-15", "Male", "07098765432", null, "12 Amakohia, Owerri", "Aisha Suleiman, 08100011122"],
  ];

  console.log("Seeding patients...");
  const patientIds: number[] = [];
  for (const [first, last, dob, sex, phone, email, address, emergency] of patients) {
    const r = await pool.query(
      `SELECT nextval('hospital_number_seq') AS n`
    );
    const hospitalNumber = `VS-${String(Number(r.rows[0].n)).padStart(6, "0")}`;
    const p = await pool.query(
      `INSERT INTO patient (hospital_number, first_name, last_name, date_of_birth, sex, phone, email, address, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING patient_id`,
      [hospitalNumber, first, last, dob, sex, phone, email, address, emergency]
    );
    patientIds.push(Number(p.rows[0].patient_id));
  }

  console.log(`Seeded ${users.length} users, ${departments.length} departments, ${practitioners.length} practitioners, ${patients.length} patients.`);
  console.log("Demo passwords:");
  for (const u of users) console.log(`  ${u.username} / ${u.password}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/roles";
import { getLiveQueue } from "@/lib/queue";
import { query } from "@/db/client";
import { todayClinicISO } from "@/lib/dates";

export async function GET() {
  const user = await getSessionUser();
  if (!user || (!hasPermission(user.role, "queue.manage") && !hasPermission(user.role, "check_in"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [entries, today] = await Promise.all([
    getLiveQueue(),
    query(
      `SELECT a.appointment_id, a.status,
              (pat.first_name || ' ' || pat.last_name) AS patient_name,
              pat.hospital_number, s.start_time,
              p.full_name AS practitioner_name, d.department_name,
              (qe.queue_entry_id IS NOT NULL) AS has_queue_entry
       FROM appointment a
       JOIN availability_slot s ON s.slot_id = a.slot_id
       JOIN patient pat ON pat.patient_id = a.patient_id
       JOIN practitioner p ON p.practitioner_id = a.practitioner_id
       JOIN department d ON d.department_id = p.department_id
       LEFT JOIN queue_entry qe ON qe.appointment_id = a.appointment_id
       WHERE s.slot_date = $1
       ORDER BY s.start_time`,
      [todayClinicISO()]
    ),
  ]);
  return NextResponse.json({ entries, today });
}

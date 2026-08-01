import Link from "next/link";
import { requireStaff } from "@/app/actions/auth";
import { Card, CardTitle, LinkButton, Table } from "@/components/ui";
import { formatDate, formatTime, todayClinicISO } from "@/lib/dates";
import { query } from "@/db/client";
import { hasPermission } from "@/lib/roles";

export default async function DashboardPage() {
  const user = await requireStaff();
  const today = todayClinicISO();

  const [todayCount, queueCount, openSlots] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM appointment a
       JOIN availability_slot s ON s.slot_id = a.slot_id
       WHERE s.slot_date = $1 AND a.status NOT IN ('cancelled', 'no_show')`,
      [today]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM queue_entry qe
       JOIN appointment a ON a.appointment_id = qe.appointment_id
       JOIN availability_slot s ON s.slot_id = a.slot_id
       WHERE s.slot_date = $1 AND qe.queue_status NOT IN ('completed', 'left')`,
      [today]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM availability_slot
       WHERE slot_date >= $1 AND slot_status = 'open'`,
      [today]
    ),
  ]);

  const todaysAppointments = await query<Record<string, unknown>>(
    `SELECT a.appointment_id, a.status, s.start_time,
            (pat.first_name || ' ' || pat.last_name) AS patient_name,
            pat.hospital_number, p.full_name AS practitioner_name, d.department_name
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN patient pat ON pat.patient_id = a.patient_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE s.slot_date = $1 AND a.status NOT IN ('cancelled', 'no_show')
     ORDER BY s.start_time
     LIMIT 12`,
    [today]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-brand-700">
        Good day, {user.displayName.split(" ")[0]}
      </h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Today&apos;s appointments</CardTitle>
          <p className="text-3xl font-bold text-brand-600">{Number(todayCount[0]?.count ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-soft">{formatDate(today)}</p>
        </Card>
        <Card>
          <CardTitle>In the queue now</CardTitle>
          <p className="text-3xl font-bold text-gold-600">{Number(queueCount[0]?.count ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-soft">Waiting, vitals or in consultation</p>
        </Card>
        <Card>
          <CardTitle>Open appointment slots</CardTitle>
          <p className="text-3xl font-bold text-brand-600">{Number(openSlots[0]?.count ?? 0)}</p>
          <p className="mt-1 text-xs text-ink-soft">Available to book from today</p>
        </Card>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-700">Today&apos;s schedule</h2>
        {hasPermission(user.role, "appointment.create") ? (
          <LinkButton href="/app/booking">Book an appointment</LinkButton>
        ) : null}
      </div>
      <Table headers={["Time", "Patient", "Department / Doctor", "Status"]}>
        {todaysAppointments.map((a) => (
          <tr key={a.appointment_id as number} className="bg-white">
            <td className="px-3 py-2 whitespace-nowrap">{formatTime(a.start_time as string)}</td>
            <td className="px-3 py-2 font-semibold text-brand-700">
              <Link href={`/app/patients/${a.patient_id as number}`} className="hover:underline">
                {a.patient_name as string}
              </Link>
              <span className="block text-xs font-normal text-ink-soft">{a.hospital_number as string}</span>
            </td>
            <td className="px-3 py-2">
              <div>{a.department_name as string}</div>
              <div className="text-xs text-ink-soft">{a.practitioner_name as string}</div>
            </td>
            <td className="px-3 py-2 capitalize">{String(a.status).replace("_", " ")}</td>
          </tr>
        ))}
        {todaysAppointments.length === 0 && (
          <tr className="bg-white">
            <td colSpan={4} className="px-3 py-6 text-center text-ink-soft">
              No appointments today.
            </td>
          </tr>
        )}
      </Table>
    </div>
  );
}

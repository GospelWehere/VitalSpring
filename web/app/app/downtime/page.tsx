import { requireStaff } from "@/app/actions/auth";
import { Card, Table, BrandMark } from "@/components/ui";
import { formatDate, formatTime, todayClinicISO, addDaysISO } from "@/lib/dates";
import { query } from "@/db/client";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Downtime Pack" };
export const dynamic = "force-dynamic";

export default async function DowntimePage() {
  const user = await requireStaff();
  const nextDay = addDaysISO(todayClinicISO(), 1);

  const appointments = await query<Record<string, unknown>>(
    `SELECT a.appointment_id, a.status, s.start_time,
            (pat.first_name || ' ' || pat.last_name) AS patient_name,
            pat.hospital_number, pat.phone,
            p.full_name AS practitioner_name, d.department_name
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN patient pat ON pat.patient_id = a.patient_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE s.slot_date = $1 AND a.status NOT IN ('cancelled', 'no_show')
     ORDER BY d.department_name, s.start_time`,
    [nextDay]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Daily downtime pack</h1>
          <p className="text-sm text-ink-soft">
            Printed at close of business (FR-17). If connectivity fails tomorrow, use this list with
            the numbered downtime sheets, then back-capture with a second person verifying each entry.
          </p>
        </div>
        <PrintButton />
      </div>

      <Card className="print:border-0 print:shadow-none print:p-0">
        <div className="mb-4 flex items-center justify-between border-b border-brand-200 pb-3">
          <div className="flex items-center gap-2">
            <BrandMark size={28} />
            <div>
              <div className="font-bold text-brand-700">Vital Spring Medical Center</div>
              <div className="text-xs text-ink-soft">Next-day appointment list — {formatDate(nextDay)}</div>
            </div>
          </div>
          <div className="text-right text-xs text-ink-soft">
            Prepared by {user.displayName}
            <br />
            {new Date().toLocaleString("en-GB")}
          </div>
        </div>

        {appointments.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-soft">No active appointments for {formatDate(nextDay)}.</p>
        ) : (
          <Table headers={["Time", "Hospital No.", "Patient", "Phone", "Department / Doctor", "Status"]}>
            {appointments.map((a) => (
              <tr key={a.appointment_id as number} className="bg-white">
                <td className="px-3 py-2 whitespace-nowrap">{formatTime(a.start_time as string)}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.hospital_number as string}</td>
                <td className="px-3 py-2 font-semibold text-brand-700">{a.patient_name as string}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.phone as string}</td>
                <td className="px-3 py-2">
                  {a.department_name as string}
                  <span className="block text-xs text-ink-soft">{a.practitioner_name as string}</span>
                </td>
                <td className="px-3 py-2 capitalize">{String(a.status).replace("_", " ")}</td>
              </tr>
            ))}
          </Table>
        )}

        <p className="mt-6 text-xs text-ink-soft">
          During an outage: admit patients using numbered downtime sheets, record arrivals by hand,
          and after restoration a single staff member enters the activity while a second verifies
          each entry. Clinical paper notes are transferred only by an authorised clinician.
        </p>
      </Card>
    </div>
  );
}

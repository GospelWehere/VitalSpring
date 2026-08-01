import { requirePermission } from "@/app/actions/auth";
import { Card, CardTitle, Table } from "@/components/ui";
import { addDaysISO, todayClinicISO } from "@/lib/dates";
import { attendanceReport, waitTimeReport, utilizationReport, noShowSummary } from "@/lib/reports";
import { listDepartments } from "@/lib/slots";
import { formatDate } from "@/lib/dates";

const DEFAULT_FROM = addDaysISO(todayClinicISO(), -30);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; departmentId?: string }>;
}) {
  const user = await requirePermission("report.view");
  const sp = await searchParams;
  const from = sp.from ?? DEFAULT_FROM;
  const to = sp.to ?? todayClinicISO();
  const departmentId = sp.departmentId && Number(sp.departmentId) > 0 ? Number(sp.departmentId) : undefined;
  const departments = await listDepartments();

  const [attendance, waitTime, utilization, noShow] = await Promise.all([
    attendanceReport({ from, to, departmentId }, user),
    waitTimeReport({ from, to, departmentId }, user),
    utilizationReport({ from, to, departmentId }, user),
    noShowSummary({ from, to, departmentId }),
  ]);

  const statusLabels: Record<string, string> = {
    booked: "Booked",
    confirmed: "Confirmed",
    checked_in: "Checked in",
    called: "Called",
    in_consultation: "In consultation",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No-show",
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold text-brand-700">Operational reports</h1>

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">From</label>
            <input name="from" type="date" defaultValue={from} className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">To</label>
            <input name="to" type="date" defaultValue={to} className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Department</label>
            <select name="departmentId" className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id} selected={d.department_id === departmentId}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Run report
          </button>
        </form>
      </Card>

      <p className="mb-4 text-sm text-ink-soft">
        Period {formatDate(from)} → {formatDate(to)}
        {departmentId ? " · one department" : " · all departments"}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Attendance</CardTitle>
          <p className="mb-3 text-sm text-ink-soft">
            Attendance rate {attendance.attendanceRate !== null ? `${attendance.attendanceRate}%` : "n/a"} ·{" "}
            {noShow.noShow} no-shows · {noShow.cancelled} cancelled
          </p>
          <Table headers={["Status", "Count"]}>
            {Object.entries(attendance.byStatus).length === 0 ? (
              <tr className="bg-white"><td colSpan={2} className="px-3 py-4 text-center text-ink-soft">No appointments in this period.</td></tr>
            ) : (
              Object.entries(attendance.byStatus).map(([status, count]) => (
                <tr key={status} className="bg-white">
                  <td className="px-3 py-2">{statusLabels[status] ?? status}</td>
                  <td className="px-3 py-2 font-semibold">{count}</td>
                </tr>
              ))
            )}
            <tr className="bg-brand-50 font-bold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2">{attendance.total}</td>
            </tr>
          </Table>
        </Card>

        <Card>
          <CardTitle>Waiting time (check-in → called)</CardTitle>
          <p className="mb-3 text-sm text-ink-soft">
            Median wait:{" "}
            <span className="font-bold text-brand-700">
              {waitTime.medianMinutes !== null ? `${waitTime.medianMinutes} minutes` : "no data"}
            </span>{" "}
            across {waitTime.count} called patients
          </p>
          <Table headers={["Practitioner", "Department", "Patients", "Median (min)"]}>
            {waitTime.byPractitioner.length === 0 ? (
              <tr className="bg-white"><td colSpan={4} className="px-3 py-4 text-center text-ink-soft">No called patients in this period.</td></tr>
            ) : (
              waitTime.byPractitioner.map((r) => (
                <tr key={r.practitioner_id} className="bg-white">
                  <td className="px-3 py-2 font-semibold text-brand-700">{r.practitioner_name}</td>
                  <td className="px-3 py-2">{r.department_name}</td>
                  <td className="px-3 py-2">{r.count}</td>
                  <td className="px-3 py-2">{r.median_minutes ?? "—"}</td>
                </tr>
              ))
            )}
          </Table>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Practitioner utilisation</CardTitle>
          <Table headers={["Practitioner", "Department", "Slots offered", "Completed visits", "Utilisation"]}>
            {utilization.rows.length === 0 ? (
              <tr className="bg-white"><td colSpan={5} className="px-3 py-4 text-center text-ink-soft">No slots in this period.</td></tr>
            ) : (
              utilization.rows.map((r) => (
                <tr key={r.practitioner_id} className="bg-white">
                  <td className="px-3 py-2 font-semibold text-brand-700">{r.practitioner_name}</td>
                  <td className="px-3 py-2">{r.department_name}</td>
                  <td className="px-3 py-2">{r.offered_slots}</td>
                  <td className="px-3 py-2">{r.completed_visits}</td>
                  <td className="px-3 py-2 font-semibold">{r.utilization !== null ? `${r.utilization}%` : "—"}</td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      </div>
    </div>
  );
}

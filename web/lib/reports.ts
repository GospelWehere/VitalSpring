import { query } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/roles";
import { median, minutesBetween } from "@/lib/dates";

export interface AttendanceReport {
  from: string;
  to: string;
  departmentId?: number;
  total: number;
  byStatus: Record<string, number>;
  attendanceRate: number | null;
  noShowCount: number;
  cancelledCount: number;
}

export interface WaitTimeReport {
  from: string;
  to: string;
  departmentId?: number;
  count: number;
  medianMinutes: number | null;
  byPractitioner: {
    practitioner_id: number;
    practitioner_name: string;
    department_name: string;
    count: number;
    median_minutes: number | null;
  }[];
}

export interface UtilizationReport {
  from: string;
  to: string;
  departmentId?: number;
  rows: {
    practitioner_id: number;
    practitioner_name: string;
    department_name: string;
    offered_slots: number;
    completed_visits: number;
    utilization: number | null;
  }[];
}

function buildWhere(prefix: "a" | "s", from: string, to: string, departmentId?: number, extra = ""): { where: string; params: unknown[] } {
  const params: unknown[] = [from, to];
  let where = `${prefix}.slot_date BETWEEN $1 AND $2`;
  if (departmentId) {
    params.push(departmentId);
    where += ` AND p.department_id = $${params.length}`;
  }
  if (extra) where += extra;
  return { where, params };
}

export async function attendanceReport(
  input: { from: string; to: string; departmentId?: number },
  actor: SessionUser
): Promise<AttendanceReport> {
  const { where, params } = buildWhere("s", input.from, input.to, input.departmentId);
  const rows = await query<{ status: string; count: string }>(
    `SELECT a.status, COUNT(*)::int AS count
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     WHERE ${where}
     GROUP BY a.status`,
    params
  );
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = Number(r.count);
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const attended =
    (byStatus["checked_in"] ?? 0) +
    (byStatus["called"] ?? 0) +
    (byStatus["in_consultation"] ?? 0) +
    (byStatus["completed"] ?? 0);
  const noShow = byStatus["no_show"] ?? 0;
  const scheduled = total - noShow - (byStatus["cancelled"] ?? 0);

  await logActivity({
    userId: actor.userId,
    action: "report_view",
    objectType: "appointment",
  });
  return {
    from: input.from,
    to: input.to,
    departmentId: input.departmentId,
    total,
    byStatus,
    attendanceRate: scheduled > 0 ? Math.round((attended / scheduled) * 1000) / 10 : null,
    noShowCount: noShow,
    cancelledCount: byStatus["cancelled"] ?? 0,
  };
}

export async function waitTimeReport(
  input: { from: string; to: string; departmentId?: number },
  actor: SessionUser
): Promise<WaitTimeReport> {
  const { where, params } = buildWhere("s", input.from, input.to, input.departmentId, " AND qe.called_at IS NOT NULL");
  const rows = await query<{
    practitioner_id: number;
    practitioner_name: string;
    department_name: string;
    checked_in_at: Date;
    called_at: Date;
  }>(
    `SELECT p.practitioner_id, p.full_name AS practitioner_name, d.department_name,
            qe.checked_in_at, qe.called_at
     FROM queue_entry qe
     JOIN appointment a ON a.appointment_id = qe.appointment_id
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     WHERE ${where}`,
    params
  );
  const perPractitioner = new Map<number, { name: string; dept: string; values: number[] }>();
  const all: number[] = [];
  for (const r of rows) {
    const mins = minutesBetween(r.checked_in_at, r.called_at);
    all.push(mins);
    const entry = perPractitioner.get(Number(r.practitioner_id)) ?? {
      name: r.practitioner_name,
      dept: r.department_name,
      values: [],
    };
    entry.values.push(mins);
    perPractitioner.set(Number(r.practitioner_id), entry);
  }
  await logActivity({
    userId: actor.userId,
    action: "report_view",
    objectType: "queue_entry",
  });
  return {
    from: input.from,
    to: input.to,
    departmentId: input.departmentId,
    count: all.length,
    medianMinutes: median(all),
    byPractitioner: [...perPractitioner.entries()].map(([id, e]) => ({
      practitioner_id: id,
      practitioner_name: e.name,
      department_name: e.dept,
      count: e.values.length,
      median_minutes: median(e.values),
    })),
  };
}

export async function utilizationReport(
  input: { from: string; to: string; departmentId?: number },
  actor: SessionUser
): Promise<UtilizationReport> {
  const { where, params } = buildWhere("s", input.from, input.to, input.departmentId);
  const rows = await query<{
    practitioner_id: number;
    practitioner_name: string;
    department_name: string;
    offered: string;
    completed: string;
  }>(
    `SELECT p.practitioner_id, p.full_name AS practitioner_name, d.department_name,
            COUNT(s.slot_id)::int AS offered,
            COUNT(a.appointment_id) FILTER (WHERE a.status = 'completed')::int AS completed
     FROM availability_slot s
     JOIN practitioner p ON p.practitioner_id = s.practitioner_id
     JOIN department d ON d.department_id = p.department_id
     LEFT JOIN appointment a ON a.slot_id = s.slot_id
     WHERE ${where}
     GROUP BY p.practitioner_id, p.full_name, d.department_name
     ORDER BY d.department_name, p.full_name`,
    params
  );
  await logActivity({
    userId: actor.userId,
    action: "report_view",
    objectType: "availability_slot",
  });
  return {
    from: input.from,
    to: input.to,
    departmentId: input.departmentId,
    rows: rows.map((r) => {
      const offered = Number(r.offered);
      const completed = Number(r.completed);
      return {
        practitioner_id: Number(r.practitioner_id),
        practitioner_name: r.practitioner_name,
        department_name: r.department_name,
        offered_slots: offered,
        completed_visits: completed,
        utilization: offered > 0 ? Math.round((completed / offered) * 1000) / 10 : null,
      };
    }),
  };
}

export async function noShowSummary(input: { from: string; to: string; departmentId?: number }): Promise<{
  noShow: number;
  attended: number;
  cancelled: number;
  total: number;
}> {
  const { where, params } = buildWhere("s", input.from, input.to, input.departmentId);
  const rows = await query<{ status: string; count: string }>(
    `SELECT a.status, COUNT(*)::int AS count
     FROM appointment a
     JOIN availability_slot s ON s.slot_id = a.slot_id
     JOIN practitioner p ON p.practitioner_id = a.practitioner_id
     WHERE ${where}
     GROUP BY a.status`,
    params
  );
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = Number(r.count);
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const attended =
    (byStatus["checked_in"] ?? 0) +
    (byStatus["called"] ?? 0) +
    (byStatus["in_consultation"] ?? 0) +
    (byStatus["completed"] ?? 0);
  return {
    noShow: byStatus["no_show"] ?? 0,
    attended,
    cancelled: byStatus["cancelled"] ?? 0,
    total,
  };
}

export function requireReportPermission(actor: SessionUser): boolean {
  return hasPermission(actor.role, "report.view");
}

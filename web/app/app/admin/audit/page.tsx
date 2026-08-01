import { requirePermission } from "@/app/actions/auth";
import { Card, EmptyState, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { listAuditLog } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePermission("audit.view");
  const entries = await listAuditLog(200);

  const actionLabels: Record<string, string> = {
    login: "Sign in",
    login_failed: "Failed sign-in",
    logout: "Sign out",
    patient_search: "Patient search",
    patient_create: "Patient created",
    patient_update: "Patient updated",
    appointment_create: "Appointment booked",
    appointment_reschedule: "Appointment rescheduled",
    appointment_cancel: "Appointment cancelled",
    check_in: "Patient checked in",
    queue_transition: "Queue transition",
    visit_record_save: "Visit record saved",
    slot_create: "Slots generated",
    slot_block: "Slot blocked/reopened",
    report_view: "Report viewed",
    account_create: "Account created",
    account_update: "Account updated",
    backup_export: "Backup exported",
    backup_restore: "Backup restored",
    denied_access: "Denied access",
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-700">Activity log</h1>
        <p className="text-sm text-ink-soft">
          Append-only audit trail (FR-16, NFR-09) — entries cannot be edited or deleted by application users.
        </p>
      </div>
      <Card>
        {entries.length === 0 ? (
          <EmptyState>No activity recorded yet.</EmptyState>
        ) : (
          <Table headers={["Time", "User", "Action", "Object", "Source"]}>
            {entries.map((e) => (
              <tr key={e.activity_id} className="bg-white">
                <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDateTime(e.action_time)}</td>
                <td className="px-3 py-2 text-sm">
                  {e.display_name}
                  <span className="block text-xs text-ink-soft">@{e.username}</span>
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.action_type === "denied_access" || e.action_type === "login_failed" ? "bg-danger-soft text-danger" : "bg-brand-100 text-brand-600"}`}>
                    {actionLabels[e.action_type] ?? e.action_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.object_type}
                  {e.object_id ? ` #${e.object_id}` : ""}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.source_address ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

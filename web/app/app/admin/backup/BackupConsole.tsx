"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { backupExportAction, backupRestoreAction } from "@/app/actions/admin";
import { runNotificationWorkerAction } from "@/app/actions/booking";
import { Card, CardTitle, ErrorNote, GhostButton, SuccessNote, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

interface NotificationRow {
  notification_id: number;
  message_type: string;
  channel: string;
  destination_masked: string;
  delivery_status: string;
  attempts: number;
  processed_at: string | null;
}

export default function BackupConsole({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  async function exportBackup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const out = await backupExportAction();
    setBusy(false);
    if (!out.ok || !out.backup) {
      setError(out.message ?? "Export failed.");
      return;
    }
    const blob = new Blob([JSON.stringify(out.backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vital-spring-backup-${out.backup.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Backup exported and downloaded. Store it separately from the database (FR-18).");
  }

  async function restore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("backupFile") as File | null;
    if (!file) {
      setError("Choose a backup file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const text = await file.text();
    const data = new FormData();
    data.append("backup", text);
    const out = await backupRestoreAction(data);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Restore failed.");
      return;
    }
    setNotice(`${out.message} Counts: ${Object.entries(out.counts ?? {}).map(([t, c]) => `${t}=${c}`).join(", ")}`);
    setRestoreOpen(false);
    router.refresh();
  }

  async function runWorker() {
    setBusy(true);
    setError(null);
    const out = await runNotificationWorkerAction();
    setBusy(false);
    if (!out.ok) setError(out.message ?? "Worker failed.");
    else     setNotice(out.message ?? "Message worker finished.");
    router.refresh();
  }

  const statusTone: Record<string, string> = {
    queued: "bg-brand-100 text-brand-600",
    sent: "bg-gold-100 text-gold-600",
    delivered: "bg-brand-100 text-brand-600",
    retrying: "bg-gold-100 text-gold-600",
    failed: "bg-danger-soft text-danger",
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-brand-700">Backup & message queue</h1>
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Backups (FR-18 / AT-06)</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            Export a protected JSON snapshot of every table. Restoration clears the database and
            reloads the snapshot inside one transaction — use the isolated test area for exercises.
          </p>
          <div className="flex flex-wrap gap-3">
            <GhostButton onClick={exportBackup} disabled={busy}>{busy ? "Working…" : "Export backup (download)"}</GhostButton>
            <GhostButton onClick={() => setRestoreOpen((v) => !v)}>Restore from file…</GhostButton>
          </div>
          {restoreOpen ? (
            <form onSubmit={restore} className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-danger">
                Warning: this replaces ALL current data with the contents of the file.
              </p>
              <input type="file" name="backupFile" accept="application/json" className="text-sm" />
              <div className="flex gap-2">
                <GhostButton type="submit" disabled={busy} className="text-danger hover:bg-danger-soft">Restore now</GhostButton>
                <GhostButton onClick={() => setRestoreOpen(false)}>Cancel</GhostButton>
              </div>
            </form>
          ) : null}
        </Card>

        <Card>
          <CardTitle>Message worker (FR-13 / AT-05)</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            The simulated SMS provider processes queued confirmations, reminders, reschedules and
            cancellations. Temporary provider failures move items to <em>retrying</em> until a final
            result is recorded. Messages omit diagnosis and detailed visit reasons (NFR-12).
          </p>
          <GhostButton onClick={runWorker} disabled={busy}>{busy ? "Processing…" : "Run message worker"}</GhostButton>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Recent messages (destinations masked)</CardTitle>
        <Table headers={["Type", "Channel", "Destination", "Status", "Attempts", "Processed"]}>
          {notifications.length === 0 ? (
            <tr className="bg-white"><td colSpan={6} className="px-3 py-4 text-center text-ink-soft">No messages yet.</td></tr>
          ) : (
            notifications.map((n) => (
              <tr key={n.notification_id} className="bg-white">
                <td className="px-3 py-2 capitalize">{n.message_type}</td>
                <td className="px-3 py-2 uppercase">{n.channel}</td>
                <td className="px-3 py-2 font-mono text-xs">{n.destination_masked}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[n.delivery_status] ?? "bg-brand-100 text-brand-600"}`}>
                    {n.delivery_status}
                  </span>
                </td>
                <td className="px-3 py-2">{n.attempts}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{n.processed_at ? formatDateTime(n.processed_at) : "—"}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>
    </div>
  );
}

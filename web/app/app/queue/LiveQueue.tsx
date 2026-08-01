"use client";

import { useCallback, useEffect, useState } from "react";
import { checkInAction, queueTransitionAction } from "@/app/actions/booking";
import { Badge, Card, EmptyState, ErrorNote, GhostButton, QUEUE_TONES, Table } from "@/components/ui";
import { formatTime, minutesBetween } from "@/lib/dates";

interface Entry {
  queue_entry_id: number;
  queue_number: number;
  queue_status: string;
  checked_in_at: string;
  called_at: string | null;
  appointment_id: number;
  patient_id: number;
  hospital_number: string;
  patient_name: string;
  sex: string;
  practitioner_name: string;
  department_name: string;
  start_time: string;
  waiting_minutes: number;
}

interface TodayRow {
  appointment_id: number;
  patient_name: string;
  hospital_number: string;
  start_time: string;
  practitioner_name: string;
  department_name: string;
  status: string;
  has_queue_entry: boolean;
}

export default function LiveQueue({
  canCheckIn,
  canManage,
  canCall,
}: {
  canCheckIn: boolean;
  canManage: boolean;
  canCall: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/queue");
      if (r.status === 401) return;
      const d = await r.json();
      setEntries(d.entries ?? []);
      setToday(d.today ?? []);
    } catch {
      // transient network error — keep last view
    }
  }, []);

  useEffect(() => {
    async function poll() {
      await load();
      setLastUpdate(new Date().toISOString());
    }
    void poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  async function doCheckIn(appointmentId: number) {
    setBusyId(appointmentId);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.append("appointmentId", String(appointmentId));
    const out = await checkInAction(form);
    setBusyId(null);
    if (!out.ok) {
      setError(out.message ?? "Check-in failed.");
      if (out.values?.queueEntryId) {
        setNotice(`Already checked in — queue number already issued. See live queue below.`);
      }
    } else {
      setNotice(out.message ?? "Checked in.");
    }
    await load();
  }

  async function doTransition(queueEntryId: number, status: string) {
    setBusyId(queueEntryId);
    setError(null);
    const form = new FormData();
    form.append("queueEntryId", String(queueEntryId));
    form.append("status", status);
    const out = await queueTransitionAction(form);
    setBusyId(null);
    if (!out.ok) setError(out.message ?? "Update failed.");
    await load();
  }

  const actionFor = (e: Entry) => {
    const buttons: { label: string; status: string; show: boolean }[] = [];
    if (canManage && e.queue_status === "waiting") buttons.push({ label: "Vitals", status: "vitals", show: true });
    if (canCall && e.queue_status === "waiting") buttons.push({ label: "Call", status: "called", show: true });
    if (canCall && e.queue_status === "vitals") buttons.push({ label: "Call", status: "called", show: true });
    if (canCall && e.queue_status === "called") buttons.push({ label: "Start consult", status: "with_practitioner", show: true });
    if (canManage && e.queue_status === "with_practitioner") buttons.push({ label: "Complete", status: "completed", show: true });
    if (canManage && ["waiting", "vitals", "called", "with_practitioner"].includes(e.queue_status)) {
      buttons.push({ label: "Left / no-show", status: "left", show: true });
    }
    return buttons.filter((b) => b.show);
  };

  const checkinables = today.filter(
    (t) => !["cancelled", "no_show", "completed", "checked_in", "called", "in_consultation"].includes(t.status) && !t.has_queue_entry
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Live queue</h1>
          <p className="text-sm text-ink-soft">
            Refreshes every 10 seconds · last update{" "}
            {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "…"}
          </p>
        </div>
        {entries.filter((e) => e.waiting_minutes > 30).length > 0 ? (
          <Badge tone="red">{entries.filter((e) => e.waiting_minutes > 30).length} waiting over 30 min — review</Badge>
        ) : null}
      </div>

      <ErrorNote message={error} />
      {notice ? <p className="mb-4 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700">{notice}</p> : null}

      {canCheckIn && (
        <Card className="mb-6">
          <h2 className="mb-3 text-base font-bold text-brand-700">Check in today&apos;s arrivals</h2>
          {checkinables.length === 0 ? (
            <p className="text-sm text-ink-soft">No appointments waiting to check in right now.</p>
          ) : (
            <Table headers={["Time", "Patient", "Department / Doctor", ""]}>
              {checkinables.map((t) => (
                <tr key={t.appointment_id} className="bg-white">
                  <td className="px-3 py-2 whitespace-nowrap">{formatTime(t.start_time)}</td>
                  <td className="px-3 py-2 font-semibold text-brand-700">
                    {t.patient_name}
                    <span className="block text-xs font-normal text-ink-soft">{t.hospital_number}</span>
                  </td>
                  <td className="px-3 py-2">
                    {t.department_name}
                    <span className="block text-xs text-ink-soft">{t.practitioner_name}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <GhostButton onClick={() => doCheckIn(t.appointment_id)} disabled={busyId === t.appointment_id}>
                      {busyId === t.appointment_id ? "…" : "Check in"}
                    </GhostButton>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-base font-bold text-brand-700">Arrival queue</h2>
        {entries.length === 0 ? (
          <EmptyState>No patients in the queue right now.</EmptyState>
        ) : (
          <Table headers={["#", "Patient", "Doctor", "Checked in", "Waiting", "Status", "Actions"]}>
            {entries.map((e) => {
              const waited = minutesBetween(e.checked_in_at, lastUpdate ?? e.checked_in_at);
              return (
                <tr key={e.queue_entry_id} className="bg-white">
                  <td className="px-3 py-2 text-lg font-bold text-brand-600">{e.queue_number}</td>
                  <td className="px-3 py-2 font-semibold text-brand-700">
                    <span className="block">{e.patient_name}</span>
                    <span className="block text-xs font-normal text-ink-soft">{e.hospital_number} · {e.sex}</span>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {e.practitioner_name}
                    <span className="block text-xs text-ink-soft">{e.department_name}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">{formatTime(e.checked_in_at.slice(11, 16))}</td>
                  <td className={`px-3 py-2 whitespace-nowrap text-sm font-semibold ${waited > 30 ? "text-danger" : waited > 15 ? "text-gold-600" : "text-ink-soft"}`}>
                    {waited}m
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={QUEUE_TONES[e.queue_status] ?? "neutral"}>{e.queue_status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1.5">
                      {actionFor(e).map((b) => (
                        <GhostButton key={b.status} onClick={() => doTransition(e.queue_entry_id, b.status)} disabled={busyId === e.queue_entry_id}>
                          {b.label}
                        </GhostButton>
                      ))}
                      {e.queue_status === "with_practitioner" && canCall ? (
                        <a
                          href={`/app/visits/${e.appointment_id}`}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                        >
                          Document visit →
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

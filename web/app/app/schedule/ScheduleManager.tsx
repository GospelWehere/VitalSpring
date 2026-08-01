"use client";

import { useCallback, useEffect, useState } from "react";
import { createSlotsAction, toggleSlotAction } from "@/app/actions/booking";
import { Card, CardTitle, EmptyState, ErrorNote, Field, PrimaryButton, SuccessNote, inputClass, selectClass } from "@/components/ui";
import { formatDate, formatTime, addDaysISO, todayClinicISO } from "@/lib/dates";

interface Practitioner { practitioner_id: number; full_name: string; professional_role: string; department_name: string }
interface Slot { slot_id: number; slot_date: string; start_time: string; slot_status: string }

export default function ScheduleManager() {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [practitionerId, setPractitionerId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [days, setDays] = useState("14");
  const [startHour, setStartHour] = useState("9");
  const [endHour, setEndHour] = useState("17");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/practitioners").then((r) => r.json()).then((d) => setPractitioners(d.practitioners)).catch(() => setError("Could not load practitioners."));
  }, []);

  const loadSlots = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/slots?practitionerId=${id}`);
      const d = await r.json();
      setSlots(d.slots ?? []);
    } catch {
      setError("Could not load slots.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!practitionerId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.append("practitionerId", practitionerId);
    form.append("days", days);
    form.append("startHour", startHour);
    form.append("endHour", endHour);
    const out = await createSlotsAction(form);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Slot generation failed.");
      return;
    }
    setNotice(out.message ?? "Slots updated.");
    await loadSlots(practitionerId);
  }

  async function toggle(slot: Slot) {
    setBusy(true);
    const form = new FormData();
    form.append("slotId", String(slot.slot_id));
    form.append("status", slot.slot_status === "blocked" ? "open" : "blocked");
    const out = await toggleSlotAction(form);
    setBusy(false);
    if (!out.ok) setError(out.message ?? "Update failed.");
    await loadSlots(practitionerId);
  }

  const today = todayClinicISO();
  const weekEnd = addDaysISO(today, 7);
  const visible = slots.filter((s) => s.slot_date >= today && s.slot_date <= weekEnd);
  const grouped = visible.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.slot_date] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold text-brand-700">Schedules & availability slots</h1>
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle>Generate slots</CardTitle>
          <form onSubmit={generate} className="space-y-3">
            <Field label="Doctor" required>
              <select className={selectClass} value={practitionerId} onChange={(e) => { setPractitionerId(e.target.value); if (e.target.value) loadSlots(e.target.value); }}>
                <option value="">Select doctor…</option>
                {practitioners.map((p) => <option key={p.practitioner_id} value={p.practitioner_id}>{p.full_name} — {p.department_name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Days" required>
                <input type="number" min={1} max={60} className={inputClass} value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
              <Field label="From" required>
                <input type="number" min={6} max={10} className={inputClass} value={startHour} onChange={(e) => setStartHour(e.target.value)} />
              </Field>
              <Field label="To" required>
                <input type="number" min={12} max={20} className={inputClass} value={endHour} onChange={(e) => setEndHour(e.target.value)} />
              </Field>
            </div>
            <PrimaryButton disabled={busy || !practitionerId}>{busy ? "Working…" : "Generate working-day slots"}</PrimaryButton>
          </form>
          <p className="mt-3 text-xs text-ink-soft">
            One-hour slots on weekdays only, from tomorrow. Existing slots are never duplicated.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>
            Next 7 days — {practitioners.find((p) => p.practitioner_id === Number(practitionerId))?.full_name ?? "select a doctor"}
          </CardTitle>
          {!practitionerId ? (
            <EmptyState>Select a doctor to see their slots.</EmptyState>
          ) : Object.keys(grouped).length === 0 ? (
            <EmptyState>No slots in the next 7 days. Generate some on the left.</EmptyState>
          ) : (
            Object.entries(grouped).map(([date, daySlots]) => (
              <div key={date} className="mb-4">
                <p className="mb-2 text-sm font-bold text-brand-700">{formatDate(date)}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => (
                    <button
                      key={s.slot_id}
                      type="button"
                      onClick={() => toggle(s)}
                      disabled={busy || s.slot_status === "reserved"}
                      title={s.slot_status === "blocked" ? "Click to reopen" : s.slot_status === "reserved" ? "Reserved — cannot change" : "Click to block"}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                        s.slot_status === "open"
                          ? "border-brand-300 bg-white text-brand-700 hover:bg-brand-50"
                          : s.slot_status === "blocked"
                            ? "border-gold-400 bg-gold-50 text-gold-600"
                            : "border-brand-100 bg-brand-50 text-ink-soft/60"
                      }`}
                    >
                      {formatTime(s.start_time)}
                      {s.slot_status === "blocked" ? " ✕" : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { portalCancelAppointmentAction, portalRescheduleAppointmentAction } from "@/app/actions/booking";
import { Card, EmptyState, ErrorNote, Field, GhostButton, PrimaryButton, SuccessNote, Table, inputClass } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";

interface Appointment {
  appointment_id: number;
  practitioner_id: number;
  status: string;
  visit_reason: string;
  slot_date: string;
  start_time: string;
  practitioner_name: string;
  professional_role: string;
  department_name: string;
}

interface AlternativeSlot { slot_id: number; slot_date: string; start_time: string; slot_status: string }

export default function ManageBooking() {
  const [hospitalNumber, setHospitalNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [lookedUp, setLookedUp] = useState<{ patient: { first_name: string; last_name: string }; upcoming: Appointment[]; past: Appointment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alternatives, setAlternatives] = useState<{ slot_id: number; slot_date: string; start_time: string }[]>([]);
  const [rescheduling, setRescheduling] = useState<number | null>(null);

  async function lookup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch(`/api/patients/appointments?hospitalNumber=${encodeURIComponent(hospitalNumber)}&phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      if (!d.ok) {
        setError(d.message);
        setLookedUp(null);
        return;
      }
      setLookedUp(d);
    } catch {
      setError("Lookup failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doCancel(appointmentId: number) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("appointmentId", String(appointmentId));
    form.append("hospitalNumber", hospitalNumber);
    form.append("phone", phone);
    const out = await portalCancelAppointmentAction(form);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Cancellation failed.");
    } else {
      setNotice(out.message ?? "Cancelled.");
      await lookup();
    }
  }

  async function loadAlternatives(appointment: Appointment) {
    setBusy(true);
    setError(null);
    setAlternatives([]);
    setRescheduling(appointment.appointment_id);
    try {
      const res = await fetch(`/api/slots?practitionerId=${appointment.practitioner_id}`);
      const data = await res.json();
      setAlternatives((data.slots as AlternativeSlot[]).filter((s) => s.slot_status === "open"));
      if ((data.slots as AlternativeSlot[]).filter((s) => s.slot_status === "open").length === 0) {
        setError("No alternative open times are available for this doctor right now. Please call reception.");
      }
    } catch {
      setError("Could not load alternative times.");
    } finally {
      setBusy(false);
    }
  }

  async function doReschedule(appointmentId: number, newSlotId: number) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("appointmentId", String(appointmentId));
    form.append("newSlotId", String(newSlotId));
    form.append("hospitalNumber", hospitalNumber);
    form.append("phone", phone);
    const out = await portalRescheduleAppointmentAction(form);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Rescheduling failed.");
      setAlternatives((out.values?.alternatives as AlternativeSlot[] | undefined) ?? []);
    } else {
      setNotice(out.message ?? "Rescheduled.");
      setAlternatives([]);
      setRescheduling(null);
      await lookup();
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-bold text-brand-700">Manage a booking</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Enter the hospital number from your confirmation and the phone number on your record.
      </p>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Hospital number" required>
          <input className={inputClass} value={hospitalNumber} onChange={(e) => setHospitalNumber(e.target.value)} placeholder="e.g. VS-000001" />
        </Field>
        <Field label="Phone number" required>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08033124567" />
        </Field>
        <div className="flex items-end">
          <PrimaryButton type="button" onClick={lookup} className="w-full" disabled={busy}>
            {busy ? "Looking up…" : "Look up"}
          </PrimaryButton>
        </div>
      </div>

      {lookedUp && (
        <div className="mt-8 space-y-6">
          <p className="text-sm font-semibold text-brand-700">
            Bookings for {lookedUp.patient.first_name} {lookedUp.patient.last_name}
          </p>
          {lookedUp.upcoming.length === 0 ? (
            <EmptyState>No upcoming appointments.</EmptyState>
          ) : (
            <Table headers={["Date", "Time", "Department / Doctor", "Reason", "Status", "Action"]}>
              {lookedUp.upcoming.map((a) => (
                <tr key={a.appointment_id} className="bg-white">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.slot_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatTime(a.start_time)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-brand-700">{a.department_name}</div>
                    <div className="text-xs text-ink-soft">{a.practitioner_name}</div>
                  </td>
                  <td className="max-w-40 truncate px-3 py-2">{a.visit_reason}</td>
                  <td className="px-3 py-2 capitalize">{a.status.replace("_", " ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <GhostButton onClick={() => loadAlternatives(a)} disabled={busy}>
                        Reschedule
                      </GhostButton>
                      <GhostButton
                        className="text-danger hover:bg-danger-soft"
                        onClick={() => doCancel(a.appointment_id)}
                        disabled={busy}
                      >
                        Cancel
                      </GhostButton>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {alternatives.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-brand-700">Choose a new time:</p>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((s) => (
                  <button
                    key={s.slot_id}
                    type="button"
                    onClick={() => doReschedule(rescheduling!, s.slot_id)}
                    disabled={busy}
                    className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {formatDate(s.slot_date)} · {formatTime(s.start_time)}
                  </button>
                ))}
              </div>
              <GhostButton className="mt-3" onClick={() => { setAlternatives([]); setRescheduling(null); }}>
                Cancel reschedule
              </GhostButton>
            </div>
          )}

          {lookedUp.past.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-soft">Earlier appointments (history)</p>
              <Table headers={["Date", "Time", "Doctor", "Status"]}>
                {lookedUp.past.map((a) => (
                  <tr key={a.appointment_id} className="bg-white">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.slot_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTime(a.start_time)}</td>
                    <td className="px-3 py-2">{a.practitioner_name}</td>
                    <td className="px-3 py-2 capitalize">{a.status.replace("_", " ")}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

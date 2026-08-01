"use client";

import { useCallback, useEffect, useState } from "react";
import { createPatientAction, checkDuplicatesAction, portalBookAppointmentAction } from "@/app/actions/booking";
import { Card, EmptyState, ErrorNote, Field, GhostButton, PrimaryButton, inputClass, selectClass, textareaClass } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";

interface Department { department_id: number; department_name: string; location: string }
interface Practitioner { practitioner_id: number; full_name: string; professional_role: string; department_name: string }
interface Slot { slot_id: number; slot_date: string; start_time: string; end_time: string; slot_status: string }
interface Patient { patient_id: number; hospital_number: string; first_name: string; last_name: string; date_of_birth: string; phone: string }

type Step = "department" | "practitioner" | "slot" | "identity" | "review" | "done";

export default function BookingWizard() {
  const [step, setStep] = useState<Step>("department");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [department, setDepartment] = useState<Department | null>(null);
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [identityMode, setIdentityMode] = useState<"lookup" | "register" | "found">("lookup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference: string; message: string } | null>(null);

  const [phone, setPhone] = useState("");
  const [reg, setReg] = useState({
    first_name: "", last_name: "", date_of_birth: "", sex: "Female",
    phone: "", email: "", address: "", emergency_contact: "",
  });
  const [visitReason, setVisitReason] = useState("");
  const [duplicates, setDuplicates] = useState<{ patient_id: number; hospital_number: string; first_name: string; last_name: string; date_of_birth: string; phone: string }[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  useEffect(() => {
    fetch("/api/departments").then((r) => r.json()).then((d) => setDepartments(d.departments)).catch(() => setError("Could not load departments."));
  }, []);

  const loadPractitioners = useCallback(async (dept: Department) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/practitioners?departmentId=${dept.department_id}`);
      const d = await r.json();
      setPractitioners(d.practitioners);
      setDepartment(dept);
      setStep("practitioner");
    } catch {
      setError("Could not load practitioners.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSlots = useCallback(async (p: Practitioner) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/slots?practitionerId=${p.practitioner_id}`);
      const d = await r.json();
      setSlots(d.slots.filter((s: Slot) => s.slot_status === "open"));
      setPractitioner(p);
      setStep("slot");
    } catch {
      setError("Could not load available times.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function lookupPatient() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/patients?phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      if (d.patient) {
        setPatient(d.patient);
        setIdentityMode("found");
      } else {
        setReg((prev) => ({ ...prev, phone }));
        setIdentityMode("register");
      }
    } catch {
      setError("Could not look up your details.");
    } finally {
      setBusy(false);
    }
  }

  async function registerAndContinue() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      Object.entries(reg).forEach(([k, v]) => form.append(k, v));
      const dup = await checkDuplicatesAction(form);
      if (dup.ok && Array.isArray(dup.values) && dup.values.length > 0 && !confirmDuplicate) {
        setDuplicates(dup.values as typeof duplicates);
        setError("A record with matching details already exists — please confirm this is you before continuing.");
        return;
      }
      const created = await createPatientAction(form);
      if (!created.ok) {
        setError(created.message ?? "Registration failed.");
        return;
      }
      setPatient({
        patient_id: created.values?.patientId as number,
        hospital_number: "",
        first_name: reg.first_name,
        last_name: reg.last_name,
        date_of_birth: reg.date_of_birth,
        phone: reg.phone,
      });
      setStep("review");
    } catch {
      setError("Registration failed. Check the form and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking() {
    if (!patient || !slot || !visitReason.trim()) {
      setError("Please complete the reason for your visit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("patientId", String(patient.patient_id));
      form.append("slotId", String(slot.slot_id));
      form.append("visitReason", visitReason.trim());
      const outcome = await portalBookAppointmentAction(form);
      if (!outcome.ok) {
        setError(outcome.message ?? "Booking failed.");
        if (outcome.values?.alternatives && Array.isArray(outcome.values.alternatives)) {
          const alts = outcome.values.alternatives as Slot[];
          setSlots(alts.filter((s) => s.slot_status === "open"));
        }
        return;
      }
      setResult({ reference: `VS-APT-${String(outcome.values?.appointmentId ?? "").padStart(5, "0")}`, message: outcome.message ?? "" });
      setStep("done");
    } catch {
      setError("Booking failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const dateGroups = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.slot_date] ??= []).push(s);
    return acc;
  }, {});

  if (result) {
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="text-xl font-bold text-brand-700">Appointment confirmed</h1>
        <p className="mt-2 text-sm text-ink-soft">{result.message}</p>
        <div className="mt-4 rounded-lg bg-brand-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Your booking reference</p>
          <p className="mt-1 text-2xl font-bold text-brand-700">{result.reference}</p>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          A confirmation message has been queued to your phone. Keep this reference to manage
          the booking.
        </p>
        <div className="mt-6 flex gap-3">
          <GhostButton onClick={() => { window.location.href = "/portal/manage"; }}>Manage this booking</GhostButton>
          <GhostButton onClick={() => { setStep("department"); setSlot(null); setPatient(null); setResult(null); setSlots([]); }}>Book another</GhostButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-700">Book an appointment</h1>
        <ol className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
          {["Department", "Doctor", "Time", "Your details", "Confirm"].map((label, i) => {
            const order: Step[] = ["department", "practitioner", "slot", "identity", "review"];
            const idx = order.indexOf(step);
            return (
              <li key={label} className="flex items-center gap-1">
                {i > 0 ? <span className="text-brand-300">›</span> : null}
                <span className={i === idx ? "text-brand-600" : i < idx ? "text-brand-400" : ""}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <ErrorNote message={error} />

      {step === "department" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {departments.map((d) => (
            <button
              key={d.department_id}
              type="button"
              onClick={() => loadPractitioners(d)}
              className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-left transition hover:border-brand-500 hover:bg-brand-100"
            >
              <div className="font-bold text-brand-700">{d.department_name}</div>
              <div className="text-xs text-ink-soft">{d.location}</div>
            </button>
          ))}
          {departments.length === 0 && !busy && <EmptyState>Loading departments…</EmptyState>}
        </div>
      )}

      {step === "practitioner" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {practitioners.map((p) => (
            <button
              key={p.practitioner_id}
              type="button"
              onClick={() => loadSlots(p)}
              className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-left transition hover:border-brand-500 hover:bg-brand-100"
            >
              <div className="font-bold text-brand-700">{p.full_name}</div>
              <div className="text-xs text-ink-soft">{p.professional_role}</div>
            </button>
          ))}
          {practitioners.length === 0 && !busy && <EmptyState>No practitioners available in this department.</EmptyState>}
        </div>
      )}

      {step === "slot" && (
        <div>
          <p className="mb-3 text-sm text-ink-soft">
            Available times with <span className="font-semibold text-brand-700">{practitioner?.full_name}</span> — only open slots are shown.
          </p>
          {Object.entries(dateGroups).length === 0 && !busy ? (
            <EmptyState>No open times in the next few weeks. Please try another doctor or call reception.</EmptyState>
          ) : (
            Object.entries(dateGroups).map(([date, daySlots]) => (
              <div key={date} className="mb-4">
                <div className="mb-2 text-sm font-bold text-brand-700">{formatDate(date)}</div>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => (
                    <button
                      key={s.slot_id}
                      type="button"
                      onClick={() => { setSlot(s); setStep("identity"); }}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        slot?.slot_id === s.slot_id
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-brand-300 bg-white text-brand-700 hover:bg-brand-50"
                      }`}
                    >
                      {formatTime(s.start_time)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {slot ? (
            <div className="mt-4 flex justify-end">
              <PrimaryButton type="button" onClick={() => setStep("identity")}>
                Continue with {formatTime(slot.start_time)} ›
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      )}

      {step === "identity" && (
        <div className="space-y-4">
          {identityMode === "lookup" && (
            <div>
              <p className="mb-3 text-sm text-ink-soft">
                Let us check whether you already have a record at the center.
              </p>
              <Field label="Phone number" required hint="The phone number used when you last visited.">
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08033124567"
                    minLength={7}
                  />
                  <GhostButton onClick={lookupPatient} className="shrink-0">
                    {busy ? "Checking…" : "Check"}
                  </GhostButton>
                </div>
              </Field>
            </div>
          )}

          {identityMode === "found" && patient && (
            <div>
              <div className="rounded-lg border border-brand-300 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-brand-700">
                  We found your record: {patient.first_name} {patient.last_name} ({patient.hospital_number})
                </p>
                <p className="text-xs text-ink-soft">Date of birth {formatDate(patient.date_of_birth)} · {patient.phone}</p>
              </div>
              <div className="mt-4 flex gap-3">
                <PrimaryButton type="button" onClick={() => setStep("review")}>This is me — continue</PrimaryButton>
                <GhostButton onClick={() => { setIdentityMode("lookup"); setPatient(null); }}>Not me — re-enter</GhostButton>
              </div>
            </div>
          )}

          {identityMode === "register" && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-brand-700">We could not find you — register once:</p>
              {duplicates.length > 0 && (
                <div className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-sm">
                  <p className="font-semibold text-gold-600">Possible duplicate records:</p>
                  <ul className="mt-1 list-inside list-disc text-ink-soft">
                    {duplicates.map((d) => (
                      <li key={d.patient_id}>
                        {d.first_name} {d.last_name} · {formatDate(d.date_of_birth)} · {d.phone} ({d.hospital_number})
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} className="mt-0.5" />
                    I confirm these records are mine / none of these is me — continue registration
                  </label>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" required><input className={inputClass} value={reg.first_name} onChange={(e) => setReg({ ...reg, first_name: e.target.value })} /></Field>
                <Field label="Last name" required><input className={inputClass} value={reg.last_name} onChange={(e) => setReg({ ...reg, last_name: e.target.value })} /></Field>
                <Field label="Date of birth" required><input type="date" className={inputClass} value={reg.date_of_birth} onChange={(e) => setReg({ ...reg, date_of_birth: e.target.value })} /></Field>
                <Field label="Sex" required>
                  <select className={selectClass} value={reg.sex} onChange={(e) => setReg({ ...reg, sex: e.target.value })}>
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </Field>
                <Field label="Phone" required><input className={inputClass} value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} /></Field>
                <Field label="Email" required={false}><input type="email" className={inputClass} value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></Field>
                <Field label="Address" required><input className={inputClass} value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} /></Field>
                <Field label="Emergency contact" required><input className={inputClass} value={reg.emergency_contact} onChange={(e) => setReg({ ...reg, emergency_contact: e.target.value })} /></Field>
              </div>
              <div className="flex gap-3">
                <PrimaryButton type="button" onClick={registerAndContinue} disabled={busy}>
                  {busy ? "Registering…" : "Register and continue"}
                </PrimaryButton>
                <GhostButton onClick={() => setIdentityMode("lookup")}>Back</GhostButton>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
            <p><span className="font-semibold">Department:</span> {department?.department_name}</p>
            <p><span className="font-semibold">Doctor:</span> {practitioner?.full_name} ({practitioner?.professional_role})</p>
            <p><span className="font-semibold">Time:</span> {slot ? `${formatDate(slot.slot_date)} at ${formatTime(slot.start_time)}` : "-"}</p>
            <p><span className="font-semibold">Patient:</span> {patient?.first_name} {patient?.last_name}</p>
          </div>
          <Field label="Reason for visit" required>
            <textarea
              className={textareaClass}
              value={visitReason}
              onChange={(e) => setVisitReason(e.target.value)}
              placeholder="e.g. Routine check-up, review of test results…"
            />
          </Field>
          <p className="text-xs text-ink-soft">
            Your reason is used by clinic staff only and never included in SMS messages (privacy requirement NFR-12).
          </p>
          <div className="flex gap-3">
            <PrimaryButton type="button" onClick={confirmBooking} disabled={busy}>
              {busy ? "Confirming…" : "Confirm appointment"}
            </PrimaryButton>
            <GhostButton onClick={() => setStep("slot")}>Back</GhostButton>
          </div>
        </div>
      )}
    </Card>
  );
}

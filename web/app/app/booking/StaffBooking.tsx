"use client";

import { useCallback, useEffect, useState } from "react";
import { bookAppointmentAction, createPatientAction, checkDuplicatesAction } from "@/app/actions/booking";
import { Card, EmptyState, ErrorNote, Field, GhostButton, PrimaryButton, SuccessNote, inputClass, selectClass, textareaClass } from "@/components/ui";
import { formatDate, formatTime, todayClinicISO } from "@/lib/dates";

interface Department { department_id: number; department_name: string }
interface Practitioner { practitioner_id: number; full_name: string; professional_role: string; department_name: string }
interface Slot { slot_id: number; slot_date: string; start_time: string; slot_status: string }
interface Patient { patient_id: number; hospital_number: string; first_name: string; last_name: string; date_of_birth: string; phone: string }

const SOURCES = [
  { value: "front_desk", label: "Front desk" },
  { value: "telephone", label: "Telephone" },
  { value: "walk_in", label: "Walk-in" },
];

export default function StaffBooking() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [source, setSource] = useState("front_desk");
  const [patientQuery, setPatientQuery] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [registered, setRegistered] = useState<Patient | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<{ reference: string } | null>(null);

  const [reg, setReg] = useState({
    first_name: "", last_name: "", date_of_birth: "", sex: "Female",
    phone: "", email: "", address: "", emergency_contact: "",
  });
  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  useEffect(() => {
    fetch("/api/departments").then((r) => r.json()).then((d) => setDepartments(d.departments)).catch(() => setError("Could not load departments."));
  }, []);

  const loadPractitioners = useCallback(async (deptId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/practitioners?departmentId=${deptId}`);
      const d = await r.json();
      setPractitioners(d.practitioners);
      setPractitionerId("");
      setSlots([]);
      setSlotId("");
    } catch {
      setError("Could not load practitioners.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSlots = useCallback(async (pId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/slots?practitionerId=${pId}`);
      const d = await r.json();
      setSlots(d.slots);
      setSlotId("");
    } catch {
      setError("Could not load slots.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function lookupPatient() {
    setBusy(true);
    setError(null);
    setPatient(null);
    const q = patientQuery.trim();
    try {
      const isPhone = /^\d{7,15}$/.test(q);
      const r = await fetch(
        isPhone
          ? `/api/patients?phone=${encodeURIComponent(q)}`
          : `/api/patients?hospitalNumber=${encodeURIComponent(q)}`
      );
      const d = await r.json();
      setPatient(d.patient);
      if (!d.patient) setError("No patient found with that identifier. Register below if needed.");
    } catch {
      setError("Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function registerNew() {
    setBusy(true);
    setError(null);
    const data = new FormData();
    Object.entries(reg).forEach(([k, v]) => data.append(k, v));
    try {
      if (duplicates.length === 0) {
        const dup = await checkDuplicatesAction(data);
        if (dup.ok && Array.isArray(dup.values) && dup.values.length > 0) {
          setDuplicates(dup.values as Patient[]);
          setError("A likely duplicate exists — review before saving (AT-03).");
          return;
        }
      }
      if (duplicates.length > 0 && !confirmedDuplicate) {
        setError("Confirm the duplicate check before saving.");
        return;
      }
      const created = await createPatientAction(data);
      if (!created.ok) {
        setError(created.message ?? "Registration failed.");
        return;
      }
      setPatient({ patient_id: created.values?.patientId as number, hospital_number: "", first_name: reg.first_name, last_name: reg.last_name, date_of_birth: reg.date_of_birth, phone: reg.phone });
      setRegistered({ patient_id: created.values?.patientId as number, hospital_number: "", first_name: reg.first_name, last_name: reg.last_name, date_of_birth: reg.date_of_birth, phone: reg.phone });
      setNotice(`Patient registered — hospital number ${created.values?.patientId ? `VS-${String(created.values.patientId).padStart(6, "0")}` : ""}`);
    } catch {
      setError("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking() {
    if (!patient || !slotId || !visitReason.trim()) {
      setError("Select a patient, a time, and enter a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.append("patientId", String(patient.patient_id));
    form.append("slotId", slotId);
    form.append("visitReason", visitReason.trim());
    form.append("bookingSource", source);
    const out = await bookAppointmentAction(form);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Booking failed.");
      return;
    }
    setBooked({ reference: `VS-APT-${String(out.values?.appointmentId ?? "").padStart(5, "0")}` });
    setVisitReason("");
    setSlotId("");
    setNotice("Appointment booked — a confirmation message was queued.");
  }

  async function undoCancel() {
    setBooked(null);
  }

  const today = todayClinicISO();

  return (
    <Card className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-bold text-brand-700">Assisted booking</h1>
      <p className="mb-6 text-sm text-ink-soft">
        One shared schedule for front-desk, telephone and walk-in bookings (US-04). Only open slots can be confirmed.
      </p>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Department" required>
            <select
              className={selectClass}
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); if (e.target.value) loadPractitioners(e.target.value); }}
            >
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
            </select>
          </Field>
          <Field label="Doctor" required>
            <select className={selectClass} value={practitionerId} onChange={(e) => { setPractitionerId(e.target.value); if (e.target.value) loadSlots(e.target.value); }} disabled={!departmentId}>
              <option value="">Select doctor…</option>
              {practitioners.map((p) => <option key={p.practitioner_id} value={p.practitioner_id}>{p.full_name} — {p.professional_role}</option>)}
            </select>
          </Field>
          <Field label="Booking channel" required>
            <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="space-y-4">
          {!patient ? (
            <>
              <Field label="Find existing patient" hint="Hospital number or phone. If not found, register below.">
                <div className="flex gap-2">
                  <input className={inputClass} value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="VS-000001 or 08033124567" />
                  <GhostButton onClick={lookupPatient} className="shrink-0" disabled={busy}>Find</GhostButton>
                </div>
              </Field>

              {registered ? null : (
                <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-brand-700">Or register a new patient</p>
                  {duplicates.length > 0 && (
                    <div className="mb-2 rounded border border-gold-300 bg-gold-50 p-2 text-xs">
                      <p className="font-semibold text-gold-600">Likely duplicates:</p>
                      <ul className="list-inside list-disc">
                        {duplicates.map((d) => <li key={d.patient_id}>{d.first_name} {d.last_name} · {d.phone}</li>)}
                      </ul>
                      <label className="mt-1 flex items-start gap-1">
                        <input type="checkbox" checked={confirmedDuplicate} onChange={(e) => setConfirmedDuplicate(e.target.checked)} className="mt-0.5" />
                        Confirm this is genuinely new.
                      </label>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputClass} placeholder="First name" value={reg.first_name} onChange={(e) => setReg({ ...reg, first_name: e.target.value })} />
                    <input className={inputClass} placeholder="Last name" value={reg.last_name} onChange={(e) => setReg({ ...reg, last_name: e.target.value })} />
                    <input type="date" className={inputClass} value={reg.date_of_birth} onChange={(e) => setReg({ ...reg, date_of_birth: e.target.value })} />
                    <select className={selectClass} value={reg.sex} onChange={(e) => setReg({ ...reg, sex: e.target.value })}>
                      <option>Female</option><option>Male</option>
                    </select>
                    <input className={inputClass} placeholder="Phone" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
                    <input className={inputClass} placeholder="Address" value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} />
                    <input className={inputClass} placeholder="Emergency contact" value={reg.emergency_contact} onChange={(e) => setReg({ ...reg, emergency_contact: e.target.value })} />
                    <input className={inputClass} placeholder="Email (optional)" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                  </div>
                  <GhostButton className="mt-2" onClick={registerNew} disabled={busy}>Register</GhostButton>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-brand-300 bg-brand-50 p-4">
              <p className="text-sm font-semibold text-brand-700">
                {patient.first_name} {patient.last_name}
                <span className="ml-2 font-mono text-xs text-ink-soft">{patient.hospital_number}</span>
              </p>
              <p className="text-xs text-ink-soft">{formatDate(patient.date_of_birth)} · {patient.phone}</p>
              <GhostButton className="mt-2" onClick={() => { setPatient(null); }}>Change patient</GhostButton>
            </div>
          )}

          <Field label="Reason for visit" required>
            <textarea className={textareaClass} value={visitReason} onChange={(e) => setVisitReason(e.target.value)} placeholder="e.g. Malaria follow-up" />
          </Field>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-brand-700">Available times</p>
        {slots.length === 0 ? (
          <EmptyState>Select a doctor above to see available times.</EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {slots.map((s) => {
              const past = s.slot_date === today ? false : false;
              void past;
              const disabled = s.slot_status !== "open";
              return (
                <button
                  key={s.slot_id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSlotId(String(s.slot_id))}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    disabled
                      ? "cursor-not-allowed border-brand-100 bg-brand-50 text-ink-soft/60"
                      : slotId === String(s.slot_id)
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-brand-300 bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  <span className="font-semibold">{formatDate(s.slot_date)} · {formatTime(s.start_time)}</span>
                  <span className="ml-2 text-xs capitalize opacity-70">{s.slot_status}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <PrimaryButton type="button" onClick={confirmBooking} disabled={busy || !patient || !slotId || !visitReason.trim()}>
          {busy ? "Booking…" : "Confirm appointment"}
        </PrimaryButton>
        {booked ? (
          <GhostButton onClick={undoCancel}>Book another</GhostButton>
        ) : null}
      </div>

      {booked ? (
        <div className="mt-4 rounded-lg bg-brand-700 p-4 text-white">
          <p className="text-sm">Appointment booked — confirmation queued to patient phone.</p>
          <p className="font-mono text-lg font-bold">{booked.reference}</p>
        </div>
      ) : null}
    </Card>
  );
}

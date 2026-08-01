"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePatientAction } from "@/app/actions/booking";
import { ErrorNote, Field, PrimaryButton, GhostButton, inputClass, selectClass } from "@/components/ui";

interface PatientFormData {
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  emergency_contact: string;
}

export default function EditPatientForm({ patient }: { patient: PatientFormData }) {
  const router = useRouter();
  const [form, setForm] = useState(patient);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k !== "patient_id") data.append(k, v);
    });
    const outcome = await updatePatientAction(patient.patient_id, data);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message ?? "Update failed.");
      return;
    }
    setNotice(outcome.message ?? "Saved.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        {notice ? <p className="mb-3 text-sm text-brand-700">{notice}</p> : null}
        <GhostButton onClick={() => setEditing(true)}>Edit patient details</GhostButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <input className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
        </Field>
        <Field label="Last name" required>
          <input className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
        </Field>
        <Field label="Date of birth" required>
          <input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required />
        </Field>
        <Field label="Sex" required>
          <select className={selectClass} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
            <option>Female</option>
            <option>Male</option>
          </select>
        </Field>
        <Field label="Phone" required>
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        </Field>
        <Field label="Email" required={false}>
          <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Address" required>
          <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
        </Field>
        <Field label="Emergency contact" required>
          <input className={inputClass} value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} required />
        </Field>
      </div>
      <div className="flex gap-3">
        <PrimaryButton disabled={busy}>{busy ? "Saving…" : "Save changes"}</PrimaryButton>
        <GhostButton type="button" onClick={() => { setEditing(false); setForm(patient); }}>Cancel</GhostButton>
      </div>
    </form>
  );
}

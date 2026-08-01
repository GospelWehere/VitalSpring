"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPatientAction, checkDuplicatesAction } from "@/app/actions/booking";
import { Card, ErrorNote, Field, PrimaryButton, inputClass, selectClass } from "@/components/ui";
import { formatDate } from "@/lib/dates";

const initialForm = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "Female",
  phone: "",
  email: "",
  address: "",
  emergency_contact: "",
};

interface Duplicate {
  patient_id: number;
  hospital_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
}

export default function RegisterPatientForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (duplicates.length === 0) {
        const dup = await checkDuplicatesAction(data);
        if (dup.ok && Array.isArray(dup.values) && dup.values.length > 0) {
          setDuplicates(dup.values as Duplicate[]);
          setError("A likely duplicate was found (AT-03). Review the records below before saving.");
          return;
        }
      }
      if (duplicates.length > 0 && !confirmed) {
        setError("Confirm the duplicate check before saving.");
        return;
      }
      const outcome = await createPatientAction(data);
      if (!outcome.ok) {
        setError(outcome.message ?? "Registration failed.");
        return;
      }
      router.push(`/app/patients/${outcome.values?.patientId as number}?registered=1`);
    } catch {
      setError("Registration failed. Check the form and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-bold text-brand-700">Register a patient</h1>
      <p className="mb-6 text-sm text-ink-soft">
        The system checks for likely duplicates before creating a new record.
      </p>

      <ErrorNote message={error} />

      {duplicates.length > 0 && (
        <div className="mb-6 rounded-lg border border-gold-300 bg-gold-50 p-4 text-sm">
          <p className="font-semibold text-gold-600">Likely existing records:</p>
          <ul className="mt-1 list-inside list-disc text-ink-soft">
            {duplicates.map((d) => (
              <li key={d.patient_id}>
                <span className="font-mono text-xs">{d.hospital_number}</span> — {d.first_name}{" "}
                {d.last_name} · {formatDate(d.date_of_birth)} · {d.phone}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I have checked these records — this is genuinely a new patient. Save anyway.
          </label>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input className={inputClass} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required minLength={2} />
          </Field>
          <Field label="Last name" required>
            <input className={inputClass} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required minLength={2} />
          </Field>
          <Field label="Date of birth" required>
            <input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} required />
          </Field>
          <Field label="Sex" required>
            <select className={selectClass} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option>Female</option>
              <option>Male</option>
            </select>
          </Field>
          <Field label="Phone" required hint="Nigerian numbers are normalised (e.g. +234… → 0…).">
            <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} required minLength={7} />
          </Field>
          <Field label="Email" required={false}>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Address" required>
            <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} required minLength={5} />
          </Field>
          <Field label="Emergency contact" required>
            <input className={inputClass} value={form.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} required minLength={5} />
          </Field>
        </div>
        <PrimaryButton disabled={busy}>{busy ? "Saving…" : "Register patient"}</PrimaryButton>
      </form>
    </Card>
  );
}

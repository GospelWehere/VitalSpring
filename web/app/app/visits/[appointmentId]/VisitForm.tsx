"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveVisitAction } from "@/app/actions/booking";
import { ErrorNote, Field, PrimaryButton, textareaClass } from "@/components/ui";

export default function VisitForm({
  appointmentId,
  initial,
}: {
  appointmentId: number;
  initial: {
    presenting_complaint?: string;
    clinical_findings?: string | null;
    diagnosis?: string | null;
    care_plan?: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    presentingComplaint: initial.presenting_complaint ?? "",
    clinicalFindings: initial.clinical_findings ?? "",
    diagnosis: initial.diagnosis ?? "",
    carePlan: initial.care_plan ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const data = new FormData();
    data.append("appointmentId", String(appointmentId));
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    const out = await saveVisitAction(data);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Could not save the visit record.");
      return;
    }
    setNotice("Visit record saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      {notice ? <p className="mb-2 text-sm text-brand-700">{notice}</p> : null}
      <Field label="Presenting complaint" required>
        <textarea className={textareaClass} required value={form.presentingComplaint} onChange={(e) => setForm({ ...form, presentingComplaint: e.target.value })} />
      </Field>
      <Field label="Clinical findings" required={false}>
        <textarea className={textareaClass} value={form.clinicalFindings} onChange={(e) => setForm({ ...form, clinicalFindings: e.target.value })} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Diagnosis" required={false}>
          <textarea className={textareaClass} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
        </Field>
        <Field label="Care plan" required={false}>
          <textarea className={textareaClass} value={form.carePlan} onChange={(e) => setForm({ ...form, carePlan: e.target.value })} />
        </Field>
      </div>
      <PrimaryButton disabled={busy}>{busy ? "Saving…" : "Save visit record"}</PrimaryButton>
    </form>
  );
}

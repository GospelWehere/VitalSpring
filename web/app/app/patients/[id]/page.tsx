import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/app/actions/auth";
import { Card, CardTitle, EmptyState, Table } from "@/components/ui";
import { formatDate, formatDateTime, ageFromDob } from "@/lib/dates";
import { getPatient, getPatientAppointments } from "@/lib/patients";
import { getPatientClinicalHistory } from "@/lib/visits";
import { hasPermission } from "@/lib/roles";
import EditPatientForm from "./EditPatientForm";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registered?: string }>;
}) {
  const { id } = await params;
  const { registered } = await searchParams;
  const user = await requireStaff();
  const patient = await getPatient(Number(id));
  if (!patient) notFound();

  const appointments = (await getPatientAppointments(patient.patient_id)) as Record<string, unknown>[];

  let history: { ok: true; records: Record<string, unknown>[] } | { ok: false; message: string } | null = null;
  if (hasPermission(user.role, "visit.view")) {
    const clinical = await getPatientClinicalHistory(patient.patient_id, user);
    if (clinical.ok) history = clinical;
  }
  const canEdit = hasPermission(user.role, "patient.edit");

  return (
    <div className="mx-auto max-w-5xl">
      {registered ? (
        <p className="mb-4 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Patient registered successfully.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">
            {patient.last_name}, {patient.first_name}
          </h1>
          <p className="text-sm text-ink-soft">
            <span className="font-mono">{patient.hospital_number}</span> · registered{" "}
            {formatDateTime(patient.registered_at)}
          </p>
        </div>
        <Link href="/app/patients" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Back to search
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Identity</CardTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-soft">Date of birth</dt>
            <dd>{formatDate(patient.date_of_birth)} · {ageFromDob(patient.date_of_birth)}y</dd>
            <dt className="text-ink-soft">Sex</dt>
            <dd>{patient.sex}</dd>
            <dt className="text-ink-soft">Phone</dt>
            <dd>{patient.phone}</dd>
            <dt className="text-ink-soft">Email</dt>
            <dd>{patient.email || "—"}</dd>
            <dt className="text-ink-soft">Address</dt>
            <dd>{patient.address}</dd>
            <dt className="text-ink-soft">Emergency contact</dt>
            <dd>{patient.emergency_contact}</dd>
          </dl>
        </Card>

        <Card>
          <CardTitle>Appointments</CardTitle>
          {appointments.length === 0 ? (
            <EmptyState>No appointments on record.</EmptyState>
          ) : (
            <Table headers={["Date", "Time", "Doctor", "Status"]}>
              {appointments.slice(0, 8).map((a) => (
                <tr key={a.appointment_id as number} className="bg-white">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.slot_date as string)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{String(a.start_time).slice(0, 5)}</td>
                  <td className="px-3 py-2">
                    {a.practitioner_name as string}
                    <span className="block text-xs text-ink-soft">{a.department_name as string}</span>
                  </td>
                  <td className="px-3 py-2 capitalize">{String(a.status).replace("_", " ")}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {history && history.ok && history.records.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Clinical history</CardTitle>
          <div className="space-y-4">
            {history.records.map((r) => (
              <div key={r.visit_record_id as number} className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm">
                <p className="mb-1 text-xs font-semibold text-ink-soft">
                  {formatDate(r.slot_date as string)} · {r.practitioner_name as string} · {r.department_name as string}
                </p>
                <p><span className="font-semibold">Complaint:</span> {r.presenting_complaint as string}</p>
                {r.clinical_findings ? <p><span className="font-semibold">Findings:</span> {r.clinical_findings as string}</p> : null}
                {r.diagnosis ? <p><span className="font-semibold">Diagnosis:</span> {r.diagnosis as string}</p> : null}
                {r.care_plan ? <p><span className="font-semibold">Care plan:</span> {r.care_plan as string}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      )}

      {canEdit && (
        <Card className="mt-6">
          <CardTitle>Edit record</CardTitle>
          <EditPatientForm
            patient={{
              patient_id: patient.patient_id,
              first_name: patient.first_name,
              last_name: patient.last_name,
              date_of_birth: patient.date_of_birth,
              sex: patient.sex,
              phone: patient.phone,
              email: patient.email ?? "",
              address: patient.address,
              emergency_contact: patient.emergency_contact,
            }}
          />
        </Card>
      )}
    </div>
  );
}

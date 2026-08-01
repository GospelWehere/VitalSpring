import { notFound } from "next/navigation";
import { requireStaff } from "@/app/actions/auth";
import { Card, CardTitle, EmptyState, Table } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/dates";
import { getAppointment } from "@/lib/slots";
import { getVisitRecord, getPatientVisitsForNurse } from "@/lib/visits";
import { getPatient } from "@/lib/patients";
import { hasPermission } from "@/lib/roles";
import VisitForm from "./VisitForm";

export default async function VisitPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const user = await requireStaff();
  const appointment = await getAppointment(Number(appointmentId));
  if (!appointment) notFound();

  const patient = await getPatient(Number(appointment.patient_id));
  const record = await getVisitRecord(Number(appointmentId));
  const canWrite = hasPermission(user.role, "visit.write");

  let nurseVisits: Record<string, unknown>[] | null = null;
  if (user.role === "nurse" && patient) {
    nurseVisits = await getPatientVisitsForNurse(patient.patient_id);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-700">Visit record</h1>
      <p className="mb-6 text-sm text-ink-soft">
        {formatDate(appointment.slot_date as string)} · {formatTime(appointment.start_time as string)} ·{" "}
        {appointment.practitioner_name as string} · {appointment.department_name as string}
      </p>

      <Card className="mb-6">
        <CardTitle>Patient</CardTitle>
        {patient ? (
          <div className="text-sm">
            <p className="font-semibold text-brand-700">
              {patient.last_name}, {patient.first_name}{" "}
              <span className="ml-2 font-mono text-xs text-ink-soft">{patient.hospital_number}</span>
            </p>
            <p className="text-xs text-ink-soft">
              {formatDate(patient.date_of_birth)} · {patient.sex} · {patient.phone}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Patient record unavailable.</p>
        )}
      </Card>

      {record && !canWrite && (
        <Card className="mb-6">
          <CardTitle>Recorded consultation</CardTitle>
          <dl className="space-y-2 text-sm">
            <div><dt className="font-semibold text-ink-soft">Complaint</dt><dd>{record.presenting_complaint as string}</dd></div>
            {record.clinical_findings ? <div><dt className="font-semibold text-ink-soft">Findings</dt><dd>{record.clinical_findings as string}</dd></div> : null}
            {record.diagnosis ? <div><dt className="font-semibold text-ink-soft">Diagnosis</dt><dd>{record.diagnosis as string}</dd></div> : null}
            {record.care_plan ? <div><dt className="font-semibold text-ink-soft">Care plan</dt><dd>{record.care_plan as string}</dd></div> : null}
          </dl>
        </Card>
      )}

      {nurseVisits && (
        <Card className="mb-6">
          <CardTitle>Previous visits (permitted information only)</CardTitle>
          {nurseVisits.length === 0 ? (
            <EmptyState>No previous visits recorded.</EmptyState>
          ) : (
            <Table headers={["Date", "Doctor", "Department", "Complaint"]}>
              {nurseVisits.map((v) => (
                <tr key={v.visit_record_id as number} className="bg-white">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(v.slot_date as string)}</td>
                  <td className="px-3 py-2">{v.practitioner_name as string}</td>
                  <td className="px-3 py-2">{v.department_name as string}</td>
                  <td className="max-w-60 truncate px-3 py-2">{v.presenting_complaint as string}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {canWrite ? (
        <Card>
          <CardTitle>{record ? "Update" : "Document"} this consultation</CardTitle>
          <VisitForm
            appointmentId={Number(appointmentId)}
            initial={{
              presenting_complaint: record?.presenting_complaint as string | undefined,
              clinical_findings: record?.clinical_findings as string | null | undefined,
              diagnosis: record?.diagnosis as string | null | undefined,
              care_plan: record?.care_plan as string | null | undefined,
            }}
          />
        </Card>
      ) : !record && !nurseVisits ? (
        <Card>
          <CardTitle>No visit record yet</CardTitle>
          <p className="text-sm text-ink-soft">The visit has not been documented. Only authorised clinical users can write visit records (AT-02).</p>
        </Card>
      ) : null}
    </div>
  );
}

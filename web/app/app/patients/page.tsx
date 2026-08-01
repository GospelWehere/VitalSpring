import Link from "next/link";
import { requireStaff } from "@/app/actions/auth";
import { Card, EmptyState, Field, LinkButton, Table, inputClass } from "@/components/ui";
import { formatDate, ageFromDob } from "@/lib/dates";
import { searchPatients } from "@/lib/patients";
import { hasPermission } from "@/lib/roles";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireStaff();
  const { q } = await searchParams;
  const results = q && q.trim().length >= 2 ? await searchPatients(q.trim()) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-700">Patient records</h1>
        {hasPermission(user.role, "patient.create") ? (
          <LinkButton href="/app/patients/new">Register patient</LinkButton>
        ) : null}
      </div>

      <Card className="mb-6">
        <form className="flex gap-3">
          <div className="flex-1">
            <Field label="Search by hospital number, phone, or name" required>
              <input
                name="q"
                defaultValue={q}
                minLength={2}
                required
                className={inputClass}
                placeholder="e.g. VS-000123, 08033124567, Okafor"
              />
            </Field>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Search
            </button>
          </div>
        </form>
      </Card>

      {results === null ? (
        <EmptyState>Enter a search term above (at least 2 characters) to find a patient.</EmptyState>
      ) : results.length === 0 ? (
        <EmptyState>No patients matched &ldquo;{q}&rdquo;. Check the spelling or register a new patient.</EmptyState>
      ) : (
        <Table headers={["Hospital No.", "Name", "DOB / Age", "Sex", "Phone", ""]}>
          {results.map((p) => (
            <tr key={p.patient_id} className="bg-white">
              <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap">{p.hospital_number}</td>
              <td className="px-3 py-2 font-semibold text-brand-700">
                {p.last_name}, {p.first_name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDate(p.date_of_birth)} · {ageFromDob(p.date_of_birth)}y
              </td>
              <td className="px-3 py-2">{p.sex}</td>
              <td className="px-3 py-2 whitespace-nowrap">{p.phone}</td>
              <td className="px-3 py-2 text-right">
                <Link href={`/app/patients/${p.patient_id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

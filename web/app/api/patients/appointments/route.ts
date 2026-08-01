import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPatientByHospitalNumber, getPatientAppointments, normalizePhone } from "@/lib/patients";
import { todayClinicISO, clinicDateISO } from "@/lib/dates";

export async function GET(request: NextRequest) {
  const hospitalNumber = (request.nextUrl.searchParams.get("hospitalNumber") ?? "").trim();
  const phone = normalizePhone(request.nextUrl.searchParams.get("phone") ?? "");
  const patient = await getPatientByHospitalNumber(hospitalNumber);
  if (!patient || patient.phone !== phone) {
    return NextResponse.json({ ok: false, message: "No booking found for that hospital number and phone." });
  }
  const today = todayClinicISO();
  const all = (await getPatientAppointments(patient.patient_id)) as {
    slot_date: string;
    status: string;
  }[];
  const upcoming = all.filter((a) => (clinicDateISO(a.slot_date) ?? "") >= today && !["cancelled", "no_show", "completed"].includes(a.status));
  const past = all.filter((a) => !upcoming.includes(a));
  return NextResponse.json({ ok: true, patient, upcoming, past });
}

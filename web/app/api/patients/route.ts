import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPatientByPhone, getPatientByHospitalNumber } from "@/lib/patients";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  const hospitalNumber = request.nextUrl.searchParams.get("hospitalNumber") ?? "";
  if (phone.length >= 7) {
    const patient = await getPatientByPhone(phone);
    return NextResponse.json({ patient });
  }
  if (hospitalNumber.trim().length >= 3) {
    const patient = await getPatientByHospitalNumber(hospitalNumber.trim());
    return NextResponse.json({ patient });
  }
  return NextResponse.json({ patient: null });
}

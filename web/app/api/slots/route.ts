import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listOpenSlotsForBooking } from "@/lib/slots";
import { clinicDateISO } from "@/lib/dates";

export async function GET(request: NextRequest) {
  const practitionerId = Number(request.nextUrl.searchParams.get("practitionerId") ?? "");
  if (!Number.isFinite(practitionerId) || practitionerId <= 0) {
    return NextResponse.json({ slots: [] });
  }
  const all = await listOpenSlotsForBooking(practitionerId);
  const date = request.nextUrl.searchParams.get("date");
  const slots = date ? all.filter((s) => clinicDateISO(s.slot_date) === date) : all;
  return NextResponse.json({ slots });
}

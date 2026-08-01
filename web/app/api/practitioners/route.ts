import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listPractitioners } from "@/lib/slots";

export async function GET(request: NextRequest) {
  const departmentId = Number(request.nextUrl.searchParams.get("departmentId") ?? "");
  const practitioners = await listPractitioners(Number.isFinite(departmentId) && departmentId > 0 ? departmentId : undefined);
  return NextResponse.json({ practitioners });
}

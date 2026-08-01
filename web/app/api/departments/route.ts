import { NextResponse } from "next/server";
import { listDepartments } from "@/lib/slots";

export async function GET() {
  return NextResponse.json({ departments: await listDepartments() });
}

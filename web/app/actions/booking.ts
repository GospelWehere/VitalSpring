"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireRole, requireStaff } from "@/app/actions/auth";
import { PermissionDeniedError, hasPermission } from "@/lib/roles";
import { logActivity } from "@/lib/audit";
import { query } from "@/db/client";
import { createPatient, findDuplicatePatients, getPatientByHospitalNumber, normalizePhone, searchPatients, updatePatient, type DuplicateCandidate } from "@/lib/patients";
import { formatZodError, patientSchema, patientSearchSchema } from "@/lib/validation";
import {
  bookAppointment,
  cancelAppointment,
  createSlots,
  getAppointment,
  rescheduleAppointment,
  setSlotStatus,
  type SlotRow,
} from "@/lib/slots";
import { checkInAppointment, transitionQueue } from "@/lib/queue";
import { saveVisitRecord } from "@/lib/visits";
import { processNotificationQueue } from "@/lib/notify";
import type { Role } from "@/lib/roles";
import { bookingSchema, checkInSchema, queueTransitionSchema, rescheduleSchema, slotGenerateSchema, visitSchema } from "@/lib/validation";
import { type SessionUser } from "@/lib/auth";

export interface ActionResult<V = unknown> {
  ok: boolean;
  message?: string;
  values?: V;
}

export async function searchPatientsAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("patient.view");
  const parsed = patientSearchSchema.safeParse({ q: formData.get("q") });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const results = await searchPatients(parsed.data.q);
  await logActivity({
    userId: user.userId,
    action: "patient_search",
    objectType: "patient",
  });
  return { ok: true, values: results };
}

export async function createPatientAction(formData: FormData): Promise<ActionResult<{ patientId: number }>> {
  const user = await requirePermission("patient.create");
  const parsed = patientSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    date_of_birth: formData.get("date_of_birth"),
    sex: formData.get("sex"),
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    address: formData.get("address"),
    emergency_contact: formData.get("emergency_contact"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const patient = await createPatient(parsed.data, user);
  return { ok: true, message: `Patient registered with hospital number ${patient.hospital_number}.`, values: { patientId: patient.patient_id } };
}

export async function updatePatientAction(patientId: number, formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("patient.edit");
  const parsed = patientSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    date_of_birth: formData.get("date_of_birth"),
    sex: formData.get("sex"),
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    address: formData.get("address"),
    emergency_contact: formData.get("emergency_contact"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const patient = await updatePatient(patientId, parsed.data, user);
  if (!patient) return { ok: false, message: "Patient not found." };
  revalidatePath(`/app/patients/${patientId}`);
  return { ok: true, message: "Patient record updated." };
}

export async function checkDuplicatesAction(formData: FormData): Promise<ActionResult<DuplicateCandidate[]>> {
  const parsed = patientSchema.partial().safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    date_of_birth: formData.get("date_of_birth"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const data = parsed.data as { first_name?: string; last_name?: string; date_of_birth?: string; phone?: string };
  if (!data.phone || !data.last_name || !data.date_of_birth) return { ok: true, values: [] };
  const candidates = await findDuplicatePatients(data as { first_name: string; last_name: string; date_of_birth: string; phone: string });
  return { ok: true, values: candidates };
}

export async function bookAppointmentAction(formData: FormData): Promise<ActionResult<{ alternatives?: SlotRow[]; appointmentId?: number }>> {
  const user = await requireStaff();
  const parsed = bookingSchema.safeParse({
    patientId: formData.get("patientId"),
    slotId: formData.get("slotId"),
    visitReason: formData.get("visitReason"),
    bookingSource: formData.get("bookingSource"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await bookAppointment(parsed.data, user);
  if (!result.ok) return { ok: false, message: result.message, values: { alternatives: result.alternatives } };
  revalidatePath("/app/booking");
  revalidatePath("/portal");
  return { ok: true, message: "Appointment booked.", values: { appointmentId: result.appointment.appointment_id } };
}

export async function cancelAppointmentAction(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const appointmentId = Number(formData.get("appointmentId"));
  if (!appointmentId) return { ok: false, message: "Missing appointment." };
  const result = await cancelAppointment(appointmentId, user);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/app/booking");
  revalidatePath("/portal");
  return { ok: true, message: result.reopened ? "Appointment cancelled; the slot was reopened." : "Appointment cancelled." };
}

export async function rescheduleAppointmentAction(formData: FormData): Promise<ActionResult<{ alternatives?: SlotRow[] }>> {
  const user = await requireStaff();
  const parsed = rescheduleSchema.safeParse({
    appointmentId: formData.get("appointmentId"),
    newSlotId: formData.get("newSlotId"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await rescheduleAppointment(parsed.data.appointmentId, parsed.data.newSlotId, user);
  if (!result.ok) return { ok: false, message: result.message, values: { alternatives: result.alternatives } };
  revalidatePath("/app/booking");
  revalidatePath("/portal");
  return { ok: true, message: "Appointment rescheduled." };
}

export async function checkInAction(formData: FormData): Promise<ActionResult<{ queueEntryId?: number }>> {
  const user = await requirePermission("check_in");
  const parsed = checkInSchema.safeParse({ appointmentId: formData.get("appointmentId") });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await checkInAppointment(parsed.data.appointmentId, user);
  revalidatePath("/app/queue");
  if (!result.ok) {
    return { ok: false, message: result.message, values: result.queueEntry ? { queueEntryId: result.queueEntry.queue_entry_id } : undefined };
  }
  return { ok: true, message: `Checked in with queue number ${result.queueEntry.queue_number}.` };
}

export async function queueTransitionAction(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  if (!hasPermission(user.role, "queue.manage") && !hasPermission(user.role, "queue.call")) {
    await logActivity({
      userId: user.userId,
      action: "denied_access",
      objectType: "permission",
    });
    throw new PermissionDeniedError();
  }
  const parsed = queueTransitionSchema.safeParse({
    queueEntryId: formData.get("queueEntryId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await transitionQueue(parsed.data.queueEntryId, parsed.data.status, user);
  revalidatePath("/app/queue");
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: "Queue updated." };
}

export async function saveVisitAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission("visit.write");
  const parsed = visitSchema.safeParse({
    appointmentId: formData.get("appointmentId"),
    presentingComplaint: formData.get("presentingComplaint"),
    clinicalFindings: formData.get("clinicalFindings") || undefined,
    diagnosis: formData.get("diagnosis") || undefined,
    carePlan: formData.get("carePlan") || undefined,
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await saveVisitRecord(parsed.data, user);
  revalidatePath(`/app/visits/${parsed.data.appointmentId}`);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: "Visit record saved." };
}

export async function createSlotsAction(formData: FormData): Promise<ActionResult> {
  const user = await requireRole("doctor", "administrator");
  const parsed = slotGenerateSchema.safeParse({
    practitionerId: formData.get("practitionerId"),
    days: formData.get("days"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await createSlots(parsed.data, user);
  revalidatePath("/app/schedule");
  return { ok: true, message: `${result.created} slots created, ${result.skipped} already existed.` };
}

export async function toggleSlotAction(formData: FormData): Promise<ActionResult> {
  const user = await requireRole("doctor", "administrator");
  const slotId = Number(formData.get("slotId"));
  const status = formData.get("status") === "blocked" ? "blocked" : "open";
  if (!slotId) return { ok: false, message: "Missing slot." };
  await setSlotStatus(slotId, status, user);
  revalidatePath("/app/schedule");
  return { ok: true, message: status === "blocked" ? "Slot blocked." : "Slot reopened." };
}

export async function runNotificationWorkerAction(): Promise<ActionResult> {
  await requireRole("administrator");
  const result = await processNotificationQueue();
  return {
    ok: true,
    message: `Processed: ${result.processed} delivered, ${result.retrying} retrying, ${result.failed} failed.`,
  };
}

export async function portalBookAppointmentAction(formData: FormData): Promise<ActionResult<{ appointmentId?: number; alternatives?: SlotRow[] }>> {
  const parsed = bookingSchema.safeParse({
    patientId: formData.get("patientId"),
    slotId: formData.get("slotId"),
    visitReason: formData.get("visitReason"),
    bookingSource: "patient_portal",
  });
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };
  const result = await bookAppointment(parsed.data, null);
  if (!result.ok) return { ok: false, message: result.message, values: { alternatives: result.alternatives } };
  return { ok: true, message: "Your appointment request has been confirmed.", values: { appointmentId: result.appointment.appointment_id } };
}

/**
 * Portal reschedule / cancel (US-02). Identity is verified server-side with the
 * same hospital-number + phone pair used for lookup, so an anonymous caller
 * can only change bookings they can prove they own.
 */
async function portalSystemUser(): Promise<SessionUser | null> {
  const rows = await query<{ user_id: number; username: string; role: Role; display_name: string }>(
    `SELECT user_id, username, role, display_name FROM user_account WHERE username = 'portal'`
  );
  const row = rows[0];
  if (!row) return null;
  return { userId: Number(row.user_id), username: row.username, role: row.role, displayName: row.display_name };
}

async function verifyPortalOwnership(appointmentId: number, hospitalNumber: string, phone: string): Promise<{ ok: true; actor: SessionUser | null } | { ok: false; message: string }> {
  const patient = await getPatientByHospitalNumber(hospitalNumber.trim());
  if (!patient || patient.phone !== normalizePhone(phone)) {
    return { ok: false, message: "Identity could not be verified." };
  }
  const app = await getAppointment(appointmentId);
  if (!app || Number(app.patient_id) !== Number(patient.patient_id)) {
    return { ok: false, message: "That booking does not belong to this patient record." };
  }
  return { ok: true, actor: await portalSystemUser() };
}

export async function portalCancelAppointmentAction(formData: FormData): Promise<ActionResult> {
  const appointmentId = Number(formData.get("appointmentId"));
  const hospitalNumber = String(formData.get("hospitalNumber") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const verified = await verifyPortalOwnership(appointmentId, hospitalNumber, phone);
  if (!verified.ok) return verified;
  const result = await cancelAppointment(appointmentId, verified.actor ?? { userId: -1, username: "portal", role: "receptionist", displayName: "Patient Portal" });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: "Your appointment has been cancelled." };
}

export async function portalRescheduleAppointmentAction(formData: FormData): Promise<ActionResult<{ alternatives?: SlotRow[] }>> {
  const appointmentId = Number(formData.get("appointmentId"));
  const hospitalNumber = String(formData.get("hospitalNumber") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const newSlotId = Number(formData.get("newSlotId"));
  const verified = await verifyPortalOwnership(appointmentId, hospitalNumber, phone);
  if (!verified.ok) return verified;
  const result = await rescheduleAppointment(appointmentId, newSlotId, verified.actor ?? { userId: -1, username: "portal", role: "receptionist", displayName: "Patient Portal" });
  if (!result.ok) return { ok: false, message: result.message, values: { alternatives: result.alternatives } };
  return { ok: true, message: "Your appointment has been rescheduled." };
}

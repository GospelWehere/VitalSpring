import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(200),
});

export const SEXES = ["Female", "Male"] as const;

export const patientSchema = z.object({
  first_name: z.string().trim().min(2).max(50),
  last_name: z.string().trim().min(2).max(50),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((v) => new Date(`${v}T00:00:00`) < new Date(), "Date of birth must be in the past"),
  sex: z.enum(SEXES),
  phone: z.string().trim().min(7).max(15),
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email"),
  address: z.string().trim().min(5).max(160),
  emergency_contact: z.string().trim().min(5).max(140),
});

export const patientSearchSchema = z.object({
  q: z.string().trim().min(2).max(60),
});

export const BOOKING_SOURCES = ["patient_portal", "front_desk", "telephone", "walk_in"] as const;

export const bookingSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  slotId: z.coerce.number().int().positive(),
  visitReason: z.string().trim().min(3).max(200),
  bookingSource: z.enum(BOOKING_SOURCES),
});

export const slotGenerateSchema = z.object({
  practitionerId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(1).max(60),
  startHour: z.coerce.number().int().min(6).max(10),
  endHour: z.coerce.number().int().min(12).max(20),
});

export const blockSlotSchema = z.object({
  slotId: z.coerce.number().int().positive(),
});

export const checkInSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
});

export const QUEUE_STATUSES = ["waiting", "vitals", "called", "with_practitioner", "completed", "left"] as const;

export const queueTransitionSchema = z.object({
  queueEntryId: z.coerce.number().int().positive(),
  status: z.enum(QUEUE_STATUSES),
});

export const visitSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
  presentingComplaint: z.string().trim().min(3).max(2000),
  clinicalFindings: z.string().trim().max(2000).optional(),
  diagnosis: z.string().trim().max(1000).optional(),
  carePlan: z.string().trim().max(2000).optional(),
});

export const reportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.coerce.number().int().positive().optional(),
});

export const rescheduleSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
  newSlotId: z.coerce.number().int().positive(),
});

export const referenceLookupSchema = z.object({
  hospitalNumber: z.string().trim().min(3).max(20),
  phone: z.string().trim().min(7).max(15),
});

export function formatZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}

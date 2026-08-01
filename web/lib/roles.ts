export const ROLES = ["receptionist", "records", "nurse", "doctor", "manager", "administrator"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  receptionist: "Receptionist",
  records: "Records Officer",
  nurse: "Nurse",
  doctor: "Doctor",
  manager: "Manager",
  administrator: "Administrator",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export type Permission =
  | "patient.create"
  | "patient.edit"
  | "patient.view"
  | "appointment.create"
  | "appointment.edit"
  | "appointment.view"
  | "check_in"
  | "queue.manage"
  | "queue.call"
  | "slot.manage"
  | "visit.write"
  | "visit.view"
  | "report.view"
  | "account.manage"
  | "audit.view"
  | "backup.manage";

export const PERMISSIONS: Record<Role, Permission[]> = {
  receptionist: [
    "patient.create",
    "patient.edit",
    "patient.view",
    "appointment.create",
    "appointment.edit",
    "appointment.view",
    "check_in",
  ],
  records: ["patient.create", "patient.edit", "patient.view", "appointment.view"],
  nurse: [
    "patient.view",
    "appointment.view",
    "queue.manage",
    "visit.view",
  ],
  doctor: [
    "patient.view",
    "appointment.view",
    "appointment.edit",
    "slot.manage",
    "queue.call",
    "visit.write",
    "visit.view",
  ],
  manager: ["patient.view", "appointment.view", "report.view", "audit.view"],
  administrator: [
    "patient.view",
    "appointment.view",
    "slot.manage",
    "report.view",
    "account.manage",
    "audit.view",
    "backup.manage",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export class PermissionDeniedError extends Error {
  constructor() {
    super("You do not have permission to perform this action.");
    this.name = "PermissionDeniedError";
  }
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError();
  }
}

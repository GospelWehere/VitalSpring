"use server";

import { createAccount, listAccounts, resetAccountPassword, setAccountActive } from "@/lib/accounts";
import { exportBackup, restoreBackup } from "@/lib/backup";
import { requireRole } from "@/app/actions/auth";
import { ROLES, type Role } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export async function createAccountAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const actor = await requireRole("administrator");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!username || password.length < 8 || !ROLES.includes(role) || !displayName) {
    return { ok: false, message: "All fields are required; password must be at least 8 characters." };
  }
  const result = await createAccount({ username, password, role, displayName }, actor);
  revalidatePath("/app/admin/accounts");
  return result.ok ? { ok: true, message: `Account ${username} created.` } : { ok: false, message: result.message };
}

export async function toggleAccountAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const actor = await requireRole("administrator");
  const userId = Number(formData.get("userId"));
  const active = formData.get("active") === "true";
  const result = await setAccountActive(userId, active, actor);
  revalidatePath("/app/admin/accounts");
  return result.ok
    ? { ok: true, message: active ? "Account enabled." : "Account disabled; sessions are no longer accepted." }
    : { ok: false, message: result.message };
}

export async function resetPasswordAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const actor = await requireRole("administrator");
  const userId = Number(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  const result = await resetAccountPassword(userId, password, actor);
  return result.ok ? { ok: true, message: "Password reset." } : { ok: false, message: result.message };
}

export async function listAccountsForAdmin() {
  await requireRole("administrator");
  return listAccounts();
}

export async function backupExportAction(): Promise<{ ok: boolean; backup?: import("@/lib/backup").BackupFile; message?: string }> {
  const actor = await requireRole("administrator");
  const backup = await exportBackup(actor);
  return { ok: true, backup };
}

export async function backupRestoreAction(formData: FormData): Promise<{ ok: boolean; message?: string; counts?: Record<string, number> }> {
  const actor = await requireRole("administrator");
  const raw = String(formData.get("backup") ?? "");
  if (!raw.trim()) return { ok: false, message: "No backup file provided." };
  let backup: import("@/lib/backup").BackupFile;
  try {
    backup = JSON.parse(raw) as import("@/lib/backup").BackupFile;
  } catch {
    return { ok: false, message: "The uploaded file is not a valid Vital Spring backup." };
  }
  if (!backup.tables || !backup.exported_at) {
    return { ok: false, message: "The uploaded file is not a valid Vital Spring backup." };
  }
  const counts = await restoreBackup(backup, actor);
  return { ok: true, message: `Backup restored from ${backup.exported_at}.`, counts };
}

import bcrypt from "bcryptjs";
import { pool, query } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import type { Role } from "@/lib/roles";

export interface AccountRow {
  user_id: number;
  username: string;
  role: Role;
  display_name: string;
  active: boolean;
  last_login: Date | null;
}

export async function listAccounts(): Promise<AccountRow[]> {
  return query(`SELECT user_id, username, role, display_name, active, last_login
                FROM user_account ORDER BY display_name`);
}

export async function createAccount(
  input: { username: string; password: string; role: Role; displayName: string },
  actor: SessionUser
): Promise<{ ok: true; account: AccountRow } | { ok: false; message: string }> {
  const exists = await query(`SELECT 1 FROM user_account WHERE username = $1`, [input.username]);
  if (exists.length > 0) return { ok: false, message: "That username is already taken." };
  const hash = await bcrypt.hash(input.password, 10);
  const rows = await query<AccountRow>(
    `INSERT INTO user_account (username, password_hash, role, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, username, role, display_name, active, last_login`,
    [input.username, hash, input.role, input.displayName]
  );
  await logActivity({
    userId: actor.userId,
    action: "account_create",
    objectType: "user_account",
    objectId: Number(rows[0].user_id),
  });
  return { ok: true, account: rows[0] };
}

export async function setAccountActive(
  userId: number,
  active: boolean,
  actor: SessionUser
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (userId === actor.userId && !active) {
    return { ok: false, message: "You cannot disable your own account." };
  }
  const result = await pool.query(
    `UPDATE user_account SET active = $1 WHERE user_id = $2`,
    [active, userId]
  );
  if (result.rowCount === 0) return { ok: false, message: "Account not found." };
  await logActivity({
    userId: actor.userId,
    action: "account_update",
    objectType: "user_account",
    objectId: userId,
  });
  return { ok: true };
}

export async function resetAccountPassword(
  userId: number,
  newPassword: string,
  actor: SessionUser
): Promise<{ ok: true } | { ok: false; message: string }> {
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(`UPDATE user_account SET password_hash = $1 WHERE user_id = $2`, [hash, userId]);
  if (result.rowCount === 0) return { ok: false, message: "Account not found." };
  await logActivity({
    userId: actor.userId,
    action: "account_update",
    objectType: "user_account",
    objectId: userId,
  });
  return { ok: true };
}

export interface AuditLogRow {
  activity_id: number;
  user_id: number;
  username: string;
  display_name: string;
  action_type: string;
  object_type: string;
  object_id: number | null;
  action_time: Date;
  source_address: string | null;
}

export async function listAuditLog(limit = 100, offset = 0): Promise<AuditLogRow[]> {
  return query(
    `SELECT al.activity_id, al.user_id, u.username, u.display_name,
            al.action_type, al.object_type, al.object_id, al.action_time, al.source_address
     FROM activity_log al
     JOIN user_account u ON u.user_id = al.user_id
     ORDER BY al.action_time DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

"use server";

import bcrypt from "bcryptjs";
import { pool } from "@/db/client";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionUser,
  setSessionCookie,
  type SessionUser,
} from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { hasPermission, PermissionDeniedError, type Permission, type Role } from "@/lib/roles";
import { loginSchema, formatZodError } from "@/lib/validation";
import { redirect } from "next/navigation";

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function checkLoginLimit(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return true;
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return true;
  }
  return entry.count < MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(key: string): void {
  const entry = loginAttempts.get(key) ?? { count: 0, firstAt: Date.now() };
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
    loginAttempts.set(key, entry);
  }
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function loginAction(_prev: LoginResult | null, formData: FormData): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { username, password } = parsed.data;
  const key = username.toLowerCase();
  if (!checkLoginLimit(key)) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }

  const result = await pool.query(
    `SELECT user_id, username, password_hash, role, display_name, active FROM user_account WHERE username = $1`,
    [username]
  );
  const account = result.rows[0];
  const valid = account && account.active && (await bcrypt.compare(password, account.password_hash));

  if (!valid) {
    recordLoginFailure(key);
    await logActivity({
      userId: account ? Number(account.user_id) : 1,
      action: "login_failed",
      objectType: "user_account",
      objectId: account ? Number(account.user_id) : null,
    });
    return { ok: false, error: "Invalid username or password." };
  }

  loginAttempts.delete(key);
  const user: SessionUser = {
    userId: Number(account.user_id),
    username: account.username,
    role: account.role as Role,
    displayName: account.display_name,
  };
  const token = await createSessionToken(user);
  await setSessionCookie(token);
  await pool.query(`UPDATE user_account SET last_login = now() WHERE user_id = $1`, [user.userId]);
  await logActivity({
    userId: user.userId,
    action: "login",
    objectType: "user_account",
    objectId: user.userId,
  });
  redirect("/app/dashboard");
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await logActivity({
      userId: user.userId,
      action: "logout",
      objectType: "user_account",
      objectId: user.userId,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, permission)) {
    await logActivity({
      userId: user.userId,
      action: "denied_access",
      objectType: "permission",
    });
    throw new PermissionDeniedError();
  }
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireStaff();
  if (!roles.includes(user.role)) {
    await logActivity({
      userId: user.userId,
      action: "denied_access",
      objectType: "role",
    });
    throw new PermissionDeniedError();
  }
  return user;
}

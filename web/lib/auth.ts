import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { pool } from "@/db/client";
import { logActivity } from "@/lib/audit";
import { roleLabel, type Role } from "@/lib/roles";

export { roleLabel };

export const SESSION_COOKIE = "vs_session";
export const SESSION_TTL_SECONDS = 15 * 60; // NFR-02: 15-minute inactivity timeout
export const SESSION_COOKIE_TTL_SECONDS = 24 * 60 * 60;

export interface SessionUser {
  userId: number;
  username: string;
  role: Role;
  displayName: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await verifySessionToken(token);
  if (!user) return null;
  const row = await pool.query(
    `SELECT user_id, username, role, display_name, active FROM user_account WHERE user_id = $1`,
    [user.userId]
  );
  const account = row.rows[0];
  if (!account || !account.active) return null;
  return {
    userId: account.user_id,
    username: account.username,
    role: account.role as Role,
    displayName: account.display_name,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export interface RequestContext {
  user: SessionUser;
  sourceAddress: string | null;
}

export async function getSourceAddress(): Promise<string | null> {
  return null;
}

export async function auditFor(user: SessionUser, action: Parameters<typeof logActivity>[0]["action"], objectType: string, objectId?: number | null) {
  await logActivity({
    userId: user.userId,
    action,
    objectType,
    objectId: objectId ?? null,
    sourceAddress: null,
  });
}

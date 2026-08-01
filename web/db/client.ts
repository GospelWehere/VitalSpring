import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl,
  });
  p.on("error", (e) => console.error("Database pool error:", e.message));
  return p;
}

export const pool = globalForPg.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T = unknown>(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

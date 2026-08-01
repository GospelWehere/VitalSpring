import { pool } from "@/db/client";
import { logActivity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";

const TABLES = [
  "department",
  "user_account",
  "patient",
  "practitioner",
  "availability_slot",
  "appointment",
  "queue_entry",
  "visit_record",
  "notification",
  "activity_log",
] as const;

const ID_COLUMNS: Record<(typeof TABLES)[number], string> = {
  department: "department_id",
  user_account: "user_id",
  patient: "patient_id",
  practitioner: "practitioner_id",
  availability_slot: "slot_id",
  appointment: "appointment_id",
  queue_entry: "queue_entry_id",
  visit_record: "visit_record_id",
  notification: "notification_id",
  activity_log: "activity_id",
};

export interface BackupFile {
  exported_at: string;
  tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }>;
  counts: Record<string, number>;
}

/**
 * FR-18 / NFR-05: protected backup export and authorised restoration.
 * The export is a JSON snapshot of every table; restoration clears the
 * database and reloads the snapshot inside one transaction (used by the
 * administrator and by acceptance test AT-06).
 */
export async function exportBackup(actor: SessionUser): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  const counts: BackupFile["counts"] = {};
  for (const table of TABLES) {
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
    tables[table] = {
      columns: result.fields.map((f) => f.name),
      rows: result.rows as Record<string, unknown>[],
    };
    counts[table] = result.rowCount ?? 0;
  }
  await logActivity({
    userId: actor.userId,
    action: "backup_export",
    objectType: "backup",
  });
  return { exported_at: new Date().toISOString(), tables, counts };
}

export async function restoreBackup(backup: BackupFile, actor: SessionUser): Promise<Record<string, number>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE activity_log, notification, visit_record, queue_entry, appointment, availability_slot, patient, practitioner, user_account, department RESTART IDENTITY CASCADE");
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const info = backup.tables[table];
      if (!info || info.rows.length === 0) {
        counts[table] = 0;
        continue;
      }
      const columns = info.columns.join(", ");
      const placeholders = info.rows.map(
        (_, i) => `(${info.columns.map((_, j) => `$${i * info.columns.length + j + 1}`).join(", ")})`
      );
      const values: unknown[] = [];
      for (const row of info.rows) {
        for (const col of info.columns) values.push(row[col] ?? null);
      }
      const result = await client.query(
        `INSERT INTO ${table} (${columns}) VALUES ${placeholders.join(", ")}`,
        values
      );
      counts[table] = result.rowCount ?? 0;
    }
    await client.query(`SELECT setval('hospital_number_seq', (SELECT COALESCE(MAX(patient_id), 0) FROM patient))`);
    for (const table of TABLES) {
      const idColumn = ID_COLUMNS[table];
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), (SELECT COALESCE(MAX(${idColumn}), 0) FROM ${table}))`,
        [table, idColumn]
      );
    }
    await logActivity({
      userId: actor.userId,
      action: "backup_restore",
      objectType: "backup",
      client,
    });
    await client.query("COMMIT");
    return counts;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

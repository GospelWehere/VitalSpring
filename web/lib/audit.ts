import { pool } from "@/db/client";
import type { PoolClient } from "pg";

export type ActivityAction =
  | "login"
  | "login_failed"
  | "logout"
  | "patient_search"
  | "patient_create"
  | "patient_update"
  | "appointment_create"
  | "appointment_reschedule"
  | "appointment_cancel"
  | "check_in"
  | "queue_transition"
  | "visit_record_save"
  | "slot_create"
  | "slot_block"
  | "report_view"
  | "account_create"
  | "account_update"
  | "backup_export"
  | "backup_restore"
  | "notification_processed"
  | "denied_access";

export interface ActivityInput {
  userId: number;
  action: ActivityAction;
  objectType: string;
  objectId?: number | null;
  sourceAddress?: string | null;
  client?: PoolClient;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const { userId, action, objectType, objectId, sourceAddress, client } = input;
    if (client) {
      await client.query(
        `INSERT INTO activity_log (user_id, action_type, object_type, object_id, source_address)
         VALUES ($1, $2, $3, $4, $5::inet)`,
        [userId, action, objectType, objectId ?? null, sourceAddress || null]
      );
    } else {
      await pool.query(
        `INSERT INTO activity_log (user_id, action_type, object_type, object_id, source_address)
         VALUES ($1, $2, $3, $4, $5::inet)`,
        [userId, action, objectType, objectId ?? null, sourceAddress || null]
      );
    }
  } catch {
    // The audit trail is best-effort: a logging failure must never break clinic work.
  }
}

export async function logActivityInTx(
  tx: PoolClient,
  input: Omit<ActivityInput, "client">
): Promise<void> {
  await logActivity({ ...input, client: tx });
}

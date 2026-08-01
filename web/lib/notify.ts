import { pool, query } from "@/db/client";

export interface NotificationRow {
  notification_id: number;
  appointment_id: number;
  message_type: string;
  channel: string;
  destination: string;
  delivery_status: string;
  processed_at: Date | null;
  attempts: number;
}

export async function queueNotification(input: {
  appointmentId: number;
  messageType: string;
  channel: "sms" | "email";
  destination: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notification (appointment_id, message_type, channel, destination)
     VALUES ($1, $2, $3, $4)`,
    [input.appointmentId, input.messageType, input.channel, input.destination]
  );
}

/**
 * NFR-12: patient messages omit diagnosis and detailed visit reasons.
 */
export function messageText(notification: Pick<NotificationRow, "message_type" | "channel" | "destination">): string {
  const destination = notification.destination;
  switch (notification.message_type) {
    case "confirmation":
      return `Vital Spring Medical Center: your appointment has been confirmed. Reference ${destination}. We look forward to seeing you.`;
    case "reminder":
      return `Vital Spring Medical Center: a reminder that you have an appointment soon. Reply or call us to reschedule if needed.`;
    case "reschedule":
      return `Vital Spring Medical Center: your appointment has been rescheduled. Check your booking or call reception for details.`;
    case "cancellation":
      return `Vital Spring Medical Center: your appointment has been cancelled. Call reception if you wish to book a new time.`;
    default:
      return `Vital Spring Medical Center: update regarding your appointment.`;
  }
}

/**
 * Simulated message provider (AT-05): the real SMS/email gateway is stubbed.
 * Queued and retrying notifications are processed; a temporary provider
 * failure moves a notification to "retrying" (up to maxAttempts) and a final
 * result is recorded afterwards.
 */
export async function processNotificationQueue(options?: {
  maxAttempts?: number;
  failSimulation?: "fail_once" | "never_fail";
}): Promise<{ processed: number; retrying: number; failed: number }> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const pending = await query<NotificationRow>(
    `SELECT * FROM notification
     WHERE delivery_status IN ('queued', 'retrying')
     ORDER BY notification_id
     LIMIT 50`
  );

  let processed = 0;
  let retrying = 0;
  let failed = 0;

  for (const n of pending) {
    const shouldFail = options?.failSimulation === "fail_once" && n.attempts === 0;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT * FROM notification WHERE notification_id = $1 FOR UPDATE`,
        [n.notification_id]
      );
      const row = locked.rows[0];
      if (!row || !["queued", "retrying"].includes(row.delivery_status)) {
        await client.query("ROLLBACK");
        continue;
      }
      if (shouldFail) {
        const attempts = Number(row.attempts) + 1;
        const nextStatus = attempts >= maxAttempts ? "failed" : "retrying";
        await client.query(
          `UPDATE notification SET delivery_status = $1, attempts = $2, processed_at = now() WHERE notification_id = $3`,
          [nextStatus, attempts, n.notification_id]
        );
        await client.query("COMMIT");
        if (nextStatus === "failed") failed += 1;
        else retrying += 1;
      } else {
        const attempts = Number(row.attempts) + 1;
        await client.query(
          `UPDATE notification SET delivery_status = 'delivered', attempts = $1, processed_at = now() WHERE notification_id = $2`,
          [attempts, n.notification_id]
        );
        await client.query("COMMIT");
        processed += 1;
      }
    } catch {
      await client.query("ROLLBACK");
      retrying += 1;
    } finally {
      client.release();
    }
  }
  return { processed, retrying, failed };
}

export async function listNotifications(limit = 50): Promise<(NotificationRow & { destination_masked: string })[]> {
  const rows = await query<NotificationRow>(
    `SELECT * FROM notification ORDER BY notification_id DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    destination_masked: maskDestination(r.destination),
  }));
}

export function maskDestination(destination: string): string {
  if (destination.length <= 6) return destination;
  return `${destination.slice(0, 3)}****${destination.slice(-2)}`;
}

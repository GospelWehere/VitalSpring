import { requireRole } from "@/app/actions/auth";
import { listNotifications } from "@/lib/notify";
import BackupConsole from "./BackupConsole";

export const metadata = { title: "Backup & Messages" };
export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requireRole("administrator");
  const notifications = await listNotifications(30);
  return (
    <BackupConsole
      notifications={notifications.map((n) => ({
        notification_id: n.notification_id,
        message_type: n.message_type,
        channel: n.channel,
        destination_masked: n.destination_masked,
        delivery_status: n.delivery_status,
        attempts: n.attempts,
        processed_at: n.processed_at ? n.processed_at.toISOString() : null,
      }))}
    />
  );
}

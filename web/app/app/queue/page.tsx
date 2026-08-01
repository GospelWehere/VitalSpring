import { requireStaff } from "@/app/actions/auth";
import { hasPermission } from "@/lib/roles";
import LiveQueue from "./LiveQueue";

export const metadata = { title: "Live Queue" };

export default async function QueuePage() {
  const user = await requireStaff();
  return (
    <LiveQueue
      canCheckIn={hasPermission(user.role, "check_in")}
      canManage={hasPermission(user.role, "queue.manage")}
      canCall={hasPermission(user.role, "queue.call")}
    />
  );
}

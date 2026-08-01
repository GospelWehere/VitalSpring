import { requireRole } from "@/app/actions/auth";
import ScheduleManager from "./ScheduleManager";

export const metadata = { title: "Schedules & Slots" };

export default async function SchedulePage() {
  await requireRole("doctor", "administrator");
  return <ScheduleManager />;
}

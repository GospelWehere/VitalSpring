const CLINIC_TZ_OFFSET_MS = 60 * 60 * 1000; // West Africa Time (UTC+1)

export function clinicNow(): Date {
  return new Date(Date.now() + CLINIC_TZ_OFFSET_MS);
}

export function todayClinicISO(): string {
  return clinicNow().toISOString().slice(0, 10);
}

/** pg returns DATE columns as JS Dates (local midnight); normalize to 'YYYY-MM-DD'. */
export function clinicDateISO(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${v.getFullYear()}-${m}-${d}`;
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(isoDate: string | Date | null | undefined): string {
  if (!isoDate) return "-";
  const d = typeof isoDate === "string" ? new Date(`${isoDate}T00:00:00`) : isoDate;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(ts: Date | string | null | undefined): string {
  if (!ts) return "-";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "-";
  const [h, m] = t.slice(0, 5).split(":");
  const hours = Number(h);
  const suffix = hours >= 12 ? "pm" : "am";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${m}${suffix}`;
}

export function ageFromDob(dob: string | Date): number {
  const d = typeof dob === "string" ? new Date(`${dob}T00:00:00`) : dob;
  const today = new Date(Date.now() + CLINIC_TZ_OFFSET_MS);
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.max(
    0,
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)
  );
}

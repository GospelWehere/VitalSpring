import Link from "next/link";
import type { ReactNode } from "react";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#173f35" />
      <path d="M20 8 C 14 15, 12 20, 20 32 C 28 20, 26 15, 20 8 Z" fill="#9fc5b0" />
      <path d="M16 17 C 13 21, 14 25, 20 31 C 26 25, 27 21, 24 17 C 22 20, 20 21, 16 17 Z" fill="#e8f4ed" />
      <circle cx="20" cy="19" r="2.6" fill="#d49a35" />
    </svg>
  );
}

export function BrandHeader() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div>
        <div className="text-lg font-bold leading-tight text-brand-700">Vital Spring Medical Center</div>
        <div className="text-xs tracking-wide text-ink-soft">Clinic Appointment System</div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-200 bg-paper p-5 shadow-sm ${className}`}>{children}</div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-base font-bold text-brand-700">{children}</h2>;
}

export function Field({ label, children, required = false, hint }: { label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300";

export const selectClass = inputClass;
export const textareaClass = `${inputClass} min-h-24`;

export function PrimaryButton({
  children,
  className = "",
  type = "submit",
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-danger/40"
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 ${className}`}
    >
      {children}
    </Link>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "green" | "gold" | "red" | "blue"; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: "bg-brand-100 text-brand-700",
    green: "bg-brand-100 text-brand-600",
    gold: "bg-gold-100 text-gold-600",
    red: "bg-danger-soft text-danger",
    blue: "bg-[#e9f0f5] text-[#365d73]",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
  );
}

export const APPOINTMENT_TONES: Record<string, "green" | "gold" | "red" | "blue" | "neutral"> = {
  booked: "blue",
  confirmed: "green",
  checked_in: "gold",
  called: "gold",
  in_consultation: "gold",
  completed: "green",
  cancelled: "red",
  no_show: "red",
};

export const QUEUE_TONES: Record<string, "green" | "gold" | "red" | "blue" | "neutral"> = {
  waiting: "blue",
  vitals: "gold",
  called: "gold",
  with_practitioner: "green",
  completed: "green",
  left: "red",
};

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function SuccessNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700">
      {message}
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-brand-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-brand-700 text-white">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-brand-300 bg-brand-50 p-6 text-center text-sm text-ink-soft">{children}</p>;
}

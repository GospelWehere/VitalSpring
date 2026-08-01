"use client";

export function PrintButton({ label = "Print next-day list" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
    >
      {label}
    </button>
  );
}

import Link from "next/link";
import { BrandMark } from "@/components/ui";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <header className="border-b border-brand-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark size={32} />
            <span className="font-bold text-brand-700">Patient Portal</span>
          </Link>
          <nav className="flex gap-4 text-sm font-semibold text-brand-700">
            <Link href="/portal" className="hover:text-brand-500">Book</Link>
            <Link href="/portal/manage" className="hover:text-brand-500">Manage a booking</Link>
            <Link href="/" className="text-ink-soft hover:text-brand-500">Home</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-brand-200 bg-white py-4 text-center text-xs text-ink-soft">
        Vital Spring Medical Center — academic demonstration portal. Do not enter real patient data.
      </footer>
    </div>
  );
}

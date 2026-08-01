import Link from "next/link";
import { BrandHeader, Card, LinkButton } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-brand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandHeader />
          <nav className="flex items-center gap-3">
            <Link href="/portal" className="text-sm font-semibold text-brand-700 hover:text-brand-600">
              Patient Portal
            </Link>
            <LinkButton href={user ? "/app/dashboard" : "/login"}>
              {user ? "Staff Dashboard" : "Staff Login"}
            </LinkButton>
          </nav>
        </div>
      </header>

      <section className="bg-brand-700 py-16 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-3 text-xs font-bold tracking-[0.2em] text-gold-300 uppercase">Care in motion. Information in place.</p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight">
            Book your appointment at Vital Spring Medical Center in minutes
          </h1>
          <p className="mt-4 max-w-2xl text-brand-100">
            Choose a department, see only the times that are actually open, and receive a
            confirmation. No more double-booked slots, lost paper folders, or forgotten visits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/portal" className="bg-gold-300 text-brand-700 hover:bg-gold-300/90">
              Book an Appointment
            </LinkButton>
            <LinkButton href="/portal/manage" className="bg-transparent ring-1 ring-white/50 hover:bg-white/10">
              Manage a Booking
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-12 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-lg font-bold text-brand-700">Transparent availability</h2>
          <p className="text-sm text-ink-soft">
            Every slot is reserved atomically — when two people confirm the same time, exactly
            one succeeds. You always see the true open times.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-bold text-brand-700">Live patient flow</h2>
          <p className="text-sm text-ink-soft">
            From check-in to consultation, the clinic tracks the queue with timestamps so staff
            can see waiting delays while they can still act.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-bold text-brand-700">Private and accountable</h2>
          <p className="text-sm text-ink-soft">
            Role-based access, encrypted sessions, and an append-only activity log keep health
            information visible only to staff who need it.
          </p>
        </Card>
      </section>

      <footer className="mt-auto border-t border-brand-200 bg-brand-50 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-xs text-ink-soft">
          <span>Vital Spring Medical Center — INS 204 System Analysis and Design, Group 9, 2025/2026.</span>
          <span>This is an academic demonstration system. Do not enter real patient data.</span>
        </div>
      </footer>
    </main>
  );
}

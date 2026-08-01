import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { roleLabel } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/roles";
import { BrandHeader, GhostButton } from "@/components/ui";
import { logoutAction } from "@/app/actions/auth";

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-brand-100 text-brand-700" : "text-brand-100 hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const can = (p: Permission) => hasPermission(user.role, p);
  const nav: { href: string; label: string; show: boolean }[] = [
    { href: "/app/dashboard", label: "Dashboard", show: true },
    { href: "/app/patients", label: "Patients", show: can("patient.view") },
    { href: "/app/booking", label: "Book appointment", show: can("appointment.create") },
    { href: "/app/queue", label: "Live queue", show: can("queue.manage") || can("check_in") },
    { href: "/app/schedule", label: "Schedules & slots", show: can("slot.manage") },
    { href: "/app/reports", label: "Reports", show: can("report.view") },
    { href: "/app/downtime", label: "Downtime pack", show: true },
    { href: "/app/admin/accounts", label: "Accounts", show: can("account.manage") },
    { href: "/app/admin/audit", label: "Activity log", show: can("audit.view") },
    { href: "/app/admin/backup", label: "Backup & messages", show: can("backup.manage") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-brand-50 md:flex-row">
      <aside className="flex flex-col gap-1 bg-brand-700 p-4 md:w-64 md:min-h-screen">
        <div className="mb-6 px-3 text-white">
          <BrandHeader />
        </div>
        <nav className="flex flex-col gap-1">
          {nav.filter((n) => n.show).map((n) => (
            <NavItem key={n.href} href={n.href} label={n.label} active={false} />
          ))}
        </nav>
        <div className="mt-auto pt-6 md:pt-12">
          <div className="mb-2 px-3 text-xs text-brand-200">
            Signed in as <span className="font-bold text-white">{user.displayName}</span>
            <span className="block">{roleLabel(user.role)}</span>
          </div>
          <form action={logoutAction}>
            <GhostButton className="w-full border-white/30 text-white hover:bg-white/10">
              Sign out
            </GhostButton>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAccountAction, toggleAccountAction, resetPasswordAction } from "@/app/actions/admin";
import { Card, ErrorNote, Field, GhostButton, PrimaryButton, SuccessNote, Table, inputClass, selectClass } from "@/components/ui";
import { roleLabel } from "@/lib/roles";
import { ROLES, type Role } from "@/lib/roles";
import { formatDateTime } from "@/lib/dates";

interface Account {
  user_id: number;
  username: string;
  role: Role;
  display_name: string;
  active: boolean;
  last_login: string | null;
}

export default function AccountsManager({ accounts, currentUserId }: { accounts: Account[]; currentUserId: number }) {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "", role: "receptionist", displayName: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<Account | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    const out = await createAccountAction(data);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Could not create account.");
      return;
    }
    setNotice(out.message ?? "Account created.");
    setForm({ username: "", password: "", role: "receptionist", displayName: "" });
    router.refresh();
  }

  async function toggle(account: Account) {
    setBusy(true);
    const data = new FormData();
    data.append("userId", String(account.user_id));
    data.append("active", String(!account.active));
    const out = await toggleAccountAction(data);
    setBusy(false);
    if (!out.ok) setError(out.message ?? "Update failed.");
    else setNotice(out.message ?? 'Updated.');
    router.refresh();
  }

  async function reset() {
    if (!resetFor || newPassword.length < 8) return;
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.append("userId", String(resetFor.user_id));
    data.append("password", newPassword);
    const out = await resetPasswordAction(data);
    setBusy(false);
    if (!out.ok) {
      setError(out.message ?? "Reset failed.");
      return;
    }
    setNotice(out.message ?? 'Password reset.');
    setResetFor(null);
    setNewPassword("");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-brand-700">Staff accounts</h1>
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <Card>
            <h2 className="mb-3 text-base font-bold text-brand-700">Create account</h2>
            <form onSubmit={create} className="space-y-3">
              <Field label="Username" required><input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} /></Field>
              <Field label="Display name" required><input className={inputClass} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></Field>
              <Field label="Role" required>
                <select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </Field>
              <Field label="Password" required hint="Minimum 8 characters; stored as a salted hash (FR-15).">
                <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              </Field>
              <PrimaryButton disabled={busy}>{busy ? "Creating…" : "Create account"}</PrimaryButton>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Table headers={["Name", "Username", "Role", "Last login", "Status", "Actions"]}>
            {accounts.map((a) => (
              <tr key={a.user_id} className="bg-white">
                <td className="px-3 py-2 font-semibold text-brand-700">{a.display_name}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.username}</td>
                <td className="px-3 py-2">{roleLabel(a.role)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{a.last_login ? formatDateTime(a.last_login) : "never"}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${a.active ? "bg-brand-100 text-brand-600" : "bg-danger-soft text-danger"}`}>
                    {a.active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex gap-2">
                    <GhostButton onClick={() => setResetFor(a)}>Reset password</GhostButton>
                    {a.user_id !== currentUserId ? (
                      <GhostButton className={a.active ? "text-danger hover:bg-danger-soft" : "text-brand-600"} onClick={() => toggle(a)}>
                        {a.active ? "Disable" : "Enable"}
                      </GhostButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>

      {resetFor ? (
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-bold text-brand-700">Reset password for {resetFor.display_name}</h2>
          <div className="flex max-w-md gap-3">
            <input type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" />
            <GhostButton onClick={reset} disabled={busy || newPassword.length < 8}>Set password</GhostButton>
            <GhostButton onClick={() => { setResetFor(null); setNewPassword(""); }}>Cancel</GhostButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

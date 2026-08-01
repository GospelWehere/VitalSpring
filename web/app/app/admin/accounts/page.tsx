import { requireRole } from "@/app/actions/auth";
import { listAccounts } from "@/lib/accounts";
import AccountsManager from "./AccountsManager";

export const metadata = { title: "Staff Accounts" };

export default async function AccountsPage() {
  const user = await requireRole("administrator");
  const accounts = await listAccounts();
  return (
    <AccountsManager
      accounts={accounts.map((a) => ({ ...a, last_login: a.last_login ? a.last_login.toISOString() : null }))}
      currentUserId={user.userId}
    />
  );
}

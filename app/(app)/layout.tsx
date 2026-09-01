import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/version";
import { withTenant } from "@/lib/db/client";
import { countByObject } from "@/lib/runtime/records";
import { AppShell } from "./AppShell";

/**
 * The product runs at app density: 34px rows, borders rather than shadows.
 * `data-density` is set once, here, and nothing below it uses a raw px value.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const config = await getConfig(session.tenantId);
  const counts = await withTenant(session.tenantId, (db) => countByObject(db, session.tenantId));

  return (
    <div data-density="app" className="h-screen bg-surface text-content">
      <AppShell session={session} config={config} counts={counts}>
        {children}
      </AppShell>
    </div>
  );
}

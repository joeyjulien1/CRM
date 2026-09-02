import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/version";
import { withTenant } from "@/lib/db/client";
import { countByObject } from "@/lib/runtime/records";
import { activeTemplate } from "@/lib/templates/apply";
import { AppShell } from "./AppShell";

/**
 * The product runs at app density: 34px rows, borders rather than shadows.
 * `data-density` is set once, here, and nothing below it uses a raw px value.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const config = await getConfig(session.tenantId);
  const { counts, template } = await withTenant(session.tenantId, async (db) => ({
    counts: await countByObject(db, session.tenantId),
    template: await activeTemplate(db, session.tenantId),
  }));

  return (
    <div data-density="app" className="h-screen bg-surface text-content">
      {/* A workspace that started from a template gets that template's
          follow-ups as the agent's examples. The prompt behind the template
          stays on the server; only these three sentences travel. */}
      <AppShell
        session={session}
        config={config}
        counts={counts}
        templatePrompts={template?.nextPrompts ?? []}
      >
        {children}
      </AppShell>
    </div>
  );
}

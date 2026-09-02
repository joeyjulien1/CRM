import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { getCurrentVersion } from "@/lib/config/version";
import { countByObject } from "@/lib/runtime/records";
import { activeTemplate } from "@/lib/templates/apply";
import { BackendScreen } from "./BackendScreen";

const GENERIC_SUGGESTIONS = [
  "Create a follow-up task whenever a deal moves to Proposal",
  "Set the owner on a new contact to whoever created it",
  "Raise a task a week before every close date",
];

export default async function BackendPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { config, counts, template } = await withTenant(session.tenantId, async (db) => ({
    config: (await getCurrentVersion(db, session.tenantId)).config,
    counts: await countByObject(db, session.tenantId),
    template: await activeTemplate(db, session.tenantId),
  }));

  /* A workspace that started from a template gets that template's follow-ups —
     the prompts are written for its business, not for a generic CRM. */
  const suggestions = template?.nextPrompts ?? GENERIC_SUGGESTIONS;

  return (
    <BackendScreen
      config={config}
      counts={counts}
      canEditConfig={session.canEditConfig}
      suggestions={suggestions}
    />
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { getCurrentVersion } from "@/lib/config/version";
import { TEMPLATES } from "@/lib/templates";
import { activeTemplate, describeTemplate } from "@/lib/templates/apply";
import { toCard } from "@/lib/templates/types";
import { TemplateGallery, type TemplatePreview } from "./TemplateGallery";

export default async function StartPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { config, startedFrom } = await withTenant(session.tenantId, async (db) => ({
    config: (await getCurrentVersion(db, session.tenantId)).config,
    startedFrom: await activeTemplate(db, session.tenantId),
  }));

  /* The card is built here so the brief — the prompt behind a template — never
     crosses into a client component. */
  const templates: TemplatePreview[] = TEMPLATES.map((template) => ({
    ...toCard(template),
    changes: safeDescribe(template, config),
  }));

  const firstView = config.views[0];

  return (
    <TemplateGallery
      templates={templates}
      startedFrom={startedFrom?.name ?? null}
      canEditConfig={session.canEditConfig}
      firstViewPath={firstView ? `/views/${firstView.id}` : "/settings/history"}
    />
  );
}

/**
 * A template built for a workspace it no longer fits still belongs on the page,
 * with its own explanation of why it cannot be used.
 */
function safeDescribe(template: (typeof TEMPLATES)[number], config: Parameters<typeof describeTemplate>[1]): string[] {
  try {
    return describeTemplate(template, config);
  } catch (error) {
    return [
      error instanceof Error
        ? `This template does not fit this workspace as it is now: ${error.message}`
        : "This template does not fit this workspace as it is now.",
    ];
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { PatchError } from "@/lib/config/patch";
import { applyTemplate } from "@/lib/templates/apply";
import { TemplateError } from "@/lib/templates/build";

export interface StartResult {
  error?: string;
  /** Where to land once the template is in: the first view it produced. */
  redirectTo?: string;
}

export async function startFromTemplateAction(templateId: string): Promise<StartResult> {
  const session = await requireSession();
  if (!session.canEditConfig) {
    return { error: "Your role cannot change this workspace's configuration." };
  }

  try {
    const applied = await withTenant(session.tenantId, (db) =>
      applyTemplate(db, session.tenantId, templateId),
    );

    revalidatePath("/", "layout");

    /* Land on something the template built, not on the contacts table every
       workspace already had — the first look should be the new one. */
    const landing = applied.createdViewIds[0] ?? applied.version.config.views[0]?.id;
    return { redirectTo: landing ? `/views/${landing}` : "/settings/history" };
  } catch (error) {
    if (error instanceof TemplateError) return { error: error.message };
    if (error instanceof PatchError) {
      return {
        error: `Those changes clash with how this workspace is set up now: ${error.message}. Ask the agent for the parts you want instead.`,
      };
    }
    console.error("could not apply a template:", error);
    return { error: "That template could not be applied. Try again." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { commitPatches } from "@/lib/config/version";
import { PatchError } from "@/lib/config/patch";

/**
 * The one edit the blueprint makes on its own. Everything structural — a new
 * step, a changed condition — goes through the agent, because the agent is
 * where config changes get reviewed before they apply.
 */
export async function setAutomationEnabledAction(
  automationId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!session.canEditConfig) {
    return { error: "Your role cannot change this workspace's configuration." };
  }

  try {
    await withTenant(session.tenantId, (db) =>
      commitPatches(
        db,
        session.tenantId,
        [{ op: "set_automation_enabled", automationId, enabled }],
        "user",
        enabled ? "Turned an automation on" : "Turned an automation off",
      ),
    );
  } catch (error) {
    if (error instanceof PatchError) return { error: error.message };
    console.error("could not switch an automation:", error);
    return { error: "That automation could not be switched. Try again." };
  }

  revalidatePath("/backend");
  return {};
}

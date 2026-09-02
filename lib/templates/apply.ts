import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { configVersions } from "@/lib/db/schema";
import { commitPatches, getCurrentVersion, type ConfigVersion } from "@/lib/config/version";
import { describePatches } from "@/lib/config/describe";
import type { Config } from "@/lib/config/types";
import { findTemplate, templateAuthor, templateIdFromAuthor, type BusinessTemplate } from "./index";
import { TemplateError } from "./build";

/**
 * A template applies exactly like an agent turn: one validated patch set, one
 * new version, one rollback away from where the workspace was. Nothing here is
 * a special case in the config layer, which is what keeps the invariant true.
 */
export interface AppliedTemplate {
  version: ConfigVersion;
  /** The views the template added, in the order it added them. */
  createdViewIds: string[];
}

export async function applyTemplate(
  db: Db,
  tenantId: string,
  templateId: string,
): Promise<AppliedTemplate> {
  const template = findTemplate(templateId);
  if (!template) throw new TemplateError("That template no longer exists.");

  const current = await getCurrentVersion(db, tenantId);
  const patches = template.patches(current.config);
  if (patches.length === 0) throw new TemplateError("That template has nothing to set up.");

  const version = await commitPatches(
    db,
    tenantId,
    patches,
    templateAuthor(template.id),
    `Started from the ${template.name} template`,
  );

  return {
    version,
    createdViewIds: patches.flatMap((patch) => (patch.op === "create_view" ? [patch.view.id] : [])),
  };
}

/**
 * The plain-language list a person reads before committing to a template —
 * the same sentences ConfigDiff shows for an agent patch. Each patch is
 * described against the config the one before it produced, so "changes the
 * Live listings view" never refers to a view that does not exist yet.
 */
export function describeTemplate(template: BusinessTemplate, base: Config): string[] {
  return describePatches(template.patches(base), base);
}

/** The template a workspace started from, if it started from one. */
export async function activeTemplate(db: Db, tenantId: string): Promise<BusinessTemplate | undefined> {
  const rows = await db
    .select({ author: configVersions.author })
    .from(configVersions)
    .where(eq(configVersions.tenantId, tenantId))
    .orderBy(desc(configVersions.version))
    .limit(50);

  for (const row of rows) {
    const id = templateIdFromAuthor(row.author);
    if (id) return findTemplate(id);
  }
  return undefined;
}

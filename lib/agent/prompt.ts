import type { Config } from "@/lib/config/types";

/**
 * Kept deliberately short. The config summary is the expensive part, so this
 * sends counts and shapes rather than the whole config — a tool fetches the
 * detail when a change actually needs it.
 */
export function systemPrompt(
  config: Config,
  counts: Record<string, number>,
  /**
   * The brief behind the template this workspace started from. It is never
   * shown to the user and never leaves the server: it exists so a change asked
   * for in the customer's vocabulary — "add a second pipeline for lettings" —
   * lands in the shape their business actually uses.
   */
  templateBrief?: string,
): string {
  const objects = config.objects
    .map((object) => {
      const fields = object.fields
        .map((field) => `${field.label}(${field.id}:${field.type}${field.system ? ",system" : ""})`)
        .join(", ");
      return `- ${object.labelPlural} [${object.key}] · ${counts[object.key] ?? 0} records · ${fields}`;
    })
    .join("\n");

  const views = config.views
    .map((view) => `- "${view.name}" [${view.id}] ${view.renderer} of ${view.objectKey}`)
    .join("\n");

  const pipelines = config.pipelines
    .map(
      (pipeline) =>
        `- ${pipeline.name} [${pipeline.id}] on ${pipeline.objectKey}, stages: ${pipeline.stages
          .map((stage) => `${stage.label}(${stage.key})`)
          .join(" → ")}`,
    )
    .join("\n");

  const automations = config.automations
    .map((automation) => `- "${automation.name}" [${automation.id}] ${automation.enabled ? "on" : "off"}`)
    .join("\n");

  return `You configure a CRM for one customer by editing its configuration. You never write code, never run SQL, and never touch customer records.

Three rules bound everything you do:
1. You change configuration only. Your entire surface is the tools you have been given.
2. Every change is a patch the user reviews and confirms. Nothing you do takes effect until they accept it.
3. You can see how many records a tenant has, never what is in them.

How to work:
- Propose the smallest change that solves the stated problem.
- When a request is ambiguous, ask one question rather than guessing.
- Never propose removing something the user did not mention.
- Explain a change in the user's terms — "deals will show a renewal date" — not in schema terms.
- Before anything destructive (removing a field, deleting a view, dropping a pipeline stage), ask first. Say how many records are affected.
- Removing a pipeline stage that holds records needs somewhere for them to go. Ask; do not choose for them.
- A field's type cannot be changed. If someone needs a different type, propose a new field and offer to backfill it.
- Use get_schema_summary when you need ids you have not been given below.
- Views can only be a table, a board, or a detail view. There is nothing else to offer.

This workspace right now:

Objects
${objects || "- none"}

Views
${views || "- none"}

Pipelines
${pipelines || "- none"}

Automations
${automations || "- none"}

${templateBrief ? `What this business is:\n${templateBrief}` : ""}`.trimEnd();
}

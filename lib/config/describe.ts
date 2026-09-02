import { applyPatches, findField, findObject } from "./patch";
import type {
  AutomationAction,
  AutomationConfig,
  Config,
  ConfigPatch,
  FieldConfig,
  FilterCondition,
} from "./types";

/**
 * Turns a patch into a sentence a salesperson can approve. ConfigDiff shows
 * this, never JSON — it is the trust surface of the whole product.
 */
export function describePatch(patch: ConfigPatch, before: Config): string {
  switch (patch.op) {
    case "add_field": {
      const object = findObject(before, patch.objectKey);
      const required = patch.field.required ? ", required" : "";
      return `Adds ${article(patch.field.label)} ${patch.field.label} field (${fieldTypeLabel(patch.field.type)}${required}) to ${object?.labelPlural ?? patch.objectKey}`;
    }

    case "update_field": {
      const found = findField(before, patch.fieldId);
      if (!found) return `Updates a field`;
      const changes: string[] = [];
      if (patch.label && patch.label !== found.field.label) changes.push(`renames it to ${patch.label}`);
      if (patch.required !== undefined && patch.required !== found.field.required) {
        changes.push(patch.required ? "makes it required" : "makes it optional");
      }
      if (patch.options) {
        const existing = new Set((found.field.options ?? []).map((o) => o.value));
        const proposed = new Set(patch.options.map((o) => o.value));
        const added = patch.options.filter((o) => !existing.has(o.value)).map((o) => o.label);
        const removed = (found.field.options ?? []).filter((o) => !proposed.has(o.value)).map((o) => o.label);
        if (added.length) changes.push(`adds the ${list(added)} ${plural(added.length, "option")}`);
        if (removed.length) changes.push(`removes the ${list(removed)} ${plural(removed.length, "option")}`);
      }
      if (patch.default !== undefined) changes.push("changes its default");
      if (patch.helpText !== undefined) changes.push("changes its help text");
      const summary = changes.length ? changes.join(", ") : "leaves it unchanged";
      return `Changes ${found.field.label} on ${found.object.labelPlural}: ${summary}`;
    }

    case "remove_field": {
      const found = findField(before, patch.fieldId);
      if (!found) return `Removes a field`;
      return `Removes ${found.field.label} from ${found.object.labelPlural}`;
    }

    case "create_relation":
      return `Links ${patch.relation.fromObject} to ${patch.relation.toObject} as "${patch.relation.label}"`;

    case "reorder_fields": {
      const object = findObject(before, patch.objectKey);
      return `Reorders the fields on ${object?.labelPlural ?? patch.objectKey}`;
    }

    case "create_view": {
      const object = findObject(before, patch.view.objectKey);
      return `Adds a ${rendererLabel(patch.view.renderer)} called "${patch.view.name}" to ${object?.labelPlural ?? patch.view.objectKey}`;
    }

    case "update_view": {
      const view = before.views.find((v) => v.id === patch.viewId);
      if (!view) return `Updates a view`;
      const changes: string[] = [];
      if (patch.name && patch.name !== view.name) changes.push(`renames it to "${patch.name}"`);
      if (patch.columns) changes.push(`shows ${patch.columns.length} ${plural(patch.columns.length, "column")}`);
      if (patch.filters !== undefined) changes.push(patch.filters ? "changes its filters" : "clears its filters");
      if (patch.sort !== undefined) changes.push(patch.sort ? "changes its sort order" : "clears its sort order");
      if (patch.groupBy !== undefined) changes.push(patch.groupBy ? "groups it" : "ungroups it");
      return `Changes the "${view.name}" view: ${changes.length ? changes.join(", ") : "no visible change"}`;
    }

    case "delete_view": {
      const view = before.views.find((v) => v.id === patch.viewId);
      return `Deletes the "${view?.name ?? patch.viewId}" view`;
    }

    case "create_pipeline":
      return `Adds the ${pipelineName(patch.pipeline.name)} with ${patch.pipeline.stages.length} stages: ${list(patch.pipeline.stages.map((s) => s.label))}`;

    case "update_pipeline": {
      const pipeline = before.pipelines.find((p) => p.id === patch.pipelineId);
      if (!pipeline) return `Updates a pipeline`;
      if (!patch.stages) return `Renames the ${pipelineName(pipeline.name)} to ${patch.name ?? pipeline.name}`;
      const nextKeys = new Set(patch.stages.map((s) => s.key));
      const existingKeys = new Set(pipeline.stages.map((s) => s.key));
      const removed = pipeline.stages.filter((s) => !nextKeys.has(s.key)).map((s) => s.label);
      const added = patch.stages.filter((s) => !existingKeys.has(s.key)).map((s) => s.label);
      const parts: string[] = [];
      if (added.length) parts.push(`adds ${list(added)}`);
      if (removed.length) {
        const targets = (patch.stageMigrations ?? []).map((m) => {
          const to = patch.stages?.find((s) => s.key === m.to);
          return to?.label ?? m.to;
        });
        parts.push(`removes ${list(removed)}, moving those records to ${list([...new Set(targets)])}`);
      }
      const renamed = patch.name && patch.name !== pipeline.name ? [`renames it to ${patch.name}`] : [];
      return `Changes the ${pipelineName(pipeline.name)}: ${[...renamed, ...parts].join(", ") || "reorders its stages"}`;
    }

    case "create_automation":
      return `Adds the "${patch.automation.name}" automation: ${describeTrigger(patch.automation, before)}, then ${list(patch.automation.actions.map(describeAction))}`;

    case "update_automation": {
      const automation = before.automations.find((a) => a.id === patch.automationId);
      return `Changes the "${automation?.name ?? patch.automationId}" automation`;
    }

    case "set_automation_enabled": {
      const automation = before.automations.find((a) => a.id === patch.automationId);
      return `${patch.enabled ? "Turns on" : "Turns off"} the "${automation?.name ?? patch.automationId}" automation`;
    }

    case "rollback":
      return `Restores the configuration as it was at version ${patch.toVersion}`;
  }
}

/**
 * A set of patches, each described against the configuration the one before it
 * produced. Describing them all against the same starting config would say
 * "removes the New stage" about a stage a previous patch already replaced.
 */
export function describePatches(patches: ConfigPatch[], before: Config): string[] {
  const lines: string[] = [];
  let preview = before;

  for (const patch of patches) {
    lines.push(describePatch(patch, preview));
    try {
      preview = applyPatches(preview, [patch]);
    } catch {
      // Describing is not applying: a patch that only validates alongside its
      // siblings still reads correctly against the config before it.
    }
  }

  return lines;
}

export function describeTrigger(automation: AutomationConfig, before: Config): string {
  const trigger = automation.trigger;
  const object = findObject(before, trigger.objectKey);
  const name = object?.label.toLowerCase() ?? trigger.objectKey;
  switch (trigger.type) {
    case "record_created":
      return `when a ${name} is created`;
    case "record_updated":
      return `when a ${name} is updated`;
    case "field_changed":
      return `when ${findField(before, trigger.fieldId)?.field.label ?? "a field"} changes on a ${name}`;
    case "date_reached":
      return `when a ${name} reaches its ${findField(before, trigger.fieldId)?.field.label ?? "date"}`;
    case "form_submitted":
      return `when a ${name} form is submitted`;
  }
}

export function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case "set_field":
      return "sets a field";
    case "create_record":
      return `creates a ${action.objectKey}`;
    case "create_task":
      return `creates the task "${action.title}"`;
    case "send_email":
      return `sends an email to ${action.to}`;
    case "call_webhook":
      return `calls ${action.url}`;
  }
}

/** "Adds an Account manager field", not "Adds a Account manager field". */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** "Sales pipeline" is already a pipeline; "Property board" needs saying. */
function pipelineName(name: string): string {
  return /pipeline/i.test(name) ? name : `${name} pipeline`;
}

function fieldTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: "text",
    long_text: "long text",
    number: "number",
    currency: "currency",
    date: "date",
    datetime: "date and time",
    boolean: "yes/no",
    select: "single choice",
    multi_select: "multiple choice",
    email: "email",
    phone: "phone",
    url: "link",
    relation: "link to another record",
    user: "person",
  };
  return labels[type] ?? type;
}

function rendererLabel(renderer: string): string {
  const labels: Record<string, string> = { table: "table", kanban: "board", detail: "detail view" };
  return labels[renderer] ?? renderer;
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * A condition as a sentence: "Stage is Under offer". Used by the blueprint
 * canvas and by anything else that has to show a filter to a person rather
 * than to the query resolver.
 */
export function describeCondition(config: Config, condition: FilterCondition): string {
  const found = findField(config, condition.fieldId);
  const label = found?.field.label ?? "A field";
  const phrase = OPERATOR_PHRASES[condition.operator] ?? condition.operator;

  if (condition.operator === "is_true") return `${label} is yes`;
  if (condition.operator === "is_false") return `${label} is no`;
  if (condition.operator === "is_empty") return `${label} is empty`;
  if (condition.operator === "is_not_empty") return `${label} has a value`;

  const value = describeValue(found?.field, condition.value);
  return `${label} ${phrase} ${value}`.trim();
}

const OPERATOR_PHRASES: Record<string, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  between: "is between",
  in_last_days: "was within the last",
  in_next_days: "falls within the next",
  is_any_of: "is any of",
  has_any_of: "has any of",
  has_all_of: "has all of",
};

function describeValue(field: FieldConfig | undefined, value: unknown): string {
  if (value === undefined || value === null) return "";

  if (Array.isArray(value)) return list(value.map((entry) => describeValue(field, entry)));

  if (field?.options) {
    const option = field.options.find((candidate) => candidate.value === String(value));
    if (option) return option.label;
  }

  if (typeof value === "number" && (field?.type === "date" || field?.type === "datetime")) {
    return `${value} days`;
  }

  return String(value);
}

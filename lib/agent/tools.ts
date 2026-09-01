import type Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { FIELD_TYPES, OBJECT_KEYS, RENDERERS } from "@/lib/config/schema";
import { findField, findObject, parsePatch } from "@/lib/config/patch";
import type { Config, ConfigPatch } from "@/lib/config/types";

/**
 * The agent's entire surface. If it isn't here, the agent cannot do it.
 *
 * Every mutating tool returns a patch, never a result. Patches accumulate
 * across a turn, validate as a set, render as one diff, and apply as one
 * config version on confirmation. Read tools return data — and note what is
 * absent: nothing reads record contents. The agent knows a tenant has 1,847
 * deals; it does not know who they are with.
 */

export const FIELD_TYPE_LIST = [...FIELD_TYPES];

function id(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function keyFrom(label: string, taken: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "f$1") || "field";

  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

function optionsFrom(raw: unknown): { value: string; label: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const taken = new Set<string>();
  return raw.map((entry) => {
    const label = typeof entry === "string" ? entry : String((entry as { label?: string }).label ?? entry);
    const value = keyFrom(label, taken);
    taken.add(value);
    return { value, label };
  });
}

export interface ToolContext {
  config: Config;
  counts: Record<string, number>;
  /** Import tools hand back a proposal rather than a config patch. */
  onImportProposal?: (proposal: ImportProposal) => void;
  sampleImportFile?: (fileId: string) => Promise<{ headers: string[]; rows: string[][] }>;
}

export interface ImportProposal {
  fileId: string;
  objectKey: string;
  mapping: Record<string, string>;
  dedupeKey?: string;
  unmapped: string[];
}

export interface ToolOutcome {
  /** Staged config changes. Empty for read tools. */
  patches: ConfigPatch[];
  /** What the model is told happened. */
  message: string;
  isError?: boolean;
}

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_config",
    description: "Read the tenant's current resolved configuration.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_schema_summary",
    description:
      "List objects, their fields and types, and how many records each object holds. Use this before proposing a change.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_field",
    description: "Add a field to an object.",
    input_schema: {
      type: "object",
      properties: {
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
        label: { type: "string", description: "What the user calls it, e.g. 'Renewal date'." },
        type: { type: "string", enum: FIELD_TYPE_LIST },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Choice labels. Required for select and multi_select.",
        },
        required: { type: "boolean" },
        default: { description: "Default value for new records." },
      },
      required: ["object_key", "label", "type"],
      additionalProperties: false,
    },
  },
  {
    name: "update_field",
    description:
      "Change a field's label, options, requiredness, or default. A field's type cannot be changed — that is a data migration. Propose a new field and offer to backfill instead.",
    input_schema: {
      type: "object",
      properties: {
        field_id: { type: "string" },
        label: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
        default: {},
      },
      required: ["field_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_field",
    description:
      "Remove a field. Destructive: the patch carries how many records hold a value. Ask the user before proposing this.",
    input_schema: {
      type: "object",
      properties: { field_id: { type: "string" } },
      required: ["field_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_relation",
    description: "Link two objects together.",
    input_schema: {
      type: "object",
      properties: {
        from_object: { type: "string", enum: [...OBJECT_KEYS] },
        to_object: { type: "string", enum: [...OBJECT_KEYS] },
        kind: { type: "string", enum: ["one_to_many", "many_to_many"] },
        label: { type: "string" },
      },
      required: ["from_object", "to_object", "kind", "label"],
      additionalProperties: false,
    },
  },
  {
    name: "reorder_fields",
    description: "Set the display order of an object's fields. Must list every field exactly once.",
    input_schema: {
      type: "object",
      properties: {
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
        field_ids: { type: "array", items: { type: "string" } },
      },
      required: ["object_key", "field_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "create_view",
    description: "Create a view of an object.",
    input_schema: {
      type: "object",
      properties: {
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
        name: { type: "string" },
        renderer: { type: "string", enum: [...RENDERERS] },
        columns: { type: "array", items: { type: "string" }, description: "Field ids, in order." },
        filters: { type: "object", description: "A filter tree: join, conditions, groups." },
        sort: { type: "object", description: "{ fieldId, direction }" },
        group_by: { type: "string" },
        pipeline_id: { type: "string", description: "Required when renderer is kanban." },
      },
      required: ["object_key", "name", "renderer", "columns"],
      additionalProperties: false,
    },
  },
  {
    name: "update_view",
    description: "Change a view's name, columns, filters, sort, or grouping.",
    input_schema: {
      type: "object",
      properties: {
        view_id: { type: "string" },
        name: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        filters: { type: "object" },
        sort: { type: "object" },
        group_by: { type: "string" },
      },
      required: ["view_id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_view",
    description: "Delete a view. Destructive.",
    input_schema: {
      type: "object",
      properties: { view_id: { type: "string" } },
      required: ["view_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_pipeline",
    description: "Create a pipeline. Its stages become the columns of a board.",
    input_schema: {
      type: "object",
      properties: {
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
        name: { type: "string" },
        stage_field_id: { type: "string", description: "An existing single-choice field." },
        stages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              probability: { type: "number" },
              is_won: { type: "boolean" },
              is_lost: { type: "boolean" },
            },
            required: ["label"],
          },
        },
      },
      required: ["object_key", "name", "stage_field_id", "stages"],
      additionalProperties: false,
    },
  },
  {
    name: "update_pipeline",
    description:
      "Change a pipeline's name or stages. Removing a stage that holds records requires stage_migrations saying where those records go — ask the user rather than choosing for them.",
    input_schema: {
      type: "object",
      properties: {
        pipeline_id: { type: "string" },
        name: { type: "string" },
        stages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Keep the existing key to keep the stage." },
              label: { type: "string" },
              probability: { type: "number" },
              is_won: { type: "boolean" },
              is_lost: { type: "boolean" },
            },
            required: ["label"],
          },
        },
        stage_migrations: {
          type: "array",
          items: {
            type: "object",
            properties: { from: { type: "string" }, to: { type: "string" } },
            required: ["from", "to"],
          },
        },
      },
      required: ["pipeline_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_automation",
    description:
      "Create an automation. send_email and call_webhook actions leave the building and are confirmed separately by the user.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        trigger: { type: "object", description: "{ type, objectKey, fieldId?, offsetDays? }" },
        conditions: { type: "array", items: { type: "object" } },
        actions: { type: "array", items: { type: "object" } },
      },
      required: ["name", "trigger", "actions"],
      additionalProperties: false,
    },
  },
  {
    name: "update_automation",
    description: "Change an automation's name, trigger, conditions, or actions.",
    input_schema: {
      type: "object",
      properties: {
        automation_id: { type: "string" },
        name: { type: "string" },
        trigger: { type: "object" },
        conditions: { type: "array", items: { type: "object" } },
        actions: { type: "array", items: { type: "object" } },
      },
      required: ["automation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_automation_enabled",
    description: "Turn an automation on or off.",
    input_schema: {
      type: "object",
      properties: { automation_id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["automation_id", "enabled"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_import_mapping",
    description:
      "Read an uploaded file's column headers and a sample of rows, and propose which column maps to which field.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" },
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
      },
      required: ["file_id", "object_key"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_import",
    description: "Run an import in the background using a mapping the user has confirmed.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" },
        object_key: { type: "string", enum: [...OBJECT_KEYS] },
        mapping: { type: "object", description: "Column header -> field id." },
        dedupe_key: { type: "string", description: "Field id to match existing records on." },
      },
      required: ["file_id", "object_key", "mapping"],
      additionalProperties: false,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  const { config } = context;

  try {
    switch (name) {
      case "get_config":
        return { patches: [], message: JSON.stringify(config) };

      case "get_schema_summary":
        return { patches: [], message: JSON.stringify(schemaSummary(context)) };

      case "add_field": {
        const object = findObject(config, String(input.object_key));
        if (!object) return fail(`There is no ${String(input.object_key)} object.`);
        const taken = new Set(object.fields.map((field) => field.key));
        const type = String(input.type);
        const options = optionsFrom(input.options);

        return stage({
          op: "add_field",
          objectKey: object.key,
          field: {
            id: id("fld"),
            key: keyFrom(String(input.label), taken),
            label: String(input.label),
            type,
            required: Boolean(input.required ?? false),
            system: false,
            ...(options ? { options } : {}),
            ...(input.default !== undefined ? { default: input.default } : {}),
          },
        });
      }

      case "update_field": {
        const found = findField(config, String(input.field_id));
        if (!found) return fail(`There is no field ${String(input.field_id)}.`);
        const options = optionsFrom(input.options);
        return stage({
          op: "update_field",
          fieldId: found.field.id,
          ...(input.label !== undefined ? { label: String(input.label) } : {}),
          ...(input.required !== undefined ? { required: Boolean(input.required) } : {}),
          ...(options ? { options } : {}),
          ...(input.default !== undefined ? { default: input.default } : {}),
        });
      }

      case "remove_field":
        return stage({ op: "remove_field", fieldId: String(input.field_id) });

      case "create_relation":
        return stage({
          op: "create_relation",
          relation: {
            key: keyFrom(
              `${String(input.from_object)}_${String(input.label)}`,
              new Set(config.relations.map((relation) => relation.key)),
            ),
            fromObject: String(input.from_object),
            toObject: String(input.to_object),
            kind: String(input.kind),
            label: String(input.label),
          },
        });

      case "reorder_fields":
        return stage({
          op: "reorder_fields",
          objectKey: String(input.object_key),
          fieldIds: (input.field_ids as string[]) ?? [],
        });

      case "create_view":
        return stage({
          op: "create_view",
          view: {
            id: id("vw"),
            objectKey: String(input.object_key),
            name: String(input.name),
            renderer: String(input.renderer),
            columns: (input.columns as string[]) ?? [],
            ...(input.filters ? { filters: input.filters } : {}),
            ...(input.sort ? { sort: input.sort } : {}),
            ...(input.group_by ? { groupBy: String(input.group_by) } : {}),
            ...(input.pipeline_id ? { pipelineId: String(input.pipeline_id) } : {}),
          },
        });

      case "update_view":
        return stage({
          op: "update_view",
          viewId: String(input.view_id),
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
          ...(input.columns !== undefined ? { columns: input.columns as string[] } : {}),
          ...(input.filters !== undefined ? { filters: input.filters } : {}),
          ...(input.sort !== undefined ? { sort: input.sort } : {}),
          ...(input.group_by !== undefined ? { groupBy: String(input.group_by) } : {}),
        });

      case "delete_view":
        return stage({ op: "delete_view", viewId: String(input.view_id) });

      case "create_pipeline": {
        const stages = (input.stages as { label: string }[]) ?? [];
        const taken = new Set<string>();
        return stage({
          op: "create_pipeline",
          pipeline: {
            id: id("pl"),
            objectKey: String(input.object_key),
            name: String(input.name),
            stageFieldId: String(input.stage_field_id),
            stages: stages.map((entry) => {
              const key = keyFrom(entry.label, taken);
              taken.add(key);
              return { key, ...entry };
            }),
          },
        });
      }

      case "update_pipeline": {
        const pipeline = config.pipelines.find((p) => p.id === String(input.pipeline_id));
        const stages = input.stages as ({ key?: string; label: string } | undefined)[] | undefined;
        const taken = new Set(pipeline?.stages.map((entry) => entry.key) ?? []);

        return stage({
          op: "update_pipeline",
          pipelineId: String(input.pipeline_id),
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
          ...(stages
            ? {
                stages: stages.filter(Boolean).map((entry) => ({
                  key: entry!.key ?? keyFrom(entry!.label, taken),
                  ...entry,
                })),
              }
            : {}),
          ...(input.stage_migrations ? { stageMigrations: input.stage_migrations } : {}),
        });
      }

      case "create_automation":
        return stage({
          op: "create_automation",
          automation: {
            id: id("au"),
            name: String(input.name),
            enabled: true,
            trigger: input.trigger,
            conditions: (input.conditions as unknown[]) ?? [],
            actions: (input.actions as unknown[]) ?? [],
          },
        });

      case "update_automation":
        return stage({
          op: "update_automation",
          automationId: String(input.automation_id),
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
          ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
          ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
          ...(input.actions !== undefined ? { actions: input.actions } : {}),
        });

      case "set_automation_enabled":
        return stage({
          op: "set_automation_enabled",
          automationId: String(input.automation_id),
          enabled: Boolean(input.enabled),
        });

      case "propose_import_mapping": {
        if (!context.sampleImportFile) return fail("No file is available to read.");
        const sample = await context.sampleImportFile(String(input.file_id));
        const object = findObject(config, String(input.object_key));
        if (!object) return fail(`There is no ${String(input.object_key)} object.`);

        // At most 20 rows ever reach the model. The full file never does.
        return {
          patches: [],
          message: JSON.stringify({
            headers: sample.headers,
            sampleRows: sample.rows.slice(0, 20),
            fields: object.fields.map((field) => ({ id: field.id, label: field.label, type: field.type })),
          }),
        };
      }

      case "apply_import": {
        context.onImportProposal?.({
          fileId: String(input.file_id),
          objectKey: String(input.object_key),
          mapping: (input.mapping as Record<string, string>) ?? {},
          dedupeKey: input.dedupe_key ? String(input.dedupe_key) : undefined,
          unmapped: [],
        });
        return {
          patches: [],
          message:
            "The import is staged. It runs as a background job once the user confirms it, and imports records rather than changing configuration.",
        };
      }

      default:
        return fail(`${name} is not a tool this agent has.`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function stage(raw: unknown): ToolOutcome {
  // Parsing here means a malformed patch is caught at the tool boundary, with a
  // message the model can act on, rather than at apply time.
  const patch = parsePatch(raw);
  return { patches: [patch], message: "Staged. It will be shown to the user as part of one diff." };
}

function fail(message: string): ToolOutcome {
  return { patches: [], message, isError: true };
}

export function schemaSummary(context: ToolContext): unknown {
  return {
    objects: context.config.objects.map((object) => ({
      key: object.key,
      label: object.labelPlural,
      recordCount: context.counts[object.key] ?? 0,
      fields: object.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        system: field.system,
        ...(field.options ? { options: field.options.map((option) => option.label) } : {}),
      })),
    })),
    views: context.config.views.map((view) => ({
      id: view.id,
      name: view.name,
      objectKey: view.objectKey,
      renderer: view.renderer,
    })),
    pipelines: context.config.pipelines.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      objectKey: pipeline.objectKey,
      stageFieldId: pipeline.stageFieldId,
      stages: pipeline.stages.map((stage) => stage.label),
    })),
    automations: context.config.automations.map((automation) => ({
      id: automation.id,
      name: automation.name,
      enabled: automation.enabled,
    })),
  };
}

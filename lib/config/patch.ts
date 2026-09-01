import { z } from "zod";
import {
  actionSchema,
  automationConfigSchema,
  configSchema,
  fieldConfigSchema,
  filterConditionSchema,
  filterTreeSchema,
  objectKeySchema,
  pipelineConfigSchema,
  pipelineStageSchema,
  relationConfigSchema,
  selectOptionSchema,
  sortSchema,
  triggerSchema,
  viewConfigSchema,
} from "./schema";
import type { Config, ConfigPatch, FieldConfig, ObjectConfig } from "./types";

const idSchema = z.string().min(1).max(64);

/**
 * One patch variant per tool in docs/AGENT-TOOLS.md, plus rollback. A tool's
 * arguments and its patch are not the same shape: ids are minted when the tool
 * runs and travel in the patch.
 *
 * Changing a field's type is deliberately absent. It is a data migration.
 */
export const configPatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_field"), objectKey: objectKeySchema, field: fieldConfigSchema }),
  z.object({
    op: z.literal("update_field"),
    fieldId: idSchema,
    label: z.string().min(1).max(80).optional(),
    options: z.array(selectOptionSchema).optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    helpText: z.string().max(200).optional(),
  }),
  z.object({ op: z.literal("remove_field"), fieldId: idSchema }),
  z.object({ op: z.literal("create_relation"), relation: relationConfigSchema }),
  z.object({
    op: z.literal("reorder_fields"),
    objectKey: objectKeySchema,
    fieldIds: z.array(idSchema),
  }),

  z.object({ op: z.literal("create_view"), view: viewConfigSchema }),
  z.object({
    op: z.literal("update_view"),
    viewId: idSchema,
    name: z.string().min(1).max(60).optional(),
    columns: z.array(idSchema).optional(),
    filters: filterTreeSchema.nullish(),
    sort: sortSchema.nullish(),
    groupBy: idSchema.nullish(),
  }),
  z.object({ op: z.literal("delete_view"), viewId: idSchema }),

  z.object({ op: z.literal("create_pipeline"), pipeline: pipelineConfigSchema }),
  z.object({
    op: z.literal("update_pipeline"),
    pipelineId: idSchema,
    name: z.string().min(1).max(60).optional(),
    stages: z.array(pipelineStageSchema).min(1).max(20).optional(),
    /** Required for every stage the patch removes: where its records go. */
    stageMigrations: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  }),

  z.object({ op: z.literal("create_automation"), automation: automationConfigSchema }),
  z.object({
    op: z.literal("update_automation"),
    automationId: idSchema,
    name: z.string().min(1).max(80).optional(),
    trigger: triggerSchema.optional(),
    conditions: z.array(filterConditionSchema).optional(),
    actions: z.array(actionSchema).min(1).max(10).optional(),
  }),
  z.object({
    op: z.literal("set_automation_enabled"),
    automationId: idSchema,
    enabled: z.boolean(),
  }),

  /** Rollback carries the whole config it restores — see docs/ARCHITECTURE.md. */
  z.object({
    op: z.literal("rollback"),
    toVersion: z.number().int().positive(),
    config: configSchema,
  }),
]);

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

export function findObject(config: Config, objectKey: string): ObjectConfig | undefined {
  return config.objects.find((o) => o.key === objectKey);
}

export function findField(
  config: Config,
  fieldId: string,
): { object: ObjectConfig; field: FieldConfig } | undefined {
  for (const object of config.objects) {
    const field = object.fields.find((f) => f.id === fieldId);
    if (field) return { object, field };
  }
  return undefined;
}

function requireObject(config: Config, objectKey: string): ObjectConfig {
  const object = findObject(config, objectKey);
  if (!object) throw new PatchError(`There is no ${objectKey} object`);
  return object;
}

function requireField(config: Config, fieldId: string): { object: ObjectConfig; field: FieldConfig } {
  const found = findField(config, fieldId);
  if (!found) throw new PatchError(`There is no field ${fieldId}`);
  return found;
}

/** Keeps a pipeline's stages and its stage field's options from drifting apart. */
function syncStageOptions(config: Config, pipelineId: string): void {
  const pipeline = config.pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) return;
  const found = findField(config, pipeline.stageFieldId);
  if (!found) return;
  found.field.options = pipeline.stages.map((stage) => ({
    value: stage.key,
    label: stage.label,
  }));
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Applies one patch to a config and returns a new config. Pure: the input is
 * never mutated. Throws PatchError when the patch does not make sense against
 * this config — the agent sees that message and retries once.
 */
export function applyPatch(config: Config, patch: ConfigPatch): Config {
  const next: Config = structuredClone(config);

  switch (patch.op) {
    case "add_field": {
      const object = requireObject(next, patch.objectKey);
      if (object.fields.some((f) => f.key === patch.field.key)) {
        throw new PatchError(`${object.label} already has a field called ${patch.field.label}`);
      }
      if (findField(next, patch.field.id)) {
        throw new PatchError(`Field id ${patch.field.id} is already in use`);
      }
      object.fields.push(patch.field);
      break;
    }

    case "update_field": {
      const { field } = requireField(next, patch.fieldId);
      if (patch.label !== undefined) field.label = patch.label;
      if (patch.required !== undefined) field.required = patch.required;
      if (patch.helpText !== undefined) field.helpText = patch.helpText;
      if (patch.default !== undefined) field.default = patch.default;
      if (patch.options !== undefined) {
        if (field.type !== "select" && field.type !== "multi_select") {
          throw new PatchError(`${field.label} is not a choice field, so it has no options`);
        }
        field.options = patch.options;
      }
      break;
    }

    case "remove_field": {
      const { object, field } = requireField(next, patch.fieldId);
      if (field.system) {
        throw new PatchError(`${field.label} is a built-in field and cannot be removed`);
      }

      const pipeline = next.pipelines.find((p) => p.stageFieldId === field.id);
      if (pipeline) {
        throw new PatchError(
          `${field.label} holds the stages for the ${pipeline.name} pipeline. Remove the pipeline first.`,
        );
      }

      const automation = next.automations.find(
        (a) =>
          (a.trigger.type === "field_changed" && a.trigger.fieldId === field.id) ||
          (a.trigger.type === "date_reached" && a.trigger.fieldId === field.id) ||
          a.conditions.some((c) => c.fieldId === field.id) ||
          a.actions.some((action) => action.type === "set_field" && action.fieldId === field.id),
      );
      if (automation) {
        throw new PatchError(
          `${field.label} is used by the "${automation.name}" automation. Update that automation first.`,
        );
      }

      object.fields = object.fields.filter((f) => f.id !== field.id);
      object.layout.groups = object.layout.groups.map((group) => ({
        ...group,
        fieldIds: group.fieldIds.filter((id) => id !== field.id),
      }));
      if (object.titleFieldId === field.id) object.titleFieldId = undefined;

      for (const view of next.views) {
        view.columns = view.columns.filter((id) => id !== field.id);
        if (view.sort?.fieldId === field.id) view.sort = undefined;
        if (view.groupBy === field.id) view.groupBy = undefined;
        if (view.filters) {
          view.filters.conditions = view.filters.conditions.filter((c) => c.fieldId !== field.id);
          view.filters.groups = view.filters.groups
            .map((group) => ({
              ...group,
              conditions: group.conditions.filter((c) => c.fieldId !== field.id),
            }))
            .filter((group) => group.conditions.length > 0);
        }
      }
      break;
    }

    case "create_relation": {
      if (next.relations.some((r) => r.key === patch.relation.key)) {
        throw new PatchError(`A relation called ${patch.relation.key} already exists`);
      }
      requireObject(next, patch.relation.fromObject);
      requireObject(next, patch.relation.toObject);
      next.relations.push(patch.relation);
      break;
    }

    case "reorder_fields": {
      const object = requireObject(next, patch.objectKey);
      const current = object.fields.map((f) => f.id).sort();
      const proposed = [...patch.fieldIds].sort();
      if (
        current.length !== proposed.length ||
        current.some((id, index) => id !== proposed[index])
      ) {
        throw new PatchError(`Reordering ${object.labelPlural} must list every field exactly once`);
      }
      const byId = new Map(object.fields.map((f) => [f.id, f]));
      object.fields = patch.fieldIds.map((id) => byId.get(id)!);
      break;
    }

    case "create_view": {
      if (next.views.some((v) => v.id === patch.view.id)) {
        throw new PatchError(`View id ${patch.view.id} is already in use`);
      }
      requireObject(next, patch.view.objectKey);
      next.views.push(patch.view);
      break;
    }

    case "update_view": {
      const view = next.views.find((v) => v.id === patch.viewId);
      if (!view) throw new PatchError(`There is no view ${patch.viewId}`);
      if (patch.name !== undefined) view.name = patch.name;
      if (patch.columns !== undefined) view.columns = patch.columns;
      if (patch.filters !== undefined) view.filters = patch.filters ?? undefined;
      if (patch.sort !== undefined) view.sort = patch.sort ?? undefined;
      if (patch.groupBy !== undefined) view.groupBy = patch.groupBy ?? undefined;
      break;
    }

    case "delete_view": {
      if (!next.views.some((v) => v.id === patch.viewId)) {
        throw new PatchError(`There is no view ${patch.viewId}`);
      }
      next.views = next.views.filter((v) => v.id !== patch.viewId);
      break;
    }

    case "create_pipeline": {
      if (next.pipelines.some((p) => p.id === patch.pipeline.id)) {
        throw new PatchError(`Pipeline id ${patch.pipeline.id} is already in use`);
      }
      const { field } = requireField(next, patch.pipeline.stageFieldId);
      if (field.type !== "select") {
        throw new PatchError(`A pipeline's stage field must be a choice field, and ${field.label} is not`);
      }
      next.pipelines.push(patch.pipeline);
      syncStageOptions(next, patch.pipeline.id);
      break;
    }

    case "update_pipeline": {
      const pipeline = next.pipelines.find((p) => p.id === patch.pipelineId);
      if (!pipeline) throw new PatchError(`There is no pipeline ${patch.pipelineId}`);
      if (patch.name !== undefined) pipeline.name = patch.name;

      if (patch.stages) {
        const nextKeys = new Set(patch.stages.map((s) => s.key));
        const removed = pipeline.stages.filter((s) => !nextKeys.has(s.key));
        const migrations = new Map((patch.stageMigrations ?? []).map((m) => [m.from, m.to]));

        for (const stage of removed) {
          const target = migrations.get(stage.key);
          if (!target) {
            throw new PatchError(
              `Removing the ${stage.label} stage needs somewhere for its records to go`,
            );
          }
          if (!nextKeys.has(target)) {
            throw new PatchError(
              `The ${stage.label} stage cannot move records to ${target}, which is not a stage in this pipeline`,
            );
          }
        }
        pipeline.stages = patch.stages;
        syncStageOptions(next, pipeline.id);
      }
      break;
    }

    case "create_automation": {
      if (next.automations.some((a) => a.id === patch.automation.id)) {
        throw new PatchError(`Automation id ${patch.automation.id} is already in use`);
      }
      next.automations.push(patch.automation);
      break;
    }

    case "update_automation": {
      const automation = next.automations.find((a) => a.id === patch.automationId);
      if (!automation) throw new PatchError(`There is no automation ${patch.automationId}`);
      if (patch.name !== undefined) automation.name = patch.name;
      if (patch.trigger !== undefined) automation.trigger = patch.trigger;
      if (patch.conditions !== undefined) automation.conditions = patch.conditions;
      if (patch.actions !== undefined) automation.actions = patch.actions;
      break;
    }

    case "set_automation_enabled": {
      const automation = next.automations.find((a) => a.id === patch.automationId);
      if (!automation) throw new PatchError(`There is no automation ${patch.automationId}`);
      automation.enabled = patch.enabled;
      break;
    }

    case "rollback":
      return structuredClone(patch.config);
  }

  return next;
}

/**
 * Applies a turn's worth of patches as a set. Either the whole set validates
 * and produces one new config, or nothing is applied.
 */
export function applyPatches(config: Config, patches: ConfigPatch[]): Config {
  let next = config;
  for (const patch of patches) next = applyPatch(next, patch);
  return validateConfig(next);
}

export function validateConfig(config: unknown): Config {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw new PatchError(issues);
  }
  return result.data;
}

export function parsePatch(input: unknown): ConfigPatch {
  const result = configPatchSchema.safeParse(input);
  if (!result.success) {
    throw new PatchError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}

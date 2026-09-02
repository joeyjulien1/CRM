import type {
  AutomationAction,
  AutomationConfig,
  AutomationTrigger,
  Config,
  ConfigPatch,
  FieldConfig,
  FieldType,
  FilterCondition,
  FilterTree,
  ObjectKey,
  PipelineStage,
  Renderer,
  SelectOption,
  Sort,
} from "@/lib/config/types";

/**
 * Authoring helpers. They exist so a template reads as a description of a
 * business — "deals carry a close date and a property address" — rather than
 * as a wall of patch literals. Every one of them returns a patch that the same
 * validator the agent's patches go through has to accept.
 */

/** Field ids are derived, not minted, so a template is deterministic. */
export function fieldId(objectKey: ObjectKey, key: string): string {
  return `fld_${objectKey}_${key}`;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[];
  currencyCode?: string;
  helpText?: string;
  relationKey?: string;
  default?: unknown;
}

export function addField(objectKey: ObjectKey, spec: FieldSpec): ConfigPatch {
  const field: FieldConfig = {
    id: fieldId(objectKey, spec.key),
    key: spec.key,
    label: spec.label,
    type: spec.type,
    required: spec.required ?? false,
    system: false,
    ...(spec.options ? { options: spec.options } : {}),
    ...(spec.currencyCode ? { currencyCode: spec.currencyCode } : {}),
    ...(spec.helpText ? { helpText: spec.helpText } : {}),
    ...(spec.relationKey ? { relationKey: spec.relationKey } : {}),
    ...(spec.default !== undefined ? { default: spec.default } : {}),
  };
  return { op: "add_field", objectKey, field };
}

export function addFields(objectKey: ObjectKey, specs: FieldSpec[]): ConfigPatch[] {
  return specs.map((spec) => addField(objectKey, spec));
}

export function options(...pairs: [value: string, label: string][]): SelectOption[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

export interface ViewSpec {
  id: string;
  objectKey: ObjectKey;
  name: string;
  renderer: Renderer;
  columns: string[];
  filters?: FilterTree;
  sort?: Sort;
  groupBy?: string;
  pipelineId?: string;
}

export function createView(spec: ViewSpec): ConfigPatch {
  return {
    op: "create_view",
    view: {
      id: spec.id,
      objectKey: spec.objectKey,
      name: spec.name,
      renderer: spec.renderer,
      columns: spec.columns,
      ...(spec.filters ? { filters: spec.filters } : {}),
      ...(spec.sort ? { sort: spec.sort } : {}),
      ...(spec.groupBy ? { groupBy: spec.groupBy } : {}),
      ...(spec.pipelineId ? { pipelineId: spec.pipelineId } : {}),
    },
  };
}

export function where(...conditions: FilterCondition[]): FilterTree {
  return { join: "and", conditions, groups: [] };
}

/**
 * Re-stages the pipeline every workspace starts with. Records land somewhere
 * explicit — the same rule the agent works under, applied to itself.
 */
export function restagePipeline(
  pipelineId: string,
  name: string,
  stages: PipelineStage[],
  migrations: { from: string; to: string }[],
): ConfigPatch {
  return { op: "update_pipeline", pipelineId, name, stages, stageMigrations: migrations };
}

export function stage(
  key: string,
  label: string,
  extra: { probability?: number; isWon?: boolean; isLost?: boolean } = {},
): PipelineStage {
  return { key, label, ...extra };
}

export interface AutomationSpec {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions?: FilterCondition[];
  actions: AutomationAction[];
  enabled?: boolean;
}

export function createAutomation(spec: AutomationSpec): ConfigPatch {
  const automation: AutomationConfig = {
    id: spec.id,
    name: spec.name,
    enabled: spec.enabled ?? true,
    trigger: spec.trigger,
    conditions: spec.conditions ?? [],
    actions: spec.actions,
  };
  return { op: "create_automation", automation };
}

export function relabel(id: string, label: string): ConfigPatch {
  return { op: "update_field", fieldId: id, label };
}

/**
 * Templates apply to whatever the workspace holds now, so the fields they
 * build on are looked up rather than assumed. A template that cannot find one
 * fails before anything is written, not halfway through.
 */
export function existingFieldId(base: Config, objectKey: ObjectKey, key: string): string {
  const object = base.objects.find((candidate) => candidate.key === objectKey);
  const field = object?.fields.find((candidate) => candidate.key === key);
  if (!field) throw new TemplateError(`This workspace has no ${key} field on ${objectKey}.`);
  return field.id;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

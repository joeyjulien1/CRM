import { z } from "zod";

/**
 * The config schema. Every TypeScript type for config is inferred from here —
 * see lib/config/types.ts. Nothing about config shape is hand-written twice.
 */

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Closed for v1. Adding a type is a four-file change: a FieldRenderer case, a
 * filter predicate, an import coercion, and a form input.
 */
export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "select",
  "multi_select",
  "email",
  "phone",
  "url",
  "relation",
  "user",
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);

export const RENDERERS = ["table", "kanban", "detail"] as const;
export const rendererSchema = z.enum(RENDERERS);

export const OBJECT_KEYS = ["contact", "company", "deal", "activity"] as const;
export const objectKeySchema = z.enum(OBJECT_KEYS);

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "must be lower_snake_case starting with a letter");

const idSchema = z.string().min(1).max(64);

export const selectOptionSchema = z.object({
  value: identifier,
  label: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export const fieldConfigSchema = z
  .object({
    id: idSchema,
    key: identifier,
    label: z.string().min(1).max(80),
    type: fieldTypeSchema,
    required: z.boolean().default(false),
    /** Fields the product depends on. The agent may relabel but not remove. */
    system: z.boolean().default(false),
    options: z.array(selectOptionSchema).optional(),
    default: z.unknown().optional(),
    currencyCode: z.string().length(3).optional(),
    /** For type: relation — which object the other end points at. */
    relationKey: identifier.optional(),
    helpText: z.string().max(200).optional(),
  })
  .superRefine((field, ctx) => {
    const needsOptions = field.type === "select" || field.type === "multi_select";
    if (needsOptions && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field.type} field "${field.label}" needs at least one option`,
        path: ["options"],
      });
    }
    if (!needsOptions && field.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `options are only valid on select and multi_select fields`,
        path: ["options"],
      });
    }
    if (field.type === "relation" && !field.relationKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `relation field "${field.label}" needs a relationKey`,
        path: ["relationKey"],
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Filters — a typed tree, one level of nesting. Never a query string.         */
/* -------------------------------------------------------------------------- */

export const OPERATORS = [
  "is",
  "is_not",
  "contains",
  "not_contains",
  "starts_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in_last_days",
  "in_next_days",
  "is_any_of",
  "has_any_of",
  "has_all_of",
  "is_true",
  "is_false",
  "is_empty",
  "is_not_empty",
] as const;

export const operatorSchema = z.enum(OPERATORS);

/** Which operators a field type may be filtered with. */
export const OPERATORS_BY_TYPE: Record<
  (typeof FIELD_TYPES)[number],
  readonly (typeof OPERATORS)[number][]
> = {
  text: ["is", "is_not", "contains", "not_contains", "starts_with", "is_empty", "is_not_empty"],
  long_text: ["contains", "not_contains", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  currency: ["is", "is_not", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["is", "is_not", "gt", "lt", "between", "in_last_days", "in_next_days", "is_empty", "is_not_empty"],
  datetime: ["is", "is_not", "gt", "lt", "between", "in_last_days", "in_next_days", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false"],
  select: ["is", "is_not", "is_any_of", "is_empty", "is_not_empty"],
  multi_select: ["has_any_of", "has_all_of", "is_empty", "is_not_empty"],
  email: ["is", "is_not", "contains", "starts_with", "is_empty", "is_not_empty"],
  phone: ["is", "is_not", "contains", "is_empty", "is_not_empty"],
  url: ["is", "is_not", "contains", "is_empty", "is_not_empty"],
  relation: ["is", "is_not", "is_any_of", "is_empty", "is_not_empty"],
  user: ["is", "is_not", "is_any_of", "is_empty", "is_not_empty"],
};

export const filterConditionSchema = z.object({
  fieldId: idSchema,
  operator: operatorSchema,
  value: z.unknown().optional(),
});

export const filterGroupSchema = z.object({
  join: z.enum(["and", "or"]),
  conditions: z.array(filterConditionSchema).max(20),
});

export const filterTreeSchema = z.object({
  join: z.enum(["and", "or"]),
  conditions: z.array(filterConditionSchema).max(20).default([]),
  /** The one permitted level of nesting. */
  groups: z.array(filterGroupSchema).max(5).default([]),
});

export const sortSchema = z.object({
  fieldId: idSchema,
  direction: z.enum(["asc", "desc"]),
});

/* -------------------------------------------------------------------------- */
/* Objects, views, pipelines                                                   */
/* -------------------------------------------------------------------------- */

export const layoutGroupSchema = z.object({
  label: z.string().min(1).max(60),
  fieldIds: z.array(idSchema),
});

export const layoutConfigSchema = z.object({
  groups: z.array(layoutGroupSchema).default([]),
});

export const objectConfigSchema = z.object({
  key: objectKeySchema,
  label: z.string().min(1).max(60),
  labelPlural: z.string().min(1).max(60),
  /** Order here is display order. reorder_fields rewrites it. */
  fields: z.array(fieldConfigSchema).max(200),
  layout: layoutConfigSchema.default({ groups: [] }),
  /** Which field to show as the record's title. */
  titleFieldId: idSchema.optional(),
});

export const viewConfigSchema = z.object({
  id: idSchema,
  objectKey: objectKeySchema,
  name: z.string().min(1).max(60),
  renderer: rendererSchema,
  columns: z.array(idSchema).max(60).default([]),
  filters: filterTreeSchema.optional(),
  sort: sortSchema.optional(),
  groupBy: idSchema.optional(),
  /** Required by the kanban renderer — its columns are the pipeline's stages. */
  pipelineId: idSchema.optional(),
});

export const pipelineStageSchema = z.object({
  key: identifier,
  label: z.string().min(1).max(60),
  probability: z.number().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

export const pipelineConfigSchema = z.object({
  id: idSchema,
  objectKey: objectKeySchema,
  name: z.string().min(1).max(60),
  /** The select field whose value a card's column position writes. */
  stageFieldId: idSchema,
  stages: z.array(pipelineStageSchema).min(1).max(20),
});

export const relationConfigSchema = z.object({
  key: identifier,
  fromObject: objectKeySchema,
  toObject: objectKeySchema,
  kind: z.enum(["one_to_many", "many_to_many"]),
  label: z.string().min(1).max(60),
});

/* -------------------------------------------------------------------------- */
/* Automations                                                                 */
/* -------------------------------------------------------------------------- */

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("record_created"), objectKey: objectKeySchema }),
  z.object({ type: z.literal("record_updated"), objectKey: objectKeySchema }),
  z.object({ type: z.literal("field_changed"), objectKey: objectKeySchema, fieldId: idSchema }),
  z.object({
    type: z.literal("date_reached"),
    objectKey: objectKeySchema,
    fieldId: idSchema,
    offsetDays: z.number().int().min(-365).max(365).default(0),
  }),
  z.object({ type: z.literal("form_submitted"), objectKey: objectKeySchema }),
]);

/** send_email and call_webhook leave the building. They confirm separately. */
export const EXTERNAL_EFFECT_ACTIONS = ["send_email", "call_webhook"] as const;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_field"), fieldId: idSchema, value: z.unknown() }),
  z.object({
    type: z.literal("create_record"),
    objectKey: objectKeySchema,
    values: z.record(z.unknown()).default({}),
  }),
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1).max(160),
    dueInDays: z.number().int().min(0).max(365).default(0),
  }),
  z.object({
    type: z.literal("send_email"),
    to: z.string().min(1).max(200),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
  }),
  z.object({
    type: z.literal("call_webhook"),
    url: z.string().url(),
    method: z.enum(["POST", "PUT"]).default("POST"),
    body: z.record(z.unknown()).optional(),
  }),
]);

export const automationConfigSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  trigger: triggerSchema,
  conditions: z.array(filterConditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1).max(10),
});

/* -------------------------------------------------------------------------- */
/* The config                                                                  */
/* -------------------------------------------------------------------------- */

export const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    objects: z.array(objectConfigSchema),
    views: z.array(viewConfigSchema).default([]),
    pipelines: z.array(pipelineConfigSchema).default([]),
    relations: z.array(relationConfigSchema).default([]),
    automations: z.array(automationConfigSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const fieldIds = new Map<string, string>();
    for (const object of config.objects) {
      const keys = new Set<string>();
      for (const field of object.fields) {
        if (fieldIds.has(field.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate field id ${field.id}`,
            path: ["objects"],
          });
        }
        fieldIds.set(field.id, object.key);
        if (keys.has(field.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${object.label} already has a field keyed ${field.key}`,
            path: ["objects"],
          });
        }
        keys.add(field.key);
      }
    }

    const pipelineIds = new Set(config.pipelines.map((p) => p.id));

    for (const view of config.views) {
      for (const columnId of view.columns) {
        if (fieldIds.get(columnId) !== view.objectKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `view "${view.name}" references field ${columnId}, which is not on ${view.objectKey}`,
            path: ["views"],
          });
        }
      }
      if (view.renderer === "kanban") {
        if (!view.pipelineId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `kanban view "${view.name}" needs a pipeline`,
            path: ["views"],
          });
        } else if (!pipelineIds.has(view.pipelineId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `view "${view.name}" references pipeline ${view.pipelineId}, which does not exist`,
            path: ["views"],
          });
        }
      }
    }

    for (const pipeline of config.pipelines) {
      if (fieldIds.get(pipeline.stageFieldId) !== pipeline.objectKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `pipeline "${pipeline.name}" references stage field ${pipeline.stageFieldId}, which is not on ${pipeline.objectKey}`,
          path: ["pipelines"],
        });
      }
      const stageKeys = new Set<string>();
      for (const stage of pipeline.stages) {
        if (stageKeys.has(stage.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `pipeline "${pipeline.name}" has two stages keyed ${stage.key}`,
            path: ["pipelines"],
          });
        }
        stageKeys.add(stage.key);
      }
    }

    const relationKeys = new Set(config.relations.map((r) => r.key));
    for (const object of config.objects) {
      for (const field of object.fields) {
        if (field.type === "relation" && field.relationKey && !relationKeys.has(field.relationKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `field "${field.label}" references relation ${field.relationKey}, which does not exist`,
            path: ["objects"],
          });
        }
        if (field.type !== "boolean" && field.options) {
          const optionValues = new Set<string>();
          for (const option of field.options) {
            if (optionValues.has(option.value)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `field "${field.label}" has two options valued ${option.value}`,
                path: ["objects"],
              });
            }
            optionValues.add(option.value);
          }
        }
      }
    }

    for (const automation of config.automations) {
      const objectKey = automation.trigger.objectKey;
      if (!config.objects.some((o) => o.key === objectKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `automation "${automation.name}" triggers on ${objectKey}, which does not exist`,
          path: ["automations"],
        });
      }
    }
  });

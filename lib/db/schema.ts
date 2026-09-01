import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Config, ConfigPatch } from "@/lib/config/types";

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  canEditConfig: boolean("can_edit_config").notNull().default(false),
  canManageMembers: boolean("can_manage_members").notNull().default(false),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_idx").on(t.tenantId, t.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Configuration — append-only                                                 */
/* -------------------------------------------------------------------------- */

export const configVersions = pgTable(
  "config_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    parentId: uuid("parent_id"),
    config: jsonb("config").$type<Config>().notNull(),
    patch: jsonb("patch").$type<ConfigPatch[]>().notNull(),
    author: text("author").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("config_versions_tenant_version_idx").on(t.tenantId, t.version),
    index("config_versions_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Data — one generic table, see docs/ARCHITECTURE.md                          */
/* -------------------------------------------------------------------------- */

export type RecordData = Record<string, unknown>;

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    data: jsonb("data").$type<RecordData>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("records_tenant_object_updated_idx").on(t.tenantId, t.objectKey, t.updatedAt.desc()),
    index("records_data_gin_idx").using("gin", t.data),
  ],
);

export const recordLinks = pgTable(
  "record_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromId: uuid("from_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    relationKey: text("relation_key").notNull(),
  },
  (t) => [
    index("record_links_from_idx").on(t.tenantId, t.fromId, t.relationKey),
    index("record_links_to_idx").on(t.tenantId, t.toId, t.relationKey),
    uniqueIndex("record_links_unique_idx").on(t.tenantId, t.fromId, t.toId, t.relationKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* Agent metering and failure log — the two things tracked from day one        */
/* -------------------------------------------------------------------------- */

export const agentTurns = pgTable(
  "agent_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    model: text("model").notNull(),
    producedPatch: boolean("produced_patch").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_turns_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

/** Every patch that failed validation, was discarded, or never arrived. */
export const agentFailures = pgTable(
  "agent_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    prompt: text("prompt").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_failures_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const tokenBudgets = pgTable(
  "token_budgets",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    monthlyTokenLimit: integer("monthly_token_limit").notNull().default(2_000_000),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    tokensUsed: integer("tokens_used").notNull().default(0),
  },
);

/* -------------------------------------------------------------------------- */
/* Automations                                                                 */
/* -------------------------------------------------------------------------- */

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationId: text("automation_id").notNull(),
    configVersion: integer("config_version").notNull(),
    depth: integer("depth").notNull().default(0),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("automation_runs_idem_idx").on(t.tenantId, t.idempotencyKey),
    index("automation_runs_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contents: text("contents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_tenant_idx").on(t.tenantId)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    mapping: jsonb("mapping").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("queued"),
    processed: integer("processed").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    total: integer("total").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_jobs_tenant_idx").on(t.tenantId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Email — per-user OAuth, metadata plus a pointer                             */
/* -------------------------------------------------------------------------- */

export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    address: text("address").notNull(),
    /** Encrypted at rest. Never returned to the client. */
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    accessTokenEnc: text("access_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    historyId: text("history_id"),
    storeBodies: boolean("store_bodies").notNull().default(false),
    backfillCursor: text("backfill_cursor"),
    backfillDone: boolean("backfill_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_accounts_unique_idx").on(t.tenantId, t.userId, t.address)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    threadId: text("thread_id"),
    subject: text("subject"),
    fromAddress: text("from_address").notNull(),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    /** Only populated when the user opted in. Otherwise the pointer is enough. */
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_provider_idx").on(t.tenantId, t.accountId, t.providerMessageId),
    index("email_messages_tenant_sent_idx").on(t.tenantId, t.sentAt),
  ],
);

export const emailLinks = pgTable(
  "email_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    matchedBy: text("matched_by").notNull(),
  },
  (t) => [
    uniqueIndex("email_links_unique_idx").on(t.tenantId, t.messageId, t.recordId),
    index("email_links_record_idx").on(t.tenantId, t.recordId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Per-user view preferences — column widths, persisted                        */
/* -------------------------------------------------------------------------- */

export const viewPrefs = pgTable(
  "view_prefs",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewId: text("view_id").notNull(),
    columnWidths: jsonb("column_widths").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId, t.viewId] })],
);

/** Timeline entries that are not emails: notes, field changes, automation runs. */
export const activityEntries = pgTable(
  "activity_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actor: text("actor").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_entries_record_idx").on(t.tenantId, t.recordId, t.createdAt)],
);

/**
 * Every table above that carries tenant_id. The RLS test asserts this list
 * matches what Postgres reports, so a new tenant-scoped table without a policy
 * fails CI rather than leaking.
 */
export const TENANT_SCOPED_TABLES = [
  "activity_entries",
  "agent_failures",
  "agent_turns",
  "automation_runs",
  "config_versions",
  "email_accounts",
  "email_links",
  "email_messages",
  "files",
  "import_jobs",
  "memberships",
  "record_links",
  "records",
  "token_budgets",
  "view_prefs",
] as const;

export const CURRENT_TENANT = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

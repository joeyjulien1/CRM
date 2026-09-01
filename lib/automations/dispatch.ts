import { randomUUID } from "node:crypto";
import { withTenant } from "@/lib/db/client";
import { getCurrentVersion } from "@/lib/config/version";
import { getRecord } from "@/lib/runtime/records";
import { enqueue, QUEUES } from "@/lib/jobs/queue";
import type { AutomationConfig, Config } from "@/lib/config/types";

/** Without a ceiling, two automations that update each other run forever. */
export const MAX_DEPTH = 5;

export interface RecordEvent {
  tenantId: string;
  recordId: string;
  kind: "record_created" | "record_updated" | "form_submitted";
  changedFieldIds: string[];
  configVersion: number;
  /** How many automations deep this event already is. */
  depth?: number;
}

export interface AutomationJob {
  tenantId: string;
  automationId: string;
  recordId: string;
  configVersion: number;
  depth: number;
  idempotencyKey: string;
  trigger: string;
}

/**
 * Matches an event against the tenant's automations and queues one job per
 * match. Matching is cheap and synchronous; running is not, so it happens on a
 * worker.
 */
export async function dispatchRecordEvent(event: RecordEvent): Promise<void> {
  const depth = event.depth ?? 0;
  if (depth > MAX_DEPTH) return;

  const { config, record } = await withTenant(event.tenantId, async (db) => ({
    config: (await getCurrentVersion(db, event.tenantId)).config,
    record: await getRecord(db, event.tenantId, event.recordId),
  }));

  if (!record) return;

  const eventId = randomUUID();

  for (const automation of config.automations) {
    if (!automation.enabled) continue;
    if (!triggerMatches(automation, event, record.objectKey)) continue;

    await enqueue<AutomationJob>(QUEUES.automation, {
      tenantId: event.tenantId,
      automationId: automation.id,
      recordId: event.recordId,
      configVersion: event.configVersion,
      depth,
      // A retried job carries the same key, so its actions do not run twice.
      idempotencyKey: `${automation.id}:${event.recordId}:${eventId}`,
      trigger: automation.trigger.type,
    });
  }
}

function triggerMatches(
  automation: AutomationConfig,
  event: RecordEvent,
  objectKey: string,
): boolean {
  const trigger = automation.trigger;
  if (trigger.objectKey !== objectKey) return false;

  switch (trigger.type) {
    case "record_created":
      return event.kind === "record_created";
    case "record_updated":
      return event.kind === "record_updated";
    case "field_changed":
      return event.kind === "record_updated" && event.changedFieldIds.includes(trigger.fieldId);
    case "form_submitted":
      return event.kind === "form_submitted";
    case "date_reached":
      // Time-based triggers are swept on a schedule, not fired by a write.
      return false;
  }
}

/**
 * The sweep for date_reached triggers. Run it on a schedule; it queues a job
 * for every record whose date has arrived.
 */
export async function dispatchDueDates(tenantId: string): Promise<number> {
  const { config, version } = await withTenant(tenantId, async (db) => {
    const current = await getCurrentVersion(db, tenantId);
    return { config: current.config, version: current.version };
  });

  let queued = 0;
  for (const automation of config.automations) {
    if (!automation.enabled || automation.trigger.type !== "date_reached") continue;
    const trigger = automation.trigger;

    const due = await findDueRecords(tenantId, config, trigger.objectKey, trigger.fieldId, trigger.offsetDays);
    for (const recordId of due) {
      await enqueue<AutomationJob>(QUEUES.automation, {
        tenantId,
        automationId: automation.id,
        recordId,
        configVersion: version,
        depth: 0,
        // One firing per record per day, whatever the sweep's cadence.
        idempotencyKey: `${automation.id}:${recordId}:${new Date().toISOString().slice(0, 10)}`,
        trigger: "date_reached",
      });
      queued++;
    }
  }
  return queued;
}

async function findDueRecords(
  tenantId: string,
  config: Config,
  objectKey: string,
  fieldId: string,
  offsetDays: number,
): Promise<string[]> {
  const { and, eq, isNull, sql } = await import("drizzle-orm");
  const { records } = await import("@/lib/db/schema");

  return withTenant(tenantId, async (db) => {
    const rows = await db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.tenantId, tenantId),
          eq(records.objectKey, objectKey),
          isNull(records.deletedAt),
          sql`(${records.data} ->> ${fieldId})::date + make_interval(days => ${offsetDays}) <= current_date`,
          sql`${records.data} ->> ${fieldId} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`,
        ),
      )
      .limit(1000);

    return rows.map((row) => row.id);
  });
}

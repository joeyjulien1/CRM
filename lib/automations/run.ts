import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/client";
import { activityEntries, automationRuns } from "@/lib/db/schema";
import { getCurrentVersion } from "@/lib/config/version";
import { createRecord, getRecord, updateRecord } from "@/lib/runtime/records";
import type { AutomationAction, AutomationConfig, Config, ObjectKey } from "@/lib/config/types";
import { sendAutomationEmail } from "@/lib/email/send";
import { allConditionsHold } from "./evaluate";
import { dispatchRecordEvent, MAX_DEPTH, type AutomationJob } from "./dispatch";

export interface RunOutcome {
  status: "completed" | "skipped" | "failed" | "depth_exceeded" | "duplicate";
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Runs one automation against one record. Every run is written to
 * automation_runs with its inputs, its outputs, and the config version it ran
 * under — an automation you cannot audit is one you cannot trust with a
 * customer's data.
 */
export async function runAutomation(job: AutomationJob): Promise<RunOutcome> {
  const { config, version } = await withTenant(job.tenantId, async (db) => {
    const current = await getCurrentVersion(db, job.tenantId);
    return { config: current.config, version: current.version };
  });

  // Claiming the idempotency key is what makes a retried job safe: the second
  // attempt finds the row already there and does nothing.
  const claimed = await withTenant(job.tenantId, async (db) => {
    const inserted = await db
      .insert(automationRuns)
      .values({
        tenantId: job.tenantId,
        automationId: job.automationId,
        configVersion: version,
        depth: job.depth,
        status: "running",
        idempotencyKey: job.idempotencyKey,
        input: { recordId: job.recordId, trigger: job.trigger },
      })
      .onConflictDoNothing({ target: [automationRuns.tenantId, automationRuns.idempotencyKey] })
      .returning();
    return inserted[0];
  });

  if (!claimed) return { status: "duplicate" };

  const finish = async (outcome: RunOutcome): Promise<RunOutcome> => {
    await withTenant(job.tenantId, (db) =>
      db
        .update(automationRuns)
        .set({
          status: outcome.status,
          output: outcome.output ?? {},
          error: outcome.error ?? null,
        })
        .where(and(eq(automationRuns.tenantId, job.tenantId), eq(automationRuns.id, claimed.id))),
    );
    return outcome;
  };

  const automation = config.automations.find((candidate) => candidate.id === job.automationId);
  if (!automation || !automation.enabled) return finish({ status: "skipped", error: "No longer active" });

  if (job.depth >= MAX_DEPTH) {
    // A hard stop, surfaced to the tenant rather than swallowed.
    await withTenant(job.tenantId, (db) =>
      db.insert(activityEntries).values({
        tenantId: job.tenantId,
        recordId: job.recordId,
        kind: "automation_error",
        actor: "automation",
        detail: {
          name: automation.name,
          message: `"${automation.name}" stopped after ${MAX_DEPTH} chained automations. Check whether two automations are triggering each other.`,
        },
      }),
    );
    return finish({
      status: "depth_exceeded",
      error: `Stopped after ${MAX_DEPTH} chained automations`,
    });
  }

  const record = await withTenant(job.tenantId, (db) => getRecord(db, job.tenantId, job.recordId));
  if (!record) return finish({ status: "skipped", error: "The record no longer exists" });

  if (!allConditionsHold(config, automation.conditions, record.data)) {
    return finish({ status: "skipped", output: { reason: "conditions not met" } });
  }

  const output: Record<string, unknown> = {};

  try {
    for (const [index, action] of automation.actions.entries()) {
      output[`action_${index}`] = await runAction(action, {
        config,
        automation,
        tenantId: job.tenantId,
        recordId: job.recordId,
        configVersion: version,
        depth: job.depth,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withTenant(job.tenantId, (db) =>
      db.insert(activityEntries).values({
        tenantId: job.tenantId,
        recordId: job.recordId,
        kind: "automation_error",
        actor: "automation",
        detail: { name: automation.name, message },
      }),
    );
    return finish({ status: "failed", output, error: message });
  }

  await withTenant(job.tenantId, (db) =>
    db.insert(activityEntries).values({
      tenantId: job.tenantId,
      recordId: job.recordId,
      kind: "automation",
      actor: "automation",
      detail: { name: automation.name },
    }),
  );

  return finish({ status: "completed", output });
}

interface ActionContext {
  config: Config;
  automation: AutomationConfig;
  tenantId: string;
  recordId: string;
  configVersion: number;
  depth: number;
}

async function runAction(action: AutomationAction, context: ActionContext): Promise<unknown> {
  switch (action.type) {
    case "set_field": {
      const result = await withTenant(context.tenantId, (db) =>
        updateRecord(
          db,
          context.tenantId,
          context.config,
          context.recordId,
          { [action.fieldId]: action.value },
          `automation:${context.automation.name}`,
        ),
      );

      // A write from an automation is an event like any other, one level deeper.
      if (result.changedFieldIds.length > 0) {
        await dispatchRecordEvent({
          tenantId: context.tenantId,
          recordId: context.recordId,
          kind: "record_updated",
          changedFieldIds: result.changedFieldIds,
          configVersion: context.configVersion,
          depth: context.depth + 1,
        });
      }
      return { changed: result.changedFieldIds };
    }

    case "create_record": {
      const created = await withTenant(context.tenantId, (db) =>
        createRecord(
          db,
          context.tenantId,
          context.config,
          action.objectKey,
          action.values,
          `automation:${context.automation.name}`,
        ),
      );

      await dispatchRecordEvent({
        tenantId: context.tenantId,
        recordId: created.id,
        kind: "record_created",
        changedFieldIds: Object.keys(action.values),
        configVersion: context.configVersion,
        depth: context.depth + 1,
      });
      return { created: created.id };
    }

    case "create_task": {
      const activity = context.config.objects.find((object) => object.key === "activity");
      const subjectField = activity?.titleFieldId ?? activity?.fields[0]?.id;
      const dueField = activity?.fields.find((field) => field.type === "datetime")?.id;
      if (!subjectField) throw new Error("This workspace has no activity object to put a task on.");

      const dueAt = new Date(Date.now() + action.dueInDays * 86_400_000).toISOString();
      const created = await withTenant(context.tenantId, (db) =>
        createRecord(
          db,
          context.tenantId,
          context.config,
          "activity" as ObjectKey,
          { [subjectField]: action.title, ...(dueField ? { [dueField]: dueAt } : {}) },
          `automation:${context.automation.name}`,
        ),
      );

      await dispatchRecordEvent({
        tenantId: context.tenantId,
        recordId: created.id,
        kind: "record_created",
        changedFieldIds: [subjectField],
        configVersion: context.configVersion,
        depth: context.depth + 1,
      });
      return { task: created.id };
    }

    case "send_email":
      return sendAutomationEmail(context.tenantId, {
        to: action.to,
        subject: action.subject,
        body: action.body,
      });

    case "call_webhook": {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action.body ?? { recordId: context.recordId }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${action.url} answered ${response.status}`);
        return { status: response.status };
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

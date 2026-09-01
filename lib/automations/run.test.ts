import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { closePool, withTenant } from "@/lib/db/client";
import { activityEntries, automationRuns } from "@/lib/db/schema";
import { adminPool, createTenant, dropTenants, seedRecord } from "@/test/helpers";
import { commitPatches, getCurrentVersion } from "@/lib/config/version";
import { getRecord } from "@/lib/runtime/records";
import { MAX_DEPTH, type AutomationJob } from "./dispatch";
import { runAutomation } from "./run";

describe("automations", () => {
  let pool: Pool;
  let tenantId: string;

  beforeAll(async () => {
    pool = adminPool();
    tenantId = (await createTenant(pool, "Automations")).id;

    await withTenant(tenantId, (db) =>
      commitPatches(
        db,
        tenantId,
        [
          {
            op: "add_field",
            objectKey: "contact",
            field: {
              id: "fld_score",
              key: "score",
              label: "Score",
              type: "number",
              required: false,
              system: false,
            },
          },
          {
            op: "create_automation",
            automation: {
              id: "au_flag",
              name: "Flag hot leads",
              enabled: true,
              trigger: { type: "record_created", objectKey: "contact" },
              conditions: [{ fieldId: "fld_score", operator: "gt", value: 50 }],
              actions: [{ type: "set_field", fieldId: "fld_contact_title", value: "Hot lead" }],
            },
          },
        ],
        "agent",
        "Flag hot leads",
      ),
    );
  });

  afterAll(async () => {
    await dropTenants(pool, [tenantId]);
    await pool.end();
    await closePool();
  });

  const job = (overrides: Partial<AutomationJob> & Pick<AutomationJob, "recordId">): AutomationJob => ({
    tenantId,
    automationId: "au_flag",
    configVersion: 2,
    depth: 0,
    idempotencyKey: randomUUID(),
    trigger: "record_created",
    ...overrides,
  });

  it("runs its actions when the conditions hold", async () => {
    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Hot Lead",
      fld_score: 90,
    });

    const outcome = await runAutomation(job({ recordId }));
    expect(outcome.status).toBe("completed");

    const record = await withTenant(tenantId, (db) => getRecord(db, tenantId, recordId));
    expect(record?.data.fld_contact_title).toBe("Hot lead");
  });

  it("skips when the conditions do not hold", async () => {
    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Cold Lead",
      fld_score: 5,
    });

    const outcome = await runAutomation(job({ recordId }));
    expect(outcome.status).toBe("skipped");

    const record = await withTenant(tenantId, (db) => getRecord(db, tenantId, recordId));
    expect(record?.data.fld_contact_title).toBeUndefined();
  });

  it("logs every run with the config version it ran under", async () => {
    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Logged Lead",
      fld_score: 80,
    });
    const key = randomUUID();

    await runAutomation(job({ recordId, idempotencyKey: key }));

    const [run] = await withTenant(tenantId, (db) =>
      db
        .select()
        .from(automationRuns)
        .where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.idempotencyKey, key)))
        .limit(1),
    );

    expect(run?.status).toBe("completed");
    expect(run?.configVersion).toBe(2);
    expect(run?.input).toMatchObject({ recordId });
    expect(run?.output).not.toEqual({});
  });

  it("does not run twice for the same idempotency key", async () => {
    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Retried Lead",
      fld_score: 70,
    });
    const key = randomUUID();

    const first = await runAutomation(job({ recordId, idempotencyKey: key }));
    const second = await runAutomation(job({ recordId, idempotencyKey: key }));

    expect(first.status).toBe("completed");
    // A retried job finds the key already claimed and does nothing, which is
    // what stops a retry from sending the same email a second time.
    expect(second.status).toBe("duplicate");

    const runs = await withTenant(tenantId, (db) =>
      db
        .select()
        .from(automationRuns)
        .where(and(eq(automationRuns.tenantId, tenantId), eq(automationRuns.idempotencyKey, key))),
    );
    expect(runs).toHaveLength(1);
  });

  it("stops at the depth limit instead of looping forever", async () => {
    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Looping Lead",
      fld_score: 99,
    });

    const outcome = await runAutomation(job({ recordId, depth: MAX_DEPTH }));
    expect(outcome.status).toBe("depth_exceeded");

    // And the tenant is told, rather than it failing silently.
    const entries = await withTenant(tenantId, (db) =>
      db
        .select()
        .from(activityEntries)
        .where(and(eq(activityEntries.tenantId, tenantId), eq(activityEntries.recordId, recordId))),
    );
    const error = entries.find((entry) => entry.kind === "automation_error");
    expect(String(error?.detail.message)).toMatch(/chained automations/i);
  });

  it("skips an automation that has been turned off", async () => {
    await withTenant(tenantId, (db) =>
      commitPatches(
        db,
        tenantId,
        [{ op: "set_automation_enabled", automationId: "au_flag", enabled: false }],
        "user",
        "Turned off Flag hot leads",
      ),
    );

    const recordId = await seedRecord(pool, tenantId, "contact", {
      fld_contact_name: "Ignored Lead",
      fld_score: 95,
    });

    const outcome = await runAutomation(job({ recordId }));
    expect(outcome.status).toBe("skipped");

    const version = await withTenant(tenantId, (db) => getCurrentVersion(db, tenantId));
    expect(version.config.automations[0]?.enabled).toBe(false);
  });
});

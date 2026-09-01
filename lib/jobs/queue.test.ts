import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { enqueue, getBoss, QUEUES, stopBoss, type TenantJob } from "./queue";

describe("pg-boss", () => {
  afterAll(async () => {
    await stopBoss();
  });

  it("runs a job through Postgres with no other queue service", async () => {
    const boss = await getBoss();
    const tenantId = randomUUID();

    const seen: string[] = [];
    await boss.work<TenantJob>(QUEUES.noop, async (jobs) => {
      for (const job of jobs) seen.push(job.data.tenantId);
    });

    const jobId = await enqueue(QUEUES.noop, { tenantId });
    expect(jobId).toBeTruthy();

    const deadline = Date.now() + 15_000;
    while (!seen.includes(tenantId) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(seen).toContain(tenantId);
  });
});

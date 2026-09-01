import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { closePool, withTenant } from "@/lib/db/client";
import { agentTurns, tokenBudgets } from "@/lib/db/schema";
import { adminPool, createTenant, dropTenants } from "@/test/helpers";
import { assertWithinBudget, BudgetError, getBudget, recordTurn } from "./budget";

describe("the per-tenant token budget", () => {
  let pool: Pool;
  let tenantId: string;

  beforeAll(async () => {
    pool = adminPool();
    tenantId = (await createTenant(pool, "Budget")).id;
  });

  afterAll(async () => {
    await dropTenants(pool, [tenantId]);
    await pool.end();
    await closePool();
  });

  it("creates an allowance the first time a tenant asks for one", async () => {
    const budget = await withTenant(tenantId, (db) => getBudget(db, tenantId));
    expect(budget.limit).toBeGreaterThan(0);
    expect(budget.used).toBe(0);
    expect(budget.exhausted).toBe(false);
  });

  it("counts a turn's tokens against the allowance", async () => {
    await withTenant(tenantId, (db) =>
      recordTurn(db, tenantId, {
        model: "claude-opus-5",
        inputTokens: 1000,
        outputTokens: 500,
        producedPatch: true,
      }),
    );

    const budget = await withTenant(tenantId, (db) => getBudget(db, tenantId));
    expect(budget.used).toBe(1500);
  });

  it("logs what a turn cost, so cost per tenant is knowable from day one", async () => {
    const [turn] = await withTenant(tenantId, (db) =>
      db.select().from(agentTurns).where(eq(agentTurns.tenantId, tenantId)).limit(1),
    );

    expect(turn?.model).toBe("claude-opus-5");
    expect(turn?.producedPatch).toBe(true);
    // 1000 in at $5/Mtok plus 500 out at $25/Mtok is 1.75 cents.
    expect(turn?.costCents).toBe(2);
  });

  it("refuses the turn before the API call once the allowance is spent", async () => {
    await pool.query("update token_budgets set tokens_used = monthly_token_limit where tenant_id = $1", [
      tenantId,
    ]);

    await expect(withTenant(tenantId, (db) => assertWithinBudget(db, tenantId))).rejects.toThrow(
      BudgetError,
    );
  });

  it("starts a fresh allowance in a new period", async () => {
    await pool.query(
      "update token_budgets set period_start = now() - interval '40 days' where tenant_id = $1",
      [tenantId],
    );

    const budget = await withTenant(tenantId, (db) => getBudget(db, tenantId));
    expect(budget.used).toBe(0);
    expect(budget.exhausted).toBe(false);

    const [row] = await withTenant(tenantId, (db) =>
      db.select().from(tokenBudgets).where(eq(tokenBudgets.tenantId, tenantId)).limit(1),
    );
    expect(row?.tokensUsed).toBe(0);
  });
});

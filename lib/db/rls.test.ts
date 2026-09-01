import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { adminPool, createTenant, dropTenants, seedRecord } from "@/test/helpers";
import { closePool, withoutTenant, withTenant } from "./client";
import { records, TENANT_SCOPED_TABLES } from "./schema";

/**
 * Tenant isolation is enforced in the database. These tests read through the
 * application pool with no `where tenant_id = ?` at all — if a row from another
 * tenant comes back, the policy is not doing its job.
 */
describe("tenant isolation", () => {
  let pool: Pool;
  let tenantA: string;
  let tenantB: string;
  let recordA: string;
  let recordB: string;

  beforeAll(async () => {
    pool = adminPool();
    tenantA = (await createTenant(pool, "Tenant A")).id;
    tenantB = (await createTenant(pool, "Tenant B")).id;
    recordA = await seedRecord(pool, tenantA, "contact", { name: "Ada from A" });
    recordB = await seedRecord(pool, tenantB, "contact", { name: "Bo from B" });
  });

  afterAll(async () => {
    await dropTenants(pool, [tenantA, tenantB]);
    await pool.end();
    await closePool();
  });

  it("hides another tenant's rows from an unfiltered query", async () => {
    const rows = await withTenant(tenantA, async (db) => db.select().from(records));

    expect(rows.map((r) => r.id)).toContain(recordA);
    expect(rows.map((r) => r.id)).not.toContain(recordB);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it("hides a row even when asked for it by primary key", async () => {
    const rows = await withTenant(tenantA, async (db) =>
      db.select().from(records).where(sql`${records.id} = ${recordB}`),
    );

    expect(rows).toHaveLength(0);
  });

  it("refuses to update another tenant's row", async () => {
    const updated = await withTenant(tenantA, async (db) =>
      db
        .update(records)
        .set({ data: { name: "overwritten" } })
        .where(sql`${records.id} = ${recordB}`)
        .returning(),
    );

    expect(updated).toHaveLength(0);

    const { rows } = await pool.query<{ data: { name: string } }>(
      "select data from records where id = $1",
      [recordB],
    );
    expect(rows[0]?.data.name).toBe("Bo from B");
  });

  it("refuses to delete another tenant's row", async () => {
    const deleted = await withTenant(tenantA, async (db) =>
      db.delete(records).where(sql`${records.id} = ${recordB}`).returning(),
    );

    expect(deleted).toHaveLength(0);
  });

  it("refuses to write a row stamped with another tenant's id", async () => {
    await expect(
      withTenant(tenantA, async (db) =>
        db.insert(records).values({ tenantId: tenantB, objectKey: "contact", data: {} }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("fails closed when no tenant is set", async () => {
    const rows = await withoutTenant(async (db) => db.select().from(records));
    expect(rows).toHaveLength(0);
  });

  it("does not leak the tenant setting between pooled transactions", async () => {
    // Interleave enough times that a pooled connection is certainly reused.
    for (let i = 0; i < 8; i++) {
      const fromA = await withTenant(tenantA, async (db) => db.select().from(records));
      expect(fromA.every((r) => r.tenantId === tenantA)).toBe(true);

      const fromB = await withTenant(tenantB, async (db) => db.select().from(records));
      expect(fromB.every((r) => r.tenantId === tenantB)).toBe(true);
    }

    // After a scoped transaction the setting is gone, not carried forward.
    const leaked = await withoutTenant(async (db) =>
      db.execute(sql`select current_setting('app.tenant_id', true) as tenant`),
    );
    expect(leaked.rows[0]?.tenant ?? null).toBeFalsy();
  });

  it("rejects a tenant id that is not a uuid", async () => {
    await expect(
      withTenant("'; drop table records; --", async (db) => db.select().from(records)),
    ).rejects.toThrow(/uuid/i);
  });

  /**
   * The isolation tests above must be testing the policy, not an accident of
   * the query builder. Turning the policy off has to make them fail.
   */
  it("leaks once the policy is removed, which is what the tests above catch", async () => {
    await pool.query("alter table records disable row level security");
    try {
      const rows = await withTenant(tenantA, async (db) => db.select().from(records));
      expect(rows.map((r) => r.id)).toContain(recordB);
    } finally {
      await pool.query("alter table records enable row level security");
    }

    const rows = await withTenant(tenantA, async (db) => db.select().from(records));
    expect(rows.map((r) => r.id)).not.toContain(recordB);
  });
});

/**
 * A tenant-scoped table without a policy should fail CI, not ship. This
 * compares what the schema declares against what Postgres actually enforces.
 */
describe("policy coverage", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = adminPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("has row-level security enabled and forced on every tenant-scoped table", async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relname = any($1) and relkind = 'r'`,
      [[...TENANT_SCOPED_TABLES]],
    );

    expect(rows).toHaveLength(TENANT_SCOPED_TABLES.length);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} has RLS disabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} does not force RLS on its owner`).toBe(true);
    }
  });

  it("has an isolation policy on every tenant-scoped table", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_policies where schemaname = 'public' and policyname = 'tenant_isolation'",
    );
    const withPolicy = new Set(rows.map((r) => r.tablename));

    for (const table of TENANT_SCOPED_TABLES) {
      expect(withPolicy.has(table), `${table} has no tenant_isolation policy`).toBe(true);
    }
  });

  it("knows about every table that carries a tenant_id", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'tenant_id'
       order by table_name`,
    );
    const inDatabase = rows.map((r) => r.table_name).filter((name) => name !== "sessions");

    // sessions carries a nullable tenant_id for the active workspace only; it
    // is keyed by an unguessable token and is not tenant-scoped data.
    expect(inDatabase).toEqual([...TENANT_SCOPED_TABLES]);
  });
});

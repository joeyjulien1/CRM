import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createAdminPool } from "@/lib/db/client";

export interface SeededTenant {
  id: string;
  name: string;
}

/**
 * Test fixtures are written through the admin (superuser) pool, which bypasses
 * RLS. Everything under test reads through the application pool, which does not.
 */
export function adminPool(): Pool {
  return createAdminPool();
}

export async function createTenant(pool: Pool, name: string): Promise<SeededTenant> {
  const id = randomUUID();
  await pool.query("insert into tenants (id, name, slug) values ($1, $2, $3)", [
    id,
    name,
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 8)}`,
  ]);
  return { id, name };
}

export async function createUser(pool: Pool, email: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)",
    [id, email, email.split("@")[0], "not-a-real-hash"],
  );
  return id;
}

export async function seedRecord(
  pool: Pool,
  tenantId: string,
  objectKey: string,
  data: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into records (id, tenant_id, object_key, data) values ($1, $2, $3, $4)",
    [id, tenantId, objectKey, JSON.stringify(data)],
  );
  return id;
}

export async function dropTenants(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query("delete from tenants where id = any($1)", [ids]);
}

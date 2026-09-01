import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pool: Pool | undefined;

/** The application pool. Connects as a role without bypassrls. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set for that transaction
 * only. Transaction scope is what makes this safe under a connection pool: a
 * session-scoped setting would leak one tenant's id into the next request that
 * borrowed the same connection.
 *
 * This is the only way tenant-scoped tables should be reached. Do not open raw
 * connections.
 */
export async function withTenant<T>(tenantId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error("withTenant requires a uuid tenant id");

  const client = await getPool().connect();
  try {
    await client.query("begin");
    // Transaction-scoped: the third argument to set_config is `is_local`.
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const db = drizzle(client, { schema });
    const result = await fn(db);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * For the tables that are not tenant-scoped: users, sessions, roles. Anything
 * that touches a tenant-scoped table through this helper will see zero rows,
 * because the policies fail closed when `app.tenant_id` is unset.
 */
export async function withoutTenant<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(drizzle(client, { schema }));
  } finally {
    client.release();
  }
}

/** Escape hatch for migrations and tests. Never import this from app code. */
export function createAdminPool(): Pool {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL is not set");
  return new Pool({ connectionString, max: 4 });
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type { PoolClient };
export { schema };

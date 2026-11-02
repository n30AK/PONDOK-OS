import type { Pool, PoolClient } from "pg";

export type TenantQueryClient = Pick<PoolClient, "query">;
export type TenantDatabase = Pick<Pool, "query"> & Partial<Pick<Pool, "connect">>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Runs every authenticated tenant request on one checked-out connection.
 * SET LOCAL values are transaction-scoped, so pooled connections cannot leak
 * a previous tenant's context to the next request.
 */
export async function withTenantScope<T>(
  pool: TenantDatabase,
  userId: string,
  organizationId: string,
  work: (client: TenantQueryClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId) || !UUID.test(organizationId)) {
    throw new Error("Invalid tenant security context");
  }

  // Query-only test doubles remain supported. Production Pool instances always
  // expose connect(); refusing to silently skip transaction scope is safer.
  if (!pool.connect) {
    throw new Error("Tenant-scoped database transactions require Pool.connect()");
  }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
      [userId, organizationId],
    );
    const result = await work(client);
    await client.query("COMMIT");
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

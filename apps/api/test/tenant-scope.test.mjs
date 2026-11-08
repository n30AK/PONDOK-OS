import test from "node:test";
import assert from "node:assert/strict";
import { withTenantScope } from "../dist/tenant-db.js";
import { loadTenantContext } from "../dist/tenant-access.js";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createPool() {
  const memberships = new Map([
    [`${userA}:${tenantA}`, {
      membership_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      organization_id: tenantA,
      roles: ["institution_owner"],
      permissions: ["academic.students.read"]
    }],
    [`${userB}:${tenantB}`, {
      membership_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      organization_id: tenantB,
      roles: ["institution_admin"],
      permissions: ["academic.students.read"]
    }]
  ]);
  const calls = [];
  const state = { inTransaction: false, role: "", userId: "", organizationId: "", releases: 0 };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN") { state.inTransaction = true; return { rows: [] }; }
      if (sql === "SET LOCAL ROLE pondok_runtime") {
        assert.equal(state.inTransaction, true, "runtime role must be set inside a transaction");
        state.role = "pondok_runtime";
        return { rows: [] };
      }
      if (sql.includes("set_config('app.user_id'")) {
        assert.equal(state.inTransaction, true, "tenant context must be transaction-local");
        state.userId = values[0];
        state.organizationId = values[1];
        return { rows: [] };
      }
      if (sql.includes("FROM core.organization_memberships")) {
        assert.equal(state.role, "pondok_runtime", "membership lookup must run under restricted tenant role");
        assert.equal(state.userId, values[0], "verified user identity must be bound to the query");
        assert.equal(state.organizationId, values[1], "selected organization must be bound to the transaction");
        const membership = memberships.get(`${values[0]}:${values[1]}`);
        return { rows: membership ? [membership] : [] };
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        state.inTransaction = false;
        state.role = "";
        state.userId = "";
        state.organizationId = "";
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in tenant-scope test: ${sql}`);
    },
    release() { state.releases += 1; }
  };
  return { pool: { async query() { throw new Error("unscoped pool query is forbidden"); }, async connect() { return client; } }, calls, state };
}

test("withTenantScope binds user and organization before loading tenant permissions", async () => {
  const { pool, state } = createPool();
  const context = await withTenantScope(pool, userA, tenantA, (client) => loadTenantContext(client, userA, tenantA));
  assert.equal(context?.organizationId, tenantA);
  assert.deepEqual(context?.roles, ["institution_owner"]);
  assert.deepEqual(context?.permissions, ["academic.students.read"]);
  assert.equal(state.inTransaction, false);
  assert.equal(state.role, "");
  assert.equal(state.userId, "");
  assert.equal(state.organizationId, "");
  assert.equal(state.releases, 1);
});

test("a user cannot load another tenant membership by changing the organization identifier", async () => {
  const { pool, state } = createPool();
  const context = await withTenantScope(pool, userA, tenantB, (client) => loadTenantContext(client, userA, tenantB));
  assert.equal(context, null);
  assert.equal(state.inTransaction, false);
  assert.equal(state.releases, 1);
});

test("pooled connection context is cleared before the next tenant request", async () => {
  const { pool, state } = createPool();
  const ownA = await withTenantScope(pool, userA, tenantA, (client) => loadTenantContext(client, userA, tenantA));
  const ownB = await withTenantScope(pool, userB, tenantB, (client) => loadTenantContext(client, userB, tenantB));
  assert.equal(ownA?.organizationId, tenantA);
  assert.equal(ownB?.organizationId, tenantB);
  assert.equal(state.releases, 2);
  assert.equal(state.inTransaction, false);
  assert.equal(state.role, "");
  assert.equal(state.userId, "");
  assert.equal(state.organizationId, "");
});

test("invalid user or organization identifiers are rejected before acquiring a connection", async () => {
  const { pool, state } = createPool();
  await assert.rejects(() => withTenantScope(pool, "not-a-uuid", tenantA, async () => null), /Invalid tenant security context/);
  await assert.rejects(() => withTenantScope(pool, userA, "not-a-uuid", async () => null), /Invalid tenant security context/);
  assert.equal(state.releases, 0);
});

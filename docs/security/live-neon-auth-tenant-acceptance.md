# Live Neon Auth two-tenant acceptance

This is a manual, read-only acceptance test for the **Neon Development** API. It closes a different evidence gap from the disposable-PostgreSQL CI test: two real Neon Auth users, each with active membership in a different Development institution tenant.

## Preconditions

1. Use the Neon Development API endpoint only. The script hard-pins the expected Development hostname and refuses other hosts, including Production.
2. Prepare two real Neon Auth access tokens from two distinct user accounts. Each token must belong to a different user and have an active membership in exactly the intended tenant for this test.
3. Prepare the two Development organization UUIDs. The script verifies they are different.
4. Optional but recommended: identify one existing `academic.programs.code` sentinel in each tenant. These prove positive own-tenant visibility and foreign-sentinel non-disclosure. Do not create sentinel records solely for this test.
5. Tokens must still be valid when the script runs. Keep them in a local secret manager or process environment; never commit them, paste them into chat, or put them in command history.

## Environment

Set these variables in the local shell from a secure secret manager:

- `PONDOK_API_BASE_URL`: `https://br-proud-paper-b312lfxi-pondokapi.compute.c-4.ap-southeast-1.aws.neon.tech/`
- `TENANT_A_BEARER_TOKEN`: Neon Auth access token for user A
- `TENANT_B_BEARER_TOKEN`: Neon Auth access token for user B
- `TENANT_A_ORGANIZATION_ID`: organization UUID for tenant A
- `TENANT_B_ORGANIZATION_ID`: organization UUID for tenant B
- `TENANT_A_SENTINEL_PROGRAM_CODE`: optional existing program code in tenant A
- `TENANT_B_SENTINEL_PROGRAM_CODE`: optional existing program code in tenant B

Run from the repository root:

```powershell
node apps/api/scripts/test-live-tenant-auth-isolation.mjs
```

## Assertions

For both users, the script checks:

- Their own `/v1/tenant/context` returns HTTP 200 and the correct organization.
- The context reports `pondok_runtime` and full protected-table coverage.
- Their own `/v1/modules/programs` endpoint returns HTTP 200.
- If sentinel codes are provided, the user's own sentinel is visible and the other tenant's sentinel is absent.
- Supplying the other tenant's organization header returns HTTP 403 for context and module reads.
- A deliberately invalid module-create request against the other tenant returns HTTP 403 before payload validation. The body is intentionally invalid so the probe cannot create a record if a future authorization regression occurs.

The script does not create, update or delete any records. It does not print tokens or response payloads.

## Evidence and limits

- Preserve the terminal result, timestamp, Development Function deployment number, and tester identity in the internal acceptance record. Do not record bearer tokens.
- A passing result is evidence for two real users, two tenants, tenant context, the programs read path and cross-tenant denial. It is not a substitute for testing every module, relation picker, export, background job, mobile/offline sync or all role combinations.
- Disposable CI still supplies the valid-payload cross-tenant write test using synthetic identities and a disposable database.
- Do not run against Neon Production. Production remains excluded from autonomous development work.

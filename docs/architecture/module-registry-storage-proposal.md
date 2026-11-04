# Module Registry Storage and API Proposal

**Status:** design proposal only — not a database migration and not approved for execution.

## Decision boundary

PR #68 supplies declarative manifest validation and PR #69 supplies a pure approval state machine. Neither creates a persistent registry or executes installation. This proposal defines the next backend boundary without changing Neon.

- No SQL migration is included in `database/migrations/`.
- No database write, role grant, schema change, or deployment is performed by this proposal.
- Production and Development remain unchanged.
- A separate explicit approval is required before converting this design into a migration or applying it to any Neon branch.

## Recommended storage model

Use the existing `platform` control-plane schema rather than a tenant-owned schema. A module request is a platform-governed installation proposal that targets one organization; the target organization ID is mandatory and is not inferred from a browser-supplied header.

### 1. `platform.module_publishers`

Purpose: explicit allowlist of users permitted to submit module packages.

Proposed columns:
- `user_id uuid PRIMARY KEY`
- `status text NOT NULL CHECK (status IN ('active','revoked'))`
- `granted_by uuid NOT NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `revoked_at timestamptz NULL`

Only an active Super Admin can grant or revoke a publisher. A publisher cannot grant themselves access. The API must resolve this grant on the server; client role claims are never authoritative.

### 2. `platform.module_requests`

Purpose: immutable submission snapshot plus current workflow state.

Proposed columns:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id uuid NOT NULL REFERENCES core.organizations(id)`
- `module_id text NOT NULL`
- `module_version text NOT NULL`
- `manifest jsonb NOT NULL`
- `manifest_digest bytea NOT NULL CHECK (octet_length(manifest_digest) = 32)`
- `submitted_by uuid NOT NULL`
- `status text NOT NULL CHECK (status IN ('submitted','approved','rejected','installing','installed','failed','rollback_pending','rolled_back'))`
- `reviewed_by uuid NULL`, `reviewed_at timestamptz NULL`, `review_note text NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
- `idempotency_key text NOT NULL` (scoped to submitter)
- Unique key on `(submitted_by, idempotency_key)`
- Indexes on `(status, created_at)`, `(organization_id, created_at)`, and `(module_id, module_version)`

The API recomputes SHA-256 over canonical JSON (object keys sorted recursively; array order preserved) and stores the 32-byte digest. It rejects a digest supplied by the client. A resubmission creates a new immutable request rather than overwriting a prior manifest snapshot.

### 3. `platform.module_request_events`

Purpose: append-only evidence for every state transition.

Proposed columns:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `request_id uuid NOT NULL REFERENCES platform.module_requests(id)`
- `actor_user_id uuid NOT NULL`
- `action text NOT NULL`
- `from_status text NOT NULL`, `to_status text NOT NULL`
- `note text NULL`
- `correlation_id uuid NOT NULL`
- `occurred_at timestamptz NOT NULL DEFAULT now()`

The runtime role receives INSERT and SELECT only. No UPDATE or DELETE grant is provided. State change and event insert occur in the same transaction. The API must lock the request row (`FOR UPDATE`) before evaluating the transition to prevent concurrent double-approval.

### 4. Optional installed registry (later phase)

A separate `platform.installed_modules` table may be introduced only when a trusted installer exists. It should record the target organization, module ID, exact version, approved request ID, installed manifest digest, installation status, and timestamps. Approval alone must never cause the UI to show a module as installed.

## Authorization and RLS model

- Continue using the dedicated `pondok_platform_runtime NOLOGIN NOBYPASSRLS` role and the existing platform transaction wrapper.
- Check Super Admin authority on the connection before switching to the restricted role, as the current activation endpoints do.
- A separate server-side publisher grant is required for submission. Do not overload tenant roles or trust JWT metadata for this authority.
- RLS policies must distinguish applicant reads from administrator reads. Applicants may read only their own requests; Super Admins may read all requests.
- Only active publishers may insert a new `submitted` request with `submitted_by = app.user_id`. Applicants cannot update status, manifest, digest, reviewer fields, or event history.
- Only Super Admins may approve/reject and request rollback. The submitter cannot approve their own request.
- Only a trusted installer principal may transition to installing/installed/failed/rolled_back. Until an installer identity and service exist, those transitions must remain unavailable through public API routes.
- Verify that the target organization exists and is active before accepting a submission. The organization ID must be bound to the immutable request.
- Add FORCE RLS to every new platform table, explicit grants, and negative tests for cross-user and non-admin access.

The current platform RLS helper `platform.is_active_super_admin()` can support the administrator side. A separate narrowly scoped `platform.is_active_module_publisher()` helper would be needed for publisher submission. Both helpers must use a fixed search path and transaction-local `app.user_id`.

## Proposed API contract

All routes require a verified Neon Auth access token. All responses use `Cache-Control: no-store`.

| Method and route | Authority | Behavior |
|---|---|---|
| `POST /v1/platform/modules/requests` | Active module publisher | Validate manifest, verify target organization, compute digest, create submitted request and first event |
| `GET /v1/platform/modules/requests/mine` | Authenticated user | Return only caller's requests |
| `GET /v1/platform/admin/modules/requests?status=submitted` | Super Admin | Return review queue |
| `GET /v1/platform/admin/modules/requests/:id` | Super Admin / owning applicant | Return manifest snapshot and event history with appropriate field filtering |
| `POST /v1/platform/admin/modules/requests/:id/approve` | Super Admin, not submitter | Lock row, call transition policy, persist status and event |
| `POST /v1/platform/admin/modules/requests/:id/reject` | Super Admin, not submitter | Require reason; persist status and event |
| `POST /v1/platform/admin/modules/requests/:id/rollback` | Super Admin | Require reason; request rollback only; does not execute it |

No install endpoint is proposed for this phase. Installation requires a separate trusted service, signed artifact verification, environment-specific approvals, migration dry-run, backup/restore evidence, health checks, and explicit Production approval.

## Transaction and audit invariants

1. Verify JWT, resolve user ID, then resolve publisher/Super Admin authority from the database.
2. Validate manifest against the shared domain-contract validator.
3. Canonicalize the validated manifest and compute SHA-256 server-side.
4. Begin a restricted platform transaction and lock the request for every transition.
5. Call the existing pure `transitionModuleRequest` policy with a server-derived actor and server timestamp.
6. Update only the workflow state/reviewer fields allowed for that action and append exactly one event.
7. Commit state and event atomically; on any failure roll back both.
8. Use idempotency keys for submissions and transition request IDs to make client retries safe.
9. Return no secret tokens, SQL, environment variables, or internal database errors.

## Required test matrix before a migration is approved

- Valid publisher submission; invalid manifest rejected; digest computed server-side.
- Duplicate idempotency key returns the original request without a duplicate event.
- Applicant cannot read another user's request or mutate status/manifest/digest.
- Non-publisher cannot submit; revoked publisher cannot submit.
- Non-admin cannot list or review the global queue.
- Submitter cannot approve/reject their own request.
- Concurrent approval attempts result in one successful transition and one conflict.
- Rejection and rollback require non-empty reason.
- Event insert failure rolls back the state update.
- Event history cannot be updated or deleted by runtime role.
- Cross-organization target access and inactive organization submission are denied.
- Runtime role is NOLOGIN/NOBYPASSRLS; FORCE RLS and grants are verified.
- CI includes migration dry-run on an isolated disposable database, not a live branch.

## Delivery sequence

1. **This PR:** architecture and storage proposal only.
2. After review and explicit approval: author a numbered Development migration and migration tests; do not apply it yet.
3. After separate explicit approval: apply only to the named Development branch, inspect grants/RLS, and run negative isolation tests.
4. Implement API endpoints and tests against that schema.
5. Implement the Super Admin review inbox and publisher request UI.
6. Implement signed installer pipeline as a separate project slice.
7. Production remains frozen until a distinct written approval and release checklist.

## Current truthful status

Implemented in main: manifest contract validation, module approval transition policy, ecosystem catalog, and platform extension governance documentation.

Not implemented: module publisher grants, persistent module request registry, request API, Super Admin module inbox, runtime module activation, dynamic menus/forms, signed installer, migration execution for third-party modules, or autonomous agents with execution privileges.

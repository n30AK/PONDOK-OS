# Module Registration and Approval Workflow

## Purpose
This document defines the safe lifecycle for installing future PONDOK OS modules. The current implementation in `@pondok-os/domain-contracts` is a pure policy/state-transition layer. It is not a database registry, installer, plugin runtime, or deployment service.

## Request lifecycle
`draft -> submitted -> approved | rejected -> installing -> installed | failed`

An installed or failed request may enter `rollback_pending` only through a Super Administrator action, then a trusted installer/system executor records `rolled_back`.

## Mandatory controls
1. A request binds to an organization, module ID, immutable manifest digest (SHA-256 hex), and audit history.
2. Manifest validation must pass before a request can be submitted to the registry service.
3. Only a Super Administrator may approve or reject a submitted request.
4. The submitter cannot approve their own request, even if they also hold the Super Administrator role.
5. Rejections, installation failures, and rollback requests require a reason.
6. Only a trusted installer/system principal may record installation execution outcomes.
7. Every transition appends an audit event with actor, action, previous state, next state, timestamp, and optional note.
8. The pure transition function rejects invalid transitions and timestamp regression.

## Future server implementation requirements
- Persist requests and audit events transactionally in a tenant-scoped registry.
- Recompute and verify the manifest digest server-side; never trust a client-provided digest.
- Authenticate actors from verified sessions and resolve roles/permissions server-side.
- Use append-only audit records with correlation IDs and idempotency keys.
- Require signed, reviewed migration artifacts. Generate SQL as a proposal only; do not execute generated SQL directly.
- Run static analysis, dependency/license/security checks, tenant/RLS checks, migration dry-runs, backup/restore checks, and smoke tests before an approval can authorize deployment.
- Separate Development, Staging, and Production approvals. Production requires a distinct explicit Super Administrator approval.
- Store rollback artifacts and verify a tested recovery path before release.
- Do not execute arbitrary JavaScript from third-party modules. Menus and forms are declarative and route/permission allowlisted.

## AI agent boundary
Agents may discover module candidates, draft manifests, run validation, produce risk reports, and prepare change proposals. Agents cannot approve their own proposals, grant themselves permissions, run migrations, install modules, alter production, or publish releases. A human Super Administrator remains the approval authority.

## Current implementation boundary
Implemented in this increment: TypeScript transition policy and unit tests.
Not yet implemented: persistence/API endpoints, UI inbox, cryptographic signature verification, role resolution integration, runtime registry, menu renderer, form renderer, migration runner, event broker, module installer, and agent execution infrastructure.

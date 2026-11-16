# Optional Module Provisioning — Architecture & Safety Contract

Status: implementation specification; no provisioning endpoint, agent runtime, database migration, tenant mutation, or deployment is enabled by this document.

## 1. Current verified baseline

- Command Central contains a local manifest catalog (currently version `2026.11.1`) with 25 optional module packages.
- The catalog page can filter packages, show capabilities/prerequisites/eligibility notes, and select an active tenant.
- The current "Siapkan pemeriksaan kelayakan" action only prepares a local UI preview. It does not submit a request, persist an assessment, invoke agents, create entitlements, or install code.
- Publisher module requests and optional pesantren modules are separate workflows. A publisher submission is not automatically a tenant entitlement or an installable package.
- The optional module manifest currently uses `rollout: "catalog_only"`. Do not reinterpret this value as install-ready.

## 2. Target lifecycle

Use an explicit, auditable state machine. All transitions must be server-side and tenant-scoped.

```text
catalog_only
  -> package_proposed
  -> package_review
  -> package_approved
  -> tenant_requested
  -> eligibility_review
  -> needs_information | manual_review | eligible
  -> entitlement_pending
  -> install_plan_review
  -> installation_approved
  -> staging_install
  -> staging_validation
  -> ready_for_tenant_activation
  -> active
  -> update_pending | suspended | uninstall_pending
```

Failure states: `rejected`, `blocked`, `agent_failed`, `installation_failed`, `rollback_required`, and `rolled_back`.

Rules:
- A catalogue entry is descriptive metadata, not executable code.
- A tenant request is not an approval, entitlement, or installation.
- An eligible assessment is not a legal certification; it means only that the configured evidence checklist passed.
- Never skip a state because an AI agent recommends it.
- Every state transition has an actor, timestamp, correlation/idempotency key, reason, policy version, and immutable audit event.
- Retrying the same idempotency key must not create duplicate requests, entitlements, migrations, or installations.

## 3. Multi-agent responsibilities

Agents return schema-validated findings and proposed actions. They do not possess platform administrator credentials and cannot mutate tenant state.

1. **Intake & Requirements Agent** — normalizes the tenant's request, identifies requested capabilities, and preserves source values.
2. **Eligibility & Evidence Agent** — checks structured requirements against submitted evidence metadata; missing, expired, unreadable, or unverified evidence is explicitly reported. Upload presence is never proof of authenticity.
3. **Identity & Duplicate Agent** — detects possible duplicate tenant/module requests using permitted organization-level identifiers. A match is a human-review flag, never an automatic rejection.
4. **Dependency & Compatibility Agent** — resolves required modules, version ranges, conflicts, feature flags, runtime compatibility, and migration ordering.
5. **Regulatory & Privacy Agent** — evaluates a versioned checklist and data classification. It must cite the exact checklist/source version and flag stale or conflicting rules for manual review.
6. **Database Planning Agent** — drafts tenant-scoped migration plans, data impact, backup/restore requirements, and rollback scripts. It cannot run migrations.
7. **Security Agent** — reviews authorization, tenant isolation, secrets, storage access, audit coverage, and threat model.
8. **QA Agent** — produces and runs required tests in an isolated Development/staging tenant; a failed or missing mandatory test blocks progression.
9. **Release Planner Agent** — prepares an immutable artifact, checksum, release notes, install plan, and rollback plan. It cannot approve or deploy.
10. **Independent Synthesis Agent** — consolidates evidence and disagreements. It must preserve uncertainty and return `manual_review` when sources conflict or an agent fails.
11. **Health & Maintenance Agent** — after activation, observes health metrics and proposes remediation/update work; it cannot execute destructive changes.

Each agent run records agent ID/version, model/provider identifier (never credentials), input digest, output schema version, start/end time, token/cost budget, status, and findings. Uploaded content is untrusted input; prompt-injection text must never alter agent policy or tool permissions.

## 4. Human and platform authorization gates

- AKVISIO retains exactly one official company identity and one active platform Super Admin account.
- Institution users request modules using their own verified institution accounts.
- The requester cannot approve their own request.
- The single company Super Admin explicitly approves package publication and the tenant's installation authorization where policy requires it.
- Billing/contract entitlement is verified by trusted server-side records, never by browser state or agent output.
- AI agents cannot create tenants, grant roles, issue activation tokens, publish packages, grant/revoke entitlements, approve requests, execute SQL, or deploy to production.
- Tenant installation is only authorized after package approval, tenant eligibility, entitlement, dependency checks, successful staging validation, backup readiness, and explicit approval.
- Any future production rollout must be a separate, explicitly authorized release workflow. Development and production credentials/targets must be isolated.

## 5. Suggested API contract (not implemented)

All routes require authenticated platform authorization and server-side validation.

- `GET /v1/platform/modules/optional` — return published catalogue entries and compatibility metadata.
- `POST /v1/platform/tenants/:tenantId/module-requests` — create an idempotent tenant request for one or more module IDs.
- `GET /v1/platform/tenants/:tenantId/module-requests/:requestId` — show only that tenant's request and tenant-safe findings.
- `POST /v1/platform/admin/module-requests/:requestId/assess` — enqueue deterministic validation and agent review; no approval side effects.
- `GET /v1/platform/admin/module-requests/:requestId/assessment` — Super Admin-only complete report and evidence references.
- `POST /v1/platform/admin/module-requests/:requestId/decision` — human approve/reject/request-correction decision with reason and audit event.
- `POST /v1/platform/admin/module-requests/:requestId/install-plan` — build an immutable plan only after eligibility and entitlement checks.
- `POST /v1/platform/admin/module-installations/:installationId/approve` — explicit approval gate before staging installation.
- `POST /v1/platform/admin/module-installations/:installationId/rollback` — controlled rollback with reason and audit.

Do not expose internal risk notes, other tenants' documents, agent prompts, or private storage URLs to tenant users.

## 6. Data model proposal (requires separate approval)

Potential resources (names illustrative; do not assume they exist):
- `platform.optional_module_packages`: package ID, semver, manifest digest, artifact digest, publisher, approval state, compatibility and dependencies.
- `platform.tenant_module_requests`: tenant ID, requester, module/version, business justification, request state, idempotency key.
- `platform.module_eligibility_assessments`: request ID, checklist version, deterministic result, aggregate recommendation, timestamps.
- `platform.module_eligibility_findings`: finding code/severity, evidence reference, observed/expected result, remediation.
- `platform.module_agent_runs`: request ID, agent/version, state, schema version, timing, budget and input/output digests.
- `platform.module_entitlements`: tenant ID, module/version, source contract/order, validity, lifecycle state.
- `platform.module_installations`: tenant ID, package digest, plan digest, environment, migration set, install/rollback status.
- `platform.module_lifecycle_events`: append-only transition/audit events.

Tenant foreign keys, RLS policies, API authorization, unique constraints, idempotency, retention, and audit immutability must be designed together. Do not store private evidence blobs in ordinary database rows; store private object keys and checksums with short-lived authorized access.

## 7. Deterministic eligibility before AI

Each package needs a versioned machine-readable checklist, not only free-text `eligibility` descriptions. Checklist items should define:
- stable requirement ID and version;
- applicability predicate (institution type, module, legal form, activity);
- required evidence type and accepted formats;
- issuer/source authority and verification method;
- validity/expiry rules;
- sensitivity classification and retention period;
- blocking vs advisory severity;
- manual verification owner when automated verification is unavailable.

Results must distinguish `pass`, `missing`, `expired`, `unreadable`, `unverified`, `not_applicable`, and `manual_verification_required`. A missing authoritative rule or verification channel fails closed to manual review. Do not request santri health data, blood type, biometrics, or unrelated family data to approve an optional module.

## 8. Package and installation security

- Packages must be immutable, signed or otherwise integrity-verified, and referenced by digest rather than mutable tag alone.
- Validate publisher identity, source/license, dependency lockfile, software bill of materials, vulnerability findings, and release provenance.
- Never execute publisher-supplied code in the Command Central browser or API process.
- Prefer versioned, isolated module services/extensions with a documented capability contract over arbitrary runtime plugin loading.
- Migration plans must be tenant-scoped, forward-tested, reversible where possible, and tested against a disposable Development tenant.
- Require a verified backup/restore point and tested rollback before any schema/data migration.
- Apply least-privilege service identities, per-tenant authorization, rate limits, quotas, and audit logs.
- Sensitive modules (health, safeguarding, finance) require additional privacy/security review and strict role separation.

## 9. Required acceptance tests

1. A tenant user can request only modules for their own tenant.
2. Cross-tenant request, document, assessment, entitlement, and installation reads/writes are denied.
3. The requester cannot approve their own request.
4. A catalogue-only or unapproved package cannot be installed.
5. Missing/expired/unverified evidence produces the correct non-approved state.
6. Duplicate candidates are flagged for human review, not auto-rejected.
7. Agent timeout, malformed output, disagreement, or budget exhaustion fails closed.
8. Agent output cannot mutate lifecycle state, entitlements, roles, tenant data, or deployment targets.
9. No install proceeds without valid entitlement, human authorization, backup readiness, and successful staging tests.
10. Repeated idempotent requests do not duplicate records or side effects.
11. Failed migration triggers a safe stop and tested rollback path.
12. Audit events capture every decision, approval, agent run, install, update, suspension, and rollback.
13. Sensitive evidence is private, minimized, access-logged, and deleted according to retention policy.
14. All automated integration tests target disposable Development resources only; Neon Production remains untouched.

## 10. Implementation sequence

1. Extend manifests with machine-readable package metadata and versioned deterministic checklists.
2. Implement server-side tenant module request APIs and audit/idempotency using an approved schema change.
3. Add secure evidence intake and private storage with malware/type/size checks.
4. Implement deterministic eligibility engine and Super Admin review UI.
5. Add agent orchestration with strict schemas, budgets, timeouts, fail-closed behavior, and no mutation tools.
6. Add package signing/provenance, dependency resolution, SBOM and security review.
7. Build staging-only install planner, backup/restore validation, and rollback executor.
8. Add entitlement integration and explicit human approval gates.
9. Enable one low-risk pilot module for a disposable Development tenant; expand only after end-to-end evidence.

## 11. Non-goals for this phase

This specification does not enable live AI agents, document upload, automatic installation, tenant database changes, entitlement mutation, or production deployment. Database schema/data changes require explicit approval. Neon Production must remain untouched.

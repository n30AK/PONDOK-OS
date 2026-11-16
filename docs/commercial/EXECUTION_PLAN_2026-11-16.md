# PONDOK OS — Commercial Readiness Execution Plan

**Snapshot date:** 2026-11-16  
**Status:** execution control plan; not a release approval or certification  
**Source baseline:** current `main` at merge commit `668c53cd661854745f279632c347673b2e1b175b` (PR #258), following PR #257. PR #258 post-merge PONDOK OS CI #2130 and Release Bundle #202 passed; the documentation-only merge did not trigger a Development Function redeployment.

## 1. Release decision

**Current decision: NO-GO for live institutional operations and commercial release.**

The repository has meaningful foundations, but the verified evidence does not yet support a general commercial claim. In particular, a successful CI run, deployment workflow, health endpoint, menu, demo record, or CRUD screen is not proof of a complete institutional workflow.

Release scope must be earned gate by gate. A limited pilot may only be described after its exact modules, users, deployment mode, data handling and support arrangements pass acceptance. General availability additionally requires capacity, continuity, recovery and support evidence.

## 2. Non-negotiable environment and authority boundaries

1. Neon Production branch `br-late-cherry-b3uqtuvh` is out of scope and must not be read, written, migrated, seeded, reconfigured or deployed by this plan.
2. All technical validation and deployment preparation is confined to the approved Development branch `br-proud-paper-b312lfxi`.
3. No schema, migration, seed-data or live database mutation may occur without separate explicit approval. A broad request to continue development is not permission to bypass this gate.
4. Never place database URLs, JWTs, API keys, encryption key material, signed URLs or personal data in chat, Git, CI logs, screenshots, issue bodies or ordinary telemetry.
5. Institution onboarding must use the authenticated Central Command approval and activation workflow. A requester must not approve their own request. Do not create an extra company Super Admin account as a workaround.
6. AI agents are advisory and task-planning components only. They cannot approve themselves, grant roles, activate tenants, mutate entitlements, run arbitrary SQL/shell, deploy Production or bypass human approvals.
7. Do not claim a feature is complete until the corresponding automated and live acceptance evidence is attached.

## 3. Verified baseline and blockers

| Gate / domain | Evidence currently available | Remaining blocker | Status |
|---|---|---|---|
| G0 — build and Development deployment | On merge commit `d33592b`: PONDOK OS CI #2128, Neon Function Bundle #454, Release Bundle #201 and Development API deployment #107 passed. Deployment #107 directly returned HTTP 200 from `/health/live` (`ok`) and `/health/ready` (`database`, `tenantSecurity`, `platformSecurity` all `ok`); retired bootstrap endpoint returned HTTP 410. | Repeat checks for each later candidate commit; this does not prove tenant isolation or business workflow acceptance | Verified for this commit; ongoing |
| G1 — tenant/security baseline | Read-only Development audit on 2026-11-16: 73/73 tables with `organization_id` have RLS ENABLE + FORCE; all 79 platform tables have RLS ENABLE + FORCE; runtime roles are NOLOGIN/NOBYPASSRLS. Earlier restricted runtime policy coverage was verified at 63/63 tenant and 79/79 platform tables; CI uses synthetic identities and disposable PostgreSQL. | Only one Development organization and one membership exist; live Neon Auth test needs two independent users and two authorized non-production tenants. Rate limits, security logging/abuse monitoring, broader sensitive-read audit and session lifecycle also remain open | Blocked |
| Identity data protection | Health encryption key configured; identity document API is designed to fail closed when its separate key is missing | Provision identity key only through approved secret vault; recoverable encrypted backup; rotation and recovery drill | Blocked |
| Backup / DR | Read-only Development audit on 2026-11-16 found one disabled `DEMO Daily DB Backup` policy and one failed run with `DEMO_SIMULATED_FAILURE`; the run explicitly says no real backup occurred | No working executor, immutable/off-site backup, completed restore test or proven RPO/RTO | Blocked |
| Secure attachments | Coverage blueprint and metadata foundations exist. A read-only Development access/UAT runbook snapshot dated 2026-11-13 records Neon Object Storage as active with private bucket `uploads`. | The bucket observation does not prove API integration, quarantine/scanning, binary versioning, signed download, tenant/platform authorization or backup/restore; verify the current provider configuration before use | Blocked |
| G2 — institution onboarding | Activation request/approval foundations exist | Authorized non-production institution, independent reviewer, owner handover and completed activation acceptance | Blocked |
| G3 — operational workflows | Student, guardian, academic, boarding, finance, inventory, procurement and HR foundations exist | End-to-end role-based UAT and unresolved workflow gaps; scoped-member paths intentionally fail closed in several domains | Blocked |
| G4 — commercial operations | Lead/customer, quote/contract/subscription, invoice/payment and entitlement foundations exist | Complete lifecycle, recurring billing, tax, refunds, reconciliation, entitlement automation, support/SLA and offboarding | Blocked |
| G5 — pilot acceptance | Test harnesses and readiness checklists exist | Real users, signed test evidence, reconciled reports, defect closure and customer acceptance | Blocked |
| G6 — limited commercial release | Commercial readiness baseline exists | Exact package scope, pricing/terms, support, privacy, security and operational sign-off | Blocked |
| G7 — general availability | Cloud-connected architecture foundations exist | Capacity, disaster recovery, sustained operations; native mobile, offline installer and full hybrid sync are not release-ready | Blocked |



## 3A. Read-only Development evidence snapshot (2026-11-16)

The following observations were collected with SELECT-only queries against project `frosty-cherry-92983148`, Development branch `br-proud-paper-b312lfxi`. No writes, migrations, seed operations or Production queries were performed.

| Check | Observed result | Interpretation |
|---|---:|---|
| Organizations | 1 | One demo institution is not sufficient for two-tenant acceptance |
| Organization memberships | 1 | No independent second tenant identity/membership pair is available |
| Student profiles | 5 | Demo records only; not a real institution UAT |
| HR employees | 5 | Demo records only; not a real institution UAT |
| Platform customers | 1 | Demo commercial record only |
| Subscriptions | 1 | Existence does not prove invoice/payment/entitlement lifecycle |
| Module entitlements | 1 | Demo record only; not proof of activation approval or customer acceptance |
| Tables with `organization_id` | 73; all 73 RLS-enabled and FORCE-RLS | Structural RLS coverage only; live API boundary acceptance is still required |
| Platform tables | 79; all 79 RLS-enabled and FORCE-RLS | Structural RLS coverage only; does not replace runtime-role negative tests |
| Runtime roles | `pondok_runtime` and `pondok_platform_runtime` are NOLOGIN and NOBYPASSRLS | Positive role posture; does not alone prove every policy/query path |
| Migration ledger | Latest recorded migration `0039` | Development schema is ahead of the earlier migration snapshot in older documents |
| Backup policies | 1, disabled, named `DEMO Daily DB Backup` | No scheduled backup is enabled |
| Backup runs | 1 failed, `DEMO_SIMULATED_FAILURE` | Run record explicitly states that no real backup was executed; no restore test exists |

The live tenant acceptance harness must not be run by fabricating credentials or bypassing Central Command approval. It remains blocked until the two real test identities and two authorized non-production tenants exist. Similarly, a demo backup row must never be represented as a successful backup.

## 4. Workstreams and ownership model

The following are logical review roles. They do not imply that autonomous model agents or background workers are currently deployed.

### A. Security and identity assurance — P0
- Own tenant boundary, authentication, authorization, membership lifecycle, campus scope, rate limits, abuse detection and sensitive-data access audit.
- Run the live two-tenant Development acceptance harness only after two real test identities and two authorized non-production tenants exist.
- Verify cross-tenant reads/writes, changed tenant headers, membership revocation, role escalation, session expiry and platform-vs-tenant boundaries.
- Keep identity document operations fail-closed until key lifecycle acceptance passes.

Tracking: GitHub issue #252.

### B. Data resilience and continuity — P0
- Inventory every recoverable data class: database, private object binaries, encryption-key recovery material, audit evidence and deployment configuration.
- Define RPO/RTO by service tier and approved retention policy.
- Implement encrypted scheduled backups, immutable/off-site copies, integrity verification, alerting and a restore executor. A private bucket in the same Neon project is not automatically an independent off-site copy or immutable backup; verify failure-domain separation and retention lock before counting it.
- Restore into an isolated target; verify checksums, row counts, relationships, RLS, login and business workflows.
- Conduct repeatable restore drills. A green backup job without a restore drill is not readiness.

Tracking: GitHub issue #253.

### C. Identity encryption and secure attachments — P0
- Review AES-GCM key versioning, missing-key behavior, rotation and disaster recovery.
- Evaluate the existing private Neon Object Storage bucket `uploads` before selecting another provider; verify its current access policy, API capabilities, lifecycle, data location, cost, availability, processor terms and backup/failure-domain separation. A bucket being private is not evidence that the attachment workflow is implemented.
- Use quarantine → signature/MIME validation → malware scan → available lifecycle.
- Enforce API authorization for every metadata and binary operation; signed URLs must be short-lived and never logged.
- Separate tenant and platform scopes. Restrict health, identity, HR/payroll and child-protection categories.
- Include binaries and key recovery in backup/restore.

Tracking: GitHub issue #254.

### D. Core institution workflow and UAT — P0/P1
- Validate PPDB → accepted applicant → student → guardian relation → campus/class → dorm assignment → billing/payment → academic record.
- Validate attendance, assessment, report card, promotion and graduation.
- Validate procurement → approval → purchase order → receiving → stock movement → asset register.
- Validate employee onboarding → attendance/leave → payroll calculation → maker-checker approval → payment evidence.
- Validate role-based screens, errors, audit, exports, retention and support escalation.
- Use synthetic or explicitly authorized pilot data only.

### E. Central Command commercial lifecycle — P1
- Model lead → customer → legal agreement → quote → contract → subscription → invoice → payment → installation → entitlement → support/SLA → renewal/suspension/offboarding.
- Ensure server-authoritative state transitions, idempotency, maker-checker approval, audit and reconciliation.
- Test duplicate payment, webhook retry, refund/reversal, proration, tax, grace period, expiry, suspension and termination.
- Define commercial packages, supported modules, pricing, SLA, support boundaries and Indonesian legal/tax review.
- Never grant entitlement merely because an invoice UI or customer record exists.

Tracking: GitHub issue #255.

### F. QA, red team and release assurance — continuous
- Test each gate independently and run regression after every merge.
- Maintain threat scenarios for tenant escape, role escalation, CSRF/session misuse, malicious upload, replay, duplicate financial events, stale sessions, backup corruption, restore failure and module rollback.
- Separate code-level CI evidence from live Development evidence and customer UAT evidence.
- Produce a signed evidence bundle per release candidate: commit, workflow runs, deployment IDs, test outputs, known limitations, approvals and rollback plan.

### G. AI governance and automation — after P0 controls
- Start with read-only monitoring and recommendations.
- Use explicit task manifests, scoped data access, tool allowlists, sandboxing, budgets, timeouts, idempotency and audit correlation IDs.
- Require independent validation for high-impact recommendations and human approval for all sensitive changes.
- Add a kill switch and safe queue pause.
- Do not allow agents to access raw child health/identity data by default or send it to model providers.

## 5. Required release gates

### G0 — Development reproducibility
- [ ] CI, typecheck, build, migration dry-run and security checks pass for the candidate commit.
- [ ] Development deployment workflow passes and direct health/readiness checks are captured.
- [ ] Production branch and secrets remain untouched.

### G1 — Security baseline
- [ ] Two real Neon Auth test users and two authorized Development tenants pass live own-tenant and cross-tenant denial tests.
- [ ] Role, membership revocation, campus scope and platform/tenant isolation are verified.
- [ ] Rate limiting, security logging, abuse monitoring and sensitive access audit are accepted.
- [ ] Identity encryption key lifecycle and secret recovery are tested.

### G2 — Resilience and privacy
- [ ] Backup executor runs successfully on schedule.
- [ ] Immutable/off-site copy and integrity checks are proven.
- [ ] Restore drill succeeds with measurable RPO/RTO.
- [ ] Private attachment lifecycle, malware quarantine, access audit and binary restore pass.
- [ ] Retention, consent, deletion, legal hold and child-data review are approved.

### G3 — Institution onboarding and core UAT
- [ ] A real pilot institution is verified and authorized.
- [ ] Activation approval and tenant-owner handover are completed by separate authorized actors.
- [ ] Student/guardian/PPDB, academic, boarding, finance, inventory and HR workflows pass agreed role-based tests.
- [ ] Reports reconcile to source records; defects are triaged and closed or explicitly accepted.

### G4 — Commercial operations
- [ ] Product packages, pricing, contract, subscription, invoice/payment and entitlement lifecycle pass end-to-end tests.
- [ ] Refund, reversal, tax, recurring billing, reconciliation, renewal and offboarding are verified.
- [ ] Support, SLA, incident response and customer communication are operational.
- [ ] Legal, privacy, tax and consumer-facing terms are reviewed by qualified personnel.

### G5 — Limited commercial release
- [ ] Exact module and deployment-mode scope is documented; roadmap items are excluded from sales claims.
- [ ] Security, operational, privacy and commercial sign-offs are recorded.
- [ ] Customer pilot acceptance is signed.
- [ ] Rollback, continuity, escalation and support coverage are staffed.

### G6 — General availability
- [ ] Load, capacity, cost, availability and recovery objectives are demonstrated.
- [ ] Sustained operations and incident exercises are complete.
- [ ] Mobile/offline/installer features are included only if separately built, signed and accepted.
- [ ] Production change receives its own explicit authorization and deployment window.

## 6. Scenario test catalogue

| Scenario | Required control / expected outcome |
|---|---|
| Tenant A guesses tenant B record/file ID | Deny at API and database/storage boundary; log redacted event |
| Membership revoked during active session | Sensitive next operation denied; session/token lifecycle follows revocation policy |
| Same payment/webhook delivered repeatedly | One financial effect; subsequent delivery idempotently acknowledged |
| Payment succeeds but callback is delayed | Reconciliation finds provider transaction; no duplicate receipt |
| Posted journal requires correction | Append reversal/correction; never mutate immutable posted history |
| Period is closed | Posting rejected unless controlled reopen approval exists |
| Upload has forged extension or malware | Quarantine/reject; no preview or download before scan pass |
| Signed download URL expires or role is revoked | New authorization denied; URL TTL minimized |
| Two operators edit same record | Version conflict surfaced; no silent overwrite |
| Database/storage outage during workflow | Safe retry, durable operation state, no duplicate business effect |
| Offline device reconnects with stale events | Idempotency and conflict review; no blind last-write-wins for finance/identity |
| Backup exists but key is unavailable | Restore gate fails; alert and recovery procedure invoked |
| AI produces unsafe or unsupported recommendation | Evidence gap surfaced; no state change; human review |
| Optional module migration fails | Stop install; rollback only through tested executor; other modules remain isolated |
| Tenant requests offboarding/deletion | Export, retention/legal hold, access revocation and verified disposition follow policy |

## 7. Evidence standard

Each acceptance item must link to:
- source commit and PR;
- workflow run IDs and results;
- Development deployment identifier and health response;
- redacted request/response or test report;
- actor/role and test scenario;
- expected vs actual result;
- known limitation and remediation owner;
- approval record where required.

Do not store secrets, full personal records, identity numbers, raw documents, JWTs or signed URLs in evidence.

## 8. Current execution queue

1. #252 — live two-tenant Neon Auth acceptance prerequisites and test.
2. #253 — backup executor, immutable copies and restore drill.
3. #254 — identity key lifecycle and private attachments.
4. Core operational UAT and security controls.
5. #255 — Central Command commercial lifecycle.
6. Pilot acceptance, limited commercial release and only then a separately authorized Production release.

## 9. Release statement

As of 2026-11-16, PONDOK OS is in Development / controlled pilot preparation. PR #257 is merged; the merge commit's CI, Function Bundle, Release Bundle and Development API deployment passed, including direct liveness/readiness HTTP checks. These are G0 technical checks only. It is **not yet approved for live institutional operations, limited commercial release or general availability**. The gates above are mandatory. This document creates no schema, database, secret, tenant, entitlement, billing or deployment changes.

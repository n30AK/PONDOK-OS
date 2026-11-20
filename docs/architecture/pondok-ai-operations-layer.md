# PONDOK OS — Multi-Agent AI Operations Layer

Status: governed deterministic foundation with an optional, disabled-by-default Cloudflare Workers AI activation-review pilot.

## Product intent

The institution applicant should only provide the information that only they know. PONDOK OS should generate technical identifiers, validate input, detect likely duplicates, explain the next step, and prepare a review brief. Routine system checks should run without requiring an operator to read raw logs. A system agent may diagnose and propose a bounded remediation, but must not silently take over privileged authority.

## Activation applicant experience

The applicant form should ask only:
- Contact person (pre-filled from the signed-in profile where available).
- Verified account email (read-only).
- Institution name.
- Institution type.

The API generates a normalized institution slug, primary campus code, and primary campus name. Those are internal identifiers, not information that should be demanded from a pesantren user. The server remains authoritative and validates every generated value.

Email verification is inherited from the authenticated account. The form must not make an already-verified user repeat verification. If the account is not verified, show the existing secure verification flow.

## Agent roles

| Agent | Responsibility | Default capability |
|---|---|---|
| Intake & normalization | Validate and normalize institution intake; preserve submitted source values | Deterministic checks |
| Identity & duplicate screening | Compare institution name/slug against active tenants and other requests | Read-only; flag candidates only |
| Regulatory librarian | Identify applicable, versioned checklist and evidence gaps | Read-only; manual verification when source/evidence is missing |
| Security sentinel | Detect account, permission, tenant-boundary and anomaly signals | Read-only; incident proposal |
| Application SRE | Correlate API errors, health checks and deployment regressions | Read-only diagnosis |
| Database guardian | Check migration drift, RLS posture, connection and query health | Read-only; migration proposal only |
| Backup & recovery | Verify backup freshness, checksum, off-site/immutable evidence and restore drills | Read-only; restore requires approval |
| QA & release steward | Run isolated Development tests, assess regression and prepare release evidence | Development-only execution; no production deploy |
| Orchestrator | Combine evidence, preserve disagreements and route to a human gate | No authority to approve or mutate protected records |

## Review recommendation states

- `ready_for_admin_review`: basic deterministic checks pass; this means ready for human review, not approved or legally verified.
- `high_risk_review`: one or more duplicate candidates or material anomalies require human review.
- `needs_correction`: a required intake field or required evidence is missing.
- `manual_verification_required`: legal status, authority, or a regulatory source cannot be established automatically.
- `agent_failed`: a required agent timed out, failed, or returned invalid data. Fail closed.

No numeric confidence score may replace evidence. A possible duplicate is never an automatic rejection.

## Current implementation slice

The current feature branch:
- Simplifies the applicant form by removing manual slug and campus-code entry.
- Generates the slug and default primary-campus identifiers on the API.
- Adds four audited rule-based review workers using existing `platform.agent_runs` records: intake, duplicate/security screening, regulatory checklist warning, and synthesis.
- Allows only an authenticated company Super Admin to trigger a review.
- Exposes the latest report to the Command Central activation queue.
- Adds a scheduled, read-only Development API liveness/readiness monitor every 15 minutes; it opens or updates one incident issue on failure and never attempts repair.
- Does not approve/reject, issue activation tokens, create tenants, grant roles, or change request status.

Important: this slice is deterministic automation, **not an LLM-powered AI runtime**. It does not send personal or institution data to a model provider. The API reports `aiModelEnabled: false` honestly. A model adapter must remain disabled until a provider, model, budget, data-processing terms, redaction tests, and output-schema evaluations are explicitly configured.

## Scheduled system operations

The eventual operations scheduler should enqueue bounded, idempotent checks:
- API liveness/readiness and error-rate trends.
- Tenant/RLS and permission-regression tests against synthetic Development fixtures.
- Backup freshness, off-site copy, checksum and restore evidence.
- Secret/key presence and rotation-expiry metadata (never secret values).
- Storage upload, malware quarantine, signed URL expiry and retention health.
- Dependency/license vulnerability and release drift.
- Queue age, failed jobs, retries and dead-letter alerts.

Core checks must run without an LLM. If the model provider is unavailable, deterministic monitoring and alerting continue.

## Repair policy

Allowed for unattended low-risk automation only after explicit policy and test coverage:
- Re-run an idempotent health check.
- Rebuild a disposable cache.
- Retry a transient non-financial job within a fixed retry budget.
- Pause a failing queue or disable an unhealthy optional feature when a deterministic safety threshold is crossed.

Always require explicit human approval:
- Database/schema/data mutation, tenant membership or role changes.
- Finance, payroll, invoices, payment or entitlement changes.
- Identity/health data processing, encryption-key changes or document access.
- Backup restore, destructive cleanup, production deployment, rollback or cross-tenant operation.
- Any action whose impact, target, or rollback cannot be proven.

All actions require an authenticated actor or service identity, scoped tool allowlist, idempotency key, expiry, audit correlation, redacted evidence, rate/cost limits, and a global kill switch.

## Privacy and prompt-injection boundary

- Never send passwords, session tokens, API keys, raw secrets, santri health data, identity documents, or unrelated guardian information to a model.
- Uploaded files and retrieved web content are untrusted data, not agent instructions.
- Redact and minimize data before any future model call.
- Validate model output against strict schemas; treat unsupported legal/security claims as manual verification.
- Keep tenant data inside its tenant boundary. Command Central receives only consented, minimized operational telemetry.
- Keep model/provider credentials server-side.

## Hosted model pilot — Cloudflare Workers AI (guarded, optional)

The first hosted-model pilot uses Cloudflare Workers AI only:
- Model: `@cf/zai-org/glm-4.7-flash`, documented as available on Workers Free.
- Provider: direct Workers AI OpenAI-compatible Chat Completions endpoint; do not route through third-party AI Gateway providers or prepaid credits.
- Free allocation: 10,000 Neurons/day. Keep the Cloudflare account on Workers Free; do not upgrade to Workers Paid, attach paid AI Gateway credits, or configure any paid fallback. Provider quota exhaustion must return a non-AI result.
- Application guard: maximum 10 model attempts per rolling 24 hours, counted in existing `platform.agent_runs` records under a transaction-scoped advisory lock. Estimated cost is always recorded as zero.
- Enablement requires server-side `PONDOK_AI_ENABLED=true`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_AI_TOKEN`. Without all three, the adapter stays disabled. The token must be narrowly scoped to Workers AI and stored only in the Neon Development Function's secret/environment configuration; never commit it or expose it to the browser.
- Prompt data is allowlisted: institution type, duplicate-candidate count, deterministic recommendation, and finding codes only. Institution name, slug, contact name/email, user IDs, candidate identities, tenant records, documents, and all santri/guardian/financial/health data are excluded.
- Model output is schema-checked and length-limited. It may add observations and manual-check suggestions only; deterministic recommendation remains authoritative. It cannot approve/reject activation, issue tokens, create tenants, grant permissions, execute SQL, or deploy.
- The four deterministic agents continue to run when the model is disabled, unavailable, invalid, or quota-limited. Failed model attempts are recorded with zero estimated cost. No model response is trusted as an instruction.
- Cloudflare documents zero retention for standard Workers AI inference content and no use of that content for model training. Operational metadata may still be retained; review the current Cloudflare terms before production use.

This is an optional pilot, not production authorization. The code is disabled until the required Development secret values are configured. Validate on Development with a synthetic activation request, inspect outbound payload redaction and provider quota behavior, and confirm that no Cloudflare paid plan/credits are enabled. Production must remain untouched.

## Delivery gates

1. Applicant UX and deterministic API review tests pass.
2. Agent run persistence, role boundaries, RLS and audit are tested on Neon Development.
3. Model adapter is configured only after provider and budget approval; evaluate prompt injection, hallucination, privacy leakage, output schema, latency and cost.
4. Scheduled monitor runs in Development with a kill switch and alerting.
5. Safe repair actions pass chaos/failure-injection tests and rollback drills.
6. Human approval and immutable audit are proven for high-impact actions.
7. Production deployment remains a separate, explicitly approved release gate.

No part of this document authorizes Neon Production access, database migration, secret provisioning, or autonomous production repair.

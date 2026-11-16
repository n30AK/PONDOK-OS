# PONDOK OS — AI-Assisted Institution Activation Review

Status: architecture proposal; not yet an enabled production feature.

## Governance invariants
- AKVISIO has exactly one official company identity and one active platform Super Admin account. Do not create a second Super Admin to work around self-review.
- Each pesantren, madrasah, school, foundation, or other institution registers using its own verified user account and email.
- Institution accounts never receive platform Super Admin privileges as a side effect of registration or activation.
- The company Super Admin is the sole authority that approves or rejects an institution activation request.
- A requester cannot approve or reject their own request. The UI must explain this as a self-review restriction, not as a requirement for another reviewer.
- AI agents are advisory processors. They cannot issue activation tokens, create tenants, grant roles, change request status, or override the Super Admin.
- Tenant creation/activation and token issuance remain inside the existing authenticated, transactional, audited approval endpoint.
- Production database must never be used for development or testing. No schema/data change is authorized by this document.

## Proposed review pipeline
1. **Intake & normalization agent** — checks required fields, normalizes names/addresses, identifies missing values, and preserves the original submitted values.
2. **Document completeness agent** — inventories required evidence by institution type and registration route; checks file readability, expiry dates, and whether each requested document is present. It must not claim a document is authentic merely because it is uploaded.
3. **Identity & duplicate-screening agent** — compares institution name, address, registration identifiers, contact details, and existing tenant/request records. It reports possible matches with evidence; it never automatically rejects a possible duplicate.
4. **Regulatory checklist agent** — applies a versioned checklist appropriate to the institution type and route (for example, pesantren vs madrasah vs school vs foundation). Every requirement must point to an approved source, source date/version, and the exact evidence needed. If the rule source is missing, conflicting, or stale, return manual_verification_required.
5. **Risk & anomaly agent** — flags inconsistencies, suspicious reuse, impossible dates, mismatched identifiers, and unusual patterns. It must explain each flag and must not infer wrongdoing from demographic, religious, health, or other sensitive personal data.
6. **Independent synthesis agent** — combines the structured findings, resolves no conflicts by guessing, and emits a recommendation with reasons, evidence references, confidence, and unresolved questions.
7. **Human decision gate** — the single AKVISIO Super Admin reviews the report and supporting evidence, then explicitly approves, rejects, or requests correction.

## Recommendation states
- ready_for_admin_review: deterministic required-field checks pass and no blocking issue remains. This means ready for human review, not approved.
- needs_correction: required fields/evidence are missing or unreadable; return a precise correction list.
- manual_verification_required: identity, legal status, regulatory source, or document authenticity cannot be established automatically.
- high_risk_review: material inconsistency or possible duplicate requires human investigation.
- agent_failed: any mandatory agent failed, timed out, or returned invalid output. Fail closed; do not mark the request ready.

No numeric score may be used as a substitute for evidence or as an automatic approval threshold.

## Evidence and output contract
Each finding should include a stable finding code and severity (info, warning, blocking); field/document reference; observed value and expected requirement; explanation in Indonesian; action required and responsible party; checklist/source identifier and version; agent name/version, run ID, timestamp, and confidence where applicable.

Persist a structured report and immutable audit event. Keep uploaded files in private object storage with short-lived signed access, malware/type/size checks, encryption, and least-privilege access. Never expose private document URLs in browser logs or AI prompts beyond the minimum required.

## Security, privacy, and reliability
- Verify the submitting user's email and bind every request to its authenticated user ID.
- Enforce platform authorization server-side; never trust UI-only role checks.
- Scope all institution data to the request and platform review permission; do not leak one institution's documents or findings to another tenant.
- Minimize personal data. Registration review should not request santri health records, blood type, biometrics, or unrelated family data.
- Redact secrets and unnecessary personal identifiers before model calls. Do not use uploaded documents for model training.
- Treat document text as untrusted input. Prompt injection inside PDFs/images must never change agent instructions or permissions.
- Validate every model response against a strict schema. Unsupported claims become manual_verification_required.
- Apply rate limits, file limits, malware scanning, timeouts, retry budgets, idempotency, and cost ceilings.
- Keep model/provider credentials server-side. If no approved provider configuration exists, the AI layer stays disabled; deterministic validation can still run.
- Store only necessary review outputs and apply a documented retention/deletion schedule.
- Log agent versions, checklist versions, source references, human decisions, and reasons for overrides.

## API and data design (future implementation)
Proposed resources (names are illustrative; do not assume they exist yet):
- platform.activation_review_runs: request ID, run ID, status, checklist version, timestamps, aggregate recommendation, agent versions.
- platform.activation_review_findings: run ID, agent, finding code, severity, evidence reference, explanation, action, confidence.
- platform.activation_documents: request ID, private object key, document type, checksum, MIME type, size, scan status, uploader, retention metadata.
- platform.activation_review_events: append-only lifecycle/audit trail.
- POST /v1/platform/admin/activation-requests/:id/review: Super Admin-triggered or system-triggered idempotent analysis, no approval side effects.
- GET /v1/platform/admin/activation-requests/:id/review: Super Admin-only structured report.
- Institution-facing correction response should expose only that institution's own missing items, never internal risk notes.

All table names, routes, storage policies, and migrations require implementation review and explicit approval before deployment. Do not create schema changes under this proposal alone.

## Current implementation gap
The existing activation request form/API currently captures basic contact, organization, type, slug, and campus fields. The Command Center can list requests and the API already blocks requester self-approval/self-rejection. A full evidence-based AI review cannot be honestly enabled until the registration flow supports required document metadata and secure uploads, the authoritative checklist is curated/versioned, and a server-side model provider is configured. Do not label a request verified or legally compliant based only on the present basic form.

## Acceptance tests before enabling
- One company Super Admin can approve an institution request submitted by a different verified user.
- The same Super Admin cannot approve or reject a request they submitted themselves.
- Institution users cannot access another institution's requests, documents, reports, or internal findings.
- AI output cannot mutate request status, issue tokens, create tenants, or grant roles.
- Missing evidence yields needs_correction; unverifiable evidence yields manual_verification_required.
- Agent timeout/invalid output yields agent_failed and never a positive recommendation.
- Duplicate candidates are flagged for human review, not auto-rejected.
- Every human decision and override is auditable.
- All integration tests use Neon Development only; Production remains untouched.
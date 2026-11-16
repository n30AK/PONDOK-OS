# Optional Module Eligibility Checklist Contract

This change adds local, version-controlled checklist metadata for all 25 optional module catalogue entries and renders it in Command Central. It is a deterministic checklist definition, not a live document-verification service.

## Result states

- `missing`, `expired`, or `unreadable` evidence => `needs_correction`.
- `unverified`, `manual_verification_required`, or `not_applicable` => `manual_verification_required`.
- All declared requirements marked `pass` => `eligible_for_admin_review`.
- Unknown module IDs => `manual_verification_required`.

The result `eligible_for_admin_review` is deliberately not an approval, legal certification, entitlement, or installation authorization.

## Checklist design

Every optional module has stable requirement IDs, evidence descriptions, verification guidance, blocking severity, data sensitivity, and an authority/source category. The authority field names the type of official source to consult; it does not claim that a particular permit is universally required. Applicability and exact requirements must be verified for the institution's legal form, location, activity, and current regulation.

No santri medical records, blood types, safeguarding case details, biometrics, or unrelated family information are requested as evidence for enabling an optional module.

## Current limitations

- Checklist metadata is bundled locally with Command Central.
- The UI labels every item `Belum diperiksa`; it does not collect, upload, store, or verify evidence.
- The evaluator is a pure deterministic helper for supplied evidence statuses. No network request or database write is performed.
- No agent runtime, API endpoint, entitlement mutation, migration, or installer is enabled by this change.
- Do not use this local helper as a substitute for server-side authorization and audit logging.

## Required next work

Secure private evidence intake, server-side checklist evaluation with policy versioning, tenant-scoped request persistence, reviewer dashboard and audit events, then agent orchestration with strict non-mutating tools. Database schema/data changes require explicit approval. Neon Production must remain untouched.

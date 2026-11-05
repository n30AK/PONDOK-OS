# PONDOK OS Client Operations Agent

## Purpose

The client operations agent is the site-local execution component paired with the Central Command control plane. It provides observability, health checks, backup orchestration, incident diagnostics, and controlled maintenance for one enrolled PONDOK OS installation.

This document is an implementation contract. It does not imply that a production-ready connector or remote execution service already exists.

## Deployment modes

- **Cloud-connected:** the site agent sends policy-approved, redacted telemetry to Central Command over outbound TLS. Central Command queues signed tasks; the site agent polls or uses an outbound persistent channel. No inbound public management port is required.
- **Self-hosted:** the same agent runs beside the client's application and database. Backup destinations remain under the client's control or an explicitly contracted storage account.
- **Offline:** the agent continues local health checks, local encrypted backups, and a durable local event queue. It buffers telemetry and task acknowledgements and synchronizes after connectivity returns. Local safety policies remain enforceable without Central Command.

A disconnected client must not become an unsafe client: no cloud connection is required for local backup schedules, local log retention, or local service health checks.

## Agent components

1. **Telemetry collector:** application/API/worker/database/system events; OpenTelemetry-compatible traces and metrics where supported.
2. **Redaction and classification:** allowlist event fields, mask credentials and personal data, cap payload sizes, classify data before transmission.
3. **Local spool:** encrypted, bounded, disk-backed queue with backpressure, sequence numbers, retry limits, and retention limits.
4. **Health scheduler:** heartbeat, API, database, storage, queue, security posture, version compatibility, backup verification, and offline synchronization checks.
5. **Backup executor:** database-native consistent backup, uploads/configuration backup, encryption, checksums, retention, optional immutable/offsite copy, and restore verification.
6. **Task executor:** accepts only signed, scoped, unexpired, idempotent tasks from an allowlisted catalog.
7. **Local policy engine:** enforces client-approved maintenance windows, resource ceilings, backup-before-change requirements, and deny rules even when offline.
8. **Evidence reporter:** signs task results and backup manifests; attaches correlation IDs and references to log/incident records.

## Network and identity

- Outbound-only connectivity by default; no public inbound shell, RDP, SSH, or database port is opened by the agent.
- Each installation receives a distinct, revocable device identity and short-lived credentials. Credentials are stored in the host OS secret store or hardware-backed facility where available.
- Use mutual TLS or equivalent device-bound authentication, certificate rotation, replay protection, nonce/timestamp validation, and strict audience/scope checks.
- Agent packages and task manifests are signed. Verify signatures before install or execution.
- Never accept arbitrary shell commands, SQL text, scripts, URLs, or binary payloads from a model or a Central Command free-text field.
- Task messages are structured, schema-validated, size-limited, time-limited, and bound to one installation.

## Autonomy and approval classes

- **Class 0 — Observe:** collect health, logs, metrics, versions, and diagnostics. Automatic.
- **Class 1 — Reversible low-risk:** retry an idempotent job, rotate a local cache, restart an explicitly allowlisted non-critical worker after health checks. Automatic only when local policy permits.
- **Class 2 — Material change:** apply a patch, change configuration, restart core services, modify schedules, or update a module. Requires a maintenance window, backup verification, compatibility checks, and authorized approval.
- **Class 3 — High impact:** database migration, restore, destructive data operation, credential rotation, production deployment, or security policy change. Requires explicit human approval, pre-change backup, staged execution, and post-change validation. Restore and destructive actions require a second-person approval where configured.

AI agents may diagnose, explain, correlate, draft a remediation plan, and request a structured task. They may not create new executable task types, bypass local policy, approve their own actions, or self-escalate privileges.

## Backup and recovery

- Backup data is written to a client-owned or contractually approved destination; Central Command stores policy and evidence metadata, not raw backup bytes by default.
- Encrypt in transit and at rest. Keys are separate from backup objects and are not stored in the Central Command metadata database.
- Use database-native backup/WAL procedures appropriate to the actual engine. Never copy live database files as a substitute for a consistent database backup.
- Record backup scope, start/end time, size, encryption status, checksum, consistency result, retention expiry, and target reference.
- Verify checksums after upload and periodically. Run restore tests in an isolated environment; never overwrite the live client database during a routine restore test.
- Define RPO/RTO per signed service agreement and client workload. A schedule is not a guarantee until restore tests demonstrate it.

## Incident response lifecycle

Detect -> correlate -> deduplicate -> classify severity -> notify -> diagnose -> propose remediation -> approve if required -> execute -> verify -> close -> include in assurance report.

Evidence includes immutable log references, health-check snapshots, task approvals, agent identity/version, timestamps, before/after checks, and operator identity. Do not store raw secrets or unnecessary personal data in incident evidence.

## Client assurance and maintenance billing

Reports are generated from measured evidence for a defined period. Scores must disclose coverage, data freshness, exclusions, and unknown intervals. Missing telemetry is reported as unknown, never silently treated as healthy.

Billable work must reference an active maintenance agreement and a service event with evidence, service quantity, pricing basis, and approval. Included plan services are not billed twice. AI recommendations or automated monitoring events alone are not billable work. Approved service events can be reconciled into invoice lines and the accounting ledger using idempotent posting and immutable audit records.

## Reliability and security controls

- Tenant/client isolation at every API and database boundary.
- FORCE RLS for platform control-plane records; tenant RLS for client operational data.
- Append-only security, agent execution, backup evidence, and audit history.
- Rate limits, payload limits, schema validation, replay protection, and idempotency.
- Signed releases, SBOM, dependency and vulnerability scanning, staged rollout, canary checks, and rollback plan.
- Circuit breakers and resource quotas to prevent monitoring/AI workloads from harming client operations.
- Alert deduplication, escalation policies, maintenance windows, and suppression with audit.
- Data retention, export, deletion, residency, and incident notification policies contractually defined.
- Periodic restore tests, disaster recovery exercises, access reviews, and penetration testing.

## Service objectives

Each maintenance agreement defines its own service scope, response targets, RPO, RTO, maintenance window, telemetry coverage, and exclusions. Availability and response metrics must be measured from evidence and must not be inferred from a single heartbeat. Central Command must distinguish platform-wide service health from the health of an individual client installation.

## Implementation sequence

1. Ship and validate the schema and RLS policies in disposable PostgreSQL and Development.
2. Implement authenticated ingestion and client enrollment APIs.
3. Implement local agent identity, heartbeat, redaction, and bounded event spool.
4. Implement health checks and incident correlation.
5. Implement signed task manifests and the allowlisted executor.
6. Implement client-side backup and isolated restore verification.
7. Implement assurance reports and the maintenance-to-invoice reconciliation workflow.
8. Pilot with a non-production client installation before general rollout.

No Production database, client server, or live tenant is to be changed without separate authorization and a verified rollback/backup plan.

# PONDOK OS — Optional Module Marketplace & AI Provisioning Governance

Status: local catalogue and Command Central discovery UI implemented; module packages, agent runtime, tenant provisioning, and automated database migrations are not yet released.

## Purpose and boundary

Command Central is the platform control plane and the central catalogue/distribution point for optional pesantren modules. It is not the operational workspace for every pesantren. Core modules (student/guardian master data, academic operations, staff, finance, inventory, procurement, library, CMS, admissions, and other already-installed core capabilities) remain in the tenant workspace.

Optional modules are independently versioned packages. A pesantren can request only the capabilities it operates. The local catalogue manifest is stored in `apps/command-center/src/module-catalog.ts`, so the catalogue is available in Command Central without requiring a database migration or creating sample tenant data.

## Catalogue groups

The local manifest includes these packages:

### Education
- Administrasi Sekolah Formal — Diknas (PAUD/TK, SD, SMP, SMA, SMK)
- Administrasi Madrasah — Kemenag (RA, MI, MTs, MA)
- Pendidikan Diniyah & Muadalah
- Program Tahfidz & Tahsin
- BLK / LPK & Sertifikasi Keterampilan

### Business and productive units
- Koperasi Pesantren
- POS Toko & Minimarket
- Manajemen Kantin
- Katering & Dapur Produksi
- Laundry & Linen Asrama
- Agribisnis & Pertanian
- Peternakan
- Perikanan & Budidaya Air
- Konveksi, Jahit & Seragam
- Percetakan & Penerbitan
- Jasa Digital & Kreatif
- Persewaan Aset & Fasilitas
- Transportasi & Armada
- Inkubasi & Kewirausahaan Santri

### Finance, social services and governance
- BMT / KSPPS
- ZISWAF & Dana Sosial
- Kesehatan Santri, UKS & Klinik
- Perlindungan Santri & Pengaduan Aman
- Administrasi Yayasan & Tata Kelola

Every manifest entry defines a stable ID, category, summary, planned capabilities, prerequisites, eligibility requirements, compliance warning, and rollout state. All entries currently have `catalog_only`; this is deliberately honest and does not imply a runnable package has been released.

## Installation lifecycle

1. **Discover** — institution administrator selects a catalogue package and submits an installation request for its own tenant.
2. **Eligibility review** — deterministic checks verify tenant status, institution type, required legal/operational prerequisites, subscription/contract and module entitlement.
3. **Requirement agent** — clarifies use case, checks the institution's eligibility evidence, and produces a structured gap list.
4. **Dependency agent** — resolves package versions, dependencies, conflicts, platform compatibility, and integration contracts.
5. **Database planner agent** — prepares tenant-scoped schema/data migration plans, estimates impact, backup requirements, rollback and data retention. It cannot execute migrations autonomously.
6. **Security/compliance agent** — checks authorization, RLS/tenant isolation, secret handling, sensitive data, audit events, and versioned official regulatory checklists.
7. **QA agent** — creates and runs unit, integration, isolation, migration, rollback, and regression tests in isolated Development/staging.
8. **Publisher/release gate** — a platform Super Admin approves the signed package/version for distribution. Publisher permission alone does not grant deployment or tenant access.
9. **Provisioning agent** — after package approval, valid tenant request, active entitlement and successful preflight, performs only policy-authorized tenant-scoped installation; emits idempotent audit events and records installed version.
10. **Health agent** — monitors errors, security findings, version drift, backup/restore health and update compatibility; proposes updates and rollback when necessary.

## Authority and automation

- AI agents may inspect, plan, generate code, test, report and perform low-risk operations explicitly allowed by a versioned deployment policy.
- AI agents cannot approve their own package, bypass the platform Super Admin publication gate, fabricate eligibility, issue contracts, grant paid entitlements, or elevate institution users to platform roles.
- Per-tenant installation can become automatic only after the package is approved for distribution, the tenant has requested/authorized it, the entitlement is active, prerequisites pass, and the tenant's deployment policy permits it.
- High-impact schema changes, cross-tenant changes, sensitive-data processing, production deployments, destructive operations, and rollback decisions require explicit authorization and audit evidence.
- All development and tests must target Neon Development only. Neon Production must not be accessed for development or test work.

## Security requirements

- Every installed package declares tenant scope, permissions, data classification, retention, API contracts, dependencies, migration and rollback metadata.
- No dynamic execution of arbitrary publisher SQL or untrusted code. Packages must be signed, reviewed, pinned by immutable version/digest, scanned and tested.
- RLS and server-side authorization are mandatory; UI visibility is never an authorization boundary.
- Migrations are transactional where possible, idempotent, versioned, reversible or accompanied by a tested recovery plan, and never run against another tenant's data.
- Santri health records, child data, safeguarding reports, financial records and credentials receive data minimization and least-privilege controls.
- Documents and package content are untrusted input; prompt injection must not change agent policy or permissions.
- Audit events must identify tenant, package/version, actor/agent, run ID, policy version, approval, result, and rollback reference.

## Current implementation and known gap

Implemented in the Command Center UI:
- Local manifest catalogue and catalogue version.
- Search and category filters.
- Module detail view with capabilities, prerequisites, eligibility and compliance notes.
- Tenant selection and a local preflight-plan preview.
- Multi-agent responsibility and approval-gate explanation.

Not yet implemented:
- Persisted module package registry and signed package repository.
- Institution-facing installation request API.
- Deterministic entitlement/eligibility preflight service.
- Agent runtime, orchestration queue, model/provider configuration and agent run persistence.
- Package signing, CI security scan, artifact registry and release approvals.
- Tenant-scoped migration executor, provisioning, idempotency, rollback and installed-module status API.
- Actual optional module business workspaces and tests.

The UI must not represent a local preflight preview as a saved request or a completed installation. No schema/data migration is introduced by this catalogue change.

## Acceptance criteria before production enablement

- Every catalogue package has a signed manifest, owner, semantic version, dependencies, permission list, data classification, migration plan and rollback plan.
- Tenant requests cannot read or mutate another tenant's request or installation.
- Ineligible tenants and inactive entitlements are blocked server-side.
- A package cannot be installed until the platform publication gate and tenant authorization are satisfied.
- Agent failures, timeouts, conflicting evidence or missing regulatory sources fail closed.
- AI output cannot grant roles, alter billing/entitlements, approve a package, or execute an unapproved migration.
- Isolation tests prove one tenant cannot access another tenant's rows, files, logs, or agent findings.
- Backup/restore and rollback are tested before each package release.
- Production remains untouched until a separate explicit production-release authorization.

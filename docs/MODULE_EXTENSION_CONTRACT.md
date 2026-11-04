# PONDOK OS Module Extension Contract

**Contract version:** 1  
**Status:** Architecture baseline; runtime plugin loader not yet implemented  
**Companion catalog:** apps/web/src/module-catalog.ts  
**Database changes:** none in this change.

## Goals

PONDOK OS must accept future first-party modules without rewriting the core shell, tenant identity, permission system, audit pipeline, master-data ownership, or integration layer. A module is a bounded domain package, not an arbitrary script.

## Manifest shape

A future module package should provide a manifest equivalent to:

~~~ts
type ModuleManifestV1 = {
  manifestVersion: 1;
  moduleId: string;                 // immutable namespace, e.g. pondok:clinic
  version: string;                  // semver
  displayName: string;
  description: string;
  owner: string;                    // accountable product/domain owner
  navigation: Array<{ key: string; label: string; group: string; route: string; order: number; permission: string }>;
  permissions: Array<{ key: string; description: string; scope: 'tenant' | 'campus' | 'record' }>;
  apiContracts: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; requestSchema: string; responseSchema: string; permission: string; idempotent: boolean }>;
  formSchemas: Array<{ key: string; version: number; fields: Array<{ key: string; label: string; type: string; required: boolean; validation: Record<string, unknown>; classification: 'public' | 'internal' | 'confidential' | 'restricted'; retentionPolicy: string; sourceOfTruth?: string }>; workflow: string[]; regulatoryMappings: string[] }>;
  masterDataDependencies: string[];
  masterDataOwned: string[];
  eventsPublished: string[];
  eventsConsumed: string[];
  migrations: Array<{ id: string; checksum: string; minimumSchemaVersion: string; rollbackPlan: string }>;
  integrations: Array<{ adapterId: string; provider: string; contractVersion: string; credentialReference: string }>;
  tests: { unit: string[]; integration: string[]; tenantIsolation: string[]; acceptance: string[] };
};
~~~

## Lifecycle

1. **Proposed:** module owner submits manifest, data classification, regulatory mapping, UI/API contract, threat model and license inventory.
2. **Reviewed:** architecture, security, privacy, legal/domain owner and accessibility review.
3. **Installed in Development:** manifest and migrations are reviewed; DB migrations are not auto-run. Separate explicit Development approval is required.
4. **Configured:** tenant owner enables the module, chooses campuses/programs and assigns permissions.
5. **Tested:** unit, API, browser, tenant isolation, negative authorization, migration, backup/restore and operator UAT.
6. **Released:** immutable version, checksum, changelog, compatibility matrix and rollback plan recorded.
7. **Upgraded/disabled:** preserve data and audit; disabling a module must not silently delete records or block exports required for retention.

## Menu and form registration

- The shell owns navigation and authorization; module manifests only declare menu metadata.
- Routes are internal route identifiers; arbitrary remote URLs and executable remote bundles are forbidden.
- Every action declares permission and scope.
- Form schema version is immutable. Schema evolution uses explicit migration and compatibility logic.
- Requiredness can be law, institution_policy, or conditional; a plain boolean is insufficient for compliance-sensitive forms.
- Sensitive fields must declare classification, purpose, legal basis, retention, masking, export policy and authorized roles.
- Relation pickers must use tenant-scoped API lookup; clients must never submit an arbitrary tenant identifier to bypass scope.
- Field-level authorization is required for restricted subrecords; hiding a field in the UI is not security.

## Master-data governance

- Each canonical entity has one data owner and one canonical write API.
- Modules consume master IDs; they do not create competing copies of the same person, campus, program, employee, supplier or account.
- Cross-domain references use stable UUIDs plus explicit external-code mappings.
- Soft deactivation and effective dates preserve historical meaning.
- Deduplication uses documented match rules and human review; do not merge records automatically based only on names.
- Reference code sets have a source, version, effective date and import checksum.

## API and event contract

Every domain event contains eventId (globally unique idempotency key), tenantId (server-derived scope), aggregateType, aggregateId, eventType, schemaVersion, occurredAt, actorId, correlationId, and a minimal payload with no unnecessary sensitive fields.

Consumers must be idempotent, record offsets/checkpoints, retry safely and expose dead-letter/reconciliation tools. No module may write directly to another domain's tables. Synchronous cross-domain reads use authorized APIs or approved read models.

## Security and privacy gates

- Tenant isolation and RLS remain mandatory.
- Runtime roles stay non-login and non-bypass-RLS.
- Privileged control-plane actions stay separate from tenant runtime actions.
- Secrets are stored outside source code and manifests only reference secret handles.
- Logs redact credentials, personal identifiers, health/safeguarding details and document content.
- File uploads validate MIME, size, extension, checksum, malware scan state and retention.
- Export, bulk access, impersonation, role changes and sensitive record reads are audited.
- No vendor module may transmit tenant data externally without explicit configuration, purpose, data-processing review and a user-authorized connector.

## Migration and release gates

- Migration IDs are globally unique and checksummed.
- Migrations are additive and tenant-safe; destructive changes require a separate approval and a tested backup/restore.
- Never run module migrations against Production as part of a Development release.
- Feature flags default off until tenant configuration and UAT pass.
- Each release includes test evidence, known gaps, rollback steps, schema compatibility and support owner.
- An installed module is not considered operational until the full acceptance suite and real operator UAT pass.

## Initial domain boundaries

Core platform: identity, tenants, campuses, permissions, audit, files, module registry, integration registry.

First-party domains: institution/legal, admissions, student, guardian, academic, boarding/safeguarding, finance/accounting, inventory, procurement, assets, HR/payroll, library, CMS/communications, CRM/alumni/donations, reports/analytics, offline sync.

Future examples that can be added without changing the core contract: clinic/health, counseling, transport, kitchen/catering, canteen, cooperative, entrepreneurship, scholarship, alumni portal, parent portal, facility maintenance, event management and e-learning. Each must undergo the same data/privacy/regulatory review.

## Current implementation boundary

The current branch adds a versioned descriptive catalog, master-data catalog and form guidance UI. It does **not** yet implement a runtime plugin loader, dynamic migration runner, dynamic permission installer, arbitrary custom form builder, event broker, or external government synchronization. Those are later implementation phases and must not be represented as available features.
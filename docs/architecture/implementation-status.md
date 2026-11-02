# Implementation status

This file separates shipped code from roadmap intent. "CI passed" means the repository's automated pipeline passed on its disposable PostgreSQL 18 service; it does not mean a live institution deployment has passed acceptance.

| Area | Current state | Evidence / remaining work |
|---|---|---|
| Monorepo and CI | Implemented | pnpm/Turbo workspace; migration, typecheck, build, container and unit-test jobs |
| Core tenant schema | Foundation implemented | organizations, campuses, memberships, roles, permissions, settings and audit event table |
| Identity | Foundation implemented | Neon Managed Auth JWT verification, active membership lookup and server-side role/permission resolution |
| Academic/student | Partial | student list/create API and first PWA screens; years, terms, programs, classes, attendance and enrollment tables exist; workflows remain |
| Finance/accounting | Schema foundation | chart of accounts, periods, journal entries/lines; balanced posting and immutability triggers; no complete finance UI or posting service |
| Inventory | Schema foundation | item, warehouse and append-only stock movement ledger; no receiving/issue/stock opname workflow |
| HR/payroll | Schema foundation | employee/contract/payroll tables; approval and immutability constraints; no complete attendance or payroll calculation engine |
| Library | Schema foundation | catalog, copies and loan tables; circulation API/UI pending |
| PPDB/admissions | Schema foundation | periods, applications, document metadata and review history; secure object storage and admissions workflows pending |
| CMS | Schema foundation | pages and announcements; authoring/publishing UI pending |
| Boarding | Schema foundation | dormitory, room, bed, assignments, leave and incident tables; workflows/UI pending |
| Procurement/assets/CRM | Schema foundation | supplier, requisition, purchase order, asset, contact, interaction and donor pledge tables |
| Sync | Partial foundation | device registry, pending event inbox, idempotency and checkpoints; no domain event processor, local outbox or conflict UI |
| Web workspace | Initial implementation | Neon Auth sign-in, tenant selector, student listing and creation |
| PWA offline | Shell only | static shell cache; no private data cache or offline mutation queue |
| Cloud-connected containers | Build-verified | Docker API/web targets and Compose; requires external PostgreSQL and matching Neon Auth |
| Local/offline installer | Not implemented | local identity, DB installer, LAN testing and backup automation required |
| Flutter mobile | Not implemented | Android/iOS clients and release signing required |
| Tauri desktop | Not implemented | installer, local services and auto-update required |
| Kiosk | Not implemented | kiosk UX, device registration and hardened browser policy required |
| Commercial Control Center | Not implemented | separate provider plane, billing, license issuance and support CRM required |
| Tenant RLS | Not implemented globally | all tenant schemas need RLS and transaction-scoped tenant context before production |
| Live acceptance | Not completed | no live sign-in-to-API test with a provisioned organization owner and no real institution workflow acceptance |

## Completion criteria

A module is not production-ready until it has:
1. Database schema and forward-only migration.
2. Backend authorization on every read/write operation.
3. UI for the intended user roles.
4. Audit events for sensitive changes.
5. Validation and error handling.
6. Automated unit, integration and end-to-end tests.
7. Backup/restore and operational runbook coverage where relevant.
8. Acceptance evidence from a non-production institution tenant.

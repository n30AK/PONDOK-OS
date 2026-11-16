# Secure Document & Photo Attachments — Coverage Audit and Implementation Blueprint

**Status:** architecture and coverage proposal; not an upload implementation or security certification.  
**Scope:** tenant operational modules and AKVISIO Central Command / platform modules.  
**Database boundary:** no migration or live data change in this change set. Any schema work must target Neon Development only and be reviewed separately; Production is out of scope.

## 1. Executive finding

The current workspace has document-related metadata in several forms, but that is not equivalent to a working private file upload/download lifecycle.

Observed in the current codebase:
- `student-details.photoObjectKey` is a string reference only; no evidence in the inspected workspace of a working upload workflow.
- `student-identity-documents` captures document type, encrypted document number, issuer and dates, but no binary attachment control.
- The Central Command Document Center has `document_registry`, `document_versions`, and `document_access_events` metadata tables; its UI status explicitly says private upload, binary versioning and signed download are not active.
- Security documentation requires private object storage, malware/type/size checks, short-lived signed downloads, retention and access audit before accepting private files.
- `STUDENT_IDENTITY_ENCRYPTION_KEY` is absent in Development. Identity-document number operations must remain fail-closed until an approved key, recoverable backup and rotation/recovery path are in place.

Therefore, do not add a cosmetic file input that stores a browser-local filename or an unverified public URL.

## 2. Recommended shared attachment model

Implement one reusable attachment service, surfaced contextually in each module.

### 2.1 Lifecycle
1. User selects files; client performs convenience checks only.
2. API authenticates the session, resolves the active tenant/platform scope, verifies resource permission and verifies that the parent record belongs to that scope.
3. API creates a pending attachment record and a one-time upload authorization for a private quarantine object key. The browser never receives storage credentials.
4. Browser uploads directly to private object storage using the short-lived authorization.
5. API finalizes upload after checking object existence, actual byte size, checksum and detected file signature/MIME; reject extension/MIME/signature mismatches.
6. File enters quarantine. Malware scanner and format-specific inspection run before status becomes `available`.
7. Downloads are brokered by API after fresh authorization; API emits a short-lived signed URL and immutable access event. No permanent public URL.
8. Replacement creates a new version; do not silently overwrite prior evidence. Deletion is a retention/disposition workflow with legal-hold checks and audit.

### 2.2 Metadata (proposed, not yet migrated)
Each attachment/version should record:
- opaque ID; scope type (`tenant` or `platform`); organization ID when tenant-scoped;
- resource type and parent record ID; attachment purpose/category; display name;
- original filename (sanitized); detected MIME; extension; byte size; SHA-256;
- private storage provider, bucket and opaque object key (never a public URL);
- uploader, uploaded/verified timestamps, scanner engine/version/result;
- status (`pending_upload`, `quarantined`, `scanning`, `available`, `rejected`, `archived`, `disposed`);
- classification, version, superseded attachment, retention class/date and legal hold;
- audit correlation/request ID and optional verification state/actor/time.

Do not put document contents, identity numbers, signed URLs, access tokens or raw storage keys into ordinary logs, analytics, AI prompts or exports.

### 2.3 Security boundaries
- Private buckets only; bucket listing and anonymous access disabled.
- Tenant isolation must be enforced twice: API authorization and storage-key scoping. A guessed ID/object key must not bypass API authorization.
- Central Command platform documents are a separate scope from institution tenant documents. Never allow tenant roles to enumerate or access platform records and vice versa.
- Separate permissions for attachment metadata read, upload, download, verify, archive and dispose; sensitive categories add domain permissions (student identity, health, HR/payroll, donor, legal).
- Signed download expiry target: 60 seconds; upload authorization target: 5 minutes, single object/key, one use where provider supports it.
- Uploads are size-limited, rate-limited, checksum-verified, malware-scanned and quarantined by default.
- Use MIME sniffing/file signatures; do not trust browser `Content-Type`, extension or filename.
- Reject executable/script formats, HTML, SVG, macro-enabled Office files and archives by default. Do not render untrusted PDFs or office files inline in the app.
- Re-encode raster images server-side to remove metadata (including GPS/EXIF) where appropriate; preserve original only if policy requires it and store it privately.
- Encrypt at rest with provider-managed encryption; use application-level envelope encryption for especially sensitive binary categories if threat model and key management support it. Identity-number field encryption remains separate from file encryption.
- Keep access audit append-only. Audit records must not contain file contents, identity numbers or signed URLs.
- Backups must include object versions and matching encryption-key recovery; database-only backups are insufficient.

## 3. File type policy

Allowlist by purpose; the server-detected signature is authoritative.

| Purpose | Allowed types | Initial per-file limit (proposal) |
|---|---|---:|
| Santri/guardian/identity evidence | PDF, JPG/JPEG, PNG, WEBP | 15 MB |
| Student, employee, instructor portrait | JPG/JPEG, PNG, WEBP, BMP | 5 MB |
| Procurement, PO, invoices, receiving evidence | PDF, JPG/JPEG, PNG, WEBP, XLSX, DOCX | 25 MB |
| Asset, maintenance, warranty evidence | PDF, JPG/JPEG, PNG, WEBP, XLSX, DOCX | 25 MB |
| HR contracts, certificates, payroll evidence | PDF, JPG/JPEG, PNG, WEBP | 15 MB |
| CRM/donor/consent evidence | PDF, JPG/JPEG, PNG, WEBP | 15 MB |
| Institution/platform legal documents | PDF, JPG/JPEG, PNG, WEBP, DOCX, XLSX | 25 MB |
| Library/CMS media | JPG/JPEG, PNG, WEBP; PDF for private publications | 15 MB |

BMP is accepted for portrait intake as requested, but should be decoded and normalized to JPEG/PNG/WebP before serving. TIFF/HEIC/AVIF and additional formats should be enabled only after tested decoders/conversion, malware scanning and storage limits exist. Do not allow SVG, HTML, JS, EXE, DLL, MSI, BAT, CMD, PS1, ZIP/RAR/7Z or macro-enabled Office by default.

These limits are proposed defaults, not current enforced limits. They should be tenant-configurable within platform ceilings.

## 4. Coverage audit — tenant modules

| Module/menu | Attachment needs | Classification / permission notes |
|---|---|---|
| Master Data Santri — profile | Santri portrait; optional supporting school/transfer/graduate letters | Confidential; photo access separate from ordinary profile fields |
| Dokumen Identitas Santri (Terbatas) | KK, birth certificate, NISN evidence, passport/other approved identity documents | Restricted; `academic.students.identity.read/write`; never public |
| Student guardians / wali | Authority/guardianship evidence, consent and pickup authorization evidence | Restricted; guardian-authority permission; separate from CRM contact |
| Student health profiles | Referral letters, vaccination/medical evidence only when necessary and lawfully processed | Highly restricted; health permission; no generic exports or AI ingestion |
| PPDB / calon santri | Required admission documents, report cards, certificates, photo, declarations and verification evidence | Restricted; separate applicant-to-student lifecycle and retention |
| Pengajar & Struktur Organisasi | Teacher/educator portrait, diplomas, certificates, educator registration, appointment decree (SK), assignment evidence | Confidential/restricted; HR educator and organization permissions |
| SDM & Payroll | Employee portrait, identity/employment evidence, contracts/addenda, certificates, leave/disciplinary evidence, payslips and tax/BPJS evidence | Restricted; HR permissions; payroll files only for employee and authorized payroll roles |
| Permintaan Pengadaan + Rincian Permintaan | Technical specifications, quotations, comparison sheets, budget approvals and requester attachments | Internal/confidential; procurement request scope and approval separation |
| Pesanan Pembelian + Rincian Pesanan | Approved PO PDF, vendor quotation, contract, purchase terms, amendments | Confidential; procurement order permissions |
| Goods receipt / inventory movement | Delivery order, receiving minutes, discrepancy/return evidence, stocktake and transfer proof | Internal; warehouse/campus scope |
| Assets / asset events | Invoice, proof of acquisition, handover, serial/nameplate photos, transfer, inspection, maintenance work orders, warranty, disposal/loss evidence | Internal/confidential; append-only event evidence |
| Finance & Accounting | Invoice, receipt, transfer proof, tax invoice, bank reconciliation evidence, journal source documents, budget approval | Restricted by finance role; no public file URLs |
| CRM & Relasi — Kontak Wali/Alumni/Donatur | Consent evidence, authorization, correspondence attachment, donor organization/legal evidence | Confidential/restricted; contact consent and purpose limitation |
| Riwayat Komunikasi | Meeting minutes, letters, approved correspondence evidence | Confidential; avoid excessive sensitive notes |
| Komitmen Donasi | Pledge letter, grant agreement, donor restriction, receipt and realization evidence | Restricted; donor and finance separation |
| Akademik / Kesantrian | Certificates, report cards, transfer/clearance letters, approved incident evidence where necessary | Classification follows record; child-protection files require separate vault |
| Asrama / perizinan | Guardian authorization, leave evidence, handover/incident evidence | Restricted; protect child location/safety data |
| Perpustakaan | Acquisition invoice, license/rights evidence, damage/loss report; optional PDF publications | Internal; copyright and access rights |
| CMS / Pengumuman | Approved images and public documents only after editorial/privacy checks | Public publication is a separate explicit action; never expose private source attachment |

## 5. Coverage audit — Central Command / platform modules

The Central Command Document Center is the platform-level document registry and should become the shared platform attachment interface, not a backdoor into tenant files.

| Central Command area | Attachment needs | Scope |
|---|---|---|
| Document Center | Corporate policies, contracts, invoices, proposals, PO, receipts, audit evidence, versioned records | Platform-only |
| Customer / tenant registry | Customer agreement, institution legal/authorization documents, onboarding evidence | Platform-only; tenant-facing copy requires explicit controlled sharing |
| Activation / module orders / approvals | Signed order, approval evidence, module-specific compliance evidence | Platform-only |
| Publisher / optional module catalog | Package manifest, license notices, security assessment, release evidence, screenshots/manuals | Platform-only; validate publisher provenance |
| Support & incidents | Redacted logs, incident evidence, customer-provided screenshots and diagnostic bundles | Platform-only; redact secrets and unrelated tenant data |
| Warranty / repair / maintenance | Warranty terms, claim evidence, repair photos, parts receipts, service reports | Platform-only |
| Company HR / payroll | Employee portraits, contracts, certificates, payroll and tax evidence | Highly restricted platform scope |
| Finance / budgets / expenses | Invoice, receipt, reimbursement proof, approval and reconciliation evidence | Restricted platform scope |
| Assets / asset events | Acquisition, custody, transfer, maintenance and disposal evidence | Platform-only |
| Backup / disaster recovery | Backup manifests, checksums, restore reports, retention and continuity evidence | Platform-only; do not upload raw secrets or unencrypted key material |
| Fleet / installations | Installation acceptance, customer-authorized diagnostic evidence, maintenance reports | Platform-only; sanitize logs |
| Legal / compliance / governance | Corporate legal documents, policies, privacy notices, processor agreements, audit and regulatory evidence | Highly restricted platform scope |
| AI agent review artifacts | Structured reports and redacted references only; source file access requires explicit scoped authorization | AI agents advisory only; no blanket file access |

Optional modules must declare their attachment needs in the module manifest: allowed categories/MIME types, maximum size, classification, required permission codes, retention class, whether verification is required, and whether attachments may be included in exports. Central Command should reject a module manifest that omits this declaration.

## 6. Portrait handling
- Santri, employee, instructor and (where applicable) guardian portraits use a dedicated `portrait` purpose, not generic document upload.
- Accept JPG/JPEG, PNG, WEBP and BMP; enforce image dimensions/pixel-count ceilings and decode safely.
- Normalize to a standard display format, strip EXIF/GPS metadata, generate a thumbnail and retain a private original only where policy requires it.
- Keep object keys opaque; store only an attachment ID/reference in the profile. Never put a public URL in `photoObjectKey`.
- Show a placeholder when no portrait exists; do not use public profile-photo links.
- Portrait changes should retain an auditable prior version and actor/time.

## 7. Verification and retention
Uploading a file is not verification. Each evidence category must define:
- required/optional status by institution type/program and effective policy version;
- who may verify it, verification outcome, reason, timestamp and source;
- expiry/renewal reminders where applicable;
- retention period, legal hold, archive and disposal authority;
- whether the file is required for a workflow transition (e.g. PPDB review, PO receipt, HR onboarding).

## 8. Implementation sequence and release gates

**Phase A — foundation (Development only):**
1. Select and provision a supported private object-storage provider and separate tenant/platform buckets or equivalent enforced namespaces.
2. Configure credentials through the approved secret vault; never commit secrets.
3. Add attachment metadata/version tables with RLS and append-only access events; add no public bucket/policy.
4. Implement API endpoints for authorize-upload, finalize/scan, list metadata, signed-download, version, archive/dispose.
5. Add malware scanning and quarantine worker; block downloads until scan passes.
6. Add role/permission matrix and cross-tenant/platform negative tests.

**Phase B — UI and module integration:**
1. Build one reusable AttachmentPanel with purpose-specific allowlists, progress, retry, preview/download, version and verification state.
2. Integrate profile portraits and identity documents first.
3. Integrate procurement/PO, assets/maintenance, HR/educator and CRM/donor evidence.
4. Add remaining tenant modules and Central Command module-manifest contract.
5. Add end-to-end tests for upload, wrong MIME, oversized file, malware rejection, expired signed URL, revoked permission, cross-tenant ID guessing, versioning and retention.

**Phase C — operational readiness:**
1. Verify encrypted backup of both metadata and binary objects; conduct restore drill with keys.
2. Complete privacy impact assessment and child-data review; approve retention and consent policies.
3. Complete two-tenant and platform-vs-tenant isolation tests.
4. Run browser UAT on Development with synthetic/non-real personal data.
5. Only then mark upload capability available. Production requires a separate explicit release authorization.

## 9. Acceptance criteria
- Upload works from browser to private storage and survives refresh/login on another authorized session.
- Unauthorized users cannot list, preview, download, replace, verify or delete files.
- A user in tenant A cannot access any file or metadata from tenant B by changing IDs or object keys.
- Tenant users cannot access Central Command platform documents; platform staff cannot access tenant evidence without a separately authorized support-sharing workflow.
- Wrong MIME/signature, disallowed extension, oversized file, malware and malformed image/PDF are rejected or quarantined.
- Signed links expire and cannot be reused outside their scope; URLs and credentials never appear in app logs.
- Every view/download/upload/version/verify/archive/disposition action is audited without logging document content.
- Document verification, retention, legal hold, deletion and backup/restore are tested.
- All listed menus and every optional-module manifest use the same tested attachment service, not bespoke insecure upload code.

## 10. Explicit blockers / non-claims
- No confirmed upload provider/credential contract was found in the inspected API/web package and source search. Provider selection and secret provisioning are prerequisites, not assumptions.
- Central Command currently has document metadata tables but its own UI states binary upload and signed download are not active.
- The identity-document encryption key is absent in Development; no real identity data may be used until provisioned and recovery tested.
- No claim is made that malware scanning, object storage, upload, private download, binary versioning or restore is implemented by this blueprint.
- This document does not apply a migration, change any database branch, seed data, alter permissions, or touch Neon Production.

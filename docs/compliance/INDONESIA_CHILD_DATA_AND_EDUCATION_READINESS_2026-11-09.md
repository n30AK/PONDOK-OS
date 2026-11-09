# Indonesia regulatory readiness — child and education data

**Assessment date:** 2026-11-09  
**Scope:** PONDOK OS SaaS, tenant-hosted pesantren operations, student/guardian portal, wall display/kiosk, PPDB, academic, boarding, health, HR, and optional AI features.  
**Status:** **NOT LEGALLY CLEARED FOR COMMERCIAL PRODUCTION.** This is an engineering readiness assessment, not a legal opinion or certification. Obtain Indonesian counsel review for the final controller/processor model, service classification, cross-border transfer, and institution-specific obligations.

## 1. Executive finding

PONDOK OS is not an ordinary back-office app. Its intended use includes children under 18, student records, health data, parent/guardian accounts, learning/boarding activity, and potentially monitoring or location-related workflows. The product must therefore treat child data and health data as high-risk by default.

The legal baseline is not limited to the Personal Data Protection Law (UU 27/2022). The Child Online Protection framework is now supplemented by PP 17/2025 and Permenkomdigi 9/2026. Any child-facing or child-accessible feature needs a documented age/risk assessment, age-appropriate design, parental/guardian consent workflow, high-privacy defaults, reporting channels, and accountable privacy governance.

Do not advertise “compliant with Indonesian law” until legal counsel reviews the operating model and the evidence below is complete.

## 2. Primary legal sources

| Instrument | Relevant scope | Engineering consequence |
|---|---|---|
| UU 27/2022 tentang Pelindungan Data Pribadi | General and specific personal data, data-subject rights, controller/processor duties, DPIA, security, incident notification, DPO criteria and cross-border transfers | Define controller/processor roles per contract; maintain processing records; provide access/correction/withdrawal/restriction/deletion flows; perform DPIA for high-risk processing; implement incident response; assess international transfers |
| PP 17/2025 tentang Tata Kelola Penyelenggaraan Sistem Elektronik dalam Pelindungan Anak (PP TUNAS) | PSE products/services/features specifically designed for, or likely to be used/accessed by, children | Age bands, child risk assessment, parent/guardian consent, high privacy by default, child-appropriate UX, reporting/complaint handling, no precise child geolocation collection or child profiling |
| Permenkomdigi 9/2026 | Technical implementation of PP 17/2025: minimum ages/age bands, age verification, risk self-assessment and profile setting | Build an auditable age/risk assessment per product feature; retain evidence and review after material feature changes; do not assume all features have the same risk profile |
| UU 18/2019 tentang Pesantren and PMA 30/2020 | Pesantren establishment and organization | Institution master data and registration evidence must support the pesantren's actual legal/administrative identity; do not invent a universal one-size-fits-all form |
| PMA 31/2020 tentang Pendidikan Pesantren | Pesantren education forms and pathways, including formal and non-formal models | Academic configuration must distinguish Muadalah, Pendidikan Diniyah Formal, Ma'had Aly, Kitab Kuning study, and integrated models as applicable to each institution |
| Permendikbudristek 31/2022 tentang Satu Data Pendidikan, Kebudayaan, Riset, dan Teknologi | Education data domains and principles: standards, metadata, interoperability, reference/master codes | Diknas/school workflows need versioned data dictionaries, metadata, reference codes and explicit interoperability mapping; this regulation alone is not proof of Dapodik integration |

### Urgent transitional reporting-date review

Permenkomdigi 9/2026 was promulgated on **6 March 2026**. Its closing transitional note requires the self-assessment report referenced in Article 21(1) to be submitted to the Minister through the Director General no later than **three months after promulgation** (nominally 6 June 2026). As of this assessment date (9 November 2026), that date has passed.

This is an urgent legal work item, not a conclusion that PONDOK OS has violated the rule. Indonesian counsel must first determine whether PONDOK OS and/or each institution is within the relevant PSE scope, identify the responsible reporting entity, confirm whether a submission was already made, and advise on corrective steps if it was not. Do not backdate, fabricate or claim a filing. Retain the official submission receipt or a written legal determination that the requirement does not apply.

Official references:
- UU 27/2022: https://peraturan.bpk.go.id/Download/224884/UU%20Nomor%2027%20Tahun%202022.pdf
- PP 17/2025: https://www.peraturan.go.id/files/pp-no-17-tahun-2025.pdf
- Permenkomdigi 9/2026: https://peraturan.bpk.go.id/Details/346040/permenkomdigi-no-9-tahun-2026
- UU 18/2019: https://peraturan.bpk.go.id/Details/122743/uu-no-18-
- PMA 30/2020: https://peraturan.bpk.go.id/Download/243115/PMA_No._30_tahun_2020.pdf
- PMA 31/2020: https://peraturan.bpk.go.id/Download/243127/PMA_No._31_tahun_2020.pdf
- Permendikbudristek 31/2022: https://lldikti3.kemdikbud.go.id/wp-content/uploads/2024/07/Permendikbudristek-No.-31-Tahun-2022-Satu-Data-Pendidikan-Kebudayaan-Riset-dan-Teknologi.pdf

## 3. Binding requirements translated into product controls

### 3.1 Child account, age and guardian consent

- Publish minimum-age and age-band information in clear Indonesian before account activation.
- Classify every child-facing or child-accessible feature by age band and risk profile. Do not apply one global age rule to every feature.
- Implement verified parent/legal-guardian consent before a child is allowed to use features where consent is required. Store who consented, their verified relationship/authority, which child and feature, purpose, notice version, timestamp, method, status, withdrawal and evidence.
- Keep legal guardianship, parent/contact relationship, emergency contact and permission to pick up a santri as separate authority concepts. A phone number or family relationship alone must not grant pickup authority.
- On refusal or withdrawal, suspend the relevant child feature and stop the consent-based processing within the statutory period; apply deletion/retention exceptions only where a documented legal basis requires it.
- Do not create a child account merely because an institution imports a student record. Institutional recordkeeping and a child's use of an online product are distinct processing/use cases.

### 3.2 High privacy by default and safe child UX

- Default child-facing features to the highest privacy setting. Collect only data needed for a clearly stated purpose.
- Do not collect precise geolocation from children and do not profile children. Any attendance or safety workflow must use a legally reviewed alternative, clear notice and strict access controls.
- Use age-appropriate language, interaction design, permissions and notifications.
- Wall displays/kiosks must show only the minimum information needed for the learning task. No public health data, home address, guardian contact, full identity numbers or disciplinary detail.
- Avoid public leaderboards, stigmatizing labels, automated risk scores or behavioral profiles of children.
- AI recommendations affecting admission, discipline, safeguarding, health, ranking or access to education must not become solely automated consequential decisions. Require human review, reason codes, audit trail, appeal/correction route and clear disclosure.

### 3.3 DPIA, records of processing and privacy officer

- Complete a Data Protection Impact Assessment (DPIA) before production processing of child/health data at scale or other high-risk processing.
- Maintain a record of processing activities: purpose, data categories, data subjects, legal basis, recipients/processors, retention, location, safeguards and deletion method.
- Assess whether the pesantren and PONDOK OS operator each meet UU PDP Article 53 criteria for a privacy officer. Large-scale processing of specific data is a relevant trigger; appoint a qualified privacy officer/DPO function where required.
- Establish a documented controller/processor split. The pesantren will commonly determine the educational/boarding purposes; the SaaS operator may act as processor for those purposes and controller for its own account, security, billing and platform operations. This must be confirmed contractually, not assumed.
- Sign a Data Processing Agreement (DPA) with each institution, define sub-processors, security instructions, audit rights, incident assistance, deletion/return, confidentiality and support access.

### 3.4 Data-subject rights and incident response

- Provide an authenticated request process for access/copy, correction, objection, withdrawal of consent, restriction, deletion and complaint.
- Track statutory response deadlines. UU PDP includes 3 x 24-hour deadlines for specified access/correction/withdrawal/restriction obligations and a 3 x 24-hour written breach notification requirement.
- Keep a complete audit trail of personal-data processing, privileged access, exports, disclosures, changes, consent and deletion.
- Create a breach playbook with detection, containment, evidence preservation, risk assessment, notification drafting, regulator/data-subject communication, recovery and post-incident review.
- Support data correction without allowing a guardian to change another person's data or override a pesantren's legally required records.

### 3.5 Retention, deletion, storage and cross-border transfers

- Define retention by record class (identity, education, health, finance, employment, safeguarding, logs, consent) and applicable statutory/archival requirements.
- Implement legal hold, retention expiry, deletion/pseudonymization, backup expiry and proof of deletion. Deleting an active row while leaving indefinite copies in backups is not a complete lifecycle.
- Map every database, function, storage bucket, log, backup, analytics, email and AI sub-processor location.
- Neon Development endpoint naming indicates an AWS `ap-southeast-1` deployment region; verify the actual project region and contractual data location from provider metadata. If personal data is transferred outside Indonesia, complete the UU PDP Article 56 transfer assessment, safeguards and notices before production use.
- Publish a sub-processor register and obtain institution approvals/contractual authorization where required. Do not send student/health data to AI providers by default.

## 4. Current PONDOK OS evidence and gaps (2026-11-09)

| Control | Current evidence | Release status |
|---|---|---|
| Tenant isolation | Development catalog has 67 tenant-owned tables with ENABLE + FORCE RLS; restricted runtime-role coverage was previously verified at 63/63 tenant and 79/79 platform tables; CI has a two-tenant HTTP API isolation test using synthetic identities on disposable PostgreSQL | Partial evidence; live Neon Auth two-user/two-tenant UAT still required |
| Health data masking | PR #158 masks recognized health fields in table/list/detail UI | Partial; does not replace API authorization, access audit, consent or retention |
| Guardian authority | PR #159 filters five guardian authority fields from generic module responses unless caller has the dedicated verification permission | Partial; real workflow and role UAT required |
| Identity document encryption | Strict AES-256-GCM key validation and fail-closed behavior exist; Development Function metadata lacks `STUDENT_IDENTITY_ENCRYPTION_KEY` | **Blocked**; do not enable identity document operations |
| Child/guardian consent ledger | No production evidence of age-based consent lifecycle, verified legal-guardian consent, withdrawal or child feature gating | **Blocked** |
| DPIA / feature risk assessment | No completed approved DPIA or per-feature PP TUNAS risk self-assessment evidence | **Blocked** |
| Privacy officer / controller-processor contracts | No named appointed privacy officer evidence, DPA, sub-processor register or controller/processor schedule in current release evidence | **Blocked** |
| Data-subject rights | No end-to-end DSAR workflow with statutory deadlines and audit evidence verified | **Blocked** |
| Breach response | No tested 3 x 24-hour incident-notification playbook or tabletop exercise verified | **Blocked** |
| Retention/deletion | No complete per-record retention, legal-hold, deletion and backup-expiry acceptance verified | **Blocked** |
| Data residency / transfer | Development region must be confirmed against provider metadata and reviewed for cross-border transfer; no signed transfer assessment/contract evidence | **Blocked** |
| Child-safe defaults | No complete feature-by-feature age bands, privacy defaults, child reporting and accessibility acceptance evidence | **Blocked** |
| Education regulatory mapping | Pesantren and Diknas pathways are configurable foundations; no verified mapping/UAT against a real pesantren's PSP/education status or relevant school data reporting | **Blocked** |

The evidence above is an engineering snapshot, not a statement that the product or any institution is legally compliant.

## 5. Release gates

### P0 — before any child-facing production use

1. Legal counsel approves the controller/processor model, child-service scope, age bands, consent rules and cross-border transfer model.
2. Complete and approve DPIA and PP TUNAS feature-risk self-assessment; document the reporting/submission obligations and evidence owner.
3. Implement and test guardian identity/authority verification, child consent, per-feature consent, withdrawal, refusal, suspension and data deletion.
4. Keep child-facing accounts/features disabled until required consent and age checks pass.
5. Provision identity-document encryption key through a managed secret store with separate recoverable backup, rotation and restore drill; never share key material in chat.
6. Appoint privacy officer/DPO function where legally required; sign DPA and sub-processor terms with each institution.
7. Confirm data residency, subprocessors and international-transfer safeguards.
8. Complete live two-tenant and role-based security UAT.

### P1 — before general commercial launch

1. DSAR workflows and deadline monitoring for access/copy/correction/withdrawal/restriction/deletion.
2. Auditable retention, legal hold, deletion and backup expiry.
3. Tested 3 x 24-hour breach notification and incident response.
4. Parent/guardian portal access controls and pickup authority verification.
5. Child-safe kiosk/wall display and age-appropriate user testing.
6. Institution-specific mapping for Kemenag and any integrated Diknas school unit; versioned data dictionary and export validation.
7. Tested backup, restore, disaster recovery, RPO/RTO and offsite/immutable copy.
8. Written institution UAT, training, acceptance and go-live sign-off.

## 6. Non-negotiable product defaults

- No child account without the required age/guardian checks and consent.
- No default sharing of child profiles across institutions or public display.
- No precise geolocation collection from children.
- No child profiling or automated consequential decision without legally reviewed basis and human safeguards.
- No health or identity document exposure in ordinary list, export, report or AI context.
- No guardian access to a child record solely because their phone number appears in a contact field.
- No external AI/subprocessor access to child or health data unless explicitly authorized, contractually covered, minimized and logged.
- No “compliant” badge or sales claim until legal and operational evidence is approved.

## 7. Source notes and interpretation limits

- UU 27/2022 classifies health information and child data as specific personal data; it sets subject rights, processing logs, DPIA/security, deletion, breach notification, DPO criteria and cross-border transfer requirements.
- PP 17/2025 covers electronic products/services/features specifically designed for children or likely to be accessed by children. Its obligations include parental/guardian consent, DPIA, high privacy by default, age-appropriate information/functions, and prohibitions including precise child geolocation collection and child profiling.
- Permenkomdigi 9/2026 supplies technical requirements for age bands, age verification, self-assessment and child-risk profiles. Do not reduce this to a simple “under 16/over 16” toggle; evaluate each feature and risk profile.
- PMA 30/2020, PMA 31/2020 and education-data rules must be mapped to each institution's actual legal status and educational pathway. The software does not replace Kemenag/education licensing, registration or statutory reporting.
- This matrix is a product-engineering control list. It does not replace formal legal advice, a DPIA, regulatory filing, institution-specific policy, or an external security assessment.

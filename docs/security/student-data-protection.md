# Student data protection and health encryption

## Data ownership and classification

PONDOK OS keeps one canonical student record in `academic.student_profiles`. Academic enrolments, attendance, boarding, library circulation, billing references and alumni lifecycle should refer to that student ID; they must not create parallel student identities.

General profile fields include the internal student number, legal/preferred name, birth place/date, gender marker, citizenship code, NISN when verified, entry date, previous institution, structured current/permanent addresses and contact details.

Guardian identities are stored once in `academic.guardians`. The many-to-many `academic.student_guardians` relation records the relationship, legal-guardian status, emergency-contact status, pickup authority, verification and effective dates. Biological relationship alone is not treated as proof of legal custody or pickup authority.

Health information and identity-document numbers are separate restricted records. NIK/KK/passport values are designed for ciphertext-only storage. Do not place them in general profile JSON, logs, exports, URLs or support tickets.

## Health encryption

The health API uses AES-256-GCM with a fresh 96-bit nonce for each value. Blood group, allergies, medical history, medication information and emergency instructions are encrypted before persistence. The database stores ciphertext, nonce and authentication tag together; audit events record only field names and actor/action metadata.

The Development API Function deployment #25 has these server-side environment variables configured. Production has not been configured or changed. For any new branch/deployment, provision the following variables before enabling health access:

- `STUDENT_HEALTH_ENCRYPTION_KEY`: Base64-encoded 32-byte random key.
- `STUDENT_HEALTH_ENCRYPTION_KEY_VERSION`: stable key version label, for example `v1`.

Generate a key in a trusted operator environment with:

```sh
openssl rand -base64 32
```

Never put the generated value in Git, frontend `VITE_*` variables, browser storage, screenshots, or chat. Store an offline recovery copy in the organization's approved secrets vault. Loss of the key makes the encrypted health records unreadable. The API fails closed with HTTP 503 when the key is absent or the configured version does not match the record version.

**Key rotation is not yet automated.** Keep the original key and version available until a tested re-encryption migration is implemented. Do not replace the key on a live environment as a routine password rotation.

The health API is permission-gated by `academic.students.health.read` and `academic.students.health.write`. The `health_officer` system role receives only basic student lookup and health permissions; it does not receive payroll, identity-document, or general HR access. Institution owners/admins retain governance access.

## Identity-document encryption

Identity-document numbers (including NIK, KK and passport numbers) use a separate AES-256-GCM key from health data. The API expects:

- `STUDENT_IDENTITY_ENCRYPTION_KEY`: canonical standard Base64 encoding of exactly 32 random bytes (44 characters, ending in one `=`).
- `STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION`: stable version label containing 1–64 letters, digits, dots, underscores or hyphens; for example `identity-v1`.

The Development Function environment does not currently list `STUDENT_IDENTITY_ENCRYPTION_KEY`. Identity-document reads and writes must remain fail-closed until the key is provisioned and its recovery path is verified.

Provisioning checklist:
1. Generate the key in a trusted operator environment with `openssl rand -base64 32`.
2. Store the value in the approved secrets vault and create a separately protected recovery copy before configuring the Function.
3. Add both variables only to the Development Function's server-side environment; never use frontend variables, Git, chat, screenshots or logs.
4. Deploy a new Function version and verify the environment variable names are present without displaying their values.
5. Test authorized create/read/update, missing-key denial, malformed-key denial, wrong-tenant denial and audit failure behavior using synthetic test data in an isolated test environment.
6. Test backup restoration with the matching key available and document who may recover it.

Identity-key rotation is not automated. Do not replace the key while encrypted records exist. A future rotation must retain the old key version for decryption until a tested re-encryption and rollback procedure is accepted.

## Guardian legal-authority verification

Ordinary student/guardian relationship CRUD must not set legal-guardian or pickup-authority flags. Migration 0026 adds the dedicated `academic.students.guardians.verify` permission and an audit-backed verification action. Only institution owner/admin system roles receive this permission by default. The verifier must record an evidence note; the audit event records the authority flags and the fact that evidence was supplied, but never copies the evidence note itself. A relationship outside its effective date range cannot be verified. Re-check the source documents and applicable custody/authorization instrument; a family relationship label alone is not sufficient proof.

## Required operational controls before real data import

Migration 0018 is applied on Development; migration 0019 also forces RLS on the membership authority table. Verify RLS on every tenant-owned table before importing real data.
2. Set the encryption secrets in the server runtime and test create/read/update/decryption, invalid-key, wrong-tenant and unauthorized-user cases.
3. Define written consent/notice, purpose limitation, retention/deletion, guardian authority verification, emergency disclosure and incident-response procedures.
4. Restrict health data to designated staff; do not include it in routine exports, search indexes, AI prompts, analytics or generic audit payloads.
5. Configure private object storage for documents/photos, malware scanning, signed short-lived downloads, retention and access audit before accepting uploads.
6. Test backups and restore with the encryption key available; a database backup without the matching key is not a usable health-record backup.
7. Complete privacy impact assessment and legal review for processing children's data and health information under applicable Indonesian law.

This design is a technical foundation, not a privacy certification or legal opinion. Official EMIS/Dapodik integrations remain disabled until current government specifications, access approvals and credentials are confirmed.

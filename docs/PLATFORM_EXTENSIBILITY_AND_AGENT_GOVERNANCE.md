# Arsitektur Ekstensibilitas, Plugin, dan Multi-Agent PONDOK OS

**Status:** rancangan kontrak platform. Dokumen ini tidak mengklaim dynamic plugin runtime atau agent otonom sudah aktif. Semua perubahan sistem, schema, permission, integrasi dan deployment tunduk pada pipeline serta approval.

## 1. Sasaran

PONDOK OS berkembang menjadi platform multi-tenant bagi yayasan/pesantren dengan banyak satuan pendidikan, kegiatan, unit usaha dan aplikasi tambahan. Menambah modul kelak harus mengikuti alur: register manifest → validasi → review keamanan/kepatuhan → generate migration/API/UI → test → approval → deploy → aktivasi tenant. Hindari perubahan manual berulang pada sidebar, database dan permission.

## 2. Batas kepercayaan

1. Tenant isolation dan RLS tetap menjadi batas data utama. Modul tidak boleh mematikan RLS, mengganti role runtime, atau membaca tenant lain.
2. Super Administrator platform berbeda dari administrator organisasi. Super Admin mengelola registry, rilis, agent policy dan approval lintas tenant. Admin organisasi mengaktifkan modul yang telah dirilis dan mengelola data organisasinya.
3. Tidak ada eksekusi kode plugin dari tenant, URL arbitrer, atau unggahan JavaScript. Paket plugin berasal dari sumber tepercaya, ditinjau, ditandatangani, dipin versinya dan dirilis melalui pipeline.
4. Manifest deklaratif: menu, route, permission, schema, form, workflow, event, integrasi dan health checks; tidak memuat executable code.
5. AI bukan otoritas akses. Semua aksi melewati API permission checks, schema validation, tenant context, audit dan policy engine.
6. Default-deny untuk permission, klasifikasi data, egress, tools dan agent actions.
7. AI boleh menganalisis, mengusulkan, menyusun draft dan pemeriksaan read-only. AI tidak boleh menyetujui proposalnya sendiri.
8. Tidak ada perubahan Production, migrasi DB, rotasi kredensial, perubahan RBAC/RLS, penghapusan data, restore atau deployment tanpa approval eksplisit.
9. Provider AI bersifat adapter. Workflow deterministik, alarm dan health checks harus tetap berjalan tanpa model AI/API berbayar.
10. Audit append-only untuk aktivitas agent, approval, perubahan konfigurasi, migrasi, deployment dan akses data sensitif.

## 3. Siklus hidup modul

draft → submitted → static_validation → security_review → compliance_review → approved_for_dev → dev_migration → dev_tests → uat → release_candidate → super_admin_approval → signed_release → tenant_activation → monitored → deprecated.

Status rejected, suspended dan rollback_required tersedia. Aktivasi tenant tidak otomatis menjalankan DDL. Migrasi adalah artefak versioned yang diterapkan hanya oleh deployment principal tepercaya setelah approval.

### Contoh manifest konseptual

```json
{
  "manifestVersion": 1,
  "moduleId": "id.pondokos.cooperative",
  "version": "1.0.0",
  "displayName": "Koperasi Pesantren",
  "category": "business",
  "dependencies": ["pondokos.core", "pondokos.finance", "pondokos.inventory"],
  "menu": [{
    "id": "cooperative.dashboard",
    "label": "Koperasi",
    "route": "/workspace/cooperative",
    "icon": "store",
    "permission": "cooperative.dashboard.read"
  }],
  "permissions": ["cooperative.members.read", "cooperative.members.manage", "cooperative.pos.transact"],
  "data": {"schemaNamespace": "cooperative", "tenantScoped": true, "migrationSet": "migrations/"},
  "forms": [{"id": "cooperative.member", "schemaVersion": 1, "fields": [{"name": "memberNumber", "type": "string", "required": true, "maxLength": 40}]}],
  "workflows": ["member-approval", "cash-close"],
  "events": {"publishes": ["cooperative.sale.completed"], "subscribes": ["inventory.stock.low"]},
  "integrations": [],
  "healthChecks": ["database", "queue", "ledger"]
}
```

Contoh ini kontrak rancangan, bukan manifest aktif yang langsung dieksekusi.

## 4. Auto-create menu dan database secara aman

### Menu otomatis
- Registry menyimpan manifest yang telah disetujui dan ditandatangani.
- UI mengambil katalog tenant-aware berdasarkan aktivasi modul dan permission user.
- Menu dibuat dari deklarasi route/menu yang disetujui.
- Server tetap memverifikasi permission; menyembunyikan menu bukan kontrol keamanan.
- Deaktivasi menyembunyikan menu dan menolak akses API; data tidak dihapus.

### Schema/migration otomatis-terkendali
- Generator membuat migration SQL dari schema deklaratif yang tervalidasi.
- Setiap modul mendapat namespace schema platform; tabel tenant-owned memiliki organization_id, FK tenant-aware, indeks, constraint dan RLS.
- Migration diuji di Development terisolasi: lint, upgrade, rollback/forward-fix, tenant isolation, backup/restore dan query plan.
- Migration dijalankan oleh deployment principal terpisah dari runtime role; bukan browser, tenant admin atau agent.
- Super Admin menyetujui checksum artefak, target environment, dampak, rencana rollback dan jadwal. Production butuh approval tersendiri.
- Aktivasi tenant memakai registry/configuration row, bukan membuat tabel baru per tenant.
- Modul yang memerlukan isolasi fisik khusus dapat memakai database terpisah melalui provisioning workflow.
- Tidak ada auto-delete schema saat modul dinonaktifkan; uninstall adalah proses arsip/retensi dan approval terpisah.

## 5. Multi-Agent AI: peran dan batas

| Agent | Tugas | Aksi otomatis yang diizinkan | Approval wajib |
|---|---|---|---|
| Orchestrator/Dispatcher | Memecah permintaan, memilih agent, prioritas dan dependensi | Menjadwalkan job, menggabungkan temuan | Tidak boleh mengubah policy/menyetujui aksi |
| Security Sentinel | Login, anomali akses, pola lintas tenant, dependency, secret leakage | Read-only scan, alert dan remediation proposal | Blokir akun, rotasi secret, ubah RLS/RBAC, patch/deploy |
| Reliability & Maintenance | Health API/DB, queue, job, kapasitas, error, backup evidence | Diagnostics read-only, tiket dan proposal | Restart/destructive maintenance, restore, upgrade |
| Alert & Incident | Korelasi alarm, deduplikasi, severity, eskalasi, timeline | Notifikasi pada kanal diizinkan | Mitigasi berisiko/penutupan insiden kritis |
| Compliance & Regulatory | Sumber resmi, versi aturan, izin kedaluwarsa, checklist | Matriks dampak dan draft perubahan form | Perubahan produksi/klaim compliance final |
| Module Architect/Builder | Manifest, menu, schema, form, API contract dan test plan | Branch/PR dan artefak non-production | Merge, release, migration, deployment |
| Data Steward | Kualitas data, duplikasi, missing fields, retensi, consent | Profiling minimal dan usulan koreksi | Merge identitas, ekspor/penghapusan data pribadi |
| Finance & Operations Analyst | Rekonsiliasi, anomali biaya, stok, payroll exception | Laporan dan draft jurnal/permintaan | Pembayaran, payroll release, jurnal final, transfer |
| Helpdesk/Knowledge | SOP, pencarian modul, draft tiket | Baca knowledge sesuai hak | Tidak boleh membaca data tanpa hak |
| Release & Change Manager | CI, SBOM, scan, UAT, changelog, rollback | Release candidate dan checklist | Approval Super Admin untuk rilis/perubahan |

## 6. Agent control plane: entitas yang perlu disiapkan

- agent_definitions: ID, versi prompt/policy, tools allowlist, owner, enabled.
- agent_runs: run ID, tenant scope, trigger, provider/model, metadata biaya bila tersedia, status, timestamps.
- agent_steps: langkah, input/output tersaring, tool call, hasil dan error.
- agent_proposals: jenis aksi, target, diff, risk score, alasan, evidence, expiry dan idempotency key.
- approval_requests: approver role, status, decision, komentar, waktu dan approval reference.
- agent_alerts: severity, fingerprint, deduplication key, sumber, status dan eskalasi.
- agent_policies: allowlist tools, klasifikasi data, budget/rate limit, autonomy level dan approval matrix.
- agent_evaluations: test cases, groundedness, false positive/negative, policy violations dan regression.
- change_artifacts: manifest, migration, build, SBOM, scan, UAT evidence, checksum dan target environment.
- system_health_snapshots: komponen, metric, threshold, status dan timestamp evidence.

Control-plane global hanya dapat diakses role platform khusus. Rahasia/token tidak boleh disimpan di log agent.

## 7. Approval matrix default

| Risiko | Contoh | Otonomi agent |
|---|---|---|
| R0 observasi | Health check, statistik agregat, changelog | Otomatis read-only |
| R1 rutin reversibel | Deduplikasi alert, tiket, draft laporan | Otomatis dalam allowlist |
| R2 perubahan tenant | Konfigurasi modul, pengumuman, koreksi data | Perlu approver organisasi |
| R3 perubahan platform | Manifest, permission, migration, dependency, integrasi | Perlu Super Admin + review teknis/security |
| R4 kritis | Production deploy, RLS/RBAC, secret, restore, delete, uang/payroll | Tidak pernah mandiri; dual control bila relevan |

Approval wajib memuat actor, tenant, target, before/after diff, alasan, evidence, dampak, risiko, biaya dan rollback. Approval punya expiry, nonce/idempotency, terikat checksum artefak dan tidak dapat dipakai ulang. Self-approval dilarang untuk aksi kritis. Perubahan artefak/target membatalkan approval.

## 8. Monitoring, keamanan dan alarm

- Auth: failed login burst, token/JWKS errors, unusual sessions, privilege changes.
- Tenant isolation: denied cross-tenant probes, unexpected organization context, RLS errors.
- API: 4xx/5xx, latency, rate limit, payload rejection dan endpoint anomali.
- DB: pool saturation, locks, slow query, storage, backup/snapshot evidence, migration drift.
- Supply chain: dependency advisories, lockfile drift, SBOM, secret scan, artifact signatures.
- Operasional: stok minimum, kas selisih, approval aging, payroll exceptions, kontrak/izin kedaluwarsa.
- Integrasi: sync lag, credential expiry, row conflicts, webhook failures dan retry backlog.

Severity: P0 indikasi kebocoran lintas tenant/credential compromise/corruption; P1 layanan utama down/backup gagal/anomali akses sensitif; P2 antrean/integrasi/SLA terlambat; P3 rekomendasi maintenance dan kualitas data. Agent tidak boleh mengklaim backup berhasil hanya dari status job; bukti artefak dan uji restore dibutuhkan. Agent tidak boleh mengubah Production demi menghilangkan alarm.

## 9. Model AI dan biaya

- Rules engine, cron, threshold alarm dan SQL health check tidak memerlukan LLM.
- LLM opsional untuk klasifikasi, ringkasan, analisis akar masalah, draft PR dan penjelasan regulasi.
- Provider diisolasi melalui interface; jangan hardcode provider/model pada domain logic.
- Fallback ke mode manual/rules-only bila provider tidak tersedia.
- Catat provider/model, latency dan cost metadata jika tersedia; redaksi data sensitif.
- Tenant dapat menonaktifkan AI; alarm deterministik tetap berjalan.
- Data anak, kesehatan, payroll, identitas dan dokumen rahasia tidak dikirim ke provider eksternal tanpa dasar pemrosesan, konfigurasi dan persetujuan sah.

## 10. Adapter integrasi eksternal

Setiap adapter harus memiliki owner, tujuan, minimisasi data, dasar hukum, scopes, secret reference, rate limit, timeout, retry, idempotency, signature webhook, sync ledger, reconciliation, kill switch dan retention. Kandidat: Dapodik/EMIS/Verval; OSS/NIB/KBLI; pajak/payroll; pembayaran/bank; halal/pangan; komunikasi. Tidak diasumsikan tersedia API publik. Verifikasi akses resmi sebelum implementasi.

## 11. Roadmap implementasi

- Fase 0: registry schema, manifest JSON Schema, lifecycle, permission namespace, agent policy, proposal/approval dan audit.
- Fase 1: katalog tenant-aware, aktivasi/deaktivasi, server-side route guard, dependency compatibility.
- Fase 2: form schema renderer, migration generator, isolated Development branch, approval artifact, event outbox/inbox.
- Fase 3: read-only health/security/alert/data quality agents dan Agent Desk.
- Fase 4: proposal PR/change, approval UI, checksum binding, expiry dan audit.
- Fase 5: koperasi/POS, sekolah Diknas, agribisnis, laundry/katering, ZISWAF dan connector resmi.

## 12. Definition of Done

Manifest valid dan version-pinned; tidak ada kode/SQL tak tepercaya; tenant isolation dan negative cross-tenant tests; server-side permission tests; validasi form, klasifikasi dan retensi; audit konsisten transaksional; migration Development disetujui; accessibility dan error/loading states; security/dependency/secret scan dan SBOM; UAT role berwenang; approval rilis Super Admin; rollback plan; monitoring/runbook/owner.

## 13. Batas eksplisit

AI agents bukan administrator sistem otonom dan tidak menggantikan Super Admin. Menu dinamis bukan eksekusi plugin arbitrer. Auto schema generation bukan auto-apply Production. Integrasi pemerintah belum dijamin sebelum akses resmi dikonfirmasi. Katalog modul bukan bukti modul operasional. Checklist bukan sertifikasi hukum.

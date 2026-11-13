# Desain Cakupan Akses Anggota Tenant (Development)

**Status:** proposal teknis; belum diterapkan ke database atau runtime.  
**Batas lingkungan:** hanya Neon Development setelah persetujuan migrasi tersendiri. Neon Production dikecualikan.

## 1. Temuan
Implementasi saat ini mengelola template peran, matriks permission, dan penugasan role ke membership. Belum ada relasi penugasan cakupan (kampus, unit, kelas, mata pelajaran, asrama) pada membership, belum ada payload scope pada endpoint tenant-members, dan UI belum menyediakan editor cakupan.

Akibatnya, role guru, musyrif, atau TU belum membatasi data ke penugasan spesifik. Permission seperti academic.students.read tidak membuktikan bahwa pengguna hanya dapat melihat kelas yang ditugaskan.

## 2. Prinsip keamanan
1. **Deny by default:** tanpa assignment scope valid, akses ke data berscope ditolak; tidak fallback ke seluruh tenant.
2. **Tenant boundary:** setiap scope harus dimiliki organization yang sama dengan membership dan resource.
3. **No client authority:** client tidak menentukan organization_id, aktor, atau scope yang tidak berhak dikelola.
4. **Server enforcement:** UI bukan kontrol keamanan; API dan RLS wajib menegakkan cakupan.
5. **Permission AND scope:** izin modul diperlukan sekaligus scope yang cocok.
6. **No implicit wildcard:** akses seluruh kampus/unit memerlukan grant eksplisit dan audit.
7. **Sensitive data minimization:** kesehatan, identitas, dan safeguarding perlu permission khusus selain scope.
8. **Maker-checker:** pembuat perubahan berisiko tidak menyetujui perubahannya sendiri.
9. **Append-only audit:** catat aktor, target membership, scope, alasan, waktu, dan before/after tanpa rahasia.
10. **Fail closed:** konflik atau referensi resource tak valid harus ditolak.

## 3. Model data yang diusulkan (belum dibuat)

Tabel kandidat: core.membership_scope_assignments.

Kolom minimum:
- id UUID primary key
- organization_id UUID not null
- membership_id UUID not null
- scope_type text terbatas: campus, unit, class_group, subject, dormitory, room
- scope_id UUID not null
- access_level text not null default assigned
- valid_from, valid_until timestamptz nullable
- created_by UUID not null; created_at timestamptz not null
- reason text not null
- revoked_at, revoked_by nullable

Integritas:
- FK ke core.organization_memberships.
- Unique/partial index untuk mencegah assignment aktif duplikat.
- Validasi membership dan resource scope berada pada organization yang sama.
- Validasi tipe dan keberadaan target resource; UUID valid bukan bukti resource berhak.
- Validasi relasi parent-child: class berada di campus yang diizinkan; room berada di dormitory yang diizinkan.
- Riwayat tidak dihapus; pencabutan dicatat.

Pemetaan kandidat:
- campus -> core.campuses
- class_group -> academic.class_groups
- subject -> academic master subject (nama tabel aktual harus diverifikasi)
- dormitory -> boarding.dormitories
- room -> boarding.rooms
- unit -> tabel unit organisasi aktual; hr.departments tidak otomatis dianggap seluruh unit pesantren.

Jangan membuat foreign key polimorfik tanpa strategi integritas. Evaluasi tabel assignment per resource atau scope registry dengan FK konkret dan validasi. Keputusan final mengikuti inspeksi schema dan uji migrasi.

## 4. Matriks perilaku role

| Peran | Scope minimum | Yang tidak otomatis boleh |
|---|---|---|
| Guru | Kelas dan mata pelajaran yang ditugaskan | Semua santri, nilai, kelas |
| Wali kelas | Kelas binaan | Kelas lain atau seluruh kampus |
| TU | Kampus/unit administrasi yang ditugaskan | Kesehatan, asrama, keuangan tanpa permission |
| Musyrif | Asrama/kamar yang ditugaskan | Asrama/kamar lain |
| Kepala sekolah/koordinator | Unit/kampus sesuai mandat | Seluruh tenant |
| Petugas kesehatan | Scope layanan + permission kesehatan khusus | Seluruh data santri/keuangan |
| Auditor | Scope audit + read-only permission | Create/update/delete/approve |

Role hanya kumpulan permission. Role tidak otomatis menghasilkan scope. Scope merupakan relasi terpisah dan harus ditinjau saat pegawai pindah tugas, cuti, atau keluar.

## 5. Kontrak API kandidat
- GET /v1/tenant/members/:membershipId/scopes
- PUT /v1/tenant/members/:membershipId/scopes (replace atomik) atau POST/DELETE assignment untuk audit yang lebih granular.
- GET /v1/tenant/scope-options?type=... hanya mengembalikan resource dalam tenant dan batas pengelolaan aktor.

Ketentuan:
- Wajib core.members.manage atau permission khusus scope-management yang ditinjau.
- Actor wajib memiliki membership aktif dan hak mengelola resource terkait.
- Input dibatasi; UUID divalidasi; duplikasi ditolak.
- Validasi tenant ownership di server dan database.
- Perubahan scope sendiri dan akun owner/admin utama memiliki proteksi eksplisit.
- Jangan mengembalikan PII yang tidak diperlukan.
- Jangan mengungkap keberadaan resource tenant lain.
- Semua mutasi menghasilkan audit event.

## 6. Enforcement API dan database
1. Periksa autentikasi dan membership aktif.
2. Periksa permission aksi.
3. Resolve scope aktor dari assignment aktif tervalidasi.
4. Tambahkan filter scope ke query server-side; jangan percaya filter browser.
5. Pastikan scope resource dan tenant konsisten.
6. Validasi scope target dan parent-child untuk query tulis.
7. RLS menjadi lapisan pertahanan kedua.
8. Uji akses tanpa scope, scope kedaluwarsa/dicabut, ID lintas tenant, dan relasi parent-child tidak cocok.

Tidak boleh ada fallback diam-diam ke organization_id saja ketika scope belum tersedia. Migrasi data lama harus memilih assignment terkontrol atau akses ditolak sampai administrator menugaskan scope.

## 7. UI yang dibutuhkan
Di Institution Workspace → Jabatan, Peran & Hak Akses:
- Daftar anggota dengan role dan status penugasan.
- Editor scope per anggota, terpisah dari editor role.
- Pilihan scope dan resource hanya dari tenant aktif.
- Tampilan assignment aktif, masa berlaku, alasan, pemberi, dan status.
- Tambah, cabut, dan perpanjang assignment.
- Peringatan saat role punya permission tetapi belum memiliki scope.
- Preview akses efektif berdasarkan permission AND scope; preview bukan enforcement.
- Konfirmasi dan alasan untuk perubahan akses sensitif.
- Jangan tampilkan user UUID atau PII yang tidak diperlukan.

Command Center bukan tempat mengelola penugasan operasional anggota tenant.

## 8. Rencana bertahap

### A — Inventarisasi read-only
- Verifikasi tabel master kampus, unit, kelas, mapel, asrama, kamar.
- Inventarisasi endpoint list/detail/create/update/export untuk akademik, asrama, kesehatan, HR, keuangan, inventory, perpustakaan.
- Petakan endpoint ke permission, tabel, tenant key, dan scope key.
- Identifikasi query yang belum memiliki filter tenant/scope.

### B — Migration Development (perlu persetujuan eksplisit)
- Buat tabel/index/constraint/policy scope.
- Tambahkan helper RLS aman dan uji recursion.
- Uji pada Development saja; siapkan strategi rollback/forward.
- Production bukan target.

### C — API enforcement
- Helper scope terpusat.
- Terapkan per domain; jangan hanya menambal UI.
- Audit assignment dan perubahan akses.
- Endpoint ekspor wajib permission AND scope.

### D — UI dan onboarding
- Editor scope dan indikator akses efektif.
- Wizard penugasan saat menambah anggota.
- Role tanpa scope tetap tidak mendapat akses data berscope.
- Dokumentasikan perpindahan dan pencabutan penugasan.

### E — UAT
- Akun guru, wali kelas, TU, musyrif, petugas kesehatan, auditor, admin tenant.
- Dua kampus dan dua tenant berbeda.
- Scope aktif, kedaluwarsa, dicabut, kosong, duplikat, dan parent-child.
- Direct API dan export; bukan hanya menu.
- Privilege escalation, self-assignment, self-approval, platform-vs-tenant.
- Simpan bukti; catat skenario yang belum bisa dijalankan karena belum ada akun UAT nyata.

## 9. Gerbang go-live
Jangan menyatakan scope siap produksi sampai migration Development berhasil, RLS test lulus, endpoint relevan memakai permission AND scope, UI assignment bekerja, negative test lintas tenant/scope lulus, audit tersedia, backup/restore teruji, dan akun UAT nyata menyelesaikan skenario.

## 10. Batas dokumen
Dokumen ini hanya blueprint. Tidak membuat tabel, fungsi, policy, data assignment, role, atau perubahan runtime. Implementasi schema memerlukan persetujuan migrasi Development yang eksplisit setelah rancangan final dan inventarisasi tabel selesai.

## 11. Hasil inventarisasi schema read-only (Development, 2026-11-13)

Pemeriksaan information_schema mengonfirmasi:
- core.campuses memiliki id, organization_id, code, name, campus_type, status.
- academic.class_groups memiliki organization_id dan campus_id.
- academic.subjects memiliki organization_id; academic.class_subjects menghubungkan class_group_id dengan subject_id.
- boarding.dormitories memiliki organization_id dan campus_id.
- boarding.rooms memiliki organization_id dan dormitory_id.
- hr.departments memiliki organization_id, campus_id, parent_department_id, effective_from, effective_until.
- hr.employees memiliki organization_id dan campus_id.
- core.organization_memberships memiliki organization_id, user_id, membership_status; core.membership_roles menghubungkan membership_id dengan role_id.

Implikasi desain:
- Unit kerja secara awal dapat merujuk hr.departments, tetapi cakupannya perlu dibatasi dan diverifikasi terhadap struktur organisasi pesantren (tidak semua kegiatan/unit usaha harus direpresentasikan sebagai departemen HR).
- Scope subject sebaiknya divalidasi melalui academic.class_subjects agar guru tidak diberi mapel yang tidak terhubung dengan kelas yang ditugaskan.
- Scope room harus divalidasi terhadap boarding.dormitories dan campus_id-nya.
- Scope campus dapat menjadi induk pembatas bagi class_group, dormitory, employee, dan department.
- Inventarisasi ini hanya membaca metadata; tidak mengubah schema atau data. FK, RLS, policies, trigger, dan relasi tambahan masih harus diperiksa sebelum migration final.

### RLS yang ditemukan pada tabel terkait

Kebijakan tenant_isolation untuk core.campuses, academic.class_groups, academic.class_subjects, academic.subjects, boarding.dormitories, boarding.rooms, hr.departments, dan hr.employees membatasi organization_id serta memeriksa active tenant membership. Kebijakan ini merupakan isolasi tenant, bukan isolasi berdasarkan campus/class/subject/dormitory/unit assignment.

core.membership_roles memakai kebijakan yang membatasi pembacaan/penulisan ke membership milik user aktif pada organization context. core.organization_memberships memiliki kebijakan tenant self-read dan kebijakan platform-control untuk operasi membership tertentu.

Kesimpulan keamanan: RLS saat ini membantu mencegah akses lintas organisasi, tetapi belum membatasi guru ke kelas/mapel tertentu atau musyrif ke asrama/kamar tertentu. Scope RLS harus ditambahkan tanpa melemahkan policy tenant_isolation yang sudah ada. Jangan mengubah policy lama menjadi lebih longgar.

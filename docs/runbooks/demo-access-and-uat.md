# Paket Akses Demo & UAT PONDOK OS (Development)

**Tujuan:** membantu pemilik proyek masuk ke Development dan menguji alur dengan data sintetis. Bukan akun/tenant produksi.

## URL
- Aplikasi: https://n30ak.github.io/PONDOK-OS/
- API Development: https://br-proud-paper-b312lfxi-pondokapi.compute.c-4.ap-southeast-1.aws.neon.tech/
- Health live: `GET /health/live`
- Health ready: `GET /health/ready`

## Kondisi Development yang diperiksa
Pemeriksaan read-only pada 2026-11-13:
- Neon Auth users: 3 (jumlah saja; email dan identitas tidak dicetak).
- Organisasi: 1.
- Membership aktif: 1.
- Profil santri: 5.
- Pegawai HR: 5.
- Role assignment `institution_owner`: 1.
- Neon Function `pondokapi`: deployment aktif #79, Node.js 24.
- Neon Object Storage aktif; bucket `uploads` privat.

**Penting:** jumlah di atas tidak membuktikan bahwa pengguna saat ini mengetahui kredensial login atau bahwa role lain sudah tersedia. Jangan menganggap akun Auth otomatis anggota tenant.

## Login yang aman
1. Buka URL aplikasi dan pilih login/daftar melalui Neon Auth.
2. Gunakan akun milik Anda sendiri dan selesaikan verifikasi email.
3. Jika login berhasil tetapi tidak ada workspace, jangan pilih role sendiri dan jangan mencoba endpoint bootstrap lama. Endpoint publik lama memang dinonaktifkan (HTTP 410).
4. Untuk bergabung ke tenant nyata, gunakan alur resmi permohonan aktivasi -> review Super Admin perusahaan -> token sekali pakai yang terikat pada akun pemohon.
5. Untuk akun UAT tambahan, gunakan alamat email yang Anda kuasai (atau alias mailbox yang benar-benar dapat menerima verifikasi). Daftarkan melalui Neon Auth, lalu tambahkan ke tenant Development oleh Institution Owner melalui menu anggota dengan role minimum yang diperlukan. Jangan membuat membership dengan SQL manual.

Tidak ada password demo statis yang aman untuk dibagikan. Saya tidak dapat melihat atau memulihkan password akun Neon Auth yang sudah ada. Saya juga tidak akan mencetak email/ID pengguna dari database.

## Matriks akun UAT yang disarankan
Buat akun terpisah, satu orang per akun. Gunakan mailbox yang bisa menerima email verifikasi.

| Alias UAT | Role tenant yang ditetapkan owner | Fokus uji |
|---|---|---|
| UAT-OWNER | institution_owner (akun owner yang sudah diverifikasi; jangan duplikasi haknya) | anggota, role, konfigurasi tenant |
| UAT-AKADEMIK | academic_admin atau teacher | santri, kelas, mapel, presensi, nilai |
| UAT-KESANTRIAN | dorm_musyrif | asrama, kamar, izin, insiden |
| UAT-KESEHATAN | health_officer | pembatasan data kesehatan dan akses seperlunya |
| UAT-KEUANGAN-INPUT | finance_cashier | input jurnal/penerimaan, tidak boleh verifikasi sendiri |
| UAT-KEUANGAN-VERIFIKATOR | finance_verifier | verifikasi transaksi yang dibuat akun lain |
| UAT-AUDITOR | read_only_auditor | baca audit/laporan tanpa mengubah data |
| UAT-PLATFORM | company Super Admin | hanya akun operator perusahaan yang sudah diverifikasi terpisah; bukan anggota tenant secara otomatis |

Jangan gunakan akun platform Super Admin untuk menguji role tenant. Jangan berikan `institution_owner`, `institution_admin`, `platform.*`, atau hak lintas-tenant kepada akun biasa.

## Data contoh
Lihat `fixtures/pondok-demo-uat.json`. Semua nama, nomor, alamat, dan catatan kesehatan di dalamnya adalah **data fiktif** dengan domain `.invalid` dan nomor placeholder. File ini sengaja `importable: false`: pemetaan ke API/schema harus dilakukan dan ditinjau sebelum proses seed apa pun. Jangan menjalankan fixture sebagai SQL.

## Skenario UAT wajib
- [ ] Owner dapat membuka workspace dan mengelola anggota/role sesuai izin.
- [ ] Guru hanya melihat kelas/penugasan yang menjadi kewenangannya.
- [ ] Musyrif tidak dapat membaca asrama lain di luar cakupan penugasannya.
- [ ] Petugas kesehatan hanya melihat data kesehatan sesuai kebutuhan tugas; role lain tidak melihat catatan medis.
- [ ] Kasir tidak dapat menyetujui transaksi yang dibuatnya sendiri.
- [ ] Verifikator dapat memproses transaksi dari pembuat lain sesuai permission.
- [ ] Auditor hanya membaca; operasi tulis ditolak.
- [ ] Pengguna tanpa `audit.events.read` tidak dapat membuka audit melalui URL langsung/API.
- [ ] Tenant A tidak dapat membaca/menulis data Tenant B.
- [ ] Ekspor ditolak API jika `reports.export` tidak ada (bukan sekadar tombol disembunyikan).
- [ ] Pengguna biasa tidak dapat menaikkan role sendiri atau memberikan role owner/admin.
- [ ] Data santri, wali, kelas, pengajar, asrama, keuangan, dan audit konsisten setelah refresh/login ulang.

**Status:** checklist adalah rencana penerimaan, bukan klaim bahwa seluruh kasus sudah lulus. Uji dua-tenant live memerlukan dua akun terverifikasi dan dua tenant Development nyata; tenant demo tunggal belum cukup.

## Batas keamanan dan go-live
- `STUDENT_IDENTITY_ENCRYPTION_KEY` belum tersedia pada Function Development; operasi dokumen identitas wajib fail-closed.
- Backup executor, backup immutable/offsite dan uji restore belum tersedia. Jangan menyimpan data pribadi nyata.
- Bucket privat tersedia, tetapi keberadaan bucket bukan bukti backup yang berhasil.
- Belum ada kredensial demo bersama yang bisa dipublikasikan. Password harus dibuat melalui alur Auth dan tidak boleh disimpan di repo/chat.
- Semua uji ini khusus Development. Neon Production tidak menjadi target.

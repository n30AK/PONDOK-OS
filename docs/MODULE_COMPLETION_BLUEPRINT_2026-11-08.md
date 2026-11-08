# PONDOK OS — Blueprint Penyelesaian Modul Institusi

**Versi:** 1.0.0  
**Tanggal baseline:** 8 November 2026  
**Status:** spesifikasi implementasi bertahap; bukan bukti modul telah operasional  
**Lingkungan target implementasi:** Development only

Dokumen ini menerjemahkan menu Workspace PONDOK OS menjadi cakupan fungsi, data, alur, laporan, peran, dan uji penerimaan. Implementasi wajib mengikuti izin operasional dan bentuk layanan nyata setiap lembaga. Field internal tidak boleh disamarkan sebagai kewajiban pemerintah.

## 1. Aturan desain lintas-modul

1. Satu sumber data induk untuk setiap orang, lembaga, program, barang, akun, dan lokasi. Modul lain hanya menyimpan foreign key/referensi, bukan membuat identitas duplikat.
2. Semua data operasional memiliki organization_id dan, bila relevan, campus_id. Validasi relasi dilakukan server-side; RLS bukan pengganti authorization API.
3. Semua perubahan penting menyimpan actor, waktu, alasan, nilai/status sebelum-sesudah yang aman, correlation ID, dan sumber tindakan. Jangan masukkan password, token, dokumen mentah, atau nilai kesehatan ke audit metadata.
4. Setiap alur memiliki status eksplisit, prasyarat, pihak pengusul, pemeriksa, penyetuju, penolakan, pembatalan, tenggat, dan histori. Pembuat transaksi tidak boleh menyetujui transaksinya sendiri bila maker-checker diwajibkan.
5. Data kesehatan, identitas resmi, data anak, kasus perlindungan, rekening, pajak, payroll, dan dokumen keluarga harus dipisah dengan klasifikasi restricted, permission khusus, enkripsi, retensi, dan audit akses.
6. Semua form menyediakan validasi server-side, pesan kesalahan yang dapat ditindaklanjuti, pencegahan duplikasi, relasi manusiawi (bukan UUID bebas), pagination, pencarian, filter, ekspor terkendali, dan tampilan kosong yang jujur.
7. Dashboard hanya menampilkan KPI dari query database terotorisasi. Jika belum tersedia, tampilkan “belum tersedia” — jangan angka contoh.
8. Setiap ekspor memiliki tujuan, operator, waktu cut-off, filter, versi skema, jumlah record, hasil validasi, dan checksum.
9. Integrasi EMIS/SIMTREN/Dapodik, bank, pajak, BPJS, tanda tangan elektronik, atau kanal komunikasi hanya boleh disebut terintegrasi setelah spesifikasi resmi, kewenangan, credential, uji sandbox/produksi, dan bukti penerimaan tersedia.
10. Modul baru tidak boleh mengubah Production. Migrasi diuji pada PostgreSQL disposable/branch uji, lalu Development setelah persetujuan yang sesuai.

## 2. Menu dan isi fungsional

### 2.1 Ringkasan

**Tujuan:** gambaran operasional pesantren berdasarkan periode, kampus, dan hak akses pengguna.

- KPI santri aktif, santri baru, santri keluar/lulus, pendaftar PPDB per tahap, kelas/halaqah aktif, tingkat kehadiran, kapasitas asrama, tagihan jatuh tempo, penerimaan, saldo kas/bank, stok kritis, aset dalam perawatan, pegawai aktif, payroll menunggu persetujuan, buku terlambat, dan pengumuman aktif.
- Filter tanggal/periode, tahun ajaran, kampus, program, dan unit; setiap KPI menaut ke daftar data sumber.
- Panel tugas saya: persetujuan tertunda, izin keluar, koreksi presensi, verifikasi dokumen, invoice, PO, payroll, insiden dan tindak lanjut.
- Peringatan: tenggat PPDB, kontrak/izin kedaluwarsa, kapasitas asrama, stok minimum, jatuh tempo tagihan, payroll, backup gagal, dan temuan keamanan.
- Laporan harus membedakan angka real-time, snapshot, dan data yang belum lengkap.
- **Penerimaan:** semua KPI punya query server-side dan permission; filter konsisten; tidak ada angka hard-coded; tenant A tidak pernah melihat tenant B.

### 2.2 Master Data Santri

**Sumber kebenaran:** satu profil santri per orang pada tenant, dengan relasi wali dan riwayat status.

- Identitas inti: nomor induk internal, nama legal, nama panggilan, tempat/tanggal lahir, jenis kelamin, kewarganegaraan, NISN bila terverifikasi, foto privat, kampus, program, tanggal masuk, status dan sumber verifikasi.
- Alamat domisili dan alamat tetap terstruktur: jalan, RT/RW, desa/kelurahan, kecamatan, kabupaten/kota, provinsi, kode pos, negara; simpan riwayat perubahan alamat.
- Pendidikan sebelumnya: asal sekolah/pesantren, jenjang/kelas terakhir, tahun lulus/pindah, dokumen pendukung.
- Keluarga/wali: ayah, ibu, wali sah bila berbeda, hubungan, kontak utama/darurat, alamat korespondensi, bahasa/kanal komunikasi, preferensi komunikasi, status verifikasi dan dasar kewenangan.
- Relasi santri-wali many-to-many: primary contact, legal guardian, emergency contact, pickup permission, financial contact, mulai/akhir berlaku, pembatasan dan dokumen verifikasi.
- Riwayat pendidikan: program, tahun ajaran, kelas/halaqah, mutasi, kenaikan, cuti, lulus, pindah, keluar, alasan dan surat keputusan.
- Data kesehatan berada di submodul terbatas: golongan darah, alergi, kondisi relevan, riwayat kesehatan, obat rutin, kontak darurat, instruksi; enkripsi, akses khusus, audit read, break-glass dan retensi. Jangan taruh pada profil umum.
- Dokumen: jenis, nomor referensi, penerbit, tanggal, expiry, status verifikasi, object key privat, checksum, uploader, akses, retensi. Jangan simpan dokumen publik.
- **Alur:** draft → verifikasi identitas/berkas → aktif → mutasi/cuti → lulus/pindah/keluar → arsip.
- **Laporan:** daftar induk, sebaran umur/jenis kelamin/program/kampus, asal daerah/sekolah, status, data belum lengkap, histori mutasi, kontak wali yang sah.
- **Penerimaan:** NIS unik pada scope yang tepat; NISN tidak dianggap valid tanpa verifikasi; relasi wali konsisten; perubahan data inti diaudit; data kesehatan tidak muncul pada tabel umum.

### 2.3 PPDB

- Konfigurasi tahun/periode/gelombang, kampus, program dan izin, kuota, jalur, jadwal, persyaratan, biaya (jika ada), beasiswa/keringanan, kebijakan pengembalian dana dan kanal informasi.
- Formulir pendaftar, kontak orang tua/wali, alamat, asal sekolah, pilihan program/kampus, kebutuhan akomodasi yang relevan dan persetujuan pemrosesan data.
- Nomor pendaftaran unik, status draft/submitted/verified/incomplete/rejected/accepted/waitlisted/withdrawn/registered.
- Dokumen privat: daftar persyaratan per jalur, unggah aman, verifikasi, alasan penolakan, revisi, expiry dan audit.
- Seleksi: jadwal tes/wawancara, rubrik/komponen, penguji, kehadiran, nilai, catatan terkontrol, rapat keputusan dan berita acara.
- Keputusan: surat diterima/ditolak/daftar tunggu, pejabat penetap, tanggal, alasan, template versi dan pengiriman.
- Daftar ulang: konfirmasi wali, invoice/biaya yang terhubung ke keuangan, pembayaran, kelengkapan, penetapan kampus/program, konversi atomik ke profil santri dan relasi wali.
- **Penerimaan:** tidak ada profil santri ganda; pendaftar hanya dikonversi satu kali; pembayaran tidak dianggap lunas tanpa rekonsiliasi; dokumen anak terlindungi.

### 2.4 Pendidikan & Kurikulum — Akademik

- Profil jalur/bentuk pendidikan, izin, jenjang/tingkat, kurikulum dan versi, capaian/kompetensi, kalender, tahun ajaran dan term.
- Struktur kurikulum: mata pelajaran/kitab/kajian, kelompok, bobot/jam, metode pembelajaran, metode asesmen, capaian dan tanggal berlaku.
- Kelas/rombongan belajar/halaqah: kampus, program, tahun ajaran, tingkat, kapasitas, wali kelas, pengampu dan status.
- Penugasan pengajar, jadwal ruang/waktu, kalender kegiatan, pengganti pengajar dan konflik jadwal.
- Presensi per sesi dan santri; status hadir/izin/sakit/alpa/terlambat; lampiran izin dibatasi; koreksi setelah kunci harus disetujui dan diaudit.
- Penilaian: komponen, rubrik, bobot, skala, remedial, nilai, pengesahan dan histori koreksi.
- Rapor: capaian akademik/diniyah, presensi, catatan wali kelas/pengasuh, persetujuan, tanda tangan/nomor dokumen.
- Kenaikan tingkat, mutasi, kelulusan dan penerbitan dokumen dengan kriteria berversi dan keputusan.
- **Penerimaan:** konfigurasi kurikulum berbeda per program; tidak memaksakan standar sekolah formal pada semua pesantren; nilai terkunci setelah disahkan; semua rekap dapat ditelusuri ke sumber.

### 2.5 Asrama & Kesantrian

- Master asrama, gedung, lantai, kamar, tempat tidur, kapasitas, fasilitas, gender policy, pengasuh, inspeksi keselamatan dan status.
- Penempatan santri dengan validasi kapasitas, kesesuaian kebijakan, tanggal efektif, histori pindah dan petugas.
- Perizinan: tujuan, pemohon, penjemput, identitas/kontak verifikasi, waktu keluar/rencana kembali, persetujuan sesuai kebijakan, pemberi izin, check-out, check-in aktual dan eskalasi keterlambatan.
- Kegiatan harian: jadwal, halaqah, ibadah, piket, pembinaan, partisipasi dan evaluasi.
- Pelanggaran/pembinaan dipisahkan dari kasus perlindungan anak; klasifikasi dan akses berbeda.
- Safeguarding: kanal laporan, triase, tindakan keselamatan segera, petugas perlindungan, rencana keselamatan, rujukan, tindak lanjut, penutupan dan audit akses. Identitas korban/pelapor/saksi dibatasi.
- Kesehatan/asrama: rujukan dan tindak lanjut hanya untuk petugas berwenang; bukan rekam medis fasilitas kesehatan.
- **Penerimaan:** tidak ada double-booking tempat tidur; kapasitas tidak terlampaui; izin memiliki status keluar/kembali; insiden kritis memicu eskalasi; kasus sensitif tidak terlihat pada dashboard umum.

### 2.6 Perpustakaan

- Bibliografi buku/kitab, pengarang, ISBN bila ada, edisi, penerbit, bahasa, subjek, klasifikasi, kata kunci dan katalog.
- Eksemplar/barcode, lokasi/rak/kampus, sumber perolehan, nilai, kondisi dan status.
- Keanggotaan santri/pegawai, aturan kuota dan masa pinjam per kategori.
- Peminjaman, perpanjangan, reservasi, pengembalian, terlambat, hilang/rusak, denda bila kebijakan tertulis menetapkan, pembayaran dan rekonsiliasi.
- Pengadaan koleksi, stock opname, penghapusan dan statistik.
- **Penerimaan:** satu eksemplar tidak dapat dipinjam ganda; status berubah melalui transaksi sirkulasi; denda terhubung ke kebijakan dan keuangan.

### 2.7 Keuangan & Akuntansi

- Master akun, pusat biaya, dana terikat/tidak terikat, program, kampus, periode fiskal dan anggaran.
- Tagihan: komponen biaya, penerima, wali penanggung jawab, periode, jatuh tempo, beasiswa/keringanan, persetujuan dan histori.
- Penerimaan: kuitansi, kanal, referensi transaksi, bukti, alokasi invoice, kas/bank, rekonsiliasi dan pengembalian dana.
- Pengeluaran: permintaan, anggaran, persetujuan, vendor, bukti, pembayaran dan klasifikasi akun.
- Kas kecil, rekening bank, mutasi, transfer antar akun, rekonsiliasi dan kontrol kas.
- Akuntansi double-entry: jurnal draft, lampiran, pemeriksa, posting, reversal, periode terkunci, buku besar, neraca saldo, aktivitas, posisi keuangan dan arus kas sesuai basis akuntansi lembaga.
- Donasi/bantuan: sumber, tujuan/pembatasan, komitmen vs realisasi, kuitansi, penggunaan dan laporan.
- **Penerimaan:** decimal/numeric; jurnal seimbang; posted journal immutable; koreksi melalui reversal; saldo laporan rekonsiliasi dengan ledger; aturan dana terikat terjaga. Jangan klaim standar akuntansi tertentu tanpa penetapan basis akuntansi lembaga dan review akuntan.

### 2.8 Inventaris & Gudang

- Katalog barang, kategori, SKU, satuan baku/konversi, barcode/QR, serial/lot, stok minimum dan status.
- Multi-gudang/lokasi, penanggung jawab, saldo awal, kartu stok dan valuasi.
- Penerimaan, pengeluaran, transfer, retur, penyesuaian, stock opname, selisih dan approval.
- Permintaan barang internal, reservasi, pemenuhan, barang habis pakai dan histori.
- Batch/expiry untuk bahan makanan, obat atau barang berumur simpan bila lembaga mengelola jenis tersebut; kontrol khusus sesuai jenis barang.
- **Penerimaan:** saldo hanya dihitung dari ledger mutasi; tidak boleh edit saldo langsung; stok negatif dicegah kecuali kebijakan eksplisit; transfer harus berpasangan.

### 2.9 SDM & Payroll

- Master pegawai, pendidik, tenaga kependidikan, pengasuh, tenaga pendukung; satu profil orang, beberapa penugasan yang berversi.
- Struktur unit, jabatan, grade, job description, atasan, cost center, kampus dan delegasi kewenangan.
- Rekrutmen, verifikasi, kontrak/penugasan, addendum, masa berlaku, onboarding, evaluasi, mutasi, cuti, nonaktif dan terminasi.
- Presensi, shift, jadwal, koreksi, lembur, izin, cuti dan persetujuan.
- Komponen penghasilan/potongan berversi; formula berdasarkan tanggal berlaku; payroll preview, pemeriksaan, approval maker-checker, payment batch, rekonsiliasi dan slip privat.
- PPh 21, BPJS Kesehatan/Ketenagakerjaan, THR, kompensasi PKWT, lembur dan hak pekerja harus dihitung dari aturan terkini dan status hubungan kerja; parameter tarif tidak boleh hard-coded tanpa effective date dan review.
- **Penerimaan:** payroll yang telah dibayar immutable; koreksi melalui adjustment run; slip hanya terlihat oleh pegawai terkait dan petugas berwenang; pajak/BPJS tidak aktif sebelum parameter tervalidasi.

### 2.10 Pengajar & Struktur Organisasi

- Direktori pendidik/pengajar dan tenaga kependidikan yang tertaut ke master pegawai.
- Jenis pendidik/pengasuh, nomor internal, pendidikan, kompetensi, spesialisasi, pengalaman, sertifikat, masa berlaku dan dokumen privat.
- Unit/departemen dan hierarki, jabatan struktural/fungsional, job description, grade, kepala unit, kampus dan cost center.
- SK pengangkatan/penugasan, riwayat efektif, atasan, penugasan utama/tambahan/plt/proyek, beban mengajar dan wali kelas.
- Bagan organisasi visual, delegasi kewenangan, pengganti pejabat, matriks approval dan histori restrukturisasi.
- **Penerimaan:** satu profil pegawai utama; penugasan historis tidak ditimpa; tidak ada siklus atasan; satu penugasan utama aktif bila kebijakan mensyaratkan; pengajar dapat ditautkan ke jadwal/kelas.

### 2.11 Aset & Pengadaan

- Pemasok/vendor, verifikasi identitas dan rekening, dokumen legal, evaluasi, konflik kepentingan dan status blokir.
- Rencana kebutuhan, permintaan, spesifikasi, kuantitas, pagu, justifikasi dan approval.
- Penawaran vendor, perbandingan, evaluasi, berita acara, PO, kontrak dan perubahan pesanan.
- Penerimaan barang/jasa, pemeriksaan, retur, invoice, pencocokan PO-penerimaan-invoice, pembayaran dan jurnal.
- Register aset tetap: kode, kategori, tanggal/nilai perolehan, sumber dana, lokasi, custodian, serial, kondisi, umur manfaat, metode penyusutan dan akun.
- Serah terima, mutasi, pemeliharaan, inspeksi, stock opname, impairment bila berlaku, pelepasan/penghapusan dan jurnal.
- **Penerimaan:** approval sesuai batas nilai; pemohon tidak menyetujui sendiri; three-way match; event aset append-only; penyusutan mengikuti kebijakan akuntansi yang disahkan.
- Perpres pengadaan pemerintah tidak otomatis berlaku pada pesantren swasta; terapkan hanya jika sumber dana, status badan, perjanjian bantuan/hibah atau ketentuan khusus memang mensyaratkannya.

### 2.12 Website & Pengumuman

- CMS halaman, berita, artikel, agenda, profil program, fasilitas, galeri dan FAQ.
- Editor blok/Markdown aman, preview, media privat/publik, alt text, SEO, slug dan aksesibilitas.
- Alur editorial penulis → editor → approver → jadwal terbit → publikasi → revisi/arsip.
- Pengumuman tersegmentasi per kampus/program/audiens (publik, wali, santri, pegawai), kanal, jadwal, kedaluwarsa dan bukti distribusi.
- Riwayat versi, rollback, moderasi komentar bila ada, audit perubahan dan kebijakan retensi.
- **Penerimaan:** draft tidak tampil publik; perubahan memiliki versi; data anak tidak dipublikasikan tanpa dasar pemrosesan yang sesuai.

### 2.13 CRM, Alumni & Donatur

- Kontak wali yang disinkronkan dari master wali (tanpa duplikasi), alumni, donatur, mitra, relawan dan calon mitra.
- Alumni: tahun lulus, program, status kontak, tracer study, kegiatan, pekerjaan (opsional dan sukarela), kontribusi dan preferensi komunikasi.
- Donatur: identitas, sumber, preferensi, tujuan donasi, komitmen, penerimaan aktual, pembatasan dana, kuitansi dan laporan penggunaan.
- CRM pipeline: prospek, aktivitas, tindak lanjut, pemilik relasi, kampanye, segmentasi dan histori.
- Consent ledger: tujuan, kanal, sumber, bukti, waktu, versi pemberitahuan, penarikan, suppression list dan retensi.
- **Penerimaan:** komunikasi pemasaran tidak dikirim ke kontak tanpa dasar yang sesuai; penarikan persetujuan dihormati; komitmen donasi bukan penerimaan kas.

### 2.14 Tata Kelola Institusi

- Profil lembaga, badan penyelenggara, pimpinan/pengasuh, legalitas, izin operasional, nomor statistik/identitas resmi, dokumen dan masa berlaku.
- Jenis layanan yang benar-benar diselenggarakan: pesantren, satuan pendidikan formal, PDF, SPM, PKPPS, Ma'had Aly, MDT, LPQ, atau bentuk lain sesuai izin.
- Kampus/unit, lokasi, kontak, koordinat opsional, fasilitas, sarana prasarana dan penanggung jawab.
- Struktur organisasi, kebijakan, SOP, keputusan pimpinan, rapat, notulen, register risiko, konflik kepentingan, delegasi dan kontrol internal.
- Register kepatuhan: regulasi, instansi, pasal/ketentuan, berlaku sejak, status, modul terdampak, kontrol, bukti, pemilik, tanggal review dan perubahan.
- Surat masuk/keluar, penomoran, disposisi, tanda tangan, arsip, klasifikasi dan jadwal retensi.
- **Penerimaan:** status izin harus diverifikasi; sistem membedakan data internal dari data resmi; arsip tidak dapat dihapus sembarang.

### 2.15 Semua Modul

- Katalog modul berversi: ID, nama, pemilik, route, permission, dependency, API contract, data induk, event, skema, regulasi, status, versi dan changelog.
- Search, kategori, status kesiapan, permission, dependensi, pemilik proses dan panduan pengguna.
- Status harus dibedakan: planned, schema-ready, API-ready, UI-ready, tested, UAT-passed, production-approved.
- Modul yang tidak diaktifkan tidak boleh menampilkan kontrol yang seolah-olah dapat digunakan.
- Tidak boleh ada kode executable pihak ketiga dari URL/tenant tak tepercaya.

## 3. Regulasi dan cakupan penerapan

Regulasi harus disimpan sebagai referensi berversi dengan status dan tanggal review. Daftar berikut adalah baseline pemetaan, bukan opini hukum dan bukan klaim sertifikasi.

| Rujukan | Area | Cara menerapkan |
|---|---|---|
| UU 18/2019 tentang Pesantren | Tata kelola, fungsi pendidikan/dakwah/pemberdayaan | Profil lembaga, layanan, pengasuh, mutu dan kegiatan sesuai penyelenggaraan |
| PMA 30/2020 | Pendirian/penyelenggaraan pesantren | Legalitas dan data kelembagaan; cek perubahan/aturan teknis terbaru |
| PMA 31/2020 | Pendidikan pesantren | Kurikulum, pendidik, santri, lulusan, sarpras, jenis layanan dan sistem informasi |
| KMA 83/2022 | Pengelolaan data pendidikan Kemenag | Kamus data dan adapter; jangan menganggap format eksternal permanen |
| KMA 91/2025 | Pesantren ramah anak | Safeguarding, pencegahan, pelaporan, eskalasi dan akses terbatas |
| PMA 16/2026 | Organisasi dan tata kerja Kemenag | Perbarui peta instansi/otoritas integrasi; bukan aturan langsung untuk struktur internal pesantren |
| UU 27/2022 | Pelindungan data pribadi | Dasar pemrosesan, minimisasi, hak subjek data, data anak/spesifik, keamanan, retensi dan insiden |
| UU 35/2014 jo. UU 23/2002 dan aturan terkait | Perlindungan anak | Pengasuhan, safeguarding, komunikasi wali dan penanganan kasus |
| UU 12/2022 | Tindak pidana kekerasan seksual | Protokol pelaporan, perlindungan korban, akses dan rujukan; bukan alat investigasi hukum |
| UU 20/2003; PP 57/2021 jo. PP 4/2022 | Sistem pendidikan/SNP | Hanya untuk satuan dan program yang berada dalam cakupannya |
| Permendikdasmen 12/2025 | Standar isi PAUD/dasar/menengah | Aktifkan untuk satuan Dikdasmen terkait, bukan semua pesantren |
| Permendikdasmen 1/2026 | Standar proses PAUD/dasar/menengah | Perencanaan, pelaksanaan dan penilaian proses untuk satuan terkait |
| Permendikdasmen 21/2025 | Standar tenaga kependidikan | Data kualifikasi dan peran untuk satuan terkait |
| UU 17/2023 dan PP 28/2024 | Kesehatan | Batas layanan, rujukan dan pengelolaan informasi kesehatan; aplikasi bukan pengganti fasilitas/tenaga kesehatan |
| PP 35/2021 dan aturan ketenagakerjaan yang berlaku | Kontrak, waktu kerja, lembur, PHK | Terapkan sesuai status hubungan kerja dan cakupan pekerja |
| Ketentuan PPh 21, BPJS dan THR yang berlaku | Payroll | Effective-date rules; review ahli pajak/HR; jangan hard-code tanpa versi |
| UU 25/1992 jo. perubahan terkait dan PP 7/2021 | Koperasi | Aktifkan bila unit usaha benar-benar berbentuk koperasi dan memenuhi ketentuan |
| UU 43/2009 dan aturan kearsipan | Arsip | Klasifikasi, autentisitas, retensi dan pemusnahan terdokumentasi |
| Perpres 39/2019 | Satu Data Indonesia | Metadata, standar, interoperabilitas dan kode referensi |
| Perpres 16/2018 jo. perubahan | Pengadaan pemerintah | Tidak otomatis berlaku pada lembaga swasta; cek sumber dana/status/perjanjian |

### Catatan penting Kemenag 2026

- PMA 16/2026 mengubah organisasi dan tata kerja Kemenag serta membentuk Ditjen Pesantren. Pemetaan kontak/otoritas integrasi perlu diperbarui, tetapi perubahan struktur Kemenag tidak boleh disalahartikan sebagai perubahan struktur organisasi setiap pesantren.
- Informasi Kemenag pada Oktober 2026 menyebut proses verifikasi data santri by-name-by-address dan peralihan data pesantren dari EMIS ke SIMTREN. Karena spesifikasi teknis dapat berubah, PONDOK OS harus menyimpan data kanonik sendiri dan menggunakan adapter eksternal berversi. Jangan mengklaim integrasi otomatis.
- Untuk satuan pendidikan di bawah Kemendikdasmen, aktifkan modul kepatuhan berdasarkan izin dan jenis satuan; jangan menerapkan regulasi sekolah formal pada layanan pesantren yang tidak termasuk cakupannya.

## 4. Model peran minimum

- Pemilik/pimpinan lembaga: kebijakan, penetapan dan laporan tingkat lembaga.
- Administrator lembaga: konfigurasi tenant, pengguna dan referensi.
- Operator data: input/koreksi data sesuai bidang.
- Kepala unit: review dan persetujuan dalam lingkup unit.
- Wali kelas/pengajar: kelas, jadwal, presensi, penilaian sesuai penugasan.
- Pengasuh/musyrif: asrama dan pembinaan sesuai area.
- Petugas perlindungan anak: kasus restricted, tidak otomatis mendapat akses seluruh data kesehatan.
- Petugas kesehatan: data kesehatan sesuai kewenangan dan tujuan.
- Bendahara/kasir: penerimaan/pengeluaran sesuai limit; tidak otomatis dapat posting jurnal.
- Akuntan/reviewer: jurnal, rekonsiliasi dan laporan.
- HR/payroll: data kepegawaian dan payroll restricted.
- Pustakawan, pengelola aset, pengadaan, editor CMS, CRM dan auditor: permission khusus per fungsi.
- Orang tua/wali: portal terbatas hanya untuk santri yang relasinya diverifikasi dan hanya data yang boleh dibagikan.

## 5. Tahapan implementasi dan gerbang rilis

### Tahap A — Master data dan penerimaan santri
Profil lembaga/kampus, santri, wali, dokumen privat, PPDB, konversi diterima ke santri, status lifecycle, dan data-driven Ringkasan.

### Tahap B — Pendidikan dan pengasuhan
Program/kurikulum, kelas, pengajar, jadwal, presensi, penilaian, rapor, asrama, perizinan dan safeguarding.

### Tahap C — Keuangan dan sumber daya
Tagihan/pembayaran, jurnal/laporan, persediaan, pengadaan, aset, pegawai, kontrak, presensi dan payroll.

### Tahap D — Layanan dan tata kelola
Perpustakaan, CMS/pengumuman, CRM/alumni/donatur, dokumen/arsip, register kepatuhan, laporan dan katalog modul.

### Gerbang setiap modul
- [ ] Form dan field wajib/opsional disetujui pemilik proses.
- [ ] Schema/migration diuji pada disposable PostgreSQL.
- [ ] API read/write dan state transition memeriksa permission server-side.
- [ ] RLS ENABLE + FORCE dan kebijakan tenant diuji.
- [ ] Unit, integration, invalid-input, duplicate, authorization, audit dan regression tests lulus.
- [ ] UI role-aware, relation picker tenant-scoped, loading/error/empty state dan accessibility diuji.
- [ ] Ekspor, retensi, backup/restore dan runbook tersedia sesuai risiko.
- [ ] UAT memakai tenant uji dan data sintetis.
- [ ] Regulasi terkini dan applicability diperiksa oleh penanggung jawab lembaga/ahli terkait.
- [ ] Release notes dan status readiness akurat.

## 6. Referensi resmi untuk review

- UU 18/2019: https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019
- PMA 30/2020: https://peraturan.bpk.go.id/Details/176216/peraturan-menag-no-30-tahun-2020
- PMA 31/2020: https://peraturan.bpk.go.id/Details/176475/peraturanmenag-no-31-tahun-2020
- KMA 83/2022: https://jdih.kemenag.go.id/regulation-download/keputusan-menteri-agama-nomor-83-tahun-2022-tentang-pengelolaan-data-pendidikan-pada-kementerian-agama
- KMA 91/2025: https://cdn.kemenag.go.id/storage/archives/kma-no-91-tahun-2025-tentang-peta-jalan-program-pengembangan-pesantren-ramah-anakpdf.pdf
- PMA 16/2026: https://peraturan.bpk.go.id/Details/356938/peraturan-menag-no-16-tahun-2026-perubahan-atas-peraturan-menteri-agama-nomor-33
- UU 27/2022: https://peraturan.bpk.go.id/Details/229798/uu-no-27-
- UU 35/2014: https://peraturan.bpk.go.id/Details/38723/uu-no-35-tahun-2014
- UU 12/2022: https://peraturan.bpk.go.id/Details/207944/uu-no-12-
- Permendikdasmen 12/2025: https://peraturan.bpk.go.id/Details/322494/permendikdasmen-no-12-tahun-2025
- Permendikdasmen 1/2026: https://peraturan.bpk.go.id/Details/344196/permendikdasmen-no-1-tahun-2026
- Permendikdasmen 21/2025: https://peraturan.bpk.go.id/Details/335231/permendikdasmen-no-21-tahun-2025
- PP 35/2021: https://peraturan.bpk.go.id/Details/161904/pp-no-35-tahun-2021
- PP 28/2024: https://peraturan.bpk.go.id/Details/294077/pp-no-28-tahun-2024
- Perpres 39/2019: https://peraturan.bpk.go.id/Details/108813/perpres-no-39-tahun-2019

**Peringatan:** status dan perubahan regulasi harus diperiksa kembali pada JDIH instansi penerbit sebelum fitur kepatuhan dirilis. Pemetaan aplikasi tidak menggantikan nasihat hukum, pajak, akuntansi, atau keputusan regulator.

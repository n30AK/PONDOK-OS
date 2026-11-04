# PONDOK OS — Formulir, Alur Modul, dan Kepatuhan

Dokumen ini membedakan **formulir yang sudah terhubung ke API**, **fondasi data**, dan **alur yang masih harus diselesaikan**. Status CI tidak sama dengan penerimaan operasional oleh pesantren atau pengakuan dari pemerintah.

## Prinsip desain formulir

1. Kumpulkan hanya data yang diperlukan untuk tujuan administrasi yang dijelaskan.
2. Field identitas sensitif (NIK, KK, data kesehatan, biometrik, data anak yang berisiko tinggi, dan dokumen identitas) tidak ditempatkan pada formulir umum.
3. Hubungan antar-record dipilih melalui label yang dapat dibaca; UUID hanya digunakan internal oleh aplikasi/API.
4. Tanggal, nominal, kode, status, dan relasi divalidasi ulang di server. Validasi browser bukan kontrol keamanan.
5. Setiap penulisan record baru melalui endpoint tenant-scoped, pemeriksaan permission, RLS, dan metadata audit minimal. Payload sensitif tidak disalin ke audit metadata.
6. Perubahan status yang memiliki konsekuensi hukum/keuangan memerlukan peran dan alur persetujuan tersendiri; pembuatan draft tidak berarti transaksi disahkan.
7. Persetujuan komunikasi CRM harus dapat dibuktikan dan ditarik kembali. Jangan menganggap data kontak yang tersimpan sebagai persetujuan promosi.
8. Catatan insiden/kesantrian dibatasi untuk petugas berwenang. Isinya harus faktual, proporsional, dan tidak memuat diagnosis atau detail sensitif yang tidak dibutuhkan.

## Formulir yang disediakan pada feature branch

| Kelompok | Formulir | Data utama / kontrol |
|---|---|---|
| Tata kelola | Kampus / satuan lokasi | Kode, nama, jenis kampus, status |
| Akademik | Tahun ajaran dan semester | Kode, nama, tanggal mulai/akhir, status |
| Akademik | Program dan mata pelajaran/kajian | Kode, nama, deskripsi/kategori |
| Akademik | Rombongan belajar / halaqah | Kampus, tahun ajaran, program, kode, nama, kapasitas |
| Akademik | Penempatan kelas | Santri, tahun ajaran, kelas, tanggal dan status |
| Akademik | Sesi dan rekap presensi | Kelas, tanggal, sesi, status kehadiran, catatan |
| Kesantrian | Asrama, kamar, tempat tidur | Kampus, kebijakan penghuni, kapasitas, status |
| Kesantrian | Penempatan tempat tidur | Santri, tempat tidur, tanggal penempatan |
| Kesantrian | Permohonan izin keluar | Santri, waktu keluar/kembali, tujuan, alasan |
| Kesantrian | Pembinaan / insiden | Kategori, tingkat, uraian faktual, waktu; akses terbatas |
| Perpustakaan | Katalog buku/kitab dan eksemplar | ISBN, kode, judul, penulis, penerbit, barcode, rak, status |
| Perpustakaan | Peminjaman | Eksemplar, peminjam, tanggal jatuh tempo |
| Website | Halaman dan pengumuman | Judul, slug, isi, audiens, status, jadwal publikasi, metadata SEO |
| CRM | Kontak, interaksi, komitmen donasi | Jenis kontak, kontak, kanal, subjek, referensi dan nominal komitmen, status persetujuan |
| Aset | Register aset tetap | Kode, nama, kategori, tanggal/nilai perolehan, masa manfaat, status, lokasi |
| Pengadaan | Pemasok, permintaan dan pesanan | Identitas pemasok, nomor permintaan/pesanan, kebutuhan, tanggal, nilai total |
| Keuangan | Bagan akun dan periode buku | Kode/nama akun, tipe akun, rentang periode |
| Keuangan | Jurnal draft dua baris | Periode terbuka, nomor/tanggal, uraian, akun debit/kredit, nominal sama; server menolak jurnal tidak seimbang |
| Inventaris | Barang, gudang, mutasi | Kode barang, satuan, batas minimum, gudang, penerimaan/pengeluaran/transfer dan kuantitas |
| SDM | Data pegawai dan periode payroll | Nomor pegawai internal, nama, kontak, tanggal bergabung, periode dan tanggal bayar |
| PPDB | Periode dan pendaftaran | Data calon santri/wali, program, jalur, alamat ringkas, status seleksi |

Relasi santri pada modul asrama/perpustakaan menggunakan lookup minimum (ID internal, nomor induk, nama), bukan membuka seluruh profil santri. Opsi kampus dan referensi lain ditampilkan dengan nama yang dapat dikenali.

## Acuan regulasi dan batas klaim

- **UU 18 Tahun 2019 tentang Pesantren**: dasar penyelenggaraan pesantren dan fungsi pendidikan, dakwah, serta pemberdayaan masyarakat. https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019
- **PMA 30 Tahun 2020**: pendirian dan penyelenggaraan pesantren. https://peraturan.bpk.go.id/Details/176216/peraturan-menag-no-30-tahun-2020
- **PMA 31 Tahun 2020**: pendidikan pesantren. https://peraturan.bpk.go.id/Details/176475/peraturanmenag-no-31-tahun-2020
- **Perpres 82 Tahun 2021**: pendanaan penyelenggaraan pesantren. https://peraturan.bpk.go.id/Details/177017/perpres-no-82-tahun-2021
- **UU 27 Tahun 2022 tentang Pelindungan Data Pribadi**: tujuan dan dasar pemrosesan, hak subjek data, pengamanan, retensi, serta perlakuan khusus atas data spesifik termasuk data anak. https://peraturan.bpk.go.id/Details/229798/uu-no-27-
- **PP 71 Tahun 2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik**: tata kelola, keamanan, audit trail, manajemen risiko, dan prinsip pelindungan data. https://jdih.komdigi.go.id/produk_hukum/view/id/695/t/common
- **KMA 83 Tahun 2022**: pengelolaan data pendidikan pada Kementerian Agama. https://jdih.kemenag.go.id/regulation-download/keputusan-menteri-agama-nomor-83-tahun-2022-tentang-pengelolaan-data-pendidikan-pada-kementerian-agama
- **KMA 91 Tahun 2025**: peta jalan program pengembangan pesantren ramah anak. https://cdn.kemenag.go.id/storage/archives/kma-no-91-tahun-2025-tentang-peta-jalan-program-pengembangan-pesantren-ramah-anakpdf.pdf

Form aplikasi tidak boleh menyatakan bahwa pesantren telah memiliki izin operasional, NSP, akreditasi, pengesahan, atau status resmi hanya karena field internal telah diisi. Verifikasi dan penerbitan tetap melalui Kementerian Agama/instansi berwenang. Aplikasi juga tidak mengklaim integrasi resmi EMIS/SIMTREN sebelum tersedia spesifikasi, kredensial, izin integrasi, dan uji penerimaan dari pemilik sistem.

## Batas implementasi yang belum boleh disebut operasional penuh

**Batas PR tahap ini:** endpoint tambahan pada feature branch menyediakan pembacaan daftar dan pembuatan record (GET/POST) dengan validasi dasar, permission, RLS, dan audit metadata. Endpoint tersebut belum menyediakan edit/hapus, approval workflow, pembatalan, koreksi, pengembalian, atau rekonsiliasi untuk seluruh domain. Form jurnal hanya membuat draft dua baris seimbang; form mutasi inventaris menulis ledger append-only. Form payroll yang ada belum merupakan mesin penggajian sesuai regulasi. Karena itu, daftar form di atas adalah fondasi input data, bukan pernyataan bahwa semua siklus kerja telah selesai.

| Modul | Pekerjaan yang masih diperlukan |
|---|---|
| Akademik | Kurikulum terstruktur, jadwal, penilaian, rapor, remedial, kenaikan kelas, kelulusan, dan ekspor sesuai spesifikasi pelaporan yang berlaku |
| PPDB | Upload aman, pemeriksaan MIME/ukuran, verifikasi dokumen, penjadwalan tes, daftar ulang, pembayaran, notifikasi, dan portal wali |
| Keuangan | Tagihan, kuitansi, penerimaan, kas/bank, anggaran, rekonsiliasi, laporan keuangan, pembalikan jurnal, dan review akuntan |
| Inventaris | Penerimaan/pengeluaran berbasis dokumen, stok opname, valuasi, reorder, dan rekonsiliasi fisik |
| SDM/Payroll | Kontrak/penugasan, presensi, cuti, lembur, slip gaji, perhitungan PPh 21, BPJS, THR, dan aturan ketenagakerjaan berdasarkan status hubungan kerja serta periode yang berlaku |
| Asrama | Persetujuan wali bila disyaratkan kebijakan, keputusan izin, pencatatan kembali, mekanisme perlindungan anak, pengaduan rahasia, eskalasi dan tindak lanjut insiden |
| Perpustakaan | Pengembalian, perpanjangan, keterlambatan, denda sesuai kebijakan, dan rekonsiliasi koleksi |
| CMS | Persetujuan publikasi, pengelolaan media, histori revisi, aksesibilitas, dan kontrol konten publik |
| CRM | Bukti consent, penarikan consent, daftar komunikasi yang dikecualikan, rekonsiliasi penerimaan donasi dan laporan alumni |
| Pengadaan | Baris item, pembanding penawaran, otorisasi berjenjang, purchase order lengkap, penerimaan barang, faktur dan three-way matching |
| Aset | Penyusutan, pemeliharaan, mutasi, penghapusan, stocktake dan audit fisik |
| Operasional sistem | Backup terenkripsi, uji restore, retensi per kategori, prosedur insiden, live UAT tenant ganda, pemantauan dan pelatihan operator |

Sebagian alur tersebut membutuhkan tabel/constraint/migrasi tambahan. Tidak ada migrasi baru yang diterapkan pada Development atau Production dalam pekerjaan ini. Migrasi lanjutan harus ditinjau dan disetujui terpisah sebelum diterapkan.

## Kriteria sebelum status “siap operasional”

- [ ] Semua field, permission, dan status workflow disetujui penanggung jawab domain.
- [ ] API CRUD/workflow lengkap; tidak hanya form create/list.
- [ ] Uji validasi, duplikasi, status ilegal, dan relasi lintas tenant.
- [ ] Uji RLS dengan dua organisasi dan identitas berbeda.
- [ ] Audit trail, retensi, koreksi, ekspor dan penghapusan sesuai kewajiban.
- [ ] Uji backup/restore dan pemulihan insiden.
- [ ] UAT dengan data sintetis oleh operator, bendahara, pengasuh, guru, pustakawan, dan pengelola.
- [ ] Review regulasi terbaru melalui JDIH dan review pihak yang kompeten.
- [ ] Uji penerimaan eksternal untuk setiap integrasi resmi yang diklaim.

**Status dokumen:** formulir dan API dasar pada feature branch; bukan sertifikasi kepatuhan, bukan bukti integrasi Kemenag, dan belum merupakan persetujuan penggunaan untuk pencatatan resmi lembaga.


## Addendum — pemanfaatan tabel Development yang sudah tersedia

Audit skema Development menemukan beberapa tabel yang sebelumnya belum ditampilkan sebagai formulir. Feature branch kini juga menambahkan menu input dasar berikut tanpa migrasi baru:

| Kelompok | Formulir tambahan | Batas kontrol |
|---|---|---|
| Akademik | Mata pelajaran per kelas dan jam per minggu | Relasi kelas/mata pelajaran harus satu tenant; kombinasi duplikat ditolak constraint |
| Akademik | Data wali dan relasi santri-wali | Hanya nama dan relasi minimum; bukan tempat menyimpan NIK/KK |
| SDM | Pegawai, unit/departemen, jabatan, kontrak kerja | Data kontrak awal berstatus draft; akses berdasarkan permission SDM |
| SDM | Periode penggajian dan draft siklus payroll | Hanya periode open dan run draft; belum menghitung PPh 21, BPJS, THR, lembur, atau take-home pay |
| Pengadaan | Rincian permintaan dan rincian pesanan | Baris detail terpisah dari header; belum ada approval, penerimaan, faktur, atau rekonsiliasi |
| Aset | Riwayat penugasan, perpindahan, pemeliharaan, audit, dan penghapusan | Peristiwa dicatat append-only melalui API; perubahan status aset masih memerlukan alur persetujuan terpisah |

Permintaan pengadaan mengisi kolom pemohon dari identitas JWT server, bukan dari payload browser. Catatan peristiwa aset juga mengisi pencatat dari identitas sesi. Form payroll hanya menyediakan persiapan draft, bukan perhitungan atau pengesahan gaji.

**Catatan status:** penambahan formulir tidak mengubah batas fitur yang belum tersedia. API generik masih list/create; persetujuan, perubahan, pembatalan, pengembalian, dan rekonsiliasi harus dibangun sebagai alur khusus dan diuji sebelum penggunaan resmi.

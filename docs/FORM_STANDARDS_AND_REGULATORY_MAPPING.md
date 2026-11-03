# Standar Formulir dan Kepatuhan PONDOK OS

**Status dokumen:** baseline desain produk dan implementasi bertahap  
**Tanggal tinjauan:** 3 November 2026  
**Cakupan:** pesantren; konfigurasi pendidikan harus mengikuti izin, jenis satuan pendidikan, dan program yang benar-benar diselenggarakan.

Dokumen ini bukan pendapat hukum dan bukan pernyataan bahwa aplikasi telah tersertifikasi atau terintegrasi langsung dengan sistem Kemenag. Sebelum fitur pelaporan eksternal diaktifkan, operator harus memeriksa pedoman teknis dan format resmi terbaru dari unit Kemenag yang berwenang.

## 1. Prinsip desain

1. **Kontekstual per proses:** PPDB, induk santri, akademik, asrama, keuangan, SDM, aset, perpustakaan, dan alumni memiliki formulir, validasi, serta alur persetujuan masing-masing.
2. **Pemisahan kewajiban:** tandai setiap field sebagai (a) elemen data regulasi/sistem pemerintah, (b) kebutuhan operasional internal, atau (c) data opsional. Jangan menjadikan field internal sebagai kewajiban hukum.
3. **Konfigurasi berbasis bentuk layanan:** pendidikan formal, Pendidikan Diniyah Formal, Satuan Pendidikan Muadalah, PKPPS, Ma'had Aly, salafiyah, atau layanan lain hanya diaktifkan bila sesuai izin dan penyelenggaraan lembaga. Jangan memaksakan satu kurikulum/jenjang untuk semua pesantren.
4. **Minimisasi data:** jangan mengumpulkan NIK, nomor KK, data kesehatan, biometrik, atau dokumen identitas melalui form umum. Field berisiko tinggi harus berada pada modul terbatas dengan dasar pemrosesan, tujuan, retensi, dan audit tersendiri.
5. **Jejak proses:** catat pembuat, waktu, status, pemeriksa, pemberi persetujuan, alasan perubahan, dan dokumen pendukung sesuai kebutuhan proses.
6. **Interoperabilitas tanpa mengunci vendor:** model data internal dipisahkan dari adapter ekspor. Pada 4 Oktober 2026 Kemenag menyampaikan proses alih data pesantren dari EMIS ke SIMTREN; karena itu jangan menganggap format EMIS saat ini sebagai kontrak permanen. Adapter SIMTREN/EMIS hanya boleh diaktifkan setelah spesifikasi resmi tersedia.
7. **Klaim terukur:** status "siap" hanya setelah migrasi Development, build, unit/integration tests, tenant-isolation tests, dan uji alur oleh operator berhasil.

## 2. Rujukan regulasi

| Rujukan | Relevansi desain | Catatan implementasi |
|---|---|---|
| UU 18 Tahun 2019 tentang Pesantren | Identitas, penyelenggaraan, fungsi pendidikan/dakwah/pemberdayaan, penjaminan mutu | Profil lembaga dan program harus menggambarkan penyelenggaraan faktual |
| PMA 30 Tahun 2020 tentang Pendirian dan Penyelenggaraan Pesantren | Pendirian, unsur dan penyelenggaraan pesantren | Data legalitas, pimpinan, alamat, unsur pesantren, dokumen pendukung; verifikasi terhadap naskah dan perubahan terakhir |
| PMA 31 Tahun 2020 tentang Pendidikan Pesantren | Bentuk dan penyelenggaraan pendidikan pesantren | Jalur/program pendidikan dan data akademik harus mengikuti bentuk pendidikan yang diselenggarakan |
| KMA 83 Tahun 2022 tentang Pengelolaan Data Pendidikan pada Kementerian Agama | Data induk satuan pendidikan, peserta didik, pendidik/tenaga kependidikan; mutu, pemutakhiran, pengiriman dan berita acara pendataan | Lampiran KMA memuat data profil lembaga dan peserta didik; untuk pengiriman pemerintah gunakan spesifikasi sistem yang berlaku pada saat pengiriman |
| UU 27 Tahun 2022 tentang Pelindungan Data Pribadi | Dasar pemrosesan, tujuan, hak subjek data, keamanan, retensi, data anak dan data spesifik | Terapkan pembatasan akses, minimisasi, catatan persetujuan bila menjadi dasar pemrosesan, dan proses permintaan subjek data |
| Perpres 39 Tahun 2019 tentang Satu Data Indonesia | Standar data, metadata, interoperabilitas, kode referensi | Gunakan kamus data dan kode referensi yang dapat dipetakan |
| KMA 91 Tahun 2025 tentang Peta Jalan Program Pengembangan Pesantren Ramah Anak | Konteks perlindungan dan tata kelola pesantren ramah anak | Modul pengaduan/perlindungan anak perlu akses terbatas dan alur eskalasi; jangan tampilkan kasus sensitif pada dashboard umum |

### Perubahan lanskap pendataan

Pada 4 Oktober 2026 Kemenag menyampaikan proses pemutakhiran data santri berbasis by-name-by-address, konsolidasi data, fasilitasi NPSN bagi kelompok tertentu, sinkronisasi Dapodik, serta peralihan data pesantren dari EMIS ke SIMTREN. PONDOK OS karena itu menyiapkan **data internal yang konsisten + adapter pemetaan**, bukan mengklaim sinkronisasi otomatis.

## 3. Matriks formulir per menu

### A. Profil Lembaga dan Legalitas
- **Identitas:** nama resmi, nama publik, bentuk layanan, status lembaga, alamat lengkap, kode pos, telepon/email, koordinat, situs.
- **Legalitas:** nomor/tanggal izin atau tanda daftar, nomor statistik/identitas lembaga, dokumen keputusan, masa berlaku bila relevan, instansi penerbit, status verifikasi.
- **Penyelenggara:** nama badan/perorangan penyelenggara, dasar pembentukan, alamat, kontak, dokumen pendukung.
- **Pimpinan dan unsur pesantren:** nama pimpinan/pengasuh, struktur pengelola, unsur pendidikan dan asrama sesuai penyelenggaraan.
- **Kampus:** kode, nama, alamat, kontak, koordinat, status aktif.
- **Validasi:** nomor unik tidak duplikat dalam tenant; tanggal dokumen masuk akal; status legalitas harus diverifikasi operator.
- **Status:** belum tersedia sebagai alur CRUD lengkap.

### B. PPDB
- **Gelombang:** tahun ajaran, tanggal buka/tutup, kampus, kuota, jalur seleksi, biaya resmi (bila ada) dan kebijakan keringanan.
- **Pendaftar:** nomor pendaftaran, nama, tempat/tanggal lahir, alamat, asal sekolah, pilihan program, kampus tujuan.
- **Keluarga/wali:** nama orang tua/wali, hubungan, kontak yang dipilih untuk korespondensi.
- **Berkas:** jenis dokumen, nomor referensi internal, tanggal unggah, pemeriksa, hasil verifikasi; berkas anak dibatasi.
- **Seleksi:** jadwal, komponen seleksi, hasil, pewawancara/penguji, catatan yang relevan, keputusan dan alasan.
- **Daftar ulang:** keputusan diterima, konfirmasi, tanggal, pembayaran yang terhubung ke invoice, status registrasi.
- **Status:** belum tersedia; tidak boleh dianggap tercakup hanya karena profil santri dapat dibuat.

### C. Data Induk Santri
- **Inti:** nomor induk, nama sesuai dokumen, nama panggilan, kampus, tanggal lahir, jenis kelamin.
- **Keluarga:** nama ayah/ibu, nama wali bila berbeda, hubungan, telepon/email wali.
- **Domisili:** alamat, provinsi, kabupaten/kota, kecamatan, desa/kelurahan, kode pos.
- **Riwayat:** asal sekolah, pendidikan sebelumnya, tahun masuk, tanggal mulai mondok.
- **Program:** jalur pendidikan dan kategori santri yang benar-benar dipakai lembaga.
- **Asrama:** status mukim/nonmukim/komuter, asrama dan kamar (penempatan operasional dapat berubah).
- **Tidak dikumpulkan pada form umum:** NIK, nomor KK, data kesehatan, biometrik, dan salinan dokumen identitas. KMA 83/2022 menyebut sejumlah elemen identitas untuk data pendidikan; pemrosesan elemen sensitif/berisiko tersebut memerlukan modul terbatas, dasar pemrosesan, kontrol akses, dan pemetaan sesuai spesifikasi pemerintah yang berlaku.
- **Status implementasi:** formulir profil operasional dasar sudah ditambahkan pada branch ini; field sensitif sengaja tidak dibuka.

### D. Akademik dan Penilaian
- Tahun ajaran/semester, satuan/program pendidikan, jenjang/tingkat, kelas/rombongan belajar, mata pelajaran atau kajian/kitab, pengajar, jadwal, kalender, kehadiran, komponen penilaian, nilai, capaian, remedial, rapor, kenaikan tingkat, kelulusan.
- Kurikulum dan struktur mata pelajaran/kitab dapat dikonfigurasi; jangan memaksakan struktur madrasah umum pada seluruh pesantren.
- Persetujuan nilai/rapor dan perubahan nilai harus memiliki aktor dan alasan.
- **Status:** API/CRUD akademik komprehensif belum tersedia.

### E. Kesantrian, Asrama, dan Perlindungan
- Penempatan kamar: kampus, gedung, lantai, kamar, kapasitas, penghuni, tanggal mulai/akhir.
- Perizinan: pemohon, tujuan, waktu keluar/kembali, penjemput, kontak, persetujuan wali bila kebijakan lembaga mensyaratkan, pemberi izin, status kembali.
- Pembinaan: kategori, tanggal, petugas, ringkasan objektif, tindak lanjut, status penyelesaian.
- Pengaduan/perlindungan: kanal, klasifikasi terbatas, petugas berwenang, rencana keselamatan, eskalasi, tindak lanjut; akses tidak boleh sama dengan data akademik umum.
- **Status:** belum tersedia sebagai CRUD.

### F. Keuangan
- Tagihan: santri/penanggung jawab, periode, komponen biaya, nominal, jatuh tempo, kebijakan beasiswa/keringanan, status.
- Pembayaran: nomor kuitansi, tanggal, kanal, nominal, referensi transaksi, penerima, alokasi invoice, bukti.
- Kas/bank: akun, rekening, saldo awal, mutasi, rekonsiliasi, penanggung jawab.
- Akuntansi: bagan akun, periode, jurnal multi-baris, debit/kredit seimbang, lampiran, pembuat, pemeriksa, posting, pembalikan, tutup buku.
- **Status:** API fondasi akun/periode/jurnal sudah ada; invoice, penerimaan santri, pembayaran, anggaran, rekonsiliasi, dan laporan lengkap belum tersedia. Jangan gunakan sebagai pembukuan resmi sebelum diuji dan ditinjau akuntan.

### G. SDM dan Payroll
- Pegawai: nomor pegawai internal, nama, kampus, kontak, tanggal bergabung, status, jabatan, unit, jenis hubungan kerja, dokumen penugasan/kontrak.
- Kehadiran: jadwal, presensi, koreksi, persetujuan atasan.
- Payroll: periode, komponen penghasilan/potongan, dasar perhitungan, penerima, pembuat, pemeriksa, persetujuan, pembayaran dan bukti.
- Pajak, BPJS, THR, ketenagakerjaan, dan kewajiban lain harus diaktifkan berdasarkan status hubungan kerja dan peraturan yang berlaku; jangan menebak tarif atau kewajiban dari formulir generik.
- **Status:** API pegawai/periode/proses payroll fondasi tersedia; kontrak, presensi, komponen legal, slip, pajak dan integrasi pembayaran belum lengkap.

### H. Inventaris, Sarana-Prasarana, dan Pengadaan
- Barang/aset: kode, kategori, nama, spesifikasi, satuan, sumber perolehan, tanggal, nilai, kondisi, lokasi, penanggung jawab, status.
- Mutasi: asal/tujuan, kuantitas, tanggal, alasan, penyerah/penerima, persetujuan.
- Pengadaan: permintaan, kebutuhan, spesifikasi, anggaran, vendor, pembanding, persetujuan, pesanan, penerimaan, pemeriksaan, faktur.
- Pemeliharaan: jadwal, pekerjaan, biaya, vendor, hasil, foto/bukti.
- **Status:** API master barang/gudang/mutasi stok fondasi tersedia; register aset tetap, penyusutan, pengadaan lengkap dan pemeliharaan belum tersedia.

### I. Perpustakaan
- Bibliografi: ISBN/nomor katalog, judul, pengarang, penerbit, tahun, edisi, bahasa, klasifikasi, topik/kitab.
- Eksemplar: barcode, lokasi/rak, kondisi, sumber perolehan, status.
- Sirkulasi: peminjam, tanggal pinjam/jatuh tempo/kembali, perpanjangan, denda bila kebijakan lembaga menetapkan, petugas.
- **Status:** belum tersedia sebagai CRUD.

### J. CRM, Alumni, Donatur
- Alumni: nomor alumni internal, tahun lulus, program, kontak yang bersedia digunakan, status pembaruan.
- Donatur: identitas organisasi/orang, preferensi komunikasi, tujuan bantuan, riwayat donasi, bukti dan pembatasan akses.
- CRM: interaksi, kanal, waktu, petugas, tindak lanjut, status.
- **Status:** belum tersedia sebagai CRUD.

## 4. Aturan validasi lintas modul

- Tanggal memakai ISO date dan validasi tanggal kalender; periode harus konsisten.
- Nomor induk, kode kampus, kode aset, nomor kuitansi, dan kode akun unik pada lingkup yang tepat.
- Nilai uang memakai decimal/numeric, bukan floating point; setiap jurnal harus balance.
- Relasi santri-kampus-program-asrama harus menunjuk record tenant yang sama.
- Status menggunakan state machine yang eksplisit; perubahan status terminal memerlukan alasan dan hak akses.
- Lampiran harus punya jenis, ukuran, checksum, uploader, waktu, status verifikasi, klasifikasi akses, dan masa retensi.
- Ekspor harus mencatat versi skema, waktu cut-off, operator, hasil validasi, jumlah baris, serta checksum file.

## 5. Pelindungan data dan tata kelola akses

- Pisahkan izin baca/tulis data umum, data wali, dokumen, data keuangan, dan catatan perlindungan.
- Jangan menaruh data kesehatan atau catatan perlindungan pada profil umum maupun log aplikasi.
- Tetapkan tujuan pemrosesan, dasar hukum, masa retensi, prosedur koreksi/penghapusan sesuai kewajiban retensi, dan kontak pengendali data.
- Untuk santri anak, desain harus memperhitungkan ketentuan pemrosesan data anak dan keterlibatan orang tua/wali.
- Audit log tidak boleh menyimpan token, password, atau payload sensitif utuh.
- Akses lintas tenant dilarang oleh RLS PostgreSQL dan harus diuji pada tiap endpoint baru.

## 6. Kriteria penerimaan operasional

Modul hanya boleh diberi status operasional setelah:
1. Form sesuai konteks dan field wajib/opsional terdokumentasi.
2. API melakukan validasi server-side dan otorisasi granular.
3. Data tersimpan, dapat dibaca kembali, diperbarui, dan memiliki audit trail.
4. Uji tenant A/B membuktikan data tidak bocor.
5. Uji invalid input, duplikasi, batas ukuran, dan perubahan status lulus.
6. Build dan seluruh test suite lulus.
7. Migrasi diterapkan pada Development dan checksum tercatat.
8. Operator melakukan UAT dengan data dummy, bukan data anak sebenarnya.
9. Backup/restore, retensi, ekspor, dan prosedur insiden diuji.
10. Persyaratan eksternal diperiksa terhadap spesifikasi Kemenag terbaru; integrasi belum boleh diklaim sebelum uji resmi berhasil.

## 7. Sumber resmi untuk verifikasi

- UU 18/2019: https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019
- PMA 30/2020: https://peraturan.bpk.go.id/Details/176216/peraturan-menag-no-30-tahun-2020
- PMA 31/2020: https://peraturan.bpk.go.id/Details/176475/peraturanmenag-no-31-tahun-2020
- KMA 83/2022 (JDIH Kemenag): https://jdih.kemenag.go.id/regulation-download/keputusan-menteri-agama-nomor-83-tahun-2022-tentang-pengelolaan-data-pendidikan-pada-kementerian-agama
- UU 27/2022: https://peraturan.bpk.go.id/Details/229798/uu-no-27-
- KMA 91/2025: https://cdn.kemenag.go.id/storage/archives/kma-no-91-tahun-2025-tentang-peta-jalan-program-pengembangan-pesantren-ramah-anakpdf.pdf
- Kemenag, 4 Oktober 2026 — verifikasi BNBA dan alih data EMIS ke SIMTREN: https://kemenag.go.id/nasional/pendataan-berkelanjutan-jumlah-santri-terverifikasi-bnba-capai-4634-juta-Xes4S

**Penting:** sebelum rilis, lakukan pemeriksaan JDIH untuk perubahan/pencabutan/peraturan turunan terbaru dan mintakan review dari bagian hukum/operator Kemenag setempat.

# Blueprint Formulir Seluruh Menu PONDOK OS

Tanggal baseline: 2026-11-08  
Status dokumen: spesifikasi produk dan acceptance criteria; bukan pernyataan bahwa seluruh modul telah selesai atau tersertifikasi patuh hukum.

## Prinsip desain

1. Setiap menu harus menjadi workspace operasional yang memiliki sub-menu, formulir terstruktur, validasi, daftar/detail, aksi/status workflow, lampiran privat, riwayat/audit, laporan, dan bantuan pengisian.
2. Formulir harus mengikuti jenis lembaga/program yang benar-benar memiliki izin. Jangan menganggap semua pesantren menyelenggarakan jalur formal, muadalah, diniyah formal, Ma'had Aly, atau sekolah di bawah Kemendikdasmen sekaligus.
3. Data master dibuat satu kali dan direlasikan dengan foreign key tenant-scoped. Jangan menyalin identitas santri, wali, pegawai, kampus, program, atau vendor ke tabel transaksi sebagai teks bebas jika relasi tersedia.
4. Field wajib hanya diwajibkan bila berlaku untuk jenis lembaga, program, transaksi, atau dasar hukum terkait. Simpan dasar pengumpulan, tujuan, sumber, verifikator, waktu, masa berlaku, dan retensi untuk data yang relevan.
5. Data anak, identitas, kesehatan, wali sah, payroll, rekening, dan kasus perlindungan anak masuk klasifikasi restricted; enkripsi, masking, least privilege, audit baca/tulis, retensi, dan ekspor terkontrol wajib.
6. Maker-checker untuk pembayaran, jurnal posting, payroll, pengadaan, perubahan hak wali, perubahan struktur, publikasi resmi, dan penghapusan/pelepasan aset. Pembuat transaksi tidak boleh menyetujui transaksi sendiri jika kebijakan mengharuskan pemisahan tugas.
7. Setiap form harus memiliki field schema, API schema, DB constraint, permission, tenant RLS, audit event, automated test, dan E2E test. Tidak ada menu yang dinyatakan operasional hanya karena dapat dibuka.
8. Sinkronisasi EMIS, Dapodik, atau sistem pemerintah hanya boleh diaktifkan setelah skema/API resmi, otorisasi, dan mekanisme pertukaran datanya diverifikasi. Jangan mengarang endpoint pemerintah.

## 1. Ringkasan

### Dashboard
- Filter: kampus, unit, program pendidikan, tahun ajaran, periode keuangan, rentang tanggal.
- Kartu: jumlah santri aktif/calon/lulus/keluar; komposisi santri per program/kampus; kehadiran; kapasitas asrama; tunggakan dan penerimaan; anggaran vs realisasi; saldo kas/bank; stok minimum; aset jatuh tempo pemeliharaan; pegawai aktif; payroll yang menunggu persetujuan; PPDB per tahap.
- Panel kerja: tugas menunggu persetujuan, dokumen/izin akan kedaluwarsa, santri belum lengkap berkas, kasus prioritas (hanya petugas berwenang), tagihan jatuh tempo, stok kritis, kontrak/sertifikat berakhir.
- Aksi cepat: tambah calon santri, tambah santri, catat pembayaran, permintaan pembelian, izin santri, presensi, pengumuman.
- Semua angka drill-down ke daftar transaksi yang menjadi sumbernya; filter dan timestamp harus terlihat. Dashboard bukan tempat mengubah angka agregat.

## 2. Master Data Santri

### A. Profil induk santri
- Identitas: nomor induk internal, kampus, nama sesuai dokumen, nama panggilan, tempat/tanggal lahir, jenis kelamin sesuai dokumen bila dibutuhkan, kewarganegaraan, agama bila diperlukan secara sah, status keluarga bila relevan, bahasa, foto privat.
- Pendidikan: NISN (bila ada dan diverifikasi), sekolah/pesantren asal, jenjang/kelas asal, tahun masuk, program/jalur, gelombang PPDB, status aktif/cuti/pindah/lulus/keluar, tanggal efektif dan alasan.
- Alamat domisili dan alamat sesuai dokumen: jalan, RT, RW, desa/kelurahan, kecamatan, kabupaten/kota, provinsi, kode pos, negara; pisahkan alamat korespondensi.
- Kontak: nomor santri, email (jika ada), kontak darurat; jangan menjadikan kontak santri sebagai pengganti kontak wali.
- Riwayat: mutasi kampus, perubahan nama/alamat/status, kelas, asrama, program, kelulusan, dan alasan perubahan.
- Validasi: nomor induk unik dalam tenant/kampus sesuai kebijakan; tanggal masuk tidak melewati tanggal lahir; status dan tanggal efektif konsisten.

### B. Data orang tua/wali
- Nama lengkap, hubungan (ayah/ibu/wali hukum/wali pengasuh/keluarga lain), alamat, telepon utama/alternatif, email, pekerjaan, bahasa/kanal komunikasi, kontak darurat.
- Penandaan: orang tua biologis, wali sah, wali utama, penanggung jawab biaya, kontak darurat, pihak yang boleh menjemput. Peran ini terpisah; tidak boleh disimpulkan otomatis dari hubungan keluarga.
- Verifikasi: jenis dan referensi dokumen dasar kewenangan, petugas verifikator, tanggal verifikasi, masa berlaku, pembatasan/putusan yang relevan, status aktif/dicabut.
- Persetujuan komunikasi/pemrosesan data: tujuan, kanal, bukti, waktu, versi pemberitahuan, penarikan/pembaruan.

### C. Dokumen identitas
- Jenis dokumen (NIK/KTP wali, KK, akta lahir, NISN, paspor, dokumen lain), nomor terenkripsi, penerbit, tanggal terbit/kedaluwarsa, status verifikasi, petugas dan waktu.
- Lampiran disimpan di object storage privat dengan checksum, MIME/ukuran, versi, klasifikasi, retensi, dan log akses.
- Nomor hanya tampil kepada petugas berwenang; daftar menampilkan masking. Dilarang menaruh NIK/nomor KK di kolom umum atau log.
- Operasi harus fail-closed jika kunci enkripsi tidak tersedia.

### D. Kesehatan dan kebutuhan khusus
- Golongan darah (opsional dan hanya bila relevan), alergi, kondisi/kebutuhan khusus yang relevan untuk keselamatan, riwayat penting, obat rutin, instruksi darurat, fasilitas kesehatan/tenaga kontak, tanggal pembaruan dan sumber/verifikator.
- Catatan peristiwa kesehatan terpisah dari profil umum; akses tenaga kesehatan/petugas yang ditunjuk; audit pembacaan; persetujuan wali sesuai dasar yang berlaku; prosedur akses darurat.
- Jangan membuat diagnosis otomatis atau meminta data medis berlebihan.

### E. Relasi santri-wali dan lifecycle
- Relasi banyak-ke-banyak, hubungan, wali utama, wali sah, kontak darurat, otoritas jemput, batas waktu dan dokumen dasar.
- Alur: calon → diterima → daftar ulang → aktif → pindah/cuti → lulus/keluar → alumni/arsip.
- Form mutasi, pengunduran diri, kelulusan, pengembalian dokumen, clearance perpustakaan/asrama/keuangan, dan surat keputusan.

## 3. PPDB

### A. Pengaturan penerimaan
- Tahun/periode, kode, nama gelombang, tanggal buka/tutup, kampus, program/jalur/jenjang, kuota, biaya resmi, syarat, panitia, status dan pejabat pengesah.
- Form versi persyaratan, daftar dokumen, kriteria seleksi, bobot/rubrik, jadwal tes/wawancara dan template surat.

### B. Formulir calon santri
- Identitas dan alamat calon; sekolah asal; program yang dipilih; minat mukim/non-mukim; informasi kebutuhan aksesibilitas bila diperlukan.
- Orang tua/wali: nama, hubungan, telepon/email, alamat, pihak penanggung biaya, kontak darurat.
- Jawaban formulir khusus program, pernyataan kebenaran data, pemberitahuan privasi dan bukti persetujuan.
- Dokumen: akta lahir, KK, NISN/rapor/ijazah, foto, surat kesehatan bila benar-benar disyaratkan, dokumen lain sesuai jalur; status checklist dan verifikator.
- Nomor identitas sensitif disimpan pada vault, bukan jawaban formulir umum.

### C. Seleksi dan daftar ulang
- Pemeriksaan administrasi, tes akademik/diniyah, baca Al-Qur'an atau kompetensi lain sesuai program, wawancara, observasi/asesmen yang sah, rubrik, nilai, catatan, pewawancara dan jadwal.
- Keputusan: diterima/cadangan/ditolak/perlu dokumen; alasan, pejabat, tanggal dan audit.
- Daftar ulang: konfirmasi, biaya/tagihan, bukti pembayaran, kontrak/pernyataan, penempatan awal, nomor induk, konversi calon menjadi master santri tanpa duplikasi.
- Integrasi: buat profil santri, relasi wali, tagihan awal, penempatan kelas/asrama, akun portal wali jika disetujui.

## 4. Pendidikan & Kesantrian

### A. Akademik dan kurikulum
- Kalender/tahun ajaran, hari efektif/libur, term/semester, program dan bentuk pendidikan, tingkat/kelas, kurikulum dan versi, mapel/kitab/kajian, capaian, bobot/jam, metode pembelajaran.
- Struktur kelas/rombongan belajar/halaqah: kampus, program, tingkat, wali kelas, kapasitas, santri, pengajar, masa berlaku.
- Jadwal: hari, jam, ruang, kelas, mapel, pengajar, kalender bentrok.
- Presensi: sesi, pengajar, santri, status hadir/izin/sakit/alpa/terlambat, alasan/bukti terbatas, koreksi dan pengesahan.
- Penilaian: komponen, rubrik, bobot, nilai, remedial, penguji, tanggal, status final; cegah nilai diubah setelah dikunci tanpa koreksi beralasan.
- Rapor: capaian per mapel/kajian, catatan wali kelas/pengasuh, perkembangan karakter/kompetensi, tanda tangan/pengesahan, versi dan cetak.
- Kenaikan/mutasi/kelulusan: kriteria per program, rapat keputusan, berita acara, SK, nomor ijazah/surat keterangan bila berwenang.
- Program sekolah di bawah Kemendikdasmen memakai profil dan field khusus Dapodik sesuai jenjang/jenis sekolah; jangan dipaksakan pada semua pesantren.

### B. Asrama dan kesantrian
- Master kampus, kompleks/asrama, gedung, lantai, kamar, tempat tidur, kapasitas, fasilitas, kebijakan hunian, pengasuh, inspeksi keselamatan.
- Penempatan: santri, kamar/bed, tanggal mulai/akhir, alasan, persetujuan, histori pindah; cegah double booking dan overcapacity.
- Kegiatan harian: jadwal ibadah, belajar malam, kebersihan, piket, olahraga, kegiatan pembinaan, kehadiran, penanggung jawab.
- Perizinan: tujuan, alasan, waktu keluar/rencana kembali, penjemput dan relasi/otoritasnya, kontak, moda, persetujuan wali/pimpinan sesuai SOP, petugas check-out/check-in, keterlambatan dan eskalasi.
- Pembinaan/insiden: kategori, waktu/lokasi, laporan faktual, korban/saksi/pelapor dengan akses terbatas, tingkat risiko, tindakan keselamatan, petugas perlindungan, rujukan, tindak lanjut, bukti, keputusan dan penutupan. Pisahkan kasus perlindungan anak dari pelanggaran disiplin biasa.
- Kesehatan/asrama: rujukan, kejadian darurat, obat yang dititipkan sesuai SOP, komunikasi wali, tanpa mengekspos catatan medis ke pengasuh yang tidak berwenang.

### C. Perpustakaan
- Katalog: ISBN/kode, judul, pengarang, edisi, penerbit, tahun, bahasa, subjek/klasifikasi, kata kunci, jenis media, hak akses.
- Eksemplar: barcode/RFID, kampus, rak, kondisi, sumber dan harga perolehan, tanggal masuk, status.
- Sirkulasi: anggota, jenis peminjam, eksemplar, tanggal pinjam/jatuh tempo/kembali, perpanjangan, reservasi, hilang/rusak, denda hanya jika ada kebijakan tertulis.
- Pengadaan, stock opname, pemeliharaan, statistik koleksi/peminjaman dan integrasi biaya/denda ke keuangan bila berlaku.

## 5. Tata Kelola & Layanan

### A. Keuangan & akuntansi
- Profil entitas dan kebijakan akuntansi, tahun buku, bagan akun, pusat biaya, kampus/unit, sumber dana dan dana terikat/tidak terikat.
- Anggaran: program/unit, akun, periode, pagu, revisi, persetujuan, realisasi dan varians.
- Tagihan: jenis biaya, santri/pegawai/vendor, periode, rincian, jatuh tempo, keringanan/beasiswa, status.
- Penerimaan: kas/bank/payment channel, nomor bukti, payer, alokasi tagihan/donasi, biaya admin, rekonsiliasi dan kuitansi.
- Pengeluaran: permintaan, bukti, vendor/penerima, akun, sumber dana, pajak bila berlaku, persetujuan, pembayaran dan bukti transfer.
- Kas/bank: rekening, kas kecil, mutasi, rekonsiliasi bank, saldo awal/akhir.
- Akuntansi: jurnal multi-baris, debit=kredit, sumber transaksi, lampiran, draft/review/posting, reversal (bukan edit jurnal posted), tutup periode, neraca, aktivitas/perubahan aset neto, arus kas, buku besar, neraca saldo.
- Donasi dan bantuan dipisah menurut tujuan/pembatasan dana; realisasi dan pelaporan dapat ditelusuri ke sumber dana.
- Audit trail untuk seluruh perubahan dan posting.

### B. Inventaris & gudang
- Master item: SKU, nama, kategori, spesifikasi, satuan, barcode, serial/batch, masa kedaluwarsa bila relevan, batas minimum/maksimum, akun persediaan.
- Gudang/lokasi: kampus, penanggung jawab, alamat, zona penyimpanan.
- Penerimaan: PO, pemasok, surat jalan, kuantitas diterima/ditolak, kondisi, batch/serial, biaya, berita acara.
- Pengeluaran: unit peminta, tujuan, penerima, otorisasi, kuantitas, pusat biaya.
- Transfer: gudang asal/tujuan, pengiriman/penerimaan, selisih dan bukti.
- Stock opname: snapshot, hitung fisik, selisih, berita acara, persetujuan koreksi.
- Kartu stok, reorder, valuasi, barang rusak/kedaluwarsa, histori dan jurnal otomatis sesuai kebijakan.

### C. SDM & payroll
- Pegawai: identitas dasar, nomor internal, kontak, alamat, status, kampus/unit, jabatan, tanggal mulai/akhir.
- Kontrak: jenis hubungan kerja, dasar, masa berlaku, upah/imbalan, jam kerja, dokumen, addendum, notifikasi.
- Presensi, shift, cuti/izin, lembur, perjalanan dinas dan persetujuan.
- Kompetensi, pelatihan, penilaian kinerja dan dokumen sertifikasi.
- Payroll: komponen tetap/tidak tetap, tunjangan, potongan, lembur, THR, PPh 21, BPJS sesuai status, pinjaman/kasbon, koreksi.
- Run payroll: cut-off, simulasi, review, persetujuan, pembayaran, rekonsiliasi, slip gaji privat dan pelaporan.
- Semua formula pajak/iuran harus berversi efektif tanggal dan diverifikasi terhadap peraturan yang berlaku saat periode payroll; jangan hard-code satu tarif permanen.

### D. Pengajar & struktur organisasi
- Profil pengajar ditautkan ke master pegawai: jenis pengajar/ustadz/musyrif/dosen/guru, pendidikan, bidang, pengalaman, sertifikasi, nomor registrasi yang berlaku, status verifikasi.
- Dokumen ijazah/sertifikat: penerbit, nomor, tanggal, masa berlaku, lampiran privat dan verifikator.
- Penugasan mengajar: program, mapel/kitab, kelas/halaqah, jam/beban, tahun ajaran, SK, tanggal efektif.
- Struktur: badan penyelenggara, pimpinan/kiai, direktorat/bidang, unit, departemen, jabatan, atasan, delegasi kewenangan, pusat biaya.
- SK: nomor, tanggal, pejabat penandatangan, lampiran, masa berlaku, status aktif, histori pergantian.
- Bagan organisasi visual dan riwayat per tanggal; perubahan struktur tidak boleh menghapus histori.

### E. Aset & pengadaan
- Register aset: kode, kategori, serial, deskripsi, kampus/lokasi, penanggung jawab, sumber dana, vendor, tanggal dan nilai perolehan, masa manfaat, nilai residu, status, dokumen.
- Permintaan: pemohon/unit, alasan, spesifikasi, kuantitas, anggaran, prioritas, tanggal dibutuhkan, lampiran.
- Penawaran: vendor, harga, pajak, masa berlaku, evaluasi teknis/komersial, konflik kepentingan.
- Persetujuan sesuai matriks nominal dan unit; PO, kontrak, penerimaan, berita acara, invoice dan pembayaran.
- Three-way match: PO vs penerimaan vs invoice sebelum pembayaran.
- Aset: penempatan, serah terima, mutasi, pemeliharaan/work order, inspeksi, penyusutan, impairment bila relevan, stock opname, kehilangan, pelepasan dan jurnal.
- Riwayat aset append-only dan dokumen pendukung.

### F. Website & pengumuman
- Halaman, berita, agenda, pengumuman, kategori, slug, SEO, gambar/lampiran, bahasa, kampus/audiens.
- Workflow editorial: penulis → pemeriksa → penyetuju → jadwal terbit → publikasi → revisi/arsip.
- Versi konten, tanggal publikasi, kanal, status pembacaan/pengiriman bila ada.
- Pemeriksaan privasi sebelum publikasi; foto/nama/data santri tidak dipublikasikan tanpa dasar dan persetujuan yang tepat.

### G. CRM, alumni & donatur
- Kontak dan organisasi, sumber perolehan, relasi ke santri/alumni/vendor, deduplikasi, tujuan komunikasi, dasar pemrosesan, persetujuan dan opt-out.
- Alumni: nomor alumni, angkatan/program, tahun lulus, riwayat pendidikan/pekerjaan opsional, minat kontribusi, komunitas, verifikasi.
- Komunikasi: interaksi, kanal, petugas, hasil, tugas tindak lanjut, preferensi dan suppression list.
- Donatur: identitas minimum yang diperlukan, komitmen, realisasi, sumber dana, tujuan/pembatasan, bukti, kuitansi dan rekonsiliasi keuangan.
- Kampanye, acara, relawan, sponsorship dan laporan dampak; akses data donatur dibatasi.

### H. Tata kelola institusi
- Profil badan penyelenggara dan pesantren: nama resmi, bentuk badan, alamat, pimpinan, pengurus, kontak, kampus, unit, visi/misi, tahun berdiri.
- Legalitas: NS/NSP/izin operasional atau nomor registrasi yang benar-benar berlaku bagi program, instansi penerbit, nomor/tanggal, masa berlaku, lampiran, status verifikasi.
- Struktur tata kelola: organ yayasan/badan hukum, pengasuh/kiai, pimpinan, dewan masyayikh bila relevan, penanggung jawab program, delegasi dan SK.
- Kebijakan, SOP, kode etik, perlindungan santri/anak, privasi, retensi, keselamatan, keuangan, pengadaan, konflik kepentingan dan pengaduan.
- Akreditasi/penjaminan mutu: standar, indikator, bukti, temuan, rencana perbaikan, penanggung jawab, tenggat dan verifikasi.
- Kepatuhan dan pelaporan: daftar kewajiban, kalender, pemilik tugas, bukti pengiriman, tanda terima, revisi; ekspor EMIS/Dapodik hanya setelah skema resmi diverifikasi.
- User, role, permission, approval matrix, audit log, kebijakan sesi, backup/restore, insiden keamanan, permintaan subjek data, retention schedule dan penghapusan legal hold.

## 6. Hubungan data lintas menu

- PPDB accepted → membuat satu master santri → relasi wali → dokumen → tagihan/receipt → kelas → asrama → portal wali.
- Master pegawai → profil pengajar → struktur/jabatan/SK → penugasan kelas → jadwal → presensi → payroll (jika pegawai dibayar).
- Permintaan pengadaan → approval anggaran → PO → penerimaan → inventory/asset register → invoice → pembayaran → jurnal.
- Donasi/pledge → penerimaan kas/bank → pembatasan dana → jurnal → laporan realisasi.
- Presensi santri, kelas, asrama dan kegiatan harus menjadi sumber terpisah tetapi dapat direkonsiliasi.
- Semua relasi wajib tenant-scoped, kampus-scoped bila relevan, dan memiliki foreign-key integrity.

## 7. Dasar regulasi dan cara menerapkannya

Rujukan awal untuk legal mapping (wajib diperiksa kembali terhadap naskah konsolidasi, perubahan terbaru, jenis program, dan kebijakan daerah sebelum rilis):
- UU 18/2019 tentang Pesantren.
- PP 55/2007 tentang Pendidikan Agama dan Pendidikan Keagamaan.
- PMA 30/2020 tentang Pendirian dan Penyelenggaraan Pesantren.
- PMA 31/2020 tentang Pendidikan Pesantren.
- PMA 32/2020 bila lembaga menyelenggarakan Ma'had Aly.
- Untuk satuan pendidikan formal di bawah Kemendikdasmen: UU 20/2003, PP 57/2021 jo. PP 4/2022, serta aturan teknis jenjang yang berlaku pada tahun ajaran. Sebagai contoh aturan terbaru yang perlu dipetakan per jenjang: Permendikdasmen 12/2025 tentang Standar Isi, Permendikdasmen 21/2025 tentang Standar Tenaga Kependidikan, dan Permendikdasmen 1/2026 tentang Standar Proses (berlaku 5 Januari 2026).
- Perpres 82/2021 tentang Pendanaan Penyelenggaraan Pesantren.
- UU 27/2022 tentang Pelindungan Data Pribadi; PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik.
- UU 35/2014 tentang perubahan atas UU Perlindungan Anak dan peraturan perlindungan anak terkait.
- Ketenagakerjaan: UU 13/2003 sebagaimana diubah, UU 6/2023 dan PP 35/2021 beserta ketentuan turunan terbaru; pajak dan BPJS mengikuti aturan efektif periode pembayaran.
- Keuangan pesantren harus menggunakan kebijakan akuntansi yang disahkan lembaga dan standar yang sesuai dengan bentuk entitas; jangan menganggap satu bagan akun atau satu standar cocok untuk semua yayasan/unit usaha.

Sistem harus menyimpan regulatory mapping per field/workflow: kode regulasi, pasal/ayat (setelah diverifikasi), kewajiban, field/bukti yang memenuhi, versi aturan, tanggal efektif, pemilik kepatuhan, status verifikasi dan catatan legal. Daftar di atas bukan pendapat hukum dan bukan sertifikasi kepatuhan.

## 8. Kondisi kode yang teramati pada baseline

- Workspace memiliki 44 resource form/daftar di ModuleWorkspace, termasuk master santri, dokumen identitas, kesehatan, wali, relasi wali, pengajar, struktur pegawai, akademik, asrama, perpustakaan, CMS, CRM, aset dan pengadaan.
- API memiliki 42 resource generik; dokumen identitas dan profil kesehatan memakai handler khusus.
- PPDB mempunyai alur periode, aplikasi, review/keputusan dan konversi pendaftaran.
- Operasional finance/inventory/HR yang tampak di Operations saat ini masih menyediakan subset form: bagan akun, periode buku, jurnal dua baris, barang, gudang, mutasi stok, pegawai, periode payroll. Itu belum merupakan keseluruhan workflow keuangan, gudang, HR dan payroll.
- App shell menandai akademik, PPDB, perpustakaan, CMS sebagai fondasi; finance, inventory dan HR memiliki API; boarding dan CRM ditandai direncanakan. Status ini harus diselaraskan dengan acceptance test aktual.
- Belum ada tenant Development aktif untuk pilot pada saat baseline audit. Karena itu, belum ada UAT tenant yang sah.
- `STUDENT_IDENTITY_ENCRYPTION_KEY` belum tersedia pada Development Function pada saat baseline; fitur dokumen identitas harus tetap fail-closed.
- Neon Production tidak termasuk ruang lingkup dokumen atau pengujian Development.

## 9. Definition of Done per menu

Menu hanya boleh berstatus operasional setelah:
1. Form dan detail mencakup field yang disetujui serta conditional logic berdasarkan jenis lembaga/program.
2. Validasi frontend dan backend, database constraints, relasi, deduplication, dan lifecycle berjalan.
3. Role/permission dan tenant RLS diuji negatif dan positif.
4. Audit create/read/update/approve/export/delete sesuai klasifikasi.
5. Dokumen privat, enkripsi, masking, retensi, backup/restore dan pemulihan diuji bila relevan.
6. Workflow end-to-end diuji dengan dua tenant dan role berbeda; tidak ada kebocoran lintas tenant.
7. Laporan/ekspor direkonsiliasi ke sumber data; tidak ada angka hard-coded.
8. UAT disetujui perwakilan lembaga; kebijakan lokal dan legal mapping diverifikasi.
9. Deployment dan smoke test berhasil pada Development/Staging. Production tetap membutuhkan persetujuan terpisah.

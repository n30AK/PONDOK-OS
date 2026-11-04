# Katalog Formulir, Master Data, dan Integrasi Modul PONDOK OS

**Versi katalog:** 1.0.0  
**Tanggal tinjauan:** 4 November 2026  
**Baseline aplikasi:** `main` pada saat PR dibuat  
**Cakupan perubahan kode:** metadata formulir dan navigasi Master Data; tidak menambah/mengubah skema database.

> Dokumen ini adalah spesifikasi produk dan pemetaan kepatuhan, bukan pendapat hukum, bukan sertifikasi, dan bukan bukti bahwa seluruh fitur sudah tersedia. Kolom yang belum didukung API/DB ditandai **Rencana**, bukan ditampilkan seolah-olah sudah tersimpan. Persyaratan yang bergantung pada bentuk pendidikan, izin, status pekerja, jenis transaksi, atau kebijakan lembaga harus dikonfigurasi per institusi.

## 1. Prinsip formulir

Setiap formulir operasional harus mempunyai:
- identitas record dan nomor dokumen yang unik dalam tenant;
- bagian data inti, relasi ke master, rincian, dokumen pendukung, dan catatan;
- label wajib/opsional dengan alasan dan sumber aturan;
- validasi format, rentang, tanggal, duplikasi, relasi lintas data, dan status;
- klasifikasi data: publik, internal, rahasia, atau terbatas;
- status proses dan persetujuan sesuai kewenangan;
- audit pembuat, pemeriksa, penyetuju, waktu, alasan koreksi, dan versi;
- pencarian, filter, pagination, ekspor, dan laporan sesuai izin;
- kebijakan retensi dan pemusnahan/pengarsipan.

Jangan menyamakan *required* di aplikasi dengan kewajiban hukum. Field wajib hukum harus memiliki rujukan pasal/lampiran dan applicability yang jelas. Field internal wajib hanya karena kebijakan lembaga diberi label “kebijakan internal”.

## 2. Regulasi dan batas penerapannya

| Rujukan | Status/ruang lingkup yang terverifikasi | Dampak desain |
|---|---|---|
| UU 18/2019 tentang Pesantren | Dasar pengakuan dan penyelenggaraan fungsi pendidikan, dakwah, pemberdayaan masyarakat | Profil lembaga, penyelenggaraan faktual, tata kelola, mutu, pendanaan |
| PMA 30/2020 tentang Pendirian dan Penyelenggaraan Pesantren | JDIH/BPK mencatat berlaku | Form legalitas, penyelenggara, unsur pesantren dan dokumen verifikasi |
| PMA 31/2020 tentang Pendidikan Pesantren | JDIH/BPK mencatat berlaku | Program pendidikan, kurikulum, proses pembelajaran dan data peserta didik sesuai bentuk pendidikan |
| PMA 32/2020 tentang Ma'had Aly | Berlaku bila institusi menyelenggarakan Ma'had Aly; verifikasi ketentuan terbaru sebelum aktivasi | Modul khusus perguruan tinggi pesantren tidak dipaksakan kepada lembaga lain |
| KMA 83/2022 tentang Pengelolaan Data Pendidikan pada Kemenag | Naskah JDIH memuat data induk, data pokok, data program dan pengelolaan EMIS | Data profil satuan pendidikan, peserta didik, pendidik dan tenaga kependidikan; siapkan mapping/ekspor versi resmi |
| UU 20/2003 tentang Sistem Pendidikan Nasional | Berlaku dengan perubahan/putusan yang tercatat | Konfigurasi sesuai jalur, jenjang dan bentuk satuan pendidikan |
| UU 27/2022 tentang Pelindungan Data Pribadi | Berlaku; mengatur dasar pemrosesan, hak subjek, keamanan dan kewajiban pengendali/prosesor | Minimasi data, tujuan, dasar pemrosesan, akses terbatas, retensi, pemenuhan hak subjek dan penanganan insiden |
| PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik | Berlaku | Tata kelola PSE, prosedur, audit, keamanan, dan pelindungan data |
| UU 23/2002 sebagaimana diubah UU 35/2014 dan UU 17/2016 tentang Perlindungan Anak | Berlaku dengan perubahan | Perlindungan anak, pengaduan, akses rahasia, keselamatan dan tindak lanjut |
| Perpres 82/2021 tentang Pendanaan Penyelenggaraan Pesantren | Berlaku | Sumber, penggunaan, pemantauan dan evaluasi dana pesantren |
| Perpres 39/2019 tentang Satu Data Indonesia | Relevan untuk tata kelola referensi dan interoperabilitas | Kamus data, metadata, kode referensi, standar dan interoperabilitas |
| Ketenagakerjaan: UU 13/2003 sebagaimana diubah UU 6/2023; PP 35/2021; PP 36/2021 sebagaimana diubah PP 51/2023 dan PP 49/2025 | Berlaku sesuai ruang lingkup hubungan kerja; cek ketentuan sektoral dan putusan terbaru | Kontrak, masa kerja, waktu kerja, pengupahan, PHK dan hak pekerja |
| PPh 21: PMK 168/2023 dan ketentuan perubahan/insentif yang berlaku | Petunjuk pemotongan PPh 21; aturan dapat berubah per tahun pajak | Payroll harus memakai tabel/parameter pajak terversi per masa pajak |
| Jaminan sosial: Perpres 82/2018 sebagaimana diubah terakhir Perpres 59/2024; PP 44/2015 sebagaimana diubah PP 82/2019 dan PP 49/2023; aturan teknis terkait | Berlaku sesuai jenis kepesertaan | Data kepesertaan dan iuran hanya untuk pekerja yang relevan; parameter tidak boleh hard-coded permanen |

**Peringatan:** KMA 83/2022 memuat beberapa elemen identitas (termasuk NIK/KK dan nama ibu kandung) untuk data pendidikan. Elemen tersebut tidak boleh ditempatkan pada formulir umum yang dapat dibaca semua petugas. Gunakan ruang data terbatas, tujuan pemrosesan dan dasar yang terdokumentasi, enkripsi/akses minimum, log akses, dan pemetaan ke format resmi saat ekspor. Jangan mengumpulkan salinan dokumen atau nomor identitas jika tidak diperlukan untuk tujuan yang sah.

## 3. Menu dan formulir

### A. Tata kelola lembaga dan organisasi

#### Profil lembaga dan legalitas — **Rencana perluasan**
- Identitas: nama resmi, nama publik, nama singkat, bentuk penyelenggara, jenis/bentuk layanan, jenjang, status, tanggal mulai operasional.
- Identitas Kemenag: nomor statistik/identitas satuan, NSP/NPSN bila berlaku, status validasi, kantor Kemenag pembina.
- Legalitas: jenis dokumen, nomor, tanggal terbit, instansi penerbit, tanggal berlaku/berakhir, file, checksum, verifikator, tanggal verifikasi, catatan.
- Penyelenggara: jenis badan (yayasan/perkumpulan/perseorangan/kelompok sesuai ketentuan), nama, nomor akta/registrasi, notaris/instansi, tanggal, alamat, pengurus.
- Pimpinan/pengasuh: nama, jabatan, masa tugas, dasar pengangkatan, kontak kedinasan.
- Lokasi: alamat berjenjang, kode pos, telepon, email, website, titik koordinat, status verifikasi.
- Data pokok: rekening lembaga, NPWP bila relevan, prestasi, kurikulum, ekstrakurikuler, sarana-prasarana, penelitian/pengabdian bila relevan.
- Lampiran: izin/tanda daftar, akta, SK, bukti alamat, foto lokasi dan dokumen pendukung.
- Persetujuan: operator input → tata usaha verifikasi → pimpinan sahkan.
- Validasi: nomor unik, tanggal berlaku, status dokumen, kewenangan penandatangan.

#### Kampus / Satuan Lokasi — **Ada: dasar**
- Saat ini: kode, nama, jenis kampus, status.
- Perlu: alamat lengkap, kode wilayah, kode pos, kontak, koordinat, pimpinan lokasi, kapasitas/fungsi, tanggal operasional, dokumen pendukung dan verifikasi.
- Relasi: profil lembaga, santri, program, kelas, asrama, pegawai, gudang dan aset.

#### Struktur organisasi — **Rencana**
- Unit: kode, nama, induk unit, kampus, kepala unit, pusat biaya, tanggal berlaku, status.
- Jabatan: kode, nama, level/grade, jenis jabatan, uraian tugas, kewenangan, persyaratan, atasan.
- Struktur: pejabat, unit, jabatan, SK penugasan, masa mulai/akhir, pejabat pengganti.

### B. PPDB dan data santri

#### PPDB / Penerimaan Santri Baru — **API dasar ada; workflow belum lengkap**
- Gelombang: kode, tahun ajaran, program, kampus, tanggal buka/tutup, kuota, jalur, biaya dan kebijakan keringanan.
- Pendaftar: nomor pendaftaran, nama, tempat/tanggal lahir, jenis kelamin, alamat, asal sekolah, pilihan program/kampus, status.
- Orang tua/wali: nama, hubungan, kontak utama, alamat korespondensi, wali sah dan dasar verifikasi bila diperlukan.
- Dokumen: jenis, nomor referensi, nama file, tipe MIME, ukuran, waktu unggah, status pemeriksaan, pemeriksa, alasan penolakan.
- Seleksi: jadwal, jenis tes/wawancara, penguji, rubrik, skor, hasil, rekomendasi, alasan keputusan.
- Keputusan: diterima/cadangan/ditolak/perlu dokumen, penyetuju, tanggal, alasan dan bukti pemberitahuan.
- Daftar ulang: konfirmasi, tanggal, invoice, pembayaran, beasiswa/keringanan, status registrasi.
- Konversi: pendaftar diterima → profil santri → relasi wali → penempatan program/kelas; transaksi harus idempotent.
- Validasi: cegah pendaftar ganda, tanggal di luar periode, kuota terlampaui tanpa override beralasan, dan keputusan oleh role tidak berwenang.

#### Induk santri — **Fondasi terpisah; perlu penyatuan master**
- Identitas umum: nomor induk, nama sesuai dokumen, nama panggilan, tempat/tanggal lahir, jenis kelamin, agama, kewarganegaraan.
- Domisili: alamat, RT/RW bila digunakan, desa/kelurahan, kecamatan, kabupaten/kota, provinsi, kode pos.
- Pendidikan: asal sekolah, NPSN/identitas asal bila tersedia, tahun lulus, program, tanggal masuk, status santri.
- Keluarga: relasi wali, kontak darurat, preferensi komunikasi.
- Status mondok: mukim/nonmukim/komuter, kampus, tanggal mulai/akhir, status aktif/cuti/pindah/lulus/keluar.
- Data pendidikan Kemenag: elemen yang diminta KMA 83/2022 harus berada pada subform terbatas dan hanya diproses bila diperlukan serta memiliki dasar yang sesuai.
- Dokumen: daftar dokumen, status verifikasi, masa berlaku, lokasi penyimpanan, hak akses dan retensi.
- Jangan simpan diagnosis atau riwayat kesehatan pada profil umum. Kebutuhan kesehatan harus berada di modul medis terbatas dengan petugas berwenang.

#### Orang tua / wali — **Ada dasar sangat minimal**
- Identitas: nama, nama panggilan, hubungan, status wali sah, pekerjaan opsional, alamat.
- Kontak: telepon, email, kontak darurat, kanal pilihan, jam yang diizinkan.
- Verifikasi: sumber dokumen, pemeriksa, tanggal, status dan dasar kewenangan.
- Relasi santri: jenis hubungan, wali utama, akses portal, persetujuan/otorisasi, tanggal mulai/akhir, pembatasan hukum bila ada.
- Hak akses portal wali tidak boleh otomatis sama dengan hak akses internal staf.

### C. Akademik dan mutu pendidikan

#### Master akademik — **Sebagian ada**
- Tahun ajaran: kode, nama, tanggal mulai/akhir, status, kalender.
- Semester/term: tahun induk, kode, nama, tanggal, status, kalender evaluasi.
- Program pendidikan: bentuk, jalur, jenjang/tingkat, izin/rujukan, kurikulum yang digunakan.
- Kurikulum: nama, versi, tanggal berlaku, tingkat, struktur, mata pelajaran/kitab, capaian, alokasi waktu, metode asesmen.
- Mata pelajaran/kajian: kode, nama, kategori, bahasa, sumber kurikulum, satuan/bobot, status.
- Kelas/halaqah: kode, nama, kampus, program, tahun, tingkat, kapasitas, wali kelas, pengajar, status.
- Penempatan kelas: santri, periode, kelas, tanggal mulai/akhir, alasan, pemeriksa.
- Pengajar: pegawai, kompetensi, jadwal, kelas, mata pelajaran/kajian, masa penugasan.
- Kalender: hari efektif, libur, ujian, kegiatan pesantren, tanggal pembagian rapor.

#### Jadwal pembelajaran — **Rencana**
- Kalender, hari, sesi, jam mulai/akhir, ruang, kelas/halaqah, pengajar, materi.
- Validasi bentrok ruang, pengajar, kelas, dan jam; pengecualian harus disahkan.

#### Presensi — **Ada dasar**
- Sesi: kelas, tanggal, jam, mata pelajaran/kajian, pengajar, jenis kegiatan, status buka/kunci.
- Baris santri: santri, status hadir/izin/sakit/alpa/terlambat, waktu, pencatat, alasan.
- Lampiran izin dibatasi; catatan kesehatan tidak tampil di daftar umum.
- Koreksi: alasan, pembuat, penyetuju, waktu, nilai sebelum/sesudah.
- Laporan: rekap harian, bulanan, per kelas, per santri dan tindak lanjut.

#### Penilaian, rapor, kenaikan dan kelulusan — **Rencana**
- Komponen penilaian: kode, nama, bobot, rentang, jenis asesmen, versi.
- Nilai: santri, mata pelajaran/kajian, term, komponen, nilai, deskripsi capaian, penguji, tanggal.
- Remedial: dasar, jadwal, hasil, pengesah.
- Rapor: ringkasan nilai, capaian, presensi, catatan wali kelas/pengasuh, persetujuan.
- Kenaikan/kelulusan: kriteria versi, hasil rapat, keputusan, nomor dokumen, pengesah, tanggal, status keberatan.
- Nilai yang sudah disahkan tidak boleh diubah diam-diam; gunakan koreksi terversi.

### D. Kesantrian, asrama dan perlindungan

#### Asrama, kamar, tempat tidur — **Ada dasar**
- Asrama: kode, nama, kampus, kebijakan penghuni, pengasuh, kapasitas, fasilitas, inspeksi, status.
- Kamar: kode, blok/lantai, kapasitas, fasilitas, kondisi, inspeksi terakhir, status.
- Tempat tidur: kode, kamar, kondisi, status tersedia/terisi/perbaikan/reservasi.
- Penempatan: santri, tempat tidur, tanggal mulai/akhir, petugas, persetujuan, alasan pindah.
- Validasi: tidak boleh melebihi kapasitas, tidak boleh ada penempatan aktif ganda, dan kebijakan penghuni harus konsisten.

#### Perizinan keluar — **Ada dasar; perlu alur lengkap**
- Pemohon/santri, tujuan, alasan, waktu keluar/rencana kembali, jenis izin, penjemput, hubungan, kontak, moda perjalanan.
- Persetujuan wali bila kebijakan lembaga/keadaan mengharuskan, petugas pemberi izin, pemeriksaan keberangkatan.
- Realisasi: waktu keluar, petugas, waktu kembali, kondisi saat kembali, keterlambatan, eskalasi.
- Status: draft → diajukan → menunggu wali → disetujui/ditolak → keluar → kembali/terlambat.
- Data kontak dan lokasi perjalanan hanya untuk petugas yang memerlukan.

#### Pembinaan, pengaduan dan perlindungan anak — **Fondasi insiden ada; belum layak untuk kasus sensitif**
- Pisahkan catatan pembinaan umum dari laporan dugaan kekerasan/pelecehan/eksploitasi/ancaman keselamatan.
- Kasus terbatas: nomor kasus, waktu/lokasi, pelapor, korban, saksi, kategori, urgensi, ringkasan faktual, langkah perlindungan segera, petugas perlindungan, rujukan, rencana tindak lanjut, status.
- Data identitas korban/pelapor/saksi, keterangan sensitif dan dokumen hanya dapat diakses role khusus.
- Audit akses kasus wajib dicatat; hindari data sensitif dalam log aplikasi umum.
- Jangan membuat kesimpulan pidana/medis otomatis. Eskalasi ke pihak berwenang sesuai prosedur.
- Kriteria keselamatan, larangan pembalasan, kanal pengaduan aman, dan SOP lembaga harus dapat dikonfigurasi.

### E. Keuangan dan akuntansi

#### Master akun dan periode — **Ada dasar**
- Akun: kode, nama, jenis aset/liabilitas/ekuitas/pendapatan/beban, akun induk, akun kontrol, status, tanggal berlaku.
- Periode: kode, nama, tanggal mulai/akhir, status buka/tutup, pengunci, tanggal penguncian.
- Pemetaan dana: sumber dana, pembatasan, program, kampus, proyek, donor bila relevan.

#### Anggaran — **Rencana**
- Tahun/periode, unit, pusat biaya, program, akun, pagu, revisi, sumber dana, penyetuju.
- Realisasi, komitmen, sisa anggaran, alasan perubahan dan histori persetujuan.

#### Tagihan dan pembayaran — **Rencana**
- Tagihan: nomor, santri/penanggung, periode, komponen biaya, nominal, diskon/beasiswa, jatuh tempo, status.
- Pembayaran: nomor kuitansi, tanggal, kanal, rekening/kas, nominal, referensi bank, bukti, penerima, alokasi tagihan.
- Refund, pembatalan, koreksi dan tunggakan harus memiliki alasan dan persetujuan.
- Jangan menampilkan data tunggakan santri kepada pengguna yang tidak memiliki kebutuhan kerja.

#### Kas/bank dan jurnal — **Fondasi API ada; workflow perlu diperluas**
- Rekening: bank, nama pemilik, nomor tersamarkan, cabang, mata uang, status verifikasi, pengguna berwenang.
- Mutasi: tanggal, referensi, nilai, debit/kredit, saldo, sumber.
- Jurnal: nomor, tanggal, periode, deskripsi, referensi sumber, baris akun, debit/kredit, lampiran, pembuat, reviewer, penyetuju, status.
- Posting harus seimbang, periode terbuka, bukti tersedia, maker-checker dan audit.
- Koreksi transaksi yang telah diposting menggunakan jurnal pembalik/penyesuaian, bukan mengubah ledger.

#### Donasi dan dana terikat — **Komitmen dasar ada**
- Donatur, referensi komitmen, jumlah, mata uang, tanggal, tujuan, pembatasan penggunaan, jadwal.
- Penerimaan nyata, kuitansi, rekening, bukti, rekonsiliasi, alokasi dana, laporan penggunaan.
- Pisahkan janji donasi dengan kas diterima; patuhi sumber dan pembatasan dana.

### F. Inventaris, pengadaan dan aset

#### Barang, satuan dan gudang — **API dasar ada**
- Barang: kode, nama, kategori, spesifikasi, satuan dasar, barcode, stok minimum, status.
- Satuan: kode baku, nama, presisi, konversi yang sah.
- Gudang: kode, nama, kampus, lokasi, penanggung jawab, status.
- Saldo stok dihitung dari ledger; jangan edit saldo langsung.
- Stok opname: periode, lokasi, penghitung, hasil sistem/fisik, selisih, alasan, persetujuan, jurnal penyesuaian.

#### Mutasi persediaan — **Ledger dasar ada**
- Penerimaan: barang, gudang, kuantitas, biaya satuan, pemasok/PO, tanggal, dokumen.
- Pengeluaran: barang, gudang, penerima/unit, tujuan, kuantitas, persetujuan.
- Transfer: gudang asal/tujuan, kuantitas, status kirim/terima, petugas.
- Penyesuaian: alasan, bukti, pemeriksa dan penyetuju.
- Validasi stok negatif, kuantitas positif, satuan konsisten, dan transfer atomik.

#### Pengadaan dan pemasok — **Fondasi dasar ada**
- Vendor: legalitas, alamat, PIC, kontak, NPWP bila relevan, rekening tervalidasi, dokumen, due diligence, status.
- Permintaan: nomor, unit, pemohon, tanggal, kebutuhan, justifikasi, rincian barang/jasa, kuantitas, spesifikasi, estimasi, akun/pagu, lampiran.
- Persetujuan: matriks nilai/jenis, pemeriksa anggaran, konflik kepentingan, keputusan dan alasan.
- Penawaran: vendor, tanggal, masa berlaku, harga, pajak, syarat, evaluasi teknis/komersial.
- PO: nomor, vendor, sumber permintaan, item, harga, pajak, diskon, termin, alamat kirim, jadwal, otorisasi.
- Penerimaan: jumlah dipesan/diterima/ditolak, kondisi, berita acara, petugas, tanggal.
- Invoice dan pembayaran dicocokkan dengan PO dan penerimaan (three-way match).

#### Aset tetap — **Register dasar ada**
- Kode, nama, kategori, kampus/lokasi, pemegang, sumber dana, nomor dokumen, tanggal perolehan, nilai, tanggal siap pakai, masa manfaat, metode penyusutan, akun.
- Event: penempatan, pindah, pemeliharaan, audit fisik, hilang/rusak, pelepasan.
- Pelepasan/penghapusan harus punya alasan, bukti, penilaian dan persetujuan.
- Rekonsiliasi register aset dengan akuntansi.

### G. SDM dan payroll

#### Pegawai, unit, jabatan — **Fondasi dasar ada**
- Pegawai: nomor, nama, nama pilihan, jenis tenaga, kampus/unit, jabatan, tanggal masuk, status, kontak.
- Data rahasia terpisah: identitas resmi, NPWP, nomor BPJS, rekening gaji, alamat, kontak darurat, data keluarga dan dokumen.
- Kualifikasi: pendidikan, sertifikat, kompetensi, pengalaman, mata pelajaran yang diampu, masa berlaku.
- Unit/jabatan: kode, nama, atasan, job description, grade, pusat biaya, kewenangan, masa berlaku.
- Dokumen penugasan, SK, kontrak, evaluasi dan histori status.

#### Kontrak — **Fondasi dasar ada**
- Jenis hubungan, dasar hukum/template, nomor, tanggal mulai/akhir, lokasi, jabatan, jam kerja, upah/komponen, hak/kewajiban, masa percobaan jika sah, klausul, lampiran, tanda tangan, addendum.
- Template harus terversi dan dipilih berdasarkan status hubungan kerja; validasi oleh HR/legal sebelum dipakai.
- Pengingat masa berlaku dan proses perpanjangan/akhir hubungan.

#### Payroll — **Fondasi periode dan run ada; perhitungan belum lengkap**
- Komponen: kode, nama, earning/deduction, formula versi, dasar, objek pajak, BPJS, tanggal efektif.
- Periode: tanggal, cut-off, tanggal bayar, status.
- Run: pegawai, kehadiran, komponen, bruto, tunjangan, lembur, THR, potongan, PPh 21, iuran BPJS, neto, rekening tujuan, status.
- Review dan approval terpisah dari pembuat; hasil yang dibayar dikunci.
- Slip gaji rahasia per pegawai; ekspor pajak dan BPJS mengikuti format resmi terbaru.
- Jangan hard-code tarif pajak, UMP/UMK, iuran, atau parameter tahunan. Gunakan parameter terversi dengan tanggal berlaku dan sumber resmi.

### H. Perpustakaan

- Bibliografi: kode, ISBN bila ada, judul, subjudul, pengarang, editor, edisi, penerbit, tahun, bahasa, klasifikasi/subjek, sumber perolehan, hak akses.
- Eksemplar: barcode, lokasi/rak, kampus, tanggal perolehan, harga, kondisi, status.
- Anggota: jenis, referensi santri/pegawai, masa berlaku, batas pinjam.
- Transaksi: peminjaman, jatuh tempo, perpanjangan, pengembalian, kondisi, kehilangan/kerusakan, denda sesuai kebijakan tertulis.
- Laporan: katalog, inventaris, pinjaman aktif, terlambat, hilang/rusak, statistik penggunaan.

### I. Website, komunikasi dan CRM

- Halaman: slug, judul, ringkasan, isi, kategori, bahasa, SEO, media, penulis, reviewer, publisher, versi, status dan tanggal publikasi.
- Pengumuman: audiens, kampus, kanal, jadwal, tanggal kedaluwarsa, lampiran, approval, bukti pengiriman/pembacaan.
- Kontak: tipe, nama, organisasi, kontak, sumber data, tujuan, dasar pemrosesan, consent record, preferensi dan penarikan.
- Interaksi: kanal, petugas, tanggal, tujuan, hasil, tindak lanjut dan retensi.
- CRM harus menghormati penarikan persetujuan; jangan mengirim promosi berdasarkan status consent unknown.

### J. Laporan, audit, pengaturan dan integrasi

#### Laporan
- Definisi laporan, sumber data, filter periode/kampus/program, pemilik, role yang dapat mengakses, jadwal, versi dan timestamp.
- Setiap angka dashboard harus berasal dari query data aktual; placeholder harus ditandai.
- Ekspor memuat waktu, filter, pembuat, dan identitas organisasi; data terbatas disamarkan.

#### Audit dan dokumen
- Audit: actor, role, organisasi, aksi, resource, record, waktu, alasan, before/after yang aman, request/correlation ID.
- Dokumen: tipe, pemilik, klasifikasi, storage key, checksum, ukuran, MIME, tanggal, retensi, akses dan verifikasi.
- Jangan menaruh token, password, NIK, isi dokumen sensitif atau data rahasia dalam log umum.

#### Pengaturan dan akses
- Role, permission, unit scope, kampus scope, masa berlaku, delegasi, maker-checker, MFA/policy.
- Pengguna dinonaktifkan tanpa menghapus histori transaksi.
- Pengaturan tenant tidak boleh mempengaruhi tenant lain.

#### Integrasi dan sinkronisasi
- Adapter: nama provider, versi skema, tujuan, endpoint resmi, auth reference (secret manager), pemilik, jadwal, status.
- Mapping: field internal, field eksternal, transformasi, validasi, kode referensi, versi.
- Sync job: idempotency key, watermark, batch, hasil, error, retry, operator, audit dan bukti penerimaan.
- Adapter EMIS/SIMTREN/Dapodik atau sistem pemerintah lain hanya diaktifkan setelah pedoman teknis, kewenangan, credential, dan pengujian resmi tersedia. Jangan mengklaim integrasi langsung hanya karena file CSV dapat diekspor.

## 4. Master data terpusat

Master data tidak dibuat ulang pada tiap modul. Satu sumber kebenaran dipakai lintas modul dengan hak baca sesuai kebutuhan.

| Master data | Pemilik | Dipakai oleh | Status saat ini |
|---|---|---|---|
| Profil lembaga & legalitas | Tata kelola | Semua modul, pelaporan | Perlu dibangun |
| Kampus/lokasi | Tata kelola | Akademik, asrama, SDM, gudang, aset, PPDB | Dasar tersedia |
| Santri | Kesiswaan | PPDB, akademik, asrama, keuangan, perpustakaan, alumni | Sebagian |
| Orang tua/wali & relasi | Kesiswaan | PPDB, santri, izin, CRM | Dasar terbatas |
| Pegawai/pendidik/tendik | SDM | Akademik, payroll, approval, aset | Dasar terbatas |
| Program pendidikan | Akademik | PPDB, kelas, kurikulum, pelaporan | Dasar tersedia |
| Tahun ajaran/term | Akademik | PPDB, kelas, presensi, nilai, laporan | Dasar tersedia |
| Kurikulum dan mata pelajaran/kitab | Akademik | Jadwal, kelas, penilaian, rapor | Sebagian |
| Kelas/rombongan belajar/halaqah | Akademik | Presensi, nilai, jadwal, rapor | Dasar tersedia |
| Wilayah administratif | Platform | Alamat lembaga/santri/wali/pegawai/vendor | Belum tersedia |
| Kode referensi nasional | Platform | Semua modul dan adapter | Belum tersedia |
| Bagan akun/periode akuntansi | Keuangan | Tagihan, kas/bank, jurnal, laporan | API dasar |
| Barang/satuan/gudang | Logistik | Mutasi, pengadaan, aset | API dasar |
| Pemasok | Pengadaan | Permintaan, PO, penerimaan, pembayaran | Dasar tersedia |
| Unit/jabatan/pusat biaya | SDM | Pegawai, payroll, persetujuan, anggaran | Dasar tersedia |
| Komponen payroll | SDM/Keuangan | Payroll, akuntansi, slip | Belum tersedia |
| Bibliografi/klasifikasi koleksi | Perpustakaan | Eksemplar, pinjaman, katalog publik | Dasar tersedia |
| Kategori/kebijakan aset | Aset | Register, event, jurnal | Sebagian |
| Referensi regulasi/versi | Compliance | Form, workflow, pelaporan, audit | Belum tersedia |

Setiap master data harus mempunyai: kode unik, label, deskripsi, sumber kebenaran, pemilik data, status, tanggal berlaku, versi, relasi, aturan duplikasi, audit, klasifikasi, dan kebijakan arsip.

## 5. Extensibility untuk modul tambahan

Implementasi awal menyediakan `MODULE_CATALOG_VERSION`, `MODULE_GUIDANCE`, `MASTER_DATA_CATALOG` dan kontrak `MODULE_EXTENSION_CONTRACT` pada `apps/web/src/module-catalog.ts`.

Setiap modul tambahan wajib mendaftarkan:
1. `moduleId` unik dan versi semantik;
2. nama, ikon, grup menu, route dan urutan;
3. permission baca/tulis/aksi dan scope tenant/kampus;
4. API contract berversi dan skema respons;
5. form schema berversi dengan tipe, validasi, klasifikasi, retensi, dan sumber kebenaran;
6. master data yang dipakai/dimiliki;
7. event yang diterbitkan/dikonsumsi;
8. migration range, dependensi, dan prosedur rollback;
9. regulatory mapping serta tanggal review;
10. test unit, integration, tenant isolation, accessibility dan acceptance checklist.

### Prinsip integrasi teknis
- Modul tidak boleh menulis langsung ke tabel modul lain; gunakan API domain atau event.
- Event memiliki `eventId`, `tenantId`, `aggregateId`, `eventType`, `schemaVersion`, `occurredAt`, `actorId`, `correlationId`, dan payload yang diminimalkan.
- Konsumen event harus idempotent dan menyimpan checkpoint/retry/dead-letter.
- Master data canonical memiliki pemilik; modul lain hanya mereferensikan ID.
- Migrasi modul bersifat additive dan tenant-safe; tidak dijalankan pada Development tanpa persetujuan terpisah.
- Kode modul tidak dapat dimuat dari URL atau tenant tak tepercaya. Modul pihak ketiga perlu review kode, lisensi, keamanan, dan izin eksplisit.
- Integrasi pemerintah/eksternal memakai adapter terisolasi, spesifikasi resmi, credential terkelola, log sinkronisasi, serta prosedur pemulihan.

## 6. Kesenjangan yang harus diselesaikan sebelum siap operasional

1. Mengubah master data profil lembaga, santri, wali, pegawai dan referensi wilayah menjadi sumber kebenaran yang konsisten.
2. Memisahkan data identitas sensitif dan kasus perlindungan anak ke ruang akses terbatas.
3. Melengkapi PPDB dari pendaftaran sampai daftar ulang dan konversi santri.
4. Melengkapi kurikulum, jadwal, penilaian, rapor, kenaikan dan kelulusan.
5. Melengkapi izin keluar sampai pencatatan kembali serta alur perlindungan anak.
6. Melengkapi tagihan, pembayaran, anggaran, kas/bank, rekonsiliasi dan laporan.
7. Melengkapi stock opname, approval pengadaan, penerimaan, three-way match dan aset.
8. Melengkapi HR, kontrak, presensi pegawai, cuti, payroll, pajak, BPJS, THR dan slip gaji.
9. Melengkapi perpustakaan, CRM/consent, CMS approval dan laporan.
10. Menambahkan backup/restore, monitoring, audit, UAT lintas role dan tenant.

## 7. Gate penerimaan setiap form/menu

- [ ] Field hanya berasal dari kebutuhan proses dan aturan yang terverifikasi.
- [ ] Setiap field memiliki tipe, label, requiredness, batas panjang/rentang, default dan validasi.
- [ ] Master relation memakai picker tenant-scoped, bukan UUID bebas.
- [ ] Dokumen mempunyai batas ukuran/MIME, klasifikasi, checksum, retention dan audit.
- [ ] Status/transisi hanya dapat dilakukan oleh permission yang tepat.
- [ ] Maker-checker aktif untuk transaksi/keputusan berisiko.
- [ ] Koreksi mencatat alasan dan before/after yang aman.
- [ ] Tes invalid input, duplicate, concurrency, unauthorized, cross-tenant dan audit lulus.
- [ ] Laporan/ekspor cocok dengan sumber data dan periode.
- [ ] Operator melakukan UAT menggunakan data sintetis.
- [ ] Pemetaan regulasi ditinjau oleh pemilik proses/penasihat hukum yang kompeten.

## 8. Rujukan resmi

- UU 18/2019: https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019
- PMA 30/2020: https://peraturan.bpk.go.id/Details/176216/peraturan-menag-no-30-tahun-2020
- PMA 31/2020: https://peraturan.bpk.go.id/Details/176475/peraturan-menag-no-31-tahun-2020
- KMA 83/2022 (JDIH Kemenag): https://jdih.kemenag.go.id/regulation-download/keputusan-menteri-agama-nomor-83-tahun-2022-tentang-pengelolaan-data-pendidikan-pada-kementerian-agama
- UU 20/2003: https://peraturan.bpk.go.id/details/43920/uu-no-20-tahun-2003
- UU 27/2022: https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022-10
- PP 71/2019: https://peraturan.bpk.go.id/Details/122030/pp-no-71-tahun-2019
- UU 35/2014: https://peraturan.bpk.go.id/Details/38723/uu-no-35-tahun-2014
- Perpres 82/2021: https://peraturan.bpk.go.id/Details/177017/perpres-no-82-tahun-2021
- PP 49/2025 (perubahan pengupahan): https://peraturan.bpk.go.id/Details/339037
- PMK 168/2023 (PPh 21): https://jdih.kemenkeu.go.id/dok/6f5925c3-ad3a-462b-f7be-08dc0da71246
- Perpres 82/2018 jo. Perpres 59/2024 (Jaminan Kesehatan): https://peraturan.bpk.go.id/Details/94711/perpres-no-82-tahun-2018
- PP 44/2015 jo. PP 82/2019 jo. PP 49/2023 (JKK/JKM): https://peraturan.bpk.go.id/Details/5612/pp-no-44-tahun-2015

Sebelum produksi, lakukan pemeriksaan status terakhir setiap peraturan pada JDIH instansi penerbit. Referensi di atas menjadi baseline pemetaan, bukan jaminan bahwa tidak ada perubahan setelah tanggal tinjauan.

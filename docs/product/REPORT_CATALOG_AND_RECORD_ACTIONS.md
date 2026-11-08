# PONDOK OS — Katalog Laporan Institusi

**Status:** spesifikasi laporan dan kontrol penerimaan; bukan klaim bahwa seluruh generator laporan telah tersedia.  
**Prinsip:** laporan hanya mengambil data yang boleh diakses pengguna, memakai rentang waktu dan filter eksplisit, menyertakan waktu pembuatan, zona waktu, cakupan kampus/program, sumber data, dan status kelengkapan. Tidak boleh ada angka contoh yang tampak seperti data nyata.

## Standar semua laporan

- Filter: periode tanggal/tahun ajaran/semester, kampus/satuan, program, kelas/halaqah, status, dan unit terkait sesuai domain.
- Keluaran: tampilan layar, cetak dengan kop lembaga dan nomor halaman, PDF, CSV/XLSX bila aman, serta ekspor format instansi hanya jika spesifikasi resmi dan izin integrasinya sudah diverifikasi.
- Setiap keluaran menyertakan nama laporan, parameter, waktu pembuatan dan zona waktu, pembuat, jumlah baris, sumber data, versi template, klasifikasi, dan checksum untuk arsip resmi.
- Akses berbasis role dan row-level tenant/campus; kolom restricted disamarkan atau dikeluarkan secara default. Setiap ekspor sensitif diaudit dan dapat memerlukan alasan/approval.
- Laporan keuangan yang sudah disahkan harus immutable; koreksi menggunakan jurnal pembalik/koreksi, bukan mengubah dokumen historis.
- Cetak bukan bukti pengesahan. Tanda tangan, nomor surat, stempel, dan pejabat penetap mengikuti kewenangan lembaga.
- Laporan regulasi mengikuti jenis pesantren/satuan pendidikan, izin, jenjang, dan kewajiban aktual. Jangan mengarang field wajib, format EMIS/SIMTREN/Dapodik, atau menyatakan integrasi resmi tanpa spesifikasi dan uji penerimaan.

## Katalog laporan minimum

| Modul | Laporan yang dibutuhkan | Kontrol / catatan |
|---|---|---|
| Ringkasan pimpinan | Dashboard santri, pegawai, pendidikan, asrama, keuangan, aset, risiko dan pekerjaan tertunda | KPI harus berasal dari query terotorisasi; klik menuju data sumber |
| Master Data Santri | Buku induk; daftar santri aktif/nonaktif; data belum lengkap; statistik usia, gender, program, kampus, asal daerah/sekolah; mutasi masuk/keluar/lulus; daftar kontak wali | NIK/KK, dokumen, alamat rinci, dan kesehatan tidak ikut ekspor umum |
| Wali Santri | Direktori wali; relasi dan status verifikasi; kontak darurat; daftar kewenangan penjemputan yang masih berlaku | Hanya petugas berizin; jangan menyamakan kontak keluarga dengan wali sah |
| Kesehatan | Daftar kebutuhan tindakan darurat dan rekap terbatas alergi/obat sesuai kebutuhan | Akses sangat terbatas; hindari diagnosis/riwayat rinci pada laporan massal |
| Tata Kelola | Daftar kampus/satuan; program dan izin; masa berlaku dokumen legal; kalender kewajiban dan bukti pelaporan | Status izin harus diverifikasi terhadap dokumen/instansi |
| SDM | Daftar pegawai/pengajar; penempatan aktif dan histori; kontrak akan berakhir; kualifikasi/sertifikasi; presensi, cuti, lembur | Data pribadi pegawai dibatasi; laporan kualifikasi mengikuti jalur pendidikan |
| Payroll | Rekap gaji bruto/neto; komponen; potongan; PPh 21; BPJS; THR; slip gaji; rekonsiliasi pembayaran | Hitung ulang memakai aturan dan tarif efektif pada periode terkait; review payroll dan otorisasi sebelum pembayaran |
| Akademik | Daftar kelas/halaqah; daftar peserta; jadwal; presensi harian/bulanan; rekap ketidakhadiran; nilai; rapor; remedial; kenaikan/kelulusan; beban mengajar | Template rapor dan pelaporan nasional dipilih sesuai jalur/izin pendidikan |
| Kesantrian | Daftar penghuni dan kapasitas asrama; penempatan kamar; izin keluar dan keterlambatan kembali; rekap kegiatan; tindak lanjut pembinaan | Kasus perlindungan anak tidak tampil dalam laporan umum |
| Perpustakaan | Koleksi dan eksemplar; inventaris barcode; peminjaman aktif; jatuh tempo; keterlambatan; kehilangan/kerusakan; statistik sirkulasi | Denda hanya jika ada kebijakan tertulis |
| Website & Publikasi | Kalender publikasi; daftar konten draft/review/terbit; histori revisi; rekap pengumuman per audiens | Persetujuan editorial dan bukti publikasi |
| CRM & Relasi | Direktori alumni/donatur/wali; histori komunikasi; persetujuan kanal; komitmen dan realisasi donasi | Consent harus dapat ditelusuri dan ditarik; jangan menampilkan kontak tanpa kewenangan |
| PPDB | Pendaftar per gelombang/jalur; progres verifikasi; hasil seleksi; daftar tunggu; daftar ulang; konversi menjadi santri; statistik asal sekolah | Dokumen calon santri dan anak adalah data terbatas |
| Keuangan & Akuntansi | Buku kas/bank; penerimaan dan pengeluaran; piutang/tagihan; anggaran vs realisasi; jurnal; buku besar; neraca saldo; aktivitas akun; laporan aktivitas/laba-rugi bila relevan; posisi keuangan; arus kas; dana terikat; rekonsiliasi; tutup buku | Kerangka akun dan laporan harus disepakati pengelola/akuntan dan karakter lembaga; bukan template pajak otomatis |
| Aset & Pengadaan | Register aset; penyusutan; lokasi/penanggung jawab; pemeliharaan; mutasi; penghapusan; vendor; permintaan/PO; penerimaan; perbandingan penawaran; komitmen belanja | Approval maker-checker, bukti penerimaan, dan jejak audit |
| Inventaris & Gudang | Saldo stok per barang/gudang; kartu stok; penerimaan/pengeluaran/mutasi; stok minimum; stock opname; selisih; barang rusak/kedaluwarsa | Saldo dihitung dari ledger transaksi, bukan input angka manual |
| Kepatuhan & Audit | Kalender kewajiban; daftar bukti dan tanda terima; akses data sensitif; perubahan master; ekspor; persetujuan; retensi; insiden dan tindak lanjut | Akses khusus auditor/pimpinan; log tidak boleh dapat diedit operator biasa |

## Standar tindakan pada halaman data

- **Tambah:** membuat draft/record dengan validasi, relasi, pencegahan duplikasi, dan audit.
- **Detail:** melihat data sesuai klasifikasi dan izin.
- **Ubah/Koreksi:** perubahan terkontrol; data historis/keuangan tidak ditimpa tanpa jejak.
- **Arsipkan/Nonaktifkan:** pilihan utama untuk master yang sudah dipakai transaksi; mempertahankan histori dan referential integrity.
- **Hapus permanen:** hanya untuk record yang belum dipakai, tidak terkena legal hold/retensi, memiliki izin khusus, konfirmasi kuat, serta audit; data pribadi mengikuti kebijakan penghapusan/anonymization yang sah.
- **Cetak:** print stylesheet, kop lembaga, periode/filter, waktu cetak, halaman, klasifikasi, dan watermark draft bila belum disahkan.
- **Ekspor:** CSV/XLSX/PDF dengan permission, masking, batas volume, audit dan checksum.
- **Cari/Filter/Urutkan/Paginasi:** server-side untuk dataset besar; parameter divalidasi dan tidak boleh membuka tenant lain.
- **Impor:** template berversi, preview, validasi per baris, deteksi duplikasi, dry-run, persetujuan, hasil gagal/berhasil, dan audit.
- **Persetujuan/Posting:** tombol hanya muncul untuk role yang berwenang; maker tidak boleh menyetujui transaksi sendiri bila kebijakan mewajibkan pemisahan tugas.

## Status implementasi yang harus ditampilkan dengan jujur

Katalog di atas adalah target penerimaan produk. Fitur cetak/ekspor tidak boleh ditampilkan aktif sebelum benar-benar terhubung ke data yang sedang dilihat dan lolos uji izin. Penghapusan permanen tidak boleh ditambahkan ke resource generik sebelum aturan retensi, foreign key, legal hold, audit, dan konsekuensi lintas modul tersedia. Sampai itu ada, gunakan arsip/nonaktifkan melalui workflow khusus. Format EMIS, SIMTREN, Dapodik, pajak, BPJS, atau pelaporan lain tidak boleh disebut siap tanpa spesifikasi resmi terkini dan uji penerimaan.

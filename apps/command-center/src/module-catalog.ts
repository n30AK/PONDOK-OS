export type OptionalModuleCategory = "pendidikan" | "usaha" | "keuangan_sosial" | "layanan" | "tata_kelola";
export type OptionalModuleManifest = {
  id: string;
  name: string;
  category: OptionalModuleCategory;
  summary: string;
  capabilities: string[];
  prerequisites: string[];
  eligibility: string[];
  complianceNote: string;
  rollout: "catalog_only";
};

export const OPTIONAL_MODULE_CATALOG_VERSION = "2026.11.1";
export const OPTIONAL_MODULE_CATALOG: OptionalModuleManifest[] = [
  {
    id: "school-diknas", name: "Administrasi Sekolah Formal · Diknas", category: "pendidikan",
    summary: "Pengelolaan unit PAUD/TK, SD, SMP, SMA, atau SMK di bawah jalur pendidikan umum.",
    capabilities: ["Profil satuan pendidikan dan izin operasional", "Peserta didik, rombel, wali kelas, guru dan tenaga kependidikan", "Kurikulum, jadwal, presensi, asesmen, rapor dan kelulusan", "Kalender akademik, penerimaan murid, mutasi dan alumni", "Sarpras, pembiayaan dan pelaporan sekolah"],
    prerequisites: ["Jenis dan jenjang satuan pendidikan ditetapkan", "Identitas/izin/NPSN diverifikasi sesuai kewenangan", "Pemetaan data guru, siswa, rombel dan tahun ajaran"],
    eligibility: ["Pesantren/yayasan memiliki atau mengelola satuan pendidikan formal", "Dokumen legal dan penanggung jawab unit tersedia"],
    complianceNote: "Checklist harus mengikuti ketentuan Kemendikdasmen dan pemerintah daerah yang berlaku untuk jenjang serta bentuk satuan pendidikan.",
    rollout: "catalog_only"
  },
  {
    id: "madrasah", name: "Administrasi Madrasah · Kemenag", category: "pendidikan",
    summary: "Administrasi RA, MI, MTs, MA dan unit pendidikan madrasah di lingkungan yayasan/pesantren.",
    capabilities: ["Profil madrasah dan identitas kelembagaan", "Data peserta didik, GTK, rombel dan kalender", "Kurikulum, jadwal, presensi, penilaian dan rapor", "PPDB, mutasi, kelulusan dan alumni", "Sarpras dan pelaporan sesuai kebutuhan madrasah"],
    prerequisites: ["Jenjang madrasah ditetapkan", "Identitas dan izin/registrasi madrasah diverifikasi", "Pemetaan tahun ajaran dan struktur akademik"],
    eligibility: ["Lembaga menyelenggarakan atau menaungi madrasah", "Penanggung jawab madrasah ditetapkan"],
    complianceNote: "Pisahkan ketentuan madrasah dari sekolah umum; checklist dan referensi Kemenag wajib berversi.",
    rollout: "catalog_only"
  },
  {
    id: "diniyah", name: "Pendidikan Diniyah & Muadalah", category: "pendidikan",
    summary: "Pengelolaan pendidikan diniyah formal/nonformal dan satuan pendidikan pesantren sesuai bentuk yang dimiliki.",
    capabilities: ["Jenjang, program, kelas dan kalender", "Kurikulum, kitab/mata pelajaran dan target kompetensi", "Ustaz/ustazah, jadwal, presensi dan penilaian", "Kenaikan tingkat, munaqasyah dan kelulusan"],
    prerequisites: ["Bentuk pendidikan dan jalur penyelenggaraan ditentukan", "Kurikulum dan struktur kelas tersedia"],
    eligibility: ["Pesantren menyelenggarakan program diniyah/muadalah terkait"],
    complianceNote: "Jangan menyamakan persyaratan diniyah, muadalah, dan pendidikan formal umum.",
    rollout: "catalog_only"
  },
  {
    id: "tahfidz", name: "Program Tahfidz & Tahsin", category: "pendidikan",
    summary: "Pemantauan target hafalan, setoran, murojaah, tahsin dan capaian santri.",
    capabilities: ["Target hafalan per juz/surah/ayat", "Jadwal halaqah dan pembimbing", "Catatan setoran, murojaah dan kualitas bacaan", "Rekap capaian, ujian tasmi' dan sertifikat internal"],
    prerequisites: ["Struktur halaqah, pembimbing dan metode penilaian disepakati"],
    eligibility: ["Pesantren memiliki program tahfidz/tahsin"],
    complianceNote: "Capaian tahfidz adalah data pendidikan internal dan harus dibatasi sesuai peran.",
    rollout: "catalog_only"
  },
  {
    id: "koperasi", name: "Koperasi Pesantren", category: "usaha",
    summary: "Administrasi koperasi, keanggotaan, simpanan sesuai izin, rapat anggota, usaha dan laporan.",
    capabilities: ["Data badan hukum, pengurus, pengawas dan anggota", "Keanggotaan, simpanan dan transaksi yang diizinkan", "Rapat anggota tahunan dan keputusan", "Pembukuan, SHU, stok dan laporan koperasi"],
    prerequisites: ["Bentuk dan status hukum koperasi diverifikasi", "Pengurus, kebijakan keanggotaan dan chart akun disiapkan"],
    eligibility: ["Ada unit koperasi yang sah atau rencana pendirian dengan penanggung jawab jelas"],
    complianceNote: "Fitur simpan pinjam hanya boleh diaktifkan sesuai izin dan ketentuan yang berlaku; jangan menganggap semua koperasi berizin menjalankan layanan keuangan.",
    rollout: "catalog_only"
  },
  {
    id: "pos-retail", name: "POS Toko & Minimarket", category: "usaha",
    summary: "Kasir, katalog barang, barcode, harga, diskon, stok, retur dan laporan penjualan unit usaha.",
    capabilities: ["Produk, kategori, barcode dan multi-harga", "Kasir tunai/non-tunai dan shift kasir", "Retur, diskon, promo dan void dengan otorisasi", "Stok masuk/keluar dan sinkronisasi inventaris", "Laporan penjualan, margin dan kas"],
    prerequisites: ["Gudang/unit usaha dan daftar barang disiapkan", "Perangkat kasir dan metode pembayaran ditetapkan"],
    eligibility: ["Pesantren memiliki toko/minimarket/koperasi retail"],
    complianceNote: "Transaksi POS harus memiliki audit trail dan sinkronisasi stok yang idempoten.",
    rollout: "catalog_only"
  },
  {
    id: "kantin", name: "Manajemen Kantin", category: "usaha",
    summary: "Operasional kantin, tenant/pedagang, menu, transaksi, kebersihan dan pengawasan.",
    capabilities: ["Tenant/pedagang dan perjanjian", "Menu, harga, jadwal dan ketersediaan", "Penjualan dan rekap transaksi", "Inspeksi kebersihan, sanitasi dan keluhan"],
    prerequisites: ["Daftar pengelola/pedagang dan kebijakan kantin tersedia"],
    eligibility: ["Terdapat kantin internal atau mitra kantin"],
    complianceNote: "Data kesehatan dan inspeksi dibatasi; persyaratan higiene mengikuti aturan setempat.",
    rollout: "catalog_only"
  },
  {
    id: "catering", name: "Katering & Dapur Produksi", category: "usaha",
    summary: "Perencanaan menu, produksi, bahan baku, porsi, distribusi konsumsi dan biaya makanan.",
    capabilities: ["Siklus menu dan kebutuhan porsi", "Resep/BOM, bahan baku dan costing", "Produksi dapur, QC dan distribusi", "Alergen/diet khusus dengan pembatasan akses", "Biaya konsumsi dan evaluasi pemasok"],
    prerequisites: ["Unit dapur dan penanggung jawab ditetapkan", "Daftar bahan, resep dan siklus konsumsi tersedia"],
    eligibility: ["Pesantren mengelola dapur/katering sendiri"],
    complianceNote: "Informasi alergi/kesehatan merupakan data sensitif; kumpulkan seperlunya dan terapkan akses sangat terbatas.",
    rollout: "catalog_only"
  },
  {
    id: "laundry", name: "Laundry & Linen Asrama", category: "usaha",
    summary: "Penerimaan cucian, tagging, proses, distribusi, pembayaran dan stok linen.",
    capabilities: ["Pelanggan dan paket layanan", "Tagging per santri/unit dan pelacakan batch", "Status cuci-kering-setrika-serah terima", "Komplain, kehilangan dan rekonsiliasi"],
    prerequisites: ["SOP penerimaan dan distribusi ditetapkan", "Lokasi/unit laundry terdaftar"],
    eligibility: ["Pesantren memiliki laundry internal atau komersial"],
    complianceNote: "Batasi detail pribadi pada label cucian dan bukti serah terima.",
    rollout: "catalog_only"
  },
  {
    id: "agribusiness", name: "Agribisnis & Pertanian", category: "usaha",
    summary: "Pengelolaan lahan, komoditas, musim tanam, kegiatan budidaya, panen dan penjualan.",
    capabilities: ["Lahan, petak, komoditas dan kalender tanam", "Kebutuhan benih, pupuk, alat dan tenaga", "Aktivitas budidaya dan penggunaan input", "Panen, hasil, penyimpanan dan penjualan", "Biaya produksi dan analisis hasil"],
    prerequisites: ["Lahan/unit dan komoditas dipetakan", "Penanggung jawab dan SOP keselamatan tersedia"],
    eligibility: ["Pesantren mengelola lahan pertanian/perkebunan"],
    complianceNote: "Penggunaan input pertanian harus mengikuti ketentuan keselamatan dan lingkungan.",
    rollout: "catalog_only"
  },
  {
    id: "livestock", name: "Peternakan", category: "usaha",
    summary: "Pemeliharaan ternak, kandang, pakan, kesehatan hewan, reproduksi dan hasil produksi.",
    capabilities: ["Jenis ternak, kandang dan populasi", "Pakan, bobot dan siklus pemeliharaan", "Catatan kesehatan hewan dan vaksinasi", "Produksi, kelahiran, kematian dan penjualan", "Biaya pakan dan hasil usaha"],
    prerequisites: ["Kandang, petugas dan SOP kesejahteraan hewan ditetapkan"],
    eligibility: ["Pesantren memiliki unit peternakan"],
    complianceNote: "Data kesehatan hewan dipisahkan dari rekam kesehatan manusia; izin dan standar veteriner perlu diverifikasi.",
    rollout: "catalog_only"
  },
  {
    id: "aquaculture", name: "Perikanan & Budidaya Air", category: "usaha",
    summary: "Pengelolaan kolam, siklus budidaya, kualitas air, pakan, panen dan pemasaran.",
    capabilities: ["Kolam, spesies dan siklus tebar", "Parameter kualitas air dan pemberian pakan", "Mortalitas, pertumbuhan dan tindakan budidaya", "Panen, stok dan penjualan", "Biaya produksi dan produktivitas"],
    prerequisites: ["Kolam/sarana, spesies dan SOP ditetapkan"],
    eligibility: ["Pesantren menjalankan budidaya ikan/udang"],
    complianceNote: "Kepatuhan lingkungan dan penggunaan obat/bahan budidaya harus diperiksa.",
    rollout: "catalog_only"
  },
  {
    id: "convection", name: "Konveksi, Jahit & Seragam", category: "usaha",
    summary: "Pesanan seragam, ukuran, pola, bahan, produksi, QC dan distribusi.",
    capabilities: ["Model dan ukuran seragam", "Pesanan per unit/angkatan", "BOM bahan dan penjadwalan produksi", "Tahap potong-jahit-finishing dan QC", "Stok, distribusi dan biaya produksi"],
    prerequisites: ["Daftar model/ukuran dan kapasitas produksi tersedia"],
    eligibility: ["Pesantren memiliki unit konveksi atau produksi seragam"],
    complianceNote: "Data ukuran personal hanya disimpan untuk kebutuhan produksi dan dibatasi aksesnya.",
    rollout: "catalog_only"
  },
  {
    id: "printing", name: "Percetakan & Penerbitan", category: "usaha",
    summary: "Pengelolaan pesanan cetak, desain, naskah, produksi, finishing dan pengiriman.",
    capabilities: ["Pelanggan, quotation dan job order", "File desain/naskah dan persetujuan proof", "Kalkulasi bahan, mesin dan biaya", "Jadwal produksi, QC dan pengiriman", "Stok bahan dan laporan margin"],
    prerequisites: ["Jenis layanan, mesin dan kapasitas produksi dicatat"],
    eligibility: ["Pesantren mengelola percetakan/penerbitan"],
    complianceNote: "Hak cipta, privasi naskah dan kontrol versi file perlu diterapkan.",
    rollout: "catalog_only"
  },
  {
    id: "digital-services", name: "Jasa Digital & Kreatif", category: "usaha",
    summary: "Pengelolaan jasa desain, multimedia, IT, pemasaran dan layanan digital.",
    capabilities: ["Katalog layanan dan quotation", "Brief, proyek, tugas dan timesheet", "Aset digital dan persetujuan klien", "Invoice, biaya proyek dan profitabilitas"],
    prerequisites: ["Daftar layanan, peran tim dan alur persetujuan ditetapkan"],
    eligibility: ["Pesantren memiliki unit jasa digital/kreatif"],
    complianceNote: "Akses aset klien, kredensial dan data pribadi harus mengikuti prinsip least privilege.",
    rollout: "catalog_only"
  },
  {
    id: "rental", name: "Persewaan Aset & Fasilitas", category: "usaha",
    summary: "Pemesanan dan penyewaan aula, kendaraan, alat, ruang dan fasilitas milik yayasan.",
    capabilities: ["Katalog aset/fasilitas dan tarif", "Kalender ketersediaan dan reservasi", "Kontrak, deposit dan serah terima", "Inspeksi kondisi, kerusakan dan pemeliharaan", "Invoice dan laporan utilisasi"],
    prerequisites: ["Daftar aset, tarif dan kebijakan peminjaman/sewa tersedia"],
    eligibility: ["Pesantren menyewakan aset atau fasilitas"],
    complianceNote: "Pisahkan aset wakaf, aset yayasan dan aset operasional sesuai status hukumnya.",
    rollout: "catalog_only"
  },
  {
    id: "transport", name: "Transportasi & Armada", category: "usaha",
    summary: "Pengelolaan kendaraan, pengemudi, rute, perjalanan, BBM, servis dan keselamatan.",
    capabilities: ["Kendaraan, dokumen dan jadwal servis", "Pengemudi dan kelayakan tugas", "Rute, perjalanan dan penumpang", "BBM, tol, biaya dan bukti perjalanan", "Insiden dan inspeksi keselamatan"],
    prerequisites: ["Armada, pengemudi dan SOP perjalanan ditetapkan"],
    eligibility: ["Pesantren mengelola kendaraan/layanan transportasi"],
    complianceNote: "Data lokasi dan penumpang dibatasi sesuai kebutuhan dan masa retensi.",
    rollout: "catalog_only"
  },
  {
    id: "bmt-kspps", name: "BMT / KSPPS", category: "keuangan_sosial",
    summary: "Administrasi kelembagaan dan layanan keuangan syariah hanya sesuai bentuk badan hukum serta izin yang dimiliki.",
    capabilities: ["Profil lembaga, anggota dan tata kelola", "Produk dan akad yang telah disetujui", "Pembukuan dan pelaporan terpisah", "Kontrol kepatuhan, audit dan pengaduan"],
    prerequisites: ["Badan hukum, izin dan ruang lingkup kegiatan diverifikasi", "Kebijakan kepatuhan dan pengawasan disetujui"],
    eligibility: ["Lembaga memiliki dasar legal dan izin yang sesuai"],
    complianceNote: "Jangan mengaktifkan transaksi simpan pinjam/pembiayaan hanya karena modul dipilih. Fitur transaksi wajib terkunci sampai legalitas dan izin spesifik diverifikasi.",
    rollout: "catalog_only"
  },
  {
    id: "ziswaf", name: "ZISWAF & Dana Sosial", category: "keuangan_sosial",
    summary: "Pencatatan zakat, infak, sedekah, wakaf dan penyaluran sesuai kewenangan lembaga.",
    capabilities: ["Donatur, penerimaan dan bukti transaksi", "Program, penghimpunan dan penyaluran", "Data penerima manfaat dengan pembatasan akses", "Pelaporan dana terikat dan audit trail"],
    prerequisites: ["Status/kewenangan pengelola dan jenis dana ditetapkan", "Kebijakan pemisahan dana dan penerima manfaat tersedia"],
    eligibility: ["Pesantren/yayasan memiliki program pengelolaan dana sosial yang sah"],
    complianceNote: "Wakaf, zakat dan dana sosial memiliki rezim serta kewenangan berbeda; jangan dicampur dalam satu ledger tanpa klasifikasi dan validasi.",
    rollout: "catalog_only"
  },
  {
    id: "business-incubator", name: "Inkubasi & Kewirausahaan Santri", category: "usaha",
    summary: "Program inkubasi usaha, mentoring, pelatihan, pendanaan program dan evaluasi dampak.",
    capabilities: ["Pendaftaran peserta dan ide usaha", "Kurikulum, mentor dan jadwal", "Milestone, prototipe dan penilaian", "Bantuan/permodalan program dan pelaporan dampak"],
    prerequisites: ["Program, mentor, kriteria peserta dan tata kelola dana ditetapkan"],
    eligibility: ["Pesantren memiliki program kewirausahaan/inkubasi"],
    complianceNote: "Pemisahan dana program dan persetujuan wali diperlukan bila peserta masih anak.",
    rollout: "catalog_only"
  },
  {
    id: "blk-lpk", name: "BLK / LPK & Sertifikasi Keterampilan", category: "pendidikan",
    summary: "Pelatihan vokasi, kelas, instruktur, asesmen kompetensi dan rekam sertifikasi.",
    capabilities: ["Program pelatihan dan unit kompetensi", "Peserta, instruktur dan jadwal", "Presensi, praktik dan asesmen", "Dokumentasi sertifikat dan tracer alumni"],
    prerequisites: ["Jenis lembaga pelatihan dan status perizinan ditentukan", "Program dan instruktur tersedia"],
    eligibility: ["Pesantren memiliki/menaungi unit pelatihan kerja"],
    complianceNote: "Klaim sertifikasi resmi hanya boleh dibuat jika lembaga dan skema sertifikasinya berwenang.",
    rollout: "catalog_only"
  },
  {
    id: "health-uks", name: "Kesehatan Santri, UKS & Klinik", category: "layanan",
    summary: "Layanan kesehatan internal, kunjungan, obat, rujukan dan sanitasi sesuai kewenangan.",
    capabilities: ["Kunjungan dan tindakan dasar yang diizinkan", "Persediaan obat dan kedaluwarsa", "Rujukan dan tindak lanjut", "Inspeksi sanitasi dan kesiapsiagaan"],
    prerequisites: ["Jenis layanan dan penanggung jawab kompeten diverifikasi", "Kebijakan akses rekam medis dan retensi disetujui"],
    eligibility: ["Pesantren memiliki UKS/pos kesehatan/klinik sesuai kewenangan"],
    complianceNote: "Rekam kesehatan adalah data pribadi spesifik. Jangan aktifkan diagnosis/resep/rekam medis klinis tanpa tenaga, izin, kontrol akses dan dasar hukum yang sesuai.",
    rollout: "catalog_only"
  },
  {
    id: "safeguarding", name: "Perlindungan Santri & Pengaduan Aman", category: "layanan",
    summary: "Pencegahan, kanal pengaduan terlindungi, penanganan kasus dan tindak lanjut perlindungan.",
    capabilities: ["Kanal laporan terbatas dan rahasia", "Penugasan petugas berwenang", "Alur tindak lanjut dan rujukan", "Pencatatan tindakan, tenggat dan audit akses"],
    prerequisites: ["Kebijakan perlindungan dan petugas penanggung jawab ditetapkan", "Prosedur eskalasi dan akses darurat disahkan"],
    eligibility: ["Pesantren/yayasan menetapkan kebijakan safeguarding dan petugas terlatih"],
    complianceNote: "Catatan kasus sangat sensitif, harus dipisah dari profil umum santri, dengan akses sangat terbatas dan tanpa analisis AI yang membuat keputusan atas korban/terlapor.",
    rollout: "catalog_only"
  },
  {
    id: "foundation-governance", name: "Administrasi Yayasan & Tata Kelola", category: "tata_kelola",
    summary: "Pengelolaan organ yayasan, keputusan, legalitas, rapat, program, unit dan arsip tata kelola.",
    capabilities: ["Organ pembina, pengurus dan pengawas", "Legalitas, perubahan dan masa jabatan", "Rapat, agenda, notulen dan keputusan", "Program kerja, unit usaha dan laporan", "Arsip dokumen dan kalender kewajiban"],
    prerequisites: ["Akta, susunan organ dan dokumen legal tersedia"],
    eligibility: ["Pesantren berada di bawah yayasan atau badan pengelola"],
    complianceNote: "Hak akses dan tindakan harus mengikuti kewenangan organ yayasan serta dokumen legal yang berlaku.",
    rollout: "catalog_only"
  }
];

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


export type EligibilityEvidenceStatus = "pass" | "missing" | "expired" | "unreadable" | "unverified" | "not_applicable" | "manual_verification_required";
export type OptionalModuleEvidenceRequirement = {
  id: string;
  title: string;
  evidenceType: string;
  verificationMethod: string;
  blocking: boolean;
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  authority: string;
};
const commonGovernance = "Dokumen resmi lembaga atau keputusan internal yang sah; cocokkan penerbit, nomor, tanggal, dan masa berlaku. Checklist ini bukan penetapan legalitas.";
const commonOperational = "Bukti operasional yang relevan (SOP, penanggung jawab, daftar aset/program); verifikasi oleh petugas berwenang.";
const REQUIREMENTS: Record<string, OptionalModuleEvidenceRequirement[]> = {
  "school-diknas": [
    {id:"school-license",title:"Identitas dan izin satuan pendidikan",evidenceType:"NPSN/izin operasional atau bukti registrasi yang relevan",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Kemendikdasmen/JDIH dan dinas pendidikan sesuai kewenangan"},
    {id:"school-operator",title:"Penanggung jawab dan struktur sekolah",evidenceType:"SK kepala sekolah/penanggung jawab dan struktur unit",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen resmi lembaga"}
  ],
  madrasah: [
    {id:"madrasah-registration",title:"Identitas dan status registrasi madrasah",evidenceType:"NSM/NPSN atau izin/registrasi sesuai bentuk madrasah",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Kemenag/JDIH dan kantor Kemenag setempat"},
    {id:"madrasah-lead",title:"Kepala madrasah dan struktur akademik",evidenceType:"SK kepala madrasah, GTK, jenjang dan tahun ajaran",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen resmi lembaga"}
  ],
  diniyah: [
    {id:"diniyah-form",title:"Bentuk dan jalur pendidikan diniyah",evidenceType:"Dokumen bentuk satuan/program dan izin/registrasi bila diwajibkan",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Kemenag/JDIH; verifikasi manual bila status tidak jelas"},
    {id:"diniyah-curriculum",title:"Kurikulum dan penanggung jawab program",evidenceType:"Kurikulum, jenjang, daftar pengajar dan SK penanggung jawab",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen resmi lembaga"}
  ],
  tahfidz: [
    {id:"tahfidz-program",title:"Program dan target pembelajaran",evidenceType:"Kurikulum/target tahfidz, metode evaluasi dan jadwal halaqah",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Keputusan pengelola pendidikan"},
    {id:"tahfidz-supervisor",title:"Pembimbing dan otorisasi penilaian",evidenceType:"Daftar pembimbing dan penetapan penanggung jawab",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen resmi lembaga"}
  ],
  koperasi: [
    {id:"coop-legal",title:"Badan hukum dan ruang lingkup koperasi",evidenceType:"Akta/pengesahan dan izin sesuai kegiatan",verificationMethod:commonGovernance,blocking:true,sensitivity:"restricted",authority:"Kemenkop/JDIH dan instansi berwenang"},
    {id:"coop-governance",title:"Pengurus, pengawas dan kebijakan transaksi",evidenceType:"Keputusan rapat anggota, susunan pengurus dan SOP",verificationMethod:commonOperational,blocking:true,sensitivity:"confidential",authority:"Dokumen resmi koperasi"}
  ],
  "pos-retail": [
    {id:"pos-unit",title:"Legalitas/persetujuan unit usaha dan pengelola",evidenceType:"Penetapan unit, penanggung jawab dan izin yang relevan",verificationMethod:commonGovernance,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga/instansi terkait"},
    {id:"pos-stock",title:"Daftar barang dan kontrol kas/stok",evidenceType:"Master barang, gudang, SOP kasir, retur dan rekonsiliasi",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen operasional unit"}
  ],
  kantin: [
    {id:"canteen-operator",title:"Pengelola dan status operasional kantin",evidenceType:"Daftar pengelola/pedagang dan perjanjian kerja sama",verificationMethod:commonOperational,blocking:true,sensitivity:"confidential",authority:"Dokumen lembaga/mitra"},
    {id:"canteen-hygiene",title:"SOP higiene dan sanitasi",evidenceType:"SOP kebersihan, inspeksi dan bukti pemenuhan ketentuan setempat",verificationMethod:"Periksa dokumen dan lakukan verifikasi lapangan bila diwajibkan.",blocking:true,sensitivity:"internal",authority:"Dinas/otoritas kesehatan dan ketentuan daerah"}
  ],
  catering: [
    {id:"catering-kitchen",title:"Kelayakan unit dapur dan penanggung jawab",evidenceType:"Penetapan unit, SOP produksi dan sanitasi",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga dan ketentuan kesehatan setempat"},
    {id:"catering-food-safety",title:"Pengendalian keamanan pangan",evidenceType:"SOP penyimpanan, kebersihan, alergen dan distribusi",verificationMethod:"Tinjau SOP; verifikasi izin/sertifikasi pangan hanya jika berlaku.",blocking:true,sensitivity:"confidential",authority:"Otoritas keamanan pangan/kesehatan sesuai kegiatan"}
  ],
  laundry: [
    {id:"laundry-unit",title:"Penanggung jawab dan SOP laundry",evidenceType:"Penetapan unit, alur penerimaan, pencucian dan serah terima",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga"},
    {id:"laundry-safety",title:"Keselamatan kerja dan pengelolaan limbah",evidenceType:"SOP bahan kimia, APD dan pembuangan limbah",verificationMethod:"Tinjau SOP dan bukti fasilitas sesuai skala kegiatan.",blocking:true,sensitivity:"internal",authority:"Ketentuan K3 dan lingkungan setempat"}
  ],
  agribusiness: [
    {id:"farm-land",title:"Hak/penguasaan lahan dan lokasi usaha",evidenceType:"Bukti kepemilikan, sewa, wakaf atau izin pemanfaatan yang sah",verificationMethod:commonGovernance,blocking:true,sensitivity:"restricted",authority:"Dokumen pertanahan/yayasan dan otoritas terkait"},
    {id:"farm-safety",title:"SOP budidaya dan keselamatan",evidenceType:"Rencana tanam, penanggung jawab, SOP input dan lingkungan",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen operasional dan ketentuan lingkungan"}
  ],
  livestock: [
    {id:"livestock-facility",title:"Lokasi kandang dan penanggung jawab",evidenceType:"Bukti penggunaan lokasi dan penetapan pengelola",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Dokumen lembaga/otoritas setempat"},
    {id:"livestock-health",title:"SOP kesejahteraan dan kesehatan hewan",evidenceType:"SOP pemeliharaan, biosekuriti dan catatan veteriner",verificationMethod:"Tinjau SOP; verifikasi tenaga/izin veteriner sesuai jenis kegiatan.",blocking:true,sensitivity:"internal",authority:"Otoritas peternakan/veteriner"}
  ],
  aquaculture: [
    {id:"fish-facility",title:"Sarana budidaya dan hak penggunaan lokasi",evidenceType:"Bukti penggunaan kolam/lahan dan data sarana",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Dokumen lembaga/otoritas setempat"},
    {id:"fish-environment",title:"SOP budidaya dan pengelolaan lingkungan",evidenceType:"SOP kualitas air, pakan, limbah dan penggunaan bahan",verificationMethod:"Tinjau SOP dan verifikasi izin lingkungan bila diwajibkan.",blocking:true,sensitivity:"internal",authority:"Otoritas perikanan/lingkungan"}
  ],
  convection: [
    {id:"convection-unit",title:"Unit produksi dan penanggung jawab",evidenceType:"Penetapan unit, kapasitas, daftar mesin dan operator",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga"},
    {id:"convection-safety",title:"SOP keselamatan produksi",evidenceType:"SOP mesin, listrik, APD dan inspeksi",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Ketentuan K3 yang relevan"}
  ],
  printing: [
    {id:"printing-unit",title:"Unit percetakan dan ruang lingkup layanan",evidenceType:"Penetapan unit, mesin dan daftar layanan",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga"},
    {id:"printing-rights",title:"Kontrol hak cipta dan persetujuan naskah",evidenceType:"SOP penerimaan naskah, lisensi aset dan persetujuan proof",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen operasional dan ketentuan hak cipta"}
  ],
  "digital-services": [
    {id:"digital-unit",title:"Unit, tim dan penanggung jawab layanan",evidenceType:"Penetapan unit, daftar personel dan katalog layanan",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga"},
    {id:"digital-security",title:"Perlindungan data dan aset klien",evidenceType:"SOP akses akun, penyimpanan file, persetujuan dan serah terima",verificationMethod:"Tinjau kontrol akses, retensi dan prosedur insiden.",blocking:true,sensitivity:"confidential",authority:"Kebijakan keamanan dan perlindungan data"}
  ],
  rental: [
    {id:"rental-assets",title:"Daftar aset dan kewenangan pemanfaatan",evidenceType:"Register aset serta status kepemilikan/wakaf/sewa",verificationMethod:commonGovernance,blocking:true,sensitivity:"restricted",authority:"Dokumen aset dan legalitas yayasan"},
    {id:"rental-policy",title:"Tarif, kontrak dan SOP serah terima",evidenceType:"SK tarif, format perjanjian dan berita acara",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen resmi pengelola"}
  ],
  transport: [
    {id:"transport-fleet",title:"Dokumen kendaraan dan kelayakan armada",evidenceType:"Register kendaraan, STNK/KIR bila berlaku dan jadwal perawatan",verificationMethod:"Cocokkan identitas kendaraan dan masa berlaku dokumen.",blocking:true,sensitivity:"confidential",authority:"Kepolisian/dinas perhubungan sesuai jenis kendaraan"},
    {id:"transport-driver",title:"Pengemudi dan SOP keselamatan",evidenceType:"Daftar pengemudi, SIM sesuai kelas dan SOP perjalanan",verificationMethod:"Verifikasi masa berlaku dan kelas dokumen pengemudi.",blocking:true,sensitivity:"confidential",authority:"Kepolisian/dinas perhubungan"}
  ],
  "bmt-kspps": [
    {id:"bmt-legal",title:"Badan hukum, izin dan ruang lingkup layanan",evidenceType:"Pengesahan badan hukum dan izin spesifik aktivitas keuangan",verificationMethod:"Verifikasi langsung pada otoritas penerbit; jangan aktifkan transaksi jika izin tidak jelas.",blocking:true,sensitivity:"restricted",authority:"Kemenkop/OJK atau otoritas sesuai bentuk dan kegiatan"},
    {id:"bmt-controls",title:"Pengurus, pengawasan dan kepatuhan",evidenceType:"Susunan pengurus, SOP AML/CFT bila berlaku, audit dan pengaduan",verificationMethod:"Pemeriksaan manual oleh reviewer kompeten.",blocking:true,sensitivity:"restricted",authority:"Regulator sesuai bentuk lembaga"}
  ],
  ziswaf: [
    {id:"ziswaf-authority",title:"Kewenangan pengelolaan tiap jenis dana",evidenceType:"Dokumen kewenangan/izin dan pemisahan zakat, infak, sedekah serta wakaf",verificationMethod:"Verifikasi status dan kewenangan kepada otoritas terkait; jenis dana tidak boleh disatukan tanpa klasifikasi.",blocking:true,sensitivity:"restricted",authority:"BAZNAS/LAZ/BWI atau otoritas sesuai jenis dana"},
    {id:"ziswaf-governance",title:"Tata kelola, penyaluran dan audit",evidenceType:"Kebijakan penerimaan, penyaluran, penerima manfaat dan pelaporan",verificationMethod:"Pemeriksaan manual dan rekonsiliasi dokumen.",blocking:true,sensitivity:"restricted",authority:"Dokumen resmi lembaga dan regulator terkait"}
  ],
  "business-incubator": [
    {id:"incubator-program",title:"Program, mentor dan kriteria peserta",evidenceType:"SK program, kurikulum, mentor dan kriteria seleksi",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga"},
    {id:"incubator-funding",title:"Tata kelola dana program",evidenceType:"Sumber dana, persetujuan, batas penggunaan dan pelaporan",verificationMethod:"Tinjau pemisahan dana dan otorisasi pengeluaran.",blocking:true,sensitivity:"confidential",authority:"Dokumen keuangan lembaga"}
  ],
  "blk-lpk": [
    {id:"training-license",title:"Status lembaga pelatihan dan izin",evidenceType:"Identitas lembaga, izin/registrasi sesuai bentuk dan skema",verificationMethod:commonGovernance,blocking:true,sensitivity:"restricted",authority:"Kemnaker/dinas tenaga kerja dan otoritas sertifikasi sesuai skema"},
    {id:"training-program",title:"Program, instruktur dan asesmen",evidenceType:"Kurikulum, unit kompetensi, instruktur dan metode asesmen",verificationMethod:commonOperational,blocking:true,sensitivity:"internal",authority:"Dokumen lembaga/otoritas skema"}
  ],
  "health-uks": [
    {id:"health-scope",title:"Batas layanan dan kewenangan tenaga",evidenceType:"Penetapan jenis layanan, tenaga kompeten dan izin fasilitas bila diwajibkan",verificationMethod:"Verifikasi manual oleh reviewer kompeten; fitur klinis tetap terkunci sampai kewenangan terbukti.",blocking:true,sensitivity:"restricted",authority:"Kemenkes/dinas kesehatan sesuai jenis fasilitas"},
    {id:"health-privacy",title:"Tata kelola rekam kesehatan",evidenceType:"Kebijakan akses, persetujuan, retensi dan penanganan insiden data kesehatan",verificationMethod:"Security/privacy review wajib; jangan unggah rekam medis santri untuk pemeriksaan kelayakan modul.",blocking:true,sensitivity:"restricted",authority:"Ketentuan perlindungan data dan kesehatan"}
  ],
  safeguarding: [
    {id:"safeguarding-policy",title:"Kebijakan perlindungan dan petugas penanggung jawab",evidenceType:"Kebijakan perlindungan, kode etik dan SK petugas",verificationMethod:"Pemeriksaan manual oleh penanggung jawab perlindungan yang ditetapkan.",blocking:true,sensitivity:"restricted",authority:"Ketentuan perlindungan anak dan kebijakan lembaga"},
    {id:"safeguarding-response",title:"Prosedur pelaporan dan eskalasi aman",evidenceType:"SOP kanal rahasia, eskalasi, rujukan dan pembatasan akses",verificationMethod:"Uji prosedur tanpa mengunggah identitas atau detail kasus nyata.",blocking:true,sensitivity:"restricted",authority:"Kebijakan perlindungan dan otoritas rujukan"}
  ],
  "foundation-governance": [
    {id:"foundation-legal",title:"Akta dan status badan hukum yayasan",evidenceType:"Akta pendirian/perubahan dan bukti pengesahan yang relevan",verificationMethod:commonGovernance,blocking:true,sensitivity:"restricted",authority:"Kemenkum/JDIH dan dokumen notaris"},
    {id:"foundation-organs",title:"Susunan organ dan masa jabatan",evidenceType:"Keputusan pengangkatan pembina, pengurus dan pengawas",verificationMethod:commonGovernance,blocking:true,sensitivity:"confidential",authority:"Akta/keputusan organ yayasan"}
  ]
};
export function getOptionalModuleEvidenceRequirements(moduleId: string): OptionalModuleEvidenceRequirement[] {
  return REQUIREMENTS[moduleId] ?? [];
}
export function evaluateOptionalModuleEvidence(
  moduleId: string,
  evidence: Record<string, EligibilityEvidenceStatus>,
): {status: "eligible_for_admin_review" | "needs_correction" | "manual_verification_required"; findings: Array<{requirementId:string;status:EligibilityEvidenceStatus}> } {
  const requirements = getOptionalModuleEvidenceRequirements(moduleId);
  if (!requirements.length) return {status:"manual_verification_required",findings:[]};
  const findings = requirements.map((item) => ({requirementId:item.id,status:evidence[item.id] ?? "missing" as EligibilityEvidenceStatus}));
  if (findings.some((item) => item.status === "missing" || item.status === "expired" || item.status === "unreadable")) return {status:"needs_correction",findings};
  if (findings.some((item) => item.status === "unverified" || item.status === "manual_verification_required" || item.status === "not_applicable")) return {status:"manual_verification_required",findings};
  return {status:"eligible_for_admin_review",findings};
}

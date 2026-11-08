export type StudentFormSection = {
  title: string;
  fields: string[];
  note: string;
  classification: "general" | "restricted";
  applicability: string;
  regulatoryBasis: Array<{ label: string; url: string; role: "legal-framework" | "privacy-control" }>;
};

// Explicit, reviewed-by-design form layout. These are operational data definitions,
// not a declaration that every field is legally mandatory for every institution.
const PESANTREN_LAW = {
  label: "UU 18/2019 tentang Pesantren (kerangka penyelenggaraan)",
  url: "https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019",
  role: "legal-framework" as const
};
const PDP_LAW = {
  label: "UU 27/2022 tentang Pelindungan Data Pribadi",
  url: "https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022",
  role: "privacy-control" as const
};

export const STUDENT_FORM_SECTIONS: Record<string, StudentFormSection[]> = {
  "student-details": [
    { title: "Identitas Induk", fields: ["studentNumber", "legalName", "preferredName", "birthPlace", "birthDate", "genderCode", "citizenshipCode", "nationalStudentNumber"], note: "Gunakan dokumen sumber untuk pencatatan identitas. NISN hanya diisi jika tersedia dan telah diverifikasi; nomor identitas nasional tidak boleh disimpan di kolom umum.", classification: "restricted", applicability: "Profil induk berlaku untuk semua santri; NISN dan atribut pendidikan nasional mengikuti jalur pendidikan serta ketersediaan data resmi.", regulatoryBasis: [PESANTREN_LAW, PDP_LAW] },
    { title: "Alamat & Kontak", fields: ["currentAddress", "permanentAddress", "primaryPhone", "primaryEmail"], note: "Pisahkan alamat domisili dan alamat sesuai dokumen. Isi komponen alamat sejauh diperlukan untuk administrasi dan keadaan darurat.", classification: "restricted", applicability: "Kontak santri yang belum dewasa harus diperlakukan sebagai data anak; kontak wali tetap dicatat pada halaman Data Wali.", regulatoryBasis: [PDP_LAW] },
    { title: "Pendidikan & Status Santri", fields: ["campusId", "entryDate", "previousSchoolName", "status"], note: "Riwayat program, kelas, asrama, mutasi, dan kelulusan perlu ditautkan ke transaksi masing-masing; jangan menimpa histori dengan teks bebas.", classification: "general", applicability: "Kode program/jalur dan kewajiban pelaporan bergantung pada izin dan bentuk pendidikan lembaga (pesantren, satuan formal, atau Ma'had Aly).", regulatoryBasis: [PESANTREN_LAW] },
    { title: "Foto & Referensi Privat", fields: ["photoObjectKey"], note: "Simpan hanya object key privat yang diterbitkan server. Jangan gunakan URL publik atau memasukkan foto ke log.", classification: "restricted", applicability: "Foto hanya dikumpulkan bila ada tujuan yang sah dan akses dibatasi.", regulatoryBasis: [PDP_LAW] }
  ],
  "guardians": [
    { title: "Identitas Wali", fields: ["displayName", "relationshipDefault", "occupation"], note: "Catat hubungan keluarga sesuai keterangan/dokumen. Hubungan biologis atau sebutan wali tidak otomatis membuktikan kewenangan hukum.", classification: "restricted", applicability: "Data wali dicatat sesuai kebutuhan layanan dan dasar pemrosesan yang berlaku.", regulatoryBasis: [PDP_LAW] },
    { title: "Alamat & Kontak Wali", fields: ["address", "phonePrimary", "phoneAlternate", "email"], note: "Gunakan nomor yang dapat dihubungi dan pisahkan kontak utama dengan alternatif. Hindari menyimpan data yang tidak diperlukan.", classification: "restricted", applicability: "Kontak darurat dan komunikasi wali mengikuti SOP lembaga dan tujuan pemrosesan yang diberitahukan.", regulatoryBasis: [PDP_LAW] },
    { title: "Preferensi & Persetujuan Komunikasi", fields: ["preferredContactChannel", "consentStatus"], note: "Status persetujuan komunikasi tidak boleh diubah menjadi granted tanpa bukti dan proses pencatatan yang sesuai. Penarikan persetujuan harus dapat ditelusuri.", classification: "restricted", applicability: "Persetujuan komunikasi bukan pengganti dasar hukum pemrosesan data pribadi.", regulatoryBasis: [PDP_LAW] }
  ],
  "student-guardians": [
    { title: "Relasi Santri–Wali", fields: ["studentId", "guardianId", "relationshipCode"], note: "Relasi satu santri dapat memiliki beberapa wali. Pastikan santri dan wali berasal dari tenant yang sama; hubungan keluarga tidak menyimpulkan kewenangan legal.", classification: "restricted", applicability: "Relasi dicatat untuk keperluan administrasi lembaga dan harus memiliki masa berlaku yang jelas.", regulatoryBasis: [PDP_LAW] },
    { title: "Peran & Masa Berlaku", fields: ["isPrimary", "isEmergencyContact", "validFrom", "validUntil"], note: "Wali utama, kontak darurat, wali sah, penanggung biaya, dan pihak penjemput adalah peran berbeda. Flag wali sah/penjemput hanya dapat diubah melalui proses verifikasi khusus.", classification: "restricted", applicability: "Kewenangan hukum/penjemputan wajib diperiksa petugas terhadap bukti sumber dan kebijakan perlindungan anak; sistem tidak menetapkan status hukum otomatis.", regulatoryBasis: [PDP_LAW] }
  ],
  "student-identity-documents": [
    { title: "Dokumen Identitas Terbatas", fields: ["studentId", "documentType", "documentNumber"], note: "Nomor dokumen dienkripsi di server dan harus dimasking pada daftar. Jika kunci enkripsi tidak tersedia, operasi harus gagal tertutup; jangan salin nomor ke catatan umum.", classification: "restricted", applicability: "Jenis dokumen mengikuti kebutuhan administrasi dan jalur pendidikan; tidak semua dokumen wajib untuk semua program.", regulatoryBasis: [PDP_LAW] },
    { title: "Penerbitan & Masa Berlaku", fields: ["issuer", "issuedOn", "expiresOn"], note: "Catat penerbit dan tanggal sesuai dokumen sumber. Status verifikasi tidak boleh diubah melalui CRUD umum.", classification: "restricted", applicability: "Verifikasi dokumen memerlukan petugas dan checklist bukti; lampiran privat dan alur verifikasi terpisah masih merupakan pekerjaan lanjutan.", regulatoryBasis: [PDP_LAW] }
  ],
  "student-health-profiles": [
    { title: "Informasi Kesehatan Terbatas", fields: ["studentId", "bloodGroup", "allergyData", "medicalHistory", "medicationData"], note: "Informasi kesehatan merupakan data pribadi spesifik. Kumpulkan seminimal mungkin, simpan terenkripsi, batasi petugas yang dapat membaca, dan catat setiap akses.", classification: "restricted", applicability: "Isi hanya informasi relevan untuk keselamatan/perawatan; golongan darah bersifat opsional dan sebaiknya didukung sumber/verifikasi.", regulatoryBasis: [PDP_LAW] },
    { title: "Instruksi Keadaan Darurat", fields: ["emergencyInstructions"], note: "Tuliskan instruksi faktual yang diperlukan saat darurat. Jangan gunakan formulir ini untuk diagnosis otomatis atau catatan medis berlebihan.", classification: "restricted", applicability: "Akses darurat harus mengikuti SOP, kewenangan petugas, dan audit akses.", regulatoryBasis: [PDP_LAW] }
  ]
};

export function getStudentFormSections(resourceKey: string, fieldKeys: string[]): StudentFormSection[] | null {
  const configured = STUDENT_FORM_SECTIONS[resourceKey];
  if (!configured) return null;
  const known = new Set(fieldKeys);
  const used = new Set<string>();
  const sections = configured.map(section => {
    const fields = section.fields.filter(key => known.has(key));
    fields.forEach(key => used.add(key));
    return { ...section, fields };
  }).filter(section => section.fields.length > 0);
  const unassigned = fieldKeys.filter(key => !used.has(key));
  if (unassigned.length) sections.push({
    title: "Field Tambahan (Perlu Tinjauan)",
    fields: unassigned,
    note: "Field ini belum dipetakan ke metadata formulir yang ditinjau. Jangan anggap sebagai persyaratan regulasi.",
    classification: "restricted",
    applicability: "Perlu penetapan pemilik data, tujuan, retensi, dan dasar pemrosesan sebelum digunakan.",
    regulatoryBasis: [PDP_LAW]
  });
  return sections;
}

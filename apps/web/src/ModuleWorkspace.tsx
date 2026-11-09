import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";
import { getModuleGuidance } from "./module-catalog";
import { isSensitiveStudentHealthField } from "./sensitive-display.js";
import { getStudentFormSections } from "./student-form-metadata";

type Props = { organizationId: string; permissions: string[]; initialResourceKey?: string; onResourceChange?: (key: string) => void; preview?: boolean };
type Field = {
  key: string; label: string; type?: "text" | "date" | "datetime-local" | "number" | "textarea" | "select" | "checkbox" | "relation" | "array" | "json" | "address";
  required?: boolean; options?: string[]; source?: string; valueKey?: string; labelKey?: string; hint?: string; max?: number; step?: string;
};
type Resource = {
  key: string; label: string; group: string; endpoint: string; read: string; write: string;
  fields: Field[]; columns: Array<[string,string]>;
};
type Row = Record<string, unknown>;
type Lookup = { id: string; label: string };
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
// Resource.group is the single source of truth for workspace page navigation.
// Keep student/guardian records together; institution and HR records stay in
// their own domains so a student menu never inherits unrelated master data.

const F = (key:string,label:string,type:Field["type"]="text",required=false,extra:Partial<Field>={}):Field=>({key,label,type,required,...extra});
const REL = (key:string,label:string,source:string,labelKey:string,required=true):Field=>F(key,label,"relation",required,{source,labelKey});
const RESOURCES: Resource[] = [
 {key:"campuses",label:"Kampus / Satuan Lokasi",group:"Tata Kelola Institusi",endpoint:"campuses",read:"academic.classes.read",write:"core.campus.manage",fields:[F("code","Kode kampus","text",true),F("name","Nama kampus","text",true),F("campusType","Jenis kampus","select",true,{options:["main","branch","unit"]}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Nama kampus"],["campus_type","Jenis"],["status","Status"]]},
 {key:"student-details",label:"Master Data Santri Lengkap",group:"Master Data Santri",endpoint:"student-details",read:"academic.students.read",write:"academic.students.update",fields:[REL("campusId","Kampus","campuses","name"),F("studentNumber","Nomor induk santri","text",true,{max:48}),F("legalName","Nama lengkap sesuai dokumen","text",true,{max:180}),F("preferredName","Nama panggilan","text",false,{max:180}),F("birthPlace","Tempat lahir","text",false,{max:120}),F("birthDate","Tanggal lahir","date"),F("genderCode","Jenis kelamin","select",false,{options:["male","female","unspecified"]}),F("citizenshipCode","Kode kewarganegaraan","text",false,{max:2,hint:"ISO 3166-1 alpha-2, contoh ID"}),F("nationalStudentNumber","NISN","text",false,{max:32}),F("entryDate","Tanggal masuk pesantren","date"),F("previousSchoolName","Asal sekolah/pesantren","text",false,{max:180}),F("currentAddress","Alamat domisili","address",false,{hint:"Isi jalan, RT/RW, desa/kelurahan, kecamatan, kabupaten/kota, provinsi dan kode pos."}),F("permanentAddress","Alamat sesuai KK","address",false,{hint:"Isi komponen alamat sesuai dokumen keluarga."}),F("primaryPhone","Nomor kontak santri","text",false,{max:32}),F("primaryEmail","Email santri","text",false,{max:254}),F("photoObjectKey","Referensi foto privat","text",false,{max:512}),F("status","Status santri","select",false,{options:["applicant","active","graduated","withdrawn","suspended"]})],columns:[["student_number","NIS"],["legal_name","Nama lengkap"],["birth_place","Tempat lahir"],["birth_date","Tanggal lahir"],["national_student_number","NISN"],["status","Status"]]},
 {key:"student-identity-documents",label:"Dokumen Identitas Santri (Terbatas)",group:"Master Data Santri",endpoint:"student-identity-documents",read:"academic.students.identity.read",write:"academic.students.identity.write",fields:[REL("studentId","Santri","student-details","legal_name"),F("documentType","Jenis dokumen","select",true,{options:["nik","kk","nisn","passport","birth_certificate","other"]}),F("documentNumber","Nomor dokumen (terenkripsi)","text",true,{max:128,hint:"Nomor dienkripsi sebelum disimpan. Jangan tulis nomor ini pada catatan umum."}),F("issuer","Penerbit dokumen","text",false,{max:180}),F("issuedOn","Tanggal terbit","date"),F("expiresOn","Tanggal kedaluwarsa","date")],columns:[["student_id","Santri"],["document_type","Jenis dokumen"],["document_number","Nomor dokumen"],["issuer","Penerbit"],["issued_on","Tanggal terbit"],["expires_on","Kedaluwarsa"],["verified_at","Verifikasi"]]},
 {key:"student-health-profiles",label:"Profil Kesehatan Santri (Terbatas)",group:"Master Data Santri",endpoint:"student-health-profiles",read:"academic.students.health.read",write:"academic.students.health.write",fields:[REL("studentId","Santri","student-details","legal_name"),F("bloodGroup","Golongan darah","select",false,{options:["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"]}),F("allergyData","Alergi (JSON terenkripsi)","json",false,{max:4000}),F("medicalHistory","Riwayat kesehatan","textarea",false,{max:4000,hint:"Riwayat medis disimpan terenkripsi; masukkan fakta yang relevan dan telah diverifikasi."}),F("medicationData","Obat rutin / terapi (JSON terenkripsi)","json",false,{max:4000}),F("emergencyInstructions","Instruksi keadaan darurat","textarea",false,{max:2000})],columns:[["student_id","Santri"],["blood_group","Golongan darah"],["allergy_data","Alergi"],["medical_history","Riwayat kesehatan"],["medication_data","Obat/terapi"],["emergency_instructions","Instruksi darurat"]] },
 {key:"instructor-profiles",label:"Master Data Pengajar & Pendidik",group:"Pengajar & Struktur Organisasi",endpoint:"instructor-profiles",read:"hr.educators.read",write:"hr.educators.write",fields:[REL("employeeId","Pegawai","employees","legal_name"),F("educatorNumber","Nomor pendidik","text",false,{max:48}),F("educatorType","Jenis pendidik","select",true,{options:["teacher","ustadz","musyrif","lecturer","trainer","counselor","other"]}),F("highestQualification","Pendidikan tertinggi","text",false,{max:120}),F("specialization","Bidang keahlian","text",false,{max:240}),F("certificationSummary","Sertifikasi/kualifikasi (ringkas)","textarea",false,{max:2000}),F("teachingExperienceYears","Pengalaman mengajar (tahun)","number",false,{step:"0.5"}),F("employmentCategory","Kategori kepegawaian","text",false,{max:80}),F("isActive","Aktif","checkbox")],columns:[["employee_id","Pegawai"],["educator_number","Nomor pendidik"],["educator_type","Jenis"],["highest_qualification","Pendidikan"],["specialization","Keahlian"],["is_active","Aktif"]]},
 {key:"employee-assignments",label:"Riwayat Penempatan & Struktur Organisasi",group:"Pengajar & Struktur Organisasi",endpoint:"employee-assignments",read:"hr.organization.read",write:"hr.organization.write",fields:[REL("employeeId","Pegawai","employees","legal_name"),REL("departmentId","Unit / departemen","hr-departments","department_name",false),REL("positionId","Jabatan","hr-positions","position_name",false),REL("managerEmployeeId","Atasan langsung","employees","legal_name",false),F("assignmentType","Jenis penugasan","select",true,{options:["primary","secondary","acting","project","temporary"]}),F("startsOn","Mulai berlaku","date",true),F("endsOn","Berakhir","date"),F("isPrimary","Penugasan utama","checkbox"),F("decisionReference","Nomor SK / dasar penugasan","text",false,{max:160})],columns:[["employee_id","Pegawai"],["department_id","Unit / departemen"],["position_id","Jabatan"],["manager_employee_id","Atasan langsung"],["assignment_type","Jenis"],["starts_on","Mulai"],["ends_on","Akhir"],["is_primary","Utama"]]},
 {key:"academic-years",label:"Tahun Ajaran",group:"Akademik",endpoint:"academic-years",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode tahun ajaran","text",true),F("name","Nama tahun ajaran","text",true),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal selesai","date",true),F("status","Status","select",false,{options:["planned","active","closed"]})],columns:[["code","Kode"],["name","Tahun ajaran"],["starts_on","Mulai"],["ends_on","Selesai"],["status","Status"]]},
 {key:"academic-terms",label:"Semester / Term",group:"Akademik",endpoint:"academic-terms",read:"academic.classes.read",write:"academic.classes.write",fields:[REL("academicYearId","Tahun ajaran","academic-years","name"),F("code","Kode semester","text",true),F("name","Nama semester","text",true),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal selesai","date",true),F("status","Status","select",false,{options:["planned","active","closed"]})],columns:[["name","Semester"],["code","Kode"],["starts_on","Mulai"],["ends_on","Selesai"],["status","Status"]]},
 {key:"programs",label:"Program Pendidikan",group:"Akademik",endpoint:"programs",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode program","text",true),F("name","Nama program","text",true),F("description","Deskripsi","textarea"),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Program"],["description","Deskripsi"],["status","Status"]]},
 {key:"subjects",label:"Mata Pelajaran / Kajian",group:"Akademik",endpoint:"subjects",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode","text",true),F("name","Nama mata pelajaran / kitab","text",true),F("subjectType","Kategori","select",true,{options:["general","religious","language","vocational","other"]}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Nama"],["subject_type","Kategori"],["status","Status"]]},
 {key:"classes",label:"Rombongan Belajar / Halaqah",group:"Akademik",endpoint:"classes",read:"academic.classes.read",write:"academic.classes.write",fields:[REL("campusId","Kampus","campuses","name"),REL("academicYearId","Tahun ajaran","academic-years","name"),REL("programId","Program","programs","name"),F("code","Kode kelas / halaqah","text",true),F("name","Nama kelas","text",true),F("capacity","Kapasitas santri","number",false,{step:"1"}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Kelas"],["capacity","Kapasitas"],["status","Status"]]},
 {key:"enrollments",label:"Penempatan Kelas",group:"Akademik",endpoint:"enrollments",read:"academic.enrollments.read",write:"academic.enrollments.write",fields:[REL("studentId","Santri","students","legalName"),REL("academicYearId","Tahun ajaran","academic-years","name"),REL("classGroupId","Kelas","classes","name",false),F("enrolledOn","Tanggal penempatan","date"),F("endedOn","Tanggal akhir","date"),F("status","Status","select",false,{options:["enrolled"]})],columns:[["student_id","Santri"],["academic_year_id","Tahun ajaran"],["class_group_id","Kelas / halaqah"],["enrolled_on","Tanggal"],["status","Status"]]},
 {key:"attendance-sessions",label:"Sesi Presensi",group:"Akademik",endpoint:"attendance-sessions",read:"academic.attendance.read",write:"academic.attendance.write",fields:[REL("classGroupId","Kelas / halaqah","classes","name"),F("sessionDate","Tanggal","date",true),F("sessionLabel","Kegiatan / sesi","text",false),F("status","Status sesi","select",false,{options:["open"]})],columns:[["class_group_id","Kelas / halaqah"],["session_date","Tanggal"],["session_label","Sesi"],["status","Status"]]},
 {key:"attendance-records",label:"Rekap Presensi Santri",group:"Akademik",endpoint:"attendance-records",read:"academic.attendance.read",write:"academic.attendance.write",fields:[REL("attendanceSessionId","Sesi presensi","attendance-sessions","session_date"),REL("studentId","Santri","students","legalName"),F("attendanceStatus","Kehadiran","select",true,{options:["present","excused","sick","absent","late"]}),F("note","Catatan","text")],columns:[["attendance_session_id","Sesi presensi"],["student_id","Santri"],["attendance_status","Kehadiran"],["note","Catatan"]]},
 {key:"dormitories",label:"Asrama",group:"Kesantrian",endpoint:"dormitories",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("campusId","Kampus","campuses","name",false),F("dormitoryCode","Kode asrama","text",true),F("dormitoryName","Nama asrama","text",true),F("genderPolicy","Kebijakan penghuni","select",true,{options:["male","female","mixed"]}),F("isActive","Aktif","checkbox")],columns:[["dormitory_code","Kode"],["dormitory_name","Asrama"],["gender_policy","Kebijakan"],["is_active","Aktif"]]},
 {key:"boarding-rooms",label:"Kamar Asrama",group:"Kesantrian",endpoint:"boarding-rooms",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("dormitoryId","Asrama","dormitories","dormitory_name"),F("roomCode","Kode kamar","text",true),F("floorLabel","Lantai / blok","text"),F("capacity","Kapasitas","number",true,{step:"1"}),F("isActive","Aktif","checkbox")],columns:[["dormitory_id","Asrama"],["room_code","Kamar"],["floor_label","Lantai"],["capacity","Kapasitas"],["is_active","Aktif"]]},
 {key:"boarding-beds",label:"Tempat Tidur",group:"Kesantrian",endpoint:"boarding-beds",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("roomId","Kamar","boarding-rooms","room_code"),F("bedCode","Kode tempat tidur","text",true),F("bedStatus","Status","select",false,{options:["available"]})],columns:[["room_id","Kamar"],["bed_code","Kode"],["bed_status","Status"]]},
 {key:"boarding-assignments",label:"Penempatan Santri",group:"Kesantrian",endpoint:"boarding-assignments",read:"boarding.assignments.manage",write:"boarding.assignments.manage",fields:[REL("bedId","Tempat tidur","boarding-beds","bed_code"),REL("studentId","Santri","students","legalName"),F("assignedFrom","Mulai menempati","date",true),F("assignedUntil","Selesai menempati","date")],columns:[["bed_id","Tempat tidur"],["student_id","Santri"],["assigned_from","Mulai"],["assigned_until","Selesai"]]},
 {key:"leave-requests",label:"Perizinan Keluar",group:"Kesantrian",endpoint:"leave-requests",read:"boarding.leave.read",write:"boarding.leave.decide",fields:[REL("studentId","Santri","students","legalName"),F("requestedFrom","Waktu keluar","datetime-local",true),F("requestedUntil","Rencana kembali","datetime-local",true),F("destination","Tujuan","text"),F("reason","Alasan","textarea",true,{max:1000})],columns:[["student_id","Santri"],["requested_from","Keluar"],["requested_until","Kembali"],["destination","Tujuan"],["decision_status","Keputusan"]]},
 {key:"incidents",label:"Pembinaan & Insiden",group:"Kesantrian",endpoint:"incidents",read:"boarding.incidents.read",write:"boarding.incidents.write",fields:[REL("studentId","Santri","students","legalName"),F("incidentType","Kategori kejadian","select",true,{options:["guidance","discipline","safety","health_referral","other"]}),F("severity","Tingkat","select",true,{options:["low","medium","high","critical"]}),F("description","Uraian faktual","textarea",true,{max:2000,hint:"Tuliskan fakta seperlunya. Jangan masukkan diagnosis, detail kesehatan, atau data sensitif yang tidak diperlukan."}),F("occurredAt","Waktu kejadian","datetime-local",true)],columns:[["student_id","Santri"],["incident_type","Kategori"],["severity","Tingkat"],["follow_up_status","Tindak lanjut"],["occurred_at","Waktu"]]},
 {key:"library-catalog",label:"Katalog Buku / Kitab",group:"Perpustakaan",endpoint:"library-catalog",read:"library.catalog.read",write:"library.catalog.write",fields:[F("isbn","ISBN","text"),F("itemCode","Kode katalog","text",true),F("title","Judul buku / kitab","text",true),F("subtitle","Subjudul","text"),F("authors","Penulis (pisahkan koma)","array"),F("publisher","Penerbit","text"),F("publicationYear","Tahun terbit","number",false,{step:"1"}),F("category","Kategori","text"),F("languageCode","Kode bahasa","text"),F("isReferenceOnly","Hanya baca di tempat","checkbox"),F("isActive","Aktif","checkbox")],columns:[["item_code","Kode"],["title","Judul"],["authors","Penulis"],["publisher","Penerbit"],["publication_year","Tahun"],["category","Kategori"]]},
 {key:"library-copies",label:"Eksemplar & Barcode",group:"Perpustakaan",endpoint:"library-copies",read:"library.catalog.read",write:"library.catalog.write",fields:[REL("catalogItemId","Judul katalog","library-catalog","title"),REL("campusId","Kampus","campuses","name",false),F("barcode","Barcode","text",true),F("shelfLocation","Lokasi rak","text"),F("copyStatus","Status","select",false,{options:["available"]}),F("acquiredOn","Tanggal perolehan","date")],columns:[["catalog_item_id","Judul katalog"],["barcode","Barcode"],["shelf_location","Rak"],["copy_status","Status"]]},
 {key:"library-loans",label:"Peminjaman",group:"Perpustakaan",endpoint:"library-loans",read:"library.loans.read",write:"library.loans.write",fields:[REL("copyId","Eksemplar","library-copies","barcode"),F("borrowerType","Jenis peminjam","select",true,{options:["student"]}),REL("borrowerId","Santri peminjam","students","legalName"),F("dueAt","Batas pengembalian","datetime-local",true)],columns:[["copy_id","Eksemplar"],["borrower_type","Jenis"],["borrower_id","Peminjam"],["due_at","Jatuh tempo"],["loan_status","Status"]]},
 {key:"cms-pages",label:"Halaman Website",group:"Website & Publikasi",endpoint:"cms-pages",read:"cms.pages.manage",write:"cms.pages.manage",fields:[F("slug","Slug URL","text",true),F("title","Judul halaman","text",true),F("excerpt","Ringkasan","textarea"),F("bodyMarkdown","Konten (Markdown)","textarea",true,{max:30000}),F("pageStatus","Status","select",false,{options:["draft"]}),F("seoTitle","Judul SEO","text"),F("seoDescription","Deskripsi SEO","textarea")],columns:[["slug","Slug"],["title","Judul"],["page_status","Status"],["published_at","Terbit"]]},
 {key:"announcements",label:"Pengumuman",group:"Website & Publikasi",endpoint:"announcements",read:"cms.announcements.manage",write:"cms.announcements.manage",fields:[F("title","Judul pengumuman","text",true),F("summary","Ringkasan","textarea"),F("bodyMarkdown","Isi pengumuman","textarea",true,{max:12000}),F("audience","Audiens","select",true,{options:["public","parents","students","staff","internal"]}),F("announcementStatus","Status","select",false,{options:["draft"]}),F("publishAt","Jadwal terbit","datetime-local"),F("expireAt","Kedaluwarsa","datetime-local")],columns:[["title","Judul"],["audience","Audiens"],["announcement_status","Status"],["publish_at","Terbit"],["expire_at","Berakhir"]]},
 {key:"contacts",label:"Kontak Wali / Alumni / Donatur",group:"CRM & Relasi",endpoint:"contacts",read:"crm.contacts.read",write:"crm.contacts.write",fields:[F("contactType","Jenis kontak","select",true,{options:["guardian","alumni","donor","partner","prospect","other"]}),F("displayName","Nama kontak","text",true),F("email","Email","text"),F("phone","Telepon","text"),F("organizationName","Organisasi","text"),F("consentStatus","Status persetujuan komunikasi","select",true,{options:["unknown"],hint:"Status tetap unknown sampai bukti persetujuan dan alur penarikan persetujuan tersedia."})],columns:[["contact_type","Jenis"],["display_name","Nama"],["email","Email"],["phone","Telepon"],["consent_status","Persetujuan"]]},
 {key:"interactions",label:"Riwayat Komunikasi",group:"CRM & Relasi",endpoint:"interactions",read:"crm.contacts.read",write:"crm.contacts.write",fields:[REL("contactId","Kontak","contacts","display_name"),F("channel","Kanal","select",true,{options:["phone","email","whatsapp","meeting","letter","other"]}),F("subject","Subjek","text",true),F("notes","Catatan tindak lanjut","textarea"),F("interactionAt","Waktu komunikasi","datetime-local")],columns:[["contact_id","Kontak"],["channel","Kanal"],["subject","Subjek"],["interaction_at","Waktu"]]},
 {key:"donor-pledges",label:"Komitmen Donasi",group:"CRM & Relasi",endpoint:"donor-pledges",read:"crm.donations.manage",write:"crm.donations.manage",fields:[REL("contactId","Donatur","contacts","display_name"),F("pledgeReference","Nomor referensi","text",true),F("pledgedAmount","Nilai komitmen (IDR)","number",true,{step:"0.01"}),F("currencyCode","Mata uang","text",false),F("pledgedOn","Tanggal komitmen","date"),F("expectedOn","Perkiraan realisasi","date"),F("pledgeStatus","Status","select",false,{options:["pledged"]}),F("notes","Catatan","textarea")],columns:[["pledge_reference","Referensi"],["contact_id","Donatur"],["pledged_amount","Nilai"],["pledged_on","Tanggal"],["pledge_status","Status"]]},
 {key:"assets",label:"Register Aset Tetap",group:"Aset & Pengadaan",endpoint:"assets",read:"assets.register.read",write:"assets.register.write",fields:[REL("campusId","Kampus","campuses","name",false),F("assetCode","Kode aset","text",true),F("assetName","Nama aset","text",true),F("category","Kategori","text",true),F("acquisitionDate","Tanggal perolehan","date"),F("acquisitionCost","Nilai perolehan (IDR)","number",false,{step:"0.01"}),F("usefulLifeMonths","Masa manfaat (bulan)","number",false,{step:"1"}),F("assetStatus","Status","select",false,{options:["active"]}),F("locationLabel","Lokasi","text")],columns:[["asset_code","Kode"],["asset_name","Aset"],["category","Kategori"],["acquisition_date","Tanggal"],["acquisition_cost","Nilai"],["asset_status","Status"]]},
 {key:"suppliers",label:"Pemasok / Vendor",group:"Aset & Pengadaan",endpoint:"suppliers",read:"procurement.suppliers.manage",write:"procurement.suppliers.manage",fields:[F("supplierCode","Kode pemasok","text",true),F("supplierName","Nama pemasok","text",true),F("taxNumber","NPWP (opsional)","text"),F("email","Email","text"),F("phone","Telepon","text"),F("address","Alamat pemasok","address",false,{hint:"Isi alamat pemasok secara terstruktur."})],columns:[["supplier_code","Kode"],["supplier_name","Pemasok"],["tax_number","NPWP"],["email","Email"],["phone","Telepon"]]},
 {key:"purchase-requests",label:"Permintaan Pengadaan",group:"Aset & Pengadaan",endpoint:"purchase-requests",read:"procurement.requests.read",write:"procurement.requests.write",fields:[REL("campusId","Kampus","campuses","name",false),F("requestNumber","Nomor permintaan","text",true),F("requestDate","Tanggal permintaan","date"),F("requiredBy","Dibutuhkan tanggal","date"),F("purpose","Tujuan dan justifikasi kebutuhan","textarea",true,{max:1000})],columns:[["request_number","Nomor"],["request_date","Tanggal"],["required_by","Dibutuhkan"],["purpose","Tujuan"],["request_status","Status"]]},
 {key:"academic-class-subjects",label:"Mata Pelajaran per Kelas",group:"Akademik",endpoint:"academic-class-subjects",read:"academic.classes.read",write:"academic.classes.write",fields:[REL("classGroupId","Kelas / halaqah","classes","name"),REL("subjectId","Mata pelajaran / kajian","subjects","name"),F("weeklyPeriods","Jam pelajaran per minggu","number",false,{step:"1"})],columns:[["class_group_id","Kelas / halaqah"],["subject_id","Mata pelajaran / kajian"],["weekly_periods","Jam / minggu"]]},
 {key:"guardians",label:"Data Wali Santri",group:"Master Data Santri",endpoint:"guardians",read:"academic.students.read",write:"academic.students.create",fields:[F("displayName","Nama wali","text",true,{max:180}),F("relationshipDefault","Hubungan keluarga","text",false,{max:40}),F("phonePrimary","Telepon utama","text",false,{max:32}),F("phoneAlternate","Telepon alternatif","text",false,{max:32}),F("email","Email","text",false,{max:254}),F("occupation","Pekerjaan","text",false,{max:120}),F("address","Alamat wali","address",false,{hint:"Isi komponen alamat wali secara terstruktur."}),F("preferredContactChannel","Kanal komunikasi","select",false,{options:["whatsapp","phone","email","letter","none"]}),F("consentStatus","Status persetujuan komunikasi","select",false,{options:["pending","granted","withdrawn","not_required"]})],columns:[["display_name","Nama wali"],["relationship_default","Hubungan"],["phone_primary","Telepon"],["email","Email"],["consent_status","Persetujuan"]]},
 {key:"student-guardians",label:"Relasi Santri dan Wali",group:"Master Data Santri",endpoint:"student-guardians",read:"academic.students.read",write:"academic.students.update",fields:[REL("studentId","Santri","student-details","legal_name"),REL("guardianId","Wali santri","guardians","display_name"),F("relationshipCode","Hubungan keluarga","text",true,{max:40}),F("isPrimary","Wali utama","checkbox"),F("isEmergencyContact","Kontak darurat","checkbox"),F("validFrom","Mulai berlaku","date"),F("validUntil","Akhir berlaku","date")],columns:[["student_id","Santri"],["guardian_id","Wali santri"],["relationship_code","Hubungan"],["is_primary","Wali utama"],["is_legal_guardian","Wali sah"],["is_emergency_contact","Darurat"],["can_pickup_student","Izin jemput"],["verified_at","Diverifikasi"]]},
 {key:"employees",label:"Data Pegawai",group:"SDM & Payroll",endpoint:"employees",read:"hr.employees.read",write:"hr.employees.write",fields:[F("employeeNumber","Nomor pegawai","text",true,{max:48}),F("legalName","Nama lengkap","text",true,{max:180}),F("preferredName","Nama panggilan","text",false,{max:180}),F("email","Email kedinasan","text",false,{max:254}),F("phone","Nomor telepon","text",false,{max:32}),F("joinedOn","Tanggal mulai bekerja","date",true),F("employmentStatus","Status kepegawaian","select",false,{options:["active","on_leave","resigned","terminated","retired"]})],columns:[["employee_number","Nomor pegawai"],["legal_name","Nama"],["joined_on","Mulai bekerja"],["employment_status","Status"]]},
 {key:"hr-departments",label:"Unit / Departemen",group:"Pengajar & Struktur Organisasi",endpoint:"hr-departments",read:"hr.organization.read",write:"hr.organization.write",fields:[F("departmentCode","Kode unit","text",true),F("departmentName","Nama unit / departemen","text",true),REL("parentDepartmentId","Unit induk","hr-departments","department_name",false),REL("headEmployeeId","Kepala unit","employees","legal_name",false),REL("campusId","Kampus","campuses","name",false),F("effectiveFrom","Mulai berlaku","date"),F("effectiveUntil","Akhir berlaku","date"),F("isActive","Aktif","checkbox")],columns:[["department_code","Kode"],["department_name","Departemen"],["parent_department_id","Unit induk"],["head_employee_id","Kepala unit"],["effective_from","Mulai"],["effective_until","Akhir"],["is_active","Aktif"]]},
 {key:"hr-positions",label:"Jabatan Pegawai",group:"Pengajar & Struktur Organisasi",endpoint:"hr-positions",read:"hr.organization.read",write:"hr.organization.write",fields:[F("positionCode","Kode jabatan","text",true),F("positionName","Nama jabatan","text",true),REL("departmentId","Departemen","hr-departments","department_name",false),REL("parentPositionId","Jabatan induk","hr-positions","position_name",false),F("jobFamily","Keluarga jabatan","text",false,{max:100}),F("positionLevel","Level jabatan","number",false,{step:"1"}),F("jobDescription","Uraian tugas","textarea",false,{max:3000}),F("approvalScope","Lingkup kewenangan (JSON)","json",false,{max:2000}),F("isActive","Aktif","checkbox")],columns:[["position_code","Kode"],["position_name","Jabatan"],["department_id","Departemen"],["parent_position_id","Jabatan induk"],["job_family","Keluarga"],["position_level","Level"],["is_active","Aktif"]]},
 {key:"hr-contracts",label:"Kontrak / Perjanjian Kerja",group:"SDM & Payroll",endpoint:"hr-contracts",read:"hr.contracts.read",write:"hr.contracts.write",fields:[REL("employeeId","Pegawai","employees","legal_name"),REL("positionId","Jabatan","hr-positions","position_name",false),F("contractType","Jenis hubungan kerja","select",true,{options:["permanent","fixed_term","part_time","honorary","volunteer"]}),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal berakhir","date"),F("baseSalary","Imbalan dasar (IDR)","number",true,{step:"0.01"}),F("currencyCode","Mata uang","select",false,{options:["IDR"]}),F("status","Status awal","select",false,{options:["draft"]})],columns:[["employee_id","Pegawai"],["position_id","Jabatan"],["contract_type","Jenis"],["starts_on","Mulai"],["ends_on","Berakhir"],["base_salary","Imbalan"],["status","Status"]]},
 {key:"hr-payroll-periods",label:"Periode Penggajian",group:"SDM & Payroll",endpoint:"hr-payroll-periods",read:"hr.payroll.read",write:"hr.payroll.prepare",fields:[F("periodCode","Kode periode","text",true),F("startsOn","Tanggal mulai periode","date",true),F("endsOn","Tanggal akhir periode","date",true),F("payDate","Tanggal pembayaran rencana","date",true),F("status","Status","select",false,{options:["open"]})],columns:[["period_code","Kode"],["starts_on","Mulai"],["ends_on","Akhir"],["pay_date","Rencana bayar"],["status","Status"]]},
 {key:"hr-payroll-runs",label:"Draft Siklus Payroll",group:"SDM & Payroll",endpoint:"hr-payroll-runs",read:"hr.payroll.read",write:"hr.payroll.prepare",fields:[REL("payrollPeriodId","Periode penggajian","hr-payroll-periods","period_code"),F("runNumber","Nomor proses payroll","text",true),F("runType","Jenis proses","select",false,{options:["regular","bonus","adjustment"]}),F("status","Status awal","select",false,{options:["draft"]})],columns:[["run_number","Nomor proses"],["payroll_period_id","Periode penggajian"],["run_type","Jenis"],["status","Status"]]},
 {key:"purchase-request-lines",label:"Rincian Permintaan Pengadaan",group:"Aset & Pengadaan",endpoint:"purchase-request-lines",read:"procurement.requests.read",write:"procurement.requests.write",fields:[REL("requestId","Nomor permintaan","purchase-requests","request_number"),F("description","Uraian barang / jasa","textarea",true,{max:500}),F("quantity","Jumlah","number",true,{step:"0.001"}),F("estimatedUnitCost","Estimasi harga satuan (IDR)","number",false,{step:"0.01"})],columns:[["request_id","Permintaan pengadaan"],["description","Uraian"],["quantity","Jumlah"],["estimated_unit_cost","Estimasi satuan"]]},
 {key:"purchase-order-lines",label:"Rincian Pesanan Pembelian",group:"Aset & Pengadaan",endpoint:"purchase-order-lines",read:"procurement.orders.manage",write:"procurement.orders.manage",fields:[REL("purchaseOrderId","Nomor pesanan","purchase-orders","order_number"),F("description","Uraian barang / jasa","textarea",true,{max:500}),F("quantity","Jumlah","number",true,{step:"0.001"}),F("unitCost","Harga satuan (IDR)","number",true,{step:"0.01"})],columns:[["purchase_order_id","Pesanan pembelian"],["description","Uraian"],["quantity","Jumlah"],["unit_cost","Harga satuan"]]},
 {key:"asset-events",label:"Riwayat Pergerakan & Pemeliharaan Aset",group:"Aset & Pengadaan",endpoint:"asset-events",read:"assets.register.read",write:"assets.register.write",fields:[REL("assetId","Aset","assets","asset_name"),F("eventType","Jenis peristiwa","select",true,{options:["assigned","moved","maintenance","disposed","status_changed","audited"]}),F("eventData","Detail peristiwa (JSON)","json",false,{hint:"Catat lokasi/penanggung jawab/tindakan secara ringkas; jangan masukkan data pribadi yang tidak diperlukan."}),F("occurredAt","Waktu peristiwa","datetime-local")],columns:[["asset_id","Aset"],["event_type","Peristiwa"],["event_data","Detail"],["occurred_at","Waktu"]]},
 {key:"purchase-orders",label:"Pesanan Pembelian",group:"Aset & Pengadaan",endpoint:"purchase-orders",read:"procurement.orders.manage",write:"procurement.orders.manage",fields:[REL("supplierId","Pemasok","suppliers","supplier_name"),REL("requestId","Permintaan terkait","purchase-requests","request_number",false),F("orderNumber","Nomor pesanan","text",true),F("orderedOn","Tanggal pesanan","date"),F("expectedOn","Estimasi penerimaan","date"),F("totalAmount","Nilai total (IDR)","number",false,{step:"0.01"})],columns:[["order_number","Nomor"],["supplier_id","Pemasok"],["ordered_on","Tanggal"],["expected_on","Estimasi"],["total_amount","Total"],["order_status","Status"]]},

 {key:"admission-periods",label:"Periode Penerimaan Santri (PPDB)",group:"PPDB & Penerimaan",endpoint:"admission-periods",read:"admissions.periods.read",write:"admissions.periods.manage",fields:[F("periodCode","Kode periode","text",true),F("name","Nama gelombang","text",true),F("opensAt","Mulai pendaftaran","datetime-local",true),F("closesAt","Batas pendaftaran","datetime-local",true),F("academicYearId","Tahun ajaran","text"),F("quota","Kuota","number"),F("status","Status","select",true,{options:["draft","open","closed","archived"]})],columns:[["period_code","Kode"],["name","Gelombang"],["opens_at","Mulai"],["closes_at","Batas"],["quota","Kuota"],["status","Status"]]},
 {key:"admission-applications",label:"Formulir & Seleksi Calon Santri",group:"PPDB & Penerimaan",endpoint:"admission-applications",read:"admissions.applications.read",write:"admissions.applications.review",fields:[REL("periodId","Periode PPDB","admission-periods","name"),F("applicationNumber","Nomor pendaftaran","text",true),F("applicantName","Nama calon santri","text",true),F("birthDate","Tanggal lahir","date"),F("previousSchool","Asal sekolah","text"),F("guardianName","Nama wali","text",true),F("guardianPhone","Telepon wali","text",true),F("address","Alamat lengkap","address"),F("selectionResult","Keputusan seleksi","select",false,{options:["pending","accepted","waitlisted","rejected","needs_information"]})],columns:[["application_number","Nomor"],["applicant_name","Calon santri"],["guardian_name","Wali"],["guardian_phone","Kontak wali"],["selection_result","Keputusan"]]},
 {key:"finance-accounts",label:"Bagan Akun & Kode Rekening",group:"Keuangan & Akuntansi",endpoint:"finance-accounts",read:"finance.accounts.read",write:"finance.accounts.write",fields:[F("accountCode","Kode akun","text",true),F("accountName","Nama akun","text",true),F("accountType","Kelompok akun","select",true,{options:["asset","liability","equity","income","expense"]}),F("parentCode","Kode akun induk","text"),F("normalBalance","Saldo normal","select",true,{options:["debit","credit"]}),F("isActive","Aktif","checkbox")],columns:[["account_code","Kode"],["account_name","Nama akun"],["account_type","Kelompok"],["normal_balance","Saldo normal"],["is_active","Aktif"]]},
 {key:"finance-periods",label:"Periode Buku & Anggaran",group:"Keuangan & Akuntansi",endpoint:"finance-periods",read:"finance.journals.read",write:"finance.periods.manage",fields:[F("code","Kode periode","text",true),F("name","Nama periode","text",true),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal akhir","date",true),F("budgetAmount","Pagu anggaran (IDR)","number",false,{step:"0.01"}),F("status","Status","select",true,{options:["draft","open","closed"]})],columns:[["code","Kode"],["name","Periode"],["starts_on","Mulai"],["ends_on","Selesai"],["budget_amount","Anggaran"],["status","Status"]]},
 {key:"finance-journals",label:"Jurnal Umum & Posting",group:"Keuangan & Akuntansi",endpoint:"finance-journals",read:"finance.journals.read",write:"finance.journals.write",fields:[F("entryNumber","Nomor jurnal","text",true),F("entryDate","Tanggal jurnal","date",true),F("description","Uraian transaksi","textarea",true),F("debitAccount","Akun debit","text",true),F("creditAccount","Akun kredit","text",true),F("amount","Nilai (IDR)","number",true,{step:"0.01"}),F("attachmentRef","Referensi bukti","text")],columns:[["entry_number","Nomor"],["entry_date","Tanggal"],["description","Uraian"],["debit_account","Debit"],["credit_account","Kredit"],["amount","Nilai"],["status","Status"]]},
 {key:"inventory-items",label:"Master Barang & Persediaan",group:"Inventaris & Gudang",endpoint:"inventory-items",read:"inventory.items.read",write:"inventory.items.write",fields:[F("itemCode","Kode barang","text",true),F("itemName","Nama barang","text",true),F("category","Kategori","text",true),F("unitCode","Satuan","text",true),F("minimumStock","Stok minimum","number"),F("unitCost","Harga perolehan (IDR)","number"),F("isActive","Aktif","checkbox")],columns:[["item_code","Kode"],["item_name","Nama barang"],["category","Kategori"],["unit_code","Satuan"],["on_hand","Stok"],["minimum_stock","Batas minimum"]]},
 {key:"inventory-warehouses",label:"Gudang & Lokasi Penyimpanan",group:"Inventaris & Gudang",endpoint:"inventory-warehouses",read:"inventory.items.read",write:"inventory.items.write",fields:[F("warehouseCode","Kode gudang","text",true),F("warehouseName","Nama gudang","text",true),F("campusName","Kampus","text"),F("location","Lokasi","textarea"),F("custodian","Penanggung jawab","text"),F("isActive","Aktif","checkbox")],columns:[["warehouse_code","Kode"],["warehouse_name","Nama gudang"],["campus_name","Kampus"],["location","Lokasi"],["custodian","Penanggung jawab"]]},
 {key:"inventory-movements",label:"Penerimaan, Pengeluaran & Mutasi Stok",group:"Inventaris & Gudang",endpoint:"inventory-movements",read:"inventory.movements.read",write:"inventory.movements.write",fields:[F("itemCode","Kode barang","text",true),F("warehouseCode","Kode gudang","text",true),F("movementType","Jenis mutasi","select",true,{options:["receipt","issue","transfer_in","transfer_out","adjustment","return"]}),F("quantity","Jumlah","number",true,{step:"0.001"}),F("occurredAt","Tanggal transaksi","datetime-local",true),F("referenceNumber","Nomor dokumen","text"),F("notes","Catatan","textarea")],columns:[["item_code","Barang"],["warehouse_code","Gudang"],["movement_type","Jenis"],["quantity","Jumlah"],["occurred_at","Tanggal"],["reference_number","Dokumen"]]}

];

function getFieldSections(resource:Resource):Array<{title:string;fields:Field[];note?:string;classification?:"general"|"restricted";applicability?:string;regulatoryBasis?:Array<{label:string;url:string}>}> {
 const configured=getStudentFormSections(resource.key,resource.fields.map(field=>field.key));
 if(configured){
  return configured.map(section=>({...section,fields:section.fields.map(key=>resource.fields.find(field=>field.key===key)).filter((field):field is Field=>Boolean(field))}));
 }
 const sections=new Map<string,Field[]>();
 for(const field of resource.fields){
  const key=field.key.toLowerCase();
  const title=/contract|salary|payroll|tax|bpjs|leave|attendance|employee|educator|position|department|manager|assignment/.test(key)?"Kepegawaian & Penugasan"
   :/account|amount|budget|debit|credit|fund|payment|invoice|journal|period/.test(key)?"Keuangan & Periode"
   :/item|stock|warehouse|quantity|movement|unit|supplier|purchase|asset/.test(key)?"Barang, Lokasi & Transaksi"
   :/document|attachment|evidence|decision|verification|approval|reference/.test(key)?"Dokumen & Verifikasi"
   :/date|time|starts|ends|status|active|type|category|code/.test(key)?"Periode & Klasifikasi"
   :/address|phone|email|contact|location/.test(key)?"Alamat & Kontak"
   :/description|notes|instruction|summary|history|data|detail/.test(key)?"Keterangan & Riwayat":"Informasi Utama";
  sections.set(title,[...(sections.get(title)??[]),field]);
 }
 return [...sections.entries()].map(([title,fields])=>({title,fields}));
}
function toLabel(value: unknown): string {
 if (value===null||value===undefined||value==="") return "—";
 if (typeof value==="boolean") return value?"Ya":"Tidak";
 if (typeof value==="object") return JSON.stringify(value);
 return String(value);
}
function toColumn(key:string):string{return key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);}
const ADDRESS_FIELDS: Array<[string,string]> = [
 ["street","Jalan / alamat lengkap"], ["rt","RT"], ["rw","RW"],
 ["village","Desa / kelurahan"], ["district","Kecamatan"],
 ["city","Kabupaten / kota"], ["province","Provinsi"],
 ["postalCode","Kode pos"], ["countryCode","Kode negara"],
];
function parseAddress(value: unknown): Record<string,string> {
 if (typeof value === "string") {
  try { const parsed: unknown = JSON.parse(value); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.fromEntries(Object.entries(parsed).map(([k,v])=>[k,String(v??"")])); } catch { return {}; }
 }
 if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v??"")]));
 return {};
}
function toFormValue(field:Field,row:Row):string|boolean{
 const value=row[toColumn(field.key)];
 if(field.type==="checkbox")return Boolean(value);
 if(value===null||value===undefined)return "";
 if(field.type==="json"||field.type==="address")return JSON.stringify(value,null,2);
 if(field.type==="array")return Array.isArray(value)?value.join(", "):String(value);
 if(field.type==="datetime-local"){
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime()))return "";
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
 }
 if(field.type==="date")return String(value).slice(0,10);
 return String(value);
}

export function getModuleResourceLabel(key:string):string { return key==="all"?"Semua Modul":RESOURCES.find(resource=>resource.key===key)?.label??"Modul"; }

function csvCell(value: unknown): string {
 const raw=value===null||value===undefined?"":String(value);
 const safe=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportRowsCsv(resource:Resource,rows:Row[]) {
 const headers=resource.columns.map(([,label])=>label);
 const keys=resource.columns.map(([key])=>key);
 const csv="\uFEFF"+[headers.map(csvCell).join(","),...rows.map(row=>keys.map(key=>csvCell(row[key])).join(","))].join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download="pondok-os-"+resource.key+"-"+new Date().toISOString().slice(0,10)+".csv";
 document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
}

function ModuleWorkspace({organizationId,permissions,initialResourceKey,onResourceChange,preview=false}:Props) {
 const available=RESOURCES;
 const groups=useMemo(()=>Array.from(new Set(["Semua Modul",...available.map(r=>r.group)])),[available]);
 const requestedGroup=initialResourceKey==="all"?"Semua Modul":RESOURCES.find(r=>r.key===initialResourceKey)?.group;
 const initialResource=initialResourceKey==="all"?available[0]:available.find(r=>r.key===initialResourceKey)??available.find(r=>r.group===requestedGroup);
 const [group,setGroup]=useState(initialResourceKey==="all"?"Semua Modul":initialResource?.group??requestedGroup??groups[0]??"");
 const [resourceKey,setResourceKey]=useState(initialResource?.key??(initialResourceKey==="all"?"":initialResourceKey));
 const internalSelection=useRef(false);
 useEffect(()=>{
  if(internalSelection.current){internalSelection.current=false;return;}
  const target=initialResourceKey==="all"?available[0]:available.find(r=>r.key===initialResourceKey)??available.find(r=>r.group===requestedGroup);
  if(initialResourceKey==="all"){setGroup("Semua Modul");if(target)setResourceKey(target.key);}
  else{setGroup(target?.group??requestedGroup??groups[0]??"");setResourceKey(target?.key??initialResourceKey);}
 },[initialResourceKey,available,requestedGroup,groups]);
 const [rows,setRows]=useState<Row[]>([]);
 const [lookups,setLookups]=useState<Record<string,Lookup[]>>({});
 const [lookupLoading,setLookupLoading]=useState<string[]>([]);
 const [lookupErrors,setLookupErrors]=useState<Record<string,string>>({});
 const [form,setForm]=useState<Record<string,string|boolean>>({});
 const [editingRow,setEditingRow]=useState<Row|null>(null);
 const [detailRow,setDetailRow]=useState<Row|null>(null);
 const [showSensitiveDetail,setShowSensitiveDetail]=useState(false);
 const [showForm,setShowForm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [guardianVerificationRow,setGuardianVerificationRow]=useState<Row|null>(null);
 const [guardianLegal,setGuardianLegal]=useState(false);
 const [guardianPickup,setGuardianPickup]=useState(false);
 const [guardianEvidence,setGuardianEvidence]=useState("");
 const canVerifyGuardian=preview||permissions.includes("academic.students.guardians.verify");
 const resourcesInGroup=group==="Semua Modul"?available:available.filter(r=>r.group===group);
 const resource=resourcesInGroup.find(r=>r.key===resourceKey)??(group==="Semua Modul"?resourcesInGroup[0]:undefined);
 const requestedResource=RESOURCES.find(r=>r.key===initialResourceKey);
 const requestedLabel=group==="Semua Modul"?"Semua Modul":requestedResource?.label??group;
 const guidance=resource?getModuleGuidance(resource.key):undefined;
 const canWrite=Boolean(resource&&(preview||permissions.includes(resource.write)));
 const request=useCallback(async<T,>(endpoint:string,init:RequestInit={}):Promise<T>=>{
  const token=await getAccessToken();
  const response=await fetch(`${API_BASE}/v1/modules/${endpoint}`,{...init,headers:{authorization:`Bearer ${token}`,"x-organization-id":organizationId,...(init.body?{"content-type":"application/json"}:{}),...init.headers}});
  const body=await response.json().catch(()=>({})) as {data?:T;error?:string};
  if(!response.ok) throw new Error(body.error??`Permintaan gagal (${response.status})`);
  return body as T;
 },[organizationId]);
 const load=useCallback(async()=>{
  if(preview){
   if(!resource){setRows([]);setBusy(false);return;}
   const demo:Row={id:"DEMO-ONLY-001"};
   for(const [column] of resource.columns){
    if(column==="status"||column.endsWith("_status"))demo[column]="contoh";
    else if(column.includes("date")||column.includes("_on")||column.includes("at"))demo[column]="2026-01-15";
    else if(column.includes("amount")||column.includes("quantity")||column.includes("quota")||column.includes("stock"))demo[column]=3;
    else if(column.includes("active"))demo[column]=true;
    else if(column.includes("name")||column.includes("description")||column.includes("title"))demo[column]="Contoh data — bukan data nyata";
    else demo[column]="DEMO-001";
   }
   setRows([demo]);setBusy(false);setError("");return;
  }
  if(!resource || !permissions.includes(resource.read)){setRows([]);setBusy(false);return;}
  setBusy(true);setError("");
  try{const result=await request<{data:Row[]}>(resource.endpoint);setRows(result.data??[]);}
  catch(e){setError(e instanceof Error?e.message:"Gagal memuat data modul.");}
  finally{setBusy(false);}
 },[request,resource,permissions,preview]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(preview){
   if(!resource){setLookups({});return;}
   const sources=Array.from(new Set(resource.fields.filter(f=>f.type==="relation"&&f.source).map(f=>f.source!)));
   setLookups(Object.fromEntries(sources.map(source=>[source,[{id:"DEMO-ONLY-001",label:"Contoh relasi (data sintetis)"}]])));
   setLookupLoading([]);setLookupErrors({});
   return;
  }
  if(!resource || !permissions.includes(resource.read)){setLookups({});setLookupLoading([]);setLookupErrors({});return;}
  let active=true;
  const sources=Array.from(new Set(resource.fields.filter(f=>f.type==="relation"&&f.source).map(f=>f.source!)));
  setLookupLoading(sources);setLookupErrors({});
  void Promise.all(sources.map(async source=>{
   try{
    if(source==="students"){
     const result=await request<{data:Array<Record<string,unknown>>}>("student-options");
     return {source,items:(result.data??[]).map(s=>({id:String(s.id),label:String(s.legalName??s.studentNumber)})),error:""};
    }
    const result=await request<{data:Row[]}>(source);
    const labelKey=resource.fields.find(f=>f.source===source)?.labelKey??"name";
    return {source,items:(result.data??[]).map(row=>({id:String(row.id),label:String(row[labelKey]??row.name??row.code??row.id)})),error:""};
   }catch(error){return {source,items:[],error:error instanceof Error?error.message:"Gagal memuat pilihan relasi."};}
  })).then(entries=>{if(active){setLookups(Object.fromEntries(entries.map(entry=>[entry.source,entry.items])));setLookupErrors(Object.fromEntries(entries.filter(entry=>entry.error).map(entry=>[entry.source,entry.error])));setLookupLoading([]);}});
  return()=>{active=false;};
 },[organizationId,request,resource,permissions,preview]);
 useEffect(()=>{setForm({});setShowForm(false);setEditingRow(null);setDetailRow(null);setShowSensitiveDetail(false);setGuardianVerificationRow(null);},[resourceKey]);
 const beginEdit=(row:Row)=>{
  if(!resource||!canWrite||!row.id)return;
  setEditingRow(row);
  setForm(Object.fromEntries(resource.fields.map(field=>[field.key,toFormValue(field,row)])));
  setShowForm(true);setError("");setNotice("");
 };
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(!resource)return;
  if(preview){setNotice("Mode pratinjau: formulir dapat diperiksa, tetapi tidak ada data yang dikirim atau disimpan.");setShowForm(false);return;}
  setBusy(true);setError("");setNotice("");
  try{
   const payload:Record<string,unknown>={};
   for(const field of resource.fields){
    const value=form[field.key];
    if(value===undefined||value==="")continue;
    if(field.type==="number")payload[field.key]=Number(value);
    else if(field.type==="checkbox")payload[field.key]=Boolean(value);
    else if(field.type==="array")payload[field.key]=String(value).split(",").map(v=>v.trim()).filter(Boolean);
    else if(field.type==="json"||field.type==="address"){try{payload[field.key]=JSON.parse(String(value));}catch{throw new Error(`Format data pada ${field.label} tidak valid.`);}}
    else if(field.type==="datetime-local")payload[field.key]=new Date(String(value)).toISOString();
    else payload[field.key]=value;
   }
   const endpoint=editingRow?.id
    ? `${resource.endpoint}?id=${encodeURIComponent(String(editingRow.id))}`
    : resource.endpoint;
   await request(endpoint,{method:editingRow?"PATCH":"POST",body:JSON.stringify(payload)});
   setForm({});setShowForm(false);setEditingRow(null);
   setNotice(editingRow?"Perubahan data berhasil disimpan dan diaudit.":"Data tersimpan dan aktivitas dicatat.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan data.");}
  finally{setBusy(false);}
 };
 const verifyGuardian=async()=>{
  if(!guardianVerificationRow?.id)return;
  if(preview){setNotice("Pratinjau verifikasi saja. Tidak ada kewenangan wali yang diubah.");setGuardianVerificationRow(null);return;}
  if(guardianEvidence.trim().length<12){setError("Catatan bukti verifikasi minimal 12 karakter.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   await request(`student-guardians/${encodeURIComponent(String(guardianVerificationRow.id))}/verify`,{
    method:"POST",body:JSON.stringify({isLegalGuardian:guardianLegal,canPickupStudent:guardianPickup,verificationNote:guardianEvidence.trim()})
   });
   setGuardianVerificationRow(null);setGuardianEvidence("");
   setNotice("Kewenangan wali berhasil diverifikasi dan dicatat dalam audit.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Gagal memverifikasi kewenangan wali.");}
  finally{setBusy(false);}
 };
 const visibleRows=rows.slice(0,100);
 const fieldColumn=(key:string)=>key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);
 const detailValue=(field:Field,row:Row)=>{
  const value=row[field.key]??row[fieldColumn(field.key)];
  if(value===undefined||value===null||value==="")return "—";
  if(resource?.key==="student-identity-documents"&&field.key==="documentNumber"&&typeof value==="string")return value.length>4?`••••••••${value.slice(-4)}`:"••••";
  if(isSensitiveStudentHealthField(resource?.key??"",field.key)&&!showSensitiveDetail)return "•••••••• (terbatas)";
  if(field.type==="relation"&&typeof value==="string"){
   const option=(lookups[field.source??""]??[]).find(item=>item.id===value);
   if(option)return option.label;
  }
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
 };
 const displayCell=(column:string,value:unknown)=>{
  if(resource?.key==="student-identity-documents"&&column==="document_number"&&typeof value==="string")return value.length>4?`••••••••${value.slice(-4)}`:"••••";
  if(isSensitiveStudentHealthField(resource?.key??"",column))return "•••••••• (terbatas)";
  const field=resource?.fields.find(item=>item.type==="relation"&&item.key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`)===column);
  if(field&&typeof value==="string"){
   const option=(lookups[field.source??""]??[]).find(item=>item.id===value);
   if(option)return option.label;
  }
  return toLabel(value);
 };
 if(!resource)return <div className="table-card"><h2>{requestedLabel}</h2><p className="muted">Pilih salah satu menu modul untuk melanjutkan.</p></div>;
 if(!preview&&!permissions.includes(resource.read))return <div className="table-card"><h2>{resource.label}</h2><p className="muted">Menu ini tersedia, tetapi akun Anda belum memiliki izin baca <strong>{resource.read}</strong>. Hubungi administrator institusi untuk meminta akses. Data tetap dilindungi oleh pemeriksaan izin di server.</p></div>;
 return <section className="operations-panel">
  <div className="operations-heading"><div><div className="eyebrow">{preview?"PRATINJAU • DATA SINTETIS":"MODUL INSTITUSI"} / {resource.group.toUpperCase()}</div><h2>{resource.label}</h2><p>{guidance?.purpose??"Kelola data sesuai konteks modul dan hak akses organisasi."}</p></div><button className="outline-button" disabled={busy} onClick={()=>void load()}>{busy?"Memuat…":"↻ Muat ulang"}</button></div>
  <div className="module-page-layout">
   <aside className="module-page-nav" aria-label="Navigasi halaman modul">
    <div className="module-page-nav-title">DAFTAR HALAMAN</div>
    {(group==="Semua Modul"?groups.filter(g=>g!=="Semua Modul"):[group]).map(g=><div className="module-page-nav-group" key={g}>
     <div className="module-page-nav-group-title">{g}</div>
     {available.filter(r=>r.group===g).map(r=><button type="button" key={r.key} className={resourceKey===r.key?"module-page-nav-link active":"module-page-nav-link"} onClick={()=>{setGroup(g);setResourceKey(r.key);setShowForm(false);setEditingRow(null);internalSelection.current=initialResourceKey!==r.key;onResourceChange?.(r.key);}}>{r.label}</button>)}
    </div>)}
   </aside>
   <div className="module-page-content">
    <div className="module-page-toolbar"><div><span className="module-page-kicker">HALAMAN KERJA</span><strong>{resource.label}</strong><small>{resource.group} · {resource.fields.length} elemen data</small></div>{canWrite&&<button className="primary" onClick={()=>{if(showForm){setShowForm(false);setEditingRow(null);setForm({});}else{setEditingRow(null);setForm({});setShowForm(true);}}}>{showForm?"Tutup formulir":"+ Tambah data"}</button>}</div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {resource.key==="student-guardians"&&guardianVerificationRow&&canVerifyGuardian&&<form className="student-form operations-form" onSubmit={event=>{event.preventDefault();void verifyGuardian();}}>
   <div className="form-context"><strong>Verifikasi kewenangan wali</strong><p>Relasi santri–wali: {String(guardianVerificationRow.relationship_code??"")}. Periksa dokumen sumber dan dasar kewenangan sebelum menyimpan keputusan.</p></div>
   <div className="form-grid"><label><input type="checkbox" checked={guardianLegal} onChange={e=>setGuardianLegal(e.target.checked)}/> Wali sah telah diverifikasi</label><label><input type="checkbox" checked={guardianPickup} onChange={e=>setGuardianPickup(e.target.checked)}/> Memiliki izin penjemputan</label><label className="full-width">Catatan bukti verifikasi (minimal 12 karakter)<textarea value={guardianEvidence} onChange={e=>setGuardianEvidence(e.target.value)} maxLength={500} rows={3} placeholder="Contoh: Dokumen KK dan surat kuasa diperiksa petugas..." /></label></div>
   <div className="form-actions"><button type="button" className="outline-button" onClick={()=>setGuardianVerificationRow(null)}>Batal</button><button className="primary" disabled={busy||guardianEvidence.trim().length<12}>{busy?"Memverifikasi…":"Simpan verifikasi"}</button></div>
  </form>}
  {showForm&&resource&&canWrite&&<form className="student-form operations-form" onSubmit={submit}>
   <div className="form-context"><strong>{editingRow?"Koreksi: ":""}{resource.label}</strong><p>{guidance?.purpose??(editingRow?"Perubahan dibatasi pada kolom yang diizinkan dan dicatat dalam audit trail.":"Isi sesuai dokumen sumber dan kebijakan pesantren.")}</p>{guidance&&<><p><strong>Alur data:</strong> {guidance.lifecycle}</p><p><strong>Klasifikasi:</strong> {guidance.classification.toUpperCase()} · <strong>Acuan:</strong> {guidance.regulatoryRefs.join(", ")}</p><ul className="field-hint">{guidance.formNotes.map(note=><li key={note}>{note}</li>)}</ul>{guidance.operationalGaps.length>0&&<p className="field-hint"><strong>Pengembangan lanjutan:</strong> {guidance.operationalGaps.join("; ")}.</p>}</>}</div>
   {getFieldSections(resource).map(section=><section className="form-section-card" key={section.title}><div className="form-section-heading"><strong>{section.title}</strong><span>{section.fields.length} field</span></div>{section.note&&<p className="field-hint">{section.note}</p>}{section.applicability&&<p className="field-hint"><strong>Penerapan:</strong> {section.applicability}</p>}{section.regulatoryBasis&&<p className="field-hint"><strong>Rujukan:</strong> {section.regulatoryBasis.map((basis,index)=><a key={basis.url} href={basis.url} target="_blank" rel="noreferrer">{basis.label}{index<section.regulatoryBasis!.length-1?", ":""}</a>)}</p>}<div className="form-grid">{section.fields.map(field=><label className={field.type==="address"||field.type==="textarea"||field.type==="json"?"form-field form-field-wide":"form-field"} key={field.key}>{field.label}{field.required?" *":""}
    {field.type==="relation"?<><select required={field.required} disabled={lookupLoading.includes(field.source??"")||Boolean(lookupErrors[field.source??""])||(lookups[field.source??""]??[]).length===0} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}><option value="">{lookupLoading.includes(field.source??"")?"Memuat pilihan…":lookupErrors[field.source??""]?"Pilihan gagal dimuat":(lookups[field.source??""]??[]).length===0?"Belum ada data referensi":`Pilih ${field.label.toLowerCase()}`}</option>{(lookups[field.source??""]??[]).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>{lookupErrors[field.source??""]&&<small className="field-hint">Daftar referensi tidak dapat dimuat: {lookupErrors[field.source??""]}. Periksa izin baca dan koneksi modul sumber.</small>}{!lookupLoading.includes(field.source??"")&&!lookupErrors[field.source??""]&&(lookups[field.source??""]??[]).length===0&&<small className="field-hint">Buat data pada modul sumber terlebih dahulu sebelum memilih relasi ini.</small>}</>
    :field.type==="select"?<select required={field.required} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}><option value="">Pilih</option>{(field.options??[]).map(o=><option key={o} value={o}>{o.replaceAll("_"," ")}</option>)}</select>
    :field.type==="checkbox"?<input type="checkbox" checked={Boolean(form[field.key])} onChange={e=>setForm(p=>({...p,[field.key]:e.target.checked}))}/>
    :field.type==="address"?<div className="form-grid address-form-grid">{ADDRESS_FIELDS.map(([addressKey,addressLabel])=><span className="address-subfield" key={addressKey}><small>{addressLabel}</small><input value={parseAddress(form[field.key])[addressKey]??""} onChange={e=>setForm(p=>({...p,[field.key]:JSON.stringify({...parseAddress(p[field.key]),[addressKey]:e.target.value})}))} maxLength={addressKey==="street"?240:addressKey==="countryCode"?2:80}/></span>)}</div>
    :field.type==="textarea"||field.type==="json"?<textarea value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))} required={field.required} maxLength={field.max} rows={field.type==="json"?3:4}/>
    :<input type={field.type==="array"?"text":field.type??"text"} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))} required={field.required} maxLength={field.max} step={field.step} min={field.type==="number"?"0":undefined}/>}
    {field.hint&&<small className="field-hint">{field.hint}</small>}
   </label>)}</div></section>)}
   <div className="form-actions"><button type="button" className="outline-button" onClick={()=>{setShowForm(false);setEditingRow(null);setForm({});}}>Batal</button><button className="primary" disabled={busy}>{busy?"Menyimpan…":editingRow?"Simpan perubahan":"Simpan data"}</button></div>
  </form>}
  {detailRow&&resource&&<section className="record-detail-card" aria-label="Detail record">
   <div className="record-detail-heading"><div><span className="module-page-kicker">DETAIL RECORD</span><h3>{resource.label}</h3><small>ID: {String(detailRow.id??"—")}</small></div><button type="button" className="outline-button" onClick={()=>{setDetailRow(null);setShowSensitiveDetail(false);}}>Tutup detail</button></div>
   {resource.key==="student-health-profiles"&&<div className="alert warning">Informasi kesehatan termasuk data pribadi spesifik. Konten disamarkan secara default dan hanya ditampilkan atas tindakan eksplisit petugas berizin.</div>}
   {resource.key==="student-identity-documents"&&<div className="alert warning">Nomor dokumen identitas selalu dimasking pada tampilan detail. Verifikasi dokumen dilakukan melalui prosedur khusus.</div>}
   {resource.key==="student-health-profiles"&&<button type="button" className="outline-button" onClick={()=>setShowSensitiveDetail(value=>!value)}>{showSensitiveDetail?"Samarkan informasi kesehatan":"Tampilkan informasi kesehatan terbatas"}</button>}
   <dl className="record-detail-grid">{resource.fields.map(field=><div className="record-detail-field" key={field.key}><dt>{field.label}</dt><dd>{detailValue(field,detailRow)}</dd></div>)}
    {["created_at","updated_at","verified_at"].filter(key=>detailRow[key]!==undefined&&detailRow[key]!==null).map(key=><div className="record-detail-field" key={key}><dt>{toLabel(key)}</dt><dd>{String(detailRow[key])}</dd></div>)}
   </dl>
   <p className="operations-footnote">Detail mengikuti izin baca resource ini. Akses data identitas dan kesehatan tetap dibatasi oleh API dan dicatat pada audit akses khusus.</p>
  </section>}
  {resource&&<article className="table-card operation-table"><div className="table-toolbar"><div><h3>{resource.label}</h3><p>{rows.length} record ditemukan · maksimal 100 ditampilkan</p></div><div className="toolbar-actions"><button type="button" className="outline-button" disabled={busy||preview||rows.length===0||resource.key==="student-identity-documents"||resource.key==="student-health-profiles"} onClick={()=>exportRowsCsv(resource,visibleRows)}>Ekspor CSV</button><button type="button" className="outline-button" disabled={busy||preview||rows.length===0} onClick={()=>window.print()}>Cetak</button></div></div><div className="table-wrap"><table><thead><tr>{resource.columns.map(([,label])=><th key={label}>{label}</th>)}{true&&<th>Aksi</th>}</tr></thead><tbody>{visibleRows.map((row,index)=><tr key={String(row.id??index)}>{resource.columns.map(([key])=><td key={key}>{displayCell(key,row[key])}</td>)}{true&&<td>{resource.key==="library-loans"&&canWrite?<>{row.loan_status==="open"&&<button type="button" className="outline-button" disabled={!row.id||busy} onClick={()=>{void (async()=>{setBusy(true);setError("");setNotice("");try{await request(`library-loans/${encodeURIComponent(String(row.id))}/return`,{method:"POST"});setNotice("Buku berhasil dikembalikan dan stok diperbarui.");await load();}catch(e){setError(e instanceof Error?e.message:"Gagal memproses pengembalian.");}finally{setBusy(false);}})();}}>Kembalikan</button>}{row.loan_status!=="open"&&<span>{toLabel(row.loan_status)}</span>}</>:<><button type="button" className="outline-button" disabled={!row.id||busy} onClick={()=>{setDetailRow(row);setShowSensitiveDetail(false);}}>Detail</button>{canWrite&&<button type="button" className="outline-button" disabled={!row.id||busy} onClick={()=>beginEdit(row)}>Koreksi</button>}{resource.key==="student-guardians"&&canVerifyGuardian&&<button type="button" className="outline-button" disabled={!row.id||busy} onClick={()=>{setGuardianVerificationRow(row);setGuardianLegal(Boolean(row.is_legal_guardian));setGuardianPickup(Boolean(row.can_pickup_student));setGuardianEvidence("");setError("");setNotice("");}}>Verifikasi kewenangan</button>}</>}</td>}</tr>)}{visibleRows.length===0&&<tr><td colSpan={resource.columns.length+(true?1:0)} className="empty-state">{busy?"Memuat…":"Belum ada data. Gunakan formulir untuk menambahkan record pertama."}</td></tr>}</tbody></table></div></article>}
  {preview&&<div className="alert warning">MODE PRATINJAU — semua record dan relasi yang terlihat adalah data sintetis. Formulir hanya untuk memeriksa struktur; tidak ada penyimpanan ke database.</div>}
  <p className="operations-footnote">PONDOK OS tidak menggantikan EMIS/SIMTREN atau sistem resmi Kementerian Agama. Nomor izin, NSP, status legal, dan dokumen persetujuan harus diverifikasi melalui kanal instansi berwenang.</p>
   </div>
  </div>
 </section>;
}
export default ModuleWorkspace;

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Props = { organizationId: string; permissions: string[] };
type Field = {
  key: string; label: string; type?: "text" | "date" | "datetime-local" | "number" | "textarea" | "select" | "checkbox" | "relation" | "array" | "json";
  required?: boolean; options?: string[]; source?: string; valueKey?: string; labelKey?: string; hint?: string; max?: number; step?: string;
};
type Resource = {
  key: string; label: string; group: string; endpoint: string; read: string; write: string;
  fields: Field[]; columns: Array<[string,string]>;
};
type Row = Record<string, unknown>;
type Lookup = { id: string; label: string };
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const F = (key:string,label:string,type:Field["type"]="text",required=false,extra:Partial<Field>={}):Field=>({key,label,type,required,...extra});
const REL = (key:string,label:string,source:string,labelKey:string,required=true):Field=>F(key,label,"relation",required,{source,labelKey});
const RESOURCES: Resource[] = [
 {key:"campuses",label:"Kampus / Satuan Lokasi",group:"Tata Kelola",endpoint:"campuses",read:"core.campus.manage",write:"core.campus.manage",fields:[F("code","Kode kampus","text",true),F("name","Nama kampus","text",true),F("campusType","Jenis kampus","select",true,{options:["main","branch","unit"]}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Nama kampus"],["campus_type","Jenis"],["status","Status"]]},
 {key:"academic-years",label:"Tahun Ajaran",group:"Akademik",endpoint:"academic-years",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode tahun ajaran","text",true),F("name","Nama tahun ajaran","text",true),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal selesai","date",true),F("status","Status","select",false,{options:["planned","active","closed"]})],columns:[["code","Kode"],["name","Tahun ajaran"],["starts_on","Mulai"],["ends_on","Selesai"],["status","Status"]]},
 {key:"academic-terms",label:"Semester / Term",group:"Akademik",endpoint:"academic-terms",read:"academic.classes.read",write:"academic.classes.write",fields:[REL("academicYearId","Tahun ajaran","academic-years","name"),F("code","Kode semester","text",true),F("name","Nama semester","text",true),F("startsOn","Tanggal mulai","date",true),F("endsOn","Tanggal selesai","date",true),F("status","Status","select",false,{options:["planned","active","closed"]})],columns:[["name","Semester"],["code","Kode"],["starts_on","Mulai"],["ends_on","Selesai"],["status","Status"]]},
 {key:"programs",label:"Program Pendidikan",group:"Akademik",endpoint:"programs",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode program","text",true),F("name","Nama program","text",true),F("description","Deskripsi","textarea"),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Program"],["description","Deskripsi"],["status","Status"]]},
 {key:"subjects",label:"Mata Pelajaran / Kajian",group:"Akademik",endpoint:"subjects",read:"academic.classes.read",write:"academic.classes.write",fields:[F("code","Kode","text",true),F("name","Nama mata pelajaran / kitab","text",true),F("subjectType","Kategori","select",true,{options:["general","religious","kitab","tahfidz","language","other"]}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Nama"],["subject_type","Kategori"],["status","Status"]]},
 {key:"classes",label:"Rombongan Belajar / Halaqah",group:"Akademik",endpoint:"classes",read:"academic.classes.read",write:"academic.classes.write",fields:[REL("campusId","Kampus","campuses","name"),REL("academicYearId","Tahun ajaran","academic-years","name"),REL("programId","Program","programs","name"),F("code","Kode kelas / halaqah","text",true),F("name","Nama kelas","text",true),F("capacity","Kapasitas santri","number",false,{step:"1"}),F("status","Status","select",false,{options:["active","inactive"]})],columns:[["code","Kode"],["name","Kelas"],["capacity","Kapasitas"],["status","Status"]]},
 {key:"enrollments",label:"Penempatan Kelas",group:"Akademik",endpoint:"enrollments",read:"academic.enrollments.read",write:"academic.enrollments.write",fields:[REL("studentId","Santri","students","legalName"),REL("academicYearId","Tahun ajaran","academic-years","name"),REL("classGroupId","Kelas","classes","name",false),F("enrolledOn","Tanggal penempatan","date"),F("endedOn","Tanggal akhir","date"),F("status","Status","select",false,{options:["enrolled","completed","transferred","withdrawn"]})],columns:[["student_id","Santri ID"],["academic_year_id","Tahun ajaran ID"],["class_group_id","Kelas ID"],["enrolled_on","Tanggal"],["status","Status"]]},
 {key:"attendance-sessions",label:"Sesi Presensi",group:"Akademik",endpoint:"attendance-sessions",read:"academic.attendance.read",write:"academic.attendance.write",fields:[REL("classGroupId","Kelas / halaqah","classes","name"),F("sessionDate","Tanggal","date",true),F("sessionLabel","Kegiatan / sesi","text",false),F("status","Status sesi","select",false,{options:["open","closed"]})],columns:[["class_group_id","Kelas ID"],["session_date","Tanggal"],["session_label","Sesi"],["status","Status"]]},
 {key:"attendance-records",label:"Rekap Presensi Santri",group:"Akademik",endpoint:"attendance-records",read:"academic.attendance.read",write:"academic.attendance.write",fields:[REL("attendanceSessionId","Sesi presensi","attendance-sessions","session_date"),REL("studentId","Santri","students","legalName"),F("attendanceStatus","Kehadiran","select",true,{options:["present","absent","sick","permitted","late"]}),F("note","Catatan","text")],columns:[["attendance_session_id","Sesi ID"],["student_id","Santri ID"],["attendance_status","Kehadiran"],["note","Catatan"]]},
 {key:"dormitories",label:"Asrama",group:"Kesantrian",endpoint:"dormitories",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("campusId","Kampus","campuses","name",false),F("dormitoryCode","Kode asrama","text",true),F("dormitoryName","Nama asrama","text",true),F("genderPolicy","Kebijakan penghuni","select",true,{options:["male","female","mixed"]}),F("isActive","Aktif","checkbox")],columns:[["dormitory_code","Kode"],["dormitory_name","Asrama"],["gender_policy","Kebijakan"],["is_active","Aktif"]]},
 {key:"boarding-rooms",label:"Kamar Asrama",group:"Kesantrian",endpoint:"boarding-rooms",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("dormitoryId","Asrama","dormitories","dormitory_name"),F("roomCode","Kode kamar","text",true),F("floorLabel","Lantai / blok","text"),F("capacity","Kapasitas","number",true,{step:"1"}),F("isActive","Aktif","checkbox")],columns:[["dormitory_id","Asrama ID"],["room_code","Kamar"],["floor_label","Lantai"],["capacity","Kapasitas"],["is_active","Aktif"]]},
 {key:"boarding-beds",label:"Tempat Tidur",group:"Kesantrian",endpoint:"boarding-beds",read:"boarding.rooms.manage",write:"boarding.rooms.manage",fields:[REL("roomId","Kamar","boarding-rooms","room_code"),F("bedCode","Kode tempat tidur","text",true),F("bedStatus","Status","select",false,{options:["available","occupied","maintenance","inactive"]})],columns:[["room_id","Kamar ID"],["bed_code","Kode"],["bed_status","Status"]]},
 {key:"boarding-assignments",label:"Penempatan Santri",group:"Kesantrian",endpoint:"boarding-assignments",read:"boarding.assignments.manage",write:"boarding.assignments.manage",fields:[REL("bedId","Tempat tidur","boarding-beds","bed_code"),REL("studentId","Santri","students","legalName"),F("assignedFrom","Mulai menempati","date",true),F("assignedUntil","Selesai menempati","date")],columns:[["bed_id","Tempat tidur ID"],["student_id","Santri ID"],["assigned_from","Mulai"],["assigned_until","Selesai"]]},
 {key:"leave-requests",label:"Perizinan Keluar",group:"Kesantrian",endpoint:"leave-requests",read:"boarding.leave.read",write:"boarding.leave.decide",fields:[REL("studentId","Santri","students","legalName"),F("requestedFrom","Waktu keluar","datetime-local",true),F("requestedUntil","Rencana kembali","datetime-local",true),F("destination","Tujuan","text"),F("reason","Alasan","textarea",true,{max:1000})],columns:[["student_id","Santri ID"],["requested_from","Keluar"],["requested_until","Kembali"],["destination","Tujuan"],["decision_status","Keputusan"]]},
 {key:"incidents",label:"Pembinaan & Insiden",group:"Kesantrian",endpoint:"incidents",read:"boarding.incidents.read",write:"boarding.incidents.write",fields:[REL("studentId","Santri","students","legalName"),F("incidentType","Kategori kejadian","select",true,{options:["guidance","discipline","safety","health_referral","other"]}),F("severity","Tingkat","select",true,{options:["low","medium","high","critical"]}),F("description","Uraian faktual","textarea",true,{max:2000,hint:"Tuliskan fakta seperlunya. Jangan masukkan diagnosis, detail kesehatan, atau data sensitif yang tidak diperlukan."}),F("occurredAt","Waktu kejadian","datetime-local",true)],columns:[["student_id","Santri ID"],["incident_type","Kategori"],["severity","Tingkat"],["follow_up_status","Tindak lanjut"],["occurred_at","Waktu"]]},
 {key:"library-catalog",label:"Katalog Buku / Kitab",group:"Perpustakaan",endpoint:"library-catalog",read:"library.catalog.read",write:"library.catalog.write",fields:[F("isbn","ISBN","text"),F("itemCode","Kode katalog","text",true),F("title","Judul buku / kitab","text",true),F("subtitle","Subjudul","text"),F("authors","Penulis (pisahkan koma)","array"),F("publisher","Penerbit","text"),F("publicationYear","Tahun terbit","number",false,{step:"1"}),F("category","Kategori","text"),F("languageCode","Kode bahasa","text"),F("isReferenceOnly","Hanya baca di tempat","checkbox"),F("isActive","Aktif","checkbox")],columns:[["item_code","Kode"],["title","Judul"],["authors","Penulis"],["publisher","Penerbit"],["publication_year","Tahun"],["category","Kategori"]]},
 {key:"library-copies",label:"Eksemplar & Barcode",group:"Perpustakaan",endpoint:"library-copies",read:"library.catalog.read",write:"library.catalog.write",fields:[REL("catalogItemId","Judul katalog","library-catalog","title"),REL("campusId","Kampus","campuses","name",false),F("barcode","Barcode","text",true),F("shelfLocation","Lokasi rak","text"),F("copyStatus","Status","select",false,{options:["available","loaned","lost","damaged","maintenance"]}),F("acquiredOn","Tanggal perolehan","date")],columns:[["catalog_item_id","Katalog ID"],["barcode","Barcode"],["shelf_location","Rak"],["copy_status","Status"]]},
 {key:"library-loans",label:"Peminjaman",group:"Perpustakaan",endpoint:"library-loans",read:"library.loans.read",write:"library.loans.write",fields:[REL("copyId","Eksemplar","library-copies","barcode"),F("borrowerType","Jenis peminjam","select",true,{options:["student","employee","external"]}),F("borrowerId","ID peminjam terdaftar","text",true,{hint:"Masukkan ID record peminjam yang dipilih dari data induk; akses dibatasi petugas perpustakaan."}),F("dueAt","Batas pengembalian","datetime-local",true)],columns:[["copy_id","Eksemplar ID"],["borrower_type","Jenis"],["borrower_id","Peminjam ID"],["due_at","Jatuh tempo"],["loan_status","Status"]]},
 {key:"cms-pages",label:"Halaman Website",group:"Website & Publikasi",endpoint:"cms-pages",read:"cms.pages.manage",write:"cms.pages.manage",fields:[F("slug","Slug URL","text",true),F("title","Judul halaman","text",true),F("excerpt","Ringkasan","textarea"),F("bodyMarkdown","Konten (Markdown)","textarea",true,{max:30000}),F("pageStatus","Status","select",false,{options:["draft","published","archived"]}),F("seoTitle","Judul SEO","text"),F("seoDescription","Deskripsi SEO","textarea")],columns:[["slug","Slug"],["title","Judul"],["page_status","Status"],["published_at","Terbit"]]},
 {key:"announcements",label:"Pengumuman",group:"Website & Publikasi",endpoint:"announcements",read:"cms.announcements.manage",write:"cms.announcements.manage",fields:[F("title","Judul pengumuman","text",true),F("summary","Ringkasan","textarea"),F("bodyMarkdown","Isi pengumuman","textarea",true,{max:12000}),F("audience","Audiens","select",true,{options:["public","staff","students","guardians"]}),F("announcementStatus","Status","select",false,{options:["draft","published","archived"]}),F("publishAt","Jadwal terbit","datetime-local"),F("expireAt","Kedaluwarsa","datetime-local")],columns:[["title","Judul"],["audience","Audiens"],["announcement_status","Status"],["publish_at","Terbit"],["expire_at","Berakhir"]]},
 {key:"contacts",label:"Kontak Wali / Alumni / Donatur",group:"CRM & Relasi",endpoint:"contacts",read:"crm.contacts.read",write:"crm.contacts.write",fields:[F("contactType","Jenis kontak","select",true,{options:["guardian","alumni","donor","partner","vendor","other"]}),F("displayName","Nama kontak","text",true),F("email","Email","text"),F("phone","Telepon","text"),F("organizationName","Organisasi","text"),F("consentStatus","Persetujuan komunikasi","select",true,{options:["unknown","granted","withdrawn"] ,hint:"Gunakan granted hanya jika persetujuan telah diperoleh dan dapat dibuktikan."})],columns:[["contact_type","Jenis"],["display_name","Nama"],["email","Email"],["phone","Telepon"],["consent_status","Persetujuan"]]},
 {key:"interactions",label:"Riwayat Komunikasi",group:"CRM & Relasi",endpoint:"interactions",read:"crm.contacts.read",write:"crm.contacts.write",fields:[REL("contactId","Kontak","contacts","display_name"),F("channel","Kanal","select",true,{options:["phone","email","whatsapp","meeting","letter","other"]}),F("subject","Subjek","text",true),F("notes","Catatan tindak lanjut","textarea"),F("interactionAt","Waktu komunikasi","datetime-local")],columns:[["contact_id","Kontak ID"],["channel","Kanal"],["subject","Subjek"],["interaction_at","Waktu"]]},
 {key:"donor-pledges",label:"Komitmen Donasi",group:"CRM & Relasi",endpoint:"donor-pledges",read:"crm.donations.manage",write:"crm.donations.manage",fields:[REL("contactId","Donatur","contacts","display_name"),F("pledgeReference","Nomor referensi","text",true),F("pledgedAmount","Nilai komitmen (IDR)","number",true,{step:"0.01"}),F("currencyCode","Mata uang","text",false),F("pledgedOn","Tanggal komitmen","date"),F("expectedOn","Perkiraan realisasi","date"),F("pledgeStatus","Status","select",false,{options:["pledged","partially_received","received","cancelled"]}),F("notes","Catatan","textarea")],columns:[["pledge_reference","Referensi"],["contact_id","Donatur ID"],["pledged_amount","Nilai"],["pledged_on","Tanggal"],["pledge_status","Status"]]},
 {key:"assets",label:"Register Aset Tetap",group:"Aset & Pengadaan",endpoint:"assets",read:"assets.register.read",write:"assets.register.write",fields:[REL("campusId","Kampus","campuses","name",false),F("assetCode","Kode aset","text",true),F("assetName","Nama aset","text",true),F("category","Kategori","text",true),F("acquisitionDate","Tanggal perolehan","date"),F("acquisitionCost","Nilai perolehan (IDR)","number",false,{step:"0.01"}),F("usefulLifeMonths","Masa manfaat (bulan)","number",false,{step:"1"}),F("assetStatus","Status","select",false,{options:["active","maintenance","disposed","lost"]}),F("locationLabel","Lokasi","text")],columns:[["asset_code","Kode"],["asset_name","Aset"],["category","Kategori"],["acquisition_date","Tanggal"],["acquisition_cost","Nilai"],["asset_status","Status"]]},
 {key:"suppliers",label:"Pemasok / Vendor",group:"Aset & Pengadaan",endpoint:"suppliers",read:"procurement.suppliers.manage",write:"procurement.suppliers.manage",fields:[F("supplierCode","Kode pemasok","text",true),F("supplierName","Nama pemasok","text",true),F("taxNumber","NPWP (opsional)","text"),F("email","Email","text"),F("phone","Telepon","text"),F("address","Alamat (JSON)","json",false,{hint:"Contoh: { city: \"Bandung\" } dalam format JSON valid."})],columns:[["supplier_code","Kode"],["supplier_name","Pemasok"],["tax_number","NPWP"],["email","Email"],["phone","Telepon"]]},
 {key:"purchase-requests",label:"Permintaan Pengadaan",group:"Aset & Pengadaan",endpoint:"purchase-requests",read:"procurement.requests.read",write:"procurement.requests.write",fields:[REL("campusId","Kampus","campuses","name",false),F("requestNumber","Nomor permintaan","text",true),F("requestDate","Tanggal permintaan","date"),F("requiredBy","Dibutuhkan tanggal","date"),F("purpose","Tujuan dan justifikasi kebutuhan","textarea",true,{max:1000})],columns:[["request_number","Nomor"],["request_date","Tanggal"],["required_by","Dibutuhkan"],["purpose","Tujuan"],["request_status","Status"]]},
 {key:"purchase-orders",label:"Pesanan Pembelian",group:"Aset & Pengadaan",endpoint:"purchase-orders",read:"procurement.orders.manage",write:"procurement.orders.manage",fields:[REL("supplierId","Pemasok","suppliers","supplier_name"),REL("requestId","Permintaan terkait","purchase-requests","request_number",false),F("orderNumber","Nomor pesanan","text",true),F("orderedOn","Tanggal pesanan","date"),F("expectedOn","Estimasi penerimaan","date"),F("totalAmount","Nilai total (IDR)","number",false,{step:"0.01"})],columns:[["order_number","Nomor"],["supplier_id","Pemasok ID"],["ordered_on","Tanggal"],["expected_on","Estimasi"],["total_amount","Total"],["order_status","Status"]]}
];

function toLabel(value: unknown): string {
 if (value===null||value===undefined||value==="") return "—";
 if (typeof value==="boolean") return value?"Ya":"Tidak";
 if (typeof value==="object") return JSON.stringify(value);
 return String(value);
}
function ModuleWorkspace({organizationId,permissions}:Props) {
 const available=useMemo(()=>RESOURCES.filter(r=>permissions.includes(r.read)),[permissions]);
 const groups=useMemo(()=>Array.from(new Set(available.map(r=>r.group))),[available]);
 const [group,setGroup]=useState(groups[0]??"");
 const [resourceKey,setResourceKey]=useState(available[0]?.key??"");
 const [rows,setRows]=useState<Row[]>([]);
 const [lookups,setLookups]=useState<Record<string,Lookup[]>>({});
 const [form,setForm]=useState<Record<string,string|boolean>>({});
 const [showForm,setShowForm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const resource=available.find(r=>r.key===resourceKey)??available[0];
 const canWrite=Boolean(resource&&permissions.includes(resource.write));
 const request=useCallback(async<T,>(endpoint:string,init:RequestInit={}):Promise<T>=>{
  const token=await getAccessToken();
  const response=await fetch(`${API_BASE}/v1/modules/${endpoint}`,{...init,headers:{authorization:`Bearer ${token}`,"x-organization-id":organizationId,...(init.body?{"content-type":"application/json"}:{}),...init.headers}});
  const body=await response.json().catch(()=>({})) as {data?:T;error?:string};
  if(!response.ok) throw new Error(body.error??`Permintaan gagal (${response.status})`);
  return body as T;
 },[organizationId]);
 const load=useCallback(async()=>{
  if(!resource)return;
  setBusy(true);setError("");
  try{const result=await request<{data:Row[]}>(resource.endpoint);setRows(result.data??[]);}
  catch(e){setError(e instanceof Error?e.message:"Gagal memuat data modul.");}
  finally{setBusy(false);}
 },[request,resource]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!resource)return;
  let active=true;
  const sources=Array.from(new Set(resource.fields.filter(f=>f.type==="relation"&&f.source).map(f=>f.source!)));
  void Promise.all(sources.map(async source=>{
   try{
    if(source==="students"){
     const token=await getAccessToken();const response=await fetch(`${API_BASE}/v1/academic/students?limit=100`,{headers:{authorization:`Bearer ${token}`,"x-organization-id":organizationId}});
     const body=await response.json() as {data?:Array<Record<string,unknown>>};
     return [source,(body.data??[]).map(s=>({id:String(s.id),label:String(s.legalName??s.studentNumber)}))] as const;
    }
    const result=await request<{data:Row[]}>(source);
    const labelKey=resource.fields.find(f=>f.source===source)?.labelKey??"name";
    return [source,(result.data??[]).map(row=>({id:String(row.id),label:String(row[labelKey]??row.name??row.code??row.id)}))] as const;
   }catch{return [source,[]] as const;}
  })).then(entries=>{if(active)setLookups(Object.fromEntries(entries));});
  return()=>{active=false;};
 },[organizationId,request,resource]);
 useEffect(()=>{setForm({});setShowForm(false);},[resourceKey]);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(!resource)return;
  setBusy(true);setError("");setNotice("");
  try{
   const payload:Record<string,unknown>={};
   for(const field of resource.fields){
    const value=form[field.key];
    if(value===undefined||value==="")continue;
    if(field.type==="number")payload[field.key]=Number(value);
    else if(field.type==="checkbox")payload[field.key]=Boolean(value);
    else if(field.type==="array")payload[field.key]=String(value).split(",").map(v=>v.trim()).filter(Boolean);
    else if(field.type==="json"){try{payload[field.key]=JSON.parse(String(value));}catch{throw new Error(`Format JSON pada ${field.label} tidak valid.`);}}
    else if(field.type==="datetime-local")payload[field.key]=new Date(String(value)).toISOString();
    else payload[field.key]=value;
   }
   await request(resource.endpoint,{method:"POST",body:JSON.stringify(payload)});
   setForm({});setShowForm(false);setNotice("Data tersimpan dan aktivitas dicatat.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan data.");}
  finally{setBusy(false);}
 };
 const visibleRows=rows.slice(0,100);
 if(available.length===0)return <div className="table-card"><h2>Modul belum dapat diakses</h2><p className="muted">Akun ini belum memiliki izin untuk membaca modul operasional. Hubungi administrator institusi.</p></div>;
 return <section className="operations-panel">
  <div className="operations-heading"><div><div className="eyebrow">MODUL INSTITUSI</div><h2>Ruang kerja modul</h2><p>Form kontekstual, validasi API, pembatasan akses, dan jejak aktivitas untuk data baru.</p></div><button className="outline-button" disabled={busy} onClick={()=>void load()}>{busy?"Memuat…":"↻ Muat ulang"}</button></div>
  <div className="module-group-tabs">{groups.map(g=><button key={g} className={group===g?"operation-tab active":"operation-tab"} onClick={()=>{setGroup(g);const next=available.find(r=>r.group===g);if(next)setResourceKey(next.key);}}>{g}</button>)}</div>
  <div className="operations-actions"><label>Menu kerja<select value={resourceKey} onChange={e=>setResourceKey(e.target.value)}>{available.filter(r=>r.group===group).map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>{canWrite&&<button className="primary" onClick={()=>setShowForm(v=>!v)}>{showForm?"Tutup formulir":"+ Tambah data"}</button>}</div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {showForm&&resource&&canWrite&&<form className="student-form operations-form" onSubmit={submit}>
   <div className="form-context"><strong>{resource.label}</strong><p>Isi sesuai dokumen sumber dan kebijakan pesantren. Kolom yang wajib ditandai dengan *. Data sensitif dibatasi sesuai hak akses.</p></div>
   <div className="form-grid">{resource.fields.map(field=><label key={field.key}>{field.label}{field.required?" *":""}
    {field.type==="relation"?<select required={field.required} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}><option value="">Pilih {field.label.toLowerCase()}</option>{(lookups[field.source??""]??[]).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>
    :field.type==="select"?<select required={field.required} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}><option value="">Pilih</option>{(field.options??[]).map(o=><option key={o} value={o}>{o.replaceAll("_"," ")}</option>)}</select>
    :field.type==="checkbox"?<input type="checkbox" checked={Boolean(form[field.key])} onChange={e=>setForm(p=>({...p,[field.key]:e.target.checked}))}/>
    :field.type==="textarea"||field.type==="json"?<textarea value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))} required={field.required} maxLength={field.max} rows={field.type==="json"?3:4}/>
    :<input type={field.type==="array"?"text":field.type??"text"} value={String(form[field.key]??"")} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))} required={field.required} maxLength={field.max} step={field.step} min={field.type==="number"?"0":undefined}/>}
    {field.hint&&<small className="field-hint">{field.hint}</small>}
   </label>)}</div>
   <div className="form-actions"><button type="button" className="outline-button" onClick={()=>setShowForm(false)}>Batal</button><button className="primary" disabled={busy}>{busy?"Menyimpan…":"Simpan data"}</button></div>
  </form>}
  {resource&&<article className="table-card operation-table"><div className="table-toolbar"><div><h3>{resource.label}</h3><p>{rows.length} record ditemukan · maksimal 100 ditampilkan</p></div></div><div className="table-wrap"><table><thead><tr>{resource.columns.map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{visibleRows.map((row,index)=><tr key={String(row.id??index)}>{resource.columns.map(([key])=><td key={key}>{toLabel(row[key])}</td>)}</tr>)}{visibleRows.length===0&&<tr><td colSpan={resource.columns.length} className="empty-state">{busy?"Memuat…":"Belum ada data. Gunakan formulir untuk menambahkan record pertama."}</td></tr>}</tbody></table></div></article>}
  <p className="operations-footnote">PONDOK OS tidak menggantikan EMIS/SIMTREN atau sistem resmi Kementerian Agama. Nomor izin, NSP, status legal, dan dokumen persetujuan harus diverifikasi melalui kanal instansi berwenang.</p>
 </section>;
}
export default ModuleWorkspace;

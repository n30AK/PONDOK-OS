import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createAuthClient } from "@neondatabase/auth";

type User = { id: string; email?: string; name?: string };
type Tenant = { organizationId: string; name: string; slug: string; organizationType: string; status: string; createdAt: string; memberCount: number; planCode?: string | null; licenseStatus?: string | null; licenseEndsAt?: string | null };
type Activation = { id: string; contactEmail: string; contactName: string; organizationName: string; organizationSlug: string; organizationType: string; campusCode: string; campusName: string; status: string; createdAt: string; reviewNote?: string | null };
type ModuleRequest = { id: string; organizationId: string; organizationName?: string; moduleId: string; moduleVersion: string; status: string; createdAt: string; updatedAt: string };
type Publisher = { userId: string; status?: string; createdAt?: string; revokedAt?: string | null };
type AuditEvent = { id: string; actorUserId: string; action: string; resourceType: string; resourceId?: string | null; metadata: Record<string, unknown>; occurredAt: string };
type Section = "overview" | "institutions" | "activation" | "modules" | "publishers" | "security" | "regulations" | "crm" | "catalog" | "contracts" | "billing" | "accounting" | "support" | "fleet" | "backup" | "warranty" | "reports" | "agents" | "procurement" | "inventory" | "hrd" | "internal" | "documents";
type RegulationCategory = "pesantren" | "pendidikan" | "perlindungan" | "kesehatan" | "usaha" | "tata_kelola";
type Regulation = { id: string; title: string; number: string; authority: string; category: RegulationCategory; summary: string; status: string; url: string; modules: string };
const regulationCategories: { id: RegulationCategory | "all"; name: string }[] = [
  { id: "all", name: "Semua bidang" }, { id: "pesantren", name: "Pesantren & Kemenag" }, { id: "pendidikan", name: "Pendidikan Diknas" },
  { id: "perlindungan", name: "Perlindungan & data" }, { id: "kesehatan", name: "Kesehatan & asrama" },
  { id: "usaha", name: "Usaha & koperasi" }, { id: "tata_kelola", name: "Tata kelola" },
];
const regulations: Regulation[] = [
  { id: "uu-18-2019", title: "Pesantren", number: "UU Nomor 18 Tahun 2019", authority: "Pemerintah Pusat", category: "pesantren", summary: "Landasan penyelenggaraan fungsi pendidikan, dakwah, dan pemberdayaan masyarakat pesantren.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019", modules: "Profil lembaga, pendidikan pesantren, SDM, kegiatan, pemberdayaan" },
  { id: "perpres-82-2021", title: "Pendanaan Penyelenggaraan Pesantren", number: "Perpres Nomor 82 Tahun 2021", authority: "Presiden RI", category: "pesantren", summary: "Sumber pendanaan, dana abadi pesantren, pemantauan, dan evaluasi pendanaan.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/177017/perpres-no-82-tahun-2021", modules: "Keuangan, anggaran, donasi, bantuan, pelaporan" },
  { id: "pma-30-2020", title: "Pendirian dan Penyelenggaraan Pesantren", number: "PMA Nomor 30 Tahun 2020", authority: "Kementerian Agama", category: "pesantren", summary: "Ketentuan pendirian dan penyelenggaraan pesantren; status pada basis data BPK tercatat berlaku.", status: "Berlaku · cek perubahan", url: "https://peraturan.bpk.go.id/Details/176216/peraturan-menag-no-30-tahun-2020", modules: "Profil lembaga, legalitas, registrasi, kampus" },
  { id: "pma-31-2020", title: "Pendidikan Pesantren", number: "PMA Nomor 31 Tahun 2020", authority: "Kementerian Agama", category: "pesantren", summary: "Kerangka penyelenggaraan pendidikan pesantren; basis data BPK mencatat peraturan ini berlaku dan mencabut PMA 13/2014 serta PMA 18/2014.", status: "Berlaku · cek perubahan", url: "https://peraturan.bpk.go.id/Details/176475/peraturan-menag-no-31-tahun-2020", modules: "Kurikulum, kelas, pengajar, penilaian, kelulusan" },
  { id: "uu-20-2003", title: "Sistem Pendidikan Nasional", number: "UU Nomor 20 Tahun 2003", authority: "Pemerintah Pusat", category: "pendidikan", summary: "Dasar sistem pendidikan nasional, peserta didik, kurikulum, pendidik, pendanaan, evaluasi, dan pengawasan.", status: "Berlaku · perubahan/putusan MK perlu dipantau", url: "https://peraturan.bpk.go.id/Details/43920/uu-no-20-tahun-2003", modules: "Sekolah/madrasah, peserta didik, akademik, guru, evaluasi" },
  { id: "pp-57-2021", title: "Standar Nasional Pendidikan", number: "PP Nomor 57 Tahun 2021 jo. PP Nomor 4 Tahun 2022", authority: "Pemerintah Pusat", category: "pendidikan", summary: "Kerangka Standar Nasional Pendidikan; PP 4/2022 mengubah PP 57/2021.", status: "Berlaku · dibaca sebagai satu kesatuan", url: "https://peraturan.bpk.go.id/Details/165024/pp-no-57-tahun2021", modules: "Mutu pendidikan, kurikulum, sarana, asesmen, evaluasi" },
  { id: "permendikdasmen-12-2025", title: "Standar Isi PAUD, Pendidikan Dasar, dan Menengah", number: "Permendikdasmen Nomor 12 Tahun 2025", authority: "Kemendikdasmen", category: "pendidikan", summary: "Standar isi terbaru yang menggantikan Permendikbudristek Nomor 8 Tahun 2024.", status: "Berlaku sejak 15 Juli 2025", url: "https://peraturan.bpk.go.id/Details/322494/permendikdasmen-no-12-tahun-2025", modules: "Kurikulum sekolah, mata pelajaran, capaian pembelajaran" },
  { id: "permendikdasmen-21-2025", title: "Standar Tenaga Kependidikan", number: "Permendikdasmen Nomor 21 Tahun 2025", authority: "Kemendikdasmen", category: "pendidikan", summary: "Standar pendidik dan tenaga kependidikan PAUD, pendidikan dasar, dan menengah.", status: "Berlaku sejak 31 Oktober 2025", url: "https://peraturan.bpk.go.id/Details/335231", modules: "Data guru, tenaga kependidikan, kompetensi, penugasan" },
  { id: "uu-35-2014", title: "Perubahan atas UU Perlindungan Anak", number: "UU Nomor 35 Tahun 2014", authority: "Pemerintah Pusat", category: "perlindungan", summary: "Perubahan UU 23/2002 tentang Perlindungan Anak; relevan untuk perlindungan santri yang masih anak.", status: "Berlaku · dibaca bersama UU 23/2002 dan perubahan berikutnya", url: "https://peraturan.bpk.go.id/Details/38723/uu-no-35-tahun-2014", modules: "Data santri, pengasuhan, pengaduan, disiplin, perlindungan anak" },
  { id: "uu-12-2022", title: "Tindak Pidana Kekerasan Seksual", number: "UU Nomor 12 Tahun 2022", authority: "Pemerintah Pusat", category: "perlindungan", summary: "Pencegahan, penanganan, pelindungan, dan pemulihan hak korban kekerasan seksual.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/207944/uu-no-12-", modules: "Pengaduan terlindungi, safeguarding, penanganan kasus, audit akses" },
  { id: "uu-27-2022", title: "Pelindungan Data Pribadi", number: "UU Nomor 27 Tahun 2022", authority: "Pemerintah Pusat", category: "perlindungan", summary: "Hak subjek data, dasar dan tata cara pemrosesan, kewajiban pengendali/prosesor, serta sanksi. Data kesehatan dan data anak termasuk data pribadi spesifik.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/229798/uu-no-27-", modules: "Seluruh modul, santri, wali, kesehatan, HR, keamanan, audit" },
  { id: "uu-17-2023", title: "Kesehatan", number: "UU Nomor 17 Tahun 2023", authority: "Pemerintah Pusat", category: "kesehatan", summary: "Kerangka hukum kesehatan nasional termasuk upaya kesehatan, fasilitas, tenaga kesehatan, sistem informasi, dan pengawasan.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/258028/uu-no-17-ta-hun-2023", modules: "Kesehatan santri, UKS/klinik, rekam kesehatan, rujukan" },
  { id: "pp-28-2024", title: "Peraturan Pelaksanaan UU Kesehatan", number: "PP Nomor 28 Tahun 2024", authority: "Pemerintah Pusat", category: "kesehatan", summary: "Aturan pelaksanaan UU 17/2023; mencabut sejumlah aturan lama, termasuk PP 51/2009.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/294077/pp-no-28-tahun-2024", modules: "Kesehatan, UKS/klinik, farmasi, keselamatan, sanitasi" },
  { id: "uu-25-1992", title: "Perkoperasian", number: "UU Nomor 25 Tahun 1992", authority: "Pemerintah Pusat", category: "usaha", summary: "Kerangka hukum koperasi; telah diubah antara lain melalui UU 6/2023 dan UU 4/2023.", status: "Berlaku · perhatikan perubahan", url: "https://peraturan.bpk.go.id/Details/46650/uu-no-25-tahun-1992", modules: "Koperasi, simpan pinjam sesuai izin, anggota, RAT, pembukuan" },
  { id: "uu-43-2009", title: "Kearsipan", number: "UU Nomor 43 Tahun 2009", authority: "Pemerintah Pusat", category: "tata_kelola", summary: "Pengelolaan arsip yang autentik, utuh, terpercaya, termasuk retensi dan perlindungan arsip.", status: "Berlaku", url: "https://peraturan.bpk.go.id/Details/38788/uu-no-43-tahun-2009", modules: "Surat, dokumen, keputusan, arsip santri, arsip keuangan" },
];

type EnterpriseArea = Exclude<Section, "overview" | "institutions" | "activation" | "modules" | "publishers" | "security" | "regulations">;
const enterpriseAreas: Record<EnterpriseArea, { title: string; description: string; status: string; tables: string[]; next: string }> = {
  crm: { title: "CRM & Customer Success", description: "Siklus prospek, pelanggan, kontak, komunikasi, onboarding, dan retensi pelanggan PONDOK OS.", status: "Fondasi ERP tersedia · API dan workspace belum dihubungkan", tables: ["crm_leads", "customers", "customer_contacts"], next: "API CRM, pipeline prospek, aktivitas sales, customer onboarding, dan histori komunikasi." },
  catalog: { title: "Product & Module Catalog", description: "Katalog produk, paket layanan, modul, versi, harga, entitlement, dan marketplace modul.", status: "Fondasi katalog tersedia · provisioning belum dihubungkan", tables: ["product_catalog", "module_catalog", "module_entitlements"], next: "Editor katalog, versi dan harga, dependency modul, kompatibilitas, serta approval publikasi." },
  contracts: { title: "Kontrak, Lisensi & Subscription", description: "Penawaran yang disetujui, kontrak pelanggan, periode lisensi, perpanjangan, perubahan paket, dan terminasi.", status: "Fondasi kontrak tersedia · workflow belum dihubungkan", tables: ["quotes", "quote_lines", "contracts", "subscriptions"], next: "Pembuatan penawaran, persetujuan kontrak, siklus renewal, dan entitlement per instalasi." },
  billing: { title: "Billing, Invoice & Pembayaran", description: "Tagihan modul, biaya implementasi dan maintenance, invoice, penerimaan pembayaran, piutang, dan rekonsiliasi.", status: "Fondasi invoice dan pembayaran tersedia · transaksi UI belum dihubungkan", tables: ["invoices", "invoice_lines", "payments", "maintenance_agreements", "maintenance_service_events"], next: "API pembuatan invoice idempotent, penerbitan dokumen, pencatatan pembayaran, aging piutang, dan credit note." },
  accounting: { title: "Accounting & General Ledger", description: "Chart of accounts, jurnal umum, buku besar, neraca saldo, rekonsiliasi, tutup buku, dan audit trail.", status: "Fondasi double-entry tersedia · posting transaksi dan laporan belum dihubungkan", tables: ["chart_of_accounts", "journal_entries", "journal_lines"], next: "API posting invoice/pembayaran ke jurnal seimbang, reversal, periode akuntansi, dan laporan keuangan." },
  support: { title: "Customer Support, Incident & SLA", description: "Tiket dukungan, klasifikasi dampak, eskalasi, insiden, SLA, root cause, dan komunikasi penyelesaian.", status: "Fondasi support dan incident tersedia · helpdesk belum dihubungkan", tables: ["support_cases", "installation_incidents"], next: "API tiket, antrean agen, SLA timer, eskalasi, notifikasi, dan portal dukungan klien." },
  fleet: { title: "Client Fleet & Observability", description: "Daftar instalasi klien, heartbeat, log teredaksi, pemeriksaan kesehatan, versi aplikasi, dan insiden.", status: "Fondasi observability tersedia · konektor klien belum terpasang", tables: ["installations", "installation_log_events", "installation_health_checks"], next: "Enrollment instalasi, kredensial perangkat, ingest log, heartbeat, health scheduler, dan dashboard fleet." },
  backup: { title: "Backup, Disaster Recovery & Continuity", description: "Kebijakan backup, retensi, checksum, enkripsi, bukti restore, RPO/RTO, dan latihan pemulihan.", status: "Fondasi kebijakan dan bukti backup tersedia · executor klien belum terpasang", tables: ["backup_policies", "backup_runs", "client_assurance_reports"], next: "Agent backup lokal, target penyimpanan milik klien, verifikasi checksum, restore drill, dan alert kegagalan." },
  warranty: { title: "Warranty, Repair & Maintenance", description: "Masa garansi, cakupan dan pengecualian, klaim, riwayat perbaikan, jam kerja, biaya, dan invoice layanan.", status: "Fondasi garansi dan timeline perbaikan tersedia · workflow belum dihubungkan", tables: ["warranty_agreements", "warranty_claims", "warranty_claim_events", "client_repair_logs", "client_repair_events"], next: "API klaim garansi, work order, assignment teknisi, bukti perbaikan, persetujuan biaya, dan SLA." },
  reports: { title: "Management, Client & Assurance Reports", description: "Laporan kesehatan tiap klien, keamanan, ketersediaan, backup, SLA, pekerjaan maintenance, pendapatan, dan risiko.", status: "Fondasi laporan assurance tersedia · generator dan distribusi belum dihubungkan", tables: ["client_assurance_reports", "report_exports"], next: "Generator laporan periodik, PDF/CSV, approval, delivery log, dan pemisahan data klien vs stakeholder." },
  agents: { title: "AI Agent Operations & Automation", description: "Orkestrasi agent, pemantauan, diagnosis, rekomendasi, tugas terstruktur, approval, dan audit otomatisasi.", status: "Fondasi pencatatan agent tersedia · runtime agent belum aktif", tables: ["agent_runs", "security_findings", "remote_jobs", "approval_requests"], next: "Runtime agent deterministik lebih dahulu, policy engine, signed task manifest, approval berjenjang, dan audit eksekusi." },

  procurement: { title: "Procurement", description: "Vendor, permintaan pembelian, persetujuan anggaran, RFQ, perbandingan penawaran, purchase order, penerimaan, dan pembayaran vendor.", status: "Belum tersedia · schema, API, workflow, dan UI perlu dibangun", tables: [], next: "Vendor master, purchase requisition, budget reservation, RFQ, bid comparison, PO, goods receipt, three-way matching, dan accounts payable." },
  inventory: { title: "Inventory & Asset", description: "Gudang, stok, mutasi, stok opname, barcode/QR, serial number, aset tetap, penyusutan, pemeliharaan, dan penghapusan.", status: "Belum tersedia · schema, API, workflow, dan UI perlu dibangun", tables: [], next: "Multi-warehouse, stock ledger, transfer, cycle count, serial/batch tracking, fixed asset register, depreciation schedule, maintenance, dan disposal." },
  hrd: { title: "HRD & Payroll", description: "Pegawai, organisasi, rekrutmen, kontrak kerja, absensi, cuti, lembur, penilaian, BPJS, PPh 21, payroll, dan slip gaji.", status: "Belum tersedia · schema, API, workflow, dan UI perlu dibangun", tables: [], next: "Employee master, organization chart, recruitment, employment contracts, attendance, leave, overtime, performance, BPJS, PPh 21, payroll approval, dan payslip." },
  internal: { title: "Internal Operations", description: "Pegawai internal, departemen, anggaran, kebijakan, pengeluaran, aset, dan administrasi perusahaan.", status: "Belum tersedia · schema, API, workflow, dan UI perlu dibangun", tables: [], next: "Department master, internal budgets, expense claims, policy acknowledgements, office assets, approvals, dan operational calendar." },
  documents: { title: "Document Center", description: "Invoice PDF, kontrak, proposal, PO, kuitansi, slip gaji, dokumen audit, dan arsip.", status: "Belum tersedia · document service, storage policy, metadata, and UI perlu dibangun", tables: [], next: "Document registry, versioning, access classification, retention, checksum, signed links, PDF generation, audit trail, dan legal hold." },
};

const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL?.trim();
const auth = AUTH_URL ? createAuthClient(AUTH_URL) : null;

function readUser(value: unknown): User | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const session = root.session && typeof root.session === "object" ? root.session as Record<string, unknown> : null;
  const raw = (session?.user ?? root.user) as Record<string, unknown> | undefined;
  return raw && typeof raw.id === "string" ? { id: raw.id, ...(typeof raw.email === "string" ? { email: raw.email } : {}), ...(typeof raw.name === "string" ? { name: raw.name } : {}) } : null;
}
function jwt(value: unknown): value is string { return typeof value === "string" && value.split(".").length === 3 && value.length > 100; }
async function token(): Promise<string> {
  if (!auth || !AUTH_URL) throw new Error("Neon Auth belum dikonfigurasi.");
  try { const result = await auth.token(); if (jwt(result.data?.token)) return result.data.token; } catch { /* secure cookie fallback below */ }
  const response = await fetch(`${AUTH_URL.replace(/\/$/, "")}/token`, { credentials: "include", cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Sesi autentikasi tidak dapat diverifikasi (HTTP ${response.status}).`);
  const data = await response.json() as Record<string, unknown>;
  const nested = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
  const candidate = [data.token, data.access_token, nested.token, nested.access_token].find(jwt);
  if (!candidate) throw new Error("Neon Auth tidak memberikan JWT yang valid. Masuk kembali.");
  return candidate;
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (access: string) => fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${access}`, ...init.headers },
    cache: "no-store",
  });
  let response = await send(await token());
  // Managed Auth JWTs are short-lived. If a restored tab holds an expired
  // access token, ask Auth for a fresh token and retry exactly once.
  if (response.status === 401 && AUTH_URL) {
    const refreshed = await fetch((AUTH_URL.endsWith("/") ? AUTH_URL.slice(0, -1) : AUTH_URL) + "/token", {
      credentials: "include", cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (refreshed.ok) {
      const payload = await refreshed.json().catch(() => ({})) as Record<string, unknown>;
      const nested = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
      const freshToken = [payload.token, payload.access_token, nested.token, nested.access_token].find(jwt);
      if (freshToken) response = await send(freshToken);
    }
  }
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string; message?: string };
  if (!response.ok) throw new Error(body.error ?? body.message ?? `Permintaan gagal (HTTP ${response.status})`);
  return body.data as T;
}
const date = (value?: string) => value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [regulationCategory, setRegulationCategory] = useState<RegulationCategory | "all">("all");
  const [regulationSearch, setRegulationSearch] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [modules, setModules] = useState<ModuleRequest[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [search, setSearch] = useState("");
  const [publisherUserId, setPublisherUserId] = useState("");
  const [org, setOrg] = useState({ contactName: "", organizationName: "", organizationSlug: "", organizationType: "pesantren", campusCode: "UTAMA", campusName: "Kampus Utama" });

  const load = useCallback(async () => {
    if (!verified) return;
    setLoading(true); setErrors([]); setNotice("");
    const [tenantResult, activationResult, moduleResult, publisherResult, auditResult] = await Promise.allSettled([
      request<Tenant[]>("/v1/platform/admin/tenants"),
      request<Activation[]>("/v1/platform/admin/activation-requests"),
      request<ModuleRequest[]>("/v1/platform/admin/modules/requests"),
      request<Publisher[]>("/v1/platform/admin/module-publishers"),
      request<AuditEvent[]>("/v1/platform/admin/audit-events?limit=100"),
    ]);
    const failed: string[] = [];
    if (tenantResult.status === "fulfilled") setTenants(tenantResult.value); else failed.push(`Registry lembaga: ${tenantResult.reason instanceof Error ? tenantResult.reason.message : "gagal"}`);
    if (activationResult.status === "fulfilled") setActivations(activationResult.value); else failed.push(`Aktivasi: ${activationResult.reason instanceof Error ? activationResult.reason.message : "gagal"}`);
    if (moduleResult.status === "fulfilled") setModules(moduleResult.value); else failed.push(`Module registry: ${moduleResult.reason instanceof Error ? moduleResult.reason.message : "belum tersedia"}`);
    if (publisherResult.status === "fulfilled") setPublishers(publisherResult.value); else failed.push(`Publisher: ${publisherResult.reason instanceof Error ? publisherResult.reason.message : "belum tersedia"}`);
    if (auditResult.status === "fulfilled") setAuditEvents(auditResult.value); else failed.push(`Audit log: ${auditResult.reason instanceof Error ? auditResult.reason.message : "belum tersedia"}`);
    setErrors(failed); setLoading(false);
  }, [verified]);

  useEffect(() => {
    if (!auth) return;
    void auth.getSession().then((result) => { const found = readUser(result.data); if (found) setUser(found); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!user) { setVerified(false); return; }
    let active = true;
    void request<{ isSuperAdmin: boolean }>("/v1/platform/admin/me").then((result) => {
      if (!active) return;
      if (!result.isSuperAdmin) { setUser(null); setNotice("Akses ditolak. Akun ini bukan Super Administrator aktif."); return; }
      setVerified(true);
    }).catch((reason: unknown) => { if (active) { setVerified(false); setNotice(reason instanceof Error ? reason.message : "Verifikasi hak administrator gagal."); } });
    return () => { active = false; };
  }, [user]);
  useEffect(() => { if (verified) void load(); }, [verified, load]);

  const pending = useMemo(() => activations.filter((x) => x.status === "pending").length, [activations]);
  const activeTenants = useMemo(() => tenants.filter((x) => x.status === "active").length, [tenants]);
  const filteredTenants = useMemo(() => tenants.filter((x) => `${x.name} ${x.slug} ${x.organizationType}`.toLowerCase().includes(search.toLowerCase())), [tenants, search]);
  const filteredRegulations = useMemo(() => regulations.filter((x) => (regulationCategory === "all" || x.category === regulationCategory) && `${x.title} ${x.number} ${x.authority} ${x.summary} ${x.modules}`.toLowerCase().includes(regulationSearch.toLowerCase())), [regulationCategory, regulationSearch]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!auth) { setNotice("Konfigurasi Neon Auth tidak tersedia."); return; }
    setAuthBusy(true); setNotice("");
    try {
      const result = await auth.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      const found = readUser(result.data); if (!found) throw new Error("Login tidak menghasilkan sesi pengguna.");
      setUser(found); setPassword("");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Login gagal."); }
    finally { setAuthBusy(false); }
  }
  async function signOut() { await auth?.signOut(); setUser(null); setVerified(false); setTenants([]); setActivations([]); setModules([]); setPublishers([]); setAuditEvents([]); }
  async function approve(id: string) {
    setIssuedToken(""); setNotice("");
    try { const result = await request<{ activationToken: string; expiresInHours: number }>(`/v1/platform/admin/activation-requests/${id}/approve`, { method: "POST", body: "{}" }); setIssuedToken(result.activationToken); setNotice("Permohonan disetujui. Token hanya ditampilkan satu kali; salin dan kirim melalui kanal resmi."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Persetujuan gagal."); }
  }
  async function reject(id: string) {
    const note = window.prompt("Alasan penolakan (minimal 3 karakter):"); if (!note || note.trim().length < 3) return;
    try { await request(`/v1/platform/admin/activation-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }); setNotice("Permohonan ditolak dan tercatat pada audit."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Penolakan gagal."); }
  }
  async function reviewModule(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Alasan penolakan (minimal 3 karakter):") : "";
    if (action === "reject" && (!note || note.trim().length < 3)) return;
    try { await request(`/v1/platform/admin/modules/requests/${id}/${action}`, { method: "POST", body: JSON.stringify(note ? { note } : {}) }); setNotice(action === "approve" ? "Permintaan modul disetujui dan tercatat pada audit." : "Permintaan modul ditolak dan tercatat pada audit."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Review modul gagal."); }
  }
  async function grantPublisher(event: FormEvent) {
    event.preventDefault();
    const id = publisherUserId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) { setNotice("User ID harus UUID yang valid."); return; }
    if (!window.confirm("Berikan kewenangan publisher kepada akun ini?")) return;
    try { await request("/v1/platform/admin/module-publishers", { method: "POST", body: JSON.stringify({ userId: id }) }); setPublisherUserId(""); setNotice("Hak publisher berhasil diberikan."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Pemberian hak publisher gagal."); }
  }
  async function revokePublisher(id: string) {
    if (!window.confirm("Cabut kewenangan publisher akun ini?")) return;
    try { await request(`/v1/platform/admin/module-publishers/${id}/revoke`, { method: "POST", body: "{}" }); setNotice("Hak publisher berhasil dicabut."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Pencabutan hak publisher gagal."); }
  }
  async function bootstrap(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(`Konfirmasi pembuatan lembaga resmi “${org.organizationName}”? Tindakan ini membuat organisasi, kampus, dan membership pada database Development.`)) return;
    try { const result = await request<{ organizationId: string }>("/v1/platform/admin/bootstrap-first-tenant", { method: "POST", body: JSON.stringify(org) }); setNotice(`Lembaga berhasil dibuat: ${result.organizationId}`); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Inisialisasi gagal."); }
  }

  if (!user) return <main className="login-shell"><section className="login-card"><div className="brand-mark">P<span>·</span></div><p className="kicker">PLATFORM CONTROL PLANE</p><h1>Central Command</h1><p className="muted">Ruang kendali khusus Super Administrator PONDOK OS. Terpisah dari workspace operasional pesantren.</p>{notice && <div className="alert">{notice}</div>}<form onSubmit={signIn}><label>Email administrator<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primary full" disabled={authBusy}>{authBusy ? "Memverifikasi…" : "Masuk ke Command Center"}</button></form><small>Hak Super Admin diverifikasi ulang oleh API pada setiap sesi. Tidak ada pendaftaran mandiri.</small></section></main>;
  if (!verified) return <main className="login-shell"><section className="login-card"><div className="spinner" /><h2>Memverifikasi hak administrator</h2><p className="muted">{notice || "Memeriksa sesi dan otorisasi melalui server…"}</p><button className="secondary" onClick={() => void signOut()}>Keluar</button></section></main>;

  const navGroups: { title: string; items: { id: Section; name: string; icon: string }[] }[] = [
    { title: "01 · EXECUTIVE DASHBOARD", items: [{ id: "overview", name: "Executive Dashboard", icon: "◫" }, { id: "reports", name: "KPI & Management Reports", icon: "▥" }] },
    { title: "02 · CRM & SALES", items: [{ id: "crm", name: "Leads, Pipeline & Sales", icon: "◎" }] },
    { title: "03 · CUSTOMER MANAGEMENT", items: [{ id: "catalog", name: "Produk & Paket Modul", icon: "◇" }, { id: "contracts", name: "Kontrak & Subscription", icon: "▤" }, { id: "institutions", name: "Customer & Branch Registry", icon: "▦" }, { id: "modules", name: "Module Entitlements", icon: "◇" }, { id: "activation", name: "Onboarding & Activation", icon: "◎" }] },
    { title: "04 · BILLING & INVOICE", items: [{ id: "billing", name: "Invoice & Payments", icon: "＄" }] },
    { title: "05 · ACCOUNTING & FINANCE", items: [{ id: "accounting", name: "General Ledger & Finance", icon: "◈" }] },
    { title: "06 · PROCUREMENT", items: [{ id: "procurement", name: "Procurement & Vendors", icon: "⇄" }] },
    { title: "07 · INVENTORY & ASSET", items: [{ id: "inventory", name: "Inventory & Fixed Assets", icon: "▤" }] },
    { title: "08 · HRD & PAYROLL", items: [{ id: "hrd", name: "People, HR & Payroll", icon: "♙" }] },
    { title: "09 · SUPPORT & CUSTOMER SUCCESS", items: [{ id: "support", name: "Support, Incident & SLA", icon: "◷" }, { id: "warranty", name: "Warranty & Repair", icon: "✓" }] },
    { title: "10 · INTERNAL OPERATIONS", items: [{ id: "internal", name: "Company Operations", icon: "⌂" }] },
    { title: "11 · DOCUMENT CENTER", items: [{ id: "documents", name: "Documents & Archive", icon: "▧" }] },
    { title: "12 · FLEET MANAGEMENT", items: [{ id: "fleet", name: "Client Installations", icon: "⌘" }, { id: "backup", name: "Backup & Disaster Recovery", icon: "⬡" }] },
    { title: "13 · MULTI-AGENT AI", items: [{ id: "agents", name: "Agent Operations", icon: "✳" }] },
    { title: "14 · GOVERNANCE & COMPLIANCE", items: [{ id: "security", name: "Security & Audit", icon: "⬡" }, { id: "regulations", name: "Regulations & Compliance", icon: "§" }, { id: "publishers", name: "Publisher & Integrations", icon: "⌘" }] },
  ];
  return <div className="app-shell">
    <aside className="sidebar"><div className="side-brand"><div className="brand-mark">P<span>·</span></div><div><b>PONDOK OS</b><small>CENTRAL COMMAND</small></div></div><div className="environment"><i /> DEVELOPMENT CONTROL PLANE</div><nav>{navGroups.map((group) => <div className="nav-group" key={group.title}><div className="nav-group-title">{group.title}</div>{group.items.map((item) => <button key={item.id} className={section === item.id ? "nav-item active" : "nav-item"} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.name}{item.id === "activation" && pending > 0 && <em>{pending}</em>}</button>)}</div>)}</nav><div className="side-bottom"><div className="user-chip"><div className="avatar">{(user.name || user.email || "S").slice(0,1).toUpperCase()}</div><div><b>{user.name || "Super Administrator"}</b><small>{user.email}</small></div></div><button className="logout" onClick={() => void signOut()}>↗ Keluar aman</button></div></aside>
    <main className="main-area"><header className="topbar"><div><span className="crumb">PLATFORM /</span> {label(section)}</div><div className="top-actions"><span className="secure"><i /> SESSION VERIFIED</span><button className="icon-button" onClick={() => void load()} disabled={loading} title="Muat ulang">↻</button></div></header>
      <div className="content"><div className="page-heading"><div><p className="kicker">PONDOK OS · SUPER ADMINISTRATOR</p><h1>{section === "overview" ? "Command Center" : navGroups.flatMap((group) => group.items).find((item) => item.id === section)?.name}</h1><p className="muted">Kontrol terpusat platform, lembaga, lisensi, dan tata kelola.</p></div><button className="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "↻ Sinkronkan data"}</button></div>
      {notice && <div className="alert">{notice}</div>}{errors.length > 0 && <div className="alert warning"><b>Beberapa sumber data belum tersedia</b>{errors.map((x) => <div key={x}>{x}</div>)}</div>}{issuedToken && <div className="token-panel"><b>Token aktivasi — tampil satu kali</b><code>{issuedToken}</code><button className="secondary" onClick={() => void navigator.clipboard.writeText(issuedToken)}>Salin token</button></div>}
      {section === "overview" && <><div className="stat-grid"><Stat title="Total lembaga" value={tenants.length} detail="Terdaftar pada platform" icon="▦"/><Stat title="Lembaga aktif" value={activeTenants} detail="Status aktif" icon="◈"/><Stat title="Menunggu persetujuan" value={pending} detail="Permohonan aktivasi" icon="◎"/><Stat title="Permintaan modul" value={modules.length} detail="Registry ekosistem" icon="◇"/></div><div className="two-col"><section className="panel"><PanelTitle title="Aktivitas yang memerlukan tindakan" subtitle="Antrian prioritas administrator"/>{activations.filter((x) => x.status === "pending").slice(0,5).map((x) => <div className="activity" key={x.id}><div className="activity-icon">◎</div><div className="activity-copy"><b>{x.organizationName}</b><small>{x.contactName} · {date(x.createdAt)}</small></div><span className="pill warning">Pending</span></div>)}{pending === 0 && <Empty text="Tidak ada permohonan menunggu."/>}<button className="text-button" onClick={() => setSection("activation")}>Buka seluruh permohonan →</button></section><section className="panel"><PanelTitle title="Kesehatan kontrol plane" subtitle="Status koneksi dan akses"/><div className="health-row"><span>Neon Auth session</span><b className="ok">Terverifikasi</b></div><div className="health-row"><span>Super Admin authorization</span><b className="ok">Aktif</b></div><div className="health-row"><span>API platform registry</span><b className={errors.some((x) => x.includes("Registry")) ? "bad" : "ok"}>{errors.some((x) => x.includes("Registry")) ? "Perlu pemeriksaan" : "Terhubung"}</b></div><div className="health-row"><span>Database target</span><b className="dev">Development</b></div><div className="health-note">Semua operasi platform menggunakan endpoint terproteksi dan scope database server-side.</div></section></div><section className="panel"><PanelTitle title="Lembaga terbaru" subtitle="Registry global platform"/><TenantTable rows={tenants.slice(0,5)}/><button className="text-button" onClick={() => setSection("institutions")}>Lihat seluruh lembaga →</button></section></>}
      {section === "institutions" && <section className="panel"><PanelTitle title="Registry lembaga" subtitle="Daftar organisasi lintas tenant; data dibatasi oleh kontrol plane"/><div className="toolbar"><input placeholder="Cari nama, slug, tipe lembaga…" value={search} onChange={(e) => setSearch(e.target.value)}/><span>{filteredTenants.length} lembaga</span></div><TenantTable rows={filteredTenants}/>{tenants.length === 0 && <Empty text="Belum ada lembaga terdaftar. Inisialisasi hanya dilakukan setelah data lembaga sebenarnya tersedia."/>}</section>}
      {section === "activation" && <section className="panel"><PanelTitle title="Permohonan aktivasi" subtitle="Tinjau identitas pemohon dan data lembaga sebelum memberi persetujuan"/><div className="table-wrap"><table><thead><tr><th>Lembaga / pemohon</th><th>Jenis & kampus</th><th>Diajukan</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{activations.map((x) => <tr key={x.id}><td><b>{x.organizationName}</b><small>{x.contactName} · {x.contactEmail}</small><small>{x.organizationSlug}</small></td><td>{label(x.organizationType)}<small>{x.campusCode} · {x.campusName}</small></td><td>{date(x.createdAt)}</td><td><span className={`pill ${x.status === "pending" ? "warning" : "neutral"}`}>{label(x.status)}</span></td><td>{x.status === "pending" ? <div className="actions"><button className="mini primary" onClick={() => void approve(x.id)}>Setujui</button><button className="mini danger" onClick={() => void reject(x.id)}>Tolak</button></div> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>{activations.length === 0 && <Empty text="Belum ada permohonan aktivasi."/>}</section>}
      {section === "modules" && <section className="panel"><PanelTitle title="Ekosistem & permintaan modul" subtitle="Pantau usulan modul dan status siklus persetujuan"/><div className="table-wrap"><table><thead><tr><th>Modul</th><th>Versi</th><th>Organisasi</th><th>Status</th><th>Diperbarui</th><th>Tindakan</th></tr></thead><tbody>{modules.map((x) => <tr key={x.id}><td><b>{x.moduleId}</b><small>{x.id}</small></td><td>{x.moduleVersion}</td><td>{x.organizationName || x.organizationId}</td><td><span className="pill neutral">{label(x.status)}</span></td><td>{date(x.updatedAt || x.createdAt)}</td><td>{x.status === "submitted" ? <div className="actions"><button className="mini primary" onClick={() => void reviewModule(x.id,"approve")}>Setujui</button><button className="mini danger" onClick={() => void reviewModule(x.id,"reject")}>Tolak</button></div> : "—"}</td></tr>)}</tbody></table></div>{modules.length === 0 && <Empty text="Belum ada permintaan modul atau registry belum memiliki data."/>}</section>}
      {section === "publishers" && <section className="panel"><PanelTitle title="Publisher & integrasi" subtitle="Akun yang diberi kewenangan mengajukan modul"/><form className="toolbar" onSubmit={grantPublisher}><input placeholder="UUID akun terverifikasi" value={publisherUserId} onChange={(e) => setPublisherUserId(e.target.value)} required/><button className="primary" type="submit">+ Beri hak publisher</button></form><div className="table-wrap"><table><thead><tr><th>User ID</th><th>Status</th><th>Dibuat</th><th>Tindakan</th></tr></thead><tbody>{publishers.map((x) => <tr key={x.userId}><td className="mono">{x.userId}</td><td><span className="pill neutral">{label(x.status || "active")}</span></td><td>{date(x.createdAt)}</td><td>{x.status === "active" ? <button className="mini danger" onClick={() => void revokePublisher(x.userId)}>Cabut akses</button> : "—"}</td></tr>)}</tbody></table></div>{publishers.length === 0 && <Empty text="Belum ada publisher terdaftar."/>}</section>}
      {section === "security" && <><section className="panel"><PanelTitle title="Keamanan & tata kelola" subtitle="Kontrol keamanan yang aktif pada sesi ini"/><div className="security-grid"><Security title="Server-side authorization" desc="Setiap endpoint platform memverifikasi status Super Admin aktif."/><Security title="Tenant isolation" desc="Operasi tenant tetap dibatasi oleh membership dan row-level security."/><Security title="Session handling" desc="JWT dikirim melalui header Authorization; token tidak disimpan di localStorage."/><Security title="Audit trail" desc="Persetujuan aktivasi dan bootstrap lembaga dicatat pada platform audit events."/><Security title="Environment boundary" desc="Command Center terhubung ke Development API; tidak mengakses Production."/><Security title="Least privilege" desc="Akun non-Super Admin ditolak oleh API meskipun membuka URL Command Center." /></div></section><section className="panel"><PanelTitle title="Log audit platform" subtitle="100 peristiwa terbaru yang tercatat di control plane"/><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Resource</th><th>ID resource</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td>{date(event.occurredAt)}</td><td className="mono">{event.actorUserId}</td><td><b>{event.action}</b></td><td>{event.resourceType}</td><td className="mono">{event.resourceId || "—"}</td></tr>)}</tbody></table></div>{auditEvents.length === 0 && <Empty text="Belum ada peristiwa audit pada platform."/>}</section><section className="panel"><PanelTitle title="Inisialisasi lembaga pertama" subtitle="Hanya digunakan bila lembaga resmi pertama memang akan didaftarkan"/><p className="muted">Formulir ini membuat organisasi, kampus utama, membership, dan role pemilik institusi. Tidak ada data contoh yang dibuat otomatis.</p><form className="org-form" onSubmit={bootstrap}><label>Nama penanggung jawab<input required minLength={2} maxLength={120} value={org.contactName} onChange={(e) => setOrg({...org, contactName:e.target.value})}/></label><label>Nama lembaga resmi<input required minLength={3} maxLength={180} value={org.organizationName} onChange={(e) => setOrg({...org, organizationName:e.target.value})}/></label><label>Slug lembaga<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={org.organizationSlug} onChange={(e) => setOrg({...org, organizationSlug:e.target.value})}/></label><label>Jenis lembaga<select value={org.organizationType} onChange={(e) => setOrg({...org, organizationType:e.target.value})}><option value="pesantren">Pesantren</option><option value="madrasah">Madrasah</option><option value="sekolah">Sekolah</option><option value="yayasan">Yayasan</option><option value="other">Lainnya</option></select></label><label>Kode kampus<input required pattern="[A-Z0-9_-]{2,24}" value={org.campusCode} onChange={(e) => setOrg({...org, campusCode:e.target.value.toUpperCase()})}/></label><label>Nama kampus utama<input required minLength={2} value={org.campusName} onChange={(e) => setOrg({...org, campusName:e.target.value})}/></label><button className="primary" type="submit" disabled={tenants.length > 0}>Buat lembaga pertama</button>{tenants.length > 0 && <small>Inisialisasi pertama terkunci karena sudah ada lembaga.</small>}</form></section></>}
      {section === "regulations" && <>
        <section className="panel"><PanelTitle title="Pusat Regulasi & Kepatuhan" subtitle="Indeks awal regulasi pemerintah yang relevan dengan operasional pesantren dan modul PONDOK OS"/>
          <div className="regulatory-notice"><b>Catatan validitas hukum</b><p>Daftar ini adalah indeks referensi awal, bukan pendapat hukum atau sertifikasi kepatuhan. Status dan perubahan harus diperiksa pada sumber resmi sebelum kebijakan lembaga ditetapkan. Peraturan daerah, izin, dan ketentuan khusus wilayah tetap perlu ditambahkan sesuai lokasi lembaga.</p></div>
          <div className="regulatory-toolbar"><input aria-label="Cari regulasi" placeholder="Cari nomor, judul, instansi, atau modul terkait…" value={regulationSearch} onChange={(e) => setRegulationSearch(e.target.value)}/><span>{filteredRegulations.length} dokumen</span></div>
          <div className="regulatory-tabs">{regulationCategories.map((x) => <button key={x.id} className={regulationCategory === x.id ? "reg-tab active" : "reg-tab"} onClick={() => setRegulationCategory(x.id)}>{x.name}</button>)}</div>
          <div className="regulatory-grid">{filteredRegulations.map((x) => <article className="reg-card" key={x.id}><div className="reg-card-top"><span className="pill neutral">{x.authority}</span><span className="reg-status">{x.status}</span></div><small className="reg-number">{x.number}</small><h3>{x.title}</h3><p>{x.summary}</p><div className="reg-modules"><b>Modul terkait</b><span>{x.modules}</span></div><a className="reg-link" href={x.url} target="_blank" rel="noreferrer">Buka sumber resmi ↗</a></article>)}</div>
          {filteredRegulations.length === 0 && <Empty text="Tidak ada dokumen yang cocok dengan pencarian."/>}
        </section>
        <section className="panel"><PanelTitle title="Sumber hukum resmi" subtitle="Prioritaskan dokumen primer, bukan ringkasan pihak ketiga"/><div className="source-list"><a href="https://jdih.kemenag.go.id/" target="_blank" rel="noreferrer"><b>JDIH Kementerian Agama</b><span>Peraturan Menteri Agama, Keputusan Menteri Agama, dan keputusan/produk hukum Kemenag.</span></a><a href="https://peraturan.bpk.go.id/" target="_blank" rel="noreferrer"><b>Database Peraturan BPK</b><span>Metadata, status, relasi perubahan/pencabutan, dan dokumen peraturan.</span></a><a href="https://peraturan.go.id/" target="_blank" rel="noreferrer"><b>Portal Peraturan Perundang-undangan</b><span>Penelusuran peraturan nasional dan metadata pengundangan.</span></a><a href="https://jdih.kemendikdasmen.go.id/" target="_blank" rel="noreferrer"><b>JDIH Kemendikdasmen</b><span>Standar dan regulasi pendidikan dasar dan menengah.</span></a></div><p className="muted">Keputusan Menteri Agama (KMA), Keputusan Direktur Jenderal, surat edaran, dan petunjuk teknis akan dimasukkan per nomor dan tahun setelah naskah serta status keberlakuannya diverifikasi pada JDIH penerbit. Tidak ada nomor keputusan yang ditebak.</p></section>
      </>}
      {Object.prototype.hasOwnProperty.call(enterpriseAreas, section) && (() => {
        const area = enterpriseAreas[section as EnterpriseArea];
        return <section className="panel enterprise-workspace">
          <PanelTitle title={area.title} subtitle={area.description}/>
          <div className="enterprise-status"><b>STATUS IMPLEMENTASI</b><span>{area.status}</span></div>
          <h3>Fondasi data terkait</h3>
          <div className="enterprise-table-list">{area.tables.map((table) => <code key={table}>{table}</code>)}</div>
          <h3>Ruang lingkup workspace</h3>
          <p className="muted">{area.next}</p>
          <div className="enterprise-notice"><b>Transparansi implementasi</b><p>Halaman ini menampilkan peta modul dan status fondasi yang benar-benar ada. Data transaksi belum ditampilkan karena API workspace ini belum tersedia. Tidak ada data contoh, angka, invoice, atau status operasional yang direkayasa.</p></div>
        </section>;
      })()}
      <footer>© PONDOK OS · Central Command <span>Control plane terpisah · Development</span></footer></div>
    </main>
  </div>;
}
function Stat({title,value,detail,icon}:{title:string;value:number;detail:string;icon:string}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function TenantTable({rows}:{rows:Tenant[]}){return <div className="table-wrap"><table><thead><tr><th>Nama lembaga</th><th>Jenis</th><th>Anggota</th><th>Status</th><th>Lisensi</th><th>Dibuat</th></tr></thead><tbody>{rows.map((x)=><tr key={x.organizationId}><td><b>{x.name}</b><small>{x.slug}</small></td><td>{label(x.organizationType)}</td><td>{x.memberCount}</td><td><span className={`pill ${x.status === "active" ? "success" : "neutral"}`}>{label(x.status)}</span></td><td>{x.planCode || "Belum ada"}<small>{x.licenseStatus ? label(x.licenseStatus) : "Tanpa lisensi"}</small></td><td>{date(x.createdAt)}</td></tr>)}</tbody></table></div>}
function Security({title,desc}:{title:string;desc:string}){return <div className="security-item"><span>✓</span><div><b>{title}</b><p>{desc}</p></div></div>}
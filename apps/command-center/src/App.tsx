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
  crm: { title: "CRM & Customer Success", description: "Siklus prospek, pelanggan, kontak, komunikasi, onboarding, dan retensi pelanggan PONDOK OS.", status: "API dan workspace CRM aktif untuk lead, pelanggan, dan kontak; pipeline lanjutan belum lengkap", tables: ["crm_leads", "customers", "customer_contacts"], next: "API CRM, pipeline prospek, aktivitas sales, customer onboarding, dan histori komunikasi." },
  catalog: { title: "Product & Module Catalog", description: "Katalog produk, paket layanan, modul, versi, harga, entitlement, dan marketplace modul.", status: "Katalog produk dasar aktif; paket, versi modul, dependency, dan provisioning entitlement belum lengkap", tables: ["product_catalog", "module_catalog", "module_entitlements"], next: "Editor katalog, versi dan harga, dependency modul, kompatibilitas, serta approval publikasi." },
  contracts: { title: "Kontrak, Lisensi & Subscription", description: "Penawaran yang disetujui, kontrak pelanggan, periode lisensi, perpanjangan, perubahan paket, dan terminasi.", status: "API penawaran dan persetujuan kontrak terhubung · subscription dan billing lanjutan menyusul", tables: ["quotes", "quote_lines", "contracts", "subscriptions"], next: "Subscription, renewal automation, perubahan paket, dan entitlement per instalasi." },
  billing: { title: "Billing, Invoice & Pembayaran", description: "Tagihan modul, biaya implementasi dan maintenance, invoice, penerimaan pembayaran, piutang, dan rekonsiliasi.", status: "API invoice, pembayaran, dan posting jurnal tersedia · credit note dan rekonsiliasi menyusul", tables: ["invoices", "invoice_lines", "payments", "maintenance_agreements", "maintenance_service_events"], next: "Invoice PDF, credit note, refund, aging piutang, recurring billing, dan rekonsiliasi bank." },
  accounting: { title: "Accounting & General Ledger", description: "Chart of accounts, jurnal umum, buku besar, neraca saldo, rekonsiliasi, tutup buku, dan audit trail.", status: "Chart of Accounts dan posting double-entry invoice/pembayaran terhubung · laporan keuangan menyusul", tables: ["chart_of_accounts", "journal_entries", "journal_lines"], next: "Reversal, trial balance, general ledger drilldown, bank reconciliation, period close, P&L, balance sheet, dan cash flow." },
  support: { title: "Customer Support, Incident & SLA", description: "Tiket dukungan, klasifikasi dampak, eskalasi, insiden, SLA, root cause, dan komunikasi penyelesaian.", status: "API baca dan workspace operasional aktif · tindakan tiket dan eskalasi lanjutan menyusul", tables: ["support_cases", "installation_incidents"], next: "Daftar tiket, insiden, tingkat keparahan, SLA, dan status penyelesaian ditampilkan dari database Development." },
  fleet: { title: "Client Fleet & Observability", description: "Daftar instalasi klien, heartbeat, log teredaksi, pemeriksaan kesehatan, versi aplikasi, dan insiden.", status: "API baca dan workspace fleet aktif · enrollment perangkat dan konektor klien belum tersedia", tables: ["installations", "installation_log_events", "installation_health_checks"], next: "Daftar instalasi, versi, heartbeat, health check, dan log yang sudah direduksi." },
  backup: { title: "Backup, Disaster Recovery & Continuity", description: "Kebijakan backup, retensi, checksum, enkripsi, bukti restore, RPO/RTO, dan latihan pemulihan.", status: "API baca dan workspace backup aktif · eksekutor backup lokal/restore belum terpasang", tables: ["backup_policies", "backup_runs", "client_assurance_reports"], next: "Kebijakan, frekuensi, retensi, status enkripsi/checksum, riwayat backup, dan hasil restore test." },
  warranty: { title: "Warranty, Repair & Maintenance", description: "Masa garansi, cakupan dan pengecualian, klaim, riwayat perbaikan, jam kerja, biaya, dan invoice layanan.", status: "API baca dan workspace garansi aktif · workflow klaim, assignment teknisi, dan approval biaya menyusul", tables: ["warranty_agreements", "warranty_claims", "warranty_claim_events", "client_repair_logs", "client_repair_events"], next: "Perjanjian, cakupan, masa berlaku, klaim, hasil eligibility, dan riwayat perbaikan." },
  reports: { title: "Management, Client & Assurance Reports", description: "Laporan kesehatan tiap klien, keamanan, ketersediaan, backup, SLA, pekerjaan maintenance, pendapatan, dan risiko.", status: "API baca dan workspace laporan aktif · generator PDF/CSV dan distribusi menyusul", tables: ["client_assurance_reports", "stakeholder_service_reports", "report_exports"], next: "Laporan assurance, laporan stakeholder, periode, skor, status approval, delivery, dan permintaan ekspor." },
  agents: { title: "AI Agent Operations & Automation", description: "Orkestrasi agent, pemantauan, diagnosis, rekomendasi, tugas terstruktur, approval, dan audit otomatisasi.", status: "API observasi agent aktif · runtime agent otonom dan dispatch job tetap dinonaktifkan", tables: ["agent_runs", "security_findings", "remote_jobs", "approval_requests"], next: "Riwayat agent, temuan keamanan, tugas terstruktur, dan antrean approval; tindakan berisiko tetap memerlukan persetujuan manusia." },

  procurement: { title: "Procurement", description: "Vendor, permintaan pembelian, persetujuan anggaran, RFQ, perbandingan penawaran, purchase order, penerimaan, dan pembayaran vendor.", status: "Migration 0024 telah diterapkan di Development; menu ini masih read-only dan belum menyediakan form transaksi", tables: ["vendors", "purchase_requisitions", "request_for_quotations", "vendor_quotes", "purchase_orders", "goods_receipts"], next: "Vendor master, permintaan pembelian, RFQ, perbandingan penawaran, PO, dan penerimaan barang. Skema tersedia; transaksi belum dapat dibuat dari menu ini karena form dan endpoint tulis belum tersedia." },
  inventory: { title: "Inventory & Asset", description: "Gudang, stok, mutasi, stok opname, barcode/QR, serial number, aset tetap, penyusutan, pemeliharaan, dan penghapusan.", status: "Migration 0024 telah diterapkan di Development; menu ini masih read-only dan belum menyediakan form transaksi", tables: ["warehouses", "stock_movements", "stock_transfers", "fixed_assets", "asset_events"], next: "Multi-gudang, saldo stok dari ledger mutasi, transfer, register aset tetap, dan riwayat aset. Data akan terbuka setelah migration 0024 disetujui dan diterapkan ke Development." },
  hrd: { title: "HRD & Payroll", description: "Pegawai, organisasi, rekrutmen, kontrak kerja, absensi, cuti, lembur, penilaian, BPJS, PPh 21, payroll, dan slip gaji.", status: "Migration 0025 telah diterapkan di Development; menu ini masih read-only dan belum menyediakan form HR/payroll", tables: ["company_departments","company_employees","company_employee_assignments","company_attendance_records","company_leave_requests","company_payroll_periods","company_payroll_runs","company_payroll_items"], next: "Struktur organisasi, pegawai, penempatan, presensi, cuti, periode payroll, ringkasan gaji, PPh 21/BPJS, dan rincian payroll. Skema tersedia; transaksi belum dapat dibuat dari menu ini karena form dan endpoint tulis belum tersedia." },
  internal: { title: "Internal Operations", description: "Pegawai internal, departemen, anggaran, kebijakan, pengeluaran, aset, dan administrasi perusahaan.", status: "Migration 0025 telah diterapkan di Development; menu ini masih read-only dan belum menyediakan form transaksi internal", tables: ["internal_budgets","internal_expense_claims","company_assets","company_asset_events"], next: "Anggaran internal, klaim biaya, register aset perusahaan, penanggung jawab aset, dan riwayat aset. Data menunggu persetujuan migration 0025." },
  documents: { title: "Document Center", description: "Invoice PDF, kontrak, proposal, PO, kuitansi, slip gaji, dokumen audit, dan arsip.", status: "Migration 0025 telah diterapkan di Development; metadata read-only tersedia, tetapi upload/storage dan workflow dokumen belum aktif", tables: ["document_registry","document_versions","document_access_events"], next: "Register dokumen, versi, checksum, klasifikasi, masa retensi, dan audit akses. Penyimpanan file/upload/download memerlukan konfigurasi storage dan workflow terpisah." },
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
  // Match Workspace: make one explicit credentialed Managed Auth token call.
  const response = await fetch(`${AUTH_URL.replace(/\/$/, "")}/token`, { credentials: "include", cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Sesi autentikasi tidak dapat diverifikasi (HTTP ${response.status}).`);
  const data = await response.json() as Record<string, unknown>;
  const nested = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
  const session = data.session && typeof data.session === "object" ? data.session as Record<string, unknown> : {};
  const candidate = [data.token, data.access_token, nested.token, nested.access_token, session.access_token].find(jwt);
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

type OperationalDataset = { key: string; title: string; rows: Array<Record<string, unknown>>; returned: number };
function OperationalDataWorkspace({ domain }: { domain: string }) {
  const [datasets, setDatasets] = useState<OperationalDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await request<{ domain: string; datasets: OperationalDataset[]; readOnly: boolean }>("/v1/platform/erp/operations/" + domain);
      setDatasets(result.datasets ?? []);
      setRefreshedAt(new Date().toLocaleString("id-ID"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data operasional.");
    } finally { setLoading(false); }
  }, [domain]);
  useEffect(() => { void load(); }, [load]);
  const display = (value: unknown) => value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const visibleRows = (rows: Array<Record<string, unknown>>) => rows.filter((row) => !query.trim() || Object.values(row).some((value) => display(value).toLowerCase().includes(query.trim().toLowerCase())));
  const exportCsv = (dataset: OperationalDataset) => {
    const rows = visibleRows(dataset.rows);
    const columns = dataset.rows.length ? Object.keys(dataset.rows[0]!) : [];
    const cell = (value: unknown) => {
      let text = display(value);
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = "\uFEFF" + [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pondok-command-center-${domain}-${dataset.key}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };
  return <section className="enterprise-workspace">
    <div className="enterprise-status"><b>SUMBER DATA LIVE · DEVELOPMENT</b><span>DATA LIVE DEVELOPMENT · READ-ONLY. Halaman ini belum memiliki form transaksi atau tombol perubahan status; hanya menampilkan data yang diizinkan API dan ekspor CSV.</span></div>
    <div className="toolbar"><input aria-label="Cari data domain" placeholder="Cari pada seluruh tabel domain ini…" value={query} onChange={(event) => setQuery(event.target.value)}/><div className="inline-actions"><span className="muted">{refreshedAt ? "Diperbarui " + refreshedAt : ""}</span><button className="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "↻ Muat ulang"}</button></div></div>
    {loading && <div className="panel"><p className="muted">Memuat dataset operasional…</p></div>}
    {error && <div className="alert warning"><b>{error === "domain_schema_not_deployed" ? "Schema belum diterapkan pada Development" : "Data belum dapat dimuat"}</b><div>{error === "domain_schema_not_deployed" ? ((domain === "procurement" || domain === "inventory") ? "Skema domain belum tersedia pada Development. Periksa migration ledger dan deployment API; jangan menyimpulkan data tidak ada hanya dari tabel kosong." : "Skema domain belum tersedia pada Development. Periksa migration ledger dan deployment API; jangan menyimpulkan data tidak ada hanya dari tabel kosong.") : error}</div></div>}
    {!loading && !error && datasets.map((dataset) => {
      const rows = visibleRows(dataset.rows);
      const columns = dataset.rows.length ? Object.keys(dataset.rows[0]!) : [];
      return <section className="panel" key={dataset.key}>
        <div className="panel-title"><div><h2>{dataset.title}</h2><p>{rows.length} dari {dataset.returned} record · maksimum 100 terbaru</p></div>{dataset.rows.length > 0 && <button className="secondary" onClick={() => exportCsv(dataset)}>Ekspor CSV</button>}</div>
        {rows.length === 0 ? <Empty text={query ? "Tidak ada data yang cocok dengan pencarian." : "Belum ada data operasional yang tercatat."}/> : <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div>}
      </section>;
    })}
    {!loading && !error && <p className="muted">Tidak ada tindakan berisiko otomatis. Perubahan transaksi, persetujuan, klaim garansi, remote job, dan pemulihan hanya boleh diaktifkan setelah API, otorisasi, audit, dan persetujuan yang sesuai tersedia.</p>}
  </section>;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [registerName, setRegisterName] = useState("");
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
  async function signUp(event: FormEvent) {
    event.preventDefault(); if (!auth) { setNotice("Konfigurasi Neon Auth tidak tersedia."); return; }
    setAuthBusy(true); setNotice("");
    try {
      const result = await auth.signUp.email({ email: email.trim(), password, name: registerName.trim() });
      if (result.error) throw new Error(result.error.message);
      setPassword(""); setAuthMode("signin");
      setNotice("Akun identitas berhasil didaftarkan jika verifikasi email/Auth mengizinkan. Pendaftaran ini TIDAK memberikan hak Super Administrator. Akses Central Command hanya dapat diberikan secara terpisah oleh pemilik platform.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Pendaftaran gagal."); }
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

  if (!user) return <main className="login-shell"><section className="login-card"><div className="brand-mark">P<span>·</span></div><p className="kicker">PLATFORM CONTROL PLANE</p><h1>Central Command</h1><p className="muted">Aplikasi kendali platform yang terpisah dari Workspace pesantren. Hak Super Administrator tidak pernah diberikan melalui pendaftaran mandiri.</p>{notice && <div className="alert">{notice}</div>}{authMode === "signin" ? <form onSubmit={signIn}><label>Email operator<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primary full" disabled={authBusy}>{authBusy ? "Memverifikasi…" : "Masuk ke Central Command"}</button></form> : <form onSubmit={signUp}><label>Nama lengkap<input value={registerName} onChange={(e) => setRegisterName(e.target.value)} autoComplete="name" required maxLength={120} /></label><label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Kata sandi<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label><button className="primary full" disabled={authBusy || !auth}>{authBusy ? "Mendaftarkan…" : "Daftarkan akun identitas"}</button></form>}<button type="button" className="text-button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setNotice(""); setPassword(""); }}>{authMode === "signin" ? "Belum memiliki akun? Daftar identitas" : "Sudah memiliki akun? Masuk"}</button><small>Setiap sesi wajib diverifikasi oleh API. Akun baru tidak memperoleh hak platform, akses tenant, atau peran Super Administrator secara otomatis. Akses operator memerlukan pemberian hak secara terpisah dan tercatat.</small></section></main>;
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
      {section === "crm" && <CRMWorkspace/>}
      {section === "catalog" && <ProductCatalogWorkspace/>}
      {section === "contracts" && <CommercialWorkspace/>}
      {section === "billing" && <BillingWorkspace/>}
      {section === "accounting" && <AccountingWorkspace/>}
      {Object.prototype.hasOwnProperty.call(enterpriseAreas, section) && section !== "crm" && section !== "catalog" && section !== "contracts" && section !== "billing" && section !== "accounting" && (() => {
        const area = enterpriseAreas[section as EnterpriseArea];
        const liveDomains = ["support","fleet","backup","warranty","reports","agents","procurement","inventory","hrd","internal","documents"];
        return <section className="panel enterprise-workspace">
          <PanelTitle title={area.title} subtitle={area.description}/>
          {liveDomains.includes(section) ? <OperationalDataWorkspace domain={section}/> : <>
            <div className="enterprise-status"><b>STATUS IMPLEMENTASI</b><span>{area.status}</span></div>
            <h3>Fondasi data terkait</h3>
            <div className="enterprise-table-list">{area.tables.map((table) => <code key={table}>{table}</code>)}</div>
            <h3>Ruang lingkup workspace</h3>
            <p className="muted">{area.next}</p>
            <div className="enterprise-notice"><b>Transparansi implementasi</b><p>Workspace transaksi belum diaktifkan karena schema/API untuk domain ini belum tersedia pada Development. Tidak ada data contoh atau status operasional yang direkayasa.</p></div>
          </>}</section>;
      })()}      <footer>© PONDOK OS · Central Command <span>Control plane terpisah · Development</span></footer></div>
    </main>
  </div>;
}

type CrmLead = { id:string; leadNumber:string; organizationName:string; contactName:string; email?:string|null; phone?:string|null; source:string; stage:string; estimatedValue?:number|null; currency:string; nextFollowUpAt?:string|null; createdAt:string };
type CrmCustomer = { id:string; customerCode:string; legalName:string; displayName:string; entityType:string; billingEmail?:string|null; billingPhone?:string|null; status:string; createdAt:string };
type CrmContact = {id:string;customerId:string;fullName:string;positionTitle?:string|null;email?:string|null;phone?:string|null;isPrimary:boolean};

type CatalogProduct={id:string;productCode:string;productName:string;description?:string|null;productType:string;basePrice:string|number;currency:string;billingInterval?:string|null;isActive:boolean;createdAt:string};

type CommercialQuote={id:string;quoteNumber:string;customerId:string;customerName:string;status:string;currency:string;subtotal:string|number;discountTotal:string|number;taxTotal:string|number;grandTotal:string|number;validUntil?:string|null;createdAt:string};
type CommercialContract={id:string;contractNumber:string;customerId:string;customerName:string;quoteId:string;status:string;startsOn?:string|null;endsOn?:string|null;renewalMode:string;createdAt:string};

type BillingInvoice={id:string;invoiceNumber:string;customerId:string;customerName:string;contractId:string;status:string;currency:string;issuedOn?:string|null;dueOn?:string|null;grandTotal:string|number;amountPaid:string|number;journalEntryId?:string|null};
type BillingPayment={id:string;paymentReference:string;customerId:string;customerName:string;invoiceId:string;invoiceNumber?:string|null;amount:string|number;paymentMethod:string;status:string;paidAt?:string|null;journalEntryId?:string|null};
type LedgerAccount={id:string;accountCode:string;accountName:string;accountType:string;normalBalance:string;isControlAccount:boolean;isActive:boolean};
type JournalEntry={id:string;entryNumber:string;entryDate:string;description:string;sourceType:string;status:string;totalDebit:string|number;totalCredit:string|number;lineCount:number};
function BillingWorkspace(){
 const [invoices,setInvoices]=useState<BillingInvoice[]>([]),[payments,setPayments]=useState<BillingPayment[]>([]),[contracts,setContracts]=useState<CommercialContract[]>([]);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [invoiceForm,setInvoiceForm]=useState({contractId:"",dueOn:""}),[paymentForm,setPaymentForm]=useState({invoiceId:"",amount:"",paymentMethod:"bank_transfer",externalReference:""});
 const load=useCallback(async()=>{setBusy(true);setError("");try{
  const [i,p,k]=await Promise.all([request<{items:BillingInvoice[]}>("/v1/platform/erp/invoices"),request<{items:BillingPayment[]}>("/v1/platform/erp/payments"),request<{items:CommercialContract[]}>("/v1/platform/erp/contracts")]);
  setInvoices(i.items??[]);setPayments(p.items??[]);setContracts(k.items??[]);
  const active=(k.items??[]).find(x=>x.status==="active");if(!invoiceForm.contractId&&active)setInvoiceForm(x=>({...x,contractId:active.id}));
  const payable=(i.items??[]).find(x=>["issued","partially_paid","overdue"].includes(x.status)&&Number(x.grandTotal)>Number(x.amountPaid));if(!paymentForm.invoiceId&&payable)setPaymentForm(x=>({...x,invoiceId:payable.id}));
 }catch(e){setError(e instanceof Error?e.message:"Data billing gagal dimuat.");}finally{setBusy(false);}},[invoiceForm.contractId,paymentForm.invoiceId]);
 useEffect(()=>{void load();},[load]);
 async function createInvoice(event:FormEvent){event.preventDefault();setSaving(true);setError("");setNotice("");try{await request<BillingInvoice>("/v1/platform/erp/invoices",{method:"POST",body:JSON.stringify(invoiceForm)});setNotice("Draft invoice berhasil dibuat dari kontrak aktif dan snapshot penawaran.");await load();}catch(e){setError(e instanceof Error?e.message:"Invoice gagal dibuat.");}finally{setSaving(false);}}
 async function issueInvoice(id:string){setSaving(true);setError("");setNotice("");try{await request<{id:string;status:string}>(`/v1/platform/erp/invoices/${id}/issue`,{method:"PATCH"});setNotice("Invoice diterbitkan dan jurnal piutang/pendapatan diposting.");await load();}catch(e){setError(e instanceof Error?e.message:"Invoice gagal diterbitkan. Pastikan Chart of Accounts sudah diinisialisasi.");}finally{setSaving(false);}}
 async function createPayment(event:FormEvent){event.preventDefault();setSaving(true);setError("");setNotice("");try{await request<BillingPayment>("/v1/platform/erp/payments",{method:"POST",body:JSON.stringify({...paymentForm,amount:Number(paymentForm.amount)})});setNotice("Pembayaran tercatat sebagai pending dan menunggu verifikasi.");await load();}catch(e){setError(e instanceof Error?e.message:"Pembayaran gagal dicatat.");}finally{setSaving(false);}}
 async function paymentAction(id:string,action:"verify"|"reject"){setSaving(true);setError("");setNotice("");try{await request<{id:string;status:string}>(`/v1/platform/erp/payments/${id}/${action}`,{method:"PATCH"});setNotice(action==="verify"?"Pembayaran diverifikasi dan jurnal penerimaan diposting.":"Pembayaran ditolak.");await load();}catch(e){setError(e instanceof Error?e.message:"Verifikasi pembayaran gagal. Pemohon tidak boleh memverifikasi pembayaran sendiri.");}finally{setSaving(false);}}
 const money=(v:string|number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v));
 return <div className="crm-workspace"><section className="panel"><PanelTitle title="Billing, Invoice & Pembayaran" subtitle="Tagihan dibuat dari kontrak aktif. Pembayaran berstatus pending sampai diverifikasi oleh petugas lain."/>
  {error&&<div className="alert warning">{error}</div>}{notice&&<div className="alert">{notice}</div>}
  <div className="stat-grid crm-stats">
   <div className="stat-card"><div className="stat-top"><span>Invoice</span><i>▤</i></div><strong>{invoices.length}</strong><small>Total invoice</small></div>
   <div className="stat-card"><div className="stat-top"><span>Piutang terbuka</span><i>Rp</i></div><strong>{money(invoices.filter(x=>["issued","partially_paid","overdue"].includes(x.status)).reduce((s,x)=>s+Number(x.grandTotal)-Number(x.amountPaid),0))}</strong><small>Sisa tagihan</small></div>
   <div className="stat-card"><div className="stat-top"><span>Pembayaran pending</span><i>⌛</i></div><strong>{payments.filter(x=>x.status==="pending").length}</strong><small>Menunggu verifikasi</small></div>
   <div className="stat-card"><div className="stat-top"><span>Pembayaran terverifikasi</span><i>✓</i></div><strong>{payments.filter(x=>x.status==="verified").length}</strong><small>Jurnal penerimaan</small></div>
  </div>
  <div className="crm-forms">
   <form className="panel crm-form" onSubmit={createInvoice}><h3>Buat invoice</h3>
    <label>Kontrak aktif<select required value={invoiceForm.contractId} onChange={e=>setInvoiceForm({...invoiceForm,contractId:e.target.value})}><option value="">Pilih kontrak</option>{contracts.filter(x=>x.status==="active").map(x=><option key={x.id} value={x.id}>{x.contractNumber} · {x.customerName}</option>)}</select></label>
    <label>Jatuh tempo<input type="date" required value={invoiceForm.dueOn} onChange={e=>setInvoiceForm({...invoiceForm,dueOn:e.target.value})}/></label>
    <p className="muted">Baris invoice disalin dari snapshot penawaran yang mendasari kontrak.</p>
    <button className="primary" disabled={saving||!contracts.some(x=>x.status==="active")}>Buat draft invoice</button>
   </form>
   <form className="panel crm-form" onSubmit={createPayment}><h3>Catat pembayaran</h3>
    <label>Invoice<select required value={paymentForm.invoiceId} onChange={e=>setPaymentForm({...paymentForm,invoiceId:e.target.value})}><option value="">Pilih invoice</option>{invoices.filter(x=>["issued","partially_paid","overdue"].includes(x.status)&&Number(x.grandTotal)>Number(x.amountPaid)).map(x=><option key={x.id} value={x.id}>{x.invoiceNumber} · {x.customerName} · sisa {money(Number(x.grandTotal)-Number(x.amountPaid))}</option>)}</select></label>
    <label>Jumlah diterima (IDR)<input type="number" min="0.01" step="0.01" required value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/></label>
    <label>Metode<select value={paymentForm.paymentMethod} onChange={e=>setPaymentForm({...paymentForm,paymentMethod:e.target.value})}><option value="bank_transfer">Transfer bank</option><option value="cash">Tunai</option><option value="payment_gateway">Payment gateway</option><option value="other">Lainnya</option></select></label>
    <label>Referensi eksternal<input maxLength={180} value={paymentForm.externalReference} onChange={e=>setPaymentForm({...paymentForm,externalReference:e.target.value})}/></label>
    <button className="primary" disabled={saving||!invoices.some(x=>["issued","partially_paid","overdue"].includes(x.status))}>Catat pending</button>
   </form>
  </div>
 </section>
 <section className="panel"><PanelTitle title="Daftar invoice" subtitle="Invoice draft belum menjadi piutang sampai diterbitkan dan diposting ke buku besar."/>
  {busy?<div className="empty">Memuat…</div>:invoices.length===0?<Empty text="Belum ada invoice."/>:<div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Pelanggan</th><th>Nilai</th><th>Dibayar</th><th>Jatuh tempo</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{invoices.map(x=><tr key={x.id}><td>{x.invoiceNumber}</td><td>{x.customerName}</td><td>{money(x.grandTotal)}</td><td>{money(x.amountPaid)}</td><td>{x.dueOn?date(x.dueOn):"—"}</td><td><span className="pill neutral">{label(x.status)}</span></td><td>{x.status==="draft"?<button className="primary" disabled={saving} onClick={()=>void issueInvoice(x.id)}>Terbitkan & posting</button>:"—"}</td></tr>)}</tbody></table></div>}
 </section>
 <section className="panel"><PanelTitle title="Penerimaan pembayaran" subtitle="Verifikasi oleh Super Admin yang berbeda dari pencatat pembayaran."/>
  {payments.length===0?<Empty text="Belum ada pembayaran."/>:<div className="table-wrap"><table><thead><tr><th>Referensi</th><th>Invoice</th><th>Pelanggan</th><th>Jumlah</th><th>Metode</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{payments.map(x=><tr key={x.id}><td>{x.paymentReference}</td><td>{x.invoiceNumber||"—"}</td><td>{x.customerName}</td><td>{money(x.amount)}</td><td>{label(x.paymentMethod)}</td><td><span className="pill neutral">{label(x.status)}</span></td><td>{x.status==="pending"?<div className="inline-actions"><button className="primary" disabled={saving} onClick={()=>void paymentAction(x.id,"verify")}>Verifikasi</button><button className="secondary" disabled={saving} onClick={()=>void paymentAction(x.id,"reject")}>Tolak</button></div>:"—"}</td></tr>)}</tbody></table></div>}
 </section><p className="muted">Penerbitan invoice dan verifikasi pembayaran membukukan jurnal double-entry secara atomik. Credit note, refund, rekonsiliasi bank, dan recurring billing belum termasuk tahap ini.</p>
 </div>;
}
function AccountingWorkspace(){
 const [accounts,setAccounts]=useState<LedgerAccount[]>([]),[journals,setJournals]=useState<JournalEntry[]>([]),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{setBusy(true);setError("");try{const [a,j]=await Promise.all([request<{items:LedgerAccount[]}>("/v1/platform/erp/accounts"),request<{items:JournalEntry[]}>("/v1/platform/erp/journals")]);setAccounts(a.items??[]);setJournals(j.items??[]);}catch(e){setError(e instanceof Error?e.message:"Buku besar gagal dimuat.");}finally{setBusy(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function initialize(){setSaving(true);setError("");setNotice("");try{await request<{items:LedgerAccount[]}>("/v1/platform/erp/accounts/initialize-defaults",{method:"POST"});setNotice("Chart of Accounts standar awal berhasil disiapkan.");await load();}catch(e){setError(e instanceof Error?e.message:"Chart of Accounts gagal disiapkan. Periksa konflik kode akun.");}finally{setSaving(false);}}
 const money=(v:string|number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v));
 return <div className="crm-workspace"><section className="panel"><PanelTitle title="Accounting & General Ledger" subtitle="Jurnal double-entry bersifat immutable; koreksi harus menggunakan jurnal reversal."/>
  {error&&<div className="alert warning">{error}</div>}{notice&&<div className="alert">{notice}</div>}
  <div className="toolbar"><span>{accounts.length} akun · {journals.length} jurnal</span><button className="secondary" disabled={busy} onClick={()=>void load()}>Muat ulang</button></div>
  {accounts.length===0&&<div className="alert warning">Chart of Accounts belum disiapkan. Inisialisasi akun standar sebelum menerbitkan invoice.</div>}
  <button className="primary" disabled={saving||accounts.length>0} onClick={()=>void initialize()}>{saving?"Menyiapkan…":"Inisialisasi Chart of Accounts standar"}</button>
 </section>
 <section className="panel"><PanelTitle title="Chart of Accounts" subtitle="Akun kontrol piutang, kas, bank, pajak, dan pendapatan."/>
  {accounts.length===0?<Empty text="Belum ada akun."/>:<div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama akun</th><th>Jenis</th><th>Saldo normal</th><th>Kontrol</th><th>Status</th></tr></thead><tbody>{accounts.map(x=><tr key={x.id}><td>{x.accountCode}</td><td>{x.accountName}</td><td>{label(x.accountType)}</td><td>{label(x.normalBalance)}</td><td>{x.isControlAccount?"Ya":"Tidak"}</td><td>{x.isActive?"Aktif":"Nonaktif"}</td></tr>)}</tbody></table></div>}
 </section>
 <section className="panel"><PanelTitle title="Jurnal umum" subtitle="Jurnal invoice dan penerimaan pembayaran dengan total debit dan kredit seimbang."/>
  {busy?<div className="empty">Memuat…</div>:journals.length===0?<Empty text="Belum ada jurnal yang diposting."/>:<div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Tanggal</th><th>Sumber</th><th>Deskripsi</th><th>Debit</th><th>Kredit</th><th>Baris</th></tr></thead><tbody>{journals.map(x=><tr key={x.id}><td>{x.entryNumber}</td><td>{date(x.entryDate)}</td><td>{label(x.sourceType)}</td><td>{x.description}</td><td>{money(x.totalDebit)}</td><td>{money(x.totalCredit)}</td><td>{x.lineCount}</td></tr>)}</tbody></table></div>}
 </section></div>;
}

function CommercialWorkspace(){
 const [quotes,setQuotes]=useState<CommercialQuote[]>([]),[contracts,setContracts]=useState<CommercialContract[]>([]),[customers,setCustomers]=useState<CrmCustomer[]>([]),[products,setProducts]=useState<CatalogProduct[]>([]);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [quoteForm,setQuoteForm]=useState({customerId:"",productId:"",quantity:"1",unitPrice:"0",discountAmount:"0",taxAmount:"0",validUntil:""});
 const [contractForm,setContractForm]=useState({quoteId:"",startsOn:"",endsOn:"",renewalMode:"manual"});
 const load=useCallback(async()=>{
  setBusy(true);setError("");
  try{
   const [q,k,c,p]=await Promise.all([
    request<{items:CommercialQuote[]}>("/v1/platform/erp/quotes"),
    request<{items:CommercialContract[]}>("/v1/platform/erp/contracts"),
    request<{items:CrmCustomer[]}>("/v1/platform/erp/customers?limit=100"),
    request<{items:CatalogProduct[]}>("/v1/platform/erp/catalog?activeOnly=true")
   ]);
   setQuotes(q.items??[]);setContracts(k.items??[]);setCustomers(c.items??[]);setProducts(p.items??[]);
   const firstCustomer=c.items?.[0];
   if(!quoteForm.customerId&&firstCustomer)setQuoteForm(x=>({...x,customerId:firstCustomer.id}));
   if(!contractForm.quoteId){const approved=(q.items??[]).find(x=>["approved","accepted"].includes(x.status));if(approved)setContractForm(x=>({...x,quoteId:approved.id}));}
  }catch(e){setError(e instanceof Error?e.message:"Data penawaran dan kontrak gagal dimuat.");}
  finally{setBusy(false);}
 },[quoteForm.customerId,contractForm.quoteId]);
 useEffect(()=>{void load();},[load]);
 async function createQuote(event:FormEvent){
  event.preventDefault();setSaving(true);setError("");setNotice("");
  try{
   const product=products.find(x=>x.id===quoteForm.productId);
   await request<CommercialQuote>("/v1/platform/erp/quotes",{method:"POST",body:JSON.stringify({
    customerId:quoteForm.customerId,validUntil:quoteForm.validUntil||null,currency:"IDR",
    lines:[{productId:quoteForm.productId,description:product?.productName??"Produk",quantity:Number(quoteForm.quantity),unitPrice:Number(quoteForm.unitPrice),discountAmount:Number(quoteForm.discountAmount),taxAmount:Number(quoteForm.taxAmount)}]
   })});
   setNotice("Penawaran draft berhasil dibuat.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Penawaran gagal dibuat.");}
  finally{setSaving(false);}
 }
 async function quoteAction(id:string,action:"submit"|"approve"|"reject"){
  setSaving(true);setError("");setNotice("");
  try{await request<{id:string;status:string}>(`/v1/platform/erp/quotes/${id}/${action}`,{method:"PATCH"});setNotice(`Penawaran berhasil diproses: ${action}.`);await load();}
  catch(e){setError(e instanceof Error?e.message:"Perubahan penawaran ditolak.");}
  finally{setSaving(false);}
 }
 async function createContract(event:FormEvent){
  event.preventDefault();setSaving(true);setError("");setNotice("");
  try{await request<CommercialContract>("/v1/platform/erp/contracts",{method:"POST",body:JSON.stringify({
   quoteId:contractForm.quoteId,startsOn:contractForm.startsOn||null,endsOn:contractForm.endsOn||null,renewalMode:contractForm.renewalMode
  })});setNotice("Draft kontrak berhasil dibuat.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Kontrak gagal dibuat.");}
  finally{setSaving(false);}
 }
 async function contractAction(id:string,action:"submit"|"approve"|"reject"){
  setSaving(true);setError("");setNotice("");
  try{await request<{id:string;status:string}>(`/v1/platform/erp/contracts/${id}/${action}`,{method:"PATCH"});setNotice(`Kontrak berhasil diproses: ${action}.`);await load();}
  catch(e){setError(e instanceof Error?e.message:"Perubahan kontrak ditolak.");}
  finally{setSaving(false);}
 }
 const money=(value:string|number,currency="IDR")=>new Intl.NumberFormat("id-ID",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value));
 return <div className="crm-workspace"><section className="panel"><PanelTitle title="Penawaran, Persetujuan & Kontrak" subtitle="Alur komersial berjenjang. Penawaran dan kontrak tidak otomatis menerbitkan tagihan."/>
  {error&&<div className="alert warning">{error}</div>}{notice&&<div className="alert">{notice}</div>}
  <div className="stat-grid crm-stats">
   <div className="stat-card"><div className="stat-top"><span>Penawaran</span><i>▤</i></div><strong>{quotes.length}</strong><small>Total penawaran</small></div>
   <div className="stat-card"><div className="stat-top"><span>Menunggu persetujuan</span><i>⌛</i></div><strong>{quotes.filter(x=>x.status==="submitted").length+contracts.filter(x=>x.status==="review").length}</strong><small>Penawaran dan kontrak</small></div>
   <div className="stat-card"><div className="stat-top"><span>Kontrak aktif</span><i>✓</i></div><strong>{contracts.filter(x=>x.status==="active").length}</strong><small>Kontrak disetujui</small></div>
   <div className="stat-card"><div className="stat-top"><span>Nilai draft & disetujui</span><i>Rp</i></div><strong>{money(quotes.filter(x=>["draft","submitted","approved","accepted"].includes(x.status)).reduce((s,x)=>s+Number(x.grandTotal),0))}</strong><small>Nilai seluruh penawaran</small></div>
  </div>
  <form className="panel crm-form commercial-form" onSubmit={createQuote}><h3>Buat penawaran</h3>
   <label>Pelanggan<select required value={quoteForm.customerId} onChange={e=>setQuoteForm({...quoteForm,customerId:e.target.value})}><option value="">Pilih pelanggan</option>{customers.map(x=><option key={x.id} value={x.id}>{x.displayName} · {x.customerCode}</option>)}</select></label>
   <label>Produk / layanan<select required value={quoteForm.productId} onChange={e=>{const p=products.find(x=>x.id===e.target.value);setQuoteForm({...quoteForm,productId:e.target.value,unitPrice:p?String(Number(p.basePrice)):quoteForm.unitPrice});}}><option value="">Pilih katalog</option>{products.map(x=><option key={x.id} value={x.id}>{x.productName} · {x.productCode}</option>)}</select></label>
   <label>Kuantitas<input type="number" min="0.001" max="1000000" step="0.001" required value={quoteForm.quantity} onChange={e=>setQuoteForm({...quoteForm,quantity:e.target.value})}/></label>
   <label>Harga satuan (IDR)<input type="number" min="0" step="0.01" required value={quoteForm.unitPrice} onChange={e=>setQuoteForm({...quoteForm,unitPrice:e.target.value})}/></label>
   <label>Diskon (IDR)<input type="number" min="0" step="0.01" value={quoteForm.discountAmount} onChange={e=>setQuoteForm({...quoteForm,discountAmount:e.target.value})}/></label>
   <label>Pajak (IDR)<input type="number" min="0" step="0.01" value={quoteForm.taxAmount} onChange={e=>setQuoteForm({...quoteForm,taxAmount:e.target.value})}/></label>
   <label>Berlaku sampai<input type="date" value={quoteForm.validUntil} onChange={e=>setQuoteForm({...quoteForm,validUntil:e.target.value})}/></label>
   <button className="primary" disabled={saving||!customers.length||!products.length}>Buat draft penawaran</button>
   {(!customers.length||!products.length)&&<p className="muted">Tambahkan pelanggan dan katalog produk terlebih dahulu.</p>}
  </form>
 </section>
 <section className="panel"><PanelTitle title="Daftar penawaran" subtitle="Harga tersimpan sebagai snapshot pada setiap baris penawaran."/>
  {busy?<div className="empty">Memuat…</div>:quotes.length===0?<Empty text="Belum ada penawaran."/>:<div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Pelanggan</th><th>Nilai</th><th>Status</th><th>Berlaku</th><th>Aksi</th></tr></thead><tbody>{quotes.map(x=><tr key={x.id}><td>{x.quoteNumber}</td><td>{x.customerName}</td><td>{money(x.grandTotal,x.currency)}</td><td><span className="pill neutral">{label(x.status)}</span></td><td>{x.validUntil?date(x.validUntil):"—"}</td><td>{x.status==="draft"?<button className="secondary" disabled={saving} onClick={()=>void quoteAction(x.id,"submit")}>Ajukan</button>:x.status==="submitted"?<div className="inline-actions"><button className="primary" disabled={saving} onClick={()=>void quoteAction(x.id,"approve")}>Setujui</button><button className="secondary" disabled={saving} onClick={()=>void quoteAction(x.id,"reject")}>Tolak</button></div>: "—"}</td></tr>)}</tbody></table></div>}
 </section>
 <section className="panel"><PanelTitle title="Buat kontrak dari penawaran disetujui" subtitle="Kontrak hanya dapat dibuat dari penawaran berstatus approved atau accepted."/>
  <form className="panel crm-form commercial-form" onSubmit={createContract}>
   <label>Penawaran disetujui<select required value={contractForm.quoteId} onChange={e=>setContractForm({...contractForm,quoteId:e.target.value})}><option value="">Pilih penawaran</option>{quotes.filter(x=>["approved","accepted"].includes(x.status)).map(x=><option key={x.id} value={x.id}>{x.quoteNumber} · {x.customerName} · {money(x.grandTotal,x.currency)}</option>)}</select></label>
   <label>Mulai<input type="date" value={contractForm.startsOn} onChange={e=>setContractForm({...contractForm,startsOn:e.target.value})}/></label>
   <label>Berakhir<input type="date" value={contractForm.endsOn} onChange={e=>setContractForm({...contractForm,endsOn:e.target.value})}/></label>
   <label>Perpanjangan<select value={contractForm.renewalMode} onChange={e=>setContractForm({...contractForm,renewalMode:e.target.value})}><option value="manual">Manual</option><option value="automatic">Otomatis</option><option value="none">Tidak diperpanjang</option></select></label>
   <button className="primary" disabled={saving||!quotes.some(x=>["approved","accepted"].includes(x.status))}>Buat draft kontrak</button>
  </form>
 </section>
 <section className="panel"><PanelTitle title="Kontrak pelanggan" subtitle="Aktivasi membutuhkan persetujuan Super Admin kedua; pemohon tidak dapat menyetujui permintaannya sendiri."/>
  {contracts.length===0?<Empty text="Belum ada kontrak."/>:<div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Pelanggan</th><th>Periode</th><th>Perpanjangan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{contracts.map(x=><tr key={x.id}><td>{x.contractNumber}</td><td>{x.customerName}</td><td>{x.startsOn?date(x.startsOn):"—"} – {x.endsOn?date(x.endsOn):"—"}</td><td>{label(x.renewalMode)}</td><td><span className={`pill ${x.status==="active"?"success":"neutral"}`}>{label(x.status)}</span></td><td>{x.status==="draft"?<button className="secondary" disabled={saving} onClick={()=>void contractAction(x.id,"submit")}>Ajukan aktivasi</button>:x.status==="review"?<div className="inline-actions"><button className="primary" disabled={saving} onClick={()=>void contractAction(x.id,"approve")}>Aktifkan</button><button className="secondary" disabled={saving} onClick={()=>void contractAction(x.id,"reject")}>Tolak</button></div>:"—"}</td></tr>)}</tbody></table></div>}
 </section>
 <p className="muted">Belum ada invoice, penerimaan pembayaran, subscription, atau jurnal otomatis pada tahap ini. Tagihan hanya akan dibuat setelah aturan komersial dan pembayaran disambungkan pada tahap berikutnya.</p>
 </div>;
}

function ProductCatalogWorkspace(){
 const [items,setItems]=useState<CatalogProduct[]>([]),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState({productName:"",description:"",productType:"subscription",basePrice:"0",currency:"IDR",billingInterval:"monthly"});
 const load=useCallback(async()=>{setBusy(true);setError("");try{const result=await request<{items:CatalogProduct[]}>("/v1/platform/erp/catalog");setItems(result.items??[]);}catch(e){setError(e instanceof Error?e.message:"Katalog produk gagal dimuat.");}finally{setBusy(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function create(event:FormEvent){event.preventDefault();setSaving(true);setError("");setNotice("");try{await request<CatalogProduct>("/v1/platform/erp/catalog",{method:"POST",body:JSON.stringify({...form,basePrice:Number(form.basePrice),billingInterval:form.billingInterval||null})});setForm({productName:"",description:"",productType:"subscription",basePrice:"0",currency:"IDR",billingInterval:"monthly"});setNotice("Produk berhasil ditambahkan.");await load();}catch(e){setError(e instanceof Error?e.message:"Produk gagal disimpan.");}finally{setSaving(false);}}
 return <div className="crm-workspace"><section className="panel"><PanelTitle title="Product & Module Catalog" subtitle="Katalog produk dan paket layanan Central Command. Harga baru berlaku untuk penawaran berikutnya; snapshot harga transaksi tidak diubah."/>
 {error&&<div className="alert warning">{error}</div>}{notice&&<div className="alert">{notice}</div>}
 <form className="panel crm-form catalog-form" onSubmit={create}>
  <h3>Tambah produk / layanan</h3>
  <label>Nama produk<input required minLength={2} maxLength={180} value={form.productName} onChange={e=>setForm({...form,productName:e.target.value})}/></label>
  <label>Jenis produk<select value={form.productType} onChange={e=>setForm({...form,productType:e.target.value})}><option value="subscription">Langganan</option><option value="one_time">Sekali bayar</option><option value="service">Jasa</option><option value="module">Modul</option></select></label>
  <label>Harga dasar (IDR)<input type="number" min="0" step="0.01" required value={form.basePrice} onChange={e=>setForm({...form,basePrice:e.target.value})}/></label>
  <label>Periode tagihan<select value={form.billingInterval} onChange={e=>setForm({...form,billingInterval:e.target.value})}><option value="monthly">Bulanan</option><option value="quarterly">Triwulan</option><option value="yearly">Tahunan</option><option value="one_time">Sekali</option></select></label>
  <label>Deskripsi<input maxLength={5000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
  <button className="primary" disabled={saving}>{saving?"Menyimpan…":"Simpan produk"}</button>
 </form>
 </section><section className="panel"><div className="toolbar"><span>{items.length} produk terdaftar</span><button className="secondary" onClick={()=>void load()} disabled={busy}>{busy?"Memuat…":"Muat ulang"}</button></div>
 {busy?<div className="empty">Memuat katalog…</div>:items.length===0?<Empty text="Katalog belum memiliki produk."/>:<div className="table-wrap"><table><thead><tr><th>Kode</th><th>Produk</th><th>Jenis</th><th>Harga dasar</th><th>Periode</th><th>Status</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.productCode}</td><td><b>{x.productName}</b><small>{x.description||"—"}</small></td><td>{label(x.productType)}</td><td>{new Intl.NumberFormat("id-ID",{style:"currency",currency:x.currency||"IDR",maximumFractionDigits:0}).format(Number(x.basePrice))}</td><td>{x.billingInterval?label(x.billingInterval):"—"}</td><td><span className={`pill ${x.isActive?"success":"neutral"}`}>{x.isActive?"Aktif":"Nonaktif"}</span></td></tr>)}</tbody></table></div>}
 </section><p className="muted">Produk katalog belum otomatis ditagihkan. Penjualan modul harus melewati penawaran, persetujuan, kontrak/pesanan, invoice, pembayaran, dan posting akuntansi sesuai hak pelanggan.</p></div>;
}

function CRMWorkspace(){
  const [leads,setLeads]=useState<CrmLead[]>([]);
  const [customers,setCustomers]=useState<CrmCustomer[]>([]);
  const [contacts,setContacts]=useState<CrmContact[]>([]);
  const [selectedCustomerId,setSelectedCustomerId]=useState("");
  const [contactForm,setContactForm]=useState({fullName:"",positionTitle:"",email:"",phone:"",isPrimary:false});
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [stageDrafts,setStageDrafts]=useState<Record<string,string>>({});
  const [lead,setLead]=useState({organizationName:"",contactName:"",email:"",phone:"",source:"manual",stage:"new",estimatedValue:"",notes:""});
  const [customer,setCustomer]=useState({legalName:"",displayName:"",entityType:"institution",billingEmail:"",billingPhone:""});
  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const [leadResult,customerResult]=await Promise.all([
        request<{items:CrmLead[]}>("/v1/platform/erp/leads?limit=50"),
        request<{items:CrmCustomer[]}>("/v1/platform/erp/customers?limit=50")
      ]);
      setLeads(leadResult.items??[]);setCustomers(customerResult.items??[]);
      if(!selectedCustomerId&&customerResult.items?.[0])setSelectedCustomerId(customerResult.items[0].id);
    }catch(e){setError(e instanceof Error?e.message:"Data CRM gagal dimuat.");}
    finally{setBusy(false);}
  },[selectedCustomerId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!selectedCustomerId){setContacts([]);return;}let active=true;void request<{items:CrmContact[]}>(`/v1/platform/erp/customers/${selectedCustomerId}/contacts`).then(x=>{if(active)setContacts(x.items??[]);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Kontak pelanggan gagal dimuat.");});return()=>{active=false;};},[selectedCustomerId]);
  async function createLead(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");setNotice("");
    try{
      await request<CrmLead>("/v1/platform/erp/leads",{method:"POST",body:JSON.stringify({
        organizationName:lead.organizationName,contactName:lead.contactName,
        ...(lead.email?{email:lead.email}:{}),...(lead.phone?{phone:lead.phone}:{}),
        source:lead.source,stage:lead.stage,
        ...(lead.estimatedValue?{estimatedValue:Number(lead.estimatedValue)}:{}),
        ...(lead.notes?{notes:lead.notes}:{})
      })});
      setLead({organizationName:"",contactName:"",email:"",phone:"",source:"manual",stage:"new",estimatedValue:"",notes:""});
      setNotice("Prospek berhasil disimpan.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Prospek gagal disimpan.");}
    finally{setSaving(false);}
  }

  async function updateLeadStage(item:CrmLead){
    const stage=stageDrafts[item.id]??item.stage;
    if(stage===item.stage)return;
    setSaving(true);setError("");setNotice("");
    try{
      await request<CrmLead>(`/v1/platform/erp/leads/${item.id}`,{method:"PATCH",body:JSON.stringify({stage})});
      setStageDrafts(current=>{const next={...current};delete next[item.id];return next;});
      setNotice(`Tahap prospek ${item.leadNumber} diperbarui menjadi ${label(stage)}.`);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Tahap prospek gagal diperbarui.");}
    finally{setSaving(false);}
  }

  async function createContact(event:FormEvent){
    event.preventDefault();if(!selectedCustomerId)return;setSaving(true);setError("");setNotice("");
    try{
      await request<CrmContact>(`/v1/platform/erp/customers/${selectedCustomerId}/contacts`,{method:"POST",body:JSON.stringify({
        fullName:contactForm.fullName,positionTitle:contactForm.positionTitle||null,
        email:contactForm.email||null,phone:contactForm.phone||null,isPrimary:contactForm.isPrimary
      })});
      setContactForm({fullName:"",positionTitle:"",email:"",phone:"",isPrimary:false});
      const result=await request<{items:CrmContact[]}>(`/v1/platform/erp/customers/${selectedCustomerId}/contacts`);
      setContacts(result.items??[]);setNotice("Kontak pelanggan berhasil disimpan.");
    }catch(e){setError(e instanceof Error?e.message:"Kontak gagal disimpan.");}
    finally{setSaving(false);}
  }
  async function createCustomer(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");setNotice("");
    try{
      await request<CrmCustomer>("/v1/platform/erp/customers",{method:"POST",body:JSON.stringify({
        legalName:customer.legalName,displayName:customer.displayName,entityType:customer.entityType,
        ...(customer.billingEmail?{billingEmail:customer.billingEmail}:{}),
        ...(customer.billingPhone?{billingPhone:customer.billingPhone}:{})
      })});
      setCustomer({legalName:"",displayName:"",entityType:"institution",billingEmail:"",billingPhone:""});
      setNotice("Data pelanggan berhasil disimpan.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Pelanggan gagal disimpan.");}
    finally{setSaving(false);}
  }
  const visibleLeads=leads.filter(x=>`${x.organizationName} ${x.contactName} ${x.email??""} ${x.leadNumber}`.toLowerCase().includes(query.toLowerCase()));
  const visibleCustomers=customers.filter(x=>`${x.legalName} ${x.displayName} ${x.customerCode}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="crm-workspace">
    <section className="panel">
      <PanelTitle title="CRM & Customer Management" subtitle="Data prospek dan pelanggan tersimpan pada Neon Development melalui API Super Admin."/>
      {error&&<div className="alert warning">{error}</div>}{notice&&<div className="alert">{notice}</div>}
      <div className="stat-grid crm-stats">
        <div className="stat-card"><div className="stat-top"><span>Total prospek</span><i>◎</i></div><strong>{leads.length}</strong><small>Prospek tersimpan</small></div>
        <div className="stat-card"><div className="stat-top"><span>Total pelanggan</span><i>◈</i></div><strong>{customers.length}</strong><small>Data pelanggan tersimpan</small></div>
        <div className="stat-card"><div className="stat-top"><span>Prospek aktif</span><i>↗</i></div><strong>{leads.filter(x=>!["won","lost"].includes(x.stage)).length}</strong><small>Belum ditutup</small></div>
        <div className="stat-card"><div className="stat-top"><span>Pelanggan aktif</span><i>✓</i></div><strong>{customers.filter(x=>x.status==="active").length}</strong><small>Status aktif</small></div>
      </div>
      <div className="crm-forms">
        <form className="panel crm-form" onSubmit={createLead}>
          <h3>Tambah prospek</h3>
          <label>Nama lembaga / organisasi<input required minLength={2} maxLength={180} value={lead.organizationName} onChange={e=>setLead({...lead,organizationName:e.target.value})}/></label>
          <label>Nama kontak<input required minLength={2} maxLength={160} value={lead.contactName} onChange={e=>setLead({...lead,contactName:e.target.value})}/></label>
          <label>Email<input type="email" value={lead.email} onChange={e=>setLead({...lead,email:e.target.value})}/></label>
          <label>Telepon<input value={lead.phone} onChange={e=>setLead({...lead,phone:e.target.value})}/></label>
          <label>Sumber prospek<select value={lead.source} onChange={e=>setLead({...lead,source:e.target.value})}><option value="manual">Manual</option><option value="referral">Referensi</option><option value="website">Website</option><option value="event">Acara</option><option value="campaign">Kampanye</option></select></label>
          <label>Tahap pipeline<select value={lead.stage} onChange={e=>setLead({...lead,stage:e.target.value})}>{["new","qualified","discovery","demo","proposal","negotiation","won","lost","dormant"].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
          <label>Estimasi nilai (IDR)<input type="number" min="0" step="1000" value={lead.estimatedValue} onChange={e=>setLead({...lead,estimatedValue:e.target.value})}/></label>
          <label>Catatan<textarea maxLength={5000} value={lead.notes} onChange={e=>setLead({...lead,notes:e.target.value})}/></label>
          <button className="primary" disabled={saving}>Simpan prospek</button>
        </form>
        <form className="panel crm-form" onSubmit={createCustomer}>
          <h3>Tambah pelanggan</h3>
          <label>Nama legal yayasan / badan<input required minLength={2} maxLength={220} value={customer.legalName} onChange={e=>setCustomer({...customer,legalName:e.target.value})}/></label>
          <label>Nama tampilan lembaga<input required minLength={2} maxLength={180} value={customer.displayName} onChange={e=>setCustomer({...customer,displayName:e.target.value})}/></label>
          <label>Jenis entitas<select value={customer.entityType} onChange={e=>setCustomer({...customer,entityType:e.target.value})}><option value="institution">Lembaga</option><option value="foundation">Yayasan</option><option value="company">Perusahaan</option><option value="government">Pemerintah</option><option value="individual">Perorangan</option><option value="other">Lainnya</option></select></label>
          <label>Email penagihan<input type="email" value={customer.billingEmail} onChange={e=>setCustomer({...customer,billingEmail:e.target.value})}/></label>
          <label>Telepon penagihan<input value={customer.billingPhone} onChange={e=>setCustomer({...customer,billingPhone:e.target.value})}/></label>
          <p className="muted">Pelanggan baru dibuat sebagai prospek. Aktivasi layanan, kontrak, lisensi, dan penagihan tetap melalui persetujuan serta alur komersial tersendiri.</p>
          <button className="primary" disabled={saving}>Simpan pelanggan</button>
        </form>
      </div>
      <div className="toolbar crm-toolbar"><input placeholder="Cari prospek atau pelanggan…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="secondary" onClick={()=>void load()} disabled={busy}>{busy?"Memuat…":"Muat ulang"}</button></div>
    </section>
    <section className="panel"><PanelTitle title="Pipeline prospek" subtitle="Data aktual dari platform.crm_leads"/>{busy?<div className="empty">Memuat data…</div>:visibleLeads.length===0?<Empty text="Belum ada prospek yang cocok."/>:<div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Organisasi</th><th>Kontak</th><th>Tahap</th><th>Estimasi</th><th>Dibuat</th></tr></thead><tbody>{visibleLeads.map(x=><tr key={x.id}><td>{x.leadNumber}</td><td><b>{x.organizationName}</b><small>{x.email||"—"}</small></td><td>{x.contactName}<small>{x.phone||"—"}</small></td><td><div className="inline-actions"><select aria-label={`Tahap prospek ${x.leadNumber}`} value={stageDrafts[x.id]??x.stage} onChange={e=>setStageDrafts(current=>({...current,[x.id]:e.target.value}))}>{["new","qualified","discovery","demo","proposal","negotiation","won","lost","dormant"].map(stage=><option key={stage} value={stage}>{label(stage)}</option>)}</select>{(stageDrafts[x.id]??x.stage)!==x.stage&&<button className="primary" disabled={saving} onClick={()=>void updateLeadStage(x)}>Simpan</button>}</div></td><td>{x.estimatedValue==null?"—":new Intl.NumberFormat("id-ID",{style:"currency",currency:x.currency||"IDR",maximumFractionDigits:0}).format(x.estimatedValue)}</td><td>{date(x.createdAt)}{x.nextFollowUpAt&&<small>Follow-up: {date(x.nextFollowUpAt)}</small>}</td></tr>)}</tbody></table></div>}</section>
    <section className="panel"><PanelTitle title="Daftar pelanggan" subtitle="Data aktual dari platform.customers"/>{busy?<div className="empty">Memuat data…</div>:visibleCustomers.length===0?<Empty text="Belum ada pelanggan yang cocok."/>:<div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama legal</th><th>Nama tampilan</th><th>Jenis</th><th>Status</th><th>Dibuat</th></tr></thead><tbody>{visibleCustomers.map(x=><tr key={x.id}><td>{x.customerCode}</td><td>{x.legalName}</td><td><b>{x.displayName}</b><small>{x.billingEmail||"—"}</small></td><td>{label(x.entityType)}</td><td><span className={`pill ${x.status==="active"?"success":"neutral"}`}>{label(x.status)}</span></td><td>{date(x.createdAt)}</td></tr>)}</tbody></table></div>}</section>

    <section className="panel"><PanelTitle title="Kontak & Customer 360" subtitle="Kontak resmi pelanggan, penanggung jawab, dan kanal komunikasi."/>
      <div className="crm-contact-toolbar"><label>Pilih pelanggan<select value={selectedCustomerId} onChange={e=>setSelectedCustomerId(e.target.value)}><option value="">Pilih pelanggan</option>{customers.map(x=><option key={x.id} value={x.id}>{x.displayName} · {x.customerCode}</option>)}</select></label></div>
      {selectedCustomerId&&<form className="crm-contact-form" onSubmit={createContact}>
        <label>Nama kontak<input required minLength={2} maxLength={160} value={contactForm.fullName} onChange={e=>setContactForm({...contactForm,fullName:e.target.value})}/></label>
        <label>Jabatan<input maxLength={120} value={contactForm.positionTitle} onChange={e=>setContactForm({...contactForm,positionTitle:e.target.value})}/></label>
        <label>Email<input type="email" value={contactForm.email} onChange={e=>setContactForm({...contactForm,email:e.target.value})}/></label>
        <label>Telepon<input value={contactForm.phone} onChange={e=>setContactForm({...contactForm,phone:e.target.value})}/></label>
        <label className="crm-primary-check"><input type="checkbox" checked={contactForm.isPrimary} onChange={e=>setContactForm({...contactForm,isPrimary:e.target.checked})}/>Kontak utama</label>
        <button className="primary" disabled={saving}>Tambah kontak</button>
      </form>}
      {!selectedCustomerId?<Empty text="Tambahkan pelanggan terlebih dahulu untuk mengelola kontak."/>:contacts.length===0?<Empty text="Belum ada kontak untuk pelanggan ini."/>:<div className="table-wrap"><table><thead><tr><th>Nama</th><th>Jabatan</th><th>Email</th><th>Telepon</th><th>Jenis</th></tr></thead><tbody>{contacts.map(x=><tr key={x.id}><td><b>{x.fullName}</b></td><td>{x.positionTitle||"—"}</td><td>{x.email||"—"}</td><td>{x.phone||"—"}</td><td>{x.isPrimary?<span className="pill success">Utama</span>:<span className="pill neutral">Kontak</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="muted">Pipeline mendukung perubahan tahap yang diaudit di API. Penawaran, persetujuan komersial, kontrak, invoice, pembayaran, dan jurnal tersedia pada workspace masing-masing; histori komunikasi terperinci masih menjadi pengembangan terpisah.</p>
  </div>;
}

function Stat({title,value,detail,icon}:{title:string;value:number;detail:string;icon:string}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function TenantTable({rows}:{rows:Tenant[]}){return <div className="table-wrap"><table><thead><tr><th>Nama lembaga</th><th>Jenis</th><th>Anggota</th><th>Status</th><th>Lisensi</th><th>Dibuat</th></tr></thead><tbody>{rows.map((x)=><tr key={x.organizationId}><td><b>{x.name}</b><small>{x.slug}</small></td><td>{label(x.organizationType)}</td><td>{x.memberCount}</td><td><span className={`pill ${x.status === "active" ? "success" : "neutral"}`}>{label(x.status)}</span></td><td>{x.planCode || "Belum ada"}<small>{x.licenseStatus ? label(x.licenseStatus) : "Tanpa lisensi"}</small></td><td>{date(x.createdAt)}</td></tr>)}</tbody></table></div>}
function Security({title,desc}:{title:string;desc:string}){return <div className="security-item"><span>✓</span><div><b>{title}</b><p>{desc}</p></div></div>}
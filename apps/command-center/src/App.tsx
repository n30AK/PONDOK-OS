import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createAuthClient } from "@neondatabase/auth";

type User = { id: string; email?: string; name?: string };
type Tenant = { organizationId: string; name: string; slug: string; organizationType: string; status: string; createdAt: string; memberCount: number; planCode?: string | null; licenseStatus?: string | null; licenseEndsAt?: string | null };
type Activation = { id: string; contactEmail: string; contactName: string; organizationName: string; organizationSlug: string; organizationType: string; campusCode: string; campusName: string; status: string; createdAt: string; reviewNote?: string | null };
type ModuleRequest = { id: string; organizationId: string; moduleId: string; moduleVersion: string; status: string; createdAt: string; updatedAt: string };
type Publisher = { userId: string; email?: string; status?: string; createdAt?: string };
type AuditEvent = { id: string; actorUserId: string; action: string; resourceType: string; resourceId?: string | null; metadata: Record<string, unknown>; occurredAt: string };
type Section = "overview" | "institutions" | "activation" | "modules" | "publishers" | "security";
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
  const access = await token();
  const response = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${access}`, ...init.headers }, cache: "no-store" });
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
  async function bootstrap(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(`Konfirmasi pembuatan lembaga resmi “${org.organizationName}”? Tindakan ini membuat organisasi, kampus, dan membership pada database Development.`)) return;
    try { const result = await request<{ organizationId: string }>("/v1/platform/admin/bootstrap-first-tenant", { method: "POST", body: JSON.stringify(org) }); setNotice(`Lembaga berhasil dibuat: ${result.organizationId}`); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Inisialisasi gagal."); }
  }

  if (!user) return <main className="login-shell"><section className="login-card"><div className="brand-mark">P<span>·</span></div><p className="kicker">PLATFORM CONTROL PLANE</p><h1>Central Command</h1><p className="muted">Ruang kendali khusus Super Administrator PONDOK OS. Terpisah dari workspace operasional pesantren.</p>{notice && <div className="alert">{notice}</div>}<form onSubmit={signIn}><label>Email administrator<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primary full" disabled={authBusy}>{authBusy ? "Memverifikasi…" : "Masuk ke Command Center"}</button></form><small>Hak Super Admin diverifikasi ulang oleh API pada setiap sesi. Tidak ada pendaftaran mandiri.</small></section></main>;
  if (!verified) return <main className="login-shell"><section className="login-card"><div className="spinner" /><h2>Memverifikasi hak administrator</h2><p className="muted">{notice || "Memeriksa sesi dan otorisasi melalui server…"}</p><button className="secondary" onClick={() => void signOut()}>Keluar</button></section></main>;

  const nav: { id: Section; name: string; icon: string }[] = [
    { id: "overview", name: "Ringkasan", icon: "◫" }, { id: "institutions", name: "Registry lembaga", icon: "▦" },
    { id: "activation", name: "Aktivasi & persetujuan", icon: "◎" }, { id: "modules", name: "Ekosistem modul", icon: "◇" },
    { id: "publishers", name: "Publisher & integrasi", icon: "⌘" }, { id: "security", name: "Keamanan & audit", icon: "⬡" },
  ];
  return <div className="app-shell">
    <aside className="sidebar"><div className="side-brand"><div className="brand-mark">P<span>·</span></div><div><b>PONDOK OS</b><small>CENTRAL COMMAND</small></div></div><div className="environment"><i /> DEVELOPMENT CONTROL PLANE</div><nav>{nav.map((item) => <button key={item.id} className={section === item.id ? "nav-item active" : "nav-item"} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.name}{item.id === "activation" && pending > 0 && <em>{pending}</em>}</button>)}</nav><div className="side-bottom"><div className="user-chip"><div className="avatar">{(user.name || user.email || "S").slice(0,1).toUpperCase()}</div><div><b>{user.name || "Super Administrator"}</b><small>{user.email}</small></div></div><button className="logout" onClick={() => void signOut()}>↗ Keluar aman</button></div></aside>
    <main className="main-area"><header className="topbar"><div><span className="crumb">PLATFORM /</span> {label(section)}</div><div className="top-actions"><span className="secure"><i /> SESSION VERIFIED</span><button className="icon-button" onClick={() => void load()} disabled={loading} title="Muat ulang">↻</button></div></header>
      <div className="content"><div className="page-heading"><div><p className="kicker">PONDOK OS · SUPER ADMINISTRATOR</p><h1>{section === "overview" ? "Command Center" : nav.find((x) => x.id === section)?.name}</h1><p className="muted">Kontrol terpusat platform, lembaga, lisensi, dan tata kelola.</p></div><button className="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "↻ Sinkronkan data"}</button></div>
      {notice && <div className="alert">{notice}</div>}{errors.length > 0 && <div className="alert warning"><b>Beberapa sumber data belum tersedia</b>{errors.map((x) => <div key={x}>{x}</div>)}</div>}{issuedToken && <div className="token-panel"><b>Token aktivasi — tampil satu kali</b><code>{issuedToken}</code><button className="secondary" onClick={() => void navigator.clipboard.writeText(issuedToken)}>Salin token</button></div>}
      {section === "overview" && <><div className="stat-grid"><Stat title="Total lembaga" value={tenants.length} detail="Terdaftar pada platform" icon="▦"/><Stat title="Lembaga aktif" value={activeTenants} detail="Status aktif" icon="◈"/><Stat title="Menunggu persetujuan" value={pending} detail="Permohonan aktivasi" icon="◎"/><Stat title="Permintaan modul" value={modules.length} detail="Registry ekosistem" icon="◇"/></div><div className="two-col"><section className="panel"><PanelTitle title="Aktivitas yang memerlukan tindakan" subtitle="Antrian prioritas administrator"/>{activations.filter((x) => x.status === "pending").slice(0,5).map((x) => <div className="activity" key={x.id}><div className="activity-icon">◎</div><div className="activity-copy"><b>{x.organizationName}</b><small>{x.contactName} · {date(x.createdAt)}</small></div><span className="pill warning">Pending</span></div>)}{pending === 0 && <Empty text="Tidak ada permohonan menunggu."/>}<button className="text-button" onClick={() => setSection("activation")}>Buka seluruh permohonan →</button></section><section className="panel"><PanelTitle title="Kesehatan kontrol plane" subtitle="Status koneksi dan akses"/><div className="health-row"><span>Neon Auth session</span><b className="ok">Terverifikasi</b></div><div className="health-row"><span>Super Admin authorization</span><b className="ok">Aktif</b></div><div className="health-row"><span>API platform registry</span><b className={errors.some((x) => x.includes("Registry")) ? "bad" : "ok"}>{errors.some((x) => x.includes("Registry")) ? "Perlu pemeriksaan" : "Terhubung"}</b></div><div className="health-row"><span>Database target</span><b className="dev">Development</b></div><div className="health-note">Semua operasi platform menggunakan endpoint terproteksi dan scope database server-side.</div></section></div><section className="panel"><PanelTitle title="Lembaga terbaru" subtitle="Registry global platform"/><TenantTable rows={tenants.slice(0,5)}/><button className="text-button" onClick={() => setSection("institutions")}>Lihat seluruh lembaga →</button></section></>}
      {section === "institutions" && <section className="panel"><PanelTitle title="Registry lembaga" subtitle="Daftar organisasi lintas tenant; data dibatasi oleh kontrol plane"/><div className="toolbar"><input placeholder="Cari nama, slug, tipe lembaga…" value={search} onChange={(e) => setSearch(e.target.value)}/><span>{filteredTenants.length} lembaga</span></div><TenantTable rows={filteredTenants}/>{tenants.length === 0 && <Empty text="Belum ada lembaga terdaftar. Inisialisasi hanya dilakukan setelah data lembaga sebenarnya tersedia."/>}</section>}
      {section === "activation" && <section className="panel"><PanelTitle title="Permohonan aktivasi" subtitle="Tinjau identitas pemohon dan data lembaga sebelum memberi persetujuan"/><div className="table-wrap"><table><thead><tr><th>Lembaga / pemohon</th><th>Jenis & kampus</th><th>Diajukan</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{activations.map((x) => <tr key={x.id}><td><b>{x.organizationName}</b><small>{x.contactName} · {x.contactEmail}</small><small>{x.organizationSlug}</small></td><td>{label(x.organizationType)}<small>{x.campusCode} · {x.campusName}</small></td><td>{date(x.createdAt)}</td><td><span className={`pill ${x.status === "pending" ? "warning" : "neutral"}`}>{label(x.status)}</span></td><td>{x.status === "pending" ? <div className="actions"><button className="mini primary" onClick={() => void approve(x.id)}>Setujui</button><button className="mini danger" onClick={() => void reject(x.id)}>Tolak</button></div> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>{activations.length === 0 && <Empty text="Belum ada permohonan aktivasi."/>}</section>}
      {section === "modules" && <section className="panel"><PanelTitle title="Ekosistem & permintaan modul" subtitle="Pantau usulan modul dan status siklus persetujuan"/><div className="table-wrap"><table><thead><tr><th>Modul</th><th>Versi</th><th>Organisasi</th><th>Status</th><th>Diperbarui</th></tr></thead><tbody>{modules.map((x) => <tr key={x.id}><td><b>{x.moduleId}</b><small>{x.id}</small></td><td>{x.moduleVersion}</td><td className="mono">{x.organizationId}</td><td><span className="pill neutral">{label(x.status)}</span></td><td>{date(x.updatedAt || x.createdAt)}</td></tr>)}</tbody></table></div>{modules.length === 0 && <Empty text="Belum ada permintaan modul atau registry belum memiliki data."/>}</section>}
      {section === "publishers" && <section className="panel"><PanelTitle title="Publisher & integrasi" subtitle="Akun yang diberi kewenangan mengajukan modul"/><div className="table-wrap"><table><thead><tr><th>User ID</th><th>Email</th><th>Status</th><th>Dibuat</th></tr></thead><tbody>{publishers.map((x) => <tr key={x.userId}><td className="mono">{x.userId}</td><td>{x.email || "—"}</td><td><span className="pill neutral">{label(x.status || "active")}</span></td><td>{date(x.createdAt)}</td></tr>)}</tbody></table></div>{publishers.length === 0 && <Empty text="Belum ada publisher terdaftar."/>}</section>}
      {section === "security" && <><section className="panel"><PanelTitle title="Keamanan & tata kelola" subtitle="Kontrol keamanan yang aktif pada sesi ini"/><div className="security-grid"><Security title="Server-side authorization" desc="Setiap endpoint platform memverifikasi status Super Admin aktif."/><Security title="Tenant isolation" desc="Operasi tenant tetap dibatasi oleh membership dan row-level security."/><Security title="Session handling" desc="JWT dikirim melalui header Authorization; token tidak disimpan di localStorage."/><Security title="Audit trail" desc="Persetujuan aktivasi dan bootstrap lembaga dicatat pada platform audit events."/><Security title="Environment boundary" desc="Command Center terhubung ke Development API; tidak mengakses Production."/><Security title="Least privilege" desc="Akun non-Super Admin ditolak oleh API meskipun membuka URL Command Center." /></div></section><section className="panel"><PanelTitle title="Log audit platform" subtitle="100 peristiwa terbaru yang tercatat di control plane"/><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Resource</th><th>ID resource</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td>{date(event.occurredAt)}</td><td className="mono">{event.actorUserId}</td><td><b>{event.action}</b></td><td>{event.resourceType}</td><td className="mono">{event.resourceId || "—"}</td></tr>)}</tbody></table></div>{auditEvents.length === 0 && <Empty text="Belum ada peristiwa audit pada platform."/>}</section><section className="panel"><PanelTitle title="Inisialisasi lembaga pertama" subtitle="Hanya digunakan bila lembaga resmi pertama memang akan didaftarkan"/><p className="muted">Formulir ini membuat organisasi, kampus utama, membership, dan role pemilik institusi. Tidak ada data contoh yang dibuat otomatis.</p><form className="org-form" onSubmit={bootstrap}><label>Nama penanggung jawab<input required minLength={2} maxLength={120} value={org.contactName} onChange={(e) => setOrg({...org, contactName:e.target.value})}/></label><label>Nama lembaga resmi<input required minLength={3} maxLength={180} value={org.organizationName} onChange={(e) => setOrg({...org, organizationName:e.target.value})}/></label><label>Slug lembaga<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={org.organizationSlug} onChange={(e) => setOrg({...org, organizationSlug:e.target.value})}/></label><label>Jenis lembaga<select value={org.organizationType} onChange={(e) => setOrg({...org, organizationType:e.target.value})}><option value="pesantren">Pesantren</option><option value="madrasah">Madrasah</option><option value="sekolah">Sekolah</option><option value="yayasan">Yayasan</option><option value="other">Lainnya</option></select></label><label>Kode kampus<input required pattern="[A-Z0-9_-]{2,24}" value={org.campusCode} onChange={(e) => setOrg({...org, campusCode:e.target.value.toUpperCase()})}/></label><label>Nama kampus utama<input required minLength={2} value={org.campusName} onChange={(e) => setOrg({...org, campusName:e.target.value})}/></label><button className="primary" type="submit" disabled={tenants.length > 0}>Buat lembaga pertama</button>{tenants.length > 0 && <small>Inisialisasi pertama terkunci karena sudah ada lembaga.</small>}</form></section></>}
      <footer>© PONDOK OS · Central Command <span>Control plane terpisah · Development</span></footer></div>
    </main>
  </div>;
}
function Stat({title,value,detail,icon}:{title:string;value:number;detail:string;icon:string}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function TenantTable({rows}:{rows:Tenant[]}){return <div className="table-wrap"><table><thead><tr><th>Nama lembaga</th><th>Jenis</th><th>Anggota</th><th>Status</th><th>Lisensi</th><th>Dibuat</th></tr></thead><tbody>{rows.map((x)=><tr key={x.organizationId}><td><b>{x.name}</b><small>{x.slug}</small></td><td>{label(x.organizationType)}</td><td>{x.memberCount}</td><td><span className={`pill ${x.status === "active" ? "success" : "neutral"}`}>{label(x.status)}</span></td><td>{x.planCode || "Belum ada"}<small>{x.licenseStatus ? label(x.licenseStatus) : "Tanpa lisensi"}</small></td><td>{date(x.createdAt)}</td></tr>)}</tbody></table></div>}
function Security({title,desc}:{title:string;desc:string}){return <div className="security-item"><span>✓</span><div><b>{title}</b><p>{desc}</p></div></div>}
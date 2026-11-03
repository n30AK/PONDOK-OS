import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { authClient, getAccessToken, getCurrentUser, type PondokUser } from "./auth";
import Operations from "./Operations";

type Tenant = { organizationId: string; membershipId: string; roles: string[]; permissions: string[] };
type Student = {
  id: string; campusId: string; studentNumber: string; legalName: string;
  preferredName?: string | null; birthDate?: string | null; genderCode?: string | null;
  status: string; createdAt: string; profileData?: Record<string, string> | null;
};
type Screen = "overview" | "students" | "modules" | "operations";

const modules = [
  { key: "academic", name: "Akademik", desc: "Tahun ajaran, kelas, mapel, jadwal, nilai", icon: "▦", status: "Fondasi" },
  { key: "admissions", name: "PPDB", desc: "Pendaftaran, seleksi, dokumen, daftar ulang", icon: "✳", status: "Fondasi" },
  { key: "finance", name: "Keuangan & Akuntansi", desc: "Kas, jurnal, anggaran, laporan, tutup buku", icon: "◈", status: "API" },
  { key: "inventory", name: "Inventaris & Pengadaan", desc: "Barang, gudang, mutasi, pengadaan", icon: "▤", status: "API" },
  { key: "library", name: "Perpustakaan", desc: "Katalog, eksemplar, peminjaman", icon: "▥", status: "Fondasi" },
  { key: "hr", name: "SDM & Payroll", desc: "Pegawai, kontrak, presensi, penggajian", icon: "♙", status: "API" },
  { key: "cms", name: "Website & Pengumuman", desc: "Halaman publik, berita, pengumuman", icon: "▣", status: "Fondasi" },
  { key: "boarding", name: "Asrama & Kesantrian", desc: "Kamar, perizinan, pelanggaran, pembinaan", icon: "⌂", status: "Direncanakan" },
  { key: "crm", name: "CRM & Alumni", desc: "Wali santri, komunikasi, alumni, donatur", icon: "◎", status: "Direncanakan" },
  { key: "control", name: "Control Center", desc: "Lisensi, instalasi, tenant, dukungan", icon: "⌘", status: "Direncanakan" }
];

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function apiRequest<T>(path: string, organizationId: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-organization-id": organizationId,
      ...init.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Permintaan gagal (${response.status})`);
  return body as T;
}

export default function App() {
  const [user, setUser] = useState<PondokUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [organizationId, setOrganizationId] = useState(() => localStorage.getItem("pondok.organizationId") ?? "");
  const [screen, setScreen] = useState<Screen>("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstSetup, setFirstSetup] = useState(false);
  const [existingAdminAccount, setExistingAdminAccount] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [firstCampusCode, setFirstCampusCode] = useState("UTAMA");
  const [firstCampusName, setFirstCampusName] = useState("Kampus Utama");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [studentNumber, setStudentNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [campusId, setCampusId] = useState(() => "");
  const [birthDate, setBirthDate] = useState("");
  const [genderCode, setGenderCode] = useState("unspecified");

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((current) => { if (active) setUser(current); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Gagal memulihkan sesi."); });
    return () => { active = false; };
  }, []);

  const loadStudents = useCallback(async (orgId: string) => {
    const result = await apiRequest<{ data: Student[] }>("/v1/academic/students?limit=100", orgId);
    setStudents(result.data);
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      const current = await getCurrentUser();
      setUser(current);
      setNotice("Berhasil masuk. Pilih organisasi untuk membuka workspace.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally { setBusy(false); }
  };

  const bootstrapFirstOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!existingAdminAccount) {
        const signup = await authClient.signUp.email({ email, password, name: adminName.trim() });
        if (signup.error) throw new Error(signup.error.message);
      }
      const signin = await authClient.signIn.email({ email, password });
      if (signin.error) throw new Error(signin.error.message);
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE}/v1/bootstrap/organization`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-bootstrap-token": bootstrapToken
        },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          slug: organizationSlug.trim().toLowerCase(),
          campusCode: firstCampusCode.trim().toUpperCase(),
          campusName: firstCampusName.trim()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? `Inisialisasi gagal (${response.status})`);
      const orgId = result.data.organizationId as string;
      const firstCampusId = result.data.campusId as string;
      localStorage.setItem("pondok.organizationId", orgId);
      localStorage.setItem(`pondok.campusId.${orgId}`, firstCampusId);
      setCampusId(firstCampusId);
      setOrganizationId(orgId);
      setUser(await getCurrentUser());
      const context = await apiRequest<Tenant>("/v1/tenant/context", orgId);
      setTenant(context);
      setFirstSetup(false);
      setNotice("Pesantren berhasil diinisialisasi. Akun ini menjadi pemilik institusi pertama.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inisialisasi organisasi gagal.");
    } finally { setBusy(false); }
  };

  const openWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const id = organizationId.trim();
      if (!id) throw new Error("Masukkan ID organisasi.");
      const context = await apiRequest<Tenant>("/v1/tenant/context", id);
      setTenant(context);
      setCampusId(localStorage.getItem(`pondok.campusId.${id}`) ?? "");
      localStorage.setItem("pondok.organizationId", id);
      setScreen("overview");
      setNotice("Workspace organisasi berhasil dibuka.");
    } catch (reason) {
      setTenant(null);
      setError(reason instanceof Error ? reason.message : "Tidak dapat membuka organisasi.");
    } finally { setBusy(false); }
  };

  const showStudents = async () => {
    if (!tenant) return;
    setScreen("students"); setError(""); setNotice("");
    setBusy(true);
    try { await loadStudents(tenant.organizationId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat data santri."); }
    finally { setBusy(false); }
  };

  const createStudent = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest<{ data: Student }>("/v1/academic/students", tenant.organizationId, {
        method: "POST",
        body: JSON.stringify({
          campusId: campusId.trim(), studentNumber: studentNumber.trim(), legalName: legalName.trim(),
          preferredName: preferredName.trim() || null, birthDate: birthDate || null, genderCode,
          profileData: Object.fromEntries(Object.entries(profileData).filter(([, value]) => value.trim().length > 0))
        })
      });
      setStudentNumber(""); setLegalName(""); setPreferredName(""); setCampusId(localStorage.getItem(`pondok.campusId.${tenant.organizationId}`) ?? ""); setBirthDate(""); setProfileData({});
      setShowCreate(false);
      await loadStudents(tenant.organizationId);
      setNotice("Data santri berhasil ditambahkan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan data santri.");
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true);
    try { await authClient?.signOut(); }
    finally {
      setUser(null); setTenant(null); setStudents([]); setBusy(false);
      setNotice("Sesi telah diakhiri.");
    }
  };

  const initials = useMemo(() => (user?.name || user?.email || "P").slice(0, 1).toUpperCase(), [user]);

  if (!user) {
    return <main className="auth-layout">
      <section className="auth-brand">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PESANTREN OPERATING SYSTEM</p>
        <h1>Satu sistem.<br /><em>Seluruh pesantren.</em></h1>
        <p className="brand-copy">Kelola pendidikan, kesantrian, keuangan, SDM, dan layanan pesantren dalam satu ruang kerja terpadu.</p>
        <div className="auth-foot">Dibangun untuk tata kelola yang aman, tertib, dan berkelanjutan.</div>
      </section>
      <section className="auth-panel">
        {firstSetup ? <form className="login-card setup-card" onSubmit={bootstrapFirstOrganization}>
          <div className="eyebrow">PENYIAPAN PERTAMA KALI</div>
          <h2>Aktifkan pesantren</h2>
          <p className="muted">Hanya dapat berhasil jika database belum memiliki organisasi dan operator telah menyiapkan token satu kali.</p>
          {!authClient && <div className="alert warning">Neon Auth belum dikonfigurasi. Isi VITE_NEON_AUTH_URL pada .env.local.</div>}
          {!existingAdminAccount && <label>Nama administrator<input value={adminName} onChange={(e) => setAdminName(e.target.value)} required maxLength={120} /></label>}
          <label>Email administrator<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Kata sandi<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={existingAdminAccount ? "current-password" : "new-password"} minLength={8} required /></label>
          <label>Nama pesantren<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required minLength={3} maxLength={180} /></label>
          <label>Slug organisasi<input value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="pondok-contoh" required maxLength={80} /></label>
          <div className="form-grid setup-grid"><label>Kode kampus<input value={firstCampusCode} onChange={(e) => setFirstCampusCode(e.target.value.toUpperCase())} required maxLength={24} /></label><label>Nama kampus<input value={firstCampusName} onChange={(e) => setFirstCampusName(e.target.value)} required maxLength={120} /></label></div>
          <label>Token setup satu kali<input type="password" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} required minLength={24} maxLength={256} autoComplete="off" /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary full" disabled={busy || !authClient}>{busy ? "Menginisialisasi…" : existingAdminAccount ? "Masuk dan lanjutkan setup" : "Buat institusi pertama"} <span>→</span></button>
          <p className="login-note">Token tidak disimpan di browser. Setelah organisasi pertama dibuat, endpoint setup akan menolak permintaan berikutnya.</p>
          <button type="button" className="text-button auth-toggle" onClick={() => { setExistingAdminAccount((value) => !value); setError(""); }}>{existingAdminAccount ? "Belum punya akun? Daftarkan administrator" : "Sudah punya akun? Gunakan akun yang ada"}</button>
          <button type="button" className="text-button auth-toggle" onClick={() => { setFirstSetup(false); setError(""); }}>← Kembali ke login</button>
        </form> : <form className="login-card" onSubmit={signIn}>
          <div className="eyebrow">SELAMAT DATANG</div>
          <h2>Masuk ke PONDOK OS</h2>
          <p className="muted">Gunakan akun institusi yang telah didaftarkan oleh administrator.</p>
          {!authClient && <div className="alert warning">Neon Auth belum dikonfigurasi. Salin <code>apps/web/.env.example</code> ke <code>.env.local</code> dan isi URL Auth development.</div>}
          <label>Email institusi<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Kata sandi<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="primary full" disabled={busy || !authClient}>{busy ? "Memproses…" : "Masuk ke workspace"} <span>→</span></button>
          <p className="login-note">Akses pengguna baru harus diberikan oleh administrator pesantren.</p>
          <button type="button" className="text-button auth-toggle" onClick={() => { setFirstSetup(true); setError(""); }}>Penyiapan institusi pertama kali →</button>
        </form>}
      </section>
    </main>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark small">P</div><div><strong>PONDOK OS</strong><small>INSTITUTION WORKSPACE</small></div></div>
      <div className="side-label">MENU UTAMA</div>
      <button className={screen === "overview" ? "nav-item active" : "nav-item"} onClick={() => setScreen("overview")}><span>⌂</span> Ringkasan</button>
      <button className={screen === "students" ? "nav-item active" : "nav-item"} onClick={() => void showStudents()}><span>♙</span> Data Santri</button>
      <button className={screen === "operations" ? "nav-item active" : "nav-item"} onClick={() => setScreen("operations")}><span>◈</span> Operasional</button>
      <button className={screen === "modules" ? "nav-item active" : "nav-item"} onClick={() => setScreen("modules")}><span>▦</span> Modul Sistem</button>
      <div className="side-label second">OPERASIONAL</div>
      {modules.slice(0, 7).map((item) => <button key={item.key} className="nav-item subdued" onClick={() => ["finance", "inventory", "hr"].includes(item.key) ? setScreen("operations") : setScreen("modules")}><span>{item.icon}</span>{item.name}</button>)}
      <div className="sidebar-bottom"><div className="secure-note"><span className="secure-dot" /> Data tenant terisolasi</div><div className="profile"><div className="avatar">{initials}</div><div className="profile-text"><strong>{user.name || user.email}</strong><small>{user.email}</small></div><button className="icon-button" title="Keluar" onClick={() => void signOut()}>↗</button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="breadcrumb">Workspace</span><span className="crumb-sep">/</span><strong>{screen === "students" ? "Data Santri" : screen === "modules" ? "Modul Sistem" : screen === "operations" ? "Operasional" : "Ringkasan"}</strong></div><div className="top-actions"><span className="live-pill"><i /> Sistem siap</span><button className="outline-button" onClick={() => void signOut()}>Keluar</button></div></header>
      <div className="content">
        {error && <div className="alert error global-alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="alert success global-alert">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {!tenant ? <section className="welcome-card">
          <div className="welcome-copy"><div className="eyebrow">IDENTITAS ORGANISASI</div><h1>Selamat datang,<br /><em>{user.name || user.email?.split("@")[0]}</em></h1><p>Masukkan ID organisasi pesantren untuk memuat hak akses dan ruang kerja yang sesuai.</p>
            <form className="org-form" onSubmit={openWorkspace}><label>ID Organisasi<input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="UUID organisasi" required /></label><button className="primary" disabled={busy}>{busy ? "Memeriksa…" : "Buka workspace →"}</button></form>
          </div><div className="welcome-art"><div className="art-circle"><div className="art-building">⌂</div><span>PONDOK<br />OS</span></div></div>
        </section> : <>
          <div className="page-heading"><div><div className="eyebrow">PONDOK OS / {tenant.organizationId.slice(0, 8).toUpperCase()}</div><h1>{screen === "students" ? "Data Santri" : screen === "modules" ? "Modul Sistem" : screen === "operations" ? "Ruang Kerja Operasional" : "Ringkasan Pesantren"}</h1><p>{screen === "students" ? "Kelola profil dan identitas santri dalam organisasi." : screen === "modules" ? "Kapabilitas sistem yang tersedia dan dalam tahap pengembangan." : screen === "operations" ? "Keuangan, inventaris, SDM dan payroll." : "Pusat kendali operasional institusi Anda."}</p></div><div className="date-chip">{new Intl.DateTimeFormat("id-ID",{dateStyle:"full"}).format(new Date())}</div></div>
          {screen === "overview" && <><div className="metric-grid"><article className="metric-card"><div className="metric-top"><span>Total santri</span><b>♙</b></div><strong>—</strong><small>Data akan tampil setelah modul santri dimuat</small></article><article className="metric-card"><div className="metric-top"><span>Modul aktif</span><b>▦</b></div><strong>10</strong><small>Fondasi domain tersedia bertahap</small></article><article className="metric-card"><div className="metric-top"><span>Keamanan</span><b>◇</b></div><strong>Aktif</strong><small>JWT dan membership diverifikasi API</small></article><article className="metric-card"><div className="metric-top"><span>Mode sistem</span><b>⌘</b></div><strong>Cloud</strong><small>Mode lokal dan hybrid menyusul</small></article></div><section className="section-block"><div className="section-title"><div><h2>Ruang kerja</h2><p>Akses cepat ke fungsi operasional pesantren.</p></div><button className="text-button" onClick={() => setScreen("modules")}>Lihat semua modul →</button></div><div className="module-grid">{modules.slice(0,6).map((item) => <button key={item.key} className="module-card" onClick={() => item.key === "academic" ? void showStudents() : setScreen("modules")}><span className="module-icon">{item.icon}</span><span className="module-state">{item.status}</span><strong>{item.name}</strong><small>{item.desc}</small><span className="module-arrow">↗</span></button>)}</div></section></>}
          {screen === "modules" && <section className="module-grid all-modules">{modules.map((item) => <button key={item.key} className="module-card" onClick={() => ["finance", "inventory", "hr"].includes(item.key) ? setScreen("operations") : item.key === "academic" ? void showStudents() : setNotice("Alur modul ini masih dalam tahap pengembangan.")}><span className="module-icon">{item.icon}</span><span className="module-state">{item.status}</span><strong>{item.name}</strong><small>{item.desc}</small></button>)}</section>}
          {screen === "operations" && <Operations organizationId={tenant.organizationId} />}
          {screen === "students" && <section className="table-card"><div className="table-toolbar"><div><h2>Daftar santri</h2><p>{students.length} data ditampilkan (maksimal 100)</p></div><button className="primary" onClick={() => setShowCreate((value) => !value)}>＋ Tambah santri</button></div>
            {showCreate && <form className="student-form" onSubmit={createStudent}><div className="form-section"><h3>Identitas dan penempatan pendidikan</h3><p>Data inti untuk administrasi induk santri. Nomor induk harus unik di lingkungan pesantren.</p><div className="form-grid"><label>Nomor induk santri<input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required maxLength={64} /></label><label>Nama lengkap sesuai dokumen<input value={legalName} onChange={(e) => setLegalName(e.target.value)} required minLength={2} maxLength={160} /></label><label>Nama panggilan<input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} maxLength={160} /></label><label>ID kampus<input value={campusId} onChange={(e) => setCampusId(e.target.value)} placeholder="UUID kampus" required /></label><label>Tanggal lahir<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label><label>Jenis kelamin<select value={genderCode} onChange={(e) => setGenderCode(e.target.value)}><option value="unspecified">Tidak disebutkan</option><option value="male">Laki-laki</option><option value="female">Perempuan</option></select></label><label>Jalur pendidikan<select value={profileData.educationTrack ?? ""} onChange={(e) => setProfileData(p => ({...p, educationTrack:e.target.value}))}><option value="">Pilih jalur</option><option value="formal">Formal</option><option value="muadalah">Muadalah</option><option value="nonformal">Nonformal</option><option value="salafiyah">Salafiyah</option><option value="other">Lainnya</option></select></label><label>Status tempat tinggal<select value={profileData.boardingStatus ?? ""} onChange={(e) => setProfileData(p => ({...p, boardingStatus:e.target.value}))}><option value="">Pilih status</option><option value="mukim">Santri mukim</option><option value="non_mukim">Santri tidak mukim</option><option value="commuter">Pulang-pergi</option></select></label><label>Tahun masuk<input inputMode="numeric" value={profileData.admissionYear ?? ""} onChange={(e) => setProfileData(p => ({...p, admissionYear:e.target.value}))} maxLength={4} placeholder="2026" /></label><label>Tanggal mulai mondok<input type="date" value={profileData.entryDate ?? ""} onChange={(e) => setProfileData(p => ({...p, entryDate:e.target.value}))} /></label></div></div><div className="form-section"><h3>Orang tua dan wali</h3><p>Kontak keluarga untuk komunikasi resmi dan keadaan darurat. Isikan sesuai data yang tersedia.</p><div className="form-grid"><label>Nama ayah<input value={profileData.fatherName ?? ""} onChange={(e) => setProfileData(p => ({...p, fatherName:e.target.value}))} maxLength={160} /></label><label>Nama ibu<input value={profileData.motherName ?? ""} onChange={(e) => setProfileData(p => ({...p, motherName:e.target.value}))} maxLength={160} /></label><label>Nama wali (jika berbeda)<input value={profileData.guardianName ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianName:e.target.value}))} maxLength={160} /></label><label>Hubungan wali<input value={profileData.guardianRelation ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianRelation:e.target.value}))} maxLength={40} placeholder="Paman, bibi, dan sebagainya" /></label><label>Telepon wali<input type="tel" value={profileData.guardianPhone ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianPhone:e.target.value}))} maxLength={32} /></label><label>Email wali<input type="email" value={profileData.guardianEmail ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianEmail:e.target.value}))} maxLength={254} /></label></div></div><div className="form-section"><h3>Alamat dan riwayat pendidikan</h3><p>Alamat domisili dan asal pendidikan sebagai data administrasi internal.</p><div className="form-grid"><label className="wide-field">Alamat lengkap<input value={profileData.homeAddress ?? ""} onChange={(e) => setProfileData(p => ({...p, homeAddress:e.target.value}))} maxLength={1000} /></label><label>Provinsi<input value={profileData.province ?? ""} onChange={(e) => setProfileData(p => ({...p, province:e.target.value}))} maxLength={100} /></label><label>Kabupaten/kota<input value={profileData.regency ?? ""} onChange={(e) => setProfileData(p => ({...p, regency:e.target.value}))} maxLength={100} /></label><label>Kecamatan<input value={profileData.district ?? ""} onChange={(e) => setProfileData(p => ({...p, district:e.target.value}))} maxLength={100} /></label><label>Desa/kelurahan<input value={profileData.village ?? ""} onChange={(e) => setProfileData(p => ({...p, village:e.target.value}))} maxLength={100} /></label><label>Kode pos<input value={profileData.postalCode ?? ""} onChange={(e) => setProfileData(p => ({...p, postalCode:e.target.value}))} maxLength={10} /></label><label>Asal sekolah<input value={profileData.originSchool ?? ""} onChange={(e) => setProfileData(p => ({...p, originSchool:e.target.value}))} maxLength={180} /></label><label>Pendidikan sebelumnya<input value={profileData.previousEducation ?? ""} onChange={(e) => setProfileData(p => ({...p, previousEducation:e.target.value}))} maxLength={120} /></label></div></div><div className="form-section"><h3>Penempatan asrama</h3><p>Diisi jika pesantren menyelenggarakan layanan asrama. Penempatan kamar dapat diperbarui melalui modul asrama.</p><div className="form-grid"><label>Nama asrama<input value={profileData.dormitoryName ?? ""} onChange={(e) => setProfileData(p => ({...p, dormitoryName:e.target.value}))} maxLength={120} /></label><label>Kode kamar<input value={profileData.roomCode ?? ""} onChange={(e) => setProfileData(p => ({...p, roomCode:e.target.value}))} maxLength={40} /></label><label>Kategori santri<input value={profileData.studentCategory ?? ""} onChange={(e) => setProfileData(p => ({...p, studentCategory:e.target.value}))} maxLength={40} placeholder="Reguler / beasiswa / lainnya" /></label></div></div><div className="privacy-note">Pelindungan data: jangan masukkan NIK/nomor KK, informasi kesehatan, biometrik, atau dokumen sensitif ke formulir ini. Kumpulkan data tambahan hanya melalui modul dengan hak akses dan dasar pemrosesan yang sesuai.</div><div className="form-actions"><button type="button" className="outline-button" onClick={() => setShowCreate(false)}>Batal</button><button className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan santri"}</button></div></form>}
            <div className="table-wrap"><table><thead><tr><th>Nomor induk</th><th>Nama santri</th><th>Tanggal lahir</th><th>Status</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="mono">{student.studentNumber}</td><td><strong>{student.legalName}</strong>{student.preferredName && <small className="cell-sub">{student.preferredName}</small>}</td><td>{student.birthDate ? new Date(student.birthDate).toLocaleDateString("id-ID") : "—"}</td><td><span className="status-chip">{student.status}</span></td></tr>)}{students.length === 0 && <tr><td colSpan={4} className="empty-state">{busy ? "Memuat data…" : "Belum ada data santri. Tambahkan data pertama untuk memulai."}</td></tr>}</tbody></table></div>
          </section>}
        </>}
        <footer className="footer">PONDOK OS <span>•</span> Secure institution workspace <span>•</span> v0.1 foundation</footer>
      </div>
    </main>
  </div>;
}

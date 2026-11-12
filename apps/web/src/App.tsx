import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { authClient, getAccessToken, getCurrentUser, type PondokUser } from "./auth";
import Operations from "./Operations";
import Admissions from "./Admissions";
import ModuleWorkspace, { getModuleResourceLabel, hasReadableModuleGroup, hasReadableModuleResource } from "./ModuleWorkspace";
import InstitutionActivation from "./InstitutionActivation";
import TenantAccessAdmin from "./TenantAccessAdmin";

type Tenant = { organizationId: string; membershipId: string; roles: string[]; permissions: string[]; security: { status: "protected"; runtimeRole: string; protectedTables: number; tenantTables: number }; license?: { status: string; planCode: string; startsAt: string; endsAt: string | null } | null; serverNow?: string };
type OrganizationChoice = { id: string; name: string; slug: string };
type Student = {
  id: string; campusId: string; studentNumber: string; legalName: string;
  preferredName?: string | null; birthDate?: string | null; genderCode?: string | null;
  status: string; createdAt: string; profileData?: Record<string, string> | null;
};
type Screen = "overview" | "students" | "modules" | "operations" | "admissions" | "access";
type OperationsArea = "finance" | "inventory" | "hr";

const PREVIEW_PERMISSIONS: string[] = [];

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
];

const MODULE_ACCESS = {
  academic: ["academic.classes.read", "academic.enrollments.read", "academic.attendance.read"],
  admissions: ["admissions.periods.read", "admissions.applications.read"],
  finance: ["finance.accounts.read", "finance.journals.read"],
  inventory: ["inventory.items.read", "inventory.movements.read"],
  library: ["library.catalog.read", "library.loans.read"],
  hr: ["hr.employees.read", "hr.contracts.read", "hr.payroll.read"],
  cms: ["cms.pages.manage", "cms.announcements.manage"],
  boarding: ["boarding.rooms.manage", "boarding.assignments.manage", "boarding.leave.read", "boarding.incidents.read"],
  crm: ["crm.contacts.read", "crm.donations.manage"],
} as const;
const OPERATIONS_ACCESS: Record<OperationsArea, readonly string[]> = {
  finance: MODULE_ACCESS.finance,
  inventory: MODULE_ACCESS.inventory,
  hr: ["hr.employees.read", "hr.payroll.read"],
};
const ADMISSIONS_ACCESS = MODULE_ACCESS.admissions;
const hasAnyPermission = (permissions: readonly string[] | undefined, required: readonly string[]) =>
  Boolean(permissions && required.some((permission) => permissions.includes(permission)));
const canSeeModuleCard = (permissions: readonly string[] | undefined, moduleKey: string) =>
  !permissions || hasAnyPermission(permissions, MODULE_ACCESS[moduleKey as keyof typeof MODULE_ACCESS] ?? []);

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const SUPPORT_WHATSAPP_NUMBER = (import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

function SupportLink() {
  if (!/^[1-9]\d{7,14}$/.test(SUPPORT_WHATSAPP_NUMBER)) return null;
  const message = encodeURIComponent("Assalamu’alaikum, saya pengguna PONDOK OS dan membutuhkan bantuan terkait: ");
  return <a className="support-link" href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${message}`} target="_blank" rel="noopener noreferrer">Hubungi Super Administrator melalui WhatsApp</a>;
}

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
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Permintaan gagal (${response.status})`);
  return body as T;
}

function TrialCountdown({ endsAt, serverNow }: { endsAt: string; serverNow: string | undefined }) {
  const [elapsed, setElapsed] = useState(() => performance.now());
  const [startedAt] = useState(() => performance.now());
  useEffect(() => {
    setElapsed(performance.now());
    const timer = window.setInterval(() => setElapsed(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, serverNow]);
  const endTime = new Date(endsAt).getTime();
  const serverTimeAtLoad = serverNow ? new Date(serverNow).getTime() : Date.now();
  const monotonicNow = serverNow ? serverTimeAtLoad + Math.max(0, elapsed - startedAt) : Date.now();
  const remainingSeconds = Number.isFinite(endTime) ? Math.max(0, Math.floor((endTime - monotonicNow) / 1000)) : 0;
  const expired = remainingSeconds <= 0;
  const parts = [
    { label: "Hari", value: Math.floor(remainingSeconds / 86400) },
    { label: "Jam", value: Math.floor((remainingSeconds % 86400) / 3600) },
    { label: "Menit", value: Math.floor((remainingSeconds % 3600) / 60) },
    { label: "Detik", value: remainingSeconds % 60 },
  ];
  return <section className={expired ? "trial-countdown-bar expired" : "trial-countdown-bar"} aria-label="Status masa percobaan PONDOK OS">
    <div className="trial-countdown-copy">
      <span className="trial-countdown-kicker">{expired ? "MASA PERCOBAAN BERAKHIR" : "TRIAL GRATIS PONDOK OS · 14 HARI"}</span>
      <strong>{expired ? "Aktifkan lisensi untuk melanjutkan" : "Sisa masa percobaan Anda"}</strong>
      <small>{expired ? "Data tetap tersimpan. Hubungi administrator untuk aktivasi lisensi." : "Berakhir pada " + new Date(endsAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</small>
    </div>
    <div className="trial-countdown-clock" role="timer" aria-live="off" aria-label={expired ? "Masa trial berakhir" : parts.map(part => part.value + " " + part.label).join(", ")}>
      {parts.map(part => <div className="trial-time-unit" key={part.label}><b>{String(part.value).padStart(2, "0")}</b><span>{part.label}</span></div>)}
    </div>
  </section>;
}
export default function App() {
  const [user, setUser] = useState<PondokUser | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [platformAccessChecked, setPlatformAccessChecked] = useState(false);
  const [platformAccessError, setPlatformAccessError] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);
  const [screen, setScreen] = useState<Screen>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [moduleResource, setModuleResource] = useState("academic-years");
  const [operationsArea, setOperationsArea] = useState<OperationsArea>("finance");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(() => new URLSearchParams(window.location.search).has("token"));
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [selfSignUp, setSelfSignUp] = useState(() => new URLSearchParams(window.location.search).get("trial") === "14");
  const [adminName, setAdminName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).has("error") ? "Tautan reset kata sandi tidak valid atau sudah kedaluwarsa. Minta tautan reset yang baru." : "");
  const [notice, setNotice] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentNumber, setStudentNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [campusId, setCampusId] = useState(() => "");
  const [birthDate, setBirthDate] = useState("");
  const [genderCode, setGenderCode] = useState("unspecified");

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((current) => { if (active) setUser(current); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Gagal memulihkan sesi."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) {
      setIsSuperAdmin(false);
      setPlatformAccessChecked(false);
      setPlatformAccessError("");
      return;
    }
    let active = true;
    setPlatformAccessChecked(false);
    setPlatformAccessError("");
    void getAccessToken().then((token) => fetch(`${API_BASE}/v1/platform/admin/me`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store"
    })).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Pemeriksaan akses platform gagal (${response.status}).`);
      if (active) setIsSuperAdmin(body.data?.isSuperAdmin === true);
    }).catch((reason: unknown) => {
      if (!active) return;
      setIsSuperAdmin(false);
      setPlatformAccessError(reason instanceof Error ? reason.message : "Sesi belum dapat diverifikasi. Silakan muat ulang atau masuk kembali.");
    }).finally(() => {
      if (active) setPlatformAccessChecked(true);
    });
    return () => { active = false; };
  }, [user]);

  // Workspace and Central Command are separate applications. Never redirect
  // this application based on platform role; tenant access is resolved below.
  const openModule = (resourceKey: string) => {
    if (tenant) {
      const allowed = resourceKey === "all" ? hasReadableModuleResource(tenant.permissions) : hasReadableModuleGroup(resourceKey, tenant.permissions);
      if (!allowed) { setError("Akses ditolak. Peran Anda belum memiliki izin baca untuk menu ini."); return; }
    }
    setModuleResource(resourceKey); setScreen("modules"); if (!tenant) setPreviewMode(true); setError(""); setNotice("");
  };
  const openOperations = (area: OperationsArea) => {
    if (!tenant) {
      const previewResource: Record<OperationsArea,string> = { finance: "finance-accounts", inventory: "inventory-items", hr: "employees" };
      openModule(previewResource[area]);
      return;
    }
    if (!hasAnyPermission(tenant.permissions, (OPERATIONS_ACCESS[area] ?? []))) { setError("Akses ditolak. Anda tidak memiliki izin baca pada area operasional ini."); return; }
    setOperationsArea(area); setScreen("operations"); setError(""); setNotice("");
  };
  const openAdmissions = () => {
    if (!tenant) { openModule("admission-periods"); return; }
    if (!hasAnyPermission(tenant.permissions, ADMISSIONS_ACCESS)) { setError("Akses ditolak. Anda belum memiliki izin baca PPDB."); return; }
    if (!tenant.permissions.includes("admissions.applications.read")) { openModule("admission-periods"); return; }
    setScreen("admissions"); setError(""); setNotice("");
  };
  const openHrWorkspace = () => {
    if (!tenant) { openModule("employees"); return; }
    if (hasAnyPermission(tenant.permissions, OPERATIONS_ACCESS.hr)) { openOperations("hr"); return; }
    openModule("hr-contracts");
  };

  useEffect(() => {
    if (!tenant) return;
    const permissions = tenant.permissions;
    const denied =
      (screen === "modules" && (moduleResource === "all" ? !hasReadableModuleResource(permissions) : !hasReadableModuleGroup(moduleResource, permissions))) ||
      (screen === "operations" && !hasAnyPermission(permissions, (OPERATIONS_ACCESS[operationsArea] ?? []))) ||
      (screen === "admissions" && !hasAnyPermission(permissions, ADMISSIONS_ACCESS)) ||
      (screen === "access" && !hasAnyPermission(permissions, ["core.roles.manage", "core.members.manage"])) ||
      (screen === "students" && !permissions.includes("academic.students.read"));
    if (denied) {
      setScreen("overview");
      setError("Halaman ditutup karena hak akses akun ini tidak mencakup menu yang diminta.");
    }
  }, [tenant, screen, moduleResource, operationsArea]);

  const chooseOrganization = async (orgId: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const context = await apiRequest<Tenant>("/v1/tenant/context", orgId);
      setTenant(context);
      setCampusId(localStorage.getItem(`pondok.campusId.${orgId}`) ?? "");
      localStorage.setItem("pondok.organizationId", orgId);
      setScreen("overview"); setNotice("Workspace pesantren berhasil dibuka.");
    } catch (reason) {
      setTenant(null);
      setError(reason instanceof Error ? reason.message : "Tidak dapat membuka workspace pesantren.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    // Central Command remains a separate application. A platform Super Admin
    // receives no implicit tenant access; however, the first-tenant bootstrap
    // explicitly creates an institution_owner membership for that verified
    // account. Resolve the same server-authorized membership list for every
    // account so that this explicit tenant assignment is actually usable.
    if (!user || !platformAccessChecked || platformAccessError) return;
    let active = true;
    void (async () => {
      setBusy(true); setError(""); setNotice("");
      try {
        const token = await getAccessToken();
        const endpoint = "/v1/tenant/organizations";
        const response = await fetch(`${API_BASE}${endpoint}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? body.error ?? "Gagal memuat daftar pesantren.");
        const available: OrganizationChoice[] = Array.isArray(body.data)
          ? body.data.map((item: Record<string, unknown>) => ({
              id: String(item.id),
              name: String(item.name ?? ""),
              slug: String(item.slug ?? ""),
            })).filter((item: OrganizationChoice) => item.id && item.id !== "undefined")
          : [];
        if (!active) return;
        setOrganizations(available);
        if (available.length === 1) {
          const orgId = available[0]!.id;
          const context = await apiRequest<Tenant>("/v1/tenant/context", orgId);
          if (!active) return;
          setTenant(context);
          setCampusId(localStorage.getItem(`pondok.campusId.${orgId}`) ?? "");
          localStorage.setItem("pondok.organizationId", orgId);
          setNotice("Workspace pesantren berhasil dibuka.");
        } else if (available.length > 1) {
          setTenant(null);
          setNotice("Pilih pesantren untuk melanjutkan ke workspace.");
        } else {
          setTenant(null);
          setNotice(isSuperAdmin
            ? "Akun Super Administrator belum memiliki keanggotaan lembaga. Akses workspace hanya diberikan setelah membership lembaga yang sah dibuat dan diverifikasi."
            : "Akun Anda belum terhubung ke organisasi pesantren. Minta administrator pesantren mengundang atau mengaktifkan akun Anda.");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Gagal memuat organisasi.");
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [user, platformAccessChecked, platformAccessError, isSuperAdmin]);

  const loadStudents = useCallback(async (orgId: string) => {
    const result = await apiRequest<{ data: Student[] }>("/v1/academic/students?limit=100", orgId);
    setStudents(result.data);
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message);
      const current = await getCurrentUser();
      if (!current) {
        throw new Error("Kredensial diterima, tetapi sesi belum dapat dipulihkan. Periksa koneksi Neon Auth lalu coba masuk kembali.");
      }
      setUser(current);
      setPassword("");
      setNotice("Berhasil masuk. Memuat organisasi dan hak akses Anda…");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally { setBusy(false); }
  };
  const requestPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (result.error) throw new Error(result.error.message);
      setNotice("Jika alamat email terdaftar, tautan untuk membuat kata sandi baru akan dikirim ke kotak masuk email tersebut. Periksa juga folder spam.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Permintaan reset kata sandi gagal. Coba lagi nanti.");
    } finally { setBusy(false); }
  };

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient || !resetToken) return;
    if (newPassword.length < 8) { setError("Kata sandi baru minimal 8 karakter."); return; }
    if (newPassword !== confirmNewPassword) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.resetPassword({ newPassword, token: resetToken });
      if (result.error) throw new Error(result.error.message);
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      setResetPasswordMode(false); setResetToken(""); setNewPassword(""); setConfirmNewPassword("");
      setShowNewPassword(false); setPassword(""); setForgotPasswordMode(false);
      setNotice("Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reset kata sandi gagal. Minta tautan reset yang baru.");
    } finally { setBusy(false); }
  };

  const registerWorkspaceAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.signUp.email({ email: email.trim(), password, name: adminName.trim() });
      if (result.error) throw new Error(result.error.message);
      setPassword("");
      setSelfSignUp(false);
      setNotice("Pendaftaran akun berhasil. Periksa email untuk verifikasi, lalu masuk kembali. Setelah itu ajukan aktivasi lembaga; trial gratis 14 hari dimulai setelah perusahaan menyetujui dan aktivasi berhasil digunakan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pendaftaran akun gagal.");
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

  const beginEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentNumber(student.studentNumber);
    setLegalName(student.legalName);
    setPreferredName(student.preferredName ?? "");
    setCampusId(student.campusId);
    setBirthDate(student.birthDate?.slice(0, 10) ?? "");
    setGenderCode(student.genderCode ?? "unspecified");
    setProfileData(student.profileData ?? {});
    setShowCreate(true);
    setError(""); setNotice("");
  };

  const createStudent = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest<{ data: Student }>(editingStudent ? `/v1/academic/students/${editingStudent.id}` : "/v1/academic/students", tenant.organizationId, {
        method: editingStudent ? "PATCH" : "POST",
        body: JSON.stringify({
          campusId: campusId.trim(), studentNumber: studentNumber.trim(), legalName: legalName.trim(),
          preferredName: preferredName.trim() || null, birthDate: birthDate || null, genderCode,
          profileData: Object.fromEntries(Object.entries(profileData).filter(([, value]) => value.trim().length > 0))
        })
      });
      setStudentNumber(""); setLegalName(""); setPreferredName(""); setCampusId(localStorage.getItem(`pondok.campusId.${tenant.organizationId}`) ?? ""); setBirthDate(""); setProfileData({});
      setEditingStudent(null); setShowCreate(false);
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
      setNotice("");
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
        {resetPasswordMode ? <form className="login-card" onSubmit={submitPasswordReset}>
          <div className="eyebrow">PEMULIHAN AKUN</div>
          <h2>Buat kata sandi baru</h2>
          <p className="muted">Gunakan kata sandi baru yang kuat dan belum pernah dipakai pada akun lain.</p>
          <label>Kata sandi baru<div className="password-field"><input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /><button type="button" className="password-visibility" aria-label={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button></div></label>
          <label>Ulangi kata sandi baru<div className="password-field"><input type={showNewPassword ? "text" : "password"} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /><button type="button" className="password-visibility" aria-label={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button></div></label>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="primary full" disabled={busy || !authClient || !resetToken}>{busy ? "Memperbarui kata sandi…" : "Simpan kata sandi baru"}</button>
          <button type="button" className="text-button auth-toggle" onClick={() => { setResetPasswordMode(false); setResetToken(""); setNewPassword(""); setConfirmNewPassword(""); setError(""); setNotice(""); window.history.replaceState({}, "", window.location.pathname); }}>← Kembali ke login</button>
        </form> : forgotPasswordMode ? <form className="login-card" onSubmit={requestPasswordReset}>
          <div className="eyebrow">PEMULIHAN AKUN</div>
          <h2>Lupa kata sandi?</h2>
          <p className="muted">Masukkan email akun PONDOK OS. Jika terdaftar, kami akan mengirim tautan reset ke alamat tersebut.</p>
          <label>Email akun<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="primary full" disabled={busy || !authClient}>{busy ? "Mengirim tautan…" : "Kirim tautan reset"}</button>
          <button type="button" className="text-button auth-toggle" onClick={() => { setForgotPasswordMode(false); setError(""); setNotice(""); }}>← Kembali ke login</button>
          <SupportLink />
        </form> : selfSignUp ? <form className="login-card" onSubmit={registerWorkspaceAccount}>
          <div className="eyebrow">PENDAFTARAN PENGGUNA</div>
          <h2>Buat akun PONDOK OS</h2>
          <p className="muted">Buat akun untuk mengajukan trial gratis PONDOK OS selama 14 hari. Verifikasi email dan lengkapi data lembaga; masa trial dimulai setelah aktivasi disetujui dan digunakan.</p>
          {!authClient && <div className="alert warning">Neon Auth belum dikonfigurasi. Salin <code>apps/web/.env.example</code> ke <code>.env.local</code> dan isi URL Auth development.</div>}
          <label>Nama lengkap<input value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="name" required maxLength={120} /></label>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Kata sandi<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /><button type="button" className="password-visibility" aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button></div></label>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="primary full" disabled={busy || !authClient}>{busy ? "Mendaftarkan akun…" : "Daftar akun"}</button>
          <p className="login-note">Setelah email terverifikasi, masuk kembali untuk mengajukan aktivasi lembaga. Trial berlaku 14 hari sejak workspace diaktifkan.</p>
          <button type="button" className="text-button auth-toggle" onClick={() => { setSelfSignUp(false); setError(""); setNotice(""); setPassword(""); }}>← Kembali ke login</button>
          <SupportLink />
        </form> : <form className="login-card" onSubmit={signIn}>
          <div className="eyebrow">SELAMAT DATANG</div>
          <h2>Masuk ke PONDOK OS</h2>
          <p className="muted">Masuk menggunakan email dan kata sandi akun PONDOK OS Anda.</p>
          <div className="trial-login-note"><strong>Uji coba gratis 14 hari untuk lembaga baru.</strong><span>Hitungan dimulai saat workspace pertama kali dibuka setelah aktivasi disetujui.</span></div>
          {!authClient && <div className="alert warning">Neon Auth belum dikonfigurasi. Salin <code>apps/web/.env.example</code> ke <code>.env.local</code> dan isi URL Auth development.</div>}
          <label>Email institusi<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Kata sandi<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" className="password-visibility" aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></button></div></label>
          <button type="button" className="text-button forgot-password-link" onClick={() => { setForgotPasswordMode(true); setError(""); setNotice(""); setPassword(""); }}>Lupa kata sandi?</button>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="primary full" disabled={busy || !authClient}>{busy ? "Memverifikasi akun…" : "Masuk dan verifikasi hak akses"} <span>→</span></button>
          <button type="button" className="text-button auth-toggle" onClick={() => { setSelfSignUp(true); setAdminName(""); setError(""); setNotice(""); }}>Belum punya akun? Daftar akun</button>
          <p className="login-note">Akses pengguna baru harus diberikan oleh administrator pesantren.</p>
          <SupportLink />
        </form>}
      </section>
    </main>;
  }

  // Keep the tenant application completely separate from platform operators.
  // Do not render tenant navigation or the generic no-membership state for them.
  if (!platformAccessChecked) {
    return <main className="auth-layout"><section className="login-card">
      <div className="eyebrow">PEMERIKSAAN AKSES</div>
      <h2>Memverifikasi hak akses akun</h2>
      <p className="muted">Workspace menunggu konfirmasi otorisasi dari server sebelum menampilkan area pesantren.</p>
    </section></main>;
  }
  if (platformAccessError) {
    return <main className="auth-layout"><section className="login-card">
      <div className="eyebrow">PEMERIKSAAN AKSES GAGAL</div>
      <h2>Sesi belum dapat diverifikasi</h2>
      <div className="alert error">{platformAccessError}</div>
      <button type="button" className="primary full" onClick={() => window.location.reload()}>Coba periksa kembali</button>
      <button type="button" className="text-button" onClick={() => void signOut()}>Keluar</button>
    </section></main>;
  }
  return <div className={mobileNavOpen ? "app-shell mobile-nav-open" : "app-shell"}>
    <aside id="workspace-sidebar" className="sidebar" onClickCapture={() => setMobileNavOpen(false)}>
      <div className="brand-lockup"><div className="brand-mark small">P</div><div><strong>PONDOK OS</strong><small>INSTITUTION WORKSPACE</small></div></div>
      <div className="side-label">MENU UTAMA</div>
      <button type="button" className={screen === "overview" ? "nav-item active" : "nav-item"} onClick={() => { setPreviewMode(false); setScreen("overview"); setError(""); }}><span>⌂</span> Ringkasan</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["academic.students.read", "academic.students.identity.read", "academic.students.health.read"]))} type="button" className={screen === "modules" && ["student-details","student-identity-documents","student-health-profiles","guardians","student-guardians"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("student-details")}><span>♙</span> Master Data Santri</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ADMISSIONS_ACCESS))} type="button" className={screen === "admissions" || (previewMode && screen === "modules" && moduleResource.startsWith("admission-")) ? "nav-item active" : "nav-item"} onClick={openAdmissions}><span>✳</span> PPDB</button>
      <div className="side-label second" hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["academic.classes.read","academic.enrollments.read","academic.attendance.read","boarding.rooms.manage","boarding.assignments.manage","boarding.leave.read","boarding.incidents.read","library.catalog.read","library.loans.read"]))}>PENDIDIKAN & KESANTRIAN</div>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.academic))} type="button" className={screen === "modules" && ["academic-years","academic-terms","programs","subjects","classes","enrollments","attendance-sessions","attendance-records","academic-class-subjects"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("academic-years")}><span>▦</span> Akademik & Kurikulum</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.boarding))} type="button" className={screen === "modules" && ["dormitories","boarding-rooms","boarding-beds","boarding-assignments","leave-requests","incidents"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("dormitories")}><span>⌂</span> Asrama & Kesantrian</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.library))} type="button" className={screen === "modules" && ["library-catalog","library-copies","library-loans"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("library-catalog")}><span>▥</span> Perpustakaan</button>
      <div className="side-label second" hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["finance.accounts.read","finance.journals.read","inventory.items.read","inventory.movements.read","hr.employees.read","hr.contracts.read","hr.payroll.read","hr.educators.read","hr.organization.read","assets.register.read","procurement.suppliers.manage","procurement.requests.read","procurement.orders.manage","cms.pages.manage","cms.announcements.manage","crm.contacts.read","crm.donations.manage","core.roles.manage","core.members.manage","academic.classes.read"]))}>TATA KELOLA & LAYANAN</div>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.finance))} type="button" className={(screen === "operations" && operationsArea === "finance") || (previewMode && screen === "modules" && moduleResource.startsWith("finance-")) ? "nav-item active" : "nav-item"} onClick={() => openOperations("finance")}><span>◈</span> Keuangan & Akuntansi</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.inventory))} type="button" className={(screen === "operations" && operationsArea === "inventory") || (previewMode && screen === "modules" && moduleResource.startsWith("inventory-")) ? "nav-item active" : "nav-item"} onClick={() => openOperations("inventory")}><span>▤</span> Inventaris & Gudang</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, MODULE_ACCESS.hr))} type="button" className={(screen === "operations" && operationsArea === "hr") || (previewMode && screen === "modules" && ["employees","hr-contracts","hr-payroll-periods","hr-payroll-runs"].includes(moduleResource)) ? "nav-item active" : "nav-item"} onClick={openHrWorkspace}><span>♙</span> SDM & Payroll</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["hr.educators.read","hr.organization.read"]))} type="button" className={screen === "modules" && ["instructor-profiles","employee-assignments","hr-departments","hr-positions"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("instructor-profiles")}><span>♟</span> Pengajar & Struktur Organisasi</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["assets.register.read","procurement.suppliers.manage","procurement.requests.read","procurement.orders.manage"]))} type="button" className={screen === "modules" && ["assets","asset-events","suppliers","purchase-requests","purchase-request-lines","purchase-orders","purchase-order-lines"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("assets")}><span>▧</span> Aset & Pengadaan</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["cms.pages.manage","cms.announcements.manage"]))} type="button" className={screen === "modules" && ["cms-pages","announcements"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("cms-pages")}><span>▣</span> Website & Pengumuman</button>
      <button hidden={Boolean(tenant && !hasAnyPermission(tenant.permissions, ["crm.contacts.read","crm.donations.manage"]))} type="button" className={screen === "modules" && ["contacts","interactions","donor-pledges"].includes(moduleResource) ? "nav-item active" : "nav-item"} onClick={() => openModule("contacts")}><span>◎</span> CRM, Alumni & Donatur</button>
      <button hidden={Boolean(tenant && !tenant.permissions.includes("academic.classes.read"))} type="button" className={screen === "modules" && moduleResource === "campuses" ? "nav-item active" : "nav-item"} onClick={() => openModule("campuses")}><span>⌘</span> Tata Kelola Institusi</button>
      {(tenant?.permissions.includes("core.roles.manage") || tenant?.permissions.includes("core.members.manage")) && <button type="button" className={screen === "access" ? "nav-item active" : "nav-item"} onClick={() => { setScreen("access"); setError(""); setNotice(""); }}><span>♙</span> Jabatan, Peran & Hak Akses</button>}
      <button hidden={Boolean(tenant && !hasReadableModuleResource(tenant.permissions))} type="button" className={screen === "modules" && moduleResource === "all" ? "nav-item active" : "nav-item"} onClick={() => openModule("all")}><span>☷</span> Semua Modul</button>
      <div className="sidebar-bottom"><div className="secure-note"><span className={tenant?.security?.status === "protected" ? "secure-dot" : "secure-dot warning"} />{tenant?.security?.status === "protected" ? ` Isolasi data aktif · ${tenant.security.protectedTables}/${tenant.security.tenantTables} tabel terlindungi` : " Status isolasi belum terverifikasi"}</div><div className="profile"><div className="avatar">{initials}</div><div className="profile-text"><strong>{user.name || user.email}</strong><small>{user.email}</small></div><button className="icon-button" title="Keluar" onClick={() => void signOut()}>↗</button></div></div>
    </aside>
    {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Tutup menu navigasi" onClick={() => setMobileNavOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="topbar-leading"><button type="button" className="mobile-menu-toggle" aria-label={mobileNavOpen ? "Tutup menu navigasi" : "Buka menu navigasi"} aria-expanded={mobileNavOpen} aria-controls="workspace-sidebar" onClick={() => setMobileNavOpen(value => !value)}><span /><span /><span /></button><div className="topbar-crumbs"><span className="breadcrumb">Workspace</span><span className="crumb-sep">/</span><strong>{screen === "students" ? "Data Santri" : screen === "modules" ? getModuleResourceLabel(moduleResource) : screen === "operations" ? (operationsArea === "finance" ? "Keuangan & Akuntansi" : operationsArea === "inventory" ? "Inventaris & Gudang" : "SDM & Payroll") : screen === "admissions" ? "PPDB" : screen === "access" ? "Hak Akses" : "Ringkasan"}</strong></div></div><div className="top-actions"><span className="live-pill"><i /> Workspace aktif</span><button className="outline-button" onClick={() => void signOut()}>Keluar</button></div></header>
      {tenant?.license?.status === "trial" && tenant.license.endsAt ? (
        <TrialCountdown key={tenant.license.endsAt} endsAt={tenant.license.endsAt} serverNow={tenant.serverNow} />
      ) : tenant?.license?.status === "trial" ? (
        <section className="trial-countdown-bar trial-status-notice" role="status" aria-label="Status masa percobaan PONDOK OS">
          <div className="trial-countdown-copy">
            <span className="trial-countdown-kicker">TRIAL GRATIS PONDOK OS · 14 HARI</span>
            <strong>Lisensi trial terdeteksi, waktu mulai belum tercatat</strong>
            <small>Hitung mundur akan aktif setelah server menetapkan waktu mulai. Muat ulang workspace; jika pesan ini tetap muncul, administrator perlu memeriksa aktivasi trial.</small>
          </div>
          <div className="trial-status-chip">Menunggu waktu mulai</div>
        </section>
      ) : tenant && !tenant.license ? (
        <section className="trial-countdown-bar trial-status-notice trial-status-missing" role="status" aria-label="Status lisensi PONDOK OS">
          <div className="trial-countdown-copy">
            <span className="trial-countdown-kicker">STATUS LISENSI PONDOK OS</span>
            <strong>Lisensi trial 14 hari belum ditemukan</strong>
            <small>Workspace terbuka, tetapi server belum mengirim data lisensi. Hitung mundur tidak dapat dimulai sebelum lisensi trial diterbitkan oleh proses aktivasi.</small>
          </div>
          <div className="trial-status-chip">Perlu pemeriksaan admin</div>
        </section>
      ) : null}
      <div className="content">
        {error && <div className="alert error global-alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="alert success global-alert">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {!tenant && !previewMode ? !platformAccessChecked ? <section className="welcome-card"><div className="welcome-copy"><div className="eyebrow">MEMERIKSA AKSES</div><h1>Memverifikasi sesi dan hak akses…</h1><p>Mohon tunggu. Formulir aktivasi tidak akan ditampilkan sebelum status akun berhasil diverifikasi.</p></div></section> : platformAccessError ? <section className="welcome-card"><div className="welcome-copy"><div className="eyebrow">PEMERIKSAAN AKSES GAGAL</div><h1>Sesi belum dapat diverifikasi</h1><div className="alert error">{platformAccessError}</div><p className="muted">Jangan kirim permohonan aktivasi lembaga saat status hak akses akun belum berhasil diperiksa. Data lembaga Anda tidak perlu diisi ulang.</p><button type="button" className="primary" onClick={() => window.location.reload()}>Coba periksa kembali</button></div></section> : <><section className="welcome-card">
          <div className="welcome-copy"><div className="eyebrow">WORKSPACE PESANTREN</div><h1>Selamat datang,<br /><em>{user.name || user.email?.split("@")[0]}</em></h1>
            {busy ? <p>Memuat daftar pesantren dan hak akses Anda…</p> : organizations.length > 1 ? <>
              <p>Akun Anda terhubung ke beberapa pesantren. Pilih pesantren untuk membuka ruang kerja.</p>
              <div className="org-choice-list">{organizations.map((org) => <button key={org.id} type="button" className="org-choice" disabled={busy} onClick={() => void chooseOrganization(org.id)}><span><strong>{org.name}</strong><small>{org.slug}</small></span><b>Masuk →</b></button>)}</div>
            </> : organizations.length === 0 ? <>
              <p>Akun ini belum terhubung ke organisasi pesantren.</p>
              <div className="alert warning">Akun ini belum memiliki workspace aktif. Hubungi administrator pesantren untuk mendapatkan undangan atau mengajukan aktivasi lembaga.</div>
            </> : <p>Menyiapkan workspace pesantren Anda…</p>}
            {error && <div className="alert error">{error}</div>}
          </div><div className="welcome-art"><div className="art-circle"><div className="art-building">⌂</div><span>PONDOK<br />OS</span></div></div>
        </section>{!isSuperAdmin && <>
          <section className="trial-countdown-bar trial-status-notice" role="status" aria-label="Informasi trial gratis PONDOK OS">
            <div className="trial-countdown-copy">
              <span className="trial-countdown-kicker">TRIAL GRATIS PONDOK OS · 14 HARI</span>
              <strong>Mulai uji coba gratis setelah aktivasi lembaga disetujui</strong>
              <small>Daftarkan lembaga dengan akun ini, verifikasi email, kirim permohonan, lalu tunggu persetujuan Super Admin. Setelah token aktivasi digunakan dan workspace pertama kali dibuka, hitung mundur 14 hari dimulai otomatis. Pendaftaran akun saja belum memulai trial.</small>
            </div>
            <div className="trial-status-chip">Menunggu aktivasi</div>
          </section>
          <InstitutionActivation />
        </>}</> : <>
          <div className="page-heading"><div><div className="eyebrow">{previewMode ? "PONDOK OS / PRATINJAU PRODUK" : `PONDOK OS / ${tenant?.organizationId.slice(0, 8).toUpperCase()}`}</div><h1>{previewMode ? getModuleResourceLabel(moduleResource) : screen === "students" ? "Data Santri" : screen === "modules" ? getModuleResourceLabel(moduleResource) : screen === "operations" ? (operationsArea === "finance" ? "Keuangan & Akuntansi" : operationsArea === "inventory" ? "Inventaris & Gudang" : "SDM & Payroll") : screen === "admissions" ? "Manajemen PPDB" : screen === "access" ? "Jabatan, Peran & Hak Akses" : "Ringkasan Pesantren"}</h1><p>{previewMode ? "Jelajahi struktur menu, formulir, dan rancangan alur kerja menggunakan data contoh lokal." : screen === "students" ? "Kelola profil dan identitas santri dalam organisasi." : screen === "modules" ? "Ruang kerja khusus untuk data, formulir, alur persetujuan, dan pencatatan modul ini." : screen === "operations" ? "Data operasional yang ditampilkan mengikuti hak akses akun." : screen === "admissions" ? "Penerimaan santri baru, periode, pendaftaran dan seleksi." : "Pusat kendali operasional institusi Anda."}</p></div><div className="date-chip">{new Intl.DateTimeFormat("id-ID",{dateStyle:"full"}).format(new Date())}</div></div>
          {screen === "overview" && <><div className="metric-grid"><article className="metric-card"><div className="metric-top"><span>Total santri</span><b>♙</b></div><strong>—</strong><small>Data akan tampil setelah modul santri dimuat</small></article><article className="metric-card"><div className="metric-top"><span>Menu kerja</span><b>▦</b></div><strong>{modules.filter((item) => canSeeModuleCard(tenant?.permissions, item.key)).length}</strong><small>Modul yang dapat dibuka oleh peran Anda</small></article><article className="metric-card"><div className="metric-top"><span>Keamanan tenant</span><b>◇</b></div><strong>{tenant?.security?.status === "protected" ? "Terverifikasi" : "Perlu pemeriksaan"}</strong><small>{tenant?.security?.protectedTables ?? 0} dari {tenant?.security?.tenantTables ?? 0} tabel memiliki RLS aktif dan dipaksa</small></article><article className="metric-card"><div className="metric-top"><span>Mode sistem</span><b>⌘</b></div><strong>Cloud</strong><small>Mode lokal dan hybrid menyusul</small></article></div><section className="section-block"><div className="section-title"><div><h2>Ruang kerja</h2><p>Akses cepat ke fungsi operasional pesantren.</p></div>{tenant && hasReadableModuleResource(tenant.permissions) && <button className="text-button" onClick={() => openModule("all")}>Lihat semua modul →</button>}</div><div className="module-grid">{modules.filter((item) => canSeeModuleCard(tenant?.permissions, item.key)).map((item) => <button key={item.key} className="module-card" onClick={() => item.key === "academic" ? openModule("academic-years") : item.key === "admissions" ? openAdmissions() : item.key === "finance" ? openOperations("finance") : item.key === "inventory" ? openOperations("inventory") : item.key === "library" ? openModule("library-catalog") : item.key === "hr" ? openHrWorkspace() : item.key === "cms" ? openModule("cms-pages") : item.key === "boarding" ? openModule("dormitories") : item.key === "crm" ? openModule("contacts") : openModule("campuses")}><span className="module-icon">{item.icon}</span><span className="module-state">{item.status}</span><strong>{item.name}</strong><small>{item.desc}</small><span className="module-arrow">↗</span></button>)}</div></section></>}
          {screen === "modules" && <ModuleWorkspace organizationId={tenant?.organizationId ?? "preview-only"} permissions={tenant?.permissions ?? PREVIEW_PERMISSIONS} initialResourceKey={moduleResource} onResourceChange={setModuleResource} preview={previewMode} />}
          {screen === "access" && tenant && <TenantAccessAdmin organizationId={tenant.organizationId} permissions={tenant.permissions} />}
          {screen === "operations" && <Operations organizationId={tenant?.organizationId ?? "preview-only"} permissions={tenant?.permissions ?? PREVIEW_PERMISSIONS} initialArea={operationsArea} />}
          {screen === "admissions" && <Admissions organizationId={tenant?.organizationId ?? "preview-only"} permissions={tenant?.permissions ?? PREVIEW_PERMISSIONS} />}
          {screen === "students" && <section className="table-card"><div className="table-toolbar"><div><h2>Daftar santri</h2><p>{students.length} data ditampilkan (maksimal 100)</p></div><button className="primary" onClick={() => setShowCreate((value) => !value)}>＋ Tambah santri</button></div>
            {showCreate && <form className="student-form" onSubmit={createStudent}><div className="form-context"><strong>{editingStudent ? "Perbarui data induk santri" : "Pendaftaran data induk santri"}</strong><p>{editingStudent ? "Perubahan data akan tercatat pada data tenant ini. Pastikan perubahan nomor induk dan kampus telah diverifikasi." : "Lengkapi identitas dan data operasional sesuai dokumen yang tersedia."}</p></div><div className="form-section"><h3>Identitas dan penempatan pendidikan</h3><p>Data inti untuk administrasi induk santri. Nomor induk harus unik di lingkungan pesantren.</p><div className="form-grid"><label>Nomor induk santri<input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required maxLength={64} /></label><label>Nama lengkap sesuai dokumen<input value={legalName} onChange={(e) => setLegalName(e.target.value)} required minLength={2} maxLength={160} /></label><label>Nama panggilan<input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} maxLength={160} /></label><label>ID kampus<input value={campusId} onChange={(e) => setCampusId(e.target.value)} placeholder="UUID kampus" required /></label><label>Tempat lahir<input value={profileData.placeOfBirth ?? ""} onChange={(e) => setProfileData(p => ({...p, placeOfBirth:e.target.value}))} maxLength={120} /></label><label>Tanggal lahir<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label><label>Jenis kelamin<select value={genderCode} onChange={(e) => setGenderCode(e.target.value)}><option value="unspecified">Tidak disebutkan</option><option value="male">Laki-laki</option><option value="female">Perempuan</option></select></label><label>Jalur pendidikan<select value={profileData.educationTrack ?? ""} onChange={(e) => setProfileData(p => ({...p, educationTrack:e.target.value}))}><option value="">Pilih jalur</option><option value="formal">Formal</option><option value="muadalah">Muadalah</option><option value="nonformal">Nonformal</option><option value="salafiyah">Salafiyah</option><option value="other">Lainnya</option></select></label><label>Status tempat tinggal<select value={profileData.boardingStatus ?? ""} onChange={(e) => setProfileData(p => ({...p, boardingStatus:e.target.value}))}><option value="">Pilih status</option><option value="mukim">Santri mukim</option><option value="non_mukim">Santri tidak mukim</option><option value="commuter">Pulang-pergi</option></select></label><label>Tahun masuk<input inputMode="numeric" value={profileData.admissionYear ?? ""} onChange={(e) => setProfileData(p => ({...p, admissionYear:e.target.value}))} maxLength={4} placeholder="2026" /></label><label>Agama<input value={profileData.religion ?? ""} onChange={(e) => setProfileData(p => ({...p, religion:e.target.value}))} maxLength={60} /></label><label>Kewarganegaraan<input value={profileData.nationality ?? ""} onChange={(e) => setProfileData(p => ({...p, nationality:e.target.value}))} maxLength={80} placeholder="Diisi sesuai dokumen" /></label><label>Tanggal mulai mondok<input type="date" value={profileData.entryDate ?? ""} onChange={(e) => setProfileData(p => ({...p, entryDate:e.target.value}))} /></label></div></div><div className="form-section"><h3>Orang tua dan wali</h3><p>Kontak keluarga untuk komunikasi resmi dan keadaan darurat. Isikan sesuai data yang tersedia.</p><div className="form-grid"><label>Nama ayah<input value={profileData.fatherName ?? ""} onChange={(e) => setProfileData(p => ({...p, fatherName:e.target.value}))} maxLength={160} /></label><label>Nama ibu<input value={profileData.motherName ?? ""} onChange={(e) => setProfileData(p => ({...p, motherName:e.target.value}))} maxLength={160} /></label><label>Nama wali (jika berbeda)<input value={profileData.guardianName ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianName:e.target.value}))} maxLength={160} /></label><label>Hubungan wali<input value={profileData.guardianRelation ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianRelation:e.target.value}))} maxLength={40} placeholder="Paman, bibi, dan sebagainya" /></label><label>Telepon wali<input type="tel" value={profileData.guardianPhone ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianPhone:e.target.value}))} maxLength={32} /></label><label>Email wali<input type="email" value={profileData.guardianEmail ?? ""} onChange={(e) => setProfileData(p => ({...p, guardianEmail:e.target.value}))} maxLength={254} /></label></div></div><div className="form-section"><h3>Alamat dan riwayat pendidikan</h3><p>Alamat domisili dan asal pendidikan sebagai data administrasi internal.</p><div className="form-grid"><label className="wide-field">Alamat lengkap<input value={profileData.homeAddress ?? ""} onChange={(e) => setProfileData(p => ({...p, homeAddress:e.target.value}))} maxLength={1000} /></label><label>Provinsi<input value={profileData.province ?? ""} onChange={(e) => setProfileData(p => ({...p, province:e.target.value}))} maxLength={100} /></label><label>Kabupaten/kota<input value={profileData.regency ?? ""} onChange={(e) => setProfileData(p => ({...p, regency:e.target.value}))} maxLength={100} /></label><label>Kecamatan<input value={profileData.district ?? ""} onChange={(e) => setProfileData(p => ({...p, district:e.target.value}))} maxLength={100} /></label><label>Desa/kelurahan<input value={profileData.village ?? ""} onChange={(e) => setProfileData(p => ({...p, village:e.target.value}))} maxLength={100} /></label><label>Kode pos<input value={profileData.postalCode ?? ""} onChange={(e) => setProfileData(p => ({...p, postalCode:e.target.value}))} maxLength={10} /></label><label>Asal sekolah<input value={profileData.originSchool ?? ""} onChange={(e) => setProfileData(p => ({...p, originSchool:e.target.value}))} maxLength={180} /></label><label>Pendidikan sebelumnya<input value={profileData.previousEducation ?? ""} onChange={(e) => setProfileData(p => ({...p, previousEducation:e.target.value}))} maxLength={120} /></label></div></div><div className="form-section"><h3>Penempatan asrama</h3><p>Diisi jika pesantren menyelenggarakan layanan asrama. Penempatan kamar dapat diperbarui melalui modul asrama.</p><div className="form-grid"><label>Nama asrama<input value={profileData.dormitoryName ?? ""} onChange={(e) => setProfileData(p => ({...p, dormitoryName:e.target.value}))} maxLength={120} /></label><label>Kode kamar<input value={profileData.roomCode ?? ""} onChange={(e) => setProfileData(p => ({...p, roomCode:e.target.value}))} maxLength={40} /></label><label>Kategori santri<input value={profileData.studentCategory ?? ""} onChange={(e) => setProfileData(p => ({...p, studentCategory:e.target.value}))} maxLength={40} placeholder="Reguler / beasiswa / lainnya" /></label></div></div><div className="privacy-note">Pelindungan data: jangan masukkan NIK/nomor KK, informasi kesehatan, biometrik, atau dokumen sensitif ke formulir ini. Kumpulkan data tambahan hanya melalui modul dengan hak akses dan dasar pemrosesan yang sesuai.</div><div className="form-actions"><button type="button" className="outline-button" onClick={() => { setShowCreate(false); setEditingStudent(null); }}>Batal</button><button className="primary" disabled={busy}>{busy ? "Menyimpan…" : editingStudent ? "Simpan perubahan" : "Simpan santri"}</button></div></form>}
            <div className="table-wrap"><table><thead><tr><th>Nomor induk</th><th>Nama santri</th><th>Tanggal lahir</th><th>Program</th><th>Tempat tinggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="mono">{student.studentNumber}</td><td><strong>{student.legalName}</strong>{student.preferredName && <small className="cell-sub">{student.preferredName}</small>}</td><td>{student.birthDate ? new Date(student.birthDate).toLocaleDateString("id-ID") : "—"}</td><td>{student.profileData?.educationTrack ?? "—"}</td><td>{student.profileData?.boardingStatus ?? "—"}</td><td><span className="status-chip">{student.status}</span></td><td>{tenant?.permissions.includes("academic.students.update") && <button type="button" className="outline-button" onClick={() => beginEditStudent(student)}>Ubah</button>}</td></tr>)}{students.length === 0 && <tr><td colSpan={7} className="empty-state">{busy ? "Memuat data…" : "Belum ada data santri. Tambahkan data pertama untuk memulai."}</td></tr>}</tbody></table></div>
          </section>}
        </>}
        <footer className="footer">PONDOK OS <span>•</span> {previewMode ? "Pratinjau lokal · data contoh sintetis · tanpa penyimpanan" : "Secure institution workspace"} <span>•</span> v0.1 foundation <SupportLink /></footer>
      </div>
    </main>
  </div>;
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient, getAccessToken, getCurrentUser } from "./auth";
import ModuleRegistryAdmin from "./ModuleRegistryAdmin";

type TenantRecord = {
  organizationId: string; name: string; slug: string; organizationType: string; status: string;
  createdAt: string; memberCount: number; planCode?: string | null; licenseStatus?: string | null; licenseEndsAt?: string | null;
};

type ActivationRequest = {
  id: string;
  requestedBy?: string;
  contactEmail: string;
  contactName: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: string;
  campusCode: string;
  campusName: string;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function platformRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Permintaan gagal (${response.status})`);
  return body as T;
}

export default function PlatformAdmin({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [mine, setMine] = useState<ActivationRequest[]>([]);
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationType, setOrganizationType] = useState("pesantren");
  const [campusCode, setCampusCode] = useState("UTAMA");
  const [campusName, setCampusName] = useState("Kampus Utama");
  const [activationToken, setActivationToken] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [own, admin, registry] = await Promise.all([
        platformRequest<{ data: ActivationRequest[] }>("/v1/platform/activation-requests/mine"),
        isSuperAdmin
          ? platformRequest<{ data: ActivationRequest[] }>("/v1/platform/admin/activation-requests")
          : Promise.resolve({ data: [] as ActivationRequest[] }),
        isSuperAdmin
          ? platformRequest<{ data: TenantRecord[] }>("/v1/platform/admin/tenants")
          : Promise.resolve({ data: [] as TenantRecord[] }),
      ]);
      setMine(own.data); setRequests(admin.data); setTenants(registry.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data aktivasi.");
    } finally { setBusy(false); }
  }, [isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void getCurrentUser().then((user) => {
      if (user?.email) setContactEmail(user.email);
      if (user?.name) setContactName(user.name);
      setEmailVerified(user?.emailVerified === true);
    }).catch(() => undefined);
  }, []);

  const sendVerificationCode = async () => {
    if (!authClient || !contactEmail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: contactEmail,
        type: "email-verification",
      });
      if (result.error) throw new Error(result.error.message);
      setNotice("Kode verifikasi dikirim ke email akun Anda. Periksa kotak masuk dan folder spam.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pengiriman kode verifikasi gagal.");
    } finally { setBusy(false); }
  };

  const verifyAccountEmail = async () => {
    if (!authClient || !contactEmail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: contactEmail, otp: verificationCode.trim() });
      if (result.error) throw new Error(result.error.message);
      setEmailVerified(true);
      setVerificationCode("");
      setNotice("Email berhasil diverifikasi. Anda sekarang dapat mengajukan aktivasi lembaga.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verifikasi email gagal.");
    } finally { setBusy(false); }
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await platformRequest("/v1/platform/activation-requests", {
        method: "POST",
        body: JSON.stringify({ contactEmail, contactName, organizationName, organizationSlug, organizationType, campusCode, campusName }),
      });
      setNotice("Permohonan aktivasi berhasil dikirim dan menunggu persetujuan perusahaan.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Permohonan aktivasi gagal.");
    } finally { setBusy(false); }
  };

  const approve = async (id: string) => {
    setBusy(true); setError(""); setNotice(""); setIssuedToken("");
    try {
      const result = await platformRequest<{ data: { activationToken: string; expiresInHours: number } }>(
        `/v1/platform/admin/activation-requests/${id}/approve`, { method: "POST", body: "{}" },
      );
      setIssuedToken(result.data.activationToken);
      setNotice("Aktivasi disetujui. Token hanya ditampilkan pada sesi ini; salin dan kirim melalui kanal resmi.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Persetujuan aktivasi gagal.");
    } finally { setBusy(false); }
  };

  const reject = async (id: string) => {
    const note = window.prompt("Alasan penolakan (minimal 3 karakter):");
    if (!note || note.trim().length < 3) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await platformRequest(`/v1/platform/admin/activation-requests/${id}/reject`, {
        method: "POST", body: JSON.stringify({ note }),
      });
      setNotice("Permohonan ditolak dan alasan tercatat pada audit.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Penolakan gagal.");
    } finally { setBusy(false); }
  };

  const redeem = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const activated = await platformRequest<{ data: { organizationId: string; campusId: string } }>("/v1/platform/activate", {
        method: "POST", body: JSON.stringify({ activationToken }),
      });
      localStorage.setItem("pondok.organizationId", activated.data.organizationId);
      localStorage.setItem(`pondok.campusId.${activated.data.organizationId}`, activated.data.campusId);
      setActivationToken("");
      setNotice("Aktivasi berhasil. Memuat workspace lembaga…");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Token aktivasi tidak dapat digunakan.");
    } finally { setBusy(false); }
  };


  const bootstrapFirstTenant = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await platformRequest<{ data: { organizationId: string; campusId: string } }>("/v1/platform/admin/bootstrap-first-tenant", {
        method: "POST",
        body: JSON.stringify({ contactName, organizationName, organizationSlug, organizationType, campusCode, campusName }),
      });
      localStorage.setItem("pondok.organizationId", result.data.organizationId);
      localStorage.setItem(`pondok.campusId.${result.data.organizationId}`, result.data.campusId);
      setNotice("Lembaga pertama berhasil dibuat. Workspace sedang dimuat…");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inisialisasi lembaga pertama gagal.");
    } finally { setBusy(false); }
  };

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const activeCount = tenants.filter((tenant) => tenant.status === "active").length;

  return <section className="platform-console">
    <div className="platform-heading">
      <div><div className="eyebrow">CENTRAL CONTROL PLANE</div><h2>{isSuperAdmin ? "PONDOK OS Command Center" : "Registrasi & aktivasi lembaga"}</h2>
        <p>{isSuperAdmin ? "Kelola permohonan, persetujuan dan aktivasi tenant dari pusat perusahaan." : "Ajukan aktivasi lembaga. Workspace akan dibuat setelah perusahaan menyetujui permohonan."}</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={busy}>Muat ulang</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    {!isSuperAdmin && <div className="platform-panel">
      <h3>Ajukan aktivasi PONDOK OS</h3>
      <p className="muted">Permohonan terikat pada akun yang sedang login. Email adalah kontak administrasi, bukan kredensial atau token keamanan.</p>
      <form className="platform-form" onSubmit={submitRequest}>
        <label>Nama penanggung jawab<input value={contactName} onChange={(event) => setContactName(event.target.value)} required maxLength={120}/></label>
        <label>Email akun terverifikasi<input type="email" value={contactEmail} readOnly required maxLength={254}/></label>
      {!emailVerified && <div className="form-section">
        <h3>Verifikasi email akun</h3>
        <p className="muted">Alamat email harus diverifikasi sebelum permohonan aktivasi dapat diproses. Kode berlaku 15 menit.</p>
        <div className="platform-actions">
          <button type="button" className="outline-button" onClick={() => void sendVerificationCode()} disabled={busy || !contactEmail}>Kirim kode verifikasi</button>
        </div>
        <div className="platform-redeem">
          <input inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={6} maxLength={8} required placeholder="Kode verifikasi email"/>
          <button type="button" className="primary" onClick={() => void verifyAccountEmail()} disabled={busy || verificationCode.length < 6}>Verifikasi email</button>
        </div>
      </div>}
        <label>Nama lembaga<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} onBlur={() => setOrganizationSlug(value => value || organizationName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""))} required minLength={3} maxLength={180}/></label>
        <label>Slug lembaga<input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} required maxLength={80}/></label>
        <label>Jenis lembaga<select value={organizationType} onChange={(event) => setOrganizationType(event.target.value)}><option value="pesantren">Pesantren</option><option value="madrasah">Madrasah</option><option value="sekolah">Sekolah</option><option value="yayasan">Yayasan</option><option value="other">Lainnya</option></select></label>
        <label>Kode kampus utama<input value={campusCode} onChange={(event) => setCampusCode(event.target.value.toUpperCase())} required maxLength={24}/></label>
        <label>Nama kampus utama<input value={campusName} onChange={(event) => setCampusName(event.target.value)} required maxLength={120}/></label>
        <button className="primary" disabled={busy || !emailVerified}>Kirim permohonan</button>
      </form>
    </div>}


    {isSuperAdmin && tenants.length === 0 && <div className="platform-panel">
      <h3>Inisialisasi lembaga pertama</h3>
      <p className="muted">Bootstrap satu kali untuk Development. Setelah lembaga pertama dibuat, formulir ini otomatis dinonaktifkan. Akun Super Admin ini juga menjadi Pemilik Institusi pertama.</p>
      <form className="platform-form" onSubmit={bootstrapFirstTenant}>
        <label>Nama resmi lembaga<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} onBlur={() => setOrganizationSlug(value => value || organizationName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""))} required minLength={3} maxLength={180}/></label>
        <label>Slug lembaga<input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} required maxLength={80}/></label>
        <label>Jenis lembaga<select value={organizationType} onChange={(event) => setOrganizationType(event.target.value)}><option value="pesantren">Pesantren</option><option value="madrasah">Madrasah</option><option value="sekolah">Sekolah</option><option value="yayasan">Yayasan</option><option value="other">Lainnya</option></select></label>
        <label>Kode kampus utama<input value={campusCode} onChange={(event) => setCampusCode(event.target.value.toUpperCase())} required maxLength={24}/></label>
        <label>Nama kampus utama<input value={campusName} onChange={(event) => setCampusName(event.target.value)} required maxLength={120}/></label>
        <button className="primary" disabled={busy}>Buat workspace lembaga pertama</button>
      </form>
    </div>}

    <div className="platform-metrics">
      <article><span>{isSuperAdmin ? "Permohonan menunggu" : "Permohonan Anda"}</span><strong>{isSuperAdmin ? pendingCount : mine.length}</strong></article>
      <article><span>{isSuperAdmin ? "Tenant diaktifkan" : "Disetujui / aktif"}</span><strong>{isSuperAdmin ? activeCount : mine.filter((item) => ["approved","activated"].includes(item.status)).length}</strong></article>
      <article><span>Menunggu keputusan</span><strong>{mine.filter((item) => item.status === "pending").length}</strong></article>
    </div>

    {isSuperAdmin && <ModuleRegistryAdmin />}

    {isSuperAdmin && <div className="platform-panel">
      <h3>Registry lembaga</h3>
      <p className="muted">Daftar tenant yang telah terbentuk. Status lisensi ditampilkan terpisah dari status organisasi.</p>
      <div className="platform-table-wrap"><table><thead><tr><th>Lembaga</th><th>Status organisasi</th><th>Pengguna aktif</th><th>Paket / lisensi</th><th>Dibuat</th></tr></thead>
        <tbody>{tenants.map((tenant) => <tr key={tenant.organizationId}>
          <td><strong>{tenant.name}</strong><small className="cell-sub">{tenant.slug} · {tenant.organizationType}</small></td>
          <td><span className="status-chip">{tenant.status}</span></td>
          <td>{tenant.memberCount}</td>
          <td>{tenant.planCode ?? "Belum ditetapkan"}<small className="cell-sub">{tenant.licenseStatus ?? "Lisensi belum dibuat"}</small></td>
          <td>{new Date(tenant.createdAt).toLocaleDateString("id-ID")}</td>
        </tr>)}
        {tenants.length === 0 && <tr><td colSpan={5} className="empty-state">{busy ? "Memuat registry…" : "Belum ada tenant terdaftar."}</td></tr>}</tbody>
      </table></div>
    </div>}

    <div className="platform-panel">
      <h3>{isSuperAdmin ? "Antrean permohonan aktivasi" : "Status permohonan saya"}</h3>
      <div className="platform-table-wrap"><table><thead><tr><th>Lembaga</th><th>Kontak</th><th>Status</th><th>Tanggal</th>{isSuperAdmin && <th>Aksi</th>}</tr></thead>
        <tbody>{(isSuperAdmin ? requests : mine).map((request) => <tr key={request.id}>
          <td><strong>{request.organizationName}</strong><small className="cell-sub">{request.organizationSlug} · {request.campusName}</small></td>
          <td>{request.contactName}<small className="cell-sub">{request.contactEmail}</small></td>
          <td><span className="status-chip">{request.status}</span>{request.reviewNote && <small className="cell-sub">{request.reviewNote}</small>}</td>
          <td>{new Date(request.createdAt).toLocaleDateString("id-ID")}</td>
          {isSuperAdmin && <td>{request.status === "pending" ? <div className="platform-actions"><button className="primary" disabled={busy} onClick={() => void approve(request.id)}>Setujui</button><button className="outline-button" disabled={busy} onClick={() => void reject(request.id)}>Tolak</button></div> : "—"}</td>}
        </tr>)}
        {(isSuperAdmin ? requests : mine).length === 0 && <tr><td colSpan={isSuperAdmin ? 5 : 4} className="empty-state">Belum ada permohonan.</td></tr>}</tbody>
      </table></div>
    </div>

    {issuedToken && <div className="platform-panel token-panel">
      <h3>Token aktivasi — tampil satu kali</h3>
      <p className="muted">Token terikat pada akun pemohon dan kedaluwarsa dalam 24 jam. Jangan kirim ke akun lain atau simpan pada repositori.</p>
      <code>{issuedToken}</code>
      <div className="platform-actions"><button className="primary" onClick={() => void navigator.clipboard.writeText(issuedToken)}>Salin token</button><button className="outline-button" onClick={() => setIssuedToken("")}>Tutup token</button></div>
    </div>}

    {mine.some((request) => request.status === "approved") && <div className="platform-panel">
      <h3>Masukkan kode aktivasi</h3>
      <p className="muted">Masukkan token resmi yang dikirim perusahaan untuk akun yang mengajukan permohonan ini.</p>
      <form className="platform-redeem" onSubmit={redeem}>
        <input type="password" value={activationToken} onChange={(event) => setActivationToken(event.target.value)} minLength={40} maxLength={128} autoComplete="off" required placeholder="Token aktivasi sekali pakai"/>
        <button className="primary" disabled={busy}>Aktifkan lembaga</button>
      </form>
    </div>}
  </section>;
}

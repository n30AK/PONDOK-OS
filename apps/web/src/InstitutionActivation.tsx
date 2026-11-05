import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient, getAccessToken, getCurrentUser } from "./auth";

type ActivationRequest = {
  id: string;
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

async function activationRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export default function InstitutionActivation() {
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await activationRequest<{ data: ActivationRequest[] }>("/v1/platform/activation-requests/mine");
      setRequests(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat permohonan aktivasi.");
    } finally {
      setBusy(false);
    }
  }, []);

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
      const result = await authClient.emailOtp.sendVerificationOtp({ email: contactEmail, type: "email-verification" });
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
      await activationRequest("/v1/platform/activation-requests", {
        method: "POST",
        body: JSON.stringify({ contactEmail, contactName, organizationName, organizationSlug, organizationType, campusCode, campusName }),
      });
      setNotice("Permohonan aktivasi berhasil dikirim dan menunggu persetujuan perusahaan.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Permohonan aktivasi gagal.");
    } finally { setBusy(false); }
  };

  const redeem = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const activated = await activationRequest<{ data: { organizationId: string; campusId: string } }>("/v1/platform/activate", {
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

  const approved = requests.some((request) => request.status === "approved");

  return <section className="platform-console">
    <div className="platform-heading">
      <div><div className="eyebrow">AKTIVASI PESANTREN</div><h2>Registrasi & aktivasi lembaga</h2>
        <p>Ajukan aktivasi lembaga. Workspace dibuat setelah perusahaan menyetujui permohonan Anda.</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={busy}>Muat ulang</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <div className="platform-panel">
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
        <label>Nama lembaga<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} onBlur={() => setOrganizationSlug((value) => value || organizationName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))} required minLength={3} maxLength={180}/></label>
        <label>Slug lembaga<input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required maxLength={80}/></label>
        <label>Jenis lembaga<select value={organizationType} onChange={(event) => setOrganizationType(event.target.value)}><option value="pesantren">Pesantren</option><option value="madrasah">Madrasah</option><option value="sekolah">Sekolah</option><option value="yayasan">Yayasan</option><option value="other">Lainnya</option></select></label>
        <label>Kode kampus utama<input value={campusCode} onChange={(event) => setCampusCode(event.target.value.toUpperCase())} required maxLength={24}/></label>
        <label>Nama kampus utama<input value={campusName} onChange={(event) => setCampusName(event.target.value)} required maxLength={120}/></label>
        <button className="primary" disabled={busy || !emailVerified}>Kirim permohonan</button>
      </form>
    </div>

    <div className="platform-metrics">
      <article><span>Permohonan Anda</span><strong>{requests.length}</strong></article>
      <article><span>Disetujui / aktif</span><strong>{requests.filter((item) => ["approved", "activated"].includes(item.status)).length}</strong></article>
      <article><span>Menunggu keputusan</span><strong>{requests.filter((item) => item.status === "pending").length}</strong></article>
    </div>

    <div className="platform-panel">
      <h3>Status permohonan saya</h3>
      <div className="platform-table-wrap"><table><thead><tr><th>Lembaga</th><th>Kontak</th><th>Status</th><th>Tanggal</th></tr></thead>
        <tbody>{requests.map((request) => <tr key={request.id}>
          <td><strong>{request.organizationName}</strong><small className="cell-sub">{request.organizationSlug} · {request.campusName}</small></td>
          <td>{request.contactName}<small className="cell-sub">{request.contactEmail}</small></td>
          <td><span className="status-chip">{request.status}</span>{request.reviewNote && <small className="cell-sub">{request.reviewNote}</small>}</td>
          <td>{new Date(request.createdAt).toLocaleDateString("id-ID")}</td>
        </tr>)}
        {requests.length === 0 && <tr><td colSpan={4} className="empty-state">{busy ? "Memuat permohonan…" : "Belum ada permohonan."}</td></tr>}</tbody>
      </table></div>
    </div>

    {approved && <div className="platform-panel">
      <h3>Masukkan kode aktivasi</h3>
      <p className="muted">Masukkan token resmi yang dikirim perusahaan untuk akun yang mengajukan permohonan ini.</p>
      <form className="platform-redeem" onSubmit={redeem}>
        <input type="password" value={activationToken} onChange={(event) => setActivationToken(event.target.value)} minLength={40} maxLength={128} autoComplete="off" required placeholder="Token aktivasi sekali pakai"/>
        <button className="primary" disabled={busy}>Aktifkan lembaga</button>
      </form>
    </div>}
  </section>;
}

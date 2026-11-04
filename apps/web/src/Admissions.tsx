import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Props = { organizationId: string; permissions: string[] };
type Period = {
  id: string; periodCode: string; name: string; opensAt: string; closesAt: string;
  status: string; campusId?: string | null; academicYearId?: string | null;
};
type Application = {
  id: string; admissionPeriodId: string; periodName: string; applicationNumber: string;
  applicantName: string; applicantBirthDate?: string | null; applicantGenderCode?: string | null;
  previousSchool?: string | null; guardianName?: string | null; guardianEmail?: string | null;
  guardianPhone?: string | null; address?: Record<string, string>; answers?: Record<string, string>;
  status: string; submittedAt?: string | null; reviewedAt?: string | null; linkedStudentId?: string | null;
};
type ApiResult<T> = { data: T; pagination?: { limit: number; returned: number } };
type Tab = "applications" | "periods";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const statusLabels: Record<string, string> = {
  draft: "Draft", submitted: "Dikirim", under_review: "Dalam seleksi",
  accepted: "Diterima", waitlisted: "Daftar tunggu", rejected: "Tidak diterima",
  withdrawn: "Mengundurkan diri", enrolled: "Daftar ulang"
};
const decisionLabels: Record<string, string> = {
  accepted: "Terima", waitlisted: "Daftar tunggu", rejected: "Tolak", needs_information: "Perlu informasi"
};

function localDateTime(daysFromNow: number): string {
  const value = new Date(Date.now() + daysFromNow * 86_400_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}
function displayDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function statusClass(status: string): string {
  if (status === "accepted" || status === "enrolled" || status === "open") return "ppdb-status good";
  if (status === "rejected" || status === "closed") return "ppdb-status muted-status";
  if (status === "submitted" || status === "under_review" || status === "waitlisted") return "ppdb-status pending";
  return "ppdb-status";
}

export default function Admissions({ organizationId, permissions }: Props) {
  const canManagePeriods = permissions.includes("admissions.periods.manage");
  const canRead = permissions.includes("admissions.applications.read");
  const canReview = permissions.includes("admissions.applications.review");
  const canSeeDocuments = permissions.includes("admissions.applications.documents");
  const canSeePrivate = canReview || canSeeDocuments;
  const canConvert = canReview && permissions.includes("academic.students.create");
  const [tab, setTab] = useState<Tab>("applications");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [conversionForm, setConversionForm] = useState<{ applicationId: string; studentNumber: string; campusId: string } | null>(null);
  const [periodForm, setPeriodForm] = useState({
    periodCode: "PPDB-2027", name: "Penerimaan Santri Baru 2027",
    opensAt: localDateTime(1), closesAt: localDateTime(120)
  });
  const [applicationForm, setApplicationForm] = useState({
    admissionPeriodId: "", applicationNumber: "", applicantName: "", applicantBirthDate: "",
    applicantGenderCode: "unspecified", previousSchool: "", guardianName: "",
    guardianPhone: "", guardianEmail: "", province: "", regency: "", district: "",
    educationTrack: "muadalah", boardingInterest: "mukim", motivation: ""
  });

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
    if (!response.ok) throw new Error(body.error ?? `Permintaan gagal (${response.status})`);
    return body as T;
  }, [organizationId]);

  const loadPeriods = useCallback(async () => {
    const result = await request<ApiResult<Period[]>>("/v1/admissions/periods");
    setPeriods(result.data);
    setApplicationForm((previous) => ({
      ...previous,
      admissionPeriodId: previous.admissionPeriodId || result.data.find((item) => item.status === "open")?.id || result.data[0]?.id || ""
    }));
  }, [request]);

  const loadApplications = useCallback(async (status = "") => {
    const query = status ? `?status=${encodeURIComponent(status)}&limit=100` : "?limit=100";
    const result = await request<ApiResult<Application[]>>(`/v1/admissions/applications${query}`);
    setApplications(result.data);
  }, [request]);

  const reload = useCallback(async () => {
    setBusy(true); setError("");
    try {
      await loadPeriods();
      if (canRead) await loadApplications(filter);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data PPDB.");
    } finally { setBusy(false); }
  }, [canRead, filter, loadApplications, loadPeriods]);

  useEffect(() => { void reload(); }, [reload]);

  const openPeriods = useMemo(() => periods.filter((period) => period.status === "open"), [periods]);
  const selectedPeriod = periods.find((period) => period.id === applicationForm.admissionPeriodId);

  const createPeriod = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/v1/admissions/periods", {
        method: "POST",
        body: JSON.stringify({
          periodCode: periodForm.periodCode.trim(), name: periodForm.name.trim(),
          opensAt: new Date(periodForm.opensAt).toISOString(),
          closesAt: new Date(periodForm.closesAt).toISOString()
        })
      });
      setShowPeriodForm(false);
      setNotice("Periode PPDB berhasil dibuat sebagai draft. Periode hanya dapat dibuka saat waktu pembukaan tiba.");
      await loadPeriods();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal membuat periode."); }
    finally { setBusy(false); }
  };

  const createApplication = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/v1/admissions/applications", {
        method: "POST",
        body: JSON.stringify({
          admissionPeriodId: applicationForm.admissionPeriodId,
          applicationNumber: applicationForm.applicationNumber.trim(),
          applicantName: applicationForm.applicantName.trim(),
          applicantBirthDate: applicationForm.applicantBirthDate || null,
          applicantGenderCode: applicationForm.applicantGenderCode,
          previousSchool: applicationForm.previousSchool || null,
          guardianName: applicationForm.guardianName.trim(),
          guardianPhone: applicationForm.guardianPhone.trim(),
          guardianEmail: applicationForm.guardianEmail || null,
          address: {
            province: applicationForm.province || null, regency: applicationForm.regency || null,
            district: applicationForm.district || null
          },
          answers: {
            educationTrack: applicationForm.educationTrack,
            boardingInterest: applicationForm.boardingInterest,
            motivation: applicationForm.motivation || null
          }
        })
      });
      setShowApplicationForm(false);
      setApplicationForm((previous) => ({
        ...previous, applicationNumber: "", applicantName: "", applicantBirthDate: "",
        previousSchool: "", guardianName: "", guardianPhone: "", guardianEmail: "",
        province: "", regency: "", district: "", motivation: ""
      }));
      setNotice("Draft pendaftaran berhasil dibuat.");
      await loadApplications(filter);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal membuat pendaftaran."); }
    finally { setBusy(false); }
  };

  const periodAction = async (period: Period, action: "open" | "close") => {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/v1/admissions/periods/${period.id}/${action}`, { method: "POST" });
      setNotice(action === "open" ? "Periode PPDB berhasil dibuka." : "Periode PPDB berhasil ditutup.");
      await loadPeriods();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Perubahan status periode gagal."); }
    finally { setBusy(false); }
  };

  const applicationAction = async (application: Application, action: "submit" | "review", decision?: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/v1/admissions/applications/${application.id}/${action}`, {
        method: "POST",
        ...(decision ? { body: JSON.stringify({ decision }) } : {})
      });
      setNotice(action === "submit" ? "Pendaftaran berhasil dikirim untuk seleksi." : `Keputusan “${decisionLabels[decision ?? ""]}” berhasil dicatat.`);
      await loadApplications(filter);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Tindakan pendaftaran gagal."); }
    finally { setBusy(false); }
  };


  const convertApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversionForm) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ data: { studentId: string; studentNumber: string; legalName: string } }>(
        `/v1/admissions/applications/${conversionForm.applicationId}/enroll`,
        { method: "POST", body: JSON.stringify({
          studentNumber: conversionForm.studentNumber.trim(),
          campusId: conversionForm.campusId.trim()
        }) }
      );
      setConversionForm(null);
      setNotice(`Pendaftar berhasil ditautkan ke data santri ${result.data.studentNumber}.`);
      await loadApplications(filter);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Konversi pendaftar gagal."); }
    finally { setBusy(false); }
  };

  return <section className="admissions-panel">
    <div className="admissions-heading">
      <div><div className="eyebrow">PENERIMAAN SANTRI BARU</div><h2>Manajemen PPDB</h2><p>Kelola periode penerimaan, pendaftaran, dan keputusan seleksi dalam ruang kerja tenant.</p></div>
      <button className="outline-button" onClick={() => void reload()} disabled={busy}>{busy ? "Memuat…" : "↻ Muat ulang"}</button>
    </div>
    <div className="ppdb-metrics">
      <article><span>Periode aktif</span><strong>{openPeriods.length}</strong></article>
      <article><span>Total pendaftar tampil</span><strong>{applications.length}</strong></article>
      <article><span>Menunggu seleksi</span><strong>{applications.filter((item) => ["submitted", "under_review"].includes(item.status)).length}</strong></article>
      <article><span>Diterima</span><strong>{applications.filter((item) => item.status === "accepted").length}</strong></article>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <div className="ppdb-tabs">
      <button className={tab === "applications" ? "operation-tab active" : "operation-tab"} onClick={() => setTab("applications")}>Pendaftaran & seleksi</button>
      <button className={tab === "periods" ? "operation-tab active" : "operation-tab"} onClick={() => setTab("periods")}>Periode penerimaan</button>
    </div>

    {tab === "periods" && <div className="ppdb-section">
      <div className="ppdb-toolbar"><div><h3>Periode penerimaan</h3><p>Periode dibuka hanya dalam rentang waktu yang telah ditentukan.</p></div>
        {canManagePeriods && <button className="primary" onClick={() => setShowPeriodForm((value) => !value)}>＋ Buat periode</button>}
      </div>
      {showPeriodForm && canManagePeriods && <form className="student-form" onSubmit={createPeriod}>
        <div className="form-context"><strong>Jadwal PPDB baru</strong><p>Pastikan zona waktu perangkat sesuai WIB/WITA/WIT. Server menyimpan waktu sebagai timestamp berzona.</p></div>
        <div className="form-grid">
          <label>Kode periode<input value={periodForm.periodCode} onChange={(event) => setPeriodForm((p) => ({ ...p, periodCode: event.target.value }))} required maxLength={32} /></label>
          <label>Nama periode<input value={periodForm.name} onChange={(event) => setPeriodForm((p) => ({ ...p, name: event.target.value }))} required maxLength={140} /></label>
          <label>Mulai pendaftaran<input type="datetime-local" value={periodForm.opensAt} onChange={(event) => setPeriodForm((p) => ({ ...p, opensAt: event.target.value }))} required /></label>
          <label>Tutup pendaftaran<input type="datetime-local" value={periodForm.closesAt} onChange={(event) => setPeriodForm((p) => ({ ...p, closesAt: event.target.value }))} required /></label>
        </div>
        <div className="form-actions"><button type="button" className="outline-button" onClick={() => setShowPeriodForm(false)}>Batal</button><button className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan periode"}</button></div>
      </form>}
      <div className="ppdb-period-grid">
        {periods.map((period) => <article className="ppdb-period-card" key={period.id}>
          <div className="ppdb-period-top"><span className={statusClass(period.status)}>{period.status}</span><span className="mono">{period.periodCode}</span></div>
          <h4>{period.name}</h4>
          <dl><div><dt>Pendaftaran dibuka</dt><dd>{displayDate(period.opensAt)}</dd></div><div><dt>Pendaftaran ditutup</dt><dd>{displayDate(period.closesAt)}</dd></div></dl>
          {canManagePeriods && <div className="ppdb-card-actions">
            {period.status === "draft" && <button className="primary" disabled={busy} onClick={() => void periodAction(period, "open")}>Buka periode</button>}
            {period.status === "open" && <button className="outline-button" disabled={busy} onClick={() => void periodAction(period, "close")}>Tutup periode</button>}
          </div>}
        </article>)}
        {periods.length === 0 && <div className="empty-state ppdb-empty">{busy ? "Memuat periode…" : "Belum ada periode penerimaan."}</div>}
      </div>
    </div>}

    {tab === "applications" && <div className="ppdb-section">
      <div className="ppdb-toolbar"><div><h3>Daftar pendaftaran</h3><p>Data pribadi wali hanya tampil bagi petugas yang memiliki izin seleksi atau dokumen.</p></div>
        {canReview && <button className="primary" onClick={() => setShowApplicationForm((value) => !value)}>＋ Buat draft pendaftar</button>}
      </div>
      {!canRead && <div className="alert warning">Akun ini belum memiliki izin admissions.applications.read.</div>}
      {showApplicationForm && canReview && <form className="student-form" onSubmit={createApplication}>
        <div className="form-context"><strong>Formulir pendaftaran kontekstual</strong><p>Isi data calon santri dan wali. Jangan masukkan NIK/KK atau informasi kesehatan pada formulir umum ini.</p></div>
        <div className="form-section"><h3>Periode dan identitas calon santri</h3><div className="form-grid">
          <label>Periode penerimaan<select value={applicationForm.admissionPeriodId} onChange={(event) => setApplicationForm((p) => ({ ...p, admissionPeriodId: event.target.value }))} required><option value="">Pilih periode</option>{periods.filter((item) => ["draft", "open"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.status})</option>)}</select></label>
          <label>Nomor pendaftaran<input value={applicationForm.applicationNumber} onChange={(event) => setApplicationForm((p) => ({ ...p, applicationNumber: event.target.value }))} required maxLength={64} placeholder="PPDB-2027-0001" /></label>
          <label>Nama lengkap calon santri<input value={applicationForm.applicantName} onChange={(event) => setApplicationForm((p) => ({ ...p, applicantName: event.target.value }))} required maxLength={180} /></label>
          <label>Tanggal lahir<input type="date" value={applicationForm.applicantBirthDate} onChange={(event) => setApplicationForm((p) => ({ ...p, applicantBirthDate: event.target.value }))} /></label>
          <label>Jenis kelamin<select value={applicationForm.applicantGenderCode} onChange={(event) => setApplicationForm((p) => ({ ...p, applicantGenderCode: event.target.value }))}><option value="unspecified">Tidak disebutkan</option><option value="male">Laki-laki</option><option value="female">Perempuan</option></select></label>
          <label>Asal sekolah<input value={applicationForm.previousSchool} onChange={(event) => setApplicationForm((p) => ({ ...p, previousSchool: event.target.value }))} maxLength={180} /></label>
        </div></div>
        <div className="form-section"><h3>Orang tua / wali</h3><p>Kontak wali dipakai untuk komunikasi resmi penerimaan.</p><div className="form-grid">
          <label>Nama wali<input value={applicationForm.guardianName} onChange={(event) => setApplicationForm((p) => ({ ...p, guardianName: event.target.value }))} required maxLength={180} /></label>
          <label>Nomor telepon wali<input type="tel" value={applicationForm.guardianPhone} onChange={(event) => setApplicationForm((p) => ({ ...p, guardianPhone: event.target.value }))} required maxLength={32} /></label>
          <label>Email wali<input type="email" value={applicationForm.guardianEmail} onChange={(event) => setApplicationForm((p) => ({ ...p, guardianEmail: event.target.value }))} maxLength={254} /></label>
          <label>Provinsi<input value={applicationForm.province} onChange={(event) => setApplicationForm((p) => ({ ...p, province: event.target.value }))} maxLength={500} /></label>
          <label>Kabupaten/kota<input value={applicationForm.regency} onChange={(event) => setApplicationForm((p) => ({ ...p, regency: event.target.value }))} maxLength={500} /></label>
          <label>Kecamatan<input value={applicationForm.district} onChange={(event) => setApplicationForm((p) => ({ ...p, district: event.target.value }))} maxLength={500} /></label>
        </div></div>
        <div className="form-section"><h3>Minat pendidikan dan pemondokan</h3><div className="form-grid">
          <label>Jalur pendidikan<select value={applicationForm.educationTrack} onChange={(event) => setApplicationForm((p) => ({ ...p, educationTrack: event.target.value }))}><option value="muadalah">Muadalah</option><option value="formal">Formal</option><option value="nonformal">Nonformal</option><option value="salafiyah">Salafiyah</option></select></label>
          <label>Minat pemondokan<select value={applicationForm.boardingInterest} onChange={(event) => setApplicationForm((p) => ({ ...p, boardingInterest: event.target.value }))}><option value="mukim">Santri mukim</option><option value="non_mukim">Tidak mukim</option></select></label>
          <label className="wide-field">Motivasi / catatan singkat<input value={applicationForm.motivation} onChange={(event) => setApplicationForm((p) => ({ ...p, motivation: event.target.value }))} maxLength={1000} /></label>
        </div></div>
        <div className="privacy-note">Privasi: data ini dibatasi sesuai hak akses tenant. NIK, nomor KK, riwayat kesehatan, biometrik, dan dokumen identitas tidak dikumpulkan melalui formulir umum ini.</div>
        <div className="form-actions"><button type="button" className="outline-button" onClick={() => setShowApplicationForm(false)}>Batal</button><button className="primary" disabled={busy || !selectedPeriod}>{busy ? "Menyimpan…" : "Simpan draft"}</button></div>
      </form>}
      {canRead && <div className="table-card ppdb-table-card"><div className="ppdb-filter"><label>Filter status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span>{applications.length} pendaftar</span></div>
        <div className="table-wrap"><table><thead><tr><th>No. pendaftaran</th><th>Calon santri</th><th>Periode</th><th>Status</th><th>Tanggal kirim</th>{canSeePrivate && <th>Kontak wali</th>}<th>Aksi</th></tr></thead><tbody>
          {applications.map((application) => <tr key={application.id}>
            <td className="mono">{application.applicationNumber}</td>
            <td><strong>{application.applicantName}</strong>{application.applicantBirthDate && <small className="cell-sub">{displayDate(application.applicantBirthDate)}</small>}</td>
            <td>{application.periodName}</td>
            <td><span className={statusClass(application.status)}>{statusLabels[application.status] ?? application.status}</span></td>
            <td>{displayDate(application.submittedAt)}</td>
            {canSeePrivate && <td>{application.guardianName ?? "—"}<small className="cell-sub">{application.guardianPhone ?? application.guardianEmail ?? "—"}</small></td>}
            <td><div className="ppdb-row-actions">
              {application.status === "draft" && <button className="outline-button" disabled={busy} onClick={() => void applicationAction(application, "submit")}>Kirim</button>}
              {canReview && ["submitted", "under_review"].includes(application.status) && <select aria-label={`Keputusan ${application.applicationNumber}`} defaultValue="" disabled={busy} onChange={(event) => { const decision = event.target.value; if (decision) void applicationAction(application, "review", decision); }}><option value="">Putuskan…</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
              {canConvert && application.status === "accepted" && !application.linkedStudentId && <button className="outline-button" disabled={busy} onClick={() => setConversionForm({ applicationId: application.id, studentNumber: "", campusId: localStorage.getItem(`pondok.campusId.${organizationId}`) ?? "" })}>Konversi</button>}
              {application.linkedStudentId && <span className="ppdb-status good">Terhubung</span>}
            </div>
            {application.linkedStudentId && <small className="cell-sub">ID santri: {application.linkedStudentId.slice(0, 8)}</small>}
            {conversionForm?.applicationId === application.id && <form className="ppdb-conversion-form" onSubmit={convertApplication}>
              <label>Nomor induk santri<input value={conversionForm.studentNumber} onChange={(event) => setConversionForm((current) => current ? { ...current, studentNumber: event.target.value } : current)} required maxLength={64} /></label>
              <label>ID kampus<input value={conversionForm.campusId} onChange={(event) => setConversionForm((current) => current ? { ...current, campusId: event.target.value } : current)} required placeholder="UUID kampus" /></label>
              <div className="ppdb-row-actions"><button type="button" className="outline-button" onClick={() => setConversionForm(null)}>Batal</button><button className="primary" disabled={busy}>{busy ? "Memproses…" : "Buat data santri"}</button></div>
            </form>}
          </td>
          </tr>)}
          {applications.length === 0 && <tr><td colSpan={canSeePrivate ? 7 : 6} className="empty-state">{busy ? "Memuat pendaftaran…" : "Belum ada pendaftar pada filter ini."}</td></tr>}
        </tbody></table></div>
      </div>}
    </div>}
    <p className="ppdb-footnote">Konversi pendaftar diterima menjadi profil santri kini tersedia bagi petugas dengan izin seleksi dan pembuatan data santri. Unggah/verifikasi dokumen, penjadwalan tes, daftar ulang, dan pembayaran masih memerlukan modul tersendiri. Alur lengkap tetap harus diuji sebelum dinyatakan operasional penuh.</p>
  </section>;
}

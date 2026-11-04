import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Publisher = { userId: string; status: string; grantedBy: string; createdAt: string; revokedAt?: string | null };
type ModuleRequest = {
  id: string; organizationId: string; organizationName: string; moduleId: string;
  moduleVersion: string; status: string; manifestDigest: string; submittedBy: string;
  createdAt: string; reviewedBy?: string | null; reviewedAt?: string | null;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function registryRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export default function ModuleRegistryAdmin() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [requests, setRequests] = useState<ModuleRequest[]>([]);
  const [publisherUserId, setPublisherUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [publisherResult, requestResult] = await Promise.all([
        registryRequest<{ data: Publisher[] }>("/v1/platform/admin/module-publishers"),
        registryRequest<{ data: ModuleRequest[] }>("/v1/platform/admin/modules/requests?status=submitted"),
      ]);
      setPublishers(publisherResult.data);
      setRequests(requestResult.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Module Registry belum dapat dimuat.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grantPublisher = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await registryRequest("/v1/platform/admin/module-publishers", {
        method: "POST", body: JSON.stringify({ userId: publisherUserId.trim() }),
      });
      setPublisherUserId("");
      setNotice("Hak penerbit modul berhasil diberikan kepada akun terverifikasi.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pemberian hak penerbit gagal.");
    } finally { setBusy(false); }
  };

  const revokePublisher = async (userId: string) => {
    if (!window.confirm("Cabut hak penerbit modul untuk akun ini?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await registryRequest(`/v1/platform/admin/module-publishers/${userId}/revoke`, { method: "POST", body: "{}" });
      setNotice("Hak penerbit modul telah dicabut.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pencabutan hak penerbit gagal.");
    } finally { setBusy(false); }
  };

  const review = async (requestId: string, action: "approve" | "reject") => {
    const note = action === "reject" ? window.prompt("Alasan penolakan (minimal 3 karakter):") : "";
    if (action === "reject" && (!note || note.trim().length < 3)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await registryRequest(`/v1/platform/admin/modules/requests/${requestId}/${action}`, {
        method: "POST", body: JSON.stringify(action === "reject" ? { note } : {}),
      });
      setNotice(action === "approve" ? "Modul disetujui. Modul belum terpasang sampai installer tepercaya tersedia." : "Permohonan modul ditolak dan alasannya tercatat.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Review modul gagal.");
    } finally { setBusy(false); }
  };

  return <section className="platform-panel">
    <div className="platform-heading">
      <div><h3>Module Registry & Publisher Governance</h3>
        <p className="muted">Penerbit terdaftar, antrean review, dan bukti audit. Persetujuan bukan instalasi otomatis.</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={busy}>Muat ulang</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <div className="form-section">
      <h4>Daftarkan penerbit modul</h4>
      <p className="muted">Masukkan UUID akun Neon Auth yang aktif dan sudah memverifikasi email. Hak penerbit tidak otomatis memberi hak Super Admin.</p>
      <form className="platform-redeem" onSubmit={grantPublisher}>
        <input value={publisherUserId} onChange={(event) => setPublisherUserId(event.target.value.trim())} required placeholder="UUID pengguna Neon Auth"/>
        <button className="primary" disabled={busy || !publisherUserId.trim()}>Berikan hak penerbit</button>
      </form>
    </div>

    <div className="platform-table-wrap"><table><thead><tr><th>User ID</th><th>Status</th><th>Diberikan</th><th>Aksi</th></tr></thead>
      <tbody>{publishers.map((publisher) => <tr key={publisher.userId}>
        <td><code>{publisher.userId}</code></td><td><span className="status-chip">{publisher.status}</span></td>
        <td>{new Date(publisher.createdAt).toLocaleDateString("id-ID")}</td>
        <td>{publisher.status === "active" ? <button type="button" className="outline-button" disabled={busy} onClick={() => void revokePublisher(publisher.userId)}>Cabut</button> : "—"}</td>
      </tr>)}
      {publishers.length === 0 && <tr><td colSpan={4} className="empty-state">{busy ? "Memuat penerbit…" : "Belum ada penerbit terdaftar."}</td></tr>}</tbody>
    </table></div>

    <div className="form-section">
      <h4>Antrean review modul</h4>
      <div className="platform-table-wrap"><table><thead><tr><th>Modul</th><th>Lembaga</th><th>Pengaju</th><th>Digest SHA-256</th><th>Aksi</th></tr></thead>
        <tbody>{requests.map((item) => <tr key={item.id}>
          <td><strong>{item.moduleId}</strong><small className="cell-sub">v{item.moduleVersion}</small></td>
          <td>{item.organizationName}</td><td><code>{item.submittedBy.slice(0, 8)}…</code></td>
          <td><code>{item.manifestDigest.slice(0, 16)}…</code></td>
          <td><div className="platform-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void review(item.id, "approve")}>Setujui</button>
            <button type="button" className="outline-button" disabled={busy} onClick={() => void review(item.id, "reject")}>Tolak</button>
          </div></td>
        </tr>)}
        {requests.length === 0 && <tr><td colSpan={5} className="empty-state">{busy ? "Memuat antrean…" : "Tidak ada permohonan menunggu."}</td></tr>}</tbody>
      </table></div>
    </div>
    <p className="muted">Paket modul yang disetujui tetap berstatus approved. Eksekusi migrasi, pemasangan kode, dan aktivasi menu dinonaktifkan sampai tanda tangan artefak, sandbox installer, rollback, dan verifikasi keamanan tersedia.</p>
  </section>;
}

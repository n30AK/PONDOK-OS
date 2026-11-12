import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "./auth";

type AuditEvent = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  occurred_at: string;
};

type Props = { organizationId: string };

export default function AuditEventsWorkspace({ organizationId }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const base = (import.meta.env.VITE_API_URL ?? "").replace(/\\/$/, "");
      const response = await fetch(`${base}/v1/audit/events?limit=100`, {
        headers: { authorization: `Bearer ${token}`, "x-organization-id": organizationId },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Riwayat audit tidak dapat dimuat.");
      setEvents(Array.isArray(body.data) ? body.data : []);
      setRefreshedAt(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Riwayat audit tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  return <section className="table-card">
    <div className="table-toolbar">
      <div>
        <h2>Jejak audit organisasi</h2>
        <p>Menampilkan maksimal 100 aktivitas terbaru. Metadata bebas dan identitas pelaku tidak ditampilkan pada tampilan ini.</p>
      </div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={loading}> {loading ? "Memuat…" : "Muat ulang"} </button>
    </div>
    {error && <div className="alert error">{error}</div>}
    {refreshedAt && <p className="muted">Terakhir diperbarui: {new Date(refreshedAt).toLocaleString("id-ID")}</p>}
    <div className="table-wrap">
      <table>
        <thead><tr><th>Waktu</th><th>Aktivitas</th><th>Jenis sumber daya</th><th>ID sumber daya</th></tr></thead>
        <tbody>
          {events.map((event) => <tr key={event.id}>
            <td>{Number.isNaN(Date.parse(event.occurred_at)) ? "—" : new Date(event.occurred_at).toLocaleString("id-ID")}</td>
            <td><strong>{event.action}</strong></td>
            <td>{event.resource_type}</td>
            <td className="mono">{event.resource_id ?? "—"}</td>
          </tr>)}
          {!loading && events.length === 0 && <tr><td colSpan={4} className="empty-state">Belum ada aktivitas audit yang dapat ditampilkan.</td></tr>}
          {loading && events.length === 0 && <tr><td colSpan={4} className="empty-state">Memuat riwayat aktivitas…</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

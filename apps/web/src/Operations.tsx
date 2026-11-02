import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Area = "finance" | "inventory" | "hr";
type Row = Record<string, unknown>;
type AreaData = Partial<Record<Area, Record<string, Row[]>>>;
type Props = { organizationId: string };

const columns: Record<Area, { title: string; path: string; fields: string[]; labels: string[] }[]> = {
  finance: [
    { title: "Bagan akun", path: "/v1/finance/accounts", fields: ["accountCode", "accountName", "accountType", "isActive"], labels: ["Kode", "Nama akun", "Jenis", "Aktif"] },
    { title: "Periode buku", path: "/v1/finance/periods", fields: ["code", "name", "startsOn", "endsOn", "status"], labels: ["Kode", "Periode", "Mulai", "Selesai", "Status"] },
    { title: "Jurnal", path: "/v1/finance/journals?limit=50", fields: ["entryNumber", "entryDate", "description", "debit", "credit", "status"], labels: ["Nomor", "Tanggal", "Keterangan", "Debit", "Kredit", "Status"] }
  ],
  inventory: [
    { title: "Barang", path: "/v1/inventory/items", fields: ["itemCode", "itemName", "unitCode", "onHand", "reorderLevel"], labels: ["Kode", "Nama barang", "Satuan", "Stok", "Batas minimum"] },
    { title: "Gudang", path: "/v1/inventory/warehouses", fields: ["warehouseCode", "warehouseName", "campusId", "isActive"], labels: ["Kode", "Nama gudang", "Kampus", "Aktif"] },
    { title: "Mutasi stok", path: "/v1/inventory/movements?limit=50", fields: ["itemName", "warehouseName", "movementType", "quantity", "occurredAt"], labels: ["Barang", "Gudang", "Jenis", "Jumlah", "Waktu"] }
  ],
  hr: [
    { title: "Pegawai", path: "/v1/hr/employees?limit=100", fields: ["employeeNumber", "legalName", "email", "joinedOn", "employmentStatus"], labels: ["NIP", "Nama", "Email", "Bergabung", "Status"] },
    { title: "Periode payroll", path: "/v1/hr/payroll/periods", fields: ["periodCode", "startsOn", "endsOn", "payDate", "status"], labels: ["Kode", "Mulai", "Selesai", "Tanggal bayar", "Status"] },
    { title: "Proses payroll", path: "/v1/hr/payroll/runs", fields: ["runNumber", "runType", "periodCode", "earnings", "deductions", "status"], labels: ["Nomor proses", "Jenis", "Periode", "Pendapatan", "Potongan", "Status"] }
  ]
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Operations({ organizationId }: Props) {
  const [area, setArea] = useState<Area>("finance");
  const [data, setData] = useState<AreaData>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getAccessToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => ({})) as { data?: Row[] | Row; error?: string };
    if (!response.ok) throw new Error(body.error ?? `Permintaan gagal (${response.status})`);
    return body.data;
  }, [organizationId]);

  const reload = useCallback(async (selected: Area) => {
    setBusy(true); setError("");
    try {
      const results = await Promise.all(columns[selected].map(async (item) => {
        const result = await request(item.path);
        return [item.path, Array.isArray(result) ? result : result ? [result] : []] as const;
      }));
      setData((previous) => ({ ...previous, [selected]: Object.fromEntries(results) as Record<string, Row[]> }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data operasional.");
    } finally { setBusy(false); }
  }, [request]);

  useEffect(() => { void reload(area); }, [area, reload]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      let path = "";
      let payload: Row = {};
      if (area === "finance" && form.kind === "account") {
        path = "/v1/finance/accounts";
        payload = { accountCode: form.code, accountName: form.name, accountType: form.type };
      } else if (area === "finance" && form.kind === "period") {
        path = "/v1/finance/periods";
        payload = { code: form.code, name: form.name, startsOn: form.startsOn, endsOn: form.endsOn };
      } else if (area === "inventory" && form.kind === "item") {
        path = "/v1/inventory/items";
        payload = { itemCode: form.code, itemName: form.name, unitCode: form.unit, reorderLevel: Number(form.reorderLevel || 0) };
      } else if (area === "inventory" && form.kind === "warehouse") {
        path = "/v1/inventory/warehouses";
        payload = { warehouseCode: form.code, warehouseName: form.name };
      } else if (area === "hr" && form.kind === "employee") {
        path = "/v1/hr/employees";
        payload = { employeeNumber: form.code, legalName: form.name, joinedOn: form.joinedOn, email: form.email || null, phone: form.phone || null };
      } else if (area === "hr" && form.kind === "payroll-period") {
        path = "/v1/hr/payroll/periods";
        payload = { periodCode: form.code, startsOn: form.startsOn, endsOn: form.endsOn, payDate: form.payDate };
      }
      if (!path) throw new Error("Pilih jenis data yang akan dibuat.");
      await request(path, { method: "POST", body: JSON.stringify(payload) });
      setForm({}); setShowForm(false); setNotice("Data berhasil disimpan.");
      await reload(area);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan data.");
    } finally { setBusy(false); }
  };

  const forms: Record<Area, { value: string; label: string }[]> = {
    finance: [{ value: "account", label: "Tambah akun" }, { value: "period", label: "Buat periode buku" }],
    inventory: [{ value: "item", label: "Tambah barang" }, { value: "warehouse", label: "Tambah gudang" }],
    hr: [{ value: "employee", label: "Tambah pegawai" }, { value: "payroll-period", label: "Buat periode payroll" }]
  };
  const selectedForm = forms[area].find((item) => item.value === form.kind)?.value ?? forms[area][0]?.value;
  const update = (key: string, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  return <section className="operations-panel">
    <div className="operations-heading">
      <div><div className="eyebrow">OPERASIONAL INSTITUSI</div><h2>Ruang kerja operasional</h2><p>Kelola data dasar melalui API tenant dan hak akses yang berlaku.</p></div>
      <button className="outline-button" onClick={() => void reload(area)} disabled={busy}>{busy ? "Memuat…" : "↻ Muat ulang"}</button>
    </div>
    <div className="operations-tabs">
      {(["finance", "inventory", "hr"] as Area[]).map((item) => <button key={item} className={area === item ? "operation-tab active" : "operation-tab"} onClick={() => { setArea(item); setShowForm(false); setForm({}); }}>
        {item === "finance" ? "Keuangan & Akuntansi" : item === "inventory" ? "Inventaris" : "SDM & Payroll"}
      </button>)}
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <div className="operations-actions">
      <label>Jenis data<select value={selectedForm} onChange={(event) => setForm({ kind: event.target.value })}>{forms[area].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button className="primary" onClick={() => { setForm((previous) => ({ ...previous, kind: selectedForm ?? "" })); setShowForm((value) => !value); }}>{showForm ? "Tutup formulir" : "+ Tambah data"}</button>
    </div>
    {showForm && <form className="student-form operations-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Kode<input value={form.code ?? ""} onChange={(event) => update("code", event.target.value)} required maxLength={64} /></label>
        <label>Nama<input value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} required maxLength={180} /></label>
        {area === "finance" && form.kind === "account" && <label>Jenis akun<select value={form.type ?? "asset"} onChange={(event) => update("type", event.target.value)}><option value="asset">Aset</option><option value="liability">Liabilitas</option><option value="equity">Ekuitas</option><option value="revenue">Pendapatan</option><option value="expense">Beban</option></select></label>}
        {area === "finance" && form.kind === "period" && <><label>Tanggal mulai<input type="date" value={form.startsOn ?? ""} onChange={(event) => update("startsOn", event.target.value)} required /></label><label>Tanggal selesai<input type="date" value={form.endsOn ?? ""} onChange={(event) => update("endsOn", event.target.value)} required /></label></>}
        {area === "inventory" && form.kind === "item" && <><label>Satuan<input value={form.unit ?? ""} onChange={(event) => update("unit", event.target.value)} placeholder="pcs, kg, liter" required maxLength={16} /></label><label>Batas minimum<input type="number" min="0" step="0.001" value={form.reorderLevel ?? "0"} onChange={(event) => update("reorderLevel", event.target.value)} /></label></>}
        {area === "hr" && form.kind === "employee" && <><label>Tanggal bergabung<input type="date" value={form.joinedOn ?? ""} onChange={(event) => update("joinedOn", event.target.value)} required /></label><label>Email<input type="email" value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} /></label><label>Telepon<input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} maxLength={32} /></label></>}
        {area === "hr" && form.kind === "payroll-period" && <><label>Tanggal mulai<input type="date" value={form.startsOn ?? ""} onChange={(event) => update("startsOn", event.target.value)} required /></label><label>Tanggal selesai<input type="date" value={form.endsOn ?? ""} onChange={(event) => update("endsOn", event.target.value)} required /></label><label>Tanggal bayar<input type="date" value={form.payDate ?? ""} onChange={(event) => update("payDate", event.target.value)} required /></label></>}
      </div>
      <div className="form-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Batal</button><button className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
    </form>}
    <div className="operations-datasets">
      {columns[area].map((item) => {
        const rows = data[area]?.[item.path] ?? [];
        return <article className="table-card operation-table" key={item.path}>
          <div className="table-toolbar"><div><h3>{item.title}</h3><p>{rows.length} data</p></div></div>
          <div className="table-wrap"><table><thead><tr>{item.labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
            {rows.map((row, index) => <tr key={String(row.id ?? index)}>{item.fields.map((field) => <td key={field}>{display(row[field])}</td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={item.fields.length} className="empty-state">{busy ? "Memuat…" : "Belum ada data."}</td></tr>}
          </tbody></table></div>
        </article>;
      })}
    </div>
    <p className="operations-footnote">Tindakan posting jurnal, persetujuan/pembayaran payroll, dan mutasi stok memerlukan hak akses khusus dan masih dilakukan melalui endpoint operasional; formulir di atas hanya membuat data dasar.</p>
  </section>;
}

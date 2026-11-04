import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getAccessToken } from "./auth";

type Area = "finance" | "inventory" | "hr";
type Row = Record<string, unknown>;
type AreaData = Partial<Record<Area, Record<string, Row[]>>>;
type Props = { organizationId: string; permissions: string[]; initialArea?: Area };

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const columns: Record<Area, { title: string; path: string; fields: string[]; labels: string[]; read: string; write: string }[]> = {
  finance: [
    { title: "Bagan akun", path: "/v1/finance/accounts", fields: ["accountCode", "accountName", "accountType", "isActive"], labels: ["Kode", "Nama akun", "Jenis", "Aktif"], read: "finance.accounts.read", write: "finance.accounts.write" },
    { title: "Periode buku", path: "/v1/finance/periods", fields: ["code", "name", "startsOn", "endsOn", "status"], labels: ["Kode", "Periode", "Mulai", "Selesai", "Status"], read: "finance.journals.read", write: "finance.periods.manage" },
    { title: "Jurnal", path: "/v1/finance/journals?limit=50", fields: ["entryNumber", "entryDate", "description", "debit", "credit", "status"], labels: ["Nomor", "Tanggal", "Keterangan", "Debit", "Kredit", "Status"], read: "finance.journals.read", write: "finance.journals.write" }
  ],
  inventory: [
    { title: "Barang", path: "/v1/inventory/items", fields: ["itemCode", "itemName", "unitCode", "onHand", "reorderLevel"], labels: ["Kode", "Nama barang", "Satuan", "Stok", "Batas minimum"], read: "inventory.items.read", write: "inventory.items.write" },
    { title: "Gudang", path: "/v1/inventory/warehouses", fields: ["warehouseCode", "warehouseName", "campusId", "isActive"], labels: ["Kode", "Nama gudang", "Kampus", "Aktif"], read: "inventory.items.read", write: "inventory.items.write" },
    { title: "Mutasi stok", path: "/v1/inventory/movements?limit=50", fields: ["itemName", "warehouseName", "movementType", "quantity", "occurredAt"], labels: ["Barang", "Gudang", "Jenis", "Jumlah", "Waktu"], read: "inventory.movements.read", write: "inventory.movements.write" }
  ],
  hr: [
    { title: "Pegawai", path: "/v1/hr/employees?limit=100", fields: ["employeeNumber", "legalName", "email", "joinedOn", "employmentStatus"], labels: ["NIP", "Nama", "Email", "Bergabung", "Status"], read: "hr.employees.read", write: "hr.employees.write" },
    { title: "Periode payroll", path: "/v1/hr/payroll/periods", fields: ["periodCode", "startsOn", "endsOn", "payDate", "status"], labels: ["Kode", "Mulai", "Selesai", "Tanggal bayar", "Status"], read: "hr.payroll.read", write: "hr.payroll.prepare" },
    { title: "Proses payroll", path: "/v1/hr/payroll/runs", fields: ["runNumber", "runType", "periodCode", "earnings", "deductions", "status"], labels: ["Nomor proses", "Jenis", "Periode", "Pendapatan", "Potongan", "Status"], read: "hr.payroll.read", write: "hr.payroll.prepare" }
  ]
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Operations({ organizationId, permissions, initialArea = "finance" }: Props) {
  const [area, setArea] = useState<Area>(initialArea);
  useEffect(() => { setArea(initialArea); setShowForm(false); setForm({}); }, [initialArea]);
  const [data, setData] = useState<AreaData>({});
  const [campuses, setCampuses] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
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
    const body = await response.json().catch(() => ({})) as { data?: Row[] | Row; error?: string };
    if (!response.ok) throw new Error(body.error ?? `Permintaan gagal (${response.status})`);
    return body.data;
  }, [organizationId]);

  const reload = useCallback(async (selected: Area) => {
    setBusy(true); setError("");
    try {
      const readable = columns[selected].filter((item) => permissions.includes(item.read));
      const results = await Promise.all(readable.map(async (item) => {
        const result = await request(item.path);
        return [item.path, Array.isArray(result) ? result : result ? [result] : []] as const;
      }));
      setData((previous) => ({ ...previous, [selected]: Object.fromEntries(results) as Record<string, Row[]> }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data operasional.");
    } finally { setBusy(false); }
  }, [request, permissions]);

  const availableAreas = (["finance", "inventory", "hr"] as Area[]).filter((item) => columns[item].some((entry) => permissions.includes(entry.read)));
  const canReadArea = (selected: Area) => columns[selected].some((item) => permissions.includes(item.read));

  useEffect(() => { if (canReadArea(area)) void reload(area); }, [area, reload, permissions]);
  useEffect(() => {
    let active = true;
    void request("/v1/modules/campuses").then((result) => {
      if (active) setCampuses(Array.isArray(result) ? result : []);
    }).catch(() => { if (active) setCampuses([]); });
    return () => { active = false; };
  }, [request]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      let path = "";
      let payload: Row = {};
      if (area === "finance" && form.kind === "journal") {
        path = "/v1/finance/journals";
        const amount = Number(form.amount);
        if (form.debitAccountId === form.creditAccountId) throw new Error("Akun debit dan kredit harus berbeda.");
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal jurnal harus lebih besar dari nol.");
        payload = {
          fiscalPeriodId: form.fiscalPeriodId, entryNumber: form.entryNumber,
          entryDate: form.entryDate, description: form.description,
          lines: [
            { accountId: form.debitAccountId, debit: amount, credit: 0, description: form.description },
            { accountId: form.creditAccountId, debit: 0, credit: amount, description: form.description }
          ]
        };
      } else if (area === "inventory" && form.kind === "movement") {
        path = "/v1/inventory/movements";
        payload = {
          itemId: form.itemId, movementType: form.movementType || "receipt", quantity: Number(form.quantity),
          unitCost: form.unitCost ? Number(form.unitCost) : null,
          warehouseId: form.warehouseId || undefined,
          fromWarehouseId: form.fromWarehouseId || undefined,
          toWarehouseId: form.toWarehouseId || undefined,
          notes: form.notes || null
        };
      } else if (area === "finance" && form.kind === "account") {
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
        payload = { warehouseCode: form.code, warehouseName: form.name, campusId: form.campusId || null };
      } else if (area === "hr" && form.kind === "employee") {
        path = "/v1/hr/employees";
        payload = { employeeNumber: form.code, legalName: form.name, campusId: form.campusId || null, joinedOn: form.joinedOn, email: form.email || null, phone: form.phone || null };
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

  const forms: Record<Area, { value: string; label: string; permission: string }[]> = {
    finance: [
      { value: "account", label: "Tambah akun", permission: "finance.accounts.write" },
      { value: "period", label: "Buat periode buku", permission: "finance.periods.manage" },
      { value: "journal", label: "Buat jurnal seimbang", permission: "finance.journals.write" }
    ],
    inventory: [
      { value: "item", label: "Tambah barang", permission: "inventory.items.write" },
      { value: "warehouse", label: "Tambah gudang", permission: "inventory.items.write" },
      { value: "movement", label: "Catat mutasi stok", permission: "inventory.movements.write" }
    ],
    hr: [
      { value: "employee", label: "Tambah pegawai", permission: "hr.employees.write" },
      { value: "payroll-period", label: "Buat periode payroll", permission: "hr.payroll.prepare" }
    ]
  };
  const allowedForms = forms[area].filter((item) => permissions.includes(item.permission));
  const selectedForm = allowedForms.find((item) => item.value === form.kind)?.value ?? allowedForms[0]?.value;
  const update = (key: string, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  if (!canReadArea(area)) return <section className="operations-panel">
    <div className="operations-heading"><div><div className="eyebrow">OPERASIONAL INSTITUSI</div><h2>{area === "finance" ? "Keuangan & Akuntansi" : area === "inventory" ? "Inventaris" : "SDM & Payroll"}</h2><p>Akses ke ruang kerja ini belum diberikan kepada akun Anda.</p></div></div>
    <div className="alert warning">Tidak ada izin baca yang sesuai untuk modul ini. Menu tidak akan dialihkan ke modul lain. Hubungi administrator institusi untuk penyesuaian peran.</div>
    {availableAreas.length > 0 && <div className="operations-tabs">{availableAreas.map((item) => <button key={item} className="operation-tab" onClick={() => setArea(item)}>{item === "finance" ? "Keuangan & Akuntansi" : item === "inventory" ? "Inventaris" : "SDM & Payroll"}</button>)}</div>}
  </section>;

  return <section className="operations-panel">
    <div className="operations-heading">
      <div><div className="eyebrow">OPERASIONAL INSTITUSI</div><h2>Ruang kerja operasional</h2><p>Kelola data dasar melalui API tenant dan hak akses yang berlaku.</p></div>
      <button className="outline-button" onClick={() => void reload(area)} disabled={busy}>{busy ? "Memuat…" : "↻ Muat ulang"}</button>
    </div>
    <div className="operations-tabs">
      {availableAreas.map((item) => <button key={item} className={area === item ? "operation-tab active" : "operation-tab"} onClick={() => { setArea(item); setShowForm(false); setForm({}); }}>
        {item === "finance" ? "Keuangan & Akuntansi" : item === "inventory" ? "Inventaris" : "SDM & Payroll"}
      </button>)}
    </div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    {allowedForms.length > 0 && <div className="operations-actions">
      <label>Jenis data<select value={selectedForm} onChange={(event) => setForm({ kind: event.target.value })}>{allowedForms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button className="primary" onClick={() => { setForm((previous) => ({ ...previous, kind: selectedForm ?? "" })); setShowForm((value) => !value); }}>{showForm ? "Tutup formulir" : "+ Tambah data"}</button>
    </div>}
    {showForm && <form className="student-form operations-form" onSubmit={submit}>
      <div className="form-context"><strong>{area === "finance" && form.kind === "account" ? "Master bagan akun" : area === "finance" && form.kind === "journal" ? "Jurnal umum berpasangan" : area === "finance" ? "Periode pembukuan" : area === "inventory" && form.kind === "item" ? "Master barang persediaan" : area === "inventory" && form.kind === "movement" ? "Penerimaan, pengeluaran, atau transfer stok" : area === "inventory" ? "Lokasi penyimpanan" : form.kind === "employee" ? "Data induk pegawai" : "Periode penggajian"}</strong><p>{area === "finance" && form.kind === "account" ? "Gunakan kode akun yang konsisten dengan struktur laporan keuangan pesantren." : area === "finance" && form.kind === "journal" ? "Jurnal draft wajib seimbang; lampirkan bukti transaksi melalui prosedur arsip lembaga sebelum posting." : area === "finance" ? "Tanggal awal dan akhir menentukan transaksi yang boleh dicatat pada periode ini." : area === "inventory" && form.kind === "item" ? "Satuan dan batas minimum dipakai untuk pengendalian persediaan." : area === "inventory" && form.kind === "movement" ? "Mutasi tersimpan sebagai ledger. Transfer mencatat keluar dan masuk sebagai satu grup." : area === "inventory" ? "Gudang harus dikaitkan dengan kampus yang benar bila lokasi bersifat spesifik." : form.kind === "employee" ? "Nomor pegawai adalah identitas internal; jangan gunakan NIK sebagai nomor pegawai." : "Periode payroll menentukan rentang kerja dan tanggal pembayaran."}</p></div><div className="form-grid">
        <label>{area === "finance" && form.kind === "account" ? "Kode akun" : area === "finance" ? "Kode periode buku" : area === "inventory" && form.kind === "item" ? "Kode barang" : area === "inventory" ? "Kode gudang" : form.kind === "employee" ? "Nomor pegawai" : "Kode periode payroll"}<input value={form.code ?? ""} onChange={(event) => update("code", event.target.value)} required maxLength={64} /></label>
        {form.kind !== "payroll-period" && <label>{area === "finance" && form.kind === "account" ? "Nama akun" : area === "finance" ? "Nama periode buku" : area === "inventory" && form.kind === "item" ? "Nama barang" : area === "inventory" ? "Nama gudang" : "Nama lengkap pegawai"}<input value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} required maxLength={180} /></label>}
        {area === "finance" && form.kind === "journal" && <><label>Periode buku<select value={form.fiscalPeriodId ?? ""} onChange={(event) => update("fiscalPeriodId", event.target.value)} required><option value="">Pilih periode terbuka</option>{(data.finance?.["/v1/finance/periods"] ?? []).filter((row) => row.status === "open").map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)} ({String(row.code)})</option>)}</select></label><label>Nomor jurnal<input value={form.entryNumber ?? ""} onChange={(event) => update("entryNumber", event.target.value)} required maxLength={64} /></label><label>Tanggal jurnal<input type="date" value={form.entryDate ?? ""} onChange={(event) => update("entryDate", event.target.value)} required /></label><label className="wide-field">Keterangan<input value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} required maxLength={500} /></label><label>Akun debit<select value={form.debitAccountId ?? ""} onChange={(event) => update("debitAccountId", event.target.value)} required><option value="">Pilih akun debit</option>{(data.finance?.["/v1/finance/accounts"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.accountCode)} — {String(row.accountName)}</option>)}</select></label><label>Akun kredit<select value={form.creditAccountId ?? ""} onChange={(event) => update("creditAccountId", event.target.value)} required><option value="">Pilih akun kredit</option>{(data.finance?.["/v1/finance/accounts"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.accountCode)} — {String(row.accountName)}</option>)}</select></label><label>Nominal debit = kredit (IDR)<input type="number" min="0.01" step="0.01" value={form.amount ?? ""} onChange={(event) => update("amount", event.target.value)} required /></label><p className="field-hint">Form ini membuat jurnal draft dua baris dengan debit dan kredit sama. Posting final tetap memerlukan hak finance.journals.post dan pemeriksaan bukti transaksi.</p></>}
        {area === "inventory" && form.kind === "movement" && <><label>Jenis mutasi<select value={form.movementType ?? "receipt"} onChange={(event) => update("movementType", event.target.value)}><option value="receipt">Penerimaan</option><option value="issue">Pengeluaran</option><option value="transfer">Transfer antar gudang</option></select></label><label>Barang<select value={form.itemId ?? ""} onChange={(event) => update("itemId", event.target.value)} required><option value="">Pilih barang</option>{(data.inventory?.["/v1/inventory/items"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.itemCode)} — {String(row.itemName)}</option>)}</select></label>{form.movementType === "transfer" ? <><label>Gudang asal<select value={form.fromWarehouseId ?? ""} onChange={(event) => update("fromWarehouseId", event.target.value)} required><option value="">Pilih gudang asal</option>{(data.inventory?.["/v1/inventory/warehouses"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.warehouseCode)} — {String(row.warehouseName)}</option>)}</select></label><label>Gudang tujuan<select value={form.toWarehouseId ?? ""} onChange={(event) => update("toWarehouseId", event.target.value)} required><option value="">Pilih gudang tujuan</option>{(data.inventory?.["/v1/inventory/warehouses"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.warehouseCode)} — {String(row.warehouseName)}</option>)}</select></label></> : <label>Gudang<select value={form.warehouseId ?? ""} onChange={(event) => update("warehouseId", event.target.value)} required><option value="">Pilih gudang</option>{(data.inventory?.["/v1/inventory/warehouses"] ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.warehouseCode)} — {String(row.warehouseName)}</option>)}</select></label>}<label>Jumlah<input type="number" min="0.001" step="0.001" value={form.quantity ?? ""} onChange={(event) => update("quantity", event.target.value)} required /></label><label>Harga satuan (opsional)<input type="number" min="0" step="0.01" value={form.unitCost ?? ""} onChange={(event) => update("unitCost", event.target.value)} /></label><label className="wide-field">Catatan / referensi<input value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} maxLength={500} /></label></>}
        {area === "finance" && form.kind === "account" && <label>Jenis akun<select value={form.type ?? "asset"} onChange={(event) => update("type", event.target.value)}><option value="asset">Aset</option><option value="liability">Liabilitas</option><option value="equity">Ekuitas</option><option value="revenue">Pendapatan</option><option value="expense">Beban</option></select></label>}
        {area === "finance" && form.kind === "period" && <><label>Tanggal mulai<input type="date" value={form.startsOn ?? ""} onChange={(event) => update("startsOn", event.target.value)} required /></label><label>Tanggal selesai<input type="date" value={form.endsOn ?? ""} onChange={(event) => update("endsOn", event.target.value)} required /></label></>}
        {area === "inventory" && form.kind === "warehouse" && <label>Kampus (opsional)<select value={form.campusId ?? ""} onChange={(event) => update("campusId", event.target.value)}><option value="">Semua / tidak ditentukan</option>{campuses.map((campus) => <option key={String(campus.id)} value={String(campus.id)}>{String(campus.code ?? "")} — {String(campus.name ?? "Kampus")}</option>)}</select></label>}
        {area === "inventory" && form.kind === "item" && <><label>Satuan<input value={form.unit ?? ""} onChange={(event) => update("unit", event.target.value)} placeholder="pcs, kg, liter" required maxLength={16} /></label><label>Batas minimum<input type="number" min="0" step="0.001" value={form.reorderLevel ?? "0"} onChange={(event) => update("reorderLevel", event.target.value)} /></label></>}
        {area === "hr" && form.kind === "employee" && <><label>Kampus (opsional)<select value={form.campusId ?? ""} onChange={(event) => update("campusId", event.target.value)}><option value="">Semua / tidak ditentukan</option>{campuses.map((campus) => <option key={String(campus.id)} value={String(campus.id)}>{String(campus.code ?? "")} — {String(campus.name ?? "Kampus")}</option>)}</select></label><label>Tanggal bergabung<input type="date" value={form.joinedOn ?? ""} onChange={(event) => update("joinedOn", event.target.value)} required /></label><label>Email<input type="email" value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} /></label><label>Telepon<input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} maxLength={32} /></label></>}
        {area === "hr" && form.kind === "payroll-period" && <><label>Tanggal mulai<input type="date" value={form.startsOn ?? ""} onChange={(event) => update("startsOn", event.target.value)} required /></label><label>Tanggal selesai<input type="date" value={form.endsOn ?? ""} onChange={(event) => update("endsOn", event.target.value)} required /></label><label>Tanggal bayar<input type="date" value={form.payDate ?? ""} onChange={(event) => update("payDate", event.target.value)} required /></label></>}
      </div>
      <div className="form-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Batal</button><button className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
    </form>}
    <div className="operations-datasets">
      {columns[area].filter((item) => permissions.includes(item.read)).map((item) => {
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
    <p className="operations-footnote">Posting jurnal memerlukan persetujuan terpisah. Mutasi stok dicatat pada ledger. Modul payroll saat ini belum memiliki mesin perhitungan PPh 21, BPJS, THR, lembur, dan aturan ketenagakerjaan yang tervalidasi; jangan gunakan untuk penggajian resmi sebelum komponen dan formula ditinjau ahli payroll serta aturan terbaru.</p>
  </section>;
}

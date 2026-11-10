import { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type Catalog = {
  id: string;
  title?: string;
  subtitle?: string | null;
  edition?: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  publication_year?: number | null;
  isbn?: string | null;
  item_code?: string | null;
};
type Request = <T,>(endpoint: string, init?: RequestInit) => Promise<T>;
type Props = { copies: Row[]; preview: boolean; request: Request };

const CODE39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
  "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  A:"wnnnnwnnw",B:"nnwnnwnnw",C:"wnwnnwnnn",D:"nnnnwwnnw",E:"wnnnwwnnn",
  F:"nnwnwwnnn",G:"nnnnnwwnw",H:"wnnnnwwnn",I:"nnwnnwwnn",J:"nnnnwwwnn",
  K:"wnnnnnnww",L:"nnwnnnnww",M:"wnwnnnnwn",N:"nnnnwnnww",O:"wnnnwnnwn",
  P:"nnwnwnnwn",Q:"nnnnnnwwn",R:"wnnnnnwwn",S:"nnwnnnwwn",T:"nnnnwnwwn",
  U:"wwnnnnnnw",V:"nwwnnnnnw",W:"wwwnnnnnn",X:"nwnnwnnnw",Y:"wwnnwnnnn",
  Z:"nwwnwnnnn","-":"nwnnnwnnw",".":"wwnnnwnnn"," ":"nwwnwnwnn",
  "$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nnnwnwnwn","%":"nnnwnwnnn"
};

function safe(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
function escapeHtml(value: unknown): string {
  return safe(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[character] ?? character);
}
function barcodeSvg(value: string): string {
  const normalized = value.toUpperCase().replace(/[^0-9A-Z .\-$/+%]/g, "-");
  const encoded = `*${normalized}*`;
  let cursor = 0;
  const bars: string[] = [];
  for (let characterIndex = 0; characterIndex < encoded.length; characterIndex += 1) {
    const pattern = CODE39[encoded[characterIndex] ?? ""] ?? CODE39["-"]!;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? 3 : 1;
      if (index % 2 === 0) bars.push(`<rect x="${cursor}" y="0" width="${width}" height="42" />`);
      cursor += width;
    }
    cursor += 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cursor} 42" role="img" aria-label="Barcode ${escapeHtml(value)}" preserveAspectRatio="none">${bars.join("")}</svg>`;
}

export default function LibraryBarcodePanel({ copies, preview, request }: Props) {
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedIds(copies.map((copy) => safe(copy.id)).filter(Boolean));
  }, [copies]);

  useEffect(() => {
    if (preview) { setCatalog([]); return; }
    let active = true;
    setLoading(true);
    setError("");
    void request<{ data: Catalog[] }>("library-catalog")
      .then((result) => { if (active) setCatalog(result.data ?? []); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Metadata katalog tidak dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, preview]);

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const selectedCopies = copies.filter((copy) => selectedIds.includes(safe(copy.id)));
  const toggleAll = () => setSelectedIds(selectedIds.length === copies.length ? [] : copies.map((copy) => safe(copy.id)));

  const printLabels = () => {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Jendela cetak diblokir browser. Izinkan pop-up untuk PONDOK OS lalu coba lagi."); return; }
    const labels = selectedCopies.map((copy) => {
      const book = catalogById.get(safe(copy.catalog_item_id));
      const authors = Array.isArray(book?.authors) ? book.authors.join(", ") : "";
      const code = safe(copy.barcode);
      return `<article class="label">
        <div class="title">${escapeHtml(book?.title || "Judul buku tidak ditemukan")}</div>
        <div class="meta">${escapeHtml(book?.edition ? "Edisi " + book.edition : "Edisi —")} · ${escapeHtml(book?.publication_year ?? "Tahun —")}</div>
        <div class="meta">${escapeHtml(book?.publisher || "Penerbit —")}${authors ? " · " + escapeHtml(authors) : ""}</div>
        <div class="barcode">${barcodeSvg(code)}</div>
        <div class="code">${escapeHtml(code)}</div>
        <div class="foot">${escapeHtml(book?.item_code || "")}${copy.shelf_location ? " · Rak " + escapeHtml(copy.shelf_location) : ""}</div>
      </article>`;
    }).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Label Barcode Perpustakaan PONDOK OS</title><style>
      @page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#111}
      .sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;align-items:stretch}
      .label{height:32mm;border:.2mm dashed #bbb;padding:2mm;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;break-inside:avoid}
      .title{font-size:8pt;font-weight:700;line-height:1.15;max-height:2.3em;overflow:hidden}
      .meta{font-size:6pt;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .barcode{height:11mm;width:100%;padding:0 4mm}.barcode svg{width:100%;height:100%;fill:#000}
      .code{text-align:center;font-family:monospace;font-size:7pt;letter-spacing:1px}
      .foot{font-size:5.5pt;color:#444;text-align:center;white-space:nowrap;overflow:hidden}
      @media screen{body{padding:8mm;background:#eee}.sheet{max-width:194mm;margin:auto}.label{background:white}}
    </style></head><body><main class="sheet">${labels}</main><script>window.onload=()=>{window.focus();window.print();};</script></body></html>`);
    popup.document.close();
    popup.opener = null;
  };

  return <section className="module-extension-panel library-barcode-panel" aria-label="Generator barcode dan cetak label">
    <div className="module-extension-heading"><div><span className="module-page-kicker">PERPUSTAKAAN / INVENTARIS FISIK</span><h3>Generator barcode & label stiker</h3><p>Barcode Code 39 dibuat dari kode unik setiap eksemplar. Label mengambil judul, edisi, tahun terbit, penerbit, penulis, kode katalog, dan lokasi rak dari katalog serta data eksemplar.</p></div></div>
    {preview ? <div className="alert warning">Generator aktif setelah workspace lembaga diaktivasi dan data katalog/eksemplar tersimpan. Mode pratinjau tidak membuat barcode atau label data nyata.</div> : <>
      {error && <div className="alert error">{error}</div>}
      <div className="barcode-toolbar"><label><input type="checkbox" checked={copies.length > 0 && selectedIds.length === copies.length} onChange={toggleAll}/> Pilih semua eksemplar</label><span>{selectedIds.length} dari {copies.length} dipilih</span><button type="button" className="primary" disabled={loading || selectedCopies.length === 0} onClick={printLabels}>Cetak label A4 (3 × 8)</button></div>
      {loading ? <p className="muted">Memuat metadata katalog…</p> : copies.length === 0 ? <p className="muted">Belum ada eksemplar. Tambahkan eksemplar dan barcode terlebih dahulu.</p> : <div className="barcode-copy-list">
        {copies.map((copy) => {
          const id = safe(copy.id), book = catalogById.get(safe(copy.catalog_item_id));
          return <label className="barcode-copy-row" key={id}><input type="checkbox" checked={selectedIds.includes(id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current,id] : current.filter((item) => item !== id))}/><span><strong>{book?.title || "Metadata katalog belum tersedia"}</strong><small>{safe(copy.barcode)} · {book?.edition ? "Edisi " + book.edition : "Edisi —"} · {safe(book?.publication_year) || "Tahun —"} · {safe(book?.publisher) || "Penerbit —"}</small></span></label>;
        })}
      </div>}
    </>}
  </section>;
}

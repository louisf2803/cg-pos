'use client';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Download, Search, Upload, Warehouse } from 'lucide-react';
import {
  buildStockTemplateCsv,
  buildStockTemplateXlsx,
  formatRp,
  newId,
  parseStockImportSpreadsheet,
  STOCK_KIND_LABEL,
  STOCK_STATUS_LABEL,
  stockPostProblem,
  type ManualStockKind,
  type ParseStockImportResult,
  type StockFilter,
  type StockItem,
  type StockLocation,
  type StockStatus,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { triggerCsvDownload, triggerXlsxDownload } from '@/lib/export';
import { ErrorBox, PageHeader } from '@/components/page';

const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);
const fmtWhen = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const KIND_LABEL = { goods: 'Barang', ingredient: 'Bahan baku' } as const;
const BADGE: Record<StockStatus, string> = { ok: '', low: 'cg-badge--warning', out: 'cg-badge--danger', negative: 'cg-badge--danger' };
const MODE_LABEL: Record<ManualStockKind, string> = { adjust_in: 'Stok masuk', adjust_out: 'Stok keluar', waste: 'Terbuang' };

type Dlg =
  | { kind: 'post'; item: StockItem; mode: ManualStockKind }
  | { kind: 'card'; item: StockItem }
  | { kind: 'import' };

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}

export default function StockPage() {
  const data = useData();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | StockItem['kind']>('');
  const [status, setStatus] = useState<'' | StockFilter>('');
  const [category, setCategory] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');

  const locs = useAsync(() => data.listStockLocations(), [data]);
  const state = useAsync(async () => {
    const [items, settings] = await Promise.all([
      data.listStock({ locationId: selectedLocation || undefined }),
      data.getOutletSettings(),
    ]);
    return { items, allowNegativeStock: settings.options.allowNegativeStock };
  }, [data, selectedLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = new URLSearchParams(window.location.search).get('status');
    if (s === 'out' || s === 'negative' || s === 'low' || s === 'alert' || s === 'ok') {
      setStatus(s as StockFilter);
    }
  }, []);

  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [notice, setNotice] = useState('');
  const stockData = state.status === 'ready' ? state.data.items : null;
  const allowNegativeStock = state.status === 'ready' ? state.data.allowNegativeStock : true;
  const rows = useMemo(() => {
    if (!stockData) return [];
    const q = search.trim().toLowerCase();
    return stockData.filter((i) => (!kind || i.kind === kind) && (!status || (status === 'alert' ? i.status !== 'ok' : i.status === status)) && (!category || i.categoryName === category) && (!q || i.name.toLowerCase().includes(q)));
  }, [stockData, search, kind, status, category]);
  const all = stockData ?? [];
  const locList = locs.status === 'ready' ? locs.data : [];
  const totalValue = all.reduce((n, i) => n + i.value, 0);
  const alerts = all.filter((i) => i.status !== 'ok').length;
  const categories = useMemo(() => Array.from(new Set(all.map((i) => i.categoryName).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b, 'id')), [all]);

  return (
    <>
      <PageHeader
        title="Daftar stok"
        subtitle="Stok bahan baku dan barang di outlet dan gudang, dengan nilai persediaan dan impor spreadsheet"
        actions={
          <div className="flex items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={() => setDlg({ kind: 'import' })}
            >
              <Upload className="cg-icon cg-icon--sm" aria-hidden />
              Impor Stok (.xlsx / .csv)
            </button>
          </div>
        }
      />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {state.status === 'ready' && (
        <>
          <dl className="grid gap-12 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Ringkasan stok">
            <div className="border border-border rounded-md p-12 bg-surface"><dt className="text-text-muted text-sm m-0">Nilai persediaan</dt><dd className="cg-num text-lg font-semibold m-0" data-testid="nilai-persediaan">{formatRp(totalValue)}</dd></div>
            <div className="border border-border rounded-md p-12 bg-surface"><dt className="text-text-muted text-sm m-0">Jumlah item</dt><dd className="cg-num text-lg font-semibold m-0">{all.length}</dd></div>
            <div className="border border-border rounded-md p-12 bg-surface"><dt className="text-text-muted text-sm m-0">Perlu perhatian</dt>
              <dd className="text-lg font-semibold m-0"><button className="cg-num underline" onClick={() => setStatus(status === 'alert' ? '' : 'alert')} aria-pressed={status === 'alert'} data-testid="jumlah-perhatian">{alerts}</button></dd></div>
          </dl>
          <div className="flex flex-wrap gap-8 mb-12 items-end">
            <div className="cg-field grow" style={{ minWidth: 180 }}><label className="cg-label" htmlFor="stok-cari">Cari</label>
              <div className="relative"><Search className="cg-icon absolute" style={{ left: 10, top: 12 }} aria-hidden />
                <input id="stok-cari" className="cg-input" style={{ paddingLeft: 34 }} placeholder="Nama barang" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
            {locList.length > 0 && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="stok-lokasi">Lokasi</label>
                <select
                  id="stok-lokasi"
                  className="cg-input"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                >
                  <option value="">Semua lokasi</option>
                  {locList.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.kind === 'warehouse' ? 'Gudang' : 'Outlet'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="cg-field"><label className="cg-label" htmlFor="stok-jenis">Jenis</label>
              <select id="stok-jenis" className="cg-input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="">Semua</option><option value="ingredient">Bahan baku</option><option value="goods">Barang</option></select></div>
            {categories.length > 0 && (
              <div className="cg-field"><label className="cg-label" htmlFor="stok-kategori">Kategori</label>
                <select id="stok-kategori" className="cg-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Semua</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
            )}
            <div className="cg-field"><label className="cg-label" htmlFor="stok-status">Status</label>
              <select id="stok-status" className="cg-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="">Semua</option><option value="alert">Perlu perhatian</option><option value="out">Habis</option><option value="negative">Minus</option><option value="low">Menipis</option><option value="ok">Aman</option></select></div>
          </div>
          {all.length === 0 ? (
            <div className="cg-empty"><p><strong>Belum ada barang yang stoknya dilacak.</strong></p><p className="text-text-muted">Nyalakan pelacakan stok di form produk, atau tambahkan bahan baku lewat resep.</p></div>
          ) : rows.length === 0 ? (
            <div className="cg-empty"><p><strong>Tidak ada yang cocok.</strong></p><p className="text-text-muted">Ubah kata kunci atau filter.</p></div>
          ) : (
            <div className="cg-data-wrap">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Jenis</th>
                    <th>Lokasi</th>
                    <th>Kategori</th>
                    <th className="text-right">Stok</th>
                    <th className="text-right">Biaya rata-rata</th>
                    <th className="text-right">Nilai</th>
                    <th>Status</th>
                    <th><span className="cg-sr">Aksi</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={`${i.productId}-${i.locationId ?? 'main'}`}>
                      <td className="break-words max-w-[260px]"><strong>{i.name}</strong>{i.minQty !== undefined && <span className="block text-sm text-text-muted">Minimum {fmtQty(i.minQty)} {i.unit}</span>}</td>
                      <td className="text-sm">{KIND_LABEL[i.kind]}</td>
                      <td className="text-sm whitespace-nowrap">
                        <span className="cg-badge">
                          {i.locationName || (locList.find((l) => l.id === i.locationId)?.name ?? 'Outlet')}
                        </span>
                      </td>
                      <td className="text-sm text-text-muted">{i.categoryName ?? '—'}</td>
                      <td className="text-right cg-num whitespace-nowrap">{fmtQty(i.qty)} <span className="text-text-muted text-sm">{i.unit}</span></td>
                      <td className="text-right cg-num">{formatRp(i.avgCost)}</td>
                      <td className="text-right cg-num">{formatRp(i.value)}</td>
                      <td><span className={`cg-badge ${BADGE[i.status]}`}>{STOCK_STATUS_LABEL[i.status]}</span></td>
                      <td className="text-right whitespace-nowrap">
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'post', item: i, mode: 'adjust_in' })} aria-label={`Stok masuk ${i.name}`}><ArrowDownToLine className="cg-icon cg-icon--sm" aria-hidden /> Masuk</button>
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'post', item: i, mode: 'adjust_out' })} aria-label={`Stok keluar ${i.name}`}><ArrowUpFromLine className="cg-icon cg-icon--sm" aria-hidden /> Keluar</button>
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'card', item: i })} aria-label={`Kartu stok ${i.name}`}><BookOpen className="cg-icon cg-icon--sm" aria-hidden /> Kartu</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {dlg?.kind === 'post' && (
        <PostDialog
          item={dlg.item}
          mode={dlg.mode}
          allowNegativeStock={allowNegativeStock}
          locationId={selectedLocation || dlg.item.locationId}
          onClose={() => setDlg(null)}
          onDone={(m) => {
            setDlg(null);
            setNotice(m);
            state.reload();
          }}
        />
      )}
      {dlg?.kind === 'card' && <CardDialog item={dlg.item} onClose={() => { setDlg(null); }} onChanged={state.reload} />}
      {dlg?.kind === 'import' && (
        <ImportDialog
          stockItems={all}
          locations={locList}
          currentLocationId={selectedLocation}
          onClose={() => setDlg(null)}
          onDone={(msg) => {
            setDlg(null);
            setNotice(msg);
            state.reload();
          }}
        />
      )}
    </>
  );
}

function PostDialog({
  item,
  mode: first,
  allowNegativeStock,
  locationId,
  onClose,
  onDone,
}: {
  item: StockItem;
  mode: ManualStockKind;
  allowNegativeStock: boolean;
  locationId?: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [mode, setMode] = useState<ManualStockKind>(first);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newId());          // satu kunci per pembukaan dialog: kirim ulang karena jaringan tidak menggandakan
  const n = Number(qty.replace(',', '.'));
  const willBe = mode === 'adjust_in' ? item.qty + n : item.qty - n;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id: key.current,
      productId: item.productId,
      kind: mode,
      qty: n,
      ...(mode === 'adjust_in' && cost.trim() !== '' ? { unitCost: Number(cost.replace(/\D/g, '')) } : {}),
      reason: reason.trim() || undefined,
      locationId: locationId || undefined,
    };
    const problem = stockPostProblem(input, { allowNegative: allowNegativeStock, currentQty: item.qty });
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const r = await data.postStock(input); onDone(`${MODE_LABEL[mode]} ${item.name}: ${fmtQty(n)} ${item.unit}. Stok sekarang ${fmtQty(r.qty)} ${item.unit}.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Stok gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-stok">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-stok" className="cg-modal__title break-words">{item.name}</h2>
        <p className="text-sm text-text-muted">
          Lokasi: <strong>{item.locationName || 'Outlet utama'}</strong> · Stok sekarang <strong className="cg-num">{fmtQty(item.qty)} {item.unit}</strong> · biaya rata-rata {formatRp(item.avgCost)}
        </p>
        <div className="cg-tabs" role="tablist" aria-label="Jenis gerakan">
          {(['adjust_in', 'adjust_out', 'waste'] as const).map((m) => <button key={m} type="button" role="tab" className="cg-tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(''); }}>{MODE_LABEL[m]}</button>)}
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="stok-jumlah">Jumlah ({item.unit})</label>
          <input id="stok-jumlah" className="cg-input" inputMode="decimal" autoFocus maxLength={16} value={qty} onChange={(e) => { setQty(e.target.value.replace(/[^\d.,]/g, '')); setErr(''); }} /></div>
        {mode === 'adjust_in' && (
          <div className="cg-field"><label className="cg-label" htmlFor="stok-harga">Harga beli per {item.unit} (Rp)</label>
            <input id="stok-harga" className="cg-input" inputMode="numeric" maxLength={12} value={cost} onChange={(e) => { setCost(e.target.value.replace(/\D/g, '')); setErr(''); }} />
            <span className="text-sm text-text-muted">Kosongkan untuk memakai biaya rata-rata saat ini, sehingga HPP tidak bergeser.</span></div>
        )}
        <div className="cg-field"><label className="cg-label" htmlFor="stok-alasan">Alasan (opsional)</label>
          <input id="stok-alasan" className="cg-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {mode !== 'adjust_in' && Number.isFinite(n) && n > 0 && willBe < 0 && (
          allowNegativeStock
            ? <p role="status" className="cg-banner cg-banner--warning" data-testid="peringatan-minus">Stok akan menjadi minus ({fmtQty(willBe)} {item.unit}). Tetap boleh disimpan.</p>
            : <p role="status" className="cg-banner cg-banner--danger" data-testid="peringatan-minus">Stok tidak cukup ({fmtQty(willBe)} {item.unit}). Pengaturan outlet melarang stok minus.</p>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{err}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={busy || (!allowNegativeStock && mode !== 'adjust_in' && willBe < 0)}
            aria-busy={busy}
          >
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CardDialog({ item, onClose, onChanged }: { item: StockItem; onClose: () => void; onChanged: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const moves = useAsync(() => data.listStockMoves(item.productId, { limit: 100 }), [data, item.productId]);
  const [min, setMin] = useState(item.minQty !== undefined ? String(item.minQty) : '');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function saveMin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = min.trim() === '' ? null : Number(min.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return setErr('Batas minimum harus angka 0 atau lebih.');
    setBusy(true); setErr(''); setMsg('');
    try { await data.setStockMin(item.productId, v); setMsg(v === null ? 'Peringatan minimum dimatikan.' : 'Batas minimum disimpan.'); onChanged(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan batas minimum.'); }
    finally { setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-kartu" style={{ margin: 'auto', maxWidth: 'min(720px, calc(100vw - 16px))' }}>
      <div className="grid gap-12">
        <h2 id="judul-kartu" className="cg-modal__title break-words">Kartu stok · {item.name}</h2>
        <p className="text-sm text-text-muted">
          Lokasi: <strong>{item.locationName || 'Outlet utama'}</strong> · Saldo <strong className="cg-num">{fmtQty(item.qty)} {item.unit}</strong> · biaya rata-rata {formatRp(item.avgCost)} · nilai {formatRp(item.value)}
        </p>
        <form onSubmit={saveMin} className="flex flex-wrap gap-8 items-end" noValidate aria-label="Peringatan stok minimum">
          <div className="cg-field"><label className="cg-label" htmlFor="stok-min">Batas minimum ({item.unit})</label>
            <input id="stok-min" className="cg-input" inputMode="decimal" maxLength={16} value={min} onChange={(e) => { setMin(e.target.value.replace(/[^\d.,]/g, '')); setErr(''); setMsg(''); }} /></div>
          <button type="submit" className="cg-btn cg-btn--secondary cg-btn--sm" disabled={busy}>Simpan batas</button>
        </form>
        {msg && <p role="status" className="text-sm">{msg}</p>}
        {err && <p role="alert" className="text-danger-strong text-sm">{err}</p>}
        {moves.status === 'loading' && <div className="cg-skeleton" style={{ height: 80 }} aria-busy="true" aria-label="Memuat" />}
        {moves.status === 'error' && <ErrorBox message={moves.message} onRetry={moves.reload} />}
        {moves.status === 'ready' && (moves.data.length === 0 ? <p className="text-text-muted">Belum ada gerakan stok.</p> : (
          <div className="cg-data-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
            <table className="cg-data" aria-label="Gerakan stok">
              <thead><tr><th>Waktu</th><th>Jenis</th><th className="text-right">Jumlah</th><th className="text-right">Saldo</th><th className="text-right">Biaya/satuan</th></tr></thead>
              <tbody>
                {moves.data.map((m) => (
                  <tr key={m.id}>
                    <td className="text-sm whitespace-nowrap">{fmtWhen(m.occurredAt)}</td>
                    <td className="break-words max-w-[200px]">{STOCK_KIND_LABEL[m.kind]}{m.reason && <span className="block text-sm text-text-muted">{m.reason}</span>}</td>
                    <td className="text-right cg-num">{m.qtyDelta > 0 ? '+' : ''}{fmtQty(m.qtyDelta)}</td>
                    <td className="text-right cg-num">{fmtQty(m.qtyAfter)}</td>
                    <td className="text-right cg-num">{formatRp(m.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--primary" onClick={() => d.ref.current?.close()}>Tutup</button></div>
      </div>
    </dialog>
  );
}

function ImportDialog({
  stockItems,
  locations,
  currentLocationId,
  onClose,
  onDone,
}: {
  stockItems: StockItem[];
  locations: StockLocation[];
  currentLocationId?: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [targetLoc, setTargetLoc] = useState(currentLocationId || locations[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseStockImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [readErr, setReadErr] = useState('');
  const [busy, setBusy] = useState(false);

  function downloadTemplate(format: 'xlsx' | 'csv') {
    if (format === 'xlsx') {
      const bytes = buildStockTemplateXlsx(stockItems);
      triggerXlsxDownload(bytes, `templat-stok-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const csv = buildStockTemplateCsv(stockItems);
      triggerCsvDownload(csv, `templat-stok-${new Date().toISOString().slice(0, 10)}.csv`);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setReading(true);
    setReadErr('');
    setParseResult(null);
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const res = parseStockImportSpreadsheet(f.name, bytes, stockItems);
      setParseResult(res);
    } catch (err) {
      setReadErr(err instanceof Error ? err.message : 'Gagal membaca berkas.');
    } finally {
      setReading(false);
    }
  }

  async function applyImport() {
    if (!parseResult || parseResult.items.length === 0 || busy) return;
    setBusy(true);
    setReadErr('');
    try {
      let appliedCount = 0;
      for (const item of parseResult.items) {
        const diff = item.newQty - item.currentQty;
        if (diff === 0) continue;
        const kind: ManualStockKind = diff > 0 ? 'adjust_in' : 'adjust_out';
        await data.postStock({
          id: newId(),
          productId: item.productId,
          kind,
          qty: Math.abs(diff),
          unitCost: kind === 'adjust_in' ? item.unitCost : undefined,
          reason: item.reason || 'Impor stok spreadsheet',
          locationId: targetLoc || undefined,
        });
        appliedCount++;
      }
      onDone(`Berhasil memperbarui stok ${appliedCount} item dari berkas ${file?.name ?? ''}.`);
    } catch (err) {
      setReadErr(err instanceof Error ? err.message : 'Gagal menerapkan stok.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-impor-stok" style={{ maxWidth: 'min(760px, calc(100vw - 16px))' }}>
      <div className="grid gap-16 text-text">
        <div className="flex items-center justify-between border-b border-border pb-12">
          <h2 id="judul-impor-stok" className="cg-modal__title">
            Impor Stok Awal / Penyesuaian Stok
          </h2>
        </div>

        <p className="text-sm text-text-muted">
          Perbarui stok barang dan bahan baku secara massal menggunakan berkas spreadsheet Excel (.xlsx) atau CSV.
        </p>

        {locations.length > 0 && (
          <div className="cg-field max-w-[320px]">
            <label className="cg-label" htmlFor="impor-target-lokasi">Lokasi Tujuan Stok</label>
            <select
              id="impor-target-lokasi"
              className="cg-input text-sm"
              value={targetLoc}
              onChange={(e) => setTargetLoc(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.kind === 'warehouse' ? 'Gudang' : 'Outlet'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Unduh Templat */}
        <div className="p-12 border border-border rounded-xl bg-surface-muted/30 flex flex-wrap items-center justify-between gap-8">
          <div>
            <strong className="text-sm block">Unduh Templat Format</strong>
            <span className="text-xs text-text-muted">Daftar barang dan bahan yang dilacak saat ini sudah terisi otomatis.</span>
          </div>
          <div className="flex items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={() => downloadTemplate('xlsx')}
            >
              <Download className="w-12 h-12 mr-4" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={() => downloadTemplate('csv')}
            >
              <Download className="w-12 h-12 mr-4" />
              CSV (.csv)
            </button>
          </div>
        </div>

        {/* Unggah Berkas */}
        <div className="cg-field">
          <label className="cg-label" htmlFor="impor-file-input">Pilih Berkas Excel atau CSV</label>
          <input
            id="impor-file-input"
            type="file"
            className="cg-input text-sm"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
          />
        </div>

        {reading && <p className="text-sm text-text-muted">Membaca berkas…</p>}
        {readErr && <p role="alert" className="cg-banner cg-banner--danger text-sm">{readErr}</p>}

        {parseResult && (
          <div className="grid gap-12">
            {parseResult.errors.length > 0 && (
              <div className="cg-banner cg-banner--danger text-xs">
                <strong>Ditemukan {parseResult.errors.length} galat pada berkas:</strong>
                <ul className="list-disc pl-16 mt-4">
                  {parseResult.errors.slice(0, 5).map((e, idx) => (
                    <li key={idx}>Baris {e.row}: {e.message}</li>
                  ))}
                  {parseResult.errors.length > 5 && <li>…dan {parseResult.errors.length - 5} lainnya</li>}
                </ul>
              </div>
            )}

            {parseResult.items.length > 0 && (
              <div>
                <span className="text-xs text-text-muted block mb-4">
                  Pratinjau {parseResult.items.length} item valid yang akan diperbarui:
                </span>
                <div className="cg-data-wrap" style={{ maxHeight: 200, overflow: 'auto' }}>
                  <table className="cg-data w-full text-xs">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Satuan</th>
                        <th className="text-right">Stok Sistem</th>
                        <th className="text-right">Stok Baru</th>
                        <th className="text-right">Selisih</th>
                        <th className="text-right">Harga Beli</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.items.slice(0, 20).map((it) => {
                        const diff = it.newQty - it.currentQty;
                        return (
                          <tr key={it.productId}>
                            <td className="font-medium text-text">{it.productName}</td>
                            <td>{it.unit}</td>
                            <td className="text-right cg-num">{fmtQty(it.currentQty)}</td>
                            <td className="text-right cg-num font-bold">{fmtQty(it.newQty)}</td>
                            <td className={`text-right cg-num font-bold ${diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-text-muted'}`}>
                              {diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff)}
                            </td>
                            <td className="text-right cg-num">{it.unitCost ? formatRp(it.unitCost) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="cg-modal__actions pt-12 border-t border-border flex justify-end gap-8">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            disabled={busy || reading || !parseResult || parseResult.items.length === 0}
            onClick={applyImport}
          >
            {busy ? 'Menerapkan…' : `Terapkan Stok (${parseResult?.items.length ?? 0} item)`}
          </button>
        </div>
      </div>
    </dialog>
  );
}


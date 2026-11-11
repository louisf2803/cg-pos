'use client';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ClipboardCheck, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import {
  buildOpnameCsvTemplate,
  buildOpnameResultCsv,
  formatRp,
  newId,
  opnameDifference,
  opnameProblem,
  parseOpnameCsv,
  type ParseOpnameCsvResult,
  type StockItem,
  type StockOpname,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);
const fmtWhen = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const signed = (n: number) => (n > 0 ? `+${fmtQty(n)}` : fmtQty(n));
const signedRp = (n: number) => (n > 0 ? `+${formatRp(n)}` : n < 0 ? `-${formatRp(-n)}` : formatRp(0));

type View = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'show'; id: string };

export default function OpnamePage() {
  const data = useData();
  const list = useAsync(() => data.listOpnames(), [data]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');
  const back = (msg?: string) => { setView({ kind: 'list' }); if (msg) setNotice(msg); list.reload(); };

  if (view.kind === 'edit') return <Editor id={view.id} onBack={back} onFinal={(id, msg) => { setNotice(msg); list.reload(); setView({ kind: 'show', id }); }} />;
  if (view.kind === 'show') return <Viewer id={view.id} onBack={() => back()} />;
  return (
    <>
      <PageHeader title="Stok opname" subtitle="Hitung stok fisik, bandingkan dengan sistem, lalu sesuaikan stok sesuai selisihnya"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setView({ kind: 'edit', id: newId() }); }}><Plus className="cg-icon" aria-hidden /> Opname baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {list.status === 'ready' && (list.data.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada opname.</strong></p><p className="text-text-muted">Opname membantu mencocokkan stok di sistem dengan hitungan di rak dan gudang.</p>
          <button className="cg-btn cg-btn--primary" onClick={() => setView({ kind: 'edit', id: newId() })}>Mulai opname pertama</button></div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nomor</th><th>Dihitung</th><th>Status</th><th className="text-right">Item</th><th className="text-right">Berselisih</th><th>Catatan</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {list.data.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.number}</strong></td>
                  <td className="text-sm whitespace-nowrap">{fmtWhen(o.countedAt)}</td>
                  <td><span className={`cg-badge ${o.status === 'final' ? 'cg-badge--accent' : ''}`}>{o.status === 'final' ? 'Selesai' : 'Draf'}</span></td>
                  <td className="text-right cg-num">{o.lineCount}</td>
                  <td className="text-right cg-num">{o.diffCount}</td>
                  <td className="break-words max-w-[240px] text-sm">{o.note ?? ''}</td>
                  <td className="text-right whitespace-nowrap"><button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => { setNotice(''); setView({ kind: o.status === 'draft' ? 'edit' : 'show', id: o.id }); }} aria-label={`${o.status === 'draft' ? 'Lanjutkan' : 'Lihat'} ${o.number}`}>{o.status === 'draft' ? 'Lanjutkan' : 'Lihat'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Editor({ id, onBack, onFinal }: { id: string; onBack: (msg?: string) => void; onFinal: (id: string, msg: string) => void }) {
  const data = useData();
  const state = useAsync(async () => ({ items: await data.listStock(), opname: await data.getOpname(id) }), [data, id]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exists, setExists] = useState(false);
  const loaded = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (!loaded) return;
    if (loaded.opname) {
      setCounts(Object.fromEntries(loaded.opname.lines.map((l) => [l.productId, String(l.countedQty)])));
      setNote(loaded.opname.note ?? ''); setExists(true);
    }
  }, [loaded]);
  const system = useMemo(() => new Map((loaded?.opname?.lines ?? []).map((l) => [l.productId, l.systemQty])), [loaded]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (loaded?.items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [loaded, search]);

  const sysOf = (i: StockItem) => system.get(i.productId) ?? i.qty;
  const parsed = (i: StockItem): number | null => {
    const raw = counts[i.productId];
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };
  const lines = (loaded?.items ?? []).flatMap((i) => { const n = parsed(i); return n === null ? [] : [{ productId: i.productId, countedQty: n }]; });
  const diffs = (loaded?.items ?? []).flatMap((i) => { const n = parsed(i); return n === null || Number.isNaN(n) ? [] : [{ i, d: opnameDifference(sysOf(i), n) }]; }).filter((x) => x.d !== 0);
  const diffValue = diffs.reduce((n, x) => n + Math.round(x.d * x.i.avgCost), 0);

  async function persist(): Promise<StockOpname | null> {
    const input = { id, note: note.trim() || undefined, lines };
    const problem = opnameProblem(input);
    if (problem) { setErr(problem); return null; }
    try { const o = await data.saveOpname(input); setExists(true); return o; }
    catch (x) { setErr(x instanceof Error ? x.message : 'Draf gagal disimpan.'); return null; }
  }
  async function saveDraft() {
    if (busy) return;
    setBusy(true); setErr(''); setMsg('');
    const o = await persist();
    setBusy(false);
    if (o) setMsg(`Draf ${o.number} disimpan (${o.lines.length} item).`);
  }
  async function finalize() {
    if (busy) return;
    setBusy(true); setErr(''); setMsg('');
    const o = await persist();
    if (!o) { setBusy(false); setConfirm(false); return; }
    try { const f = await data.finalizeOpname(id); onFinal(id, `Opname ${f.number} selesai. ${f.lines.filter((l) => l.difference !== 0).length} item disesuaikan.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Opname gagal diselesaikan.'); setBusy(false); setConfirm(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setErr('');
    try { await data.deleteOpname(id); onBack('Draf opname dihapus.'); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Draf gagal dihapus.'); setBusy(false); }
  }
  const invalid = (loaded?.items ?? []).some((i) => Number.isNaN(parsed(i)));

  function downloadTemplate() {
    if (!loaded) return;
    const draftCounts = new Map<string, number>();
    for (const item of loaded.items) {
      const n = parsed(item);
      if (n !== null && !Number.isNaN(n)) draftCounts.set(item.productId, n);
    }
    const label = loaded.opname?.number ?? 'draf-baru';
    const csvContent = buildOpnameCsvTemplate(loaded.items, draftCounts, system);
    downloadCsvWithHistory({
      fileName: `templat-opname-${label.toLowerCase()}.csv`,
      csvContent,
      reportName: 'Templat stok opname',
      period: loaded.opname?.number ?? 'Draf baru',
      rowCount: loaded.items.length,
      sourceUrl: '/inventori/opname',
    });
    setErr('');
    setMsg('Templat CSV berhasil diunduh. Isi kolom "Hitung Fisik", lalu klik Impor CSV.');
  }

  function applyCsvImport(res: ParseOpnameCsvResult) {
    const updates: Record<string, string> = {};
    for (const r of res.rows) {
      if (r.status === 'valid' && r.countedQty !== null) {
        updates[r.productId] = String(r.countedQty);
      }
    }
    setCounts((prev) => ({ ...prev, ...updates }));
    setImportOpen(false);
    setErr('');
    setMsg(`${res.validCount} baris hitung fisik dari CSV diterapkan ke draf. Klik Simpan draf atau Selesaikan opname.`);
  }

  return (
    <>
      <PageHeader title={loaded?.opname ? `Opname ${loaded.opname.number}` : 'Opname baru'} subtitle="Isi jumlah hitung fisik untuk item yang dihitung. Item yang dikosongkan tidak ikut disesuaikan."
        actions={<button className="cg-btn cg-btn--ghost" onClick={() => onBack()}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>} />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {loaded && (
        <>
          <div className="flex flex-wrap gap-8 mb-12 items-end">
            <div className="cg-field grow" style={{ minWidth: 180 }}><label className="cg-label" htmlFor="op-cari">Cari item</label>
              <input id="op-cari" className="cg-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama barang" /></div>
            <div className="cg-field grow" style={{ minWidth: 180 }}><label className="cg-label" htmlFor="op-catatan">Catatan</label>
              <input id="op-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex flex-wrap gap-8">
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={downloadTemplate} disabled={loaded.items.length === 0}>
                <Download className="cg-icon" aria-hidden /> Unduh templat CSV
              </button>
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setImportOpen(true)} disabled={loaded.items.length === 0}>
                <Upload className="cg-icon" aria-hidden /> Impor CSV
              </button>
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setCounts((c) => ({ ...c, ...Object.fromEntries(rows.filter((i) => (c[i.productId] ?? '').trim() === '').map((i) => [i.productId, String(sysOf(i))])) }))}>Isi kosong dengan jumlah sistem</button>
            </div>
          </div>
          {rows.length === 0 ? <div className="cg-empty"><p><strong>Tidak ada item yang cocok.</strong></p></div> : (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Hitung fisik">
                <thead><tr><th>Item</th><th className="text-right">Sistem</th><th className="text-right">Hitung fisik</th><th className="text-right">Selisih</th><th className="text-right">Nilai</th></tr></thead>
                <tbody>
                  {rows.map((i) => {
                    const n = parsed(i);
                    const d = n === null || Number.isNaN(n) ? null : opnameDifference(sysOf(i), n);
                    return (
                      <tr key={i.productId}>
                        <td className="break-words max-w-[240px]"><strong>{i.name}</strong><span className="block text-sm text-text-muted">{i.unit}</span></td>
                        <td className="text-right cg-num whitespace-nowrap">{fmtQty(sysOf(i))}</td>
                        <td className="text-right"><input className="cg-input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" maxLength={16} aria-label={`Hitung fisik ${i.name}`}
                          aria-invalid={n !== null && Number.isNaN(n)} value={counts[i.productId] ?? ''} onChange={(e) => { setCounts((c) => ({ ...c, [i.productId]: e.target.value.replace(/[^\d.,]/g, '') })); setErr(''); setMsg(''); }} /></td>
                        <td className={`text-right cg-num ${d !== null && d < 0 ? 'text-danger-strong' : ''}`}>{d === null ? '—' : signed(d)}</td>
                        <td className="text-right cg-num">{d === null || d === 0 ? '—' : signedRp(Math.round(d * i.avgCost))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-12" data-testid="ringkasan-opname"><strong className="cg-num">{lines.length}</strong> item dihitung · <strong className="cg-num">{diffs.length}</strong> berselisih · perkiraan nilai selisih <strong className="cg-num">{signedRp(diffValue)}</strong></p>
          {err && <p role="alert" className="text-danger-strong mt-8">{err}</p>}
          {msg && <p role="status" className="mt-8">{msg}</p>}
          <div className="flex flex-wrap gap-8 mt-12">
            <button className="cg-btn cg-btn--secondary" onClick={() => void saveDraft()} disabled={busy || invalid}><Save className="cg-icon" aria-hidden /> Simpan draf</button>
            <button className="cg-btn cg-btn--primary" onClick={() => setConfirm(true)} disabled={busy || invalid || lines.length === 0}><ClipboardCheck className="cg-icon" aria-hidden /> Selesaikan opname</button>
            {exists && <button className="cg-btn cg-btn--ghost" onClick={() => void remove()} disabled={busy}><Trash2 className="cg-icon" aria-hidden /> Hapus draf</button>}
          </div>
          {invalid && <p className="text-danger-strong text-sm mt-8" role="alert">Ada jumlah yang bukan angka.</p>}
        </>
      )}
      {confirm && <ConfirmDialog count={diffs.length} total={lines.length} value={diffValue} busy={busy} onCancel={() => setConfirm(false)} onOk={() => void finalize()} />}
      {importOpen && loaded && (
        <ImportOpnameDialog
          items={loaded.items}
          system={system}
          onDownloadTemplate={downloadTemplate}
          onClose={() => setImportOpen(false)}
          onApply={applyCsvImport}
        />
      )}
    </>
  );
}

function ConfirmDialog({ count, total, value, busy, onCancel, onOk }: { count: number; total: number; value: number; busy: boolean; onCancel: () => void; onOk: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="cg-modal" style={{ margin: 'auto' }} onClose={onCancel} aria-labelledby="judul-selesai">
      <div className="grid gap-12">
        <h2 id="judul-selesai" className="cg-modal__title">Selesaikan opname?</h2>
        <p>{total} item dihitung, {count} berselisih (perkiraan nilai {signedRp(value)}). Stok akan disesuaikan sebesar selisih dan tidak bisa dibatalkan atau diubah lagi.</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="button" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy} onClick={onOk}>{busy ? 'Menyelesaikan…' : 'Ya, selesaikan'}</button>
        </div>
      </div>
    </dialog>
  );
}

function ImportOpnameDialog({
  items,
  system,
  onDownloadTemplate,
  onClose,
  onApply,
}: {
  items: StockItem[];
  system: Map<string, number>;
  onDownloadTemplate: () => void;
  onClose: () => void;
  onApply: (result: ParseOpnameCsvResult) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fileName, setFileName] = useState('');
  const [readErr, setReadErr] = useState('');
  const [parsed, setParsed] = useState<ParseOpnameCsvResult | null>(null);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReadErr('');
    if (!file) {
      setFileName('');
      setParsed(null);
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setParsed(parseOpnameCsv(text, items, system));
    } catch {
      setReadErr('Berkas tidak dapat dibaca. Pastikan format CSV UTF-8 valid.');
      setParsed(null);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      style={{ margin: 'auto', width: 'min(760px, calc(100vw - 24px))' }}
      onClose={onClose}
      aria-labelledby="judul-impor-opname"
    >
      <div className="grid gap-12 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <h2 id="judul-impor-opname" className="cg-modal__title">Impor hitung fisik (CSV)</h2>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onDownloadTemplate}>
            <Download className="cg-icon" aria-hidden /> Unduh templat
          </button>
        </div>
        <p className="text-sm text-text-muted">
          Unggah berkas CSV (pemisah titik koma atau koma) yang memiliki kolom <strong>Hitung Fisik</strong> serta <strong>ID Produk</strong> atau <strong>Nama Item</strong>. Baris kosong dilewati.
        </p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="op-csv-input">Pilih berkas CSV</label>
          <input id="op-csv-input" type="file" accept=".csv,.txt,text/csv" className="cg-input" onChange={(e) => void onFile(e)} />
          {fileName && <p className="text-sm text-text-muted mt-4">Berkas dipilih: <strong>{fileName}</strong></p>}
        </div>
        {readErr && <p role="alert" className="cg-banner cg-banner--danger">{readErr}</p>}
        {parsed && parsed.headerError && <p role="alert" className="cg-banner cg-banner--danger">{parsed.headerError}</p>}
        {parsed && !parsed.headerError && (
          <div className="grid gap-12 min-w-0" data-testid="pratinjau-impor-opname">
            <div className="flex flex-wrap gap-8">
              <span className="cg-badge cg-badge--success">{parsed.validCount} siap diterapkan</span>
              <span className="cg-badge">{parsed.blankCount} kosong dilewati</span>
              {parsed.errorCount > 0 && <span className="cg-badge cg-badge--danger">{parsed.errorCount} bermasalah</span>}
            </div>
            {parsed.truncated && (
              <p className="cg-banner cg-banner--warning">Berkas melebihi 3.000 baris; hanya 3.000 baris pertama yang diproses.</p>
            )}
            {parsed.rows.length === 0 ? (
              <div className="cg-empty"><p><strong>Tidak ada baris data pada berkas CSV.</strong></p></div>
            ) : (
              <div className="cg-data-wrap min-w-0" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="cg-data" aria-label="Pratinjau impor opname" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th className="cg-num">Baris</th>
                      <th>Item</th>
                      <th className="text-right">Sistem</th>
                      <th className="text-right">Fisik</th>
                      <th className="text-right">Selisih</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 100).map((r) => (
                      <tr key={`${r.lineNumber}-${r.productId || r.name}`}>
                        <td className="cg-num text-text-muted">{r.lineNumber}</td>
                        <td className="break-words max-w-[200px]">
                          <strong>{r.name}</strong>
                          {r.unit && <span className="block text-sm text-text-muted">{r.unit}</span>}
                        </td>
                        <td className="text-right cg-num whitespace-nowrap">{r.unit ? fmtQty(r.systemQty) : '—'}</td>
                        <td className="text-right cg-num whitespace-nowrap">{r.countedQty === null ? '—' : fmtQty(r.countedQty)}</td>
                        <td className={`text-right cg-num whitespace-nowrap ${r.difference !== null && r.difference < 0 ? 'text-danger-strong' : ''}`}>
                          {r.difference === null ? '—' : signed(r.difference)}
                        </td>
                        <td>
                          {r.status === 'valid' && <span className="cg-badge cg-badge--success">Valid</span>}
                          {r.status === 'blank' && <span className="cg-badge">Dilewati</span>}
                          {r.status === 'error' && (
                            <span className="text-sm text-danger-strong break-words">{r.errorReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {parsed.rows.length > 100 && (
              <p className="text-sm text-text-muted">Menampilkan 100 baris pertama dari {parsed.rows.length} baris di pratinjau.</p>
            )}
            <p className="text-sm text-text-muted">
              Hitung fisik yang valid akan diisikan ke draf opname (belum disimpan sebelum menekan <strong>Simpan draf</strong> atau <strong>Selesaikan opname</strong>).
            </p>
          </div>
        )}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Tutup</button>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            disabled={!parsed || Boolean(parsed.headerError) || parsed.validCount === 0}
            onClick={() => { if (parsed) onApply(parsed); }}
          >
            Terapkan ke draf ({parsed?.validCount ?? 0})
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Viewer({ id, onBack }: { id: string; onBack: () => void }) {
  const data = useData();
  const state = useAsync(() => data.getOpname(id), [data, id]);
  function downloadResult() {
    if (state.status !== 'ready' || !state.data) return;
    downloadCsvWithHistory({
      fileName: `opname-${state.data.number.toLowerCase()}.csv`,
      csvContent: buildOpnameResultCsv(state.data),
      reportName: `Hasil opname ${state.data.number}`,
      period: fmtWhen(state.data.countedAt),
      rowCount: state.data.lines.length,
      sourceUrl: '/inventori/opname',
    });
  }
  return (
    <>
      <PageHeader title={state.status === 'ready' && state.data ? `Opname ${state.data.number}` : 'Opname'} subtitle="Opname yang sudah selesai tidak bisa diubah"
        actions={
          <div className="flex flex-wrap gap-8">
            {state.status === 'ready' && state.data && (
              <button type="button" className="cg-btn cg-btn--secondary" onClick={downloadResult}>
                <Download className="cg-icon" aria-hidden /> Unduh CSV
              </button>
            )}
            <button type="button" className="cg-btn cg-btn--ghost" onClick={onBack}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>
          </div>
        } />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="cg-skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Memuat" />}
      {state.status === 'ready' && !state.data && <div className="cg-empty"><p><strong>Opname tidak ditemukan.</strong></p></div>}
      {state.status === 'ready' && state.data && (
        <>
          <p className="mb-12 text-sm text-text-muted">Dihitung {fmtWhen(state.data.countedAt)}{state.data.finalizedAt ? ` · selesai ${fmtWhen(state.data.finalizedAt)}` : ''}{state.data.note ? ` · ${state.data.note}` : ''}</p>
          <div className="cg-data-wrap">
            <table className="cg-data" aria-label="Hasil opname">
              <thead><tr><th>Item</th><th className="text-right">Sistem</th><th className="text-right">Fisik</th><th className="text-right">Selisih</th><th className="text-right">Nilai</th></tr></thead>
              <tbody>
                {state.data.lines.map((l) => (
                  <tr key={l.productId}>
                    <td className="break-words max-w-[240px]"><strong>{l.name}</strong><span className="block text-sm text-text-muted">{l.unit}</span></td>
                    <td className="text-right cg-num">{fmtQty(l.systemQty)}</td><td className="text-right cg-num">{fmtQty(l.countedQty)}</td>
                    <td className={`text-right cg-num ${l.difference < 0 ? 'text-danger-strong' : ''}`}>{l.difference === 0 ? '—' : signed(l.difference)}</td>
                    <td className="text-right cg-num">{l.difference === 0 ? '—' : signedRp(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-12">Total nilai selisih <strong className="cg-num" data-testid="total-selisih">{signedRp(state.data.lines.reduce((n, l) => n + l.value, 0))}</strong></p>
        </>
      )}
    </>
  );
}

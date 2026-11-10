'use client';
import { useState, type FormEvent } from 'react';
import { Check, Plus, Trash2, Truck, X } from 'lucide-react';
import { newId, transferProblem, TRANSFER_STATUS_LABEL, type StockLocation, type StockTransfer } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const fmtTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const num = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

export default function StockTransferPage() {
  const data = useData();
  const state = useAsync(async () => { const [locations, transfers] = await Promise.all([data.listStockLocations(), data.listStockTransfers()]); return { locations, transfers }; }, [data]);
  const [dlg, setDlg] = useState(false);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  async function act(t: StockTransfer, kind: 'receive' | 'cancel') {
    if (busy) return;
    setBusy(t.id); setErr(''); setNotice('');
    try {
      if (kind === 'receive') await data.receiveStockTransfer(t.id); else await data.cancelStockTransfer(t.id);
      setNotice(kind === 'receive' ? `${t.number} diterima di ${t.toName}.` : `${t.number} dibatalkan, stok kembali ke ${t.fromName}.`);
      state.reload();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal memproses transfer.'); }
    setBusy('');
  }
  return (
    <>
      <PageHeader title="Transfer stok" subtitle="Pindahkan stok antar outlet dan gudang. Stok keluar dari lokasi asal saat dikirim, dan masuk ke lokasi tujuan saat diterima, dengan harga pokok yang sama."
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg(true); }} disabled={state.status !== 'ready' || state.data.locations.length < 2}><Truck className="cg-icon" aria-hidden /> Transfer baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {err && <p role="alert" className="text-danger-strong mb-12">{err}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 80 }} />)}</div>}
      {state.status === 'ready' && state.data.locations.length < 2 && (
        <div className="cg-empty"><p><strong>Transfer butuh minimal dua lokasi stok.</strong></p><p className="text-text-muted">Tambahkan outlet atau gudang lain lebih dulu.</p></div>
      )}
      {state.status === 'ready' && state.data.locations.length >= 2 && (state.data.transfers.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada transfer stok.</strong></p><p className="text-text-muted">Pilih Transfer baru untuk memindahkan stok ke lokasi lain.</p></div>
      ) : (
        <ul className="grid gap-12" aria-label="Daftar transfer stok">
          {state.data.transfers.map((t) => (
            <li key={t.id} className="p-12 min-w-0" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)' }}>
              <div className="flex flex-wrap gap-8 items-start justify-between">
                <div className="min-w-0"><strong>{t.number}</strong> <span className="cg-badge" data-testid={`status-${t.number}`}>{TRANSFER_STATUS_LABEL[t.status]}</span>
                  <span className="block break-words">{t.fromName} → {t.toName}</span>
                  <span className="block text-sm text-text-muted">{fmtTime(t.createdAt)}{t.note ? ` · ${t.note}` : ''}</span></div>
                {t.status === 'in_transit' && (
                  <div className="flex gap-8">
                    <button className="cg-btn cg-btn--primary" disabled={!!busy} onClick={() => act(t, 'receive')} aria-label={`Terima ${t.number}`}><Check className="cg-icon" aria-hidden /> Terima</button>
                    <button className="cg-btn cg-btn--ghost" disabled={!!busy} onClick={() => act(t, 'cancel')} aria-label={`Batalkan ${t.number}`}><X className="cg-icon" aria-hidden /> Batalkan</button>
                  </div>
                )}
              </div>
              <ul className="mt-8 text-sm" aria-label={`Barang ${t.number}`}>
                {t.lines.map((l) => <li key={l.productId} className="flex justify-between gap-8"><span className="min-w-0 break-words">{l.name}</span><span className="cg-num">{num(l.qty)}</span></li>)}
              </ul>
            </li>
          ))}
        </ul>
      ))}
      {dlg && state.status === 'ready' && <NewTransfer locations={state.data.locations} onClose={() => setDlg(false)} onDone={(m) => { setDlg(false); setNotice(m); state.reload(); }} />}
    </>
  );
}

function NewTransfer({ locations, onClose, onDone }: { locations: StockLocation[]; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const items = useAsync(() => data.listPurchaseItems(), [data]);
  const [id] = useState(() => newId());
  const [from, setFrom] = useState(locations[0]!.id);
  const [to, setTo] = useState(locations[1]!.id);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<{ key: string; productId: string; qty: string }[]>([{ key: newId(), productId: '', qty: '' }]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (key: string, p: Partial<{ productId: string; qty: string }>) => { setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x))); setErr(''); };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lines = rows.map((r) => ({ productId: r.productId, qty: Number(r.qty.replace(',', '.')) }));
    const problem = transferProblem({ fromId: from, toId: to, lines });
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const r = await data.createStockTransfer({ id, fromId: from, toId: to, note, lines }); onDone(`Transfer ${r.number} dikirim. Stok keluar dari lokasi asal; tekan Terima saat barang sampai.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mengirim.'); setBusy(false); }
  }
  const unitOf = (pid: string) => (items.status === 'ready' ? items.data.find((i) => i.productId === pid)?.baseUnit ?? '' : '');
  return (
    <dialog {...d.props} aria-labelledby="judul-transfer">
      <form onSubmit={submit} className="grid gap-12 min-w-0" noValidate>
        <h2 id="judul-transfer" className="cg-modal__title">Transfer stok baru</h2>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="tf-dari">Dari</label>
            <select id="tf-dari" className="cg-input" value={from} onChange={(e) => { setFrom(e.target.value); setErr(''); }}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="tf-ke">Ke</label>
            <select id="tf-ke" className="cg-input" value={to} onChange={(e) => { setTo(e.target.value); setErr(''); }}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        {items.status === 'error' && <ErrorBox message={items.message} onRetry={items.reload} />}
        <ul className="grid gap-8" aria-label="Barang yang dipindah">
          {rows.map((r, i) => (
            <li key={r.key} className="flex gap-8 items-end min-w-0">
              <div className="cg-field grow min-w-0"><label className="cg-label" htmlFor={`tf-b-${i}`}>Barang {i + 1}</label>
                <select id={`tf-b-${i}`} className="cg-input" value={r.productId} onChange={(e) => setRow(r.key, { productId: e.target.value })}>
                  <option value="">Pilih barang…</option>{items.status === 'ready' && items.data.map((it) => <option key={it.productId} value={it.productId}>{it.name}</option>)}</select></div>
              <div className="cg-field" style={{ width: 110 }}><label className="cg-label" htmlFor={`tf-q-${i}`}>Jumlah{unitOf(r.productId) ? ` (${unitOf(r.productId)})` : ''}</label>
                <input id={`tf-q-${i}`} className="cg-input cg-num" inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
              <button type="button" className="cg-btn cg-btn--ghost" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label={`Hapus barang ${i + 1}`}><Trash2 className="cg-icon" aria-hidden /></button>
            </li>
          ))}
        </ul>
        <div><button type="button" className="cg-btn cg-btn--secondary" onClick={() => setRows((r) => [...r, { key: newId(), productId: '', qty: '' }])}><Plus className="cg-icon" aria-hidden /> Tambah barang</button></div>
        <div className="cg-field"><label className="cg-label" htmlFor="tf-cat">Catatan (opsional)</label><input id="tf-cat" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Mengirim…' : 'Kirim'}</button></div>
      </form>
    </dialog>
  );
}

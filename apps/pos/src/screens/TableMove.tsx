import { useMemo, useState, type FormEvent } from 'react';
import { formatRp, type Order } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useApprover, ApproverFields } from '../lib/approver';
import { Modal } from '../ui';

/** Pindahkan pesanan yang belum dibayar ke meja kosong lain. */
export function MoveTableDialog({ order, tableName, onClose, onDone }: { order: Order; tableName: string; onClose: () => void; onDone: (o: Order, to: string) => void }) {
  const data = useData();
  const st = useAsync(async () => ({ floors: await data.listFloors(), tables: await data.listTableStatus() }), [data]);
  const [floor, setFloor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const floors = st.status === 'ready' ? st.data.floors : [];
  const active = floor ?? floors.find((f) => st.status === 'ready' && st.data.tables.some((t) => t.floorId === f.id && t.id === order.tableId))?.id ?? floors[0]?.id ?? null;
  const shown = useMemo(() => (st.status === 'ready' ? st.data.tables.filter((t) => (active ? t.floorId === active : true)) : []), [st, active]);
  const target = st.status === 'ready' ? st.data.tables.find((t) => t.id === picked) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !picked || !target) return;
    setBusy(true); setError('');
    try { onDone(await data.moveOrderTable(order.id, picked), target.name); }
    catch (err) { setError(err instanceof Error ? err.message : 'Pesanan gagal dipindah.'); setBusy(false); }
  }

  return (
    <Modal title={`Pindah ${order.number}`} onClose={busy ? undefined : onClose} labelledBy="pindah-title">
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">Sekarang di meja <strong>{tableName}</strong>. Pilih meja kosong tujuan. Isi pesanan dan nomornya tidak berubah.</p>
        {st.status === 'loading' && <div className="grid gap-8" aria-busy="true">{[0, 1].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
        {st.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Meja gagal dimuat. {st.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={st.reload}>Coba lagi</button></div>}
        {st.status === 'ready' && floors.length > 0 && (
          <>
            <div className="cg-tabs" role="tablist" aria-label="Lantai">
              {floors.map((f) => <button key={f.id} type="button" role="tab" className="cg-tab" aria-selected={active === f.id} onClick={() => { setFloor(f.id); setPicked(null); }}>{f.name}</button>)}
            </div>
            <ul className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }} aria-label="Meja tujuan">
              {shown.map((t) => {
                const here = t.id === order.tableId; const taken = !!t.order && !here;
                return (
                  <li key={t.id}>
                    <button type="button" className={`cg-btn cg-btn--block ${picked === t.id ? 'cg-btn--primary' : 'cg-btn--secondary'}`} style={{ minHeight: 64, flexDirection: 'column' }}
                      disabled={taken || here} aria-pressed={picked === t.id}
                      aria-label={here ? `Meja ${t.name}, meja sekarang` : taken ? `Meja ${t.name}, terisi` : `Meja ${t.name}, kosong`}
                      onClick={() => setPicked(t.id)}>
                      <strong>{t.name}</strong>
                      <span className={`cg-badge ${here ? '' : taken ? 'cg-badge--warning' : 'cg-badge--accent'}`}>{here ? 'Sekarang' : taken ? 'Terisi' : 'Kosong'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || !picked}>{busy ? 'Memindahkan…' : target ? `Pindah ke ${target.name}` : 'Pilih meja'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Satukan pesanan meja lain ke pesanan ini. Pesanan sumber dibatalkan dengan catatan "Digabung ke …". */
export function MergeTableDialog({ order, names, onClose, onDone }: { order: Order; names: Record<string, string>; onClose: () => void; onDone: (o: Order, from: Order) => void }) {
  const data = useData();
  const ap = useApprover('merge_tables');
  const others = useAsync(async () => (await data.listOrders({ status: 'open', limit: 100 })).filter((o) => o.id !== order.id && o.type === 'dine_in' && !!o.tableId && o.paidTotal === 0), [data, order.id]);
  const [fromId, setFromId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = others.status === 'ready' ? others.data.find((o) => o.id === fromId) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !from) return;
    setBusy(true); setError('');
    try {
      const by = await ap.authorize();
      if (!by) { setBusy(false); return setError('PIN salah.'); }
      onDone(await data.mergeOrders({ intoId: order.id, fromId: from.id, authorizedBy: by }), from);
    } catch (err) { setError(err instanceof Error ? err.message : 'Pesanan gagal digabung.'); setBusy(false); }
  }

  return (
    <Modal title={`Gabung ke ${order.number}`} onClose={busy ? undefined : onClose} labelledBy="gabung-title">
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">Pilih pesanan meja lain yang disatukan ke meja <strong>{names[order.tableId ?? ''] ?? '—'}</strong>. Itemnya pindah ke sini dan pesanan yang dipilih dibatalkan (tercatat digabung, bukan hilang).</p>
        {others.status === 'loading' && <div className="cg-skeleton" style={{ height: 56 }} aria-busy="true" />}
        {others.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Daftar pesanan gagal dimuat. {others.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={others.reload}>Coba lagi</button></div>}
        {others.status === 'ready' && others.data.length === 0 && <p className="text-text-muted">Tidak ada pesanan meja lain yang bisa digabung. Pesanan yang sudah dibayar sebagian tidak bisa digabung.</p>}
        {others.status === 'ready' && others.data.length > 0 && (
          <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="cg-label">Gabungkan pesanan</legend>
            {others.data.map((o) => (
              <label key={o.id} className="flex items-center gap-12 border border-border rounded-lg p-12 cursor-pointer">
                <input type="radio" name="sumber" value={o.id} checked={fromId === o.id} onChange={() => setFromId(o.id)} />
                <span className="grid min-w-0">
                  <strong className="break-words">Meja {names[o.tableId ?? ''] ?? '—'} · {o.number}</strong>
                  <span className="text-text-muted text-sm">{o.items.reduce((n, i) => n + i.qty, 0)} item · <span className="cg-num">{formatRp(o.total)}</span>{o.label ? ` · ${o.label}` : ''}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {from && <ApproverFields a={ap} idPrefix="gabung" what="penggabungan" />}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || !from || ap.staffLoading || !ap.credentialReady}>{busy ? 'Menggabungkan…' : 'Gabungkan'}</button>
        </div>
      </form>
    </Modal>
  );
}

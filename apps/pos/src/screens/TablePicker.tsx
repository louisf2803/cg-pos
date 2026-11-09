import { useMemo, useState } from 'react';
import { formatRp, type TableStatus } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

/** Pilih meja. Meja kosong dipilih untuk pesanan ini; meja terisi membuka pesanannya (bila keranjang kosong). */
export function TablePicker({ currentTableId, canResume, onPick, onResume, onClose }: {
  currentTableId?: string; canResume: boolean;
  onPick: (t: TableStatus) => void; onResume: (t: TableStatus) => void; onClose: () => void;
}) {
  const data = useData();
  const st = useAsync(async () => ({ floors: await data.listFloors(), tables: await data.listTableStatus() }), [data]);
  const [floor, setFloor] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const floors = st.status === 'ready' ? st.data.floors : [];
  const active = floor ?? floors[0]?.id ?? null;
  const shown = useMemo(() => (st.status === 'ready' ? st.data.tables.filter((t) => (active ? t.floorId === active : true)) : []), [st, active]);

  return (
    <Modal title="Pilih meja" onClose={onClose}>
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {st.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Meja gagal dimuat. {st.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={st.reload}>Coba lagi</button></div>}
      {st.status === 'ready' && floors.length === 0 && <div className="cg-empty"><p><strong>Belum ada meja.</strong></p><p className="text-text-muted">Tambahkan lantai dan meja di dashboard, menu Denah dan meja.</p></div>}
      {st.status === 'ready' && floors.length > 0 && (
        <>
          <div className="cg-tabs mb-12" role="tablist" aria-label="Lantai">
            {floors.map((f) => <button key={f.id} role="tab" className="cg-tab" aria-selected={active === f.id} onClick={() => { setFloor(f.id); setHint(''); }}>{f.name}</button>)}
          </div>
          {shown.length === 0 ? <p className="text-text-muted">Belum ada meja di lantai ini.</p> : (
            <ul className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }} aria-label="Meja">
              {shown.map((t) => {
                const busy = !!t.order;
                const mine = t.id === currentTableId;
                return (
                  <li key={t.id}>
                    <button className={`cg-btn cg-btn--block ${busy ? 'cg-btn--secondary' : mine ? 'cg-btn--primary' : 'cg-btn--secondary'}`} style={{ minHeight: 72, flexDirection: 'column' }}
                      aria-pressed={mine}
                      aria-label={busy ? `Meja ${t.name}, terisi, pesanan ${t.order!.number}, ${formatRp(t.order!.total)}` : `Meja ${t.name}, kosong${mine ? ', dipilih' : ''}`}
                      onClick={() => {
                        if (!busy || (mine && t.order)) { if (!busy) onPick(t); else onClose(); return; }
                        if (canResume) onResume(t); else setHint(`Meja ${t.name} sedang dipakai. Simpan atau kosongkan pesanan yang sedang dibuat dulu untuk membukanya.`);
                      }}>
                      <strong>{t.name}</strong>
                      <span className={`cg-badge ${busy ? 'cg-badge--warning' : 'cg-badge--accent'}`}>{busy ? 'Terisi' : mine ? 'Dipilih' : 'Kosong'}</span>
                      {busy && <span className="text-sm cg-num">{formatRp(t.order!.total)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hint && <p role="alert" className="text-danger-strong mt-12">{hint}</p>}
        </>
      )}
      <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button></div>
    </Modal>
  );
}

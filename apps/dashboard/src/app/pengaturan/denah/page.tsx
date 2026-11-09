'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { DiningTable, Floor } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg =
  | { kind: 'floor'; item?: Floor }
  | { kind: 'table'; floorId: string; item?: DiningTable }
  | { kind: 'del-floor'; item: Floor; count: number }
  | { kind: 'del-table'; item: DiningTable };

export default function DenahDanMeja() {
  const data = useData();
  const st = useAsync(async () => {
    const [floors, tables] = await Promise.all([data.listFloors(), data.listTables()]);
    return { floors, tables };
  }, [data]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const done = () => { setDlg(null); st.reload(); };

  return (
    <>
      <PageHeader title="Denah dan meja" subtitle="Lantai dan meja yang dipilih kasir untuk pesanan makan di tempat"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'floor' })}><Plus className="cg-icon" aria-hidden /> Tambah lantai</button>} />
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 72 }} />)}</div>}
      {st.status === 'ready' && (st.data.floors.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada lantai.</strong></p><button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'floor' })}>Tambah lantai pertama</button></div>
      ) : (
        <div className="grid gap-24 grid-cols-1 min-w-0">
          {st.data.floors.map((f) => {
            const mine = st.data.tables.filter((t) => t.floorId === f.id);
            return (
              <section key={f.id} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16" aria-labelledby={`f-${f.id}`}>
                <div className="flex flex-wrap items-center gap-8 mb-12">
                  <h2 id={`f-${f.id}`} className="text-lg break-words">{f.name}</h2>
                  <span className="text-text-muted text-sm">{mine.length} meja</span>
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah lantai ${f.name}`} onClick={() => setDlg({ kind: 'floor', item: f })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus lantai ${f.name}`} onClick={() => setDlg({ kind: 'del-floor', item: f, count: mine.length })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button className="cg-btn cg-btn--secondary cg-btn--sm ml-auto" onClick={() => setDlg({ kind: 'table', floorId: f.id })}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah meja</button>
                </div>
                {mine.length === 0 ? <p className="text-text-muted">Belum ada meja di lantai ini.</p> : (
                  <ul className="flex flex-wrap gap-8">
                    {mine.map((t) => (
                      <li key={t.id} className="flex items-center border border-border rounded-md bg-surface pl-12">
                        <span className="break-words max-w-[160px]">{t.name}</span>
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah meja ${t.name} (${f.name})`} onClick={() => setDlg({ kind: 'table', floorId: f.id, item: t })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus meja ${t.name} (${f.name})`} onClick={() => setDlg({ kind: 'del-table', item: t })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ))}
      {dlg && (dlg.kind === 'floor' || dlg.kind === 'table') && <NameDialog dlg={dlg} floors={st.status === 'ready' ? st.data.floors : []} onClose={() => setDlg(null)} onSaved={done} />}
      {dlg && (dlg.kind === 'del-floor' || dlg.kind === 'del-table') && <DeleteDialog dlg={dlg} onClose={() => setDlg(null)} onDeleted={done} />}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function NameDialog({ dlg, floors, onClose, onSaved }: { dlg: Extract<Dlg, { kind: 'floor' | 'table' }>; floors: Floor[]; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useModal();
  const isTable = dlg.kind === 'table';
  const [name, setName] = useState(dlg.item?.name ?? '');
  const [floorId, setFloorId] = useState(dlg.kind === 'table' ? dlg.floorId : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = isTable ? 'meja' : 'lantai';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError(`Nama ${noun} wajib diisi.`);
    setBusy(true); setError(null);
    try {
      if (isTable) await data.saveTable({ id: dlg.item?.id, floorId, name });
      else await data.saveFloor({ id: dlg.item?.id, name });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-denah" onClose={onClose} style={{ margin: 'auto' }}>
      <form onSubmit={submit} className="grid gap-16" noValidate>
        <h2 id="judul-denah" className="cg-modal__title">{dlg.item ? 'Ubah' : 'Tambah'} {noun}</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama-denah">Nama {noun}</label>
          <input id="nama-denah" className="cg-input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {isTable && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="lantai-denah">Lantai</label>
            <select id="lantai-denah" className="cg-input" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({ dlg, onClose, onDeleted }: { dlg: Extract<Dlg, { kind: 'del-floor' | 'del-table' }>; onClose: () => void; onDeleted: () => void }) {
  const data = useData();
  const ref = useModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isFloor = dlg.kind === 'del-floor';
  async function run() {
    setBusy(true); setError(null);
    try { if (isFloor) await data.deleteFloor(dlg.item.id); else await data.deleteTable(dlg.item.id); onDeleted(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); setBusy(false); }
  }
  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-hapus-denah" onClose={onClose} style={{ margin: 'auto' }}>
      <div className="grid gap-16">
        <h2 id="judul-hapus-denah" className="cg-modal__title">Hapus {isFloor ? 'lantai' : 'meja'} “{dlg.item.name}”?</h2>
        <p className="cg-modal__body">{isFloor ? (dlg.count > 0 ? `${dlg.count} meja di lantai ini ikut terhapus.` : 'Lantai ini kosong.') : 'Pesanan lama yang memakai meja ini tetap tersimpan di laporan.'}</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="button" className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void run()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

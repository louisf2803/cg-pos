'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { buyPricePerBase, describeProductUnit, formatRp, productUnitProblem, type ProductUnitRow, type PurchaseItem } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const PAGE = 60;
const num = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(n);

export default function ProductUnitsPage() {
  const data = useData();
  const state = useAsync(() => data.listPurchaseItems(), [data]);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [edit, setEdit] = useState<PurchaseItem | null>(null);
  const [notice, setNotice] = useState('');
  const list = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = search.trim().toLowerCase();
    return state.data.filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [state, search]);
  return (
    <>
      <PageHeader title="Satuan barang" subtitle="Satu barang boleh dibeli atau diresepkan dalam satuan lain, misalnya bahan disimpan dalam gram tetapi dibeli per kg. Isi satuan menyatakan berapa satuan dasar di dalamnya." />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 64 }} />)}</div>}
      {state.status === 'ready' && (
        <>
          <div className="cg-field mb-12" style={{ maxWidth: 360 }}><label className="cg-label" htmlFor="sn-cari">Cari barang</label>
            <input id="sn-cari" className="cg-input" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Nama barang" /></div>
          {list.length === 0 ? (
            <div className="cg-empty"><p><strong>{state.data.length === 0 ? 'Belum ada barang dengan stok terlacak.' : 'Tidak ada barang yang cocok.'}</strong></p><p className="text-text-muted">Satuan ganda berlaku untuk barang dan bahan yang stoknya dilacak.</p></div>
          ) : (
            <>
              <ul className="grid gap-12" aria-label="Daftar barang dan satuannya">
                {list.slice(0, shown).map((i) => (
                  <li key={i.productId} className="p-12 min-w-0" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)' }}>
                    <div className="flex flex-wrap gap-8 items-start justify-between">
                      <div className="min-w-0"><strong className="break-words">{i.name}</strong>
                        <span className="block text-sm text-text-muted">Satuan dasar: {i.baseUnit}</span></div>
                      <button className="cg-btn cg-btn--secondary" onClick={() => { setNotice(''); setEdit(i); }} aria-label={`Atur satuan ${i.name}`}><Pencil className="cg-icon" aria-hidden /> Atur satuan</button>
                    </div>
                    <div className="flex flex-wrap gap-8 mt-8">
                      {i.units.map((u) => <span key={u.unitId} className="cg-badge">{u.isBase ? `${u.name} (dasar)` : describeProductUnit(u, i.baseUnit)}</span>)}
                    </div>
                  </li>
                ))}
              </ul>
              {list.length > shown && <button className="cg-btn cg-btn--secondary mt-12" onClick={() => setShown((n) => n + PAGE)}>Tampilkan lebih banyak ({list.length - shown})</button>}
            </>
          )}
        </>
      )}
      {edit && <UnitsDialog item={edit} onClose={() => setEdit(null)} onChanged={(m) => { setNotice(m); state.reload(); }} />}
    </>
  );
}

function UnitsDialog({ item, onClose, onChanged }: { item: PurchaseItem; onClose: () => void; onChanged: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const rows = useAsync(() => data.listProductUnits(item.productId), [data, item.productId]);
  const [f, setF] = useState({ name: '', conversion: '', buyPrice: '', min: '1' });
  const [editing, setEditing] = useState<ProductUnitRow | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };
  const parse = (s: string) => Number(s.replace(',', '.'));
  function pick(u: ProductUnitRow) { setEditing(u); setF({ name: u.name, conversion: String(u.conversion), buyPrice: String(u.buyPrice || ''), min: String(u.minPurchase) }); setErr(''); }
  function clear() { setEditing(null); setF({ name: '', conversion: '', buyPrice: '', min: '1' }); setErr(''); }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { productId: item.productId, unitName: f.name, conversion: editing?.isBase ? 1 : parse(f.conversion), buyPrice: f.buyPrice.trim() === '' ? 0 : parse(f.buyPrice), minPurchase: parse(f.min) };
    const problem = productUnitProblem(input, editing ? undefined : item.baseUnit);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { await data.saveProductUnit(input); onChanged(`Satuan ${input.unitName.trim()} untuk ${item.name} disimpan.`); clear(); rows.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
    setBusy(false);
  }
  async function remove(u: ProductUnitRow) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await data.removeProductUnit(item.productId, u.unitId); onChanged(`Satuan ${u.name} dihapus dari ${item.name}.`); if (editing?.unitId === u.unitId) clear(); rows.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menghapus.'); }
    setBusy(false);
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-satuan">
      <div className="grid gap-12 min-w-0">
        <h2 id="judul-satuan" className="cg-modal__title break-words">Satuan {item.name}</h2>
        {rows.status === 'error' && <ErrorBox message={rows.message} onRetry={rows.reload} />}
        {rows.status === 'loading' && <div className="cg-skeleton" style={{ height: 80 }} aria-busy="true" aria-label="Memuat" />}
        {rows.status === 'ready' && (
          <ul className="grid gap-8" aria-label="Satuan barang">
            {rows.data.map((u) => (
              <li key={u.unitId} className="flex flex-wrap gap-8 items-center justify-between p-8 min-w-0" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div className="min-w-0"><strong className="break-words">{u.isBase ? `${u.name} (satuan dasar)` : describeProductUnit(u, item.baseUnit)}</strong>
                  <span className="block text-sm text-text-muted">Harga beli {u.buyPrice > 0 ? `${formatRp(u.buyPrice)} (${formatRp(buyPricePerBase(u))} per ${item.baseUnit})` : 'belum diisi'} · minimum beli {num(u.minPurchase)}{u.inUse && !u.isBase ? ' · sudah dipakai' : ''}</span></div>
                <div className="flex gap-8">
                  <button type="button" className="cg-btn cg-btn--ghost" onClick={() => pick(u)} aria-label={`Ubah satuan ${u.name}`}><Pencil className="cg-icon" aria-hidden /></button>
                  {!u.isBase && <button type="button" className="cg-btn cg-btn--ghost" disabled={busy || u.inUse} title={u.inUse ? 'Sudah dipakai, tidak bisa dihapus' : undefined} onClick={() => remove(u)} aria-label={`Hapus satuan ${u.name}`}><Trash2 className="cg-icon" aria-hidden /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="grid gap-12" noValidate aria-label={editing ? `Ubah satuan ${editing.name}` : 'Tambah satuan'}>
          <h3 className="font-semibold">{editing ? `Ubah satuan ${editing.name}` : 'Tambah satuan lain'}</h3>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="su-nama">Nama satuan</label><input id="su-nama" className="cg-input" maxLength={30} value={f.name} disabled={!!editing} onChange={(e) => set({ name: e.target.value })} placeholder="mis. kg, dus" /></div>
            {!editing?.isBase && <div className="cg-field"><label className="cg-label" htmlFor="su-isi">Isi (dalam {item.baseUnit})</label><input id="su-isi" className="cg-input cg-num" inputMode="decimal" value={f.conversion} disabled={!!editing?.inUse} onChange={(e) => set({ conversion: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="mis. 1000" /></div>}
            <div className="cg-field"><label className="cg-label" htmlFor="su-harga">Harga beli (Rp)</label><input id="su-harga" className="cg-input cg-num" inputMode="decimal" value={f.buyPrice} onChange={(e) => set({ buyPrice: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="su-min">Minimum beli</label><input id="su-min" className="cg-input cg-num" inputMode="decimal" value={f.min} onChange={(e) => set({ min: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
          </div>
          {editing?.inUse && !editing.isBase && <p className="text-sm text-text-muted">Satuan ini sudah dipakai, jadi isinya dikunci. Harga beli dan minimum beli tetap bisa diubah.</p>}
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          <div className="cg-modal__actions">
            {editing && <button type="button" className="cg-btn cg-btn--ghost" onClick={clear}>Batal ubah</button>}
            <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Tutup</button>
            <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}><Plus className="cg-icon" aria-hidden /> {busy ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

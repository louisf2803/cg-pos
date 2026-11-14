import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { extrasPerUnit, formatRp, selectionProblem, type ExtraGroup, type ItemExtra, type Product } from '@cgpos/shared';
import { Modal } from '../ui';
import { ExtraPicker } from './ExtraPicker';

export interface ProductDetailResult { qty: number; unitId?: string; note?: string; extras?: ItemExtra[] }

const NOTE_MAX = 100;

/**
 * Detail Produk: muncul setiap kali kartu produk diketuk. Atur jumlah, satuan (bila produk punya satuan jual lain), ekstra, dan catatan,
 * lalu Simpan memasukkan ke keranjang. Ekstra wajib yang belum dipilih menahan Simpan. Aturan dan pemilih ekstra memakai ExtraPicker yang sama seperti sebelumnya.
 * `onSave` mengembalikan pesan galat (mis. stok tidak cukup) atau null bila berhasil.
 */
export function ProductDetailDialog({ product, groups, onClose, onSave }: {
  product: Product; groups: ExtraGroup[]; onClose: () => void; onSave: (r: ProductDetailResult) => string | null;
}) {
  const [qty, setQty] = useState(1);
  const [unitId, setUnitId] = useState('');
  const [note, setNote] = useState('');
  const [extras, setExtras] = useState<ItemExtra[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  const alt = unitId ? product.sellUnits?.find((u) => u.id === unitId) : undefined;
  const unitPrice = alt ? alt.price : product.price;
  const lineTotal = Math.round(qty * (unitPrice + extrasPerUnit(extras)));
  const optionTotal = groups.reduce((n, g) => n + g.options.length, 0);
  const chosenIds = extras.map((e) => e.optionId);

  function save() {
    for (const g of groups) {
      const p = selectionProblem(g, chosenIds);
      if (p) { setError(`Anda belum memilih ekstra. ${p}`); return; }
    }
    const err = onSave({ qty, unitId: unitId || undefined, note: note.trim() || undefined, extras: extras.length ? extras : undefined });
    if (err) setError(err);
  }

  return (
    <>
      <Modal title="Detail Produk" onClose={onClose} labelledBy="detail-title">
        <div className="grid gap-16 min-w-0">
          <div className="flex items-center gap-12 min-w-0">
            {product.photoUrl
              ? <img src={product.photoUrl} alt="" className="w-[56px] h-[56px] rounded-md object-cover shrink-0" />
              : <span className="w-[56px] h-[56px] rounded-md bg-surface text-text-muted font-bold flex items-center justify-center shrink-0" aria-hidden>{product.name.trim().slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0"><p className="font-semibold break-words">{product.name}</p><p className="text-sm text-text-muted cg-num">{formatRp(unitPrice + extrasPerUnit(extras))}</p></div>
          </div>

          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <p className="text-sm font-medium mb-4">Kuantitas</p>
              <div className="flex items-center justify-between border border-border rounded-md min-h-[44px] px-8" role="group" aria-label="Kuantitas">
                <button type="button" className="p-8 rounded text-accent disabled:text-text-muted" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Kurangi"><Minus className="cg-icon cg-icon--sm" aria-hidden /></button>
                <input className="w-[64px] text-center bg-transparent font-bold cg-num" inputMode="numeric" aria-label="Jumlah" value={qty} onChange={(e) => setQty(Math.min(999, Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1)))} />
                <button type="button" className="p-8 rounded text-accent" onClick={() => setQty((q) => Math.min(999, q + 1))} aria-label="Tambah"><Plus className="cg-icon cg-icon--sm" aria-hidden /></button>
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-medium mb-4 block">Satuan</span>
              <select className="cg-input w-full" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!product.sellUnits?.length} aria-label="Satuan">
                <option value="">{product.baseUnitName ?? 'Porsi'}</option>
                {product.sellUnits?.map((u) => <option key={u.id} value={u.id}>{u.name} (isi {u.conversion}) · {formatRp(u.price)}</option>)}
              </select>
            </label>
          </div>

          {groups.length > 0 && (
            <section aria-label="Ekstra" className="border-t border-border pt-12">
              <div className="flex items-center justify-between gap-8">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Ekstra terpilih ({extras.length}/{optionTotal})</p>
                  <p className="text-sm text-text-muted break-words">{extras.length ? extras.map((e) => `${e.name} (1x)`).join(', ') : '-'}</p>
                </div>
                <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={() => { setError(''); setPicking(true); }}>Atur ›</button>
              </div>
            </section>
          )}

          <label className="block">
            <span className="flex items-center justify-between text-sm font-medium mb-4"><span>Catatan <span className="text-text-muted font-normal">opsional</span></span><span className="text-text-muted font-normal cg-num">{note.length}/{NOTE_MAX}</span></span>
            <textarea className="cg-input w-full" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Input catatan di sini" />
          </label>

          <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
          <div className="cg-modal__actions">
            <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
            <button type="button" className="cg-btn cg-btn--primary" onClick={save} data-autofocus>Simpan · {formatRp(lineTotal)}</button>
          </div>
        </div>
      </Modal>
      {picking && (
        <ExtraPicker product={product} groups={groups} initialChosen={chosenIds} confirmLabel="Pakai pilihan" onClose={() => setPicking(false)} onAdd={(picked) => { setExtras(picked); setPicking(false); setError(''); }} />
      )}
    </>
  );
}

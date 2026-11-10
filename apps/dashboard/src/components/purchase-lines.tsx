'use client';
import { Plus, Trash2 } from 'lucide-react';
import { formatRp, newId, purchaseLineTotal, type PurchaseItem, type PurchaseLineInput } from '@cgpos/shared';

export interface LineDraft { key: string; productId: string; unitId: string; qty: string; price: string; discount: string; received: string }
export const emptyLine = (): LineDraft => ({ key: newId(), productId: '', unitId: '', qty: '1', price: '', discount: '', received: '' });
export const numOf = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
export const rpDigits = (v: string) => v.replace(/[^\d]/g, '');
const decimal = (v: string) => v.replace(/[^\d.,]/g, '');

/** Ubah isian baris menjadi masukan DataLayer. Baris yang masih kosong dilewati. `received` kosong = diterima semua. */
export function toLineInputs(lines: LineDraft[], withReceived: boolean): PurchaseLineInput[] {
  return lines.filter((l) => l.productId).map((l) => ({
    productId: l.productId, unitId: l.unitId, qty: numOf(l.qty), unitPrice: numOf(l.price), discount: numOf(l.discount),
    ...(withReceived && l.received.trim() !== '' ? { receivedQty: numOf(l.received) } : {}),
  }));
}
export const fromLine = (l: { productId: string; unitId: string; qty: number; unitPrice: number; discount: number }): LineDraft => ({
  key: newId(), productId: l.productId, unitId: l.unitId, qty: String(l.qty), price: String(l.unitPrice), discount: l.discount ? String(l.discount) : '', received: '',
});

export function LinesEditor({ items, lines, onChange, withReceived }: { items: PurchaseItem[]; lines: LineDraft[]; onChange: (l: LineDraft[]) => void; withReceived?: boolean }) {
  const set = (key: string, patch: Partial<LineDraft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: string, productId: string) => {
    const it = items.find((i) => i.productId === productId);
    const u = it?.units[0];
    // harga awal: harga beli satuan bila diisi, kalau tidak biaya rata-rata x konversi
    const price = u ? (u.buyPrice > 0 ? u.buyPrice : Math.round(it!.avgCost * u.conversion)) : 0;
    set(key, { productId, unitId: u?.unitId ?? '', price: price > 0 ? String(price) : '' });
  };
  const pickUnit = (l: LineDraft, unitId: string) => {
    const it = items.find((i) => i.productId === l.productId);
    const u = it?.units.find((x) => x.unitId === unitId);
    set(l.key, { unitId, ...(u ? { price: String(u.buyPrice > 0 ? u.buyPrice : Math.round(it!.avgCost * u.conversion)) } : {}) });
  };
  return (
    <div className="grid gap-8">
      <div className="cg-data-wrap">
        <table className="cg-data" aria-label="Barang yang dibeli">
          <thead><tr><th>Barang</th><th>Satuan</th><th className="text-right">Jumlah</th><th className="text-right">Harga satuan</th><th className="text-right">Diskon</th>
            {withReceived && <th className="text-right">Diterima</th>}<th className="text-right">Jumlah harga</th><th><span className="cg-sr">Hapus</span></th></tr></thead>
          <tbody>
            {lines.map((l, idx) => {
              const it = items.find((i) => i.productId === l.productId);
              const total = purchaseLineTotal(numOf(l.qty), numOf(l.price), numOf(l.discount));
              return (
                <tr key={l.key}>
                  <td style={{ minWidth: 220 }}>
                    <select className="cg-input" aria-label={`Barang baris ${idx + 1}`} value={l.productId} onChange={(e) => pick(l.key, e.target.value)}>
                      <option value="">Pilih barang…</option>
                      {items.map((i) => <option key={i.productId} value={i.productId}>{i.name}</option>)}
                    </select>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <select className="cg-input" aria-label={`Satuan baris ${idx + 1}`} value={l.unitId} disabled={!it} onChange={(e) => pickUnit(l, e.target.value)}>
                      {!it && <option value="">—</option>}
                      {it?.units.map((u) => <option key={u.unitId} value={u.unitId}>{u.name}{u.conversion !== 1 ? ` (${u.conversion} ${it.baseUnit})` : ''}</option>)}
                    </select>
                  </td>
                  <td className="text-right"><input className="cg-input" style={{ width: 90, textAlign: 'right' }} inputMode="decimal" maxLength={14} aria-label={`Jumlah baris ${idx + 1}`} value={l.qty} onChange={(e) => set(l.key, { qty: decimal(e.target.value) })} /></td>
                  <td className="text-right"><input className="cg-input" style={{ width: 120, textAlign: 'right' }} inputMode="numeric" maxLength={13} aria-label={`Harga satuan baris ${idx + 1}`} value={l.price} onChange={(e) => set(l.key, { price: rpDigits(e.target.value) })} /></td>
                  <td className="text-right"><input className="cg-input" style={{ width: 100, textAlign: 'right' }} inputMode="numeric" maxLength={13} aria-label={`Diskon baris ${idx + 1}`} value={l.discount} onChange={(e) => set(l.key, { discount: rpDigits(e.target.value) })} /></td>
                  {withReceived && <td className="text-right"><input className="cg-input" style={{ width: 90, textAlign: 'right' }} inputMode="decimal" maxLength={14} placeholder="semua" aria-label={`Diterima baris ${idx + 1}`} value={l.received} onChange={(e) => set(l.key, { received: decimal(e.target.value) })} /></td>}
                  <td className="text-right cg-num whitespace-nowrap">{formatRp(l.productId ? total : 0)}</td>
                  <td><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus baris ${idx + 1}`} onClick={() => onChange(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [emptyLine()])}><Trash2 className="cg-icon" aria-hidden /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => onChange([...lines, emptyLine()])}><Plus className="cg-icon" aria-hidden /> Tambah barang</button></div>
    </div>
  );
}

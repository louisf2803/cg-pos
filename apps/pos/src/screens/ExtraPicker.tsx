import { useState } from 'react';
import { extrasPerUnit, formatRp, pickedExtras, selectionProblem, type ExtraGroup, type Product } from '@cgpos/shared';
import { Modal } from '../ui';

/** Pemilih Ekstra produk (grup wajib/opsional, satu atau banyak pilihan). */
export function ExtraPicker({ product, groups, onClose, onAdd, initialChosen, confirmLabel }: { product: Product; groups: ExtraGroup[]; onClose: () => void; onAdd: (extras: ReturnType<typeof pickedExtras>) => void; /** pilihan awal (id opsi), mis. saat membuka lagi dari Detail Produk */ initialChosen?: string[]; /** label tombol konfirmasi; bawaan "Tambah <harga>" */ confirmLabel?: string }) {
  const [chosen, setChosen] = useState<string[]>(initialChosen ?? []);
  const [error, setError] = useState('');
  const toggle = (g: ExtraGroup, id: string) => {
    setError('');
    setChosen((cur) => {
      const on = cur.includes(id);
      if (g.mode === 'single') return [...cur.filter((x) => !g.options.some((o) => o.id === x)), ...(on && !g.required ? [] : [id])];
      return on ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };
  const extras = pickedExtras(groups, chosen);
  function add() {
    for (const g of groups) {
      const p = selectionProblem(g, chosen);
      if (p) return setError(p);
    }
    onAdd(extras);
  }
  return (
    <Modal title={`Ekstra: ${product.name}`} onClose={onClose} labelledBy="extra-title">
      <div className="grid gap-16">
        {groups.map((g, gi) => {
          const hint = g.mode === 'single' ? 'pilih satu' : g.maxSelect ? `maksimal ${g.maxSelect}` : 'boleh lebih dari satu';
          return (
            <fieldset key={g.id} className="grid gap-8 border-0 p-0 m-0 min-w-0">
              <legend className="font-semibold mb-4">{g.name} <span className="text-text-muted text-sm font-normal">· {g.required ? 'wajib' : 'opsional'}, {hint}</span></legend>
              {g.options.map((o, oi) => {
                const on = chosen.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center justify-between gap-12 min-h-[44px] px-12 rounded-md border border-border cursor-pointer" style={on ? { borderColor: 'var(--color-accent)' } : undefined}>
                    <span className="flex items-center gap-8 min-w-0">
                      <input type={g.mode === 'single' ? 'radio' : 'checkbox'} name={`g-${g.id}`} checked={on} data-autofocus={gi === 0 && oi === 0 ? '' : undefined}
                        onChange={() => toggle(g, o.id)} onClick={() => { if (g.mode === 'single' && on) toggle(g, o.id); }} />
                      <span className="break-words">{o.name}</span>
                    </span>
                    <span className="cg-num text-text-muted shrink-0">{o.price > 0 ? `+${formatRp(o.price)}` : 'Gratis'}</span>
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
          <button type="button" className="cg-btn cg-btn--primary" onClick={add}>{confirmLabel ?? `Tambah ${formatRp(product.price + extrasPerUnit(extras))}`}</button>
        </div>
      </div>
    </Modal>
  );
}

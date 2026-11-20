import { useState } from 'react';
import { X } from 'lucide-react';
import { extrasPerUnit, formatRp, pickedExtras, selectionProblem, type ExtraGroup, type Product } from '@cgpos/shared';

/**
 * Panel pilihan varian langsung di panel pesanan (kanan), tanpa halaman atau dialog tambahan.
 * Muncul setelah kasir mengetuk menu yang punya varian; harga mengikuti pilihan.
 */
export function VariantPanel({ product, price, groups, onClose, onAdd }: { product: Product; price: number; groups: ExtraGroup[]; onClose: () => void; onAdd: (extras: ReturnType<typeof pickedExtras>) => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (g: ExtraGroup, id: string) => {
    setChosen((cur) => {
      const on = cur.includes(id);
      if (g.mode === 'single') return [...cur.filter((x) => !g.options.some((o) => o.id === x)), ...(on && !g.required ? [] : [id])];
      if (on) return cur.filter((x) => x !== id);
      const inGroup = cur.filter((x) => g.options.some((o) => o.id === x)).length;
      return g.maxSelect && inGroup >= g.maxSelect ? cur : [...cur, id];
    });
  };
  const extras = pickedExtras(groups, chosen);
  const problem = groups.map((g) => selectionProblem(g, chosen)).find(Boolean) ?? null;
  const total = price + extrasPerUnit(extras);

  return (
    <section className="p-12 mb-8 rounded-lg border border-accent bg-surface grid gap-12 min-w-0" aria-label={`Pilihan ${product.name}`} data-testid="variant-panel">
      <div className="flex items-start gap-8 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold m-0 break-words">{product.name}</p>
          <p className="text-[11px] text-text-muted m-0">Pilih varian, lalu tambahkan.</p>
        </div>
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" aria-label="Tutup pilihan varian" onClick={onClose}><X className="cg-icon cg-icon--sm" aria-hidden /></button>
      </div>
      {groups.map((g) => {
        const hint = g.mode === 'single' ? '' : g.maxSelect ? ` · maks. ${g.maxSelect}` : ' · boleh banyak';
        return (
          <fieldset key={g.id} className="grid gap-4 border-0 p-0 m-0 min-w-0">
            <legend className="text-[11px] font-semibold text-text-muted mb-4">{g.name}{g.required ? ' · wajib' : ''}{hint}</legend>
            <div className="flex flex-wrap gap-4">
              {g.options.map((o) => {
                const on = chosen.includes(o.id);
                return (
                  <button key={o.id} type="button" aria-pressed={on} data-testid={`variant-opt-${o.name}`}
                    className={`cg-btn cg-btn--sm ${on ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => toggle(g, o.id)}>
                    <span className="break-words">{o.name}</span>{o.price > 0 && <span className="cg-num opacity-80"> +{formatRp(o.price)}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <p role="alert" className="text-[11px] text-danger-strong m-0 min-h-[16px]">{problem && chosen.length > 0 ? problem : ''}</p>
      <div className="flex gap-8">
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>Batal</button>
        <button type="button" className="cg-btn cg-btn--primary cg-btn--sm flex-1" disabled={!!problem} data-testid="variant-add" onClick={() => onAdd(extras)}>
          {problem ? problem : `Tambah ${formatRp(total)}`}
        </button>
      </div>
    </section>
  );
}

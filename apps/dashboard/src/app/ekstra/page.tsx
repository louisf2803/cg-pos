'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { extraGroupProblem, formatRp, newId, parseRp, type CatalogProduct, type ExtraGroup, type RecipeIngredient } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg = { kind: 'edit'; item?: ExtraGroup } | { kind: 'delete'; item: ExtraGroup };

export default function ProdukEkstra() {
  const data = useData();
  const st = useAsync(async () => {
    const [groups, products, ingredients] = await Promise.all([
      data.listExtraGroups(),
      data.listCatalog({ includeInactive: true }),
      data.listRecipeIngredients(),
    ]);
    return { groups, products, ingredients };
  }, [data]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const done = () => { setDlg(null); st.reload(); };
  const nameOf = useMemo(() => new Map(st.status === 'ready' ? st.data.products.map((p) => [p.id, p.name]) : []), [st]);

  return (
    <>
      <PageHeader title="Produk ekstra" subtitle="Pilihan tambahan saat memesan, mis. level gula, topping, atau ganti susu"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}><Plus className="cg-icon" aria-hidden /> Tambah grup</button>} />
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>}
      {st.status === 'ready' && (st.data.groups.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada grup ekstra.</strong></p><p>Buat grup, isi pilihannya, lalu pilih produk yang memakainya.</p><button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Tambah grup pertama</button></div>
      ) : (
        <ul className="grid gap-12 grid-cols-1 min-w-0">
          {st.data.groups.map((g) => {
            const names = g.productIds.map((id) => nameOf.get(id)).filter(Boolean) as string[];
            return (
              <li key={g.id} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16 grid gap-8">
                <div className="flex flex-wrap items-center gap-8">
                  <h2 className="text-lg break-words min-w-0">{g.name}</h2>
                  <span className={`cg-badge ${g.required ? 'cg-badge--warning' : ''}`}>{g.required ? 'Wajib' : 'Opsional'}</span>
                  <span className="cg-badge">{g.mode === 'single' ? 'Pilih satu' : g.maxSelect ? `Maks. ${g.maxSelect} pilihan` : 'Banyak pilihan'}</span>
                  <span className="ml-auto flex gap-4">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah grup ${g.name}`} onClick={() => setDlg({ kind: 'edit', item: g })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus grup ${g.name}`} onClick={() => setDlg({ kind: 'delete', item: g })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                  </span>
                </div>
                <ul className="flex flex-wrap gap-8">
                  {g.options.map((o) => (
                    <li key={o.id} className="border border-border rounded-md bg-surface px-12 py-6 break-words">
                      <div>
                        {o.name} <span className="text-text-muted cg-num">{o.price > 0 ? `+${formatRp(o.price)}` : 'gratis'}</span>
                      </div>
                      {o.ingredientName && (
                        <div className="text-[11px] text-accent mt-2 font-medium">
                          Bahan: {o.ingredientName} {o.ingredientQty ? `(${o.ingredientQty} ${o.ingredientUnit ?? ''})` : ''}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-text-muted text-sm break-words">{names.length === 0 ? 'Belum dipakai produk mana pun.' : `Dipakai: ${names.join(', ')}`}</p>
              </li>
            );
          })}
        </ul>
      ))}
      {dlg?.kind === 'edit' && (
        <EditDialog
          item={dlg.item}
          products={st.status === 'ready' ? st.data.products : []}
          ingredients={st.status === 'ready' ? st.data.ingredients : []}
          onClose={() => setDlg(null)}
          onSaved={done}
        />
      )}
      {dlg?.kind === 'delete' && <DeleteDialog item={dlg.item} onClose={() => setDlg(null)} onDeleted={done} />}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function EditDialog({
  item,
  products,
  ingredients,
  onClose,
  onSaved,
}: {
  item?: ExtraGroup;
  products: CatalogProduct[];
  ingredients: RecipeIngredient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const ref = useModal();
  const [name, setName] = useState(item?.name ?? '');
  const [required, setRequired] = useState(item?.required ?? false);
  const [mode, setMode] = useState<'single' | 'multiple'>(item?.mode ?? 'single');
  const [max, setMax] = useState(item?.maxSelect ? String(item.maxSelect) : '');
  const [rows, setRows] = useState<{
    key: string;
    id?: string;
    name: string;
    price: string;
    ingredientId: string;
    ingredientQty: string;
    ingredientUnitId: string;
  }[]>(
    item?.options.length
      ? item.options.map((o) => ({
          key: o.id,
          id: o.id,
          name: o.name,
          price: String(o.price),
          ingredientId: o.ingredientId ?? '',
          ingredientQty: o.ingredientQty ? String(o.ingredientQty) : '',
          ingredientUnitId: o.ingredientUnitId ?? '',
        }))
      : [{ key: newId(), name: '', price: '', ingredientId: '', ingredientQty: '', ingredientUnitId: '' }]
  );
  const [picked, setPicked] = useState<Set<string>>(new Set(item?.productIds ?? []));
  const [find, setFind] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = products.filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()));
  const setRow = (key: string, patch: Partial<{ name: string; price: string; ingredientId: string; ingredientQty: string; ingredientUnitId: string }>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id: item?.id,
      name,
      required,
      mode,
      maxSelect: mode === 'multiple' && max.trim() ? Number(max) : null,
      options: rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          id: r.id,
          name: r.name,
          price: r.price.trim() ? parseRp(r.price) : 0,
          ingredientId: r.ingredientId || undefined,
          ingredientQty: r.ingredientId && r.ingredientQty ? Number(r.ingredientQty) : undefined,
          ingredientUnitId: r.ingredientUnitId || undefined,
        })),
      productIds: [...picked],
    };
    const problem = extraGroupProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { await data.saveExtraGroup(input); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-ekstra" onClose={onClose} style={{ margin: 'auto', width: 'min(560px, calc(100vw - 32px))' }}>
      <form onSubmit={submit} className="grid gap-16 min-w-0" noValidate>
        <h2 id="judul-ekstra" className="cg-modal__title">{item ? 'Ubah' : 'Tambah'} grup ekstra</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="ekstra-nama">Nama grup</label>
          <input id="ekstra-nama" className="cg-input" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Level gula" />
        </div>
        <div className="grid gap-12 grid-cols-1">
          <div className="cg-field">
            <label className="cg-label" htmlFor="ekstra-mode">Cara memilih</label>
            <select id="ekstra-mode" className="cg-input" value={mode} onChange={(e) => setMode(e.target.value as 'single' | 'multiple')}>
              <option value="single">Pilih satu</option>
              <option value="multiple">Boleh lebih dari satu</option>
            </select>
          </div>
          {mode === 'multiple' && (
            <div className="cg-field">
              <label className="cg-label" htmlFor="ekstra-max">Batas pilihan (kosong = tanpa batas)</label>
              <input id="ekstra-max" className="cg-input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <label className="flex items-center gap-8"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Wajib dipilih kasir</label>
        </div>
        <fieldset className="grid gap-8 border-0 p-0 m-0 min-w-0">
          <legend className="cg-label mb-4">Pilihan & Tautan Bahan Baku</legend>
          {rows.map((r, i) => {
            const ing = ingredients.find((x) => x.id === r.ingredientId);
            return (
              <div key={r.key} className="grid gap-6 border border-border/60 rounded-md p-8 bg-surface-muted/20 min-w-0">
                <div className="flex gap-8 items-start min-w-0">
                  <input
                    className="cg-input min-w-0 flex-1"
                    aria-label={`Nama pilihan ${i + 1}`}
                    placeholder="Nama pilihan"
                    maxLength={60}
                    value={r.name}
                    onChange={(e) => setRow(r.key, { name: e.target.value })}
                  />
                  <input
                    className="cg-input w-[110px] shrink-0"
                    aria-label={`Harga tambahan pilihan ${i + 1}`}
                    inputMode="numeric"
                    placeholder="Rp 0"
                    value={r.price}
                    onChange={(e) => setRow(r.key, { price: e.target.value.replace(/[^\d]/g, '') })}
                  />
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm shrink-0"
                    aria-label={`Hapus pilihan ${i + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                  >
                    <X className="cg-icon cg-icon--sm" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-xs text-text-muted pt-2">
                  <span className="shrink-0 font-medium">Bahan terpotong:</span>
                  <select
                    className="cg-input text-xs h-[28px] py-0 max-w-[200px]"
                    aria-label={`Bahan baku pilihan ${i + 1}`}
                    value={r.ingredientId}
                    onChange={(e) => {
                      const sel = ingredients.find((x) => x.id === e.target.value);
                      setRow(r.key, {
                        ingredientId: e.target.value,
                        ingredientUnitId: sel?.units[0]?.unitId ?? '',
                      });
                    }}
                  >
                    <option value="">(Tanpa bahan baku)</option>
                    {ingredients.map((ingItem) => (
                      <option key={ingItem.id} value={ingItem.id}>
                        {ingItem.name} ({ingItem.baseUnit})
                      </option>
                    ))}
                  </select>
                  {r.ingredientId && (
                    <div className="flex items-center gap-4">
                      <span>Jml:</span>
                      <input
                        className="cg-input text-xs h-[28px] w-[64px] py-0"
                        aria-label={`Jumlah bahan pilihan ${i + 1}`}
                        inputMode="decimal"
                        placeholder="0"
                        value={r.ingredientQty}
                        onChange={(e) => setRow(r.key, { ingredientQty: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })}
                      />
                      <span>{ing?.baseUnit ?? ''}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm w-fit" onClick={() => setRows((x) => [...x, { key: newId(), name: '', price: '', ingredientId: '', ingredientQty: '', ingredientUnitId: '' }])}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah pilihan</button>
        </fieldset>
        <fieldset className="grid gap-8 border-0 p-0 m-0 min-w-0">
          <legend className="cg-label mb-4">Dipakai oleh produk ({picked.size})</legend>
          <input className="cg-input" aria-label="Cari produk" placeholder="Cari produk" value={find} onChange={(e) => setFind(e.target.value)} />
          <ul className="grid gap-4 overflow-y-auto border border-border rounded-md p-8" style={{ maxHeight: 180 }}>
            {shown.length === 0 && <li className="text-text-muted">Tidak ada produk yang cocok.</li>}
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-8 min-h-[32px]">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                  <span className="break-words min-w-0">{p.name}{p.variants.length > 0 && <span className="text-text-muted text-sm"> · {p.variants.length} ukuran</span>}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({ item, onClose, onDeleted }: { item: ExtraGroup; onClose: () => void; onDeleted: () => void }) {
  const data = useData();
  const ref = useModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setError(null);
    try { await data.deleteExtraGroup(item.id); onDeleted(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); setBusy(false); }
  }
  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-hapus-ekstra" onClose={onClose} style={{ margin: 'auto' }}>
      <div className="grid gap-16">
        <h2 id="judul-hapus-ekstra" className="cg-modal__title">Hapus grup “{item.name}”?</h2>
        <p className="cg-modal__body">Grup ini tidak lagi muncul di kasir. Pesanan lama tetap menyimpan nama dan harga pilihannya.</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="button" className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void run()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

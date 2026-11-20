'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  MAX_PARENT_VARIANTS, formatRp, newId, parseRp, variantColumns, variantSetupProblem,
  type ExtraGroup, type ProductVariantsSetup, type RecipeIngredient, type VariantStockLine,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox } from '@/components/page';

interface AttGroup { groupId: string; isParent: boolean; /** id isi yang boleh -> tambahan harga (teks) */ allowed: Record<string, string> }
interface Row { key: string; ingredientId: string; unitId: string; q: Record<string, string> }
type Blocks = Record<string, Row[]>;
const BASE = 'base';

const num = (s: string | undefined) => { const n = Number((s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export function ProdukTab() {
  const data = useData();
  const st = useAsync(async () => {
    const [groups, products, ingredients] = await Promise.all([data.listExtraGroups(), data.listCatalog({ includeInactive: true }), data.listRecipeIngredients()]);
    return { groups, products, ingredients };
  }, [data]);
  const [productId, setProductId] = useState<string | null>(null);
  const [find, setFind] = useState('');

  if (st.status === 'loading') return <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>;
  if (st.status === 'error') return <ErrorBox message={st.message} onRetry={st.reload} />;
  const { groups, products, ingredients } = st.data;
  const shown = products.filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()));
  const attachedCount = (id: string) => groups.filter((g) => g.productIds.includes(id)).length;
  const product = products.find((p) => p.id === productId) ?? null;

  if (groups.length === 0) return <div className="cg-empty"><p><strong>Belum ada varian.</strong></p><p>Buat varian di tab Master varian dulu.</p></div>;
  return (
    <div className="grid gap-16 min-w-0">
      <div className="cg-field max-w-[480px]">
        <label className="cg-label" htmlFor="varian-cari">Produk</label>
        <input id="varian-cari" className="cg-input" placeholder="Cari produk" value={find} onChange={(e) => setFind(e.target.value)} />
        <ul className="grid gap-4 overflow-y-auto border border-border rounded-md p-8" style={{ maxHeight: 220 }}>
          {shown.length === 0 && <li className="text-text-muted">Tidak ada produk yang cocok.</li>}
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" className={`cg-btn cg-btn--sm w-full justify-between ${p.id === productId ? 'cg-btn--primary' : 'cg-btn--ghost'}`} aria-pressed={p.id === productId} onClick={() => setProductId(p.id)}>
                <span className="break-words min-w-0 text-left">{p.name}</span>
                {attachedCount(p.id) > 0 && <span className="cg-badge">{attachedCount(p.id)} varian</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {product ? <ProductEditor key={product.id} productId={product.id} productName={product.name} basePrice={product.price} groups={groups} ingredients={ingredients} onSaved={st.reload} />
        : <p className="text-text-muted">Pilih produk untuk memasang varian, mengatur harga per isi, dan mengisi resepnya.</p>}
    </div>
  );
}

function ProductEditor({ productId, productName, basePrice, groups, ingredients, onSaved }: { productId: string; productName: string; basePrice: number; groups: ExtraGroup[]; ingredients: RecipeIngredient[]; onSaved: () => void }) {
  const data = useData();
  const loaded = useAsync(() => data.getProductVariants(productId), [data, productId]);
  if (loaded.status === 'loading') return <div className="cg-skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Memuat" />;
  if (loaded.status === 'error') return <ErrorBox message={loaded.message} onRetry={loaded.reload} />;
  return <EditorBody productName={productName} productId={productId} basePrice={basePrice} groups={groups} ingredients={ingredients} initial={loaded.data} onSaved={onSaved} />;
}

function initAtt(setup: ProductVariantsSetup, groups: ExtraGroup[]): AttGroup[] {
  return setup.groups.filter((sg) => groups.some((g) => g.id === sg.groupId)).map((sg) => {
    const g = groups.find((x) => x.id === sg.groupId)!;
    const allowed: Record<string, string> = {};
    if (sg.options) for (const o of sg.options) { if (g.options.some((x) => x.id === o.optionId)) allowed[o.optionId] = o.priceDelta ? String(o.priceDelta) : ''; }
    else for (const o of g.options) allowed[o.id] = o.price ? String(o.price) : '';
    return { groupId: sg.groupId, isParent: sg.isParent, allowed };
  });
}

function initBlocks(lines: VariantStockLine[]): Blocks {
  const out: Blocks = {};
  for (const l of lines) {
    const id = l.optionId ?? BASE;
    const rows = (out[id] ??= []);
    let r = rows.find((x) => x.ingredientId === l.ingredientId && x.unitId === l.unitId);
    if (!r) { r = { key: newId(), ingredientId: l.ingredientId, unitId: l.unitId, q: {} }; rows.push(r); }
    r.q[l.comboKey] = String(l.qty);
  }
  return out;
}

function EditorBody({ productName, productId, basePrice, groups, ingredients, initial, onSaved }: { productName: string; productId: string; basePrice: number; groups: ExtraGroup[]; ingredients: RecipeIngredient[]; initial: ProductVariantsSetup; onSaved: () => void }) {
  const data = useData();
  const [att, setAtt] = useState<AttGroup[]>(() => initAtt(initial, groups));
  const [blocks, setBlocks] = useState<Blocks>(() => initBlocks(initial.lines));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const free = groups.filter((g) => !att.some((a) => a.groupId === g.id));
  const parentCount = att.filter((a) => a.isParent).length;

  const parents = att.filter((a) => a.isParent).map((a) => ({ options: gById.get(a.groupId)!.options.filter((o) => o.id in a.allowed) }));
  const columns = variantColumns(parents);
  const touch = () => { setNotice(null); setError(null); };

  const patchAtt = (groupId: string, fn: (a: AttGroup) => AttGroup) => { touch(); setAtt((cur) => cur.map((a) => (a.groupId === groupId ? fn(a) : a))); };
  const move = (i: number, d: -1 | 1) => { touch(); setAtt((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j]!, n[i]!]; return n; }); };

  function defaultRows(blockId: string, g: ExtraGroup | undefined): Row[] {
    if (blockId !== BASE && g?.kind === 'material' && g.materialIngredientId) {
      const ing = ingById.get(g.materialIngredientId);
      return [{ key: `d-${blockId}`, ingredientId: g.materialIngredientId, unitId: g.materialUnitId ?? ing?.units[0]?.unitId ?? '', q: {} }];
    }
    return [];
  }
  const rowsOf = (blockId: string, g?: ExtraGroup): Row[] => blocks[blockId] ?? defaultRows(blockId, g);
  const writeRows = (blockId: string, g: ExtraGroup | undefined, fn: (rows: Row[]) => Row[]) => { touch(); setBlocks((cur) => ({ ...cur, [blockId]: fn(cur[blockId] ?? defaultRows(blockId, g)) })); };
  const setCell = (blockId: string, g: ExtraGroup | undefined, rowKey: string, col: string, v: string) => writeRows(blockId, g, (rows) => rows.map((r) => (r.key === rowKey ? { ...r, q: { ...r.q, [col]: v.replace(/[^\d.,]/g, '') } } : r)));
  const setIngredient = (blockId: string, g: ExtraGroup | undefined, rowKey: string, ingredientId: string) => writeRows(blockId, g, (rows) => rows.map((r) => (r.key === rowKey ? { ...r, ingredientId, unitId: ingById.get(ingredientId)?.units[0]?.unitId ?? '' } : r)));
  const setUnit = (blockId: string, g: ExtraGroup | undefined, rowKey: string, unitId: string) => writeRows(blockId, g, (rows) => rows.map((r) => (r.key === rowKey ? { ...r, unitId } : r)));
  const addRow = (blockId: string, g?: ExtraGroup) => writeRows(blockId, g, (rows) => [...rows, { key: newId(), ingredientId: '', unitId: '', q: {} }]);
  const delRow = (blockId: string, g: ExtraGroup | undefined, rowKey: string) => writeRows(blockId, g, (rows) => rows.filter((r) => r.key !== rowKey));

  // blok takaran: resep dasar + tiap isi yang boleh dari varian berjenis bahan atau gelas
  const optionBlocks = att.flatMap((a) => {
    const g = gById.get(a.groupId)!;
    if (g.kind !== 'material' && g.kind !== 'cup') return [];
    return g.options.filter((o) => o.id in a.allowed).map((o) => ({ id: o.id, title: `${g.name}: ${o.name}`, g, kind: g.kind! }));
  });

  function gaps(rows: Row[]): number {
    let n = 0;
    for (const r of rows) {
      if (!r.ingredientId) continue;
      const filled = columns.filter((c) => num(r.q[c.key]) > 0).length;
      if (filled > 0) n += columns.length - filled;
    }
    return n;
  }
  const totalGaps = gaps(rowsOf(BASE)) + optionBlocks.reduce((s, b) => s + gaps(rowsOf(b.id, b.g)), 0);

  function buildSetup(): ProductVariantsSetup {
    const lines: VariantStockLine[] = [];
    const emit = (blockId: string, rows: Row[]) => {
      for (const r of rows) {
        if (!r.ingredientId || !r.unitId) continue;
        for (const c of columns) {
          const q = num(r.q[c.key]);
          if (q > 0) lines.push({ optionId: blockId === BASE ? null : blockId, comboKey: c.key, ingredientId: r.ingredientId, qty: q, unitId: r.unitId });
        }
      }
    };
    emit(BASE, rowsOf(BASE));
    for (const b of optionBlocks) emit(b.id, rowsOf(b.id, b.g));
    return {
      groups: att.map((a) => ({
        groupId: a.groupId, isParent: a.isParent,
        options: Object.entries(a.allowed).map(([optionId, d]) => ({ optionId, priceDelta: d.trim() ? parseRp(d) : 0 })),
      })),
      lines,
    };
  }

  async function save() {
    if (busy) return;
    for (const a of att) if (Object.keys(a.allowed).length === 0) return setError(`${gById.get(a.groupId)!.name}: pilih minimal satu isi yang boleh.`);
    const setup = buildSetup();
    const problem = variantSetupProblem(setup);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { await data.saveProductVariants(productId, setup); setNotice('Tersimpan.'); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  }

  const recipeTable = (blockId: string, g: ExtraGroup | undefined, title: string, hint?: string) => {
    const rows = rowsOf(blockId, g);
    return (
      <section key={blockId} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16 grid gap-8" aria-label={title}>
        <h3 className="text-base m-0 break-words">{title}</h3>
        {hint && <p className="text-text-muted text-sm m-0">{hint}</p>}
        <div className="overflow-x-auto min-w-0">
          <table className="cg-data w-full">
            <thead>
              <tr>
                <th scope="col">Bahan</th><th scope="col">Satuan</th>
                {columns.map((c) => <th key={c.key} scope="col" className="text-right">{c.label}</th>)}
                <th scope="col"><span className="sr-only">Hapus</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={columns.length + 3} className="text-text-muted">Belum ada bahan.</td></tr>}
              {rows.map((r) => {
                const ing = ingById.get(r.ingredientId);
                const anyFilled = columns.some((c) => num(r.q[c.key]) > 0);
                return (
                  <tr key={r.key}>
                    <td className="min-w-[160px]">
                      <select className="cg-input" aria-label="Bahan" value={r.ingredientId} onChange={(e) => setIngredient(blockId, g, r.key, e.target.value)}>
                        <option value="">Pilih bahan</option>
                        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td className="min-w-[96px]">
                      <select className="cg-input" aria-label="Satuan" value={r.unitId} disabled={!ing} onChange={(e) => setUnit(blockId, g, r.key, e.target.value)}>
                        {(ing?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.name}</option>)}
                      </select>
                    </td>
                    {columns.map((c) => {
                      const gap = !!r.ingredientId && anyFilled && !(num(r.q[c.key]) > 0);
                      return (
                        <td key={c.key} className="min-w-[88px]">
                          <input className="cg-input text-right cg-num" inputMode="decimal" aria-label={`${ing?.name ?? 'Bahan'} untuk ${c.label}`} aria-invalid={gap || undefined}
                            placeholder={gap ? 'belum diisi' : '—'} style={gap ? { background: 'var(--color-warning-soft)' } : undefined}
                            value={r.q[c.key] ?? ''} onChange={(e) => setCell(blockId, g, r.key, c.key, e.target.value)} />
                        </td>
                      );
                    })}
                    <td><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label="Hapus baris bahan" onClick={() => delRow(blockId, g, r.key)}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm w-fit" onClick={() => addRow(blockId, g)}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah bahan</button>
      </section>
    );
  };

  return (
    <div className="grid gap-16 min-w-0">
      <h2 className="text-lg m-0 break-words">{productName} <span className="text-text-muted cg-num text-base">{formatRp(basePrice)}</span></h2>

      <section className="grid gap-12 min-w-0" aria-label="Varian yang menempel">
        <div className="flex flex-wrap items-end gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="varian-pasang">Pasang varian</label>
            <select id="varian-pasang" className="cg-input" value="" disabled={free.length === 0} onChange={(e) => {
              const g = gById.get(e.target.value); if (!g) return;
              touch();
              setAtt((cur) => [...cur, { groupId: g.id, isParent: false, allowed: Object.fromEntries(g.options.map((o) => [o.id, o.price ? String(o.price) : ''])) }]);
            }}>
              <option value="">{free.length === 0 ? 'Semua varian sudah terpasang' : 'Pilih varian'}</option>
              {free.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        {att.length === 0 && <p className="text-text-muted m-0">Belum ada varian terpasang. Produk ini dijual tanpa pilihan.</p>}
        {att.map((a, i) => {
          const g = gById.get(a.groupId)!;
          const canParent = a.isParent || parentCount < MAX_PARENT_VARIANTS;
          return (
            <div key={a.groupId} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16 grid gap-8">
              <div className="flex flex-wrap items-center gap-8">
                <h3 className="text-base m-0 break-words min-w-0">{g.name}</h3>
                <label className="flex items-center gap-8"><input type="checkbox" checked={a.isParent} disabled={!canParent} onChange={(e) => patchAtt(a.groupId, (x) => ({ ...x, isParent: e.target.checked }))} /> Jadikan induk resep</label>
                <span className="ml-auto flex gap-4">
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Naikkan ${g.name}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Turunkan ${g.name}`} disabled={i === att.length - 1} onClick={() => move(i, 1)}><ArrowDown className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Lepas ${g.name}`} onClick={() => { touch(); setAtt((cur) => cur.filter((x) => x.groupId !== a.groupId)); }}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                </span>
              </div>
              <ul className="grid gap-8 grid-cols-1">
                {g.options.map((o) => {
                  const on = o.id in a.allowed;
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-8 min-w-0">
                      <label className="flex items-center gap-8 min-w-0 flex-1"><input type="checkbox" checked={on} onChange={(e) => patchAtt(a.groupId, (x) => {
                        const allowed = { ...x.allowed };
                        if (e.target.checked) allowed[o.id] = o.price ? String(o.price) : ''; else delete allowed[o.id];
                        return { ...x, allowed };
                      })} /> <span className="break-words">{o.name}</span></label>
                      {on && <input className="cg-input w-[120px] shrink-0 text-right cg-num" inputMode="numeric" aria-label={`Tambahan harga ${o.name} untuk ${productName}`} placeholder="+Rp 0" value={a.allowed[o.id] ?? ''}
                        onChange={(e) => patchAtt(a.groupId, (x) => ({ ...x, allowed: { ...x.allowed, [o.id]: e.target.value.replace(/[^\d]/g, '') } }))} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <div role="status" className="cg-banner">
        {parents.length === 0
          ? 'Tanpa induk: resep punya satu kolom dan berlaku untuk semua pilihan.'
          : `Kolom resep (${columns.length}): ${columns.map((c) => c.label).join(', ')}. Resep dan takaran diisi per kolom; tidak ada pengali otomatis.`}
      </div>
      {parentCount >= MAX_PARENT_VARIANTS && <p className="text-text-muted text-sm m-0">Sudah {MAX_PARENT_VARIANTS} induk, batas maksimal. Lepas centang salah satu untuk mengganti.</p>}

      {recipeTable(BASE, undefined, 'Resep dasar', 'Bahan yang selalu terpakai per porsi. Bila diisi, resep biasa produk ini tidak dipakai lagi untuk potong stok.')}
      {optionBlocks.map((b) => recipeTable(b.id, b.g, `Takaran ${b.title}`, b.kind === 'cup' ? 'Gelas atau wadah yang terpotong saat isi ini dipilih (kosong = tidak memotong apa pun).' : 'Takaran bahan saat isi ini dipilih. Isi per kolom; kolom kosong berarti belum diisi.'))}

      {totalGaps > 0 && <p role="alert" className="cg-banner cg-banner--warning m-0">{totalGaps} sel takaran belum diisi (berwarna kuning). Pesanan pada kolom itu tidak akan memotong bahan tersebut.</p>}
      <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
      {notice && <p role="status" className="text-success-strong m-0">{notice}</p>}
      <div><button type="button" className="cg-btn cg-btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan varian dan resep'}</button></div>
    </div>
  );
}

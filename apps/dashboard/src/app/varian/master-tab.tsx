'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { extraGroupProblem, formatRp, newId, parseRp, type ExtraGroup, type RecipeIngredient } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox } from '@/components/page';

type Dlg = { kind: 'edit'; item?: ExtraGroup } | { kind: 'delete'; item: ExtraGroup };
type Kind = 'plain' | 'material' | 'cup';
export const KIND_LABEL: Record<Kind, string> = { plain: 'Biasa', material: 'Bahan (takaran per kolom)', cup: 'Gelas atau wadah' };

export function MasterTab() {
  const data = useData();
  const st = useAsync(async () => {
    const [groups, ingredients] = await Promise.all([data.listExtraGroups(), data.listRecipeIngredients()]);
    return { groups, ingredients };
  }, [data]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const done = () => { setDlg(null); st.reload(); };

  return (
    <div className="space-y-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <p className="text-text-muted m-0 max-w-[640px]">Varian dibuat sekali di sini. Menambah isi baru (mis. Half sugar) tidak otomatis muncul di produk: pasang dulu di tab sebelah dan isi takarannya.</p>
        <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}><Plus className="cg-icon" aria-hidden /> Tambah varian</button>
      </div>
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>}
      {st.status === 'ready' && (st.data.groups.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada varian.</strong></p><p>Mulai dari Ukuran (Small, Medium, Large), lalu Gula, Es batu, atau Penyajian.</p><button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Tambah varian pertama</button></div>
      ) : (
        <ul className="grid gap-12 grid-cols-1 min-w-0">
          {st.data.groups.map((g) => (
            <li key={g.id} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16 grid gap-8">
              <div className="flex flex-wrap items-center gap-8">
                <h2 className="text-lg break-words min-w-0">{g.name}</h2>
                <span className="cg-badge">{KIND_LABEL[g.kind ?? 'plain']}</span>
                <span className={`cg-badge ${g.required ? 'cg-badge--warning' : ''}`}>{g.required ? 'Wajib' : 'Opsional'}</span>
                <span className="cg-badge">{g.mode === 'single' ? 'Pilih satu' : g.maxSelect ? `Maks. ${g.maxSelect} pilihan` : 'Banyak pilihan'}</span>
                <span className="ml-auto flex gap-4">
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah varian ${g.name}`} onClick={() => setDlg({ kind: 'edit', item: g })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus varian ${g.name}`} onClick={() => setDlg({ kind: 'delete', item: g })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                </span>
              </div>
              <ul className="flex flex-wrap gap-8">
                {g.options.map((o) => <li key={o.id} className="border border-border rounded-md bg-surface px-12 py-4 break-words">{o.name} {o.price > 0 && <span className="text-text-muted cg-num">+{formatRp(o.price)}</span>}</li>)}
              </ul>
              <p className="text-text-muted text-sm break-words">{g.productIds.length === 0 ? 'Belum dipasang di produk mana pun.' : `Dipasang di ${g.productIds.length} produk.`}</p>
            </li>
          ))}
        </ul>
      ))}
      {dlg?.kind === 'edit' && <EditDialog item={dlg.item} ingredients={st.status === 'ready' ? st.data.ingredients : []} onClose={() => setDlg(null)} onSaved={done} />}
      {dlg?.kind === 'delete' && <DeleteDialog item={dlg.item} onClose={() => setDlg(null)} onDeleted={done} />}
    </div>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function EditDialog({ item, ingredients, onClose, onSaved }: { item?: ExtraGroup; ingredients: RecipeIngredient[]; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useModal();
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'plain');
  const [required, setRequired] = useState(item?.required ?? false);
  const [mode, setMode] = useState<'single' | 'multiple'>(item?.mode ?? 'single');
  const [max, setMax] = useState(item?.maxSelect ? String(item.maxSelect) : '');
  const [ing, setIng] = useState(item?.materialIngredientId ?? '');
  const [unit, setUnit] = useState(item?.materialUnitId ?? '');
  const [rows, setRows] = useState<{ key: string; id?: string; name: string; price: string }[]>(
    item?.options.length ? item.options.map((o) => ({ key: o.id, id: o.id, name: o.name, price: o.price ? String(o.price) : '' })) : [{ key: newId(), name: '', price: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setRow = (key: string, patch: Partial<{ name: string; price: string }>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const ingredient = ingredients.find((i) => i.id === ing);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (kind === 'material' && !ing) return setError('Pilih bahan untuk varian jenis Bahan.');
    const input = {
      id: item?.id, name, required, mode, maxSelect: mode === 'multiple' && max.trim() ? Number(max) : null, kind,
      materialIngredientId: kind === 'material' ? ing : null, materialUnitId: kind === 'material' ? unit || ingredient?.units[0]?.unitId || null : null,
      options: rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name, price: r.price.trim() ? parseRp(r.price) : 0 })),
      productIds: item?.productIds ?? [],
    };
    const problem = extraGroupProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { await data.saveExtraGroup(input); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-varian" onClose={onClose} style={{ margin: 'auto', width: 'min(560px, calc(100vw - 32px))' }}>
      <form onSubmit={submit} className="grid gap-16 min-w-0" noValidate>
        <h2 id="judul-varian" className="cg-modal__title">{item ? 'Ubah' : 'Tambah'} varian</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="varian-nama">Nama varian</label>
          <input id="varian-nama" className="cg-input" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Ukuran, Gula, Penyajian" />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="varian-jenis">Jenis</label>
          <select id="varian-jenis" className="cg-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <p className="text-text-muted text-sm m-0">{kind === 'plain' ? 'Hanya pilihan dan harga (mis. Ukuran, Suhu, topping tanpa stok).' : kind === 'material' ? 'Pilihan yang memotong satu bahan (mis. Gula pasir, Es batu); takarannya diisi per kolom resep.' : 'Pilihan yang memotong gelas atau wadah (mis. Dine in memakai gelas kaca, Take away memakai cup plastik).'}</p>
        </div>
        {kind === 'material' && (
          <div className="grid gap-12 grid-cols-1">
            <div className="cg-field">
              <label className="cg-label" htmlFor="varian-bahan">Bahan yang dipotong</label>
              <select id="varian-bahan" className="cg-input" value={ing} onChange={(e) => { setIng(e.target.value); setUnit(''); }}>
                <option value="">Pilih bahan</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            {ingredient && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="varian-satuan">Satuan takaran</label>
                <select id="varian-satuan" className="cg-input" value={unit || ingredient.units[0]?.unitId || ''} onChange={(e) => setUnit(e.target.value)}>
                  {ingredient.units.map((u) => <option key={u.unitId} value={u.unitId}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-12 grid-cols-1">
          <div className="cg-field">
            <label className="cg-label" htmlFor="varian-mode">Cara memilih</label>
            <select id="varian-mode" className="cg-input" value={mode} onChange={(e) => setMode(e.target.value as 'single' | 'multiple')}>
              <option value="single">Pilih satu</option>
              <option value="multiple">Boleh lebih dari satu</option>
            </select>
          </div>
          {mode === 'multiple' && (
            <div className="cg-field">
              <label className="cg-label" htmlFor="varian-max">Batas pilihan (kosong = tanpa batas)</label>
              <input id="varian-max" className="cg-input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <label className="flex items-center gap-8"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Wajib dipilih kasir</label>
        </div>
        <fieldset className="grid gap-8 border-0 p-0 m-0 min-w-0">
          <legend className="cg-label mb-4">Isi varian dan tambahan harga bawaan</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="flex gap-8 items-start min-w-0">
              <input className="cg-input min-w-0 flex-1" aria-label={`Nama isi ${i + 1}`} placeholder="mis. Small, Half sugar" maxLength={60} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
              <input className="cg-input w-[110px] shrink-0" aria-label={`Tambahan harga isi ${i + 1}`} inputMode="numeric" placeholder="Rp 0" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value.replace(/[^\d]/g, '') })} />
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" aria-label={`Hapus isi ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}><X className="cg-icon cg-icon--sm" aria-hidden /></button>
            </div>
          ))}
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm w-fit" onClick={() => setRows((x) => [...x, { key: newId(), name: '', price: '' }])}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah isi</button>
          <p className="text-text-muted text-sm m-0">Tambahan harga per produk diatur di tab Pasang di produk (mis. Latte Large +Rp 3.000, Es teh Large +Rp 2.000).</p>
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
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-hapus-varian" onClose={onClose} style={{ margin: 'auto' }}>
      <div className="grid gap-16">
        <h2 id="judul-hapus-varian" className="cg-modal__title">Hapus varian “{item.name}”?</h2>
        <p className="cg-modal__body">Varian ini tidak lagi muncul di kasir dan terlepas dari semua produk. Pesanan lama tetap menyimpan nama dan harga pilihannya.</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="button" className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void run()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

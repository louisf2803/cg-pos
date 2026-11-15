'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  formatRp, ingredientFactor, marginPct, recipeCost, recipeFilterMatches, recipeLineCost, recipeProblem, recipeRows, RECIPE_FILTER_LABEL, RECIPE_MAX_LINES, THIN_MARGIN_PCT,
  RECIPE_SCHEDULE_STATUS_LABEL, type RecipeFilter, type RecipeIngredient, type RecipeLine, type RecipeRow, type RecipeSchedule,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const PAGE = 60;
const pct = (m: number | null) => (m === null ? '—' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(m)}%`);
const rp = (n: number) => formatRp(Math.round(n));

export default function RecipesPage() {
  const data = useData();
  const state = useAsync(async () => { const [ingredients, recipes, schedules] = await Promise.all([data.listRecipeIngredients(), data.listRecipes(), data.listRecipeSchedules().catch(() => [] as RecipeSchedule[])]); return { ingredients, recipes, schedules }; }, [data]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const [edit, setEdit] = useState<RecipeRow | null>(null);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => (state.status === 'ready' ? recipeRows(state.data.recipes, state.data.ingredients) : []), [state]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => recipeFilterMatches(r, filter) && (!q || r.product.name.toLowerCase().includes(q)));
  }, [rows, search, filter]);
  const withRecipe = rows.filter((r) => r.product.lines.length > 0);
  const avg = withRecipe.length ? withRecipe.reduce((s, r) => s + (r.margin ?? 0), 0) / withRecipe.length : null;
  return (
    <>
      <PageHeader title="Resep dan HPP" subtitle="Atur bahan yang terpakai tiap produk terjual. Dari situ stok bahan berkurang otomatis dan HPP (harga pokok) tiap produk terhitung." />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 64 }} />)}</div>}
      {state.status === 'ready' && (
        <>
          <div className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Ringkasan resep">
            <Stat label="Produk jual" value={String(rows.length)} />
            <Stat label="Sudah ada resep" value={String(withRecipe.length)} />
            <Stat label="Belum ada resep" value={String(rows.length - withRecipe.length)} />
            <Stat label="Rata-rata margin" value={pct(avg === null ? null : Math.round(avg * 10) / 10)} />
          </div>
          <div className="flex flex-wrap gap-8 mb-12 items-end">
            <div className="cg-field grow" style={{ minWidth: 200 }}><label className="cg-label" htmlFor="rs-cari">Cari produk</label>
              <input id="rs-cari" className="cg-input" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Nama produk" /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="rs-filter">Tampilkan</label>
              <select id="rs-filter" className="cg-input" value={filter} onChange={(e) => { setFilter(e.target.value as RecipeFilter); setShown(PAGE); }}>
                {(Object.keys(RECIPE_FILTER_LABEL) as RecipeFilter[]).map((f) => <option key={f} value={f}>{RECIPE_FILTER_LABEL[f]}</option>)}</select></div>
          </div>
          <ScheduleList schedules={state.data.schedules} onChanged={(m) => { setNotice(m); state.reload(); }} />
          {state.data.ingredients.some((i) => i.costSource === 'none') && (
            <p className="text-sm text-text-muted mb-12">Sebagian bahan belum punya harga beli atau stok bercatatan, jadi HPP produk yang memakainya masih kurang. Isi lewat Inventori &gt; Daftar stok (Masuk dengan harga beli).</p>
          )}
          {list.length === 0 ? (
            <div className="cg-empty"><p><strong>Tidak ada produk yang cocok.</strong></p><p className="text-text-muted">Ubah kata kunci atau pilihan Tampilkan.</p></div>
          ) : (
            <>
              <ul className="grid gap-12" aria-label="Daftar resep">
                {list.slice(0, shown).map((r) => (
                  <li key={r.product.id} className="border border-border rounded-lg bg-surface-raised p-16 grid gap-8 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-8">
                      <strong className="break-words min-w-0">{r.product.name}</strong>
                      <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => { setNotice(''); setEdit(r); }}>
                        {r.product.lines.length ? <><Pencil className="cg-icon" aria-hidden /> Atur resep</> : <><Plus className="cg-icon" aria-hidden /> Buat resep</>}
                      </button>
                    </div>
                    {r.product.lines.length === 0 ? <p className="text-sm text-text-muted">Belum ada resep. Stok bahan tidak berkurang saat produk ini terjual.</p> : (
                      <>
                        <p className="text-sm text-text-muted">{r.product.lines.length} bahan{r.cost.unknownLines > 0 ? ` · ${r.cost.unknownLines} belum ada biayanya` : ''}</p>
                        <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                          <div><span className="block text-text-muted">Harga jual</span><strong className="block cg-num">{rp(r.product.price)}</strong></div>
                          <div><span className="block text-text-muted">HPP</span><strong className="block cg-num" data-testid={`hpp-${r.product.id}`}>{rp(r.cost.total)}{r.cost.unknownLines > 0 ? ' *' : ''}</strong></div>
                          <div><span className="block text-text-muted">Margin</span><strong className={`block cg-num${r.margin !== null && r.margin < THIN_MARGIN_PCT ? ' text-danger-strong' : ''}`}>{pct(r.margin)}</strong></div>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {list.length > shown && <div className="mt-12"><button className="cg-btn cg-btn--secondary" onClick={() => setShown((n) => n + PAGE)}>Tampilkan {Math.min(PAGE, list.length - shown)} lagi ({list.length - shown} tersisa)</button></div>}
              <p className="text-sm text-text-muted mt-12">* HPP belum lengkap karena ada bahan tanpa biaya. Biaya bahan memakai biaya rata-rata stok; bila stok belum dicatat, memakai harga beli di data bahan.</p>
            </>
          )}
        </>
      )}
      {edit && state.status === 'ready' && <RecipeDialog row={edit} ingredients={state.data.ingredients} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); setNotice(m); state.reload(); }} />}
    </>
  );
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Perubahan resep terjadwal: yang menunggu bisa dibatalkan; yang sudah berlaku atau gagal tampil sebagai riwayat singkat. */
function ScheduleList({ schedules, onChanged }: { schedules: RecipeSchedule[]; onChanged: (msg: string) => void }) {
  const data = useData();
  const [err, setErr] = useState('');
  const pending = schedules.filter((x) => x.status === 'pending').sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const history = schedules.filter((x) => x.status !== 'pending').slice(0, 5);
  if (pending.length === 0 && history.length === 0) return null;
  async function cancel(x: RecipeSchedule) {
    setErr('');
    try { const ok = await data.cancelRecipeSchedule(x.id); onChanged(ok ? `Jadwal resep ${x.productName} dibatalkan.` : 'Jadwal itu sudah tidak menunggu.'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal membatalkan jadwal.'); }
  }
  return (
    <section className="mb-16 grid gap-8" aria-label="Perubahan resep terjadwal">
      <h2 className="text-base">Perubahan resep terjadwal</h2>
      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      <ul className="grid gap-8">
        {pending.map((x) => (
          <li key={x.id} className="border border-border rounded-lg bg-surface-raised p-12 flex flex-wrap items-center justify-between gap-8 min-w-0">
            <span className="min-w-0"><strong className="break-words">{x.productName}</strong><span className="block text-sm text-text-muted">Berlaku {fmtWhen(x.effectiveAt)} · {x.lines.length} bahan{x.note ? ` · ${x.note}` : ''}</span></span>
            <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => cancel(x)} aria-label={`Batalkan jadwal resep ${x.productName}`}>Batalkan</button>
          </li>
        ))}
        {history.map((x) => (
          <li key={x.id} className="border border-border rounded-lg p-12 min-w-0 text-sm">
            <strong className="break-words">{x.productName}</strong> · {RECIPE_SCHEDULE_STATUS_LABEL[x.status]} · {fmtWhen(x.appliedAt ?? x.effectiveAt)}{x.status === 'failed' && x.error ? <span className="block text-danger-strong">Resep lama tetap dipakai. Penyebab: {x.error}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border border-border rounded-lg bg-surface-raised p-12"><span className="block text-sm text-text-muted">{label}</span><strong className="cg-num">{value}</strong></div>;
}

interface DraftLine { key: number; ingredientId: string; qty: string; unitId: string }

function RecipeDialog({ row, ingredients, onClose, onSaved }: { row: RecipeRow; ingredients: RecipeIngredient[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const by = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [seq, setSeq] = useState(row.product.lines.length);
  const [lines, setLines] = useState<DraftLine[]>(() => row.product.lines.map((l, k) => ({ key: k, ingredientId: l.ingredientId, qty: String(l.qty), unitId: l.unitId })));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** kosong = berlaku langsung; terisi = dijadwalkan (waktu setempat) */
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const parsed: RecipeLine[] = lines.map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty.replace(',', '.')), unitId: l.unitId }));
  const cost = recipeCost(parsed.filter((l) => by.has(l.ingredientId)), by);
  const set = (key: number, p: Partial<DraftLine>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l))); setErr(''); };
  function pickIngredient(key: number, id: string) {
    const ing = by.get(id);
    set(key, { ingredientId: id, unitId: ing?.units.find((u) => u.factor === 1)?.unitId ?? ing?.units[0]?.unitId ?? '' });
  }
  function add() { setLines((ls) => [...ls, { key: seq, ingredientId: '', qty: '', unitId: '' }]); setSeq((n) => n + 1); setErr(''); }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = recipeProblem(parsed, by);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try {
      if (when) {
        const t = new Date(when);
        if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) { setBusy(false); return setErr('Waktu berlaku harus di masa depan.'); }
        await data.saveRecipeSchedule({ productId: row.product.id, effectiveAt: t.toISOString(), lines: parsed, note: note.trim() || undefined });
        return onSaved(`Resep ${row.product.name} dijadwalkan berlaku ${fmtWhen(t.toISOString())}. Sebelum itu resep lama tetap dipakai.`);
      }
      const n = await data.saveRecipe(row.product.id, parsed); onSaved(n ? `Resep ${row.product.name} disimpan (${n} bahan).` : `Resep ${row.product.name} dikosongkan.`);
    }
    catch (x) { setErr(x instanceof Error ? x.message : 'Resep gagal disimpan.'); setBusy(false); }
  }
  const m = marginPct(row.product.price, cost.total);
  return (
    <dialog {...d.props} aria-labelledby="judul-resep">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-resep" className="cg-modal__title break-words">Resep: {row.product.name}</h2>
        <p className="text-sm text-text-muted">Isi bahan untuk satu porsi. Pilih satuan yang kamu pakai; konversi ke satuan dasar bahan dihitung otomatis.</p>
        {lines.length === 0 && <p className="text-text-muted">Belum ada bahan. Pilih Tambah bahan.</p>}
        <ul className="grid gap-12" aria-label="Bahan resep">
          {lines.map((l, i) => {
            const ing = by.get(l.ingredientId);
            const lineCost = ing ? recipeLineCost({ ingredientId: l.ingredientId, qty: Number(l.qty.replace(',', '.')) || 0, unitId: l.unitId }, ing) : 0;
            return (
              <li key={l.key} className="border border-border rounded-lg p-12 grid gap-8 min-w-0">
                <div className="cg-field"><label className="cg-label" htmlFor={`rb-${l.key}`}>Bahan {i + 1}</label>
                  <select id={`rb-${l.key}`} className="cg-input" value={l.ingredientId} onChange={(e) => pickIngredient(l.key, e.target.value)}>
                    <option value="">Pilih bahan…</option>{ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  <div className="cg-field"><label className="cg-label" htmlFor={`rq-${l.key}`}>Jumlah</label>
                    <input id={`rq-${l.key}`} className="cg-input cg-num" inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
                  <div className="cg-field"><label className="cg-label" htmlFor={`ru-${l.key}`}>Satuan</label>
                    <select id={`ru-${l.key}`} className="cg-input" value={l.unitId} disabled={!ing} onChange={(e) => set(l.key, { unitId: e.target.value })}>
                      {(ing?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.name}</option>)}</select></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <span className="text-sm text-text-muted">{ing ? (ing.costSource === 'none' ? 'Biaya bahan belum ada' : `Biaya ${rp(lineCost)}`) : ''}{ing && ingredientFactor(ing, l.unitId) !== null && ingredientFactor(ing, l.unitId) !== 1 ? ` · 1 ${ing.units.find((u) => u.unitId === l.unitId)?.name} = ${ingredientFactor(ing, l.unitId)} ${ing.baseUnit}` : ''}</span>
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Hapus bahan ${i + 1}`}><Trash2 className="cg-icon" aria-hidden /> Hapus</button>
                </div>
              </li>
            );
          })}
        </ul>
        <div><button type="button" className="cg-btn cg-btn--secondary" onClick={add} disabled={lines.length >= RECIPE_MAX_LINES}><Plus className="cg-icon" aria-hidden /> Tambah bahan</button></div>
        <div className="grid gap-4 text-sm border border-border rounded-lg p-12 bg-surface-raised" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }} aria-label="Ringkasan biaya">
          <div><span className="block text-text-muted">Harga jual</span><strong className="block cg-num">{rp(row.product.price)}</strong></div>
          <div><span className="block text-text-muted">HPP</span><strong className="block cg-num" data-testid="hpp-draft">{rp(cost.total)}{cost.unknownLines > 0 ? ' *' : ''}</strong></div>
          <div><span className="block text-text-muted">Margin</span><strong className="block cg-num">{lines.length ? pct(m) : '—'}</strong></div>
        </div>
        {cost.unknownLines > 0 && <p className="text-sm text-text-muted">* {cost.unknownLines} bahan belum punya biaya, jadi HPP masih kurang.</p>}
        <div className="cg-field"><label className="cg-label" htmlFor="rs-berlaku">Berlaku mulai (opsional)</label>
          <input id="rs-berlaku" type="datetime-local" className="cg-input" value={when} onChange={(e) => { setWhen(e.target.value); setErr(''); }} />
          <p className="text-sm text-text-muted mt-4">{when ? 'Resep ini baru berlaku pada waktu itu. Penjualan sebelum itu memakai resep lama.' : 'Kosongkan agar resep berlaku langsung.'}</p></div>
        {when && <div className="cg-field"><label className="cg-label" htmlFor="rs-catatan">Catatan jadwal (opsional)</label>
          <input id="rs-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. resep baru musim hujan" /></div>}
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Menyimpan…' : when ? 'Jadwalkan resep' : 'Simpan resep'}</button></div>
      </form>
    </dialog>
  );
}

'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { bundleProblem, bundleSeparatePrice, formatRp, newId, parseRp, type Bundle, type Category, type Product } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function Paket() {
  const data = useData();
  const st = useAsync(async () => {
    const [bundles, products, categories] = await Promise.all([data.listBundles({ includeInactive: true }), data.listProducts({ includeInactive: true }), data.listCategories()]);
    return { bundles, products: products.filter((p) => p.kind !== 'bundle'), categories };
  }, [data]);
  const [dlg, setDlg] = useState<{ item?: Bundle } | null>(null);
  const [err, setErr] = useState('');
  const done = () => { setDlg(null); st.reload(); };
  async function toggle(b: Bundle) {
    setErr('');
    try { await data.setBundleActive(b.id, !b.isActive); st.reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal mengubah status paket.'); }
  }

  return (
    <>
      <PageHeader title="Paket" subtitle="Beberapa produk dijual dengan satu harga. Stok yang berkurang adalah stok isi paketnya"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setDlg({})}><Plus className="cg-icon" aria-hidden /> Tambah paket</button>} />
      {err && <p role="alert" className="cg-banner cg-banner--danger mb-12">{err}</p>}
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>}
      {st.status === 'ready' && (st.data.bundles.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada paket.</strong></p><p>Contoh: kopi + roti dengan harga lebih hemat.</p><button className="cg-btn cg-btn--primary" onClick={() => setDlg({})}>Tambah paket pertama</button></div>
      ) : (
        <ul className="grid gap-12 grid-cols-1 min-w-0">
          {st.data.bundles.map((b) => {
            const sep = bundleSeparatePrice(b.items, (id) => st.data.products.find((p) => p.id === id)?.price ?? 0);
            return (
              <li key={b.id} className="min-w-0 border border-border rounded-lg bg-surface-raised p-16 grid gap-8" style={b.isActive ? undefined : { opacity: 0.7 }}>
                <div className="flex flex-wrap items-center gap-8">
                  <h2 className="text-lg break-words min-w-0">{b.name}</h2>
                  <strong className="cg-num">{formatRp(b.price)}</strong>
                  {!b.isActive && <span className="cg-badge">Nonaktif</span>}
                  <span className="ml-auto flex gap-4">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah paket ${b.name}`} onClick={() => setDlg({ item: b })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                    <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => void toggle(b)}>{b.isActive ? `Nonaktifkan ${b.name}` : `Aktifkan ${b.name}`}</button>
                  </span>
                </div>
                <ul className="flex flex-wrap gap-8">
                  {b.items.map((i) => <li key={i.productId} className="border border-border rounded-md bg-surface px-12 py-4 break-words">{i.name} <span className="text-text-muted">× {i.qty}</span></li>)}
                </ul>
                {sep > b.price && <p className="text-text-muted text-sm">Beli satuan {formatRp(sep)}, hemat <span className="cg-num">{formatRp(sep - b.price)}</span>.</p>}
              </li>
            );
          })}
        </ul>
      ))}
      {dlg && st.status === 'ready' && <EditDialog item={dlg.item} products={st.data.products} categories={st.data.categories} onClose={() => setDlg(null)} onSaved={done} />}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function EditDialog({ item, products, categories, onClose, onSaved }: { item?: Bundle; products: Product[]; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useModal();
  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [rows, setRows] = useState<{ key: string; productId: string; qty: string }[]>(
    item?.items.length ? item.items.map((i) => ({ key: i.productId, productId: i.productId, qty: String(i.qty) })) : [{ key: newId(), productId: '', qty: '1' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setRow = (key: string, patch: Partial<{ productId: string; qty: string }>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const items = rows.map((r) => ({ productId: r.productId, qty: Number(r.qty.replace(',', '.')) }));
  const sep = bundleSeparatePrice(items.filter((i) => i.productId && i.qty > 0), (id) => products.find((p) => p.id === id)?.price ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { id: item?.id, name, categoryId: categoryId || null, price: price.trim() ? parseRp(price) : NaN, sku: sku.trim() || undefined, isActive: item?.isActive, items };
    const problem = bundleProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { await data.saveBundle(input); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-paket" onClose={onClose} style={{ margin: 'auto', width: 'min(560px, calc(100vw - 32px))' }}>
      <form onSubmit={submit} className="grid gap-16 min-w-0" noValidate>
        <h2 id="judul-paket" className="cg-modal__title">{item ? 'Ubah' : 'Tambah'} paket</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="paket-nama">Nama paket</label>
          <input id="paket-nama" className="cg-input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Paket Hemat Kopi + Roti" />
        </div>
        <div className="grid gap-12 grid-cols-1">
          <div className="cg-field">
            <label className="cg-label" htmlFor="paket-harga">Harga paket (Rp)</label>
            <input id="paket-harga" className="cg-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="paket-kategori">Kategori</label>
            <select id="paket-kategori" className="cg-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tanpa kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="paket-sku">SKU (opsional)</label>
            <input id="paket-sku" className="cg-input" maxLength={40} value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
        </div>
        <fieldset className="grid gap-8 border-0 p-0 m-0 min-w-0">
          <legend className="cg-label mb-4">Isi paket</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="flex gap-8 items-start min-w-0">
              <select className="cg-input min-w-0 flex-1" aria-label={`Produk isi paket ${i + 1}`} value={r.productId} onChange={(e) => setRow(r.key, { productId: e.target.value })}>
                <option value="">Pilih produk…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatRp(p.price)}</option>)}
              </select>
              <input className="cg-input w-[72px] shrink-0" aria-label={`Jumlah isi paket ${i + 1}`} inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })} />
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" aria-label={`Hapus isi paket ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}><X className="cg-icon cg-icon--sm" aria-hidden /></button>
            </div>
          ))}
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm w-fit" onClick={() => setRows((x) => [...x, { key: newId(), productId: '', qty: '1' }])}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah isi</button>
          {sep > 0 && <p className="text-text-muted text-sm">Harga bila dibeli satuan: <span className="cg-num">{formatRp(sep)}</span></p>}
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

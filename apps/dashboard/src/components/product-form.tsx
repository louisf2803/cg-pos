'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DataError, formatRp, newId, parseRp, variantsProblem, type CatalogProduct } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox } from '@/components/page';

interface Row { key: string; id?: string; label: string; price: string; sku: string; isActive: boolean }
const newRow = (r: Partial<Row> = {}): Row => ({ key: newId(), label: '', price: '', sku: '', isActive: true, ...r });

/** Form produk gaya Majoo: satu produk, boleh punya varian (S/M/L, dst.) dengan harga dan SKU masing-masing. */
export function ProductForm({ initial }: { initial?: CatalogProduct }) {
  const data = useData();
  const router = useRouter();
  const cats = useAsync(() => data.listCategories(), [data]);
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [price, setPrice] = useState(initial && initial.variants.length === 0 ? String(initial.price) : '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [hasVariants, setHasVariants] = useState((initial?.variants.length ?? 0) > 0);
  const [rows, setRows] = useState<Row[]>(initial?.variants.map((v) => newRow({ id: v.id, label: v.label, price: String(v.price), sku: v.sku ?? '', isActive: v.isActive })) ?? []);
  const [trackStock, setTrackStock] = useState(initial?.trackStock ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const firstNew = useRef<HTMLInputElement | null>(null);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function toggleVariants(on: boolean) {
    setHasVariants(on);
    if (on && rows.length === 0) setRows([newRow({ label: 'S', price }), newRow({ label: 'M', price }), newRow({ label: 'L', price })]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr({ field: 'name', msg: 'Nama produk wajib diisi.' });
    const variants = hasVariants ? rows.map((r) => ({ id: r.id, label: r.label, price: parseRp(r.price), sku: r.sku.trim() || undefined, isActive: r.isActive })) : [];
    if (hasVariants) {
      if (variants.length === 0) return setErr({ msg: 'Tambahkan minimal satu varian, atau matikan pilihan varian.' });
      if (rows.some((r) => !/\d/.test(r.price))) return setErr({ field: 'variants', msg: 'Isi harga tiap varian dalam rupiah.' });
      const vp = variantsProblem(variants);
      if (vp) return setErr({ field: 'variants', msg: vp });
    } else if (!/\d/.test(price)) return setErr({ field: 'price', msg: 'Isi harga dalam rupiah, 0 atau lebih.' });
    setSaving(true);
    try {
      await data.saveCatalogProduct({
        id: initial?.id, name, categoryId: categoryId || null, price: hasVariants ? 0 : parseRp(price), sku: hasVariants ? undefined : sku.trim() || undefined,
        trackStock, isActive, isFavorite: initial?.isFavorite, kind: initial?.kind, variants,
      });
      router.push('/produk');
    } catch (e2) {
      setErr({ field: e2 instanceof DataError && /sku/i.test(e2.message) ? 'sku' : undefined, msg: e2 instanceof Error ? e2.message : 'Gagal menyimpan.' });
      setSaving(false);
    }
  }

  return (
    <>
      {cats.status === 'error' && <ErrorBox message={cats.message} onRetry={cats.reload} />}
      <form onSubmit={submit} noValidate className="grid gap-16 max-w-[720px]">
        {err && (!err.field || err.field === 'sku') && <div className="cg-banner cg-banner--danger" role="alert">{err.msg}</div>}
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama">Nama produk</label>
          <input id="nama" className="cg-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err?.field === 'name'} aria-describedby={err?.field === 'name' ? 'e-nama' : undefined} autoFocus />
          {err?.field === 'name' && <p id="e-nama" className="cg-error">{err.msg}</p>}
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="kategori">Kategori</label>
          <select id="kategori" className="cg-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {cats.status === 'ready' && cats.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-8">
          <input type="checkbox" checked={hasVariants} onChange={(e) => toggleVariants(e.target.checked)} /> Produk ini punya varian (misalnya ukuran S, M, L)
        </label>

        {!hasVariants && (
          <>
            <div className="cg-field">
              <label className="cg-label" htmlFor="harga">Harga jual (Rp)</label>
              <input id="harga" className="cg-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={err?.field === 'price'} aria-describedby={err?.field === 'price' ? 'e-harga' : undefined} />
              {err?.field === 'price' && <p id="e-harga" className="cg-error">{err.msg}</p>}
            </div>
            <div className="cg-field">
              <label className="cg-label" htmlFor="sku">SKU (opsional)</label>
              <input id="sku" className="cg-input" value={sku} onChange={(e) => setSku(e.target.value)} aria-invalid={err?.field === 'sku'} />
            </div>
          </>
        )}

        {hasVariants && (
          <fieldset className="grid gap-12 border border-border rounded-lg p-16">
            <legend className="px-8">Varian</legend>
            <p className="text-text-muted text-sm">Tiap varian punya harga dan SKU sendiri. Kasir memilih salah satunya saat produk diketuk.</p>
            <div className="cg-data-wrap">
              <table className="cg-data">
                <thead><tr><th>Nama varian</th><th>Harga (Rp)</th><th>SKU</th><th>Aktif</th><th><span className="cg-sr">Hapus</span></th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key}>
                      <td><input className="cg-input" aria-label={`Nama varian ${i + 1}`} value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} ref={i === rows.length - 1 ? firstNew : undefined} style={{ minWidth: 90 }} /></td>
                      <td><input className="cg-input" aria-label={`Harga varian ${r.label || i + 1}`} inputMode="numeric" value={r.price} onChange={(e) => patch(r.key, { price: e.target.value })} style={{ minWidth: 110 }} /></td>
                      <td><input className="cg-input" aria-label={`SKU varian ${r.label || i + 1}`} value={r.sku} onChange={(e) => patch(r.key, { sku: e.target.value })} style={{ minWidth: 110 }} /></td>
                      <td><input type="checkbox" aria-label={`Varian ${r.label || i + 1} aktif`} checked={r.isActive} onChange={(e) => patch(r.key, { isActive: e.target.checked })} /></td>
                      <td><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus varian ${r.label || i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err?.field === 'variants' && <p className="cg-error" role="alert">{err.msg}</p>}
            <div>
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => { setRows((rs) => [...rs, newRow({ price: rs[rs.length - 1]?.price ?? '' })]); setTimeout(() => firstNew.current?.focus(), 0); }}>
                <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah varian
              </button>
            </div>
            {rows.some((r) => /\d/.test(r.price)) && <p className="text-text-muted text-sm">Harga termurah: {formatRp(Math.min(...rows.filter((r) => /\d/.test(r.price)).map((r) => parseRp(r.price))))}</p>}
          </fieldset>
        )}

        <label className="flex items-center gap-8"><input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} /> Lacak stok produk ini</label>
        {initial && <label className="flex items-center gap-8"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Produk aktif (tampil di kasir)</label>}
        <div className="flex gap-8">
          <button className="cg-btn cg-btn--primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan produk'}</button>
          <button type="button" className="cg-btn cg-btn--secondary" onClick={() => router.push('/produk')}>Batal</button>
        </div>
      </form>
    </>
  );
}

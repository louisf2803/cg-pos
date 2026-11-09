'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DataError, parseRp } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function TambahProduk() {
  const data = useData();
  const router = useRouter();
  const cats = useAsync(() => data.listCategories(), [data]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [trackStock, setTrackStock] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr({ field: 'name', msg: 'Nama produk wajib diisi.' });
    const p = parseRp(price);
    if (!/\d/.test(price) || p < 0) return setErr({ field: 'price', msg: 'Isi harga dalam rupiah, 0 atau lebih.' });
    setSaving(true);
    try {
      await data.saveProduct({ name, price: p, sku: sku.trim() || undefined, categoryId: categoryId || null, trackStock });
      router.push('/produk');
    } catch (e2) {
      setErr({ field: e2 instanceof DataError && /sku/i.test(e2.message) ? 'sku' : undefined, msg: e2 instanceof Error ? e2.message : 'Gagal menyimpan.' });
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Tambah produk" />
      {cats.status === 'error' && <ErrorBox message={cats.message} onRetry={cats.reload} />}
      <form onSubmit={submit} noValidate className="grid gap-16 max-w-[520px]">
        {err && !err.field && <div className="cg-banner cg-banner--danger" role="alert">{err.msg}</div>}
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama">Nama produk</label>
          <input id="nama" className="cg-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err?.field === 'name'} aria-describedby={err?.field === 'name' ? 'e-nama' : undefined} autoFocus />
          {err?.field === 'name' && <p id="e-nama" className="cg-error">{err.msg}</p>}
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="harga">Harga jual (Rp)</label>
          <input id="harga" className="cg-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={err?.field === 'price'} aria-describedby={err?.field === 'price' ? 'e-harga' : undefined} />
          {err?.field === 'price' && <p id="e-harga" className="cg-error">{err.msg}</p>}
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="kategori">Kategori</label>
          <select id="kategori" className="cg-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {cats.status === 'ready' && cats.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="sku">SKU (opsional)</label>
          <input id="sku" className="cg-input" value={sku} onChange={(e) => setSku(e.target.value)} aria-invalid={err?.field === 'sku'} aria-describedby={err?.field === 'sku' ? 'e-sku' : undefined} />
          {err?.field === 'sku' && <p id="e-sku" className="cg-error">{err.msg}</p>}
        </div>
        <label className="flex items-center gap-8">
          <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} /> Lacak stok produk ini
        </label>
        <div className="flex gap-8">
          <button className="cg-btn cg-btn--primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan produk'}</button>
          <button type="button" className="cg-btn cg-btn--secondary" onClick={() => router.push('/produk')}>Batal</button>
        </div>
      </form>
    </>
  );
}

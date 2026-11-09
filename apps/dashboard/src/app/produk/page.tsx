'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { formatRp } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function DaftarProduk() {
  const data = useData();
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const state = useAsync(async () => ({
    products: await data.listProducts({ search: q || undefined, includeInactive: inactive }),
    cats: await data.listCategories(),
  }), [data, q, inactive]);

  async function toggle(id: string, active: boolean) {
    setBusy(id);
    try { await data.setProductActive(id, active); state.reload(); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader
        title="Produk"
        subtitle="Katalog yang tampil di kasir"
        actions={<Link href="/produk/baru" className="cg-btn cg-btn--primary"><Plus className="cg-icon" aria-hidden /> Tambah produk</Link>}
      />
      <div className="flex flex-wrap items-center gap-12 mb-16">
        <label className="cg-search flex-1 min-w-[220px]">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari produk</span>
          <input className="cg-input" type="search" placeholder="Cari nama atau SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-8">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Tampilkan nonaktif
        </label>
      </div>
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && (state.data.products.length === 0 ? (
        <div className="cg-empty">
          <p><strong>{q ? `Tidak ada produk untuk “${q}”.` : 'Belum ada produk.'}</strong></p>
          {!q && <Link href="/produk/baru" className="cg-btn cg-btn--primary">Tambah produk pertama</Link>}
        </div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nama</th><th>Kategori</th><th>SKU</th><th className="cg-num">Harga</th><th className="cg-num">Stok</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {state.data.products.map((p) => (
                <tr key={p.id}>
                  <td className="break-words max-w-[280px]">{p.name} {!p.isActive && <span className="cg-badge">Nonaktif</span>}</td>
                  <td className="whitespace-nowrap">{state.data.cats.find((c) => c.id === p.categoryId)?.name ?? '—'}</td>
                  <td className="text-text-muted whitespace-nowrap">{p.sku ?? '—'}</td>
                  <td className="cg-num">{formatRp(p.price)}</td>
                  <td className="cg-num">{p.trackStock ? (p.stock ?? 0) : '—'}</td>
                  <td>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={busy === p.id} onClick={() => toggle(p.id, !p.isActive)}>
                      {p.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

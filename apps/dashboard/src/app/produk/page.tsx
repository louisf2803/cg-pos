'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { formatRp } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function DaftarProduk() {
  const data = useData();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [inactive, setInactive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const state = useAsync(async () => ({
    items: await data.listCatalog({ search: q || undefined, includeInactive: inactive, categoryId: cat || undefined }),
    cats: await data.listCategories(),
  }), [data, q, cat, inactive]);

  async function toggle(id: string, active: boolean) {
    setBusy(id); setErr('');
    try { await data.setCatalogActive(id, active); state.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal mengubah status produk.'); }
    finally { setBusy(null); }
  }
  const flip = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <PageHeader
        title="Produk"
        subtitle="Katalog yang tampil di kasir. Produk dengan varian (S, M, L) cukup satu baris."
        actions={<Link href="/produk/baru" className="cg-btn cg-btn--primary"><Plus className="cg-icon" aria-hidden /> Tambah produk</Link>}
      />
      <div className="flex flex-wrap items-center gap-12 mb-16">
        <label className="cg-search flex-1 min-w-[220px]">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari produk</span>
          <input className="cg-input" type="search" placeholder="Cari nama, varian, atau SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-8">
          <span className="cg-sr">Kategori</span>
          <select className="cg-input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Semua kategori</option>
            {state.status === 'ready' && state.data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-8">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Tampilkan nonaktif
        </label>
      </div>
      {err && <p className="cg-banner cg-banner--danger mb-16" role="alert">{err}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && (state.data.items.length === 0 ? (
        <div className="cg-empty">
          <p><strong>{q ? `Tidak ada produk untuk “${q}”.` : 'Belum ada produk.'}</strong></p>
          {!q && <Link href="/produk/baru" className="cg-btn cg-btn--primary">Tambah produk pertama</Link>}
        </div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nama</th><th>Kategori</th><th>SKU</th><th className="cg-num">Harga</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {state.data.items.map((p) => {
                const grouped = p.variants.length > 0;
                const expanded = open.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td className="break-words max-w-[320px]">
                        {grouped
                          ? <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-expanded={expanded} onClick={() => flip(p.id)} aria-label={`${expanded ? 'Tutup' : 'Buka'} varian ${p.name}`}>{expanded ? <ChevronDown className="cg-icon cg-icon--sm" aria-hidden /> : <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />}</button>
                          : null}
                        {p.photoUrl && <img className="cg-thumb" src={p.photoUrl} alt="" loading="lazy" width={40} height={40} />}{p.name} {grouped && <span className="cg-badge">{p.variants.length} varian</span>} {!p.isActive && <span className="cg-badge">Nonaktif</span>}
                      </td>
                      <td className="whitespace-nowrap">{state.data.cats.find((c) => c.id === p.categoryId)?.name ?? '—'}</td>
                      <td className="text-text-muted whitespace-nowrap">{grouped ? '—' : p.sku ?? '—'}</td>
                      <td className="cg-num whitespace-nowrap">{grouped ? `mulai ${formatRp(p.price)}` : formatRp(p.price)}</td>
                      <td className="whitespace-nowrap">
                        <Link className="cg-btn cg-btn--ghost cg-btn--sm" href={`/produk/ubah/?id=${p.id}`} aria-label={`Ubah ${p.name}`}>Ubah</Link>
                        <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={busy === p.id} onClick={() => toggle(p.id, !p.isActive)}>{p.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </td>
                    </tr>
                    {grouped && expanded && p.variants.map((v) => (
                      <tr key={v.id} className="text-text-muted">
                        <td style={{ paddingLeft: 48 }}>{v.label} {!v.isActive && <span className="cg-badge">Nonaktif</span>}</td>
                        <td />
                        <td className="whitespace-nowrap">{v.sku ?? '—'}</td>
                        <td className="cg-num whitespace-nowrap">{formatRp(v.price)}</td>
                        <td />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

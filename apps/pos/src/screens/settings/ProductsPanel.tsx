import { useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { formatRp, type Category, type Product } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { Modal } from '../../ui';
import { Notice, PanelLoading, SettingRow } from './common';

type Tab = 'produk' | 'kategori';

/** Produk dan kategori: cari, tambah, dan ubah produk; kelola kategori. Pengelola saja yang boleh mengubah (dijaga server). */
export function ProductsPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const [tab, setTab] = useState<Tab>('produk');
  return (
    <div>
      <div className="cg-tabs mx-16 mt-12" role="tablist" aria-label="Produk dan kategori">
        <button type="button" role="tab" className="cg-tab" aria-selected={tab === 'produk'} onClick={() => setTab('produk')}>Produk</button>
        <button type="button" role="tab" className="cg-tab" aria-selected={tab === 'kategori'} onClick={() => setTab('kategori')}>Kategori</button>
      </div>
      {tab === 'produk' ? <ProductList canEdit={canEdit} data={data} /> : <CategoryList canEdit={canEdit} data={data} />}
    </div>
  );
}

type Data = ReturnType<typeof useData>;

function ProductList({ canEdit, data }: { canEdit: boolean; data: Data }) {
  const prods = useAsync(() => data.listProducts({ includeInactive: true }), [data]);
  const cats = useAsync(() => data.listCategories(), [data]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const catName = useMemo(() => new Map(cats.status === 'ready' ? cats.data.map((c) => [c.id, c.name]) : []), [cats.status === 'ready' ? cats.data : null]);

  if (prods.status === 'loading') return <PanelLoading />;
  if (prods.status === 'error') return <Notice kind="danger">{prods.message}</Notice>;
  const s = q.trim().toLowerCase();
  const rows = prods.data.filter((p) => p.kind !== 'bundle' && !p.parentId && (!s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)));

  return (
    <div>
      <div className="px-16 py-12 flex items-center gap-8">
        <label className="cg-search flex-1 m-0 relative"><Search className="cg-icon cg-icon--sm" aria-hidden /><span className="cg-sr">Cari produk</span><input className="cg-input" placeholder="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {canEdit && <div className="px-16 pb-12"><button type="button" className="cg-btn cg-btn--secondary w-full" onClick={() => setEdit('new')}>Tambah produk</button></div>}
      {rows.length === 0 ? <Notice>Tidak ada produk yang cocok.</Notice> : rows.map((p) => (
        <SettingRow key={p.id} label={p.name} hint={`${p.categoryId ? catName.get(p.categoryId) ?? 'Kategori' : 'Tanpa kategori'}${p.isActive ? '' : ' · nonaktif'}`} onClick={canEdit ? () => setEdit(p) : undefined}>
          {p.isFavorite && <Star className="cg-icon cg-icon--xs fill-amber-400 text-amber-400" aria-label="Favorit" />}
          <span className="cg-num text-text">{formatRp(p.price)}</span>
          {p.trackStock && <span className="cg-num w-[48px] text-right">{p.stock ?? 0}</span>}
        </SettingRow>
      ))}
      {edit && <ProductDialog data={data} product={edit === 'new' ? null : edit} categories={cats.status === 'ready' ? cats.data : []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); prods.reload(); }} />}
    </div>
  );
}

function ProductDialog({ data, product, categories, onClose, onSaved }: { data: Data; product: Product | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [fav, setFav] = useState(product?.isFavorite ?? false);
  const [active, setActive] = useState(product?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr('');
    try {
      await data.saveProduct({ id: product?.id, name: name.trim(), categoryId: categoryId || null, price: Number(price.replace(/[^\d]/g, '')) || 0, kind: product?.kind === 'service' ? 'service' : 'goods', trackStock: product?.trackStock, isFavorite: fav, isActive: active });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan.'); setBusy(false); }
  }
  return (
    <Modal title={product ? `Ubah ${product.name}` : 'Tambah produk'} onClose={onClose}>
      <div className="space-y-12 min-w-0">
        <label className="block text-sm">Nama produk<input className="cg-input w-full mt-4" data-autofocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm">Harga (Rp)<input className="cg-input cg-num w-full mt-4" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} /></label>
        <label className="block text-sm">Kategori<select className="cg-input w-full mt-4" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Tanpa kategori</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex items-center gap-8 text-sm"><input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} /> Tandai favorit</label>
        {product && <label className="flex items-center gap-8 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Produk aktif (tampil di kasir)</label>}
        {err && <p className="cg-banner cg-banner--danger" role="alert">{err}</p>}
        <div className="flex justify-end gap-8"><button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy || !name.trim() || !price}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
      </div>
    </Modal>
  );
}

function CategoryList({ canEdit, data }: { canEdit: boolean; data: Data }) {
  const cats = useAsync(() => data.listCategories(), [data]);
  const counts = useAsync(() => data.categoryProductCounts(), [data]);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (cats.status === 'loading') return <PanelLoading />;
  if (cats.status === 'error') return <Notice kind="danger">{cats.message}</Notice>;

  async function save() {
    setBusy(true); setErr('');
    try { await data.saveCategory({ id: editId ?? undefined, name: name.trim() }); setName(''); setEditId(null); cats.reload(); counts.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan kategori.'); }
    finally { setBusy(false); }
  }
  async function remove(c: Category) {
    setErr('');
    try { await data.deleteCategory(c.id); cats.reload(); counts.reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Kategori tidak bisa dihapus.'); }
  }

  return (
    <div>
      {canEdit && (
        <div className="px-16 py-12 flex gap-8">
          <input className="cg-input flex-1" aria-label="Nama kategori" maxLength={40} placeholder={editId ? 'Ubah nama kategori' : 'Nama kategori baru'} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy || !name.trim()}>{editId ? 'Simpan' : 'Tambah'}</button>
          {editId && <button type="button" className="cg-btn cg-btn--ghost" onClick={() => { setEditId(null); setName(''); }}>Batal</button>}
        </div>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      {cats.data.length === 0 ? <Notice>Belum ada kategori.</Notice> : cats.data.map((c) => (
        <SettingRow key={c.id} label={c.name} hint={`${counts.status === 'ready' ? counts.data[c.id] ?? 0 : '…'} produk`}>
          {canEdit && <><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => { setEditId(c.id); setName(c.name); }}>Ubah</button><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm text-danger" onClick={() => remove(c)}>Hapus</button></>}
        </SettingRow>
      ))}
    </div>
  );
}

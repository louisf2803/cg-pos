'use client';

import { useMemo, useState } from 'react';
import { CHANNELS, CHANNEL_LABEL, channelPriceProblem, formatRp, type Channel, type Product } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const key = (p: string, c: Channel) => `${p}|${c}`;

export default function ChannelPricesPage() {
  const data = useData();
  const products = useAsync(() => data.listProducts(), [data]);
  const prices = useAsync(() => data.listChannelPrices(), [data]);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState<{ id: string; message: string } | null>(null);

  const saved = useMemo(() => new Map((prices.status === 'ready' ? prices.data : []).map((p) => [key(p.productId, p.channel), p.price])), [prices]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.status === 'ready' ? products.data : []).filter((p) => p.kind !== 'bundle' && (!q || p.name.toLowerCase().includes(q)));
  }, [products, search]);
  const value = (p: Product, c: Channel) => edits[key(p.id, c)] ?? (saved.has(key(p.id, c)) ? String(saved.get(key(p.id, c))) : '');
  const dirty = (p: Product) => CHANNELS.some((c) => key(p.id, c) in edits && edits[key(p.id, c)] !== (saved.has(key(p.id, c)) ? String(saved.get(key(p.id, c))) : ''));

  async function save(p: Product) {
    if (saving) return;
    setSaving(p.id); setErr(null); setNotice('');
    try {
      for (const c of CHANNELS) {
        const k = key(p.id, c);
        if (!(k in edits)) continue;
        const raw = edits[k]!.trim();
        if (raw === '') { await data.deleteChannelPrice(p.id, c); continue; }
        const price = Number(raw);
        const problem = channelPriceProblem(price);
        if (problem) throw new Error(`${CHANNEL_LABEL[c]}: ${problem}`);
        await data.saveChannelPrice(p.id, c, price);
      }
      setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${p.id}|`))));
      setNotice(`Harga kanal ${p.name} disimpan.`);
      prices.reload();
    } catch (x) {
      setErr({ id: p.id, message: x instanceof Error ? x.message : 'Gagal menyimpan.' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Daftar harga ojek online" subtitle="Harga jual tiap produk di GoFood, GrabFood, dan ShopeeFood. Kosongkan kolom bila harganya sama dengan harga normal." />
      <p className="cg-banner cg-banner--info mb-16" role="note">Harga ini tersimpan di server. Kasir belum memakainya untuk pesanan online; penerapannya menyusul.</p>
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {(products.status === 'error' || prices.status === 'error') && <ErrorBox message={products.status === 'error' ? products.message : prices.status === 'error' ? prices.message : ''} onRetry={() => { products.reload(); prices.reload(); }} />}
      {(products.status === 'loading' || prices.status === 'loading') && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {products.status === 'ready' && prices.status === 'ready' && (
        <>
          <div className="cg-field mb-12"><label className="cg-label" htmlFor="oj-cari">Cari produk</label><input id="oj-cari" className="cg-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {shown.length === 0 ? <div className="cg-empty"><p><strong>Tidak ada produk yang cocok.</strong></p></div> : (
            <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Harga per kanal">
              <thead><tr><th>Produk</th><th className="text-right">Harga normal</th>{CHANNELS.map((c) => <th key={c}>{CHANNEL_LABEL[c]} (Rp)</th>)}<th><span className="cg-sr">Aksi</span></th></tr></thead>
              <tbody>{shown.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td><td className="text-right cg-num">{formatRp(p.price)}</td>
                  {CHANNELS.map((c) => (
                    <td key={c}><label className="cg-sr" htmlFor={`oj-${p.id}-${c}`}>{CHANNEL_LABEL[c]} untuk {p.name}</label>
                      <input id={`oj-${p.id}-${c}`} className="cg-input cg-num" inputMode="numeric" placeholder={String(p.price)} value={value(p, c)} onChange={(e) => setEdits((s) => ({ ...s, [key(p.id, c)]: e.target.value.replace(/[^\d]/g, '') }))} /></td>
                  ))}
                  <td>
                    <button className="cg-btn cg-btn--primary" disabled={!dirty(p) || saving !== null} onClick={() => save(p)}>{saving === p.id ? 'Menyimpan…' : 'Simpan'}</button>
                    {err?.id === p.id && <p role="alert" className="text-danger-strong">{err.message}</p>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DAY_LABEL, formatRp, hm, newId, timePriceProblem, type Product, type TimePrice } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function RuleDialog({ products, rule, onClose, onDone }: { products: Product[]; rule: TimePrice | null; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => rule?.id ?? newId());
  const [f, setF] = useState({ productId: rule?.productId ?? products[0]?.id ?? '', days: rule?.days ?? [1, 2, 3, 4, 5], start: rule ? hm(rule.startTime) : '15:00', end: rule ? hm(rule.endTime) : '17:00', price: rule ? String(rule.price) : '', active: rule?.isActive ?? true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { id, productId: f.productId, days: f.days, startTime: f.start, endTime: f.end, price: Number(f.price || '-1'), isActive: f.active };
    const problem = !f.productId ? 'Pilih produk.' : f.price === '' ? 'Isi harga.' : timePriceProblem(input);
    if (problem) return setErr(problem);
    setBusy(true);
    try { await data.saveTimePrice(input); onDone(rule ? 'Aturan harga diubah.' : 'Aturan harga ditambahkan.'); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-hw">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-hw" className="cg-modal__title">{rule ? 'Ubah aturan harga' : 'Aturan harga baru'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="hw-produk">Produk</label>
          <select id="hw-produk" className="cg-input" value={f.productId} onChange={(e) => set({ productId: e.target.value })}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <fieldset className="flex flex-wrap gap-12" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Hari berlaku</legend>
          {DAYS.map((n) => <label key={n} className="flex gap-8 items-center"><input type="checkbox" checked={f.days.includes(n)} onChange={(e) => set({ days: e.target.checked ? [...f.days, n].sort() : f.days.filter((x) => x !== n) })} /> {DAY_LABEL[n]}</label>)}
        </fieldset>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="hw-mulai">Jam mulai</label><input id="hw-mulai" type="time" className="cg-input" value={f.start} onChange={(e) => set({ start: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="hw-selesai">Jam selesai</label><input id="hw-selesai" type="time" className="cg-input" value={f.end} onChange={(e) => set({ end: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="hw-harga">Harga (Rp)</label><input id="hw-harga" className="cg-input cg-num" inputMode="numeric" value={f.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })} /></div>
        </div>
        <label className="flex gap-8 items-center"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Aturan aktif</label>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

export default function TimePricesPage() {
  const data = useData();
  const products = useAsync(() => data.listProducts(), [data]);
  const rules = useAsync(() => data.listTimePrices(), [data]);
  const [dialog, setDialog] = useState<{ rule: TimePrice | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const names = useMemo(() => new Map((products.status === 'ready' ? products.data : []).map((p) => [p.id, p])), [products]);

  async function remove(r: TimePrice) {
    setError(''); setNotice('');
    try { await data.deleteTimePrice(r.id); setNotice('Aturan harga dihapus.'); rules.reload(); } catch (x) { setError(x instanceof Error ? x.message : 'Gagal menghapus.'); }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Harga berdasarkan waktu" subtitle="Harga khusus pada hari dan jam tertentu, misalnya jam sore atau akhir pekan."
        actions={<button className="cg-btn cg-btn--primary" disabled={products.status !== 'ready'} onClick={() => { setNotice(''); setDialog({ rule: null }); }}><Plus className="cg-icon" aria-hidden /> Aturan baru</button>} />
      <p className="cg-banner cg-banner--info mb-16" role="note">Aturan tersimpan di server. Kasir belum memakainya untuk menentukan harga; penerapannya menyusul.</p>
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {error && <p role="alert" className="cg-banner cg-banner--danger mb-16">{error}</p>}
      {(rules.status === 'error' || products.status === 'error') && <ErrorBox message={rules.status === 'error' ? rules.message : products.status === 'error' ? products.message : ''} onRetry={() => { rules.reload(); products.reload(); }} />}
      {(rules.status === 'loading' || products.status === 'loading') && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {rules.status === 'ready' && products.status === 'ready' && (rules.data.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada aturan harga waktu.</strong></p><p className="text-text-muted">Pilih Aturan baru untuk menetapkan harga pada jam tertentu.</p></div>
      ) : (
        <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Aturan harga waktu">
          <thead><tr><th>Produk</th><th>Hari</th><th>Jam</th><th className="text-right">Harga normal</th><th className="text-right">Harga aturan</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
          <tbody>{rules.data.map((r) => (
            <tr key={r.id}>
              <td>{names.get(r.productId)?.name ?? '(produk dihapus)'}</td><td>{r.days.map((n) => DAY_LABEL[n]).join(', ')}</td><td>{hm(r.startTime)} – {hm(r.endTime)}</td>
              <td className="text-right cg-num">{names.get(r.productId) ? formatRp(names.get(r.productId)!.price) : '—'}</td><td className="text-right cg-num">{formatRp(r.price)}</td>
              <td><span className="cg-badge">{r.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
              <td className="flex gap-8">
                <button className="cg-btn cg-btn--secondary" aria-label={`Ubah aturan ${names.get(r.productId)?.name ?? ''}`} onClick={() => { setNotice(''); setDialog({ rule: r }); }}><Pencil className="cg-icon" aria-hidden /></button>
                <button className="cg-btn cg-btn--ghost" aria-label={`Hapus aturan ${names.get(r.productId)?.name ?? ''}`} onClick={() => remove(r)}><Trash2 className="cg-icon" aria-hidden /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
      {dialog && products.status === 'ready' && <RuleDialog products={products.data.filter((p) => p.kind !== 'bundle')} rule={dialog.rule} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); setNotice(m); rules.reload(); }} />}
    </div>
  );
}

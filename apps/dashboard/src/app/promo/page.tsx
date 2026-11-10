'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import {
  ALL_ORDER_TYPES, couponInputProblem, describePromotion, formatRp, kindLabel, normalizeCode, promotionProblem, PROMO_KINDS,
  type Coupon, type OrderType, type Product, type Promotion, type PromotionInput,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const TYPE_LABEL: Record<OrderType, string> = { dine_in: 'Makan di tempat', takeaway: 'Bawa pulang', delivery: 'Antar', service: 'Jasa' };
const TZ = 'Asia/Jakarta';
/** Isian tanggal-waktu memakai zona WIB (Asia/Jakarta), sama dengan zona outlet. */
const toInput = (iso?: string) => (iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)).replace(' ', 'T') : '');
const fromInput = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : undefined);
const fmtWhen = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const validity = (a?: string, b?: string) => (a && b ? `${fmtWhen(a)} – ${fmtWhen(b)}` : a ? `Mulai ${fmtWhen(a)}` : b ? `Sampai ${fmtWhen(b)}` : 'Tanpa batas waktu');

type Dlg = { kind: 'edit'; item?: Promotion } | { kind: 'coupons'; item: Promotion } | { kind: 'delete'; item: Promotion };

export default function PromoPage() {
  const data = useData();
  const state = useAsync(async () => ({ promos: await data.listPromotions(), products: await data.listProducts() }), [data]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const done = (msg: string) => { setDlg(null); setNotice(msg); state.reload(); };
  async function toggle(p: Promotion) {
    setBusy(p.id); setErr('');
    try { await data.savePromotion({ ...p, isActive: !p.isActive }); state.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal mengubah status.'); }
    finally { setBusy(null); }
  }
  const name = (id: string) => (state.status === 'ready' ? state.data.products.find((p) => p.id === id)?.name : undefined);

  return (
    <>
      <PageHeader title="Promo dan kupon" subtitle="Atur diskon yang bisa dipilih kasir, lalu buat kode kupon bila perlu"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}><Plus className="cg-icon" aria-hidden /> Tambah promo</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {err && <p role="alert" className="cg-banner cg-banner--danger mb-16">{err}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 64 }} />)}</div>}
      {state.status === 'ready' && (state.data.promos.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada promo.</strong></p><p className="text-text-muted">Promo yang aktif muncul di kasir pada tombol Diskon dan promo.</p>
          <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Buat promo pertama</button></div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Promo</th><th>Aturan</th><th>Berlaku</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {state.data.promos.map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : 'text-text-muted'}>
                  <td className="break-words max-w-[240px]"><strong>{p.name}</strong></td>
                  <td className="break-words max-w-[300px]">{describePromotion(p, name)}{p.minSpend > 0 && <span className="block text-sm text-text-muted">Belanja minimum {formatRp(p.minSpend)}</span>}</td>
                  <td className="text-sm">{validity(p.startsAt, p.endsAt)}<span className="block text-text-muted">{p.orderTypes.length === 4 ? 'Semua jenis order' : p.orderTypes.map((t) => TYPE_LABEL[t]).join(', ')}</span></td>
                  <td><button className={`cg-badge ${p.isActive ? 'cg-badge--accent' : ''}`} disabled={busy === p.id} onClick={() => void toggle(p)} aria-label={`${p.name}: ${p.isActive ? 'aktif, ketuk untuk menonaktifkan' : 'nonaktif, ketuk untuk mengaktifkan'}`}>{p.isActive ? 'Aktif' : 'Nonaktif'}</button></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'coupons', item: p })} aria-label={`Kupon ${p.name}`}><Ticket className="cg-icon cg-icon--sm" aria-hidden /> Kupon</button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'edit', item: p })} aria-label={`Ubah ${p.name}`}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'delete', item: p })} aria-label={`Hapus ${p.name}`}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {dlg?.kind === 'edit' && state.status === 'ready' && <PromoDialog item={dlg.item} products={state.data.products} onClose={() => setDlg(null)} onSaved={(p) => done(`${p.name} disimpan.`)} />}
      {dlg?.kind === 'coupons' && <CouponDialog promo={dlg.item} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'delete' && <DeleteDialog item={dlg.item} onClose={() => setDlg(null)} onDone={() => done(`${dlg.item.name} dihapus. Pesanan lama yang memakainya tetap utuh.`)} />}
    </>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}

function PromoDialog({ item, products, onClose, onSaved }: { item?: Promotion; products: Product[]; onClose: () => void; onSaved: (p: Promotion) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [f, setF] = useState({
    name: item?.name ?? '', kind: item?.kind ?? 'percent_order' as Promotion['kind'], value: item ? String(item.value) : '', minSpend: item?.minSpend ? String(item.minSpend) : '',
    productIds: item?.productIds ?? [] as string[], freeProductId: item?.freeProductId ?? '', orderTypes: item?.orderTypes ?? [...ALL_ORDER_TYPES] as OrderType[],
    startsAt: toInput(item?.startsAt), endsAt: toInput(item?.endsAt), isActive: item?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hasValue = f.kind !== 'free_item';
  const itemKind = f.kind === 'percent_item' || f.kind === 'amount_item' || f.kind === 'free_item';
  const unit = f.kind.startsWith('percent') ? '%' : 'Rp';
  const shown = products.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: PromotionInput = {
      id: item?.id, name: f.name, kind: f.kind, value: hasValue ? Number(f.value.replace(/\D/g, '')) : 0, minSpend: Number(f.minSpend.replace(/\D/g, '')) || 0,
      productIds: itemKind ? f.productIds : [], freeProductId: f.kind === 'free_item' ? f.freeProductId || undefined : undefined,
      orderTypes: f.orderTypes, startsAt: fromInput(f.startsAt), endsAt: fromInput(f.endsAt), isActive: f.isActive,
    };
    const problem = promotionProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { onSaved(await data.savePromotion(input)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Promo gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-promo">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-promo" className="cg-modal__title">{item ? 'Ubah promo' : 'Tambah promo'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="pr-nama">Nama promo</label>
          <input id="pr-nama" className="cg-input" autoFocus maxLength={80} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="pr-jenis">Jenis promo</label>
          <select id="pr-jenis" className="cg-input" value={f.kind} onChange={(e) => set('kind', e.target.value as Promotion['kind'])}>
            {PROMO_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <p className="text-sm text-text-muted mt-4">{PROMO_KINDS.find((k) => k.id === f.kind)?.hint}</p></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {hasValue && <div className="cg-field"><label className="cg-label" htmlFor="pr-nilai">{unit === '%' ? 'Besar diskon (%)' : 'Potongan (Rp)'}</label>
            <input id="pr-nilai" className="cg-input" inputMode="numeric" maxLength={9} value={f.value} onChange={(e) => set('value', e.target.value.replace(/\D/g, ''))} /></div>}
          <div className="cg-field"><label className="cg-label" htmlFor="pr-min">Belanja minimum (Rp)</label>
            <input id="pr-min" className="cg-input" inputMode="numeric" maxLength={9} placeholder="Tanpa minimum" value={f.minSpend} onChange={(e) => set('minSpend', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        {f.kind === 'free_item' && (
          <div className="cg-field"><label className="cg-label" htmlFor="pr-gratis">Produk yang digratiskan</label>
            <select id="pr-gratis" className="cg-input" value={f.freeProductId} onChange={(e) => set('freeProductId', e.target.value)}>
              <option value="">Pilih produk</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-sm text-text-muted mt-4">Kasir harus menambahkan produk ini ke pesanan; promo memotong satu harga satuannya.</p></div>
        )}
        {itemKind && (
          <fieldset className="cg-field">
            <legend className="cg-label">{f.kind === 'free_item' ? 'Syarat: pesanan memuat salah satu produk ini (kosong = tanpa syarat)' : 'Berlaku untuk produk (kosong = semua produk)'}</legend>
            <input className="cg-input mb-8" type="search" placeholder="Cari produk" aria-label="Cari produk" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="grid gap-4 max-h-[180px] overflow-auto border border-border rounded-md p-8">
              {shown.length === 0 ? <p className="text-text-muted text-sm">Tidak ada produk yang cocok.</p> : shown.map((p) => (
                <label key={p.id} className="flex items-center gap-8 min-h-[32px]"><input type="checkbox" checked={f.productIds.includes(p.id)} onChange={() => set('productIds', toggle(f.productIds, p.id))} /> <span className="break-words">{p.name}</span></label>
              ))}
            </div>
            <p className="text-sm text-text-muted mt-4">{f.productIds.length} produk dipilih</p>
          </fieldset>
        )}
        <fieldset className="cg-field"><legend className="cg-label">Berlaku untuk jenis order</legend>
          <div className="flex flex-wrap gap-12">
            {ALL_ORDER_TYPES.map((t) => <label key={t} className="flex items-center gap-8 min-h-[32px]"><input type="checkbox" checked={f.orderTypes.includes(t)} onChange={() => set('orderTypes', toggle(f.orderTypes, t))} /> {TYPE_LABEL[t]}</label>)}
          </div></fieldset>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="pr-mulai">Mulai (WIB, opsional)</label>
            <input id="pr-mulai" className="cg-input" type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="pr-selesai">Berakhir (WIB, opsional)</label>
            <input id="pr-selesai" className="cg-input" type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-8"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Aktif (tampil di kasir)</label>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function CouponDialog({ promo, onClose }: { promo: Promotion; onClose: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const list = useAsync(() => data.listCoupons(promo.id), [data, promo.id]);
  const [edit, setEdit] = useState<Coupon | 'new' | null>(null);
  const [code, setCode] = useState(''); const [limit, setLimit] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function open(c: Coupon | 'new') {
    setEdit(c); setError(null);
    const x = c === 'new' ? undefined : c;
    setCode(x?.code ?? ''); setLimit(x?.usageLimit ? String(x.usageLimit) : ''); setFrom(toInput(x?.validFrom)); setTo(toInput(x?.validTo)); setActive(x?.isActive ?? true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const input = { id: edit && edit !== 'new' ? edit.id : undefined, promotionId: promo.id, code, usageLimit: limit ? Number(limit) : undefined, validFrom: fromInput(from), validTo: fromInput(to), isActive: active };
    const problem = couponInputProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { await data.saveCoupon(input); setEdit(null); list.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Kupon gagal disimpan.'); }
    finally { setBusy(false); }
  }
  async function remove(c: Coupon) {
    setError(null);
    try { await data.deleteCoupon(c.id); list.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Kupon gagal dihapus.'); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-kupon">
      <div className="grid gap-12">
        <h2 id="judul-kupon" className="cg-modal__title break-words">Kupon: {promo.name}</h2>
        {list.status === 'loading' && <div className="cg-skeleton" style={{ height: 64 }} aria-busy="true" aria-label="Memuat" />}
        {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
        {list.status === 'ready' && (list.data.length === 0 ? <p className="text-text-muted">Belum ada kupon. Kasir bisa memakai promo ini tanpa kode lewat daftar promo; kupon dipakai bila kamu ingin kode yang dibagikan.</p> : (
          <ul className="grid gap-4" aria-label="Kupon">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-8 border border-border rounded-md px-12 py-8">
                <span className="min-w-0"><strong className="cg-num break-all">{c.code}</strong>{!c.isActive && <span className="cg-badge ml-8">Nonaktif</span>}
                  <span className="block text-sm text-text-muted">Dipakai {c.usedCount}{c.usageLimit ? ` dari ${c.usageLimit}` : ''} kali · {validity(c.validFrom, c.validTo)}</span></span>
                <span className="whitespace-nowrap">
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => open(c)} aria-label={`Ubah kupon ${c.code}`}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                  <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => void remove(c)} aria-label={`Hapus kupon ${c.code}`}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        ))}
        {edit ? (
          <form onSubmit={save} className="grid gap-12 border-t border-border pt-12" noValidate>
            <h3 className="font-semibold">{edit === 'new' ? 'Kupon baru' : 'Ubah kupon'}</h3>
            <div className="cg-field"><label className="cg-label" htmlFor="cp-kode">Kode (huruf besar otomatis)</label>
              <input id="cp-kode" className="cg-input" autoFocus maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => setCode(normalizeCode(code))} /></div>
            <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="cg-field"><label className="cg-label" htmlFor="cp-batas">Batas pemakaian (kosong = tanpa batas)</label>
                <input id="cp-batas" className="cg-input" inputMode="numeric" maxLength={6} value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor="cp-mulai">Berlaku dari (WIB)</label>
                <input id="cp-mulai" className="cg-input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor="cp-selesai">Berlaku sampai (WIB)</label>
                <input id="cp-selesai" className="cg-input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-8"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif</label>
            <div className="flex gap-8 justify-end">
              <button type="button" className="cg-btn cg-btn--ghost" onClick={() => setEdit(null)}>Batal</button>
              <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kupon'}</button>
            </div>
          </form>
        ) : <button className="cg-btn cg-btn--secondary" onClick={() => open('new')}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah kupon</button>}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--primary" onClick={() => d.ref.current?.close()}>Selesai</button></div>
      </div>
    </dialog>
  );
}

function DeleteDialog({ item, onClose, onDone }: { item: Promotion; onClose: () => void; onDone: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() { setBusy(true); setError(null); try { await data.deletePromotion(item.id); onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menghapus.'); setBusy(false); } }
  return (
    <dialog {...d.props} aria-labelledby="judul-hapus-promo">
      <div className="grid gap-16">
        <h2 id="judul-hapus-promo" className="cg-modal__title break-words">Hapus {item.name}?</h2>
        <p className="cg-modal__body">Promo dan kuponnya tidak bisa dipakai lagi di kasir. Pesanan lama yang memakainya tetap utuh. Bila hanya ingin berhenti sementara, nonaktifkan saja.</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void go()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

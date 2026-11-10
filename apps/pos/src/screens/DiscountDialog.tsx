import { useMemo, useState } from 'react';
import { Tag, X } from 'lucide-react';
import {
  couponProblem, describePromotion, formatRp, manualProblem, newApplied, normalizeCode, promotionAmount, promotionBlock,
  type AppliedDiscount, type PromoCart, type Promotion, type ResolvedDiscounts,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { ApproverFields, useApprover } from '../lib/approver';
import { Modal } from '../ui';

type Tab = 'promo' | 'coupon' | 'manual';

/** Pilih promo, masukkan kode kupon, atau beri diskon manual. Boleh banyak sekaligus; total tidak pernah melebihi belanja. */
export function DiscountDialog({ applied, resolved, promos, cart, gross, productName, onAdd, onRemove, onClose }: {
  applied: AppliedDiscount[]; resolved: ResolvedDiscounts; promos: Promotion[]; cart: PromoCart; gross: number; productName: (id: string) => string | undefined;
  onAdd: (d: AppliedDiscount) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('promo');
  const now = useMemo(() => new Date(), []);
  const amountOf = (id: string) => resolved.entries.find((e) => e.id === id)?.amount;
  const skippedOf = (id: string) => resolved.skipped.find((e) => e.id === id)?.reason;
  return (
    <Modal title="Diskon dan promo" onClose={onClose} labelledBy="disc-title">
      {applied.length > 0 && (
        <ul className="grid gap-4 mb-12" aria-label="Diskon terpasang">
          {applied.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-8 border border-border rounded-md px-12 py-8">
              <span className="min-w-0 break-words">{d.label}{d.code && <span className="text-text-muted"> ({d.code})</span>}
                {skippedOf(d.id) && <span className="block text-sm text-danger-strong">Tidak berlaku: {skippedOf(d.id)}</span>}</span>
              <span className="flex items-center gap-4 shrink-0">
                <span className="cg-num">{amountOf(d.id) ? `-${formatRp(amountOf(d.id)!)}` : '—'}</span>
                <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => onRemove(d.id)} aria-label={`Lepas ${d.label}`}><X className="cg-icon cg-icon--sm" aria-hidden /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="cg-tabs mb-12" role="tablist" aria-label="Jenis diskon">
        {([['promo', 'Promo'], ['coupon', 'Kupon'], ['manual', 'Manual']] as const).map(([id, label]) =>
          <button key={id} role="tab" className="cg-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'promo' && (promos.length === 0
        ? <div className="cg-empty"><p><strong>Belum ada promo aktif.</strong></p><p className="text-text-muted">Buat promo di dashboard, menu Promo dan kupon.</p></div>
        : (
          <ul className="grid gap-8" aria-label="Promo">
            {promos.map((p) => {
              const used = applied.some((a) => a.promotionId === p.id && a.source === 'promo');
              const block = promotionBlock(p, cart, now);
              const amt = block ? 0 : promotionAmount(p, cart);
              return (
                <li key={p.id}>
                  <button className="cg-btn cg-btn--secondary cg-btn--block flex justify-between text-left" style={{ minHeight: 56 }} disabled={!!block || used}
                    onClick={() => onAdd(newApplied({ source: 'promo', promotionId: p.id, label: p.name }))}
                    aria-label={`${p.name}${block ? `, tidak berlaku: ${block}` : used ? ', sudah dipakai' : `, potongan ${formatRp(Math.min(amt, gross))}`}`}>
                    <span className="min-w-0"><strong className="break-words">{p.name}</strong>
                      <span className="block text-sm text-text-muted">{block ?? describePromotion(p, productName)}</span></span>
                    {!block && <span className="cg-num shrink-0">{used ? 'Terpasang' : `-${formatRp(Math.min(amt, gross))}`}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
      {tab === 'coupon' && <CouponTab cart={cart} applied={applied} onAdd={onAdd} />}
      {tab === 'manual' && <ManualTab gross={gross} onAdd={onAdd} />}
      <div className="cg-modal__actions"><button className="cg-btn cg-btn--primary" onClick={onClose}>Selesai</button></div>
    </Modal>
  );
}

function CouponTab({ cart, applied, onAdd }: { cart: PromoCart; applied: AppliedDiscount[]; onAdd: (d: AppliedDiscount) => void }) {
  const data = useData();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply() {
    const c = normalizeCode(code);
    if (!c) return setErr('Masukkan kode kupon.');
    setBusy(true); setErr(''); setOk('');
    try {
      const hit = await data.findCoupon(c);
      if (!hit) return setErr('Kode kupon tidak dikenal.');
      if (applied.some((a) => a.couponId === hit.coupon.id)) return setErr('Kupon ini sudah dipakai di pesanan ini.');
      const now = new Date();
      const problem = couponProblem(hit.coupon, hit.promotion, now, hit.coupon.usedCount) ?? promotionBlock({ ...hit.promotion, isActive: true }, cart, now);
      if (problem) return setErr(problem);
      onAdd(newApplied({ source: 'coupon', promotionId: hit.promotion.id, couponId: hit.coupon.id, code: hit.coupon.code, label: hit.promotion.name }));
      setOk(`Kupon ${hit.coupon.code} dipakai.`); setCode('');
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : 'Kupon gagal diperiksa. Cek koneksi internet.'); }
    finally { setBusy(false); }
  }
  return (
    <form className="grid gap-12" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
      <div className="cg-field"><label className="cg-label" htmlFor="kupon-kode">Kode kupon</label>
        <input id="kupon-kode" className="cg-input" autoCapitalize="characters" autoComplete="off" maxLength={20} value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} /></div>
      <p className="text-text-muted text-sm">Kupon diperiksa ke server, jadi butuh koneksi internet.</p>
      {err && <p role="alert" className="text-danger-strong">{err}</p>}
      {ok && <p role="status">{ok}</p>}
      <button type="submit" className="cg-btn cg-btn--secondary" disabled={busy} aria-busy={busy}><Tag className="cg-icon cg-icon--sm" aria-hidden /> Pakai kupon</button>
    </form>
  );
}

function ManualTab({ gross, onAdd }: { gross: number; onAdd: (d: AppliedDiscount) => void }) {
  const approver = useApprover('manual_discount');
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply() {
    const value = Number(val.replace(/\D/g, ''));
    const problem = manualProblem(mode, value, gross);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    const by = await approver.authorize();
    setBusy(false);
    if (!by) return setErr(approver.mode === 'deny' ? 'Peran kamu tidak boleh memberi diskon manual.' : 'PIN salah atau pemberi izin belum dipilih.');
    onAdd(newApplied({ source: 'manual', label: mode === 'percent' ? `Diskon ${value}%` : 'Diskon manual', manual: { mode, value }, authorizedBy: by }));
    setVal(''); approver.setPin('');
  }
  return (
    <form className="grid gap-12" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
      <div className="cg-tabs" role="tablist" aria-label="Satuan diskon">
        <button type="button" role="tab" className="cg-tab" aria-selected={mode === 'percent'} onClick={() => { setMode('percent'); setErr(''); }}>Persen (%)</button>
        <button type="button" role="tab" className="cg-tab" aria-selected={mode === 'amount'} onClick={() => { setMode('amount'); setErr(''); }}>Rupiah (Rp)</button>
      </div>
      <div className="cg-field"><label className="cg-label" htmlFor="manual-nilai">{mode === 'percent' ? 'Besar diskon (%)' : 'Potongan (Rp)'}</label>
        <input id="manual-nilai" className="cg-input" inputMode="numeric" maxLength={9} value={val} onChange={(e) => { setVal(e.target.value.replace(/\D/g, '')); setErr(''); }} /></div>
      <ApproverFields a={approver} idPrefix="manual" what="diskon manual" />
      {err && <p role="alert" className="text-danger-strong">{err}</p>}
      <button type="submit" className="cg-btn cg-btn--secondary" disabled={busy || approver.mode === 'deny'} aria-busy={busy}>Terapkan diskon</button>
    </form>
  );
}

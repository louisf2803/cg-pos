import { useEffect, useMemo, useState } from 'react';
import { Gift, Star, Tag, X } from 'lucide-react';
import {
  COUPON_REFERENCE_MAX, DEFAULT_LOYALTY, couponProblem, couponReferenceProblem, describePromotion, formatRp, manualProblem, maxRedeemPoints,
  newApplied, normalizeCode, normalizeCouponReference, promotionAmount, promotionBlock, redeemAmount, redeemProblem,
  type AppliedDiscount, type LoyaltyProductReward, type LoyaltyRules, type Product, type PromoCart, type Promotion, type ResolvedDiscounts,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { ApproverFields, useApprover } from '../lib/approver';
import { Modal } from '../ui';

type Tab = 'promo' | 'coupon' | 'points' | 'manual';

/** Pilih promo, masukkan kode kupon, atau beri diskon manual. Boleh banyak sekaligus; total tidak pernah melebihi belanja. */
export function DiscountDialog({ applied, resolved, promos, cart, gross, customerId, productName, onAdd, onRemove, onAddProductReward, onClose }: {
  customerId?: string; applied: AppliedDiscount[]; resolved: ResolvedDiscounts; promos: Promotion[]; cart: PromoCart; gross: number; productName: (id: string) => string | undefined;
  onAdd: (d: AppliedDiscount) => void; onRemove: (id: string) => void; onAddProductReward?: (product: Product, pointsCost: number) => void; onClose: () => void;
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
                {d.reference && <span className="block text-sm text-text-muted">Ref: {d.reference}</span>}
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
        {([['promo', 'Promo'], ['coupon', 'Kupon'], ['points', 'Poin'], ['manual', 'Manual']] as const).map(([id, label]) =>
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
      {tab === 'points' && <PointsTab customerId={customerId} applied={applied} remaining={Math.max(0, gross - resolved.entries.filter((e) => e.source !== 'points').reduce((n, e) => n + e.amount, 0))} onAdd={onAdd} onAddProductReward={onAddProductReward} />}
      {tab === 'manual' && <ManualTab gross={gross} onAdd={onAdd} />}
      <div className="cg-modal__actions"><button className="cg-btn cg-btn--primary" onClick={onClose}>Selesai</button></div>
    </Modal>
  );
}

function CouponTab({ cart, applied, onAdd }: { cart: PromoCart; applied: AppliedDiscount[]; onAdd: (d: AppliedDiscount) => void }) {
  const data = useData();
  const [code, setCode] = useState('');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply() {
    const c = normalizeCode(code);
    if (!c) return setErr('Masukkan kode kupon.');
    const refErr = couponReferenceProblem(reference);
    if (refErr) return setErr(refErr);
    const ref = normalizeCouponReference(reference);
    setBusy(true); setErr(''); setOk('');
    try {
      const hit = await data.findCoupon(c);
      if (!hit) return setErr('Kode kupon tidak dikenal.');
      if (applied.some((a) => a.couponId === hit.coupon.id)) return setErr('Kupon ini sudah dipakai di pesanan ini.');
      const now = new Date();
      const problem = couponProblem(hit.coupon, hit.promotion, now, hit.coupon.usedCount) ?? promotionBlock({ ...hit.promotion, isActive: true }, cart, now);
      if (problem) return setErr(problem);
      onAdd(newApplied({ source: 'coupon', promotionId: hit.promotion.id, couponId: hit.coupon.id, code: hit.coupon.code, label: hit.promotion.name, ...(ref ? { reference: ref } : {}) }));
      setOk(`Kupon ${hit.coupon.code} dipakai.`); setCode(''); setReference('');
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : 'Kupon gagal diperiksa. Cek koneksi internet.'); }
    finally { setBusy(false); }
  }
  return (
    <form className="grid gap-12" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
      <div className="cg-field"><label className="cg-label" htmlFor="kupon-kode">Kode kupon</label>
        <input id="kupon-kode" className="cg-input" autoCapitalize="characters" autoComplete="off" maxLength={20} value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} /></div>
      <div className="cg-field"><label className="cg-label" htmlFor="kupon-referensi">Nomor referensi (opsional)</label>
        <input id="kupon-referensi" className="cg-input" autoComplete="off" maxLength={COUPON_REFERENCE_MAX} placeholder="Mis. kode voucer rekanan atau catatan kampanye" value={reference} onChange={(e) => { setReference(e.target.value); setErr(''); }} /></div>
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

function PointsTab({
  customerId,
  applied,
  remaining,
  onAdd,
  onAddProductReward,
}: {
  customerId?: string;
  applied: AppliedDiscount[];
  remaining: number;
  onAdd: (d: AppliedDiscount) => void;
  onAddProductReward?: (product: Product, pointsCost: number) => void;
}) {
  const data = useData();
  const [state, setState] = useState<{
    status: 'loading' | 'error' | 'ready';
    balance: number;
    name: string;
    rules: LoyaltyRules;
    rewards: LoyaltyProductReward[];
    products: Product[];
  }>({
    status: 'loading',
    balance: 0,
    name: '',
    rules: DEFAULT_LOYALTY,
    rewards: [],
    products: [],
  });
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!customerId) return;
    let live = true;
    setState((s) => ({ ...s, status: 'loading' }));
    Promise.all([
      data.getCustomer(customerId),
      data.getLoyaltyRules(),
      data.listLoyaltyProductRewards(true),
      data.listProducts(),
    ])
      .then(([c, rules, rewards, products]) => {
        if (live) {
          setState({
            status: c ? 'ready' : 'error',
            balance: c ? c.pointsBalance : 0,
            name: c ? c.name : '',
            rules,
            rewards,
            products,
          });
        }
      })
      .catch(() => {
        if (live) setState((s) => ({ ...s, status: 'error' }));
      });
    return () => {
      live = false;
    };
  }, [data, customerId]);

  if (!customerId) {
    return (
      <div className="cg-empty">
        <p><strong>Pilih pelanggan dulu.</strong></p>
        <p className="text-text-muted">Poin menempel pada pelanggan. Pilih pelanggan di layar kasir, lalu kembali ke sini.</p>
      </div>
    );
  }
  if (state.status === 'loading') return <p role="status" className="text-text-muted">Memuat poin…</p>;
  if (state.status === 'error') return <p role="alert" className="text-danger-strong">Poin gagal dimuat. Cek koneksi internet.</p>;

  const { balance, rules, name, rewards, products } = state;
  if (!rules.isActive) {
    return (
      <div className="cg-empty">
        <p><strong>Loyalti belum aktif.</strong></p>
        <p className="text-text-muted">Pemilik bisa mengaktifkannya di dashboard, menu Loyalti.</p>
      </div>
    );
  }

  const totalPointsUsed = applied.filter((a) => a.source === 'points').reduce((s, a) => s + (a.points ?? 0), 0);
  const currentBalance = Math.max(0, balance - totalPointsUsed);
  const haveCashDiscount = applied.find((a) => a.source === 'points' && !a.rewardProductId);
  const max = maxRedeemPoints(currentBalance, remaining, rules);

  function applyDiscount() {
    const n = Number(val.replace(/\D/g, ''));
    const problem = redeemProblem(n, currentBalance, remaining, rules);
    if (problem) return setErr(problem);
    onAdd(newApplied({ source: 'points', label: 'Tukar poin', points: n, fixed: redeemAmount(n, rules) }));
    setVal('');
    setNotice(`Berhasil menukar ${n} poin (-${formatRp(redeemAmount(n, rules))}).`);
  }

  function handleClaimReward(reward: LoyaltyProductReward) {
    const prod = products.find((p) => p.id === reward.productId);
    if (!prod) return setErr('Produk hadiah tidak ditemukan di katalog.');
    if (currentBalance < reward.pointsCost) {
      return setErr(`Saldo poin tidak cukup untuk ${prod.name} (${reward.pointsCost} poin dibutuhkan, sisa ${currentBalance} poin).`);
    }
    if (onAddProductReward) {
      onAddProductReward(prod, reward.pointsCost);
      setNotice(`Hadiah "${prod.name}" ditambahkan ke pesanan (Rp0, -${reward.pointsCost} poin).`);
      setErr('');
    }
  }

  return (
    <div className="grid gap-16">
      <div className="p-12 rounded-lg bg-surface border border-border flex items-center justify-between gap-12 flex-wrap">
        <div>
          <strong className="break-words">{name}</strong>
          <span className="text-text-muted text-xs block">1 poin = {formatRp(rules.redeemValuePerPoint)}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-text-muted block">Saldo poin</span>
          <strong className="cg-num text-base text-accent-strong">{currentBalance}</strong>
          {totalPointsUsed > 0 && <span className="text-xs text-text-muted block">(-{totalPointsUsed} terpakai)</span>}
        </div>
      </div>

      {notice && <p role="status" className="cg-banner cg-banner--info">{notice}</p>}
      {err && <p role="alert" className="text-danger-strong">{err}</p>}

      <div className="space-y-8">
        <h3 className="text-sm font-semibold flex items-center gap-6">
          <Star className="cg-icon cg-icon--xs text-accent" aria-hidden /> Potongan Tagihan Belanja
        </h3>
        {haveCashDiscount ? (
          <p role="status" className="text-sm text-text-muted">
            Sudah menukar {haveCashDiscount.points} poin di pesanan ini ({formatRp(haveCashDiscount.fixed ?? 0)}). Lepas pada daftar diskon di atas bila ingin mengubahnya.
          </p>
        ) : (
          <form className="grid gap-8" onSubmit={(e) => { e.preventDefault(); applyDiscount(); }}>
            <div className="cg-field">
              <label className="cg-label text-xs" htmlFor="poin-jumlah">Poin yang ditukar</label>
              <input
                id="poin-jumlah"
                className="cg-input"
                inputMode="numeric"
                maxLength={7}
                placeholder="Jumlah poin..."
                value={val}
                onChange={(e) => { setVal(e.target.value.replace(/\D/g, '')); setErr(''); }}
              />
            </div>
            <p className="text-text-muted text-xs">
              {max > 0 ? `Maksimal ${max} poin (${formatRp(redeemAmount(max, rules))}) untuk sisa tagihan ini.` : 'Belum ada sisa tagihan untuk ditukar poin.'}
            </p>
            <div className="flex gap-8">
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm"
                disabled={max < 1}
                onClick={() => { setVal(String(max)); setErr(''); }}
              >
                Pakai maksimal
              </button>
              <button
                type="submit"
                className="cg-btn cg-btn--secondary cg-btn--sm"
                disabled={max < 1 || !val}
              >
                Terapkan potongan
              </button>
            </div>
          </form>
        )}
      </div>

      {rewards.length > 0 && (
        <div className="space-y-8 pt-12 border-t border-border">
          <h3 className="text-sm font-semibold flex items-center gap-6">
            <Gift className="cg-icon cg-icon--xs text-accent" aria-hidden /> Klaim Produk Hadiah Gratis
          </h3>
          <p className="text-xs text-text-muted">
            Poin akan ditukar dengan item produk gratis (Rp0) yang langsung dimasukkan ke pesanan kasir.
          </p>
          <div className="grid gap-8 max-h-[220px] overflow-y-auto">
            {rewards.map((r) => {
              const prod = products.find((p) => p.id === r.productId);
              const canClaim = currentBalance >= r.pointsCost;
              return (
                <div key={r.id} className="flex items-center justify-between gap-12 p-8 border border-border rounded-md">
                  <div className="min-w-0">
                    <div className="font-semibold text-xs break-words">{prod?.name ?? r.productName ?? r.productId}</div>
                    <div className="text-[11px] text-text-muted">
                      {prod ? `Normal: ${formatRp(prod.price)}` : ''} · Butuh <strong className="text-accent-strong">{r.pointsCost} poin</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm shrink-0"
                    disabled={!canClaim || !onAddProductReward}
                    onClick={() => handleClaimReward(r)}
                  >
                    Klaim gratis
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

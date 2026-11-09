import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Landmark, QrCode } from 'lucide-react';
import { DataError, cashChange, formatRp, newId, parseRp, quickCashAmounts, roundToStep, type Order, type OutletContext, type PaymentMethod } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';

const ICON: Record<PaymentMethod['kind'], typeof Banknote> = { cash: Banknote, noncash: CreditCard, gateway: QrCode, complimentary: Landmark, deposit: Landmark };

export function Payment({ order, ctx, onBack, onDone }: { order: Order; ctx: OutletContext; onBack: () => void; onDone: () => void }) {
  const data = useData();
  const methods = useAsync(() => data.listPaymentMethods(), [data]);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  // satu id per upaya bayar: ketuk dua kali tidak menggandakan pembayaran (kontrak idempoten dengan server)
  const attemptId = useRef(newId());

  const list = methods.status === 'ready' ? methods.data : [];
  const method = list.find((m) => m.id === methodId) ?? null;
  const cashFirst = useMemo(() => [...list].sort((a, b) => Number(b.kind === 'cash') - Number(a.kind === 'cash')), [list]);

  const step = !method ? 0 : method.kind === 'cash' ? ctx.settings.roundingCashStep : ctx.settings.roundingNoncashStep;
  const target = order.paidTotal === 0 && step ? roundToStep(order.total, step) : order.total;
  const due = target - order.paidTotal;
  const rounding = target - order.total;
  const isCash = method?.kind === 'cash';
  const tendered = raw === '' ? due : parseRp(raw);
  const calc = cashChange(target, order.paidTotal, tendered);

  async function confirm() {
    if (!method) return;
    if (isCash && tendered < due) { setErr(`Uang diterima kurang ${formatRp(due - tendered)}.`); return; }
    setBusy(true); setErr('');
    try {
      const res = await data.addPayment(order.id, { id: attemptId.current, methodId: method.id, amount: due, tendered: isCash ? tendered : undefined });
      setDone(res);
    } catch (e) {
      setErr(e instanceof DataError || e instanceof Error ? e.message : 'Pembayaran gagal. Periksa pesanan lalu coba lagi.');
    } finally { setBusy(false); }
  }

  if (done) {
    const p = done.payments[done.payments.length - 1];
    return (
      <main className="min-h-full grid place-items-center p-16">
        <div className="w-full max-w-[440px] grid gap-16 text-center" role="status">
          <CheckCircle2 className="cg-icon cg-icon--lg justify-self-center text-success-strong" aria-hidden />
          <h1 className="text-xl">Pembayaran berhasil</h1>
          <p className="text-text-muted">{done.number} · {p?.methodName}</p>
          {p && p.kind === 'cash' && (
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <p className="text-text-muted text-sm">Kembalian</p>
              <p className="cg-money-lg">{formatRp(p.change)}</p>
            </div>
          )}
          <div className="cg-totals" style={{ padding: 0 }}>
            <div className="cg-totals__row"><span>Total</span><span className="cg-num">{formatRp(done.total)}</span></div>
            {done.rounding !== 0 && <div className="cg-totals__row"><span>Termasuk pembulatan</span><span className="cg-num">{formatRp(done.rounding)}</span></div>}
          </div>
          <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" autoFocus onClick={onDone}>Pesanan baru</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full grid desktop:grid-cols-[1fr_1fr] tablet:grid-cols-[1fr_1fr] content-start">
      <header className="col-span-full flex items-center gap-12 px-16 h-[var(--layout-pos-header)] border-b border-border bg-surface-raised">
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onBack} disabled={busy}><ArrowLeft className="cg-icon" aria-hidden /> Kembali ke pesanan</button>
        <strong className="ml-auto">{order.number}</strong>
      </header>

      <section className="p-16 grid gap-12 content-start" aria-labelledby="h-metode">
        <h1 id="h-metode" className="text-lg">Pilih cara bayar</h1>
        {methods.status === 'loading' && <div className="grid gap-8" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
        {methods.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Metode bayar gagal dimuat. {methods.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={methods.reload}>Coba lagi</button></div>}
        <div className="cg-methods" role="radiogroup" aria-label="Metode pembayaran">
          {cashFirst.map((m) => {
            const Icon = ICON[m.kind];
            const off = m.kind === 'gateway';
            return (
              <button key={m.id} role="radio" aria-checked={methodId === m.id} aria-disabled={off} className="cg-method"
                onClick={() => { if (off) return; setMethodId(m.id); setRaw(''); setErr(''); attemptId.current = newId(); }}>
                <Icon className="cg-icon" aria-hidden /> {m.name}
                {off && <small>Segera hadir</small>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-16 grid gap-16 content-start border-t tablet:border-t-0 tablet:border-l border-border" aria-labelledby="h-tagihan">
        <h2 id="h-tagihan" className="text-lg">Tagihan</h2>
        <div className="grid gap-4">
          <p className="text-text-muted text-sm">{order.paidTotal > 0 ? 'Sisa tagihan' : 'Total tagihan'}</p>
          <p className="cg-money-lg">{formatRp(method ? due : order.total - order.paidTotal)}</p>
          {method && rounding !== 0 && <p className="text-text-muted text-sm">Sudah termasuk pembulatan {rounding > 0 ? '+' : ''}{formatRp(rounding)}</p>}
        </div>

        {!method && <div className="cg-banner cg-banner--info"><span>Pilih cara bayar di sebelah kiri atau di atas.</span></div>}

        {method && isCash && (
          <>
            <div className="cg-field">
              <label className="cg-label" htmlFor="diterima">Uang diterima (Rp)</label>
              <input id="diterima" className="cg-input" inputMode="numeric" autoFocus value={raw} placeholder={String(due)}
                onChange={(e) => { setRaw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'e-bayar' : undefined}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirm(); } }} />
            </div>
            <div className="flex flex-wrap gap-8" role="group" aria-label="Nominal cepat">
              {quickCashAmounts(due).map((a, i) => (
                <button key={a} className="cg-chip" aria-pressed={tendered === a && raw !== ''} onClick={() => { setRaw(String(a)); setErr(''); }}>{i === 0 ? `Uang pas ${formatRp(a)}` : formatRp(a)}</button>
              ))}
            </div>
            <div className="border border-border rounded-lg bg-surface p-16" aria-live="polite">
              {calc.shortfall > 0
                ? <><p className="text-text-muted text-sm">Masih kurang</p><p className="text-xl cg-num text-danger-strong">{formatRp(calc.shortfall)}</p></>
                : <><p className="text-text-muted text-sm">Kembalian</p><p className="text-xl cg-num">{formatRp(calc.change)}</p></>}
            </div>
          </>
        )}

        {method && !isCash && (
          <div className="cg-banner cg-banner--info"><span>Selesaikan pembayaran di perangkat {method.name}, lalu catat di sini sebesar {formatRp(due)}.</span></div>
        )}

        {err && <p id="e-bayar" role="alert" className="cg-error">{err}</p>}
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" disabled={!method || busy || due <= 0} aria-busy={busy} onClick={() => void confirm()}>
          {busy ? 'Memproses…' : method ? `Terima ${formatRp(isCash ? Math.max(tendered, 0) : due)}` : 'Pilih cara bayar dulu'}
        </button>
      </section>
    </main>
  );
}

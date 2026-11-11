import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Maximize2, Minimize2, Monitor, ShoppingBag, Store, UserRound } from 'lucide-react';
import {
  createIdleCustomerDisplaySnapshot,
  customerDisplayItemCount,
  formatRp,
  type CustomerDisplaySnapshot,
  type OutletContext,
} from '@cgpos/shared';
import { readStoredCustomerDisplay, subscribeCustomerDisplay } from '../lib/customer-display';

const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

const PHASE_META: Record<CustomerDisplaySnapshot['phase'], { label: string; badgeClass: string }> = {
  idle: { label: 'Siap Melayani', badgeClass: 'cg-badge cg-badge--info' },
  ordering: { label: 'Pesanan Berjalan', badgeClass: 'cg-badge cg-badge--accent' },
  paying: { label: 'Menunggu Pembayaran', badgeClass: 'cg-badge cg-badge--warning' },
  paid: { label: 'Pembayaran Lunas', badgeClass: 'cg-badge cg-badge--success' },
};

/** Layar Pelanggan Eksternal (?display=customer): tersinkron waktu-nyata dengan kasir pada tab/jendela lain. */
export function CustomerDisplay({ ctx }: { ctx: OutletContext }) {
  const [snap, setSnap] = useState<CustomerDisplaySnapshot>(() => (
    readStoredCustomerDisplay()
    ?? createIdleCustomerDisplaySnapshot(ctx.outletName, {
      outletAddress: ctx.address,
      welcomeMessage: ctx.receiptHeader,
    })
  ));
  const [now, setNow] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    document.title = `Layar Pelanggan · ${snap.outletName}`;
  }, [snap.outletName]);

  useEffect(() => {
    const existing = readStoredCustomerDisplay();
    if (existing) setSnap(existing);
    const unsub = subscribeCustomerDisplay((next) => setSnap(next));
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      unsub();
      clearInterval(tick);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Abaikan bila diblokir peramban
    }
  }

  const clockStr = new Intl.DateTimeFormat('id-ID', {
    timeZone: ctx.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const phaseMeta = PHASE_META[snap.phase];
  const itemCount = customerDisplayItemCount(snap.lines);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="bg-shell-bg text-shell-text px-16 py-12 flex flex-wrap items-center justify-between gap-12 border-b border-border shrink-0">
        <div className="flex items-center gap-12 min-w-0">
          <div className="w-[36px] h-[36px] rounded-lg bg-accent-strong flex items-center justify-center shrink-0">
            <Monitor className="cg-icon cg-icon--sm" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">{snap.outletName}</h1>
            <p className="text-xs truncate">
              Layar Pelanggan{snap.outletAddress ? ` · ${snap.outletAddress}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-8 shrink-0">
          <span className={phaseMeta.badgeClass} data-testid="cd-phase">{phaseMeta.label}</span>
          <span className="text-sm font-semibold cg-num" aria-label="Jam">{clockStr}</span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fullscreen ? <Minimize2 className="cg-icon cg-icon--sm" aria-hidden /> : <Maximize2 className="cg-icon cg-icon--sm" aria-hidden />}
            <span className="hidden tablet:inline">{fullscreen ? 'Normal' : 'Layar Penuh'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-16 tablet:p-24 max-w-[1200px] w-full mx-auto flex flex-col min-w-0">
        {snap.phase === 'idle' && (
          <section
            className="flex-1 flex flex-col items-center justify-center text-center bg-surface-raised border border-border rounded-xl p-24 tablet:p-40 gap-16 min-w-0"
            data-testid="cd-idle"
          >
            <div className="w-64 h-64 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center">
              <Store className="cg-icon cg-icon--lg" aria-hidden />
            </div>
            <div className="space-y-8 max-w-[560px]">
              <h2 className="text-2xl font-bold text-text">Selamat Datang di {snap.outletName}</h2>
              {snap.welcomeMessage && (
                <p className="text-base font-medium text-accent-strong">{snap.welcomeMessage}</p>
              )}
              <p className="text-sm text-text-muted">
                Silakan sebutkan pesanan Anda kepada kasir. Daftar menu, potongan, dan total tagihan akan tampil otomatis di layar ini.
              </p>
            </div>
            {snap.cashierName && (
              <span className="cg-badge">Kasir bertugas: {snap.cashierName}</span>
            )}
          </section>
        )}

        {snap.phase === 'paid' && (
          <section className="grid gap-20 min-w-0" data-testid="cd-paid">
            <div className="bg-surface-raised border border-border rounded-xl p-24 tablet:p-32 text-center grid gap-16 justify-items-center">
              <div className="w-64 h-64 rounded-full bg-success-soft text-success-strong flex items-center justify-center">
                <CheckCircle2 className="cg-icon cg-icon--lg" aria-hidden />
              </div>
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-text">Terima Kasih, Pembayaran Berhasil!</h2>
                <p className="text-sm text-text-muted">
                  {snap.orderNumber ? `${snap.orderNumber} · ` : ''}
                  {snap.paymentMethod ?? 'Pembayaran tercatat'}
                  {snap.customerName ? ` · ${snap.customerName}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 w-full max-w-[720px]">
                <div className="p-16 bg-surface border border-border rounded-lg">
                  <span className="text-xs text-text-muted block">Total Belanja</span>
                  <strong className="text-xl cg-num block mt-4" data-testid="cd-paid-total">{formatRp(snap.total)}</strong>
                </div>
                <div className="p-16 bg-surface border border-border rounded-lg">
                  <span className="text-xs text-text-muted block">Dibayar</span>
                  <strong className="text-xl cg-num block mt-4">
                    {formatRp(snap.tendered && snap.tendered > 0 ? snap.tendered : snap.paidTotal ?? snap.total)}
                  </strong>
                </div>
                <div className="p-16 bg-success-soft text-success-strong border border-border rounded-lg">
                  <span className="text-xs block">Kembalian</span>
                  <strong className="text-xl cg-num block mt-4" data-testid="cd-paid-change">{formatRp(snap.change ?? 0)}</strong>
                </div>
              </div>
            </div>

            {snap.lines.length > 0 && (
              <div className="bg-surface-raised border border-border rounded-xl p-16 tablet:p-24 min-w-0">
                <h3 className="text-base font-semibold mb-12">Ringkasan Item ({fmtQty(itemCount)} item)</h3>
                <ul className="divide-y divide-border">
                  {snap.lines.map((line) => (
                    <li key={line.id} className="py-10 flex items-start justify-between gap-12">
                      <div className="min-w-0">
                        <p className="font-semibold text-text break-words">
                          <span className="cg-num">{fmtQty(line.qty)}×</span> {line.name}
                        </p>
                        {line.extrasLabel && <p className="text-xs text-text-muted break-words">{line.extrasLabel}</p>}
                      </div>
                      <span className="cg-num font-semibold shrink-0">{formatRp(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {(snap.phase === 'ordering' || snap.phase === 'paying') && (
          <div className="grid grid-cols-1 laptop:grid-cols-[1fr_360px] gap-20 flex-1 min-w-0 items-start content-start" data-testid="cd-active">
            <section className="bg-surface-raised border border-border rounded-xl p-16 tablet:p-24 min-w-0" aria-labelledby="cd-items-title">
              <div className="flex flex-wrap items-center justify-between gap-8 pb-12 border-b border-border">
                <div className="flex items-center gap-8 min-w-0">
                  <ShoppingBag className="cg-icon text-accent-strong shrink-0" aria-hidden />
                  <h2 id="cd-items-title" className="text-lg font-bold">Daftar Pesanan</h2>
                  <span className="cg-badge">{fmtQty(itemCount)} item</span>
                </div>
                <div className="flex flex-wrap gap-6">
                  {snap.orderTypeLabel && <span className="cg-badge">{snap.orderTypeLabel}</span>}
                  {snap.tableName && <span className="cg-badge cg-badge--info">{snap.tableName}</span>}
                  {snap.orderNumber && <span className="cg-badge">{snap.orderNumber}</span>}
                </div>
              </div>

              {snap.lines.length === 0 ? (
                <div className="cg-empty py-24">
                  <p><strong>Belum ada item di pesanan.</strong></p>
                </div>
              ) : (
                <ul className="divide-y divide-border mt-8" data-testid="cd-lines">
                  {snap.lines.map((line) => (
                    <li key={line.id} className="py-12 flex items-start justify-between gap-12">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-text break-words">
                          <span className="text-accent-strong cg-num">{fmtQty(line.qty)}×</span> {line.name}
                        </p>
                        {line.extrasLabel && (
                          <p className="text-xs text-text-muted mt-2 break-words">+ {line.extrasLabel}</p>
                        )}
                        <p className="text-xs text-text-muted mt-2">@{formatRp(line.unitPrice)}</p>
                      </div>
                      <span className="text-base font-bold cg-num shrink-0">{formatRp(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="bg-surface-raised border border-border rounded-xl p-16 tablet:p-24 grid gap-16 min-w-0" aria-labelledby="cd-summary-title">
              <div className="flex items-center justify-between gap-8">
                <h2 id="cd-summary-title" className="text-lg font-bold">Ringkasan</h2>
                {snap.customerName && (
                  <span className="cg-badge cg-badge--accent inline-flex items-center gap-4">
                    <UserRound className="cg-icon cg-icon--sm" aria-hidden />
                    <span>{snap.customerName}</span>
                  </span>
                )}
              </div>

              {snap.phase === 'paying' && (
                <div className="p-12 rounded-lg bg-warning-soft text-warning-strong grid gap-4" role="status">
                  <div className="flex items-center gap-8 font-bold text-sm">
                    <CreditCard className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                    <span>Menunggu Pembayaran</span>
                  </div>
                  <p className="text-xs">
                    {snap.paymentMethod ? `Metode: ${snap.paymentMethod}` : 'Kasir sedang memilih metode pembayaran'}
                  </p>
                </div>
              )}

              <dl className="grid gap-8 text-sm">
                <div className="flex justify-between gap-12">
                  <dt className="text-text-muted">Subtotal</dt>
                  <dd className="cg-num font-medium">{formatRp(snap.subtotal)}</dd>
                </div>
                {snap.discountTotal > 0 && (
                  <div className="flex justify-between gap-12 text-success-strong">
                    <dt>Potongan / Promo</dt>
                    <dd className="cg-num font-medium">-{formatRp(snap.discountTotal)}</dd>
                  </div>
                )}
                {snap.serviceCharge > 0 && (
                  <div className="flex justify-between gap-12">
                    <dt className="text-text-muted">Biaya layanan</dt>
                    <dd className="cg-num font-medium">{formatRp(snap.serviceCharge)}</dd>
                  </div>
                )}
                {snap.taxTotal > 0 && (
                  <div className="flex justify-between gap-12">
                    <dt className="text-text-muted">Pajak</dt>
                    <dd className="cg-num font-medium">{formatRp(snap.taxTotal)}</dd>
                  </div>
                )}
                {snap.rounding !== 0 && (
                  <div className="flex justify-between gap-12">
                    <dt className="text-text-muted">Pembulatan</dt>
                    <dd className="cg-num font-medium">{snap.rounding > 0 ? `+${formatRp(snap.rounding)}` : `-${formatRp(-snap.rounding)}`}</dd>
                  </div>
                )}
              </dl>

              <div className="p-16 rounded-lg bg-accent-soft text-accent-strong grid gap-4">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {snap.phase === 'paying' && snap.paidTotal ? 'Sisa Tagihan' : 'Total Bayar'}
                </span>
                <strong className="text-2xl font-bold cg-num" data-testid="cd-total">
                  {formatRp(snap.phase === 'paying' && snap.remainingDue !== undefined ? snap.remainingDue : snap.total)}
                </strong>
                {snap.phase === 'paying' && (snap.paidTotal ?? 0) > 0 && (
                  <span className="text-xs">Sudah dibayar {formatRp(snap.paidTotal!)} dari {formatRp(snap.total)}</span>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}


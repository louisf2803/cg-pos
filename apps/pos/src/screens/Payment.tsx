import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Printer, CheckCircle2, CreditCard, Landmark, QrCode } from 'lucide-react';
import { DataError, PAYMENT_REF_MAX, formatRp, newId, orderTypeLabel, parseRp, paymentRefField, paymentRefProblem, quickCashAmounts, roundToStep, type Order, type OutletContext, type PaymentMethod } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { publishCustomerDisplay } from '../lib/customer-display';
import { ReceiptDialog } from './Receipt';
import { useAsync } from '../lib/use-async';
import { ApproverFields, useApprover } from '../lib/approver';
import { useSession } from '../lib/session';
import { forwardNotice, forwardOrder } from '../lib/stations';
import { TicketStrip } from './TicketHost';

const ICON: Record<PaymentMethod['kind'], typeof Banknote> = { cash: Banknote, noncash: CreditCard, gateway: QrCode, complimentary: Landmark, deposit: Landmark };

export function Payment({ order, ctx, onBack, onDone, skipForward = false }: { order: Order; ctx: OutletContext; onBack: () => void; onDone: () => void; /** bagian pisah bayar: barisnya sudah diteruskan lewat pesanan asal */ skipForward?: boolean }) {
  const data = useData();
  const methods = useAsync(() => data.listPaymentMethods(), [data]);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const [reference, setReference] = useState('');
  const approver = useApprover('complimentary', { allowCode: true, orderId: order.id });
  const { session } = useSession();
  const [current, setCurrent] = useState<Order>(order);
  const [partial, setPartial] = useState<Order | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [fwd, setFwd] = useState('');
  const [printing, setPrinting] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  // satu id per upaya bayar: ketuk dua kali tidak menggandakan pembayaran (kontrak idempoten dengan server)
  const attemptId = useRef(newId());

  const list = methods.status === 'ready' ? methods.data : [];
  const method = list.find((m) => m.id === methodId) ?? null;
  const cashFirst = useMemo(() => [...list].sort((a, b) => Number(b.kind === 'cash') - Number(a.kind === 'cash')), [list]);

  const step = !method ? 0 : method.kind === 'cash' ? ctx.settings.roundingCashStep : ctx.settings.roundingNoncashStep;
  const target = current.paidTotal === 0 && step ? roundToStep(current.total, step) : current.total;
  const due = target - current.paidTotal;
  const rounding = target - current.total;
  const isCash = method?.kind === 'cash';
  const refField = method ? paymentRefField(method.kind) : null;
  // jumlah yang dibayar dengan metode ini (boleh kurang dari sisa: bayar campuran)
  const amount = amountRaw === '' ? due : parseRp(amountRaw);
  const tendered = raw === '' ? amount : parseRp(raw);
  const shortfall = Math.max(amount - tendered, 0);
  const change = Math.max(tendered - amount, 0);

  useEffect(() => {
    const activeOrder = done ?? current;
    const lines = activeOrder.items.map((item) => ({
      id: item.id,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      ...(item.extras?.length ? { extrasLabel: item.extras.map((e) => e.name).join(', ') } : {}),
      lineTotal: item.lineTotal,
    }));
    const lastPay = done ? done.payments[done.payments.length - 1] : undefined;
    publishCustomerDisplay({
      version: 1,
      outletName: ctx.outletName,
      outletAddress: ctx.address,
      cashierName: session.employee.name,
      phase: done ? 'paid' : 'paying',
      orderNumber: activeOrder.number,
      orderTypeLabel: orderTypeLabel(activeOrder.type),
      customerName: activeOrder.customerName ?? activeOrder.label,
      lines,
      subtotal: activeOrder.subtotal,
      discountTotal: activeOrder.discountTotal,
      serviceCharge: activeOrder.serviceCharge,
      taxTotal: activeOrder.taxTotal,
      rounding: done ? done.rounding : rounding,
      total: done ? done.total : target,
      paidTotal: activeOrder.paidTotal,
      remainingDue: done ? 0 : due,
      paymentMethod: done ? done.payments.map((x) => x.methodName).join(' + ') : method?.name,
      ...(lastPay?.tendered !== undefined ? { tendered: lastPay.tendered } : {}),
      ...(lastPay ? { change: lastPay.change } : {}),
      welcomeMessage: ctx.receiptHeader,
      updatedAt: new Date().toISOString(),
    });
  }, [ctx, session.employee.name, done, current, rounding, target, due, method]);

  async function confirm() {
    if (!method) return;
    if (!/\d/.test(amountRaw) && amountRaw !== '') { setErr('Isi jumlah dalam rupiah.'); return; }
    if (amount <= 0) { setErr('Jumlah bayar harus lebih dari 0.'); return; }
    if (amount > due) { setErr(`Jumlah melebihi sisa tagihan ${formatRp(due)}.`); return; }
    if (isCash && tendered < amount) { setErr(`Uang diterima kurang ${formatRp(amount - tendered)}.`); return; }
    const refProblem = paymentRefProblem(method.kind, reference);
    if (refProblem) { setErr(refProblem); return; }
    setBusy(true); setErr('');
    try {
      let ref = reference.trim() || undefined;
      if (method.kind === 'complimentary') {
        // gratis butuh persetujuan manajer/pemilik; namanya ikut dicatat supaya bisa ditelusuri di laporan
        const approvedBy = await approver.authorizeWith();
        if (!approvedBy) { setErr(approver.mode === 'deny' ? 'Peran kamu tidak boleh memberi gratis. Minta manajer atau pemilik.' : approver.usingCode ? 'Persetujuan gagal: kode salah, sudah dipakai, atau kedaluwarsa.' : 'Persetujuan gagal: PIN salah.'); return; }
        const name = approvedBy.method === 'code' ? 'dengan kode otorisasi' : approver.approvers.find((x) => x.id === approvedBy.id)?.name ?? session.employee.name;
        ref = `${reference.trim()} · disetujui ${name}`.slice(0, PAYMENT_REF_MAX);
      }
      const res = await data.addPayment(order.id, { id: attemptId.current, methodId: method.id, amount, tendered: isCash ? tendered : undefined, reference: ref });
      if (res.status === 'paid') {
        setDone(res);
        if (!skipForward) void forwardOrder({ data, ctx, order: res, cashierName: session.employee.name }).then((r) => setFwd(forwardNotice(r)));
      }
      else { setPartial(res); setCurrent(res); setMethodId(null); setRaw(''); setAmountRaw(''); setReference(''); attemptId.current = newId(); }
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
          <p className="text-text-muted">{done.number} · {done.payments.map((x) => x.methodName).join(' + ')}</p>
          {p && p.kind === 'cash' && (
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <p className="text-text-muted text-sm">Kembalian</p>
              <p className="cg-money-lg">{formatRp(p.change)}</p>
            </div>
          )}
          {fwd && <p className="text-sm text-text-muted" data-testid="forward-notice">{fwd}</p>}
          <TicketStrip className="justify-center" />
          <div className="cg-totals" style={{ padding: 0 }}>
            <div className="cg-totals__row"><span>Total</span><span className="cg-num">{formatRp(done.total)}</span></div>
            {done.rounding !== 0 && <div className="cg-totals__row"><span>Termasuk pembulatan</span><span className="cg-num">{formatRp(done.rounding)}</span></div>}
          </div>
          <button className="cg-btn cg-btn--secondary cg-btn--lg cg-btn--block" onClick={() => setPrinting(true)}><Printer className="cg-icon" aria-hidden /> Cetak struk</button>
          <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" autoFocus onClick={onDone}>Pesanan baru</button>
          {printing && <ReceiptDialog order={done} ctx={ctx} kind="receipt" onClose={() => setPrinting(false)} />}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full flex flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center gap-12 px-16 h-[var(--layout-pos-header,56px)] border-b border-border bg-surface-raised shrink-0">
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="cg-icon" aria-hidden /> Kembali ke pesanan
        </button>
        <strong className="ml-auto font-mono text-sm">{order.number}</strong>
      </header>

      {/* 4 & 5. Baris Atas: 3 Angka Sebaris & Baris Aksi */}
      <div className="p-16 border-b border-border bg-surface shrink-0 grid gap-12">
        <div className="grid grid-cols-3 gap-8 p-12 rounded-xl bg-surface-raised border border-border">
          <div className="text-center">
            <span className="text-xs text-text-muted font-medium">Total tagihan</span>
            <p className="text-base tablet:text-xl font-bold text-text tabular-nums mt-2">{formatRp(target)}</p>
          </div>
          <div className="text-center border-x border-border px-8">
            <span className="text-xs text-text-muted font-medium">Sisa tagihan</span>
            <p className={`text-base tablet:text-xl font-bold tabular-nums mt-2 ${due > 0 ? 'text-danger-strong' : 'text-text'}`}>
              {formatRp(due)}
            </p>
          </div>
          <div className="text-center">
            <span className="text-xs text-text-muted font-medium">Kembalian</span>
            <p className="text-base tablet:text-xl font-bold text-info tabular-nums mt-2">{formatRp(change)}</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button
            type="button"
            className={`cg-chip ${isSplit ? 'cg-chip--active' : ''}`}
            onClick={() => setIsSplit(!isSplit)}
            title="Bayar dengan beberapa cara / jumlah terpisah"
          >
            Pisah bayar
          </button>
          <button
            type="button"
            className="cg-chip opacity-50 cursor-not-allowed"
            disabled
            title="Catatan segera hadir"
          >
            Catatan (segera)
          </button>
        </div>
      </div>

      {/* Konten 3 Kolom di Desktop (Kiri: Metode, Tengah: Nominal/Input, Kanan: Ringkasan Pesanan) */}
      <div className="flex-1 grid grid-cols-1 desktop:grid-cols-[220px_1fr_320px] tablet:grid-cols-[200px_1fr] divide-y tablet:divide-y-0 tablet:divide-x divide-border overflow-y-auto">
        {/* 6. KIRI: Rel Metode */}
        <section className="p-16 grid gap-12 content-start bg-surface/50" aria-labelledby="h-metode">
          <h2 id="h-metode" className="text-xs font-bold text-text-muted uppercase tracking-wider">Metode Bayar</h2>
          <div className="cg-methods flex flex-col gap-8" role="radiogroup" aria-label="Metode pembayaran">
            {cashFirst.map((m) => {
              const Icon = ICON[m.kind];
              const off = m.kind === 'gateway';
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={methodId === m.id}
                  aria-disabled={off}
                  className={`cg-method flex items-center justify-between p-12 rounded-lg border text-left font-medium transition-colors ${
                    methodId === m.id ? 'border-accent bg-accent/10 text-accent font-bold' : 'border-border bg-surface-raised hover:bg-surface'
                  } ${off ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => {
                    if (off) return;
                    setMethodId(m.id);
                    setRaw('');
                    setAmountRaw('');
                    setReference('');
                    setErr('');
                    attemptId.current = newId();
                  }}
                >
                  <span className="flex items-center gap-8 min-w-0">
                    <Icon className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                    <span className="truncate">{m.name}</span>
                  </span>
                  {off && <small className="text-[10px] text-text-muted">Segera hadir</small>}
                </button>
              );
            })}
          </div>
        </section>

        {/* TENGAH: Nominal Cepat & Input Uang */}
        <section className="p-16 grid gap-16 content-start bg-surface-raised" aria-labelledby="h-input-bayar">
          <h2 id="h-input-bayar" className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {method ? `Pembayaran: ${method.name}` : 'Pilih Cara Bayar'}
          </h2>

          {partial && !method && (
            <div className="cg-banner cg-banner--info" role="status">
              <span>Pembayaran tercatat. Pilih cara bayar lain untuk sisa {formatRp(due)}.</span>
            </div>
          )}
          {!method && !partial && (
            <div className="cg-banner cg-banner--info">
              <span>Pilih salah satu metode pembayaran untuk melanjutkan.</span>
            </div>
          )}

          {method && isSplit && (
            <div className="cg-field">
              <label className="cg-label font-semibold text-xs" htmlFor="jumlah">
                Jumlah dibayar dengan {method.name} (Rp)
              </label>
              <input
                id="jumlah"
                className="cg-input"
                inputMode="numeric"
                value={amountRaw}
                placeholder={String(due)}
                onChange={(e) => {
                  setAmountRaw(e.target.value);
                  setErr('');
                }}
              />
              {due > 0 && amount > 0 && amount < due && (
                <p className="text-text-muted text-xs mt-2">Sisa {formatRp(due - amount)} dibayar dengan cara lain.</p>
              )}
            </div>
          )}

          {method && isCash && (
            <div className="space-y-12">
              {/* Nominal Cepat */}
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-8">
                  Pilihan Nominal Cepat
                </span>
                <div className="flex flex-wrap gap-8" role="group" aria-label="Nominal cepat">
                  {quickCashAmounts(amount).map((a, i) => (
                    <button
                      key={a}
                      type="button"
                      className={`cg-chip ${tendered === a && raw !== '' ? 'cg-chip--active' : ''}`}
                      aria-pressed={tendered === a && raw !== ''}
                      onClick={() => {
                        setRaw(String(a));
                        setShowCustomInput(false);
                        setErr('');
                      }}
                    >
                      {i === 0 ? `Uang pas ${formatRp(a)}` : formatRp(a)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`cg-chip ${showCustomInput ? 'cg-chip--active' : ''}`}
                    onClick={() => setShowCustomInput(true)}
                  >
                    Lainnya
                  </button>
                </div>
              </div>

              {/* Input Uang Diterima */}
              <div className="cg-field">
                <label className="cg-label font-semibold text-xs" htmlFor="diterima">
                  Uang diterima (Rp)
                </label>
                <input
                  id="diterima"
                  className="cg-input"
                  inputMode="numeric"
                  autoFocus
                  value={raw}
                  placeholder={String(amount)}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setErr('');
                  }}
                  aria-invalid={!!err}
                  aria-describedby={err ? 'e-bayar' : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirm();
                    }
                  }}
                />
              </div>

              <div className="border border-border rounded-lg bg-surface p-12" aria-live="polite">
                {shortfall > 0 ? (
                  <div>
                    <p className="text-text-muted text-xs">Uang diterima masih kurang</p>
                    <p className="text-lg cg-num font-bold text-danger-strong">{formatRp(shortfall)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-text-muted text-xs">Kembalian</p>
                    <p className="text-lg cg-num font-bold text-info">{formatRp(change)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {method && !isCash && method.kind !== 'complimentary' && (
            <div className="cg-banner cg-banner--info">
              <span>Selesaikan pembayaran di perangkat {method.name}, lalu catat di sini sebesar {formatRp(amount)}.</span>
            </div>
          )}

          {method && method.kind === 'complimentary' && (
            <div className="cg-banner cg-banner--warning">
              <span>Pesanan ini tidak ditagih. Alasan wajib diisi dan tercatat di laporan.</span>
            </div>
          )}

          {method && refField && (
            <div className="cg-field">
              <label className="cg-label font-semibold text-xs" htmlFor="referensi">
                {refField.label}{refField.required ? '' : ' (boleh kosong)'}
              </label>
              <input
                id="referensi"
                className="cg-input"
                value={reference}
                maxLength={PAYMENT_REF_MAX}
                placeholder={refField.hint}
                onChange={(e) => {
                  setReference(e.target.value);
                  setErr('');
                }}
                aria-required={refField.required}
                aria-invalid={!!err && refField.required}
                aria-describedby={err ? 'e-bayar' : undefined}
              />
            </div>
          )}

          {method && method.kind === 'complimentary' && (
            <ApproverFields a={approver} idPrefix="komplimen" what="pembayaran gratis" />
          )}

          {err && (
            <p id="e-bayar" role="alert" className="cg-error">
              {err}
            </p>
          )}
        </section>

        {/* 7. KANAN: Ringkasan Pesanan & Batang Terima Pembayaran */}
        <section className="p-16 flex flex-col justify-between bg-surface/30 min-w-0" aria-labelledby="h-ringkasan">
          <div>
            <h2 id="h-ringkasan" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-12">
              Ringkasan Pesanan
            </h2>

            {/* Informasi Pelanggan & Nomor */}
            <div className="p-10 rounded-lg bg-surface border border-border space-y-4 mb-12 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Pelanggan:</span>
                <span className="font-bold text-text truncate max-w-[160px]">
                  {order.customerName || 'Tanpa pelanggan'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Nomor Pesanan:</span>
                <span className="font-mono font-semibold text-text">{order.number}</span>
              </div>
            </div>

            {/* Daftar Baris Pesanan */}
            <details className="mb-12 border border-border rounded-lg bg-surface text-xs" open>
              <summary className="p-8 font-semibold cursor-pointer select-none text-text">
                Rincian Item ({order.items.length})
              </summary>
              <div className="p-8 pt-0 max-h-[220px] overflow-y-auto divide-y divide-border/50">
                {order.items.map((it) => (
                  <div key={it.id} className="py-6 flex justify-between gap-8">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text truncate">{it.qty}x {it.name}</p>
                      {it.extras?.length ? (
                        <p className="text-[10px] text-text-muted">{it.extras.map((e) => e.name).join(', ')}</p>
                      ) : null}
                    </div>
                    <span className="tabular-nums font-semibold shrink-0 text-text">
                      {formatRp(it.qty * it.unitPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {/* Totals */}
            <div className="space-y-4 text-xs py-8 border-t border-border">
              <div className="flex justify-between text-text-muted">
                <span>Subtotal</span>
                <span className="tabular-nums text-text font-medium">{formatRp(order.subtotal)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-danger-strong">
                  <span>Potongan</span>
                  <span className="tabular-nums font-medium">-{formatRp(order.discountTotal)}</span>
                </div>
              )}
              {order.taxTotal > 0 && (
                <div className="flex justify-between text-text-muted">
                  <span>Pajak</span>
                  <span className="tabular-nums text-text font-medium">{formatRp(order.taxTotal)}</span>
                </div>
              )}
              {rounding !== 0 && (
                <div className="flex justify-between text-text-muted">
                  <span>Pembulatan</span>
                  <span className="tabular-nums text-text font-medium">{rounding > 0 ? '+' : ''}{formatRp(rounding)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-text pt-6 border-t border-border">
                <span>Total Tagihan</span>
                <span className="tabular-nums">{formatRp(target)}</span>
              </div>
            </div>
          </div>

          {/* Batang Terima Pembayaran di Dasar */}
          <div className="pt-16 border-t border-border mt-auto">
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block h-[48px] font-bold text-sm"
              disabled={!method || busy || due <= 0 || amount <= 0 || (isCash && tendered < amount)}
              aria-busy={busy}
              onClick={() => void confirm()}
            >
              {busy
                ? 'Memproses…'
                : method
                ? `Terima ${formatRp(isCash ? Math.max(tendered, 0) : amount)}`
                : 'Pilih cara bayar dulu'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

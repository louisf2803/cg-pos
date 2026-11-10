import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Printer, CheckCircle2, CreditCard, Landmark, QrCode } from 'lucide-react';
import { DataError, PAYMENT_REF_MAX, formatRp, newId, parseRp, paymentRefField, paymentRefProblem, quickCashAmounts, roundToStep, type Order, type OutletContext, type PaymentMethod } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { ReceiptDialog } from './Receipt';
import { useAsync } from '../lib/use-async';
import { ApproverFields, useApprover } from '../lib/approver';
import { useSession } from '../lib/session';

const ICON: Record<PaymentMethod['kind'], typeof Banknote> = { cash: Banknote, noncash: CreditCard, gateway: QrCode, complimentary: Landmark, deposit: Landmark };

export function Payment({ order, ctx, onBack, onDone }: { order: Order; ctx: OutletContext; onBack: () => void; onDone: () => void }) {
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
  const [printing, setPrinting] = useState(false);
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
      if (res.status === 'paid') setDone(res);
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
                onClick={() => { if (off) return; setMethodId(m.id); setRaw(''); setAmountRaw(''); setReference(''); setErr(''); attemptId.current = newId(); }}>
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
          <p className="text-text-muted text-sm">{current.paidTotal > 0 ? 'Sisa tagihan' : 'Total tagihan'}</p>
          <p className="cg-money-lg">{formatRp(method ? due : current.total - current.paidTotal)}</p>
          {method && rounding !== 0 && <p className="text-text-muted text-sm">Sudah termasuk pembulatan {rounding > 0 ? '+' : ''}{formatRp(rounding)}</p>}
        </div>

        {current.payments.length > 0 && (
          <ul className="grid gap-4 text-sm" aria-label="Pembayaran yang sudah dicatat">
            {current.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{p.methodName}</span><span className="cg-num">{formatRp(p.amount)}</span></li>)}
          </ul>
        )}
        {partial && !method && <div className="cg-banner cg-banner--info" role="status"><span>Pembayaran tercatat. Pilih cara bayar lain untuk sisa {formatRp(partial.total - partial.paidTotal)}.</span></div>}
        {!method && !partial && <div className="cg-banner cg-banner--info"><span>Pilih cara bayar di sebelah kiri atau di atas. Bisa dibayar dengan beberapa cara.</span></div>}

        {method && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="jumlah">Jumlah dibayar dengan {method.name} (Rp)</label>
            <input id="jumlah" className="cg-input" inputMode="numeric" value={amountRaw} placeholder={String(due)}
              onChange={(e) => { setAmountRaw(e.target.value); setErr(''); }} />
            {due > 0 && amount > 0 && amount < due && <p className="text-text-muted text-sm">Sisa {formatRp(due - amount)} dibayar dengan cara lain.</p>}
          </div>
        )}

        {method && isCash && (
          <>
            <div className="cg-field">
              <label className="cg-label" htmlFor="diterima">Uang diterima (Rp)</label>
              <input id="diterima" className="cg-input" inputMode="numeric" autoFocus value={raw} placeholder={String(amount)}
                onChange={(e) => { setRaw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'e-bayar' : undefined}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirm(); } }} />
            </div>
            <div className="flex flex-wrap gap-8" role="group" aria-label="Nominal cepat">
              {quickCashAmounts(amount).map((a, i) => (
                <button key={a} className="cg-chip" aria-pressed={tendered === a && raw !== ''} onClick={() => { setRaw(String(a)); setErr(''); }}>{i === 0 ? `Uang pas ${formatRp(a)}` : formatRp(a)}</button>
              ))}
            </div>
            <div className="border border-border rounded-lg bg-surface p-16" aria-live="polite">
              {shortfall > 0
                ? <><p className="text-text-muted text-sm">Masih kurang</p><p className="text-xl cg-num text-danger-strong">{formatRp(shortfall)}</p></>
                : <><p className="text-text-muted text-sm">Kembalian</p><p className="text-xl cg-num">{formatRp(change)}</p></>}
            </div>
          </>
        )}

        {method && !isCash && method.kind !== 'complimentary' && (
          <div className="cg-banner cg-banner--info"><span>Selesaikan pembayaran di perangkat {method.name}, lalu catat di sini sebesar {formatRp(amount)}.</span></div>
        )}
        {method && method.kind === 'complimentary' && (
          <div className="cg-banner cg-banner--warning"><span>Pesanan ini tidak ditagih. Alasan wajib diisi dan tercatat di laporan.</span></div>
        )}
        {method && refField && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="referensi">{refField.label}{refField.required ? '' : ' (boleh kosong)'}</label>
            <input id="referensi" className="cg-input" value={reference} maxLength={PAYMENT_REF_MAX} placeholder={refField.hint}
              onChange={(e) => { setReference(e.target.value); setErr(''); }} aria-required={refField.required}
              aria-invalid={!!err && refField.required} aria-describedby={err ? 'e-bayar' : undefined} />
          </div>
        )}
        {method && method.kind === 'complimentary' && <ApproverFields a={approver} idPrefix="komplimen" what="pembayaran gratis" />}

        {err && <p id="e-bayar" role="alert" className="cg-error">{err}</p>}
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" disabled={!method || busy || due <= 0 || amount <= 0} aria-busy={busy} onClick={() => void confirm()}>
          {busy ? 'Memproses…' : method ? `Terima ${formatRp(isCash ? Math.max(tendered, 0) : amount)}` : 'Pilih cara bayar dulu'}
        </button>
      </section>
    </main>
  );
}

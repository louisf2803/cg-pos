import { useEffect, useState } from 'react';
import { Bluetooth, Printer } from 'lucide-react';
import { canPrintAgain, formatRp, orderTypeLabel, receiptBytes, resolveReceiptTemplate, taxDisplay, testPageBytes, type Order, type OutletContext } from '@cgpos/shared';
import { bluetoothSupported, connectPrinter, disconnectPrinter, printBytes, reconnectPrinter, setOpenDrawer, usePrinter } from '../lib/printer';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

type Paper = '58' | '80';
const KEY = 'cgpos.paper';
const readPaper = (): Paper => { try { return localStorage.getItem(KEY) === '58' ? '58' : '80'; } catch { return '80'; } };

const PKEY = (id: string) => `cgpos.prints.${id}`;
const readPrints = (id: string): number => { try { return Number(localStorage.getItem(PKEY(id))) || 0; } catch { return 0; } };
const writePrints = (id: string, n: number) => { try { localStorage.setItem(PKEY(id), String(n)); } catch { /* penyimpanan boleh gagal */ } };

const fmt = (iso: string, tz: string) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Isi struk atau tagihan sementara. Lebar mengikuti kertas; dicetak lewat dialog cetak peramban (printer thermal bawaan sistem). */
export function ReceiptBody({ order, ctx, cashierName, kind, paper, points }: { order: Order; ctx: OutletContext; cashierName: string; kind: 'receipt' | 'bill'; paper: Paper; points?: { earned: number; balance: number } }) {
  const last = order.payments[order.payments.length - 1];
  const d = taxDisplay(order);
  const tpl = resolveReceiptTemplate(ctx);
  return (
    <div className={`receipt receipt--${paper} receipt--${tpl.theme}`} data-testid="receipt">
      <header className="receipt__center">
        {tpl.showOutletName && <strong>{ctx.outletName}</strong>}
        {tpl.showAddress && ctx.address && <div>{ctx.address}</div>}
        {tpl.showPhone && ctx.phone && <div>{ctx.phone}</div>}
        {ctx.receiptHeader && ctx.receiptHeader.split('\n').filter((l) => l.trim()).map((l, i) => <div key={i}>{l.trim()}</div>)}
      </header>
      <hr />
      <div className="receipt__row"><span>{kind === 'bill' ? 'TAGIHAN (belum lunas)' : 'STRUK'}</span><span>{tpl.showOrderType ? orderTypeLabel(order.type) : ''}</span></div>
      {tpl.showOrderNo && <div>{order.number}</div>}
      {order.customerName && tpl.showCustomer && <div>Pelanggan: {order.customerName}</div>}
      {((tpl.showTable && order.label) || (tpl.showGuests && order.guestCount)) && <div>{[tpl.showTable ? order.label : '', tpl.showGuests && order.guestCount ? `${order.guestCount} tamu` : ''].filter(Boolean).join(' · ')}</div>}
      {tpl.showTime && <div>{fmt(order.closedAt ?? order.openedAt, ctx.timezone)}</div>}
      {tpl.showCashier && <div>Kasir: {cashierName}</div>}
      <hr />
      {order.items.map((i) => (
        <div key={i.id} className="receipt__item">
          <div>{i.name}</div>
          <div className="receipt__row"><span>{tpl.showUnitPrice ? `${i.qty} × ${formatRp(i.unitPrice)}` : `${i.qty} ×`}</span><span>{formatRp(i.qty * i.unitPrice)}</span></div>
          {tpl.showExtras && i.extras?.map((e) => <div key={e.optionId} className="receipt__row"><span>+ {e.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><span>{e.price > 0 ? formatRp(e.price * i.qty) : ''}</span></div>)}
          {tpl.showNotes && i.note && <div className="receipt__note">{i.note}</div>}
        </div>
      ))}
      <hr />
      <div className="receipt__row"><span>Subtotal</span><span>{formatRp(d.subtotal)}</span></div>
      {d.discount > 0 && <div className="receipt__row"><span>Potongan</span><span>-{formatRp(d.discount)}</span></div>}
      {order.serviceCharge > 0 && <div className="receipt__row"><span>Biaya layanan</span><span>{formatRp(order.serviceCharge)}</span></div>}
      {d.tax > 0 && !d.inclusive && <div className="receipt__row"><span>Pajak</span><span>{formatRp(d.tax)}</span></div>}
      {order.rounding !== 0 && <div className="receipt__row"><span>Pembulatan</span><span>{formatRp(order.rounding)}</span></div>}
      <div className="receipt__row receipt__total"><span>TOTAL</span><span>{formatRp(order.total)}</span></div>
      {d.inclusive && <div className="receipt__row"><span>Sudah termasuk pajak</span><span>{formatRp(d.tax)}</span></div>}
      {kind === 'receipt' && points && points.earned > 0 && <div className="receipt__row"><span>Poin didapat (saldo {points.balance})</span><span>+{points.earned}</span></div>}
      {kind === 'receipt' && (
        <>
          <hr />
          {order.payments.map((p) => <div key={p.id} className="receipt__row"><span>{p.methodName}</span><span>{formatRp(p.amount)}</span></div>)}
          {last && last.kind === 'cash' && last.change > 0 && <div className="receipt__row"><span>Kembalian</span><span>{formatRp(last.change)}</span></div>}
        </>
      )}
      {kind === 'bill' && order.paidTotal > 0 && (
        <>
          <div className="receipt__row"><span>Sudah dibayar</span><span>{formatRp(order.paidTotal)}</span></div>
          <div className="receipt__row"><span>Sisa</span><span>{formatRp(order.total - order.paidTotal)}</span></div>
        </>
      )}
      {(ctx.receiptFooter || tpl.showPrintTime) && <hr />}
      {ctx.receiptFooter && <div className="receipt__center">{ctx.receiptFooter}</div>}
      {tpl.showPrintTime && <div className="receipt__center">dicetak {fmt(new Date().toISOString(), ctx.timezone)}</div>}
    </div>
  );
}

export function ReceiptDialog({ order, ctx, kind, onClose }: { order: Order; ctx: OutletContext; kind: 'receipt' | 'bill'; onClose: () => void }) {
  const data = useData();
  const emp = useAsync(() => data.listManagedEmployees(), [data]);
  // Poin hanya info tambahan: bila gagal dimuat (offline), struk tetap tampil tanpa baris poin.
  const [pts, setPts] = useState<{ earned: number; balance: number }>();
  useEffect(() => {
    if (!order.customerId || order.status !== 'paid') return;
    let live = true;
    Promise.all([data.listLoyaltyLedger(order.customerId, 50), data.getCustomer(order.customerId)])
      .then(([led, c]) => { if (live && c) setPts({ earned: led.filter((e) => e.orderId === order.id && e.kind === 'earn').reduce((n, e) => n + e.points, 0), balance: c.pointsBalance }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [data, order.id, order.customerId, order.status]);
  const [paper, setPaper] = useState<Paper>(readPaper);
  const name = emp.status === 'ready' ? emp.data.find((e) => e.id === order.cashierId)?.name ?? '-' : '…';
  const pr = usePrinter();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { void reconnectPrinter(); }, []);
  async function send(make: () => Uint8Array) {
    setSending(true); setMsg('');
    try { await printBytes(make()); setMsg('Terkirim ke printer.'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal mencetak.'); } finally { setSending(false); }
  }
  // Batas cetak ulang struk per transaksi (setelan outlet): dihitung per perangkat, hanya untuk struk lunas.
  const limit = kind === 'receipt' ? resolveReceiptTemplate(ctx).maxPrints : 0;
  const [printed, setPrinted] = useState(() => readPrints(order.id));
  const allowed = canPrintAgain(printed, limit);
  const counted = () => { const n = printed + 1; setPrinted(n); writePrints(order.id, n); };
  const choose = (p: Paper) => { setPaper(p); try { localStorage.setItem(KEY, p); } catch { /* penyimpanan boleh gagal */ } };
  return (
    <Modal title={kind === 'bill' ? 'Cetak tagihan' : 'Cetak struk'} onClose={onClose}>
      <div className="cg-tabs mb-12" role="tablist" aria-label="Lebar kertas">
        {(['58', '80'] as const).map((p) => <button key={p} role="tab" className="cg-tab" aria-selected={paper === p} onClick={() => choose(p)}>Kertas {p} mm</button>)}
      </div>
      <div className="receipt-preview"><div className="receipt-print"><ReceiptBody order={order} ctx={ctx} cashierName={name} kind={kind} paper={paper} points={pts} /></div></div>
      <section aria-labelledby="h-bt" className="mt-12 grid gap-8">
        <h3 id="h-bt" className="text-base">Printer Bluetooth</h3>
        {!bluetoothSupported() ? (
          <p className="text-text-muted text-sm">Peramban ini belum bisa mengirim langsung ke printer Bluetooth (butuh Chrome atau Edge di Android, Windows, atau Mac; iPhone/iPad belum bisa). Pakai tombol Cetak di bawah.</p>
        ) : (
          <>
            <p className="text-sm" role="status">{pr.status === 'connected' ? `Tersambung: ${pr.name}` : pr.status === 'connecting' ? 'Menyambung…' : pr.name ? `Belum tersambung (terakhir: ${pr.name})` : 'Belum ada printer tersambung'}</p>
            <div className="flex flex-wrap gap-8">
              {pr.status === 'connected'
                ? <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={disconnectPrinter}>Putuskan</button>
                : <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => void connectPrinter()} disabled={pr.status === 'connecting'}><Bluetooth className="cg-icon cg-icon--sm" aria-hidden /> Hubungkan printer</button>}
              <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={pr.status !== 'connected' || sending} onClick={() => void send(() => testPageBytes(paper, ctx.outletName, false))}>Tes cetak</button>
            </div>
            <label className="flex items-center gap-8 text-sm"><input type="checkbox" checked={pr.openDrawer} onChange={(e) => setOpenDrawer(e.target.checked)} /> Buka laci kas setelah mencetak struk</label>
            {(pr.error || msg) && <p role="alert" className={pr.error ? 'cg-error' : 'text-sm text-text-muted'}>{pr.error || msg}</p>}
          </>
        )}
      </section>
      {limit > 0 && <p className={`text-sm mt-8 ${allowed ? 'text-text-muted' : 'cg-error'}`} role="status" data-testid="print-limit">{allowed ? `Batas cetak struk ini ${limit} kali; sudah dicetak ${printed} kali.` : `Batas cetak ${limit} kali sudah tercapai untuk struk ini.`}</p>}
      <p className="text-text-muted text-sm mt-8">Tanpa printer Bluetooth: pilih printer di dialog cetak peramban, lebar kertas dan margin 0.</p>
      <div className="cg-modal__actions">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button>
        <button className={`cg-btn ${pr.status === 'connected' ? 'cg-btn--secondary' : 'cg-btn--primary'}`} disabled={!allowed} onClick={() => { counted(); window.print(); }}><Printer className="cg-icon cg-icon--sm" aria-hidden /> Cetak (peramban)</button>
        {pr.status === 'connected' && <button className="cg-btn cg-btn--primary" data-autofocus disabled={sending || !allowed} onClick={() => { counted(); void send(() => receiptBytes({ order, ctx, cashierName: name, kind, paper, openDrawer: pr.openDrawer && kind === 'receipt' })); }}><Bluetooth className="cg-icon cg-icon--sm" aria-hidden /> {sending ? 'Mengirim…' : 'Cetak Bluetooth'}</button>}
      </div>
    </Modal>
  );
}

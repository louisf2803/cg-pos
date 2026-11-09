import { useState } from 'react';
import { Printer } from 'lucide-react';
import { formatRp, orderTypeLabel, type Order, type OutletContext } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

type Paper = '58' | '80';
const KEY = 'cgpos.paper';
const readPaper = (): Paper => { try { return localStorage.getItem(KEY) === '58' ? '58' : '80'; } catch { return '80'; } };

const fmt = (iso: string, tz: string) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Isi struk atau tagihan sementara. Lebar mengikuti kertas; dicetak lewat dialog cetak peramban (printer thermal bawaan sistem). */
export function ReceiptBody({ order, ctx, cashierName, kind, paper }: { order: Order; ctx: OutletContext; cashierName: string; kind: 'receipt' | 'bill'; paper: Paper }) {
  const last = order.payments[order.payments.length - 1];
  return (
    <div className={`receipt receipt--${paper}`} data-testid="receipt">
      <header className="receipt__center">
        <strong>{ctx.outletName}</strong>
        {ctx.address && <div>{ctx.address}</div>}
        {ctx.phone && <div>{ctx.phone}</div>}
      </header>
      <hr />
      <div className="receipt__row"><span>{kind === 'bill' ? 'TAGIHAN (belum lunas)' : 'STRUK'}</span><span>{orderTypeLabel(order.type)}</span></div>
      <div>{order.number}</div>
      {(order.label || order.guestCount) && <div>{[order.label, order.guestCount ? `${order.guestCount} tamu` : ''].filter(Boolean).join(' · ')}</div>}
      <div>{fmt(order.closedAt ?? order.openedAt, ctx.timezone)}</div>
      <div>Kasir: {cashierName}</div>
      <hr />
      {order.items.map((i) => (
        <div key={i.id} className="receipt__item">
          <div>{i.name}</div>
          <div className="receipt__row"><span>{i.qty} × {formatRp(i.unitPrice)}</span><span>{formatRp(i.qty * i.unitPrice)}</span></div>
          {i.extras?.map((e) => <div key={e.optionId} className="receipt__row"><span>+ {e.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><span>{e.price > 0 ? formatRp(e.price * i.qty) : ''}</span></div>)}
          {i.note && <div className="receipt__note">{i.note}</div>}
        </div>
      ))}
      <hr />
      <div className="receipt__row"><span>Subtotal</span><span>{formatRp(order.subtotal)}</span></div>
      {order.discountTotal > 0 && <div className="receipt__row"><span>Potongan</span><span>-{formatRp(order.discountTotal)}</span></div>}
      {order.serviceCharge > 0 && <div className="receipt__row"><span>Biaya layanan</span><span>{formatRp(order.serviceCharge)}</span></div>}
      {order.taxTotal > 0 && <div className="receipt__row"><span>Pajak</span><span>{formatRp(order.taxTotal)}</span></div>}
      {order.rounding !== 0 && <div className="receipt__row"><span>Pembulatan</span><span>{formatRp(order.rounding)}</span></div>}
      <div className="receipt__row receipt__total"><span>TOTAL</span><span>{formatRp(order.total)}</span></div>
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
      {ctx.receiptFooter && <><hr /><div className="receipt__center">{ctx.receiptFooter}</div></>}
    </div>
  );
}

export function ReceiptDialog({ order, ctx, kind, onClose }: { order: Order; ctx: OutletContext; kind: 'receipt' | 'bill'; onClose: () => void }) {
  const data = useData();
  const emp = useAsync(() => data.listManagedEmployees(), [data]);
  const [paper, setPaper] = useState<Paper>(readPaper);
  const name = emp.status === 'ready' ? emp.data.find((e) => e.id === order.cashierId)?.name ?? '-' : '…';
  const choose = (p: Paper) => { setPaper(p); try { localStorage.setItem(KEY, p); } catch { /* penyimpanan boleh gagal */ } };
  return (
    <Modal title={kind === 'bill' ? 'Cetak tagihan' : 'Cetak struk'} onClose={onClose}>
      <div className="cg-tabs mb-12" role="tablist" aria-label="Lebar kertas">
        {(['58', '80'] as const).map((p) => <button key={p} role="tab" className="cg-tab" aria-selected={paper === p} onClick={() => choose(p)}>Kertas {p} mm</button>)}
      </div>
      <div className="receipt-preview"><div className="receipt-print"><ReceiptBody order={order} ctx={ctx} cashierName={name} kind={kind} paper={paper} /></div></div>
      <p className="text-text-muted text-sm mt-8">Pilih printer thermal di dialog cetak. Atur lebar kertas dan margin 0 di pengaturan printer.</p>
      <div className="cg-modal__actions">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button>
        <button className="cg-btn cg-btn--primary" data-autofocus onClick={() => window.print()}><Printer className="cg-icon cg-icon--sm" aria-hidden /> Cetak</button>
      </div>
    </Modal>
  );
}

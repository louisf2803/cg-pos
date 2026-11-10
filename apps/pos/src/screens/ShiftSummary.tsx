import { accessFor, formatRp } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useSession } from '../lib/session';
import { Modal } from '../ui';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Ringkasan shift yang sedang berjalan: bisa dibuka kapan saja tanpa menutup kasir. */
export function ShiftSummary({ onClose, onCloseShift }: { onClose: () => void; onCloseShift: () => void }) {
  const data = useData();
  const { session } = useSession();
  const shift = session.shift!;
  const canSeeCash = accessFor(session.employee.role, 'see_expected_cash') === 'allow';
  const sum = useAsync(async () => {
    const [report, staff, open, part] = await Promise.all([
      data.shiftSummary(shift.id), data.listEmployees().catch(() => []),
      data.listOrders({ status: 'open', limit: 100 }), data.listOrders({ status: 'partially_paid', limit: 100 }),
    ]);
    const waiting = [...open, ...part];
    return { report, cashier: staff.find((e) => e.id === shift.cashierId)?.name ?? session.employee.name, waitingCount: waiting.length, waitingLeft: waiting.reduce((a, o) => a + (o.total - o.paidTotal), 0) };
  }, [data, shift.id]);

  return (
    <Modal title="Shift berjalan" onClose={onClose} labelledBy="shift-title">
      <div className="grid gap-16">
        {sum.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 40 }} />)}</div>}
        {sum.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Ringkasan gagal dimuat. {sum.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={sum.reload}>Coba lagi</button></div>}
        {sum.status === 'ready' && (() => {
          const { report: r, cashier, waitingCount, waitingLeft } = sum.data;
          return (
            <>
              <p className="text-text-muted">Dibuka {hhmm(shift.openedAt)} oleh {cashier}. {r.orderCount} pesanan lunas.</p>
              <div className="cg-totals border border-border rounded-lg bg-surface-raised">
                <div className="cg-totals__row"><span>Penjualan tunai</span><span className="cg-num">{formatRp(r.cashSales)}</span></div>
                <div className="cg-totals__row"><span>Penjualan non-tunai</span><span className="cg-num">{formatRp(r.otherSales)}</span></div>
                <div className="cg-totals__row cg-totals__row--grand"><span>Total penerimaan</span><span className="cg-num">{formatRp(r.cashSales + r.otherSales)}</span></div>
              </div>
              <section aria-labelledby="sh-metode">
                <h3 id="sh-metode" className="text-base mb-8">Per metode bayar</h3>
                {r.byMethod.length === 0 ? <p className="text-text-muted">Belum ada pembayaran.</p> : (
                  <ul className="grid gap-4">{r.byMethod.map((m) => <li key={m.methodName} className="flex justify-between gap-12"><span>{m.methodName} <span className="text-text-muted">· {m.count}x</span></span><span className="cg-num">{formatRp(m.amount)}</span></li>)}</ul>
                )}
              </section>
              {canSeeCash ? (
                <section aria-labelledby="sh-kas">
                  <h3 id="sh-kas" className="text-base mb-8">Uang tunai di laci</h3>
                  <div className="cg-totals border border-border rounded-lg bg-surface-raised">
                    <div className="cg-totals__row"><span>Modal awal</span><span className="cg-num">{formatRp(shift.openingCash)}</span></div>
                    <div className="cg-totals__row"><span>Penjualan tunai</span><span className="cg-num">{formatRp(r.cashSales)}</span></div>
                    {r.cashIn > 0 && <div className="cg-totals__row"><span>Kas masuk</span><span className="cg-num">{formatRp(r.cashIn)}</span></div>}
                    {r.cashOut > 0 && <div className="cg-totals__row"><span>Kas keluar</span><span className="cg-num">-{formatRp(r.cashOut)}</span></div>}
                    {r.cashRefunds > 0 && <div className="cg-totals__row"><span>Refund tunai</span><span className="cg-num">-{formatRp(r.cashRefunds)}</span></div>}
                    <div className="cg-totals__row cg-totals__row--grand"><span>Seharusnya di laci</span><span className="cg-num">{formatRp(r.expectedCash)}</span></div>
                  </div>
                </section>
              ) : (
                <p className="text-text-muted text-sm">Jumlah uang yang seharusnya ada di laci disembunyikan untuk kasir, supaya penghitungan saat tutup kasir jujur. Manajer atau pemilik bisa melihatnya.</p>
              )}
              {waitingCount > 0 && <p className="cg-banner cg-banner--warning" role="status">{waitingCount} pesanan belum lunas, sisa tagihan {formatRp(waitingLeft)}. Selesaikan atau batalkan sebelum menutup kasir.</p>}
              <section aria-labelledby="sh-produk">
                <h3 id="sh-produk" className="text-base mb-8">Produk terjual</h3>
                {r.productsSold.length === 0 ? <p className="text-text-muted">Belum ada produk terjual.</p> : (
                  <ul className="grid gap-4">{r.productsSold.slice(0, 8).map((p) => <li key={p.productId} className="flex justify-between gap-12"><span className="break-words min-w-0">{p.name} <span className="text-text-muted">× {p.qty}</span></span><span className="cg-num">{formatRp(p.amount)}</span></li>)}</ul>
                )}
                {r.productsSold.length > 8 && <p className="text-text-muted text-sm mt-4">Dan {r.productsSold.length - 8} produk lain.</p>}
              </section>
            </>
          );
        })()}
        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--ghost" onClick={sum.reload}>Muat ulang</button>
          <button className="cg-btn cg-btn--secondary" onClick={onCloseShift}>Tutup kasir…</button>
          <button className="cg-btn cg-btn--primary" data-autofocus onClick={onClose}>Selesai</button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { accessFor, formatRp, newId } from '@cgpos/shared';
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
    const [report, staff, open, part, moves] = await Promise.all([
      data.shiftSummary(shift.id), data.listEmployees().catch(() => []),
      data.listOrders({ status: 'open', limit: 100 }), data.listOrders({ status: 'partially_paid', limit: 100 }),
      data.listCashMovements(shift.id).catch(() => []),
    ]);
    const waiting = [...open, ...part];
    return { moves, report, cashier: staff.find((e) => e.id === shift.cashierId)?.name ?? session.employee.name, waitingCount: waiting.length, waitingLeft: waiting.reduce((a, o) => a + (o.total - o.paidTotal), 0) };
  }, [data, shift.id]);
  const [cashDlg, setCashDlg] = useState<'in' | 'out' | null>(null);

  return (
    <Modal title="Shift berjalan" onClose={onClose} labelledBy="shift-title">
      <div className="grid gap-16">
        {sum.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 40 }} />)}</div>}
        {sum.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Ringkasan gagal dimuat. {sum.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={sum.reload}>Coba lagi</button></div>}
        {sum.status === 'ready' && (() => {
          const { report: r, cashier, waitingCount, waitingLeft, moves } = sum.data;
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
              <section aria-labelledby="sh-kas">
                <div className="flex justify-between items-center gap-8 mb-8">
                  <h3 id="sh-kas" className="text-base">Kas masuk dan keluar</h3>
                  <div className="flex gap-8">
                    <button className="cg-btn cg-btn--secondary cg-btn--sm" data-testid="cash-in-open" onClick={() => setCashDlg('in')}>Kas masuk</button>
                    <button className="cg-btn cg-btn--secondary cg-btn--sm" data-testid="cash-out-open" onClick={() => setCashDlg('out')}>Kas keluar</button>
                  </div>
                </div>
                {moves.length === 0 ? <p className="text-text-muted">Belum ada kas masuk atau keluar.</p> : (
                  <ul className="grid gap-4" data-testid="cash-list">{moves.map((m) => <li key={m.id} className="flex justify-between gap-12"><span className="break-words min-w-0">{hhmm(m.occurredAt)} · {m.reason}</span><span className="cg-num">{m.kind === 'out' ? '-' : '+'}{formatRp(m.amount)}</span></li>)}</ul>
                )}
              </section>
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
      {cashDlg && <CashDialog kind={cashDlg} onClose={() => setCashDlg(null)} onSave={async (amount, reason) => {
        await data.addCashMovement({ id: newId(), shiftId: shift.id, kind: cashDlg, amount, reason, employeeId: session.employee.id });
        setCashDlg(null); sum.reload();
      }} />}
    </Modal>
  );
}

/** Catat uang yang masuk atau keluar dari laci di luar penjualan (mis. beli es batu, tambah uang kembalian). */
function CashDialog({ kind, onClose, onSave }: { kind: 'in' | 'out'; onClose: () => void; onSave: (amount: number, reason: string) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(amount.replace(/[^\d]/g, ''));
    if (!Number.isFinite(a) || a <= 0) { setErr('Jumlah harus lebih dari 0.'); return; }
    if (reason.trim().length < 3) { setErr('Alasan wajib diisi (minimal 3 huruf).'); return; }
    setBusy(true); setErr('');
    try { await onSave(a, reason); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mencatat kas.'); setBusy(false); }
  }
  return (
    <Modal title={kind === 'in' ? 'Kas masuk' : 'Kas keluar'} onClose={onClose} labelledBy="cash-title">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <label className="grid gap-4"><span className="text-sm">Jumlah (Rp)</span>
          <input className="cg-input" inputMode="numeric" data-autofocus data-testid="cash-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="grid gap-4"><span className="text-sm">Alasan</span>
          <input className="cg-input" data-testid="cash-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'in' ? 'Mis. tambah uang kembalian' : 'Mis. beli es batu'} /></label>
        {err && <p role="alert" className="text-sm text-danger-strong" data-testid="cash-err">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} data-testid="cash-save">Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

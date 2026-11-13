import { useState, type FormEvent } from 'react';
import { DataError, salesDueDate, formatRp, localDateString, newId, orderInvoiceProblem, orderToInvoiceInput, type Order } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { Modal } from '../../ui';

/**
 * Jadikan invoice: pesanan yang belum dibayar menjadi faktur penjualan (piutang) untuk pelanggan pesanan, lalu pesanan ditutup tanpa pembayaran.
 * Faktur dibuat dulu; bila penutupan pesanan gagal, kasir diberi tahu supaya tidak membuat faktur ganda.
 */
export function InvoiceDialog({ order, authorizedBy, onClose, onDone }: { order: Order; authorizedBy: string; onClose: () => void; onDone: (invoiceNumber: string) => void }) {
  const data = useData();
  const [term, setTerm] = useState('14');
  const [note, setNote] = useState('');
  const [attempt] = useState(() => newId());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const problem = orderInvoiceProblem(order);
  const days = Number(term) || 0;
  const due = salesDueDate(localDateString(new Date()), days);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || problem) return;
    if (!Number.isInteger(days) || days < 0 || days > 3650) { setErr('Termin 0 sampai 3650 hari.'); return; }
    setBusy(true); setErr('');
    let number = created;
    try {
      if (!number) {
        const inv = await data.createSalesInvoice(orderToInvoiceInput(order, { id: attempt, termDays: days, note }));
        number = inv.number;
        setCreated(number);
      }
      await data.voidUnpaidOrder(order.id, `Dijadikan invoice ${number}`, authorizedBy);
      onDone(number);
    } catch (x) {
      const msg = x instanceof DataError || x instanceof Error ? x.message : 'Gagal.';
      setErr(number ? `Invoice ${number} sudah dibuat, tetapi pesanan belum tertutup: ${msg}. Jangan buat invoice lagi; tutup pesanan ini dari daftar pesanan.` : msg);
      setBusy(false);
    }
  }

  return (
    <Modal title="Jadikan invoice" labelledBy="invoice-title" onClose={busy ? undefined : onClose}>
      <form onSubmit={(e) => void submit(e)} className="grid gap-12" noValidate>
        {problem ? <p role="alert" className="cg-banner cg-banner--warning">{problem}</p> : (
          <>
            <p className="text-text-muted">Pesanan <strong>{order.number}</strong> untuk <strong>{order.customerName ?? 'pelanggan'}</strong> senilai <strong className="cg-num">{formatRp(order.total)}</strong> dicatat sebagai tagihan, lalu pesanan ditutup tanpa pembayaran. Stok tidak dikurangi otomatis.</p>
            <div className="cg-field">
              <label className="cg-label" htmlFor="inv-termin">Termin pembayaran (hari)</label>
              <input id="inv-termin" className="cg-input cg-num" inputMode="numeric" data-autofocus value={term} onChange={(e) => { setTerm(e.target.value.replace(/\D/g, '')); setErr(''); }} disabled={busy || !!created} />
              <p className="text-xs text-text-muted">Jatuh tempo {due}</p>
            </div>
            <div className="cg-field">
              <label className="cg-label" htmlFor="inv-catatan">Catatan (opsional)</label>
              <input id="inv-catatan" className="cg-input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy || !!created} />
            </div>
          </>
        )}
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Batal</button>
          {!problem && <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Memproses…' : created ? 'Tutup pesanan' : 'Buat invoice'}</button>}
        </div>
      </form>
    </Modal>
  );
}

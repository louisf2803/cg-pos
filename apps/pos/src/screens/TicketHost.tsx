import { useState } from 'react';
import { Bluetooth, ChefHat, Printer, X } from 'lucide-react';
import { checkerPieces, labelPieceSets, paperCols } from '@cgpos/shared';
import { bluetoothSupported, connectPrinter, usePrinter } from '../lib/printer';
import { dismissTicket, printTicket, useTickets, type PendingTicket } from '../lib/stations';
import { Modal } from '../ui';

/** Teks tiket untuk pratinjau dan cetak peramban (isi sama dengan yang dikirim ke printer). */
function ticketText(t: PendingTicket): string[] {
  const cols = paperCols(t.station.paper);
  const base = { station: t.station, meta: t.meta, lines: t.lines, cols };
  if (t.station.kind === 'label') return labelPieceSets(base).flatMap((set, i) => [...(i ? ['', '- - - - - - - -', ''] : []), ...set.map((p) => p.text)]);
  return checkerPieces(base).map((p) => p.text);
}

function TicketDialog({ ticket, onClose }: { ticket: PendingTicket; onClose: () => void }) {
  const pr = usePrinter();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  async function send() {
    setSending(true); setMsg('');
    try { await printTicket(ticket); dismissTicket(ticket.id); onClose(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal mencetak.'); } finally { setSending(false); }
  }
  return (
    <Modal title={`Cetak tiket ${ticket.station.name}`} onClose={onClose}>
      <div className="receipt-preview"><div className="receipt-print"><pre className={`receipt receipt--${ticket.station.paper}`} data-testid="ticket-text" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{ticketText(ticket).join('\n')}</pre></div></div>
      {bluetoothSupported() && (
        <p className="text-sm mt-8" role="status">{pr.status === 'connected' ? `Tersambung: ${pr.name}` : 'Printer Bluetooth belum tersambung.'}</p>
      )}
      {msg && <p role="alert" className="cg-error">{msg}</p>}
      <div className="cg-modal__actions">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button>
        {bluetoothSupported() && pr.status !== 'connected' && <button className="cg-btn cg-btn--secondary" onClick={() => void connectPrinter()} disabled={pr.status === 'connecting'}><Bluetooth className="cg-icon cg-icon--sm" aria-hidden /> Hubungkan printer</button>}
        <button className={`cg-btn ${pr.status === 'connected' ? 'cg-btn--secondary' : 'cg-btn--primary'}`} onClick={() => { window.print(); }}><Printer className="cg-icon cg-icon--sm" aria-hidden /> Cetak (peramban)</button>
        {pr.status === 'connected' && <button className="cg-btn cg-btn--primary" data-autofocus disabled={sending} onClick={() => void send()}><Bluetooth className="cg-icon cg-icon--sm" aria-hidden /> {sending ? 'Mengirim…' : 'Cetak Bluetooth'}</button>}
      </div>
    </Modal>
  );
}

/**
 * Baris "Tiket baru": tiket stasiun yang menunggu dicetak, satu chip per tiket. Dipasang DI DALAM tata letak (bar bawah kasir dan layar
 * pembayaran berhasil), bukan melayang, supaya tidak pernah menutupi tombol Bayar atau pesan.
 */
export function TicketStrip({ className = '' }: { className?: string }) {
  const tickets = useTickets();
  const pr = usePrinter();
  const [open, setOpen] = useState<PendingTicket | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  async function quick(t: PendingTicket) {
    if (pr.status !== 'connected') { setOpen(t); return; }
    setBusy(t.id);
    try { await printTicket(t); dismissTicket(t.id); } catch (e) { setErr((x) => ({ ...x, [t.id]: e instanceof Error ? e.message : 'Gagal mencetak.' })); setOpen(t); }
    finally { setBusy(null); }
  }
  if (tickets.length === 0 && !open) return null;
  const count = (t: PendingTicket) => t.lines.reduce((n, l) => n + l.qty, 0);
  return (
    <>
      {tickets.length > 0 && (
        <div className={`flex flex-wrap items-center gap-8 min-w-0 ${className}`} aria-label="Tiket baru" data-testid="ticket-host">
          {tickets.map((t) => (
            <div key={t.id} className="inline-flex items-center gap-8 border border-border rounded-lg bg-surface-raised px-8 py-4 max-w-full" role="status">
              <ChefHat className="cg-icon cg-icon--xs shrink-0" aria-hidden />
              <span className="text-sm min-w-0 truncate"><strong>Tiket {t.station.name}</strong> · {count(t)} porsi</span>
              {(t.error || err[t.id]) && <span className="cg-error text-sm" role="alert">{err[t.id] ?? t.error}</span>}
              <button className="cg-btn cg-btn--primary cg-btn--sm" disabled={busy === t.id} onClick={() => void quick(t)} data-testid={`ticket-print-${t.station.name}`}><Printer className="cg-icon cg-icon--xs" aria-hidden /> {busy === t.id ? 'Mengirim…' : 'Cetak'}</button>
              <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setOpen(t)}>Lihat</button>
              <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Tutup tiket ${t.station.name}`} onClick={() => dismissTicket(t.id)}><X className="cg-icon cg-icon--xs" aria-hidden /></button>
            </div>
          ))}
        </div>
      )}
      {open && <TicketDialog ticket={open} onClose={() => setOpen(null)} />}
    </>
  );
}

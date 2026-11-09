import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Ban, CreditCard, Play } from 'lucide-react';
import { formatRp, type Employee, type Order } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useSession } from '../lib/session';
import { Modal } from '../ui';

const REASONS = ['Salah input pesanan', 'Pelanggan batal', 'Pesanan ganda', 'Lainnya'];
const TYPE: Record<Order['type'], string> = { takeaway: 'Bawa pulang', dine_in: 'Makan di tempat', delivery: 'Antar', service: 'Jasa' };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Daftar pesanan yang belum lunas di outlet ini: lanjutkan, bayar, atau batalkan (void). */
export function Orders({ canResume, onClose, onResume, onPay }: { canResume: boolean; onClose: () => void; onResume: (o: Order) => void; onPay: (o: Order) => void }) {
  const data = useData();
  const list = useAsync(async () => {
    const [open, part] = await Promise.all([data.listOrders({ status: 'open', limit: 100 }), data.listOrders({ status: 'partially_paid', limit: 100 })]);
    return [...open, ...part].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }, [data]);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <div className="grid gap-16 p-16 max-w-[720px] mx-auto">
      <header className="flex items-center gap-12">
        <button className="cg-btn cg-btn--ghost" onClick={onClose} aria-label="Kembali ke kasir"><ArrowLeft className="cg-icon" aria-hidden /></button>
        <h1 className="text-xl">Daftar Order</h1>
        <button className="cg-btn cg-btn--secondary cg-btn--sm ml-auto" onClick={list.reload}>Muat ulang</button>
      </header>
      {notice && <p role="status" className="cg-banner cg-banner--info">{notice}</p>}
      {!canResume && list.status === 'ready' && list.data.length > 0 && (
        <p className="cg-banner cg-banner--warning">Pesanan di layar kasir belum disimpan. Simpan atau kosongkan dulu sebelum melanjutkan pesanan lain.</p>
      )}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>}
      {list.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Daftar order gagal dimuat. {list.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={list.reload}>Coba lagi</button></div>}
      {list.status === 'ready' && list.data.length === 0 && (
        <div className="cg-empty"><h3>Tidak ada pesanan yang menunggu</h3><p>Pesanan yang disimpan dari layar kasir muncul di sini.</p></div>
      )}
      {list.status === 'ready' && (
        <ul className="grid gap-12">
          {list.data.map((o) => {
            const partial = o.status === 'partially_paid';
            return (
              <li key={o.id} className="border border-border rounded-lg bg-surface-raised p-16 grid gap-12">
                <div className="flex flex-wrap items-baseline justify-between gap-8">
                  <strong className="break-all">{o.number}</strong>
                  <span className="text-text-muted text-sm">{hhmm(o.openedAt)} · {TYPE[o.type]}</span>
                </div>
                <details>
                  <summary className="cursor-pointer">{o.items.reduce((n, i) => n + i.qty, 0)} item · <span className="cg-num">{formatRp(o.total)}</span>{partial && <span className="cg-badge cg-badge--warning ml-8">Dibayar sebagian {formatRp(o.paidTotal)}</span>}</summary>
                  <ul className="grid gap-4 mt-8">
                    {o.items.map((i) => <li key={i.id} className="flex justify-between gap-12"><span className="break-words min-w-0">{i.name} <span className="text-text-muted">× {i.qty}</span></span><span className="cg-num">{formatRp(i.lineTotal)}</span></li>)}
                  </ul>
                </details>
                <div className="flex flex-wrap gap-8">
                  {!partial && <button className="cg-btn cg-btn--secondary" disabled={!canResume} onClick={() => onResume(o)}><Play className="cg-icon cg-icon--sm" aria-hidden /> Lanjutkan</button>}
                  <button className="cg-btn cg-btn--primary" onClick={() => onPay(o)}><CreditCard className="cg-icon cg-icon--sm" aria-hidden /> Bayar</button>
                  {!partial && <button className="cg-btn cg-btn--ghost ml-auto" onClick={() => setVoiding(o)}><Ban className="cg-icon cg-icon--sm" aria-hidden /> Batalkan</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {voiding && <VoidDialog order={voiding} onClose={() => setVoiding(null)} onDone={(n) => { setVoiding(null); setNotice(`Pesanan ${n} dibatalkan.`); list.reload(); }} />}
    </div>
  );
}

function VoidDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (number: string) => void }) {
  const data = useData();
  const { session } = useSession();
  const staff = useAsync(() => data.listEmployees(), [data]);
  const approvers = useMemo<Employee[]>(() => (staff.status === 'ready' ? staff.data.filter((e) => e.role === 'owner' || e.role === 'manager') : []), [staff]);
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState('');
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsPin = approvers.length > 0;
  // bawaan: yang sedang bertugas bila dia manajer/pemilik, selain itu manajer/pemilik pertama
  const approver = approvers.find((e) => e.id === approverId) ?? approvers.find((e) => e.id === session.employee.id) ?? approvers[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason === 'Lainnya' && !note.trim()) return setError('Tulis alasannya.');
    setBusy(true); setError('');
    try {
      let by = session.employee.id;
      if (needsPin) {
        if (!approver || !(await data.verifyPin(approver.id, pin))) { setPin(''); setBusy(false); return setError('PIN salah.'); }
        by = approver.id;
      }
      await data.voidUnpaidOrder(order.id, reason === 'Lainnya' ? note.trim() : note.trim() ? `${reason}: ${note.trim()}` : reason, by);
      onDone(order.number);
    } catch (err) { setError(err instanceof Error ? err.message : 'Pesanan gagal dibatalkan.'); setBusy(false); }
  }

  return (
    <Modal title={`Batalkan ${order.number}?`} onClose={busy ? undefined : onClose} labelledBy="void-title">
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">Pesanan {formatRp(order.total)} akan dibatalkan dan tidak bisa dibayar lagi. Pesanan yang sudah ada pembayarannya harus di-refund, bukan dibatalkan.</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="alasan">Alasan</label>
          <select id="alasan" className="cg-input" value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="catatan">Catatan {reason === 'Lainnya' ? '' : '(opsional)'}</label>
          <input id="catatan" className="cg-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
        {needsPin ? (
          <>
            {approvers.length > 1 && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="pemberi">Disetujui oleh</label>
                <select id="pemberi" className="cg-input" value={approver?.id} onChange={(e) => setApproverId(e.target.value)}>
                  {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div className="cg-field">
              <label className="cg-label" htmlFor="pin-void">PIN {approver?.name}</label>
              <input id="pin-void" className="cg-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
          </>
        ) : staff.status === 'ready' && <p className="text-text-muted text-sm">Belum ada manajer atau pemilik terdaftar, jadi pembatalan belum memerlukan PIN. Atur peran di dashboard.</p>}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Jangan batalkan</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || staff.status === 'loading' || (needsPin && pin.length !== 6)}>{busy ? 'Membatalkan…' : 'Batalkan pesanan'}</button>
        </div>
      </form>
    </Modal>
  );
}

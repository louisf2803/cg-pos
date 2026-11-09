import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Ban, CreditCard, Play, Printer, Undo2 } from 'lucide-react';
import { formatRp, refundAmounts, refundableLines, newId, type Employee, type Order, type OutletContext, type Refund } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useSession } from '../lib/session';
import { Modal } from '../ui';
import { ReceiptDialog } from './Receipt';

const REASONS = ['Salah input pesanan', 'Pelanggan batal', 'Pesanan ganda', 'Lainnya'];
const REFUND_REASONS = ['Pesanan salah', 'Produk bermasalah', 'Pelanggan batal', 'Lainnya'];
const TYPE: Record<Order['type'], string> = { takeaway: 'Bawa pulang', dine_in: 'Makan di tempat', delivery: 'Antar', service: 'Jasa' };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Daftar pesanan yang belum lunas di outlet ini: lanjutkan, bayar, atau batalkan (void). */
export function Orders({ ctx, canResume, onClose, onResume, onPay }: { ctx: OutletContext; canResume: boolean; onClose: () => void; onResume: (o: Order) => void; onPay: (o: Order) => void }) {
  const data = useData();
  const [tab, setTab] = useState<'waiting' | 'paid'>('waiting');
  const list = useAsync(async () => {
    if (tab === 'paid') return data.listOrders({ status: 'paid', limit: 50 });
    const [open, part] = await Promise.all([data.listOrders({ status: 'open', limit: 100 }), data.listOrders({ status: 'partially_paid', limit: 100 })]);
    return [...open, ...part].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }, [data, tab]);
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [bill, setBill] = useState<Order | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <div className="grid gap-16 p-16 max-w-[720px] mx-auto">
      <header className="flex items-center gap-12">
        <button className="cg-btn cg-btn--ghost" onClick={onClose} aria-label="Kembali ke kasir"><ArrowLeft className="cg-icon" aria-hidden /></button>
        <h1 className="text-xl">Daftar Order</h1>
        <button className="cg-btn cg-btn--secondary cg-btn--sm ml-auto" onClick={list.reload}>Muat ulang</button>
      </header>
      <div className="cg-tabs" role="tablist" aria-label="Jenis order">
        <button role="tab" className="cg-tab" aria-selected={tab === 'waiting'} onClick={() => { setTab('waiting'); setNotice(''); }}>Menunggu</button>
        <button role="tab" className="cg-tab" aria-selected={tab === 'paid'} onClick={() => { setTab('paid'); setNotice(''); }}>Lunas</button>
      </div>
      {notice && <p role="status" className="cg-banner cg-banner--info">{notice}</p>}
      {tab === 'waiting' && !canResume && list.status === 'ready' && list.data.length > 0 && (
        <p className="cg-banner cg-banner--warning">Pesanan di layar kasir belum disimpan. Simpan atau kosongkan dulu sebelum melanjutkan pesanan lain.</p>
      )}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>}
      {list.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Daftar order gagal dimuat. {list.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={list.reload}>Coba lagi</button></div>}
      {list.status === 'ready' && list.data.length === 0 && (
        <div className="cg-empty">{tab === 'paid' ? <><h3>Belum ada pesanan lunas</h3><p>Pesanan yang sudah dibayar muncul di sini dan bisa di-refund.</p></> : <><h3>Tidak ada pesanan yang menunggu</h3><p>Pesanan yang disimpan dari layar kasir muncul di sini.</p></>}</div>
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
                    {o.items.map((i) => <li key={i.id} className="flex justify-between gap-12"><span className="break-words min-w-0">{i.name} <span className="text-text-muted">× {i.qty}</span>{i.extras?.length ? <span className="block text-text-muted text-sm">{i.extras.map((e) => e.name).join(', ')}</span> : null}</span><span className="cg-num">{formatRp(i.lineTotal)}</span></li>)}
                  </ul>
                </details>
                <div className="flex flex-wrap gap-8">
                  {tab === 'paid' ? (
                    <>
                      <button className="cg-btn cg-btn--ghost" onClick={() => setBill(o)}><Printer className="cg-icon cg-icon--sm" aria-hidden /> Struk</button>
                      <button className="cg-btn cg-btn--secondary ml-auto" onClick={() => setRefunding(o)}><Undo2 className="cg-icon cg-icon--sm" aria-hidden /> Refund</button>
                    </>
                  ) : (
                    <>
                      {!partial && <button className="cg-btn cg-btn--secondary" disabled={!canResume} onClick={() => onResume(o)}><Play className="cg-icon cg-icon--sm" aria-hidden /> Lanjutkan</button>}
                      <button className="cg-btn cg-btn--ghost" onClick={() => setBill(o)}><Printer className="cg-icon cg-icon--sm" aria-hidden /> Tagihan</button>
                      <button className="cg-btn cg-btn--primary" onClick={() => onPay(o)}><CreditCard className="cg-icon cg-icon--sm" aria-hidden /> Bayar</button>
                      {!partial && <button className="cg-btn cg-btn--ghost ml-auto" onClick={() => setVoiding(o)}><Ban className="cg-icon cg-icon--sm" aria-hidden /> Batalkan</button>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {refunding && <RefundDialog order={refunding} onClose={() => setRefunding(null)} onDone={(r) => { setRefunding(null); setNotice(`Refund ${r.number} ${formatRp(r.total)} tercatat via ${r.methodName}.`); list.reload(); }} />}
      {bill && <ReceiptDialog order={bill} ctx={ctx} kind={tab === 'paid' ? 'receipt' : 'bill'} onClose={() => setBill(null)} />}
      {voiding && <VoidDialog order={voiding} onClose={() => setVoiding(null)} onDone={(n) => { setVoiding(null); setNotice(`Pesanan ${n} dibatalkan.`); list.reload(); }} />}
    </div>
  );
}

/** Pemberi izin (manajer/pemilik) dan PIN-nya. Bila belum ada satu pun, PIN tidak diminta. */
function useApprover() {
  const data = useData();
  const { session } = useSession();
  const staff = useAsync(() => data.listEmployees(), [data]);
  const approvers = useMemo<Employee[]>(() => (staff.status === 'ready' ? staff.data.filter((e) => e.role === 'owner' || e.role === 'manager') : []), [staff]);
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const approver = approvers.find((e) => e.id === approverId) ?? approvers.find((e) => e.id === session.employee.id) ?? approvers[0];
  /** Mengembalikan id pemberi izin, atau null bila PIN salah. */
  async function authorize(): Promise<string | null> {
    if (approvers.length === 0) return session.employee.id;
    if (!approver || !(await data.verifyPin(approver.id, pin))) { setPin(''); return null; }
    return approver.id;
  }
  return { staffLoading: staff.status === 'loading', staffReady: staff.status === 'ready', approvers, approver, setApproverId, pin, setPin, needsPin: approvers.length > 0, authorize };
}
type Approver = ReturnType<typeof useApprover>;

function ApproverFields({ a, idPrefix, what }: { a: Approver; idPrefix: string; what: string }) {
  if (!a.needsPin) return a.staffReady ? <p className="text-text-muted text-sm">Belum ada manajer atau pemilik terdaftar, jadi {what} belum memerlukan PIN. Atur peran di dashboard.</p> : null;
  return (
    <>
      {a.approvers.length > 1 && (
        <div className="cg-field">
          <label className="cg-label" htmlFor={`${idPrefix}-pemberi`}>Disetujui oleh</label>
          <select id={`${idPrefix}-pemberi`} className="cg-input" value={a.approver?.id} onChange={(e) => a.setApproverId(e.target.value)}>
            {a.approvers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
      <div className="cg-field">
        <label className="cg-label" htmlFor={`${idPrefix}-pin`}>PIN {a.approver?.name}</label>
        <input id={`${idPrefix}-pin`} className="cg-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={a.pin} onChange={(e) => a.setPin(e.target.value.replace(/\D/g, ''))} />
      </div>
    </>
  );
}

function VoidDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (number: string) => void }) {
  const data = useData();
  const ap = useApprover();
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason === 'Lainnya' && !note.trim()) return setError('Tulis alasannya.');
    setBusy(true); setError('');
    try {
      const by = await ap.authorize();
      if (!by) { setBusy(false); return setError('PIN salah.'); }
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
        <ApproverFields a={ap} idPrefix="void" what="pembatalan" />
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Jangan batalkan</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || ap.staffLoading || (ap.needsPin && ap.pin.length !== 6)}>{busy ? 'Membatalkan…' : 'Batalkan pesanan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RefundDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (r: Refund) => void }) {
  const data = useData();
  const ap = useApprover();
  const history = useAsync(() => data.listRefunds(order.id), [data, order.id]);
  const methods = useAsync(() => data.listPaymentMethods(), [data]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [methodId, setMethodId] = useState('');
  const [reason, setReason] = useState(REFUND_REASONS[0]!);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt] = useState(() => newId());   // satu id per dialog: kirim ulang tidak menggandakan refund

  const lines = history.status === 'ready' ? refundableLines(order, history.data) : [];
  const options = methods.status === 'ready' ? methods.data.filter((m) => m.kind === 'cash' || m.kind === 'noncash') : [];
  const method = options.find((m) => m.id === methodId) ?? options.find((m) => order.payments.some((p) => p.methodName === m.name)) ?? options[0];
  const picks = lines.map((l) => ({ orderItemId: l.orderItemId, qty: Math.min(qty[l.orderItemId] ?? 0, l.remainingQty) }));
  const total = refundAmounts(order, picks).reduce((a, x) => a + x.amount, 0);
  const alreadyRefunded = history.status === 'ready' ? history.data.reduce((a, r) => a + r.total, 0) : 0;
  const nothingLeft = history.status === 'ready' && lines.every((l) => l.remainingQty <= 0);
  const step = (id: string, d: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] ?? 0) + d)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !method) return;
    if (total <= 0) return setError('Pilih minimal satu item untuk di-refund.');
    if (reason === 'Lainnya' && !note.trim()) return setError('Tulis alasannya.');
    setBusy(true); setError('');
    try {
      const by = await ap.authorize();
      if (!by) { setBusy(false); return setError('PIN salah.'); }
      const r = await data.refundOrder({ id: attempt, orderId: order.id, methodId: method.id, items: picks.filter((p) => p.qty > 0), reason: reason === 'Lainnya' ? note.trim() : reason, note: reason === 'Lainnya' ? undefined : note.trim() || undefined, restock, authorizedBy: by });
      onDone(r);
    } catch (err) { setError(err instanceof Error ? err.message : 'Refund gagal dicatat.'); setBusy(false); }
  }

  return (
    <Modal title={`Refund ${order.number}`} onClose={busy ? undefined : onClose} labelledBy="refund-title">
      <form onSubmit={submit} className="grid gap-16">
        {history.status === 'loading' && <div className="cg-skeleton" style={{ height: 96 }} aria-busy="true" aria-label="Memuat" />}
        {history.status === 'error' && <p role="alert" className="text-danger-strong">Riwayat refund gagal dimuat. {history.message}</p>}
        {history.status === 'ready' && (
          <>
            <p className="cg-modal__body">Dibayar {formatRp(order.paidTotal)}{alreadyRefunded > 0 && <> · sudah di-refund <span className="cg-num">{formatRp(alreadyRefunded)}</span></>}. Pilih item dan jumlah yang dikembalikan; pajak, biaya layanan, dan potongan ikut dihitung sebanding.</p>
            {nothingLeft ? <p className="cg-banner cg-banner--info">Semua item pesanan ini sudah di-refund.</p> : (
              <ul className="grid gap-8" aria-label="Item untuk di-refund">
                {lines.map((l) => (
                  <li key={l.orderItemId} className="flex items-center justify-between gap-12">
                    <span className="min-w-0 break-words">{l.name}<span className="block text-text-muted text-sm">{l.remainingQty} dari {l.soldQty} bisa di-refund</span></span>
                    <span className="flex items-center gap-8 shrink-0">
                      <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label={`Kurangi ${l.name}`} disabled={(qty[l.orderItemId] ?? 0) <= 0} onClick={() => step(l.orderItemId, -1, l.remainingQty)}>−</button>
                      <span className="cg-num min-w-[24px] text-center" aria-label={`Jumlah ${l.name}`}>{picks.find((p) => p.orderItemId === l.orderItemId)?.qty ?? 0}</span>
                      <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label={`Tambah ${l.name}`} disabled={l.remainingQty <= 0 || (qty[l.orderItemId] ?? 0) >= l.remainingQty} onClick={() => step(l.orderItemId, 1, l.remainingQty)}>+</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!nothingLeft && (
              <>
                <p className="flex justify-between gap-12"><span>Dikembalikan ke pelanggan</span><strong className="cg-num">{formatRp(total)}</strong></p>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-metode">Dikembalikan lewat</label>
                  <select id="refund-metode" className="cg-input" value={method?.id ?? ''} onChange={(e) => setMethodId(e.target.value)}>
                    {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-alasan">Alasan</label>
                  <select id="refund-alasan" className="cg-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REFUND_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-catatan">Catatan {reason === 'Lainnya' ? '' : '(opsional)'}</label>
                  <input id="refund-catatan" className="cg-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
                </div>
                <label className="flex items-center gap-8"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Kembalikan barang ke stok</label>
                <ApproverFields a={ap} idPrefix="refund" what="refund" />
              </>
            )}
          </>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Tutup</button>
          {!nothingLeft && <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || total <= 0 || !method || ap.staffLoading || (ap.needsPin && ap.pin.length !== 6)}>{busy ? 'Mencatat…' : `Refund ${formatRp(total)}`}</button>}
        </div>
      </form>
    </Modal>
  );
}

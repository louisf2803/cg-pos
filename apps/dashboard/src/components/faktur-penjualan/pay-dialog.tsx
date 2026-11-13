'use client';

import { useState, type FormEvent } from 'react';
import { formatRp, newId, salesPayProblem, type Account, type SalesInvoice } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { todayKey, useDialog } from '@/components/fin-common';

export function PayDialog({ invoice, accounts, onClose, onDone }: {
  invoice: SalesInvoice; accounts: Account[]; onClose: () => void; onDone: (inv: SalesInvoice) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const cash = accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive);
  const [f, setF] = useState({ date: todayKey(), accountId: cash[0]?.id ?? '', amount: String(invoice.outstanding), note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = Number(f.amount.replace(/[^\d]/g, '')) || 0;
    if (!f.accountId) return setErr('Pilih akun kas atau bank yang menerima uang.');
    const problem = salesPayProblem(invoice.outstanding, amount);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      onDone(await data.paySalesInvoice({ id, invoiceId: invoice.id, accountId: f.accountId, date: f.date, amount, ...(f.note.trim() ? { note: f.note } : {}) }));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal mencatat pembayaran.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-bayar-faktur">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-bayar-faktur" className="cg-modal__title">Terima pembayaran {invoice.number}</h2>
        <p className="text-text-muted">Sisa tagihan <strong className="cg-num">{formatRp(invoice.outstanding)}</strong> dari {invoice.customerName}.</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="bf-tgl">Tanggal terima</label>
          <input id="bf-tgl" type="date" className="cg-input" value={f.date} max={todayKey()} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="bf-akun">Masuk ke</label>
          <select id="bf-akun" className="cg-input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
            {cash.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="bf-jumlah">Jumlah (Rp)</label>
          <input id="bf-jumlah" className="cg-input cg-num" inputMode="numeric" autoFocus value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d]/g, '') })} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="bf-ket">Keterangan (opsional)</label>
          <input id="bf-ket" className="cg-input" maxLength={200} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Catat pembayaran'}</button>
        </div>
      </form>
    </dialog>
  );
}

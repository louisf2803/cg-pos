'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatRp, newId, salesInvoiceProblem, salesInvoiceTotals, type Account, type Customer, type SalesInvoice } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { todayKey, useDialog } from '@/components/fin-common';

interface Row { key: string; name: string; qty: string; price: string }
const blank = (): Row => ({ key: newId(), name: '', qty: '1', price: '' });
const digits = (s: string) => s.replace(/[^\d]/g, '');
const num = (s: string) => Number(digits(s)) || 0;
const GRID = { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' } as const;

export interface InvoicePrefill { customerId?: string; lines: { name: string; qty: number; unitPrice: number }[] }

export function InvoiceDialog({ customers, accounts, prefill, onClose, onDone }: {
  customers: Customer[]; accounts: Account[]; prefill?: InvoicePrefill; onClose: () => void; onDone: (inv: SalesInvoice) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const cash = useMemo(() => accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive), [accounts]);
  const [f, setF] = useState({ customerId: prefill?.customerId ?? '', date: todayKey(), term: '14', discount: '', tax: '', down: '', accountId: cash[0]?.id ?? '', note: '' });
  const [rows, setRows] = useState<Row[]>(() => (prefill && prefill.lines.length > 0
    ? prefill.lines.map((l) => ({ key: newId(), name: l.name, qty: String(l.qty), price: String(l.unitPrice) }))
    : [blank()]));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };
  const setRow = (key: string, p: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r))); setErr(''); };

  const lines = rows
    .filter((r) => r.name.trim() || num(r.price) > 0)
    .map((r) => ({ name: r.name, qty: Number(r.qty.replace(',', '.')) || 0, unitPrice: num(r.price) }));
  const totals = salesInvoiceTotals(lines, num(f.discount), num(f.tax));
  const down = num(f.down);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id, date: f.date, termDays: Number(f.term) || 0, discount: num(f.discount), taxAmount: num(f.tax), downPayment: down, lines,
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(down > 0 && f.accountId ? { accountId: f.accountId } : {}),
      ...(f.note.trim() ? { note: f.note } : {}),
    };
    const problem = salesInvoiceProblem(input);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      onDone(await data.createSalesInvoice(input));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal membuat faktur.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-faktur">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-faktur" className="cg-modal__title">Faktur penjualan baru</h2>
        <div className="grid gap-12" style={GRID}>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-pelanggan">Pelanggan</label>
            <select id="fj-pelanggan" className="cg-input" value={f.customerId} onChange={(e) => set({ customerId: e.target.value })}>
              <option value="">Tanpa pelanggan</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-tgl">Tanggal faktur</label>
            <input id="fj-tgl" type="date" className="cg-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-termin">Termin (hari)</label>
            <input id="fj-termin" className="cg-input cg-num" inputMode="numeric" value={f.term} onChange={(e) => set({ term: digits(e.target.value) })} />
          </div>
        </div>

        <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Barang atau jasa</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-8 items-end" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1.5fr) auto' }}>
              <input aria-label={`Nama baris ${i + 1}`} className="cg-input" placeholder="Nama barang atau jasa" maxLength={120} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
              <input aria-label={`Jumlah baris ${i + 1}`} className="cg-input cg-num" inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })} />
              <input aria-label={`Harga satuan baris ${i + 1}`} className="cg-input cg-num" inputMode="numeric" placeholder="Harga (Rp)" value={r.price} onChange={(e) => setRow(r.key, { price: digits(e.target.value) })} />
              <button type="button" className="cg-btn cg-btn--ghost" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Trash2 className="cg-icon" aria-hidden />
              </button>
            </div>
          ))}
          <div><button type="button" className="cg-btn cg-btn--secondary" onClick={() => setRows((rs) => [...rs, blank()])}><Plus className="cg-icon" aria-hidden /> Tambah baris</button></div>
        </fieldset>

        <div className="grid gap-12" style={GRID}>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-diskon">Diskon (Rp)</label>
            <input id="fj-diskon" className="cg-input cg-num" inputMode="numeric" value={f.discount} onChange={(e) => set({ discount: digits(e.target.value) })} />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-pajak">Pajak (Rp)</label>
            <input id="fj-pajak" className="cg-input cg-num" inputMode="numeric" value={f.tax} onChange={(e) => set({ tax: digits(e.target.value) })} />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="fj-uangmuka">Uang muka (Rp)</label>
            <input id="fj-uangmuka" className="cg-input cg-num" inputMode="numeric" value={f.down} onChange={(e) => set({ down: digits(e.target.value) })} />
          </div>
          {down > 0 && (
            <div className="cg-field">
              <label className="cg-label" htmlFor="fj-akun">Uang muka masuk ke</label>
              <select id="fj-akun" className="cg-input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                {cash.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="fj-catatan">Catatan (opsional)</label>
          <input id="fj-catatan" className="cg-input" maxLength={300} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </div>

        <dl className="grid gap-8" style={{ ...GRID, margin: 0 }} aria-label="Ringkasan faktur">
          <div><dt className="text-sm text-text-muted">Subtotal</dt><dd className="cg-num" style={{ margin: 0 }}>{formatRp(totals.subtotal)}</dd></div>
          <div><dt className="text-sm text-text-muted">Total faktur</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{formatRp(totals.total)}</strong></dd></div>
          <div><dt className="text-sm text-text-muted">Sisa tagihan</dt><dd className="cg-num" style={{ margin: 0 }}>{formatRp(Math.max(0, totals.total - down))}</dd></div>
        </dl>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Buat faktur'}</button>
        </div>
      </form>
    </dialog>
  );
}

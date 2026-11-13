'use client';

import { Fragment, useMemo, useState } from 'react';
import { Banknote, FilePlus2 } from 'lucide-react';
import { SALES_INVOICE_STATUS_LABEL, formatRp, salesInvoiceOverdue, type SalesInvoice, type SalesInvoiceStatus } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { fmtDate, todayKey } from '@/components/fin-common';
import { InvoiceDialog } from '@/components/faktur-penjualan/invoice-dialog';
import { PayDialog } from '@/components/faktur-penjualan/pay-dialog';

type Tab = 'faktur' | 'uangmuka';
type Filter = 'all' | 'unpaid' | SalesInvoiceStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'unpaid', label: 'Belum lunas' },
  { id: 'all', label: 'Semua' },
  { id: 'paid', label: 'Lunas' },
];

export default function SalesInvoicePage() {
  const data = useData();
  const list = useAsync(() => data.listSalesInvoices(), [data]);
  const customers = useAsync(() => data.listCustomers({ limit: 500 }), [data]);
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [tab, setTab] = useState<Tab>('faktur');
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<SalesInvoice | null>(null);
  const [notice, setNotice] = useState('');
  const today = todayKey();

  const all = useMemo(() => (list.status === 'ready' ? list.data : []), [list]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((i) => (filter === 'all' ? true : filter === 'unpaid' ? i.status !== 'paid' : i.status === filter)
      && (!q || i.number.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)));
  }, [all, filter, search]);
  const outstanding = all.reduce((s, i) => s + i.outstanding, 0);
  const overdue = all.filter((i) => salesInvoiceOverdue(i, today));
  const downPayments = useMemo(() => all.filter((i) => i.downPayment > 0), [all]);

  const done = (msg: string) => { setCreating(false); setPaying(null); setNotice(msg); list.reload(); };
  const ready = accounts.status === 'ready' && customers.status === 'ready';

  return (
    <>
      <PageHeader title="Faktur penjualan" subtitle="Tagihan ke pelanggan dengan termin, uang muka, dan pembayaran bertahap. Piutang dan penjualan langsung menjadi jurnal."
        actions={<button className="cg-btn cg-btn--primary" disabled={!ready} onClick={() => { setNotice(''); setCreating(true); }}><FilePlus2 className="cg-icon" aria-hidden /> Faktur baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}</div>}
      {list.status === 'ready' && (
        <>
          <div className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }} aria-label="Ringkasan piutang">
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><span className="block text-sm text-text-muted">Total piutang</span><strong className="cg-num">{formatRp(outstanding)}</strong></div>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><span className="block text-sm text-text-muted">Lewat jatuh tempo</span><strong className="cg-num">{overdue.length} faktur · {formatRp(overdue.reduce((s, i) => s + i.outstanding, 0))}</strong></div>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><span className="block text-sm text-text-muted">Uang muka diterima</span><strong className="cg-num">{formatRp(downPayments.reduce((s, i) => s + i.downPayment, 0))}</strong></div>
          </div>
          <div role="tablist" aria-label="Tampilan" className="flex gap-8 mb-12">
            {([['faktur', 'Daftar faktur'], ['uangmuka', 'Laporan uang muka']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`cg-btn ${tab === id ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === 'faktur' && (
            <>
              <div className="flex flex-wrap gap-12 mb-12 items-end">
                <div className="cg-field"><label className="cg-label" htmlFor="fj-cari">Cari nomor atau pelanggan</label><input id="fj-cari" className="cg-input" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <div role="group" aria-label="Filter status" className="flex gap-8">
                  {FILTERS.map((f) => <button key={f.id} aria-pressed={filter === f.id} className={`cg-btn ${filter === f.id ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}
                </div>
              </div>
              {shown.length === 0 ? (
                <div className="cg-empty"><p><strong>{all.length === 0 ? 'Belum ada faktur penjualan.' : 'Tidak ada faktur yang cocok.'}</strong></p><p className="text-text-muted">{all.length === 0 ? 'Pilih Faktur baru untuk menagih pelanggan dengan termin.' : 'Ubah filter atau kata kunci.'}</p></div>
              ) : (
                <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Faktur penjualan">
                  <thead><tr><th>Nomor</th><th>Pelanggan</th><th>Tanggal</th><th>Jatuh tempo</th><th className="text-right">Total</th><th className="text-right">Sisa</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead>
                  <tbody>
                    {shown.map((i) => (
                      <Fragment key={i.id}>
                        <tr>
                          <td><button className="cg-btn cg-btn--ghost" aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>{i.number}</button></td>
                          <td>{i.customerName}</td><td>{fmtDate(i.invoiceDate)}</td>
                          <td>{fmtDate(i.dueDate)}{salesInvoiceOverdue(i, today) && <span className="cg-badge cg-badge--danger"> Terlambat</span>}</td>
                          <td className="text-right cg-num">{formatRp(i.total)}</td><td className="text-right cg-num">{formatRp(i.outstanding)}</td>
                          <td><span className={`cg-badge ${i.status === 'paid' ? 'cg-badge--success' : ''}`}>{SALES_INVOICE_STATUS_LABEL[i.status]}</span></td>
                          <td>{i.status !== 'paid' && <button className="cg-btn cg-btn--secondary" onClick={() => { setNotice(''); setPaying(i); }}><Banknote className="cg-icon" aria-hidden /> Terima bayar</button>}</td>
                        </tr>
                        {open === i.id && (
                          <tr><td colSpan={8}>
                            <ul className="grid gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={`Rincian ${i.number}`}>
                              {i.lines.map((l) => <li key={l.id} className="flex justify-between gap-12"><span>{l.name} × {l.qty}</span><span className="cg-num">{formatRp(l.lineTotal)}</span></li>)}
                              <li className="flex justify-between gap-12 text-text-muted"><span>Diskon {formatRp(i.discount)} · Pajak {formatRp(i.taxAmount)} · Termin {i.termDays} hari</span><span className="cg-num">Total {formatRp(i.total)}</span></li>
                              {i.payments.map((p) => <li key={p.id} className="flex justify-between gap-12 text-text-muted"><span>{fmtDate(p.paidOn)} · {p.isDownPayment ? 'Uang muka' : (p.note ?? 'Pembayaran')}</span><span className="cg-num">{formatRp(p.amount)}</span></li>)}
                              {i.note && <li className="text-text-muted">Catatan: {i.note}</li>}
                            </ul>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table></div>
              )}
            </>
          )}

          {tab === 'uangmuka' && (
            downPayments.length === 0 ? (
              <div className="cg-empty"><p><strong>Belum ada uang muka.</strong></p><p className="text-text-muted">Uang muka yang diterima saat membuat faktur akan tampil di sini.</p></div>
            ) : (
              <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Laporan uang muka">
                <thead><tr><th>Tanggal</th><th>Faktur</th><th>Pelanggan</th><th className="text-right">Uang muka</th><th className="text-right">Total faktur</th><th className="text-right">Sisa tagihan</th><th>Status</th></tr></thead>
                <tbody>{downPayments.map((i) => (
                  <tr key={i.id}><td>{fmtDate(i.invoiceDate)}</td><td>{i.number}</td><td>{i.customerName}</td><td className="text-right cg-num">{formatRp(i.downPayment)}</td><td className="text-right cg-num">{formatRp(i.total)}</td><td className="text-right cg-num">{formatRp(i.outstanding)}</td><td>{SALES_INVOICE_STATUS_LABEL[i.status]}</td></tr>
                ))}</tbody>
                <tfoot><tr><th colSpan={3}>Jumlah</th><th className="text-right cg-num">{formatRp(downPayments.reduce((s, i) => s + i.downPayment, 0))}</th><th className="text-right cg-num">{formatRp(downPayments.reduce((s, i) => s + i.total, 0))}</th><th className="text-right cg-num">{formatRp(downPayments.reduce((s, i) => s + i.outstanding, 0))}</th><th /></tr></tfoot>
              </table></div>
            )
          )}
        </>
      )}
      {creating && accounts.status === 'ready' && customers.status === 'ready' && (
        <InvoiceDialog customers={customers.data} accounts={accounts.data} onClose={() => setCreating(false)} onDone={(inv) => done(`Faktur ${inv.number} untuk ${inv.customerName} dibuat: ${formatRp(inv.total)}, sisa ${formatRp(inv.outstanding)}.`)} />
      )}
      {paying && accounts.status === 'ready' && (
        <PayDialog invoice={paying} accounts={accounts.data} onClose={() => setPaying(null)} onDone={(inv) => done(`Pembayaran ${inv.number} dicatat. ${inv.status === 'paid' ? 'Faktur lunas.' : `Sisa ${formatRp(inv.outstanding)}.`}`)} />
      )}
    </>
  );
}

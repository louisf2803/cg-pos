'use client';

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { SALES_INVOICE_STATUS_LABEL, formatRp, toCsv } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { fmtDate } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

export default function DownPaymentReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const list = useAsync(() => data.listSalesInvoices(), [data]);

  const rows = useMemo(() => {
    if (list.status !== 'ready') return [];
    // range.from/to berupa ISO UTC; tanggal faktur berupa tanggal lokal, jadi bandingkan memakai tanggal lokal rentang
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(range.from));
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(new Date(range.to).getTime() - 1000));
    return list.data.filter((i) => i.downPayment > 0 && i.invoiceDate >= f && i.invoiceDate <= t);
  }, [list, range.from, range.to, tz]);
  const sum = (pick: (i: (typeof rows)[number]) => number) => rows.reduce((s, i) => s + pick(i), 0);

  function downloadCsv() {
    if (rows.length === 0) return;
    downloadCsvWithHistory({
      fileName: `laporan-uang-muka-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent: toCsv([['Tanggal', 'Faktur', 'Pelanggan', 'Uang muka', 'Total faktur', 'Sisa tagihan', 'Status'], ...rows.map((i) => [i.invoiceDate, i.number, i.customerName, i.downPayment, i.total, i.outstanding, SALES_INVOICE_STATUS_LABEL[i.status]])]),
      reportName: 'Laporan uang muka', period: range.label, rowCount: rows.length, sourceUrl: '/laporan/uang-muka',
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Laporan uang muka" subtitle={`Uang muka dari faktur penjualan · ${range.label}`}
        actions={<button className="cg-btn cg-btn--secondary" onClick={downloadCsv} disabled={rows.length === 0}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <div className="mb-16"><RangePicker value={value} today={today} onChange={setValue} /></div>
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat data">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {list.status === 'ready' && rows.length === 0 && <div className="cg-empty"><p><strong>Belum ada uang muka pada rentang ini.</strong></p><p className="text-text-muted">Uang muka tercatat saat membuat faktur penjualan.</p></div>}
      {list.status === 'ready' && rows.length > 0 && (
        <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Laporan uang muka">
          <thead><tr><th>Tanggal</th><th>Faktur</th><th>Pelanggan</th><th className="text-right">Uang muka</th><th className="text-right">Total faktur</th><th className="text-right">Sisa tagihan</th><th>Status</th></tr></thead>
          <tbody>{rows.map((i) => <tr key={i.id}><td>{fmtDate(i.invoiceDate)}</td><td>{i.number}</td><td>{i.customerName}</td><td className="text-right cg-num">{formatRp(i.downPayment)}</td><td className="text-right cg-num">{formatRp(i.total)}</td><td className="text-right cg-num">{formatRp(i.outstanding)}</td><td>{SALES_INVOICE_STATUS_LABEL[i.status]}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan={3}>Jumlah</th><th className="text-right cg-num">{formatRp(sum((i) => i.downPayment))}</th><th className="text-right cg-num">{formatRp(sum((i) => i.total))}</th><th className="text-right cg-num">{formatRp(sum((i) => i.outstanding))}</th><th /></tr></tfoot>
        </table></div>
      )}
    </div>
  );
}

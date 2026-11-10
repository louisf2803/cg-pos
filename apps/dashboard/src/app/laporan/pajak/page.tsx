'use client';
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { buildTaxReport, formatRp, toCsv, type TaxRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const money = (n: number) => (n < 0 ? `-${formatRp(-n)}` : formatRp(n));

export default function TaxReportPage() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const report = useMemo(() => (state.status === 'ready' && state.data ? buildTaxReport(state.data.orders, tz) : null), [state, tz]);

  function download() {
    if (!report) return;
    const head = ['Kelompok', 'Transaksi', 'Setelah diskon', 'Biaya layanan', 'Pajak', 'Pembulatan', 'Total'];
    const line = (r: TaxRow) => [r.label, r.count, r.afterDiscount, r.serviceCharge, r.tax, r.rounding, r.total];
    const rows: (string | number)[][] = [head, ...report.byDay.map(line), [], ['Jenis order', ...head.slice(1)], ...report.byType.map(line), [], line(report.totals)];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `pajak-${range.label.replace(/ sampai /, '_')}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Pajak dan biaya layanan" subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Pajak, biaya layanan, dan pembulatan dari pesanan lunas'}
        actions={<button className="cg-btn cg-btn--secondary" onClick={download} disabled={!report?.totals.count}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <RangePicker value={value} today={today} onChange={setValue} />
      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {(ctx.status === 'loading' || state.status === 'loading') && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {report && report.totals.count === 0 && <div className="cg-empty"><p><strong>Tidak ada penjualan pada rentang ini.</strong></p><p className="text-text-muted">Pajak dan biaya layanan dihitung dari pesanan yang sudah lunas.</p></div>}
      {report && report.totals.count > 0 && (
        <div className="grid gap-24">
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Ringkasan pajak">
            <Stat label="Penjualan setelah diskon" value={money(report.totals.afterDiscount)} />
            <Stat label="Biaya layanan" value={money(report.totals.serviceCharge)} testId="biaya-layanan" />
            <Stat label="Pajak" value={money(report.totals.tax)} testId="pajak" />
            <Stat label="Pembulatan" value={money(report.totals.rounding)} />
            <Stat label="Total diterima" value={money(report.totals.total)} />
          </div>
          <Group title="Per hari" rows={report.byDay} />
          <Group title="Per jenis order" rows={report.byType} />
          <p className="text-sm text-text-muted">Angka dihitung dari pesanan lunas pada rentang tanggal tutup. Refund tidak mengurangi pajak di laporan ini.</p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div className="border border-border rounded-lg bg-surface-raised p-12"><span className="block text-sm text-text-muted">{label}</span><strong className="cg-num" data-testid={testId}>{value}</strong></div>;
}

function Group({ title, rows }: { title: string; rows: TaxRow[] }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold mb-8">{title}</h2>
      <ul className="grid gap-8">
        {rows.map((r) => (
          <li key={r.key} className="border border-border rounded-lg bg-surface-raised p-12 grid gap-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-8"><strong className="break-words min-w-0">{r.label}</strong><span className="text-sm text-text-muted">{r.count} transaksi</span></div>
            <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <span><span className="block text-text-muted">Setelah diskon</span><span className="cg-num">{money(r.afterDiscount)}</span></span>
              <span><span className="block text-text-muted">Biaya layanan</span><span className="cg-num">{money(r.serviceCharge)}</span></span>
              <span><span className="block text-text-muted">Pajak</span><span className="cg-num">{money(r.tax)}</span></span>
              <span><span className="block text-text-muted">Pembulatan</span><span className="cg-num">{money(r.rounding)}</span></span>
              <span><span className="block text-text-muted">Total</span><strong className="cg-num">{money(r.total)}</strong></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

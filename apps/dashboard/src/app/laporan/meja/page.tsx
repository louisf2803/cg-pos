'use client';
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { buildTableReport, formatRp, toCsv, type TableReportRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { downloadCsvWithHistory } from '@/lib/export';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function TableReportPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const layout = useAsync(async () => { const [tables, floors] = await Promise.all([data.listTables(), data.listFloors()]); return { tables, floors }; }, [data]);
  const report = useMemo(() => (state.status === 'ready' && state.data && layout.status === 'ready' ? buildTableReport(state.data.orders, layout.data.tables, layout.data.floors) : null), [state, layout]);

  function download() {
    if (!report) return;
    const head = ['Meja', 'Lantai', 'Kunjungan', 'Tamu', 'Penjualan', 'Rata-rata per kunjungan', 'Rata-rata per tamu'];
    const line = (r: TableReportRow) => [r.label, r.floor, r.visits, r.guests, r.total, r.avgPerVisit, r.avgPerGuest ?? ''];
    downloadCsvWithHistory({
      fileName: `meja-${range.label.replace(/ sampai /, '_')}.csv`,
      csvContent: toCsv([head, ...report.rows.map(line), [], line(report.totals)]),
      reportName: 'Laporan Meja',
      period: range.label,
      rowCount: report.rows.length,
      sourceUrl: '/laporan/meja',
    });
  }
  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : layout.status === 'error' ? layout : null;
  const loading = ctx.status === 'loading' || state.status === 'loading' || layout.status === 'loading';
  return (
    <>
      <PageHeader title="Laporan meja" subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Pemakaian dan penjualan tiap meja'}
        actions={<button className="cg-btn cg-btn--secondary" onClick={download} disabled={!report?.totals.visits}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <RangePicker value={value} today={today} onChange={setValue} />
      {err && <ErrorBox message={err.message} onRetry={err.reload} />}
      {loading && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {report && report.totals.visits === 0 && <div className="cg-empty"><p><strong>Tidak ada penjualan pada rentang ini.</strong></p><p className="text-text-muted">Laporan meja dihitung dari pesanan yang sudah lunas.</p></div>}
      {report && report.totals.visits > 0 && (
        <div className="grid gap-24">
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Ringkasan meja">
            <Stat label="Kunjungan" value={num(report.totals.visits)} testId="kunjungan" />
            <Stat label="Tamu" value={num(report.totals.guests)} />
            <Stat label="Penjualan" value={formatRp(report.totals.total)} />
            <Stat label="Rata-rata per tamu" value={report.totals.avgPerGuest === null ? '—' : formatRp(report.totals.avgPerGuest)} />
          </div>
          <Group title="Per lantai" rows={report.byFloor} />
          <Group title="Per meja" rows={report.rows} showFloor />
          <p className="text-sm text-text-muted">Satu kunjungan = satu pesanan lunas di meja itu. Rata-rata per tamu hanya memakai pesanan yang jumlah tamunya diisi.</p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div className="border border-border rounded-lg bg-surface-raised p-12"><span className="block text-sm text-text-muted">{label}</span><strong className="cg-num" data-testid={testId}>{value}</strong></div>;
}

function Group({ title, rows, showFloor }: { title: string; rows: TableReportRow[]; showFloor?: boolean }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold mb-8">{title}</h2>
      <ul className="grid gap-8">
        {rows.map((r) => (
          <li key={r.key} className="border border-border rounded-lg bg-surface-raised p-12 grid gap-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-8"><strong className="break-words min-w-0">{r.label}{showFloor && r.floor && r.floor !== r.label ? <span className="text-text-muted font-normal"> · {r.floor}</span> : null}</strong><span className="text-sm text-text-muted">{num(r.visits)} kunjungan</span></div>
            <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <span><span className="block text-text-muted">Tamu</span><span className="cg-num">{num(r.guests)}</span></span>
              <span><span className="block text-text-muted">Penjualan</span><strong className="cg-num">{formatRp(r.total)}</strong></span>
              <span><span className="block text-text-muted">Per kunjungan</span><span className="cg-num">{formatRp(r.avgPerVisit)}</span></span>
              <span><span className="block text-text-muted">Per tamu</span><span className="cg-num">{r.avgPerGuest === null ? '—' : formatRp(r.avgPerGuest)}</span></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';
import { ErrorBox, PageHeader } from '@/components/page';
import { ReportView } from '@/components/report-view';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

export default function LaporanPenjualan() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const sub = ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined;
  return (
    <>
      <PageHeader title="Laporan penjualan" subtitle={sub} />
      <RangePicker value={value} today={today} onChange={setValue} />
      {(ctx.status === 'error') && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {(ctx.status === 'loading' || state.status === 'loading' || (state.status === 'ready' && !state.data && ctx.status === 'ready')) && (
        <div className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}</div>
      )}
      {state.status === 'ready' && state.data && (() => {
        const { report: r } = state.data; const s = r.summary;
        if (s.orderCount === 0) return <div className="cg-empty"><p><strong>Tidak ada penjualan pada rentang ini.</strong></p><p className="text-text-muted">Coba rentang yang lebih panjang.</p></div>;
        return <ReportView report={r} />;
      })()}
    </>
  );
}

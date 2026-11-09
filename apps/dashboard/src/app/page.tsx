'use client';
import { buildSalesReport } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { dayRange } from '@/lib/range';
import { ErrorBox, PageHeader } from '@/components/page';
import { ReportView } from '@/components/report-view';

export default function Beranda() {
  const data = useData();
  const state = useAsync(async () => {
    const ctx = await data.getContext();
    const r = dayRange(ctx.timezone);
    const [orders, products, categories, employees, refunds, voided] = await Promise.all([
      data.listOrders({ status: 'paid', from: r.from, to: r.to, by: 'closed', all: true }),
      data.listProducts({ includeInactive: true }), data.listCategories(), data.listManagedEmployees(),
      data.listRefundsBetween(r), data.listOrders({ status: 'void', from: r.from, to: r.to, by: 'closed', all: true }),
    ]);
    const report = buildSalesReport({ orders, products, categories, employees, timezone: ctx.timezone, refunds, voided });
    const low = products.filter((p) => p.trackStock && p.isActive && p.stock !== undefined).sort((a, b) => a.stock! - b.stock!).slice(0, 5);
    return { ctx, r, report, low };
  }, [data]);

  if (state.status === 'error') return <><PageHeader title="Ringkasan penjualan" /><ErrorBox message={state.message} onRetry={state.reload} /></>;
  if (state.status === 'loading') return (
    <>
      <PageHeader title="Ringkasan penjualan" />
      <div className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4" aria-busy="true" aria-label="Memuat">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 96 }} />)}
      </div>
    </>
  );

  const { ctx, r, report, low } = state.data;
  return (
    <>
      <PageHeader title="Ringkasan penjualan" subtitle={`${ctx.outletName} · ${r.label}`} />
      {report.summary.orderCount === 0 ? (
        <div className="cg-empty">
          <p><strong>Belum ada penjualan hari ini.</strong></p>
          <p className="text-text-muted">Angka akan muncul begitu kasir menyelesaikan pesanan pertama.</p>
        </div>
      ) : (
        <div className="grid gap-24">
          <ReportView report={report} showHours />
          {low.length > 0 && (
            <section aria-labelledby="h-stok" className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
              <h2 id="h-stok" className="text-lg mb-12">Stok terendah</h2>
              <ul className="grid gap-8">
                {low.map((p) => <li key={p.id} className="flex justify-between gap-12"><span className="break-words min-w-0">{p.name}</span><span className="cg-num">{p.stock}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

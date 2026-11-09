'use client';
import { formatRp } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { dayRange } from '@/lib/range';
import { ErrorBox, PageHeader } from '@/components/page';

export default function Beranda() {
  const data = useData();
  const state = useAsync(async () => {
    const ctx = await data.getContext();
    const r = dayRange(ctx.timezone);
    return { ctx, r, s: await data.salesSummary(r) };
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

  const { ctx, r, s } = state.data;
  const active = s.byHour.filter((h) => h.total > 0).map((h) => h.hour);
  const lo = Math.min(...active), hi = Math.max(...active);
  const hours = s.byHour.filter((h) => h.hour >= lo - 1 && h.hour <= hi + 1);
  const maxHour = Math.max(1, ...hours.map((h) => h.total));
  return (
    <>
      <PageHeader title="Ringkasan penjualan" subtitle={`${ctx.outletName} · ${r.label}`} />
      {s.orderCount === 0 ? (
        <div className="cg-empty">
          <p><strong>Belum ada penjualan hari ini.</strong></p>
          <p className="text-text-muted">Angka akan muncul begitu kasir menyelesaikan pesanan pertama.</p>
        </div>
      ) : (
        <div className="grid gap-24">
          <dl className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4">
            <Kpi label="Penjualan" value={formatRp(s.total)} />
            <Kpi label="Transaksi" value={String(s.orderCount)} />
            <Kpi label="Rata-rata per transaksi" value={formatRp(s.avgTicket)} />
            <Kpi label="Pajak dan biaya layanan" value={formatRp(s.tax + s.serviceCharge)} />
          </dl>
          <div className="grid gap-24 desktop:grid-cols-2">
            <section aria-labelledby="h-jam" className="border border-border rounded-lg bg-surface-raised p-16">
              <h2 id="h-jam" className="text-lg mb-12">Penjualan per jam</h2>
              <ul className="grid gap-8">
                {hours.map((h) => (
                  <li key={h.hour} className="grid grid-cols-[48px_1fr_104px] items-center gap-8">
                    <span className="text-text-muted cg-num">{String(h.hour).padStart(2, '0')}:00</span>
                    <span className="block h-[12px] rounded-pill bg-accent-soft" aria-hidden>
                      <span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.round((h.total / maxHour) * 100)}%` }} />
                    </span>
                    <span className="cg-num text-right">{formatRp(h.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="h-top" className="border border-border rounded-lg bg-surface-raised p-16">
              <h2 id="h-top" className="text-lg mb-12">Produk terlaris</h2>
              <div className="cg-data-wrap">
                <table className="cg-data" style={{ minWidth: 0 }}>
                  <thead><tr><th>Produk</th><th className="cg-num">Terjual</th><th className="cg-num">Nilai</th></tr></thead>
                  <tbody>
                    {s.topProducts.map((p) => (
                      <tr key={p.productId}><td className="break-words">{p.name}</td><td className="cg-num">{p.qty}</td><td className="cg-num">{formatRp(p.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section aria-labelledby="h-metode" className="border border-border rounded-lg bg-surface-raised p-16">
              <h2 id="h-metode" className="text-lg mb-12">Per metode bayar</h2>
              <ul className="grid gap-8">
                {s.byMethod.map((m) => (
                  <li key={m.methodName} className="flex justify-between gap-12">
                    <span>{m.methodName} <span className="text-text-muted">· {m.count}x</span></span>
                    <span className="cg-num">{formatRp(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg bg-surface-raised p-16">
      <dt className="text-text-muted text-sm">{label}</dt>
      <dd className="text-xl cg-num mt-4">{value}</dd>
    </div>
  );
}

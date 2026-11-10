'use client';
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { buildPromoReport, formatRp, toCsv, type PromoRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);

export default function PromoReportPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const extra = useAsync(async () => {
    const [uses, promotions, coupons] = await Promise.all([data.listDiscountUses({ from: range.from, to: range.to }), data.listPromotions(), data.listCoupons()]);
    return { uses, promotions, coupons };
  }, [data, range.from, range.to]);
  const report = useMemo(() => {
    if (state.status !== 'ready' || !state.data || extra.status !== 'ready') return null;
    const s = state.data.report.summary;
    return buildPromoReport({ ...extra.data, grossSales: s.gross, orderCount: s.orderCount, employeeNames: state.data.names });
  }, [state, extra]);

  function download() {
    if (!report) return;
    const head = ['Kelompok', 'Pesanan', 'Potongan', 'Persen dari total potongan'];
    const line = (r: PromoRow) => [r.label, r.orders, r.amount, r.share];
    const url = URL.createObjectURL(new Blob([toCsv([['Jalur', ...head.slice(1)], ...report.bySource.map(line), [], ['Promo', ...head.slice(1)], ...report.byPromotion.map(line), [], ['Kupon', ...head.slice(1)], ...report.byCoupon.map(line), [], ['Diskon manual: pemberi izin', ...head.slice(1)], ...report.byAuthorizer.map(line)])], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `promo-${range.label.replace(/ sampai /, '_')}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : extra.status === 'error' ? extra : null;
  const loading = ctx.status === 'loading' || state.status === 'loading' || extra.status === 'loading';
  return (
    <>
      <PageHeader title="Laporan promo dan diskon" subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Potongan harga yang diberikan'}
        actions={<button className="cg-btn cg-btn--secondary" onClick={download} disabled={!report?.discountedOrders}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <RangePicker value={value} today={today} onChange={setValue} />
      {err && <ErrorBox message={err.message} onRetry={err.reload} />}
      {loading && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {report && report.discountedOrders === 0 && <div className="cg-empty"><p><strong>Tidak ada diskon atau promo pada rentang ini.</strong></p><p className="text-text-muted">Dihitung dari pesanan lunas yang memakai promo, kupon, diskon manual, atau tukar poin.</p></div>}
      {report && report.discountedOrders > 0 && (
        <div className="grid gap-24">
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Ringkasan promo">
            <Stat label="Total potongan" value={formatRp(report.totalAmount)} testId="total-potongan" />
            <Stat label="Pesanan berdiskon" value={`${num(report.discountedOrders)} dari ${num(report.orderCount)}`} />
            <Stat label="Potongan dari penjualan kotor" value={report.ratePct === null ? '—' : `${num(report.ratePct)}%`} />
            <Stat label="Poin ditukar" value={num(report.pointsRedeemed)} />
          </div>
          <Group title="Per jalur" rows={report.bySource} />
          {report.byPromotion.length > 0 && <Group title="Per promo" rows={report.byPromotion} />}
          {report.byCoupon.length > 0 && <Group title="Per kupon" rows={report.byCoupon} />}
          {report.byAuthorizer.length > 0 && <Group title="Diskon manual menurut pemberi izin" rows={report.byAuthorizer} />}
          <p className="text-sm text-text-muted">Satu pesanan bisa memakai lebih dari satu potongan, jadi jumlah pesanan antar kelompok boleh lebih besar dari pesanan berdiskon. Poin loyalti yang ditambahkan tidak dihitung di sini.</p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div className="border border-border rounded-lg bg-surface-raised p-12"><span className="block text-sm text-text-muted">{label}</span><strong className="cg-num" data-testid={testId}>{value}</strong></div>;
}

function Group({ title, rows }: { title: string; rows: PromoRow[] }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold mb-8">{title}</h2>
      <ul className="grid gap-8">
        {rows.map((r) => (
          <li key={r.key} className="border border-border rounded-lg bg-surface-raised p-12 grid gap-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-8"><strong className="break-words min-w-0">{r.label}</strong><span className="text-sm text-text-muted">{num(r.orders)} pesanan</span></div>
            <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <span><span className="block text-text-muted">Potongan</span><strong className="cg-num">{formatRp(r.amount)}</strong></span>
              <span><span className="block text-text-muted">Bagian dari total</span><span className="cg-num">{num(r.share)}%</span></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

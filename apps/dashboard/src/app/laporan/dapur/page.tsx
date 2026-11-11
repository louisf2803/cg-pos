'use client';

import { useMemo } from 'react';
import { ChefHat, Clock, Download, Flame, UtensilsCrossed } from 'lucide-react';
import { buildKitchenReport, toCsv, type KitchenReportStationRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { downloadCsvWithHistory } from '@/lib/export';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function KitchenReportPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();

  const extra = useAsync(async () => {
    const [tickets, voidedOrders, products, categories] = await Promise.all([
      data.kitchenBoard(24 * 60 * 365),
      data.listOrders({ status: 'void', from: range.from, to: range.to, by: 'closed', all: true }),
      data.listProducts({ includeInactive: true }),
      data.listCategories(),
    ]);
    return { tickets, voidedOrders, products, categories };
  }, [data, range.from, range.to]);

  const report = useMemo(() => {
    if (extra.status !== 'ready' || !extra.data) return null;

    const fromTime = new Date(range.from).getTime();
    const toTime = new Date(range.to).getTime();

    // Filter tiket dapur yang waktu kirimnya berada dalam rentang terpilih
    const inRangeTickets = extra.data.tickets.filter((t) => {
      const time = new Date(t.sentAt).getTime();
      return isNaN(time) || (time >= fromTime && time <= toTime);
    });

    return buildKitchenReport({
      tickets: inRangeTickets,
      voidedOrders: extra.data.voidedOrders,
      products: extra.data.products,
      categories: extra.data.categories,
      timezone: ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta',
    });
  }, [extra, range, ctx]);

  function downloadCsv() {
    if (!report) return;

    const stationHead = ['Stasiun Dapur', 'Jumlah Tiket', 'Total Porsi / Item', 'Item Selesai', 'Rata-rata Waktu Siap (Menit)'];
    const stationLines = report.byStation.map((s) => [
      s.stationName,
      s.ticketCount,
      s.itemCount,
      s.readyItemCount,
      s.avgReadyMinutes !== null ? s.avgReadyMinutes : '',
    ]);

    const hourHead = ['Jam Operasional', 'Jumlah Tiket', 'Total Porsi / Item', 'Item Selesai', 'Rata-rata Waktu Siap (Menit)'];
    const hourLines = report.byHour.map((h) => [
      h.label,
      h.ticketCount,
      h.itemCount,
      h.readyItemCount,
      h.avgReadyMinutes !== null ? h.avgReadyMinutes : '',
    ]);

    const statusHead = ['Status Tiket', 'Jumlah Tiket', 'Total Item'];
    const statusLines = report.byStatus.map((st) => [st.label, st.ticketCount, st.itemCount]);

    const totalsHead = ['TOTAL OPERASIONAL DAPUR', 'Nilai'];
    const totalsLines = [
      ['Total Tiket', report.totals.totalTickets],
      ['Tiket Selesai', report.totals.completedTickets],
      ['Tiket Dalam Proses', report.totals.inProgressTickets],
      ['Tiket Dibatalkan', report.totals.cancelledTickets],
      ['Total Porsi / Item', report.totals.totalItems],
      ['Rata-rata Waktu Siap (Menit)', report.totals.avgReadyMinutes !== null ? report.totals.avgReadyMinutes : '—'],
    ];

    const csvContent = toCsv([
      totalsHead,
      ...totalsLines,
      [],
      stationHead,
      ...stationLines,
      [],
      hourHead,
      ...hourLines,
      [],
      statusHead,
      ...statusLines,
    ]);

    downloadCsvWithHistory({
      fileName: `laporan-dapur-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent,
      reportName: 'Laporan Dapur',
      period: range.label,
      rowCount: report.totals.totalTickets,
      sourceUrl: '/laporan/dapur',
    });
  }

  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : extra.status === 'error' ? extra : null;
  const loading = ctx.status === 'loading' || state.status === 'loading' || extra.status === 'loading';

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Laporan dapur"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Kecepatan penyajian, beban tiket per jam, dan stasiun operasional'}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!report || (report.totals.totalTickets === 0 && report.totals.cancelledTickets === 0)}
          >
            <Download className="w-16 h-16 mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan dapur">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px] rounded-lg" />
        </div>
      )}

      {report && report.totals.totalTickets === 0 && report.totals.cancelledTickets === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada aktivitas tiket dapur pada rentang ini.</strong>
          </p>
          <p className="text-text-muted">
            Data dihitung dari tiket pesanan yang dikirim ke layar dapur beserta status prosesnya.
          </p>
        </div>
      )}

      {report && (report.totals.totalTickets > 0 || report.totals.cancelledTickets > 0) && (
        <div className="space-y-24 min-w-0">
          {/* Ringkasan KPI Dapur */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12" aria-label="Ringkasan operasional dapur">
            <StatCard
              label="Total tiket dapur"
              value={`${num(report.totals.totalTickets)} tiket`}
              subtext={`${num(report.totals.totalItems)} porsi dipesan`}
              primary
              testId="total-tiket"
            />
            <StatCard
              label="Waktu rata-rata siap"
              value={report.totals.avgReadyMinutes !== null ? `${report.totals.avgReadyMinutes} menit` : '—'}
              subtext="Dari pesanan dikirim ke dapur"
              testId="rata-rata-siap"
            />
            <StatCard
              label="Tiket selesai"
              value={`${num(report.totals.completedTickets)} tiket`}
              subtext={`${num(report.totals.inProgressTickets)} tiket dalam proses`}
              testId="tiket-selesai"
            />
            <StatCard
              label="Tiket batal"
              value={`${num(report.totals.cancelledTickets)} tiket`}
              subtext="Pesanan dibatalkan (void)"
              testId="tiket-batal"
            />
          </div>

          {/* Sebaran Status Tiket */}
          <div className="p-16 border border-border rounded-xl bg-surface">
            <h2 className="text-sm font-semibold mb-12 flex items-center gap-8">
              <Clock className="w-16 h-16 text-primary" aria-hidden /> Status tiket saat ini
            </h2>
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
              {report.byStatus.map((st) => (
                <div key={st.status} className="p-12 rounded-lg bg-surface-raised border border-border/50">
                  <span className="block text-xs text-text-muted">{st.label}</span>
                  <strong className="text-base cg-num block mt-4">{num(st.ticketCount)} tiket</strong>
                  <span className="text-xs text-text-muted block mt-2">{num(st.itemCount)} item</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rincian Per Stasiun Dapur */}
          <div className="border border-border rounded-xl bg-surface overflow-hidden min-w-0">
            <div className="p-16 border-b border-border">
              <h2 className="text-base font-semibold flex items-center gap-8">
                <ChefHat className="w-[18px] h-[18px] text-primary" aria-hidden /> Kinerja per stasiun dapur
              </h2>
              <p className="text-xs text-text-muted mt-2">
                Pengelompokan berdasarkan kategori produk (misal Makanan, Minuman, Dapur Utama)
              </p>
            </div>

            {/* Desktop Table */}
            <div className="hidden tablet:block overflow-x-auto min-w-0">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-xs text-text-muted uppercase">
                    <th className="py-12 px-16 font-medium">Stasiun</th>
                    <th className="py-12 px-16 font-medium text-right">Tiket</th>
                    <th className="py-12 px-16 font-medium text-right">Total Porsi</th>
                    <th className="py-12 px-16 font-medium text-right">Porsi Siap</th>
                    <th className="py-12 px-16 font-medium text-right">Waktu Rata-rata Siap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.byStation.map((s) => (
                    <tr key={s.key} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="py-12 px-16 font-semibold text-text flex items-center gap-8">
                        <UtensilsCrossed className="w-16 h-16 text-primary shrink-0" aria-hidden />
                        <span>{s.stationName}</span>
                      </td>
                      <td className="py-12 px-16 text-right cg-num">{num(s.ticketCount)}</td>
                      <td className="py-12 px-16 text-right cg-num font-semibold">{num(s.itemCount)}</td>
                      <td className="py-12 px-16 text-right cg-num text-primary">{num(s.readyItemCount)}</td>
                      <td className="py-12 px-16 text-right cg-num">
                        {s.avgReadyMinutes !== null ? `${s.avgReadyMinutes} menit` : '—'}
                      </td>
                    </tr>
                  ))}
                  {report.byStation.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-24 text-center text-text-muted">
                        Tidak ada rincian stasiun dapur pada periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="tablet:hidden divide-y divide-border min-w-0">
              {report.byStation.map((s) => (
                <div key={s.key} className="p-16 space-y-12 min-w-0">
                  <div className="flex items-center justify-between gap-8 min-w-0">
                    <div className="flex items-center gap-8 min-w-0">
                      <UtensilsCrossed className="w-16 h-16 text-primary shrink-0" aria-hidden />
                      <strong className="text-sm block truncate">{s.stationName}</strong>
                    </div>
                    <span className="text-xs px-8 py-4 bg-primary/10 text-primary font-medium rounded-full shrink-0">
                      {s.avgReadyMinutes !== null ? `${s.avgReadyMinutes} mnt` : '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-8 text-xs bg-surface-raised p-8 rounded-lg min-w-0">
                    <div>
                      <span className="text-text-muted block">Tiket</span>
                      <span className="font-semibold cg-num">{num(s.ticketCount)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Total Porsi</span>
                      <span className="font-semibold cg-num">{num(s.itemCount)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Siap</span>
                      <span className="font-semibold cg-num text-primary">{num(s.readyItemCount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Beban Pesanan Per Jam Operasional */}
          {report.byHour.length > 0 && (
            <div className="border border-border rounded-xl bg-surface overflow-hidden min-w-0">
              <div className="p-16 border-b border-border">
                <h2 className="text-base font-semibold flex items-center gap-8">
                  <Flame className="w-[18px] h-[18px] text-warning" aria-hidden /> Beban pesanan per jam
                </h2>
                <p className="text-xs text-text-muted mt-2">
                  Distribusi waktu kirim pesanan dan kecepatan dapur menyelesaikan per jam
                </p>
              </div>

              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-raised border-b border-border text-xs text-text-muted uppercase">
                      <th className="py-12 px-16 font-medium">Jam</th>
                      <th className="py-12 px-16 font-medium text-right">Tiket</th>
                      <th className="py-12 px-16 font-medium text-right">Porsi</th>
                      <th className="py-12 px-16 font-medium text-right">Waktu Siap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.byHour.map((h) => (
                      <tr key={h.hour} className="hover:bg-surface-raised/50 transition-colors">
                        <td className="py-12 px-16 font-medium text-text">{h.label}</td>
                        <td className="py-12 px-16 text-right cg-num">{num(h.ticketCount)}</td>
                        <td className="py-12 px-16 text-right cg-num font-semibold">{num(h.itemCount)}</td>
                        <td className="py-12 px-16 text-right cg-num">
                          {h.avgReadyMinutes !== null ? `${h.avgReadyMinutes} menit` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  primary = false,
  testId,
}: {
  label: string;
  value: string;
  subtext?: string;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
      <div>
        <span className="text-xs text-text-muted font-medium block mb-4 leading-tight break-words">{label}</span>
        <strong className={`text-base tablet:text-xl desktop:text-2xl font-bold block text-left leading-tight tracking-tight ${primary ? 'text-primary' : 'text-text'}`} data-testid={testId}>
          {value}
        </strong>
      </div>
      {subtext && <span className="text-xs text-text-muted block mt-4 leading-tight break-words">{subtext}</span>}
    </div>
  );
}

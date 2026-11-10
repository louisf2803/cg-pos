'use client';
import { useState, useId } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Calendar,
} from 'lucide-react';
import {
  formatRp,
  percentChange,
  getPreviousPeriod,
  getDaysInMonth,
  shiftDateDays,
  monthToDateAccumulation,
  projectMonthEnd,
  buildSalesReport,
  localDateKey,
  type PeriodType,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useShell } from '@/components/shell-context';

const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const INDO_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const monthName = INDO_MONTHS[(m ?? 1) - 1] ?? '';
  return `${d} ${monthName} ${y}`;
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const monthName = INDO_MONTHS_SHORT[(m ?? 1) - 1] ?? '';
  return `${d} ${monthName} ${y}`;
}

function formatYLabel(val: number): string {
  if (val >= 1_000_000) {
    const jt = val / 1_000_000;
    return `${jt % 1 === 0 ? jt : jt.toFixed(1)} jt`;
  }
  if (val >= 1_000) {
    return `${Math.round(val / 1_000)} rb`;
  }
  return `${val}`;
}

/** Menghasilkan kurva cubic bezier mulus (spline) untuk data grafik */
function createSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function Beranda() {
  const data = useData();
  const { selectedOutlet } = useShell();

  // State navigasi waktu
  const [periodType, setPeriodType] = useState<PeriodType>('daily');
  const [currentDateKey, setCurrentDateKey] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const gradientId = useId();

  // Ambil data context outlet, orders periode ini, orders periode lalu, dan data pendukung
  const state = useAsync(async () => {
    const ctx = await data.getContext();
    const todayKey = localDateKey(new Date(), ctx.timezone);

    // Hitung rentang aktif (fromKey, toKey)
    let fromKey = currentDateKey;
    let toKey = currentDateKey;

    if (periodType === 'weekly') {
      fromKey = shiftDateDays(currentDateKey, -6);
      toKey = currentDateKey;
    } else if (periodType === 'monthly') {
      const [y, m] = currentDateKey.split('-').map(Number);
      const year = y ?? 2026;
      const month = m ?? 1;
      const days = getDaysInMonth(year, month);
      fromKey = `${year}-${String(month).padStart(2, '0')}-01`;
      toKey = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
    }

    // Hitung rentang periode sebelumnya
    const prevRange = getPreviousPeriod(periodType, { from: fromKey, to: toKey });

    // Konversi key tanggal lokal ke UTC ISO range
    const offsetHours = ctx.timezone === 'Asia/Jayapura' ? 9 : ctx.timezone === 'Asia/Makassar' ? 8 : 7;
    const toUtcRange = (f: string, t: string) => {
      const s = new Date(`${f}T00:00:00Z`).getTime() - offsetHours * 3600_000;
      const e = new Date(`${t}T00:00:00Z`).getTime() - offsetHours * 3600_000 + 86400_000;
      return { from: new Date(s).toISOString(), to: new Date(e).toISOString() };
    };

    const curUtc = toUtcRange(fromKey, toKey);
    const prevUtc = toUtcRange(prevRange.from, prevRange.to);

    // Range MTD (awal bulan berjalan hingga tanggal saat ini)
    const [curY, curM, curD] = currentDateKey.split('-').map(Number);
    const year = curY ?? 2026;
    const month = curM ?? 1;
    const dayOfMonth = curD ?? 1;
    const totalDaysInMonth = getDaysInMonth(year, month);
    const mtdFromKey = `${year}-${String(month).padStart(2, '0')}-01`;
    const mtdUtc = toUtcRange(mtdFromKey, currentDateKey);

    // Ambil data secara paralel
    const [
      curPaidOrders,
      prevPaidOrders,
      openOrders,
      mtdPaidOrders,
      voidOrders,
      products,
      categories,
      employees,
      refunds,
      stockItems,
    ] = await Promise.all([
      data.listOrders({ status: 'paid', from: curUtc.from, to: curUtc.to, by: 'closed', all: true }),
      data.listOrders({ status: 'paid', from: prevUtc.from, to: prevUtc.to, by: 'closed', all: true }),
      data.listOrders({ status: 'open', from: curUtc.from, to: curUtc.to, all: true }),
      data.listOrders({ status: 'paid', from: mtdUtc.from, to: mtdUtc.to, by: 'closed', all: true }),
      data.listOrders({ status: 'void', from: curUtc.from, to: curUtc.to, by: 'closed', all: true }),
      data.listProducts({ includeInactive: true }),
      data.listCategories(),
      data.listManagedEmployees(),
      data.listRefundsBetween(curUtc),
      data.listStock(),
    ]);

    // Filter outlet bila bukan "semua"
    const filterByOutlet = <T,>(list: T[]): T[] => {
      if (selectedOutlet === 'semua') return list;
      return list.filter((item) => {
        const itemOutlet = (item as unknown as { outletId?: string }).outletId;
        return !itemOutlet || itemOutlet === selectedOutlet;
      });
    };

    const activeCurPaid = filterByOutlet(curPaidOrders);
    const activePrevPaid = filterByOutlet(prevPaidOrders);
    const activeOpen = filterByOutlet(openOrders);
    const activeMtdPaid = filterByOutlet(mtdPaidOrders);
    const activeVoid = filterByOutlet(voidOrders);

    // Bangun laporan penjualan lengkap
    const curReport = buildSalesReport({
      orders: activeCurPaid,
      products,
      categories,
      employees,
      timezone: ctx.timezone,
      refunds,
      voided: activeVoid,
    });

    const prevReport = buildSalesReport({
      orders: activePrevPaid,
      products,
      categories,
      employees,
      timezone: ctx.timezone,
    });

    // Hitung Akumulasi MTD dan Proyeksi
    const dailyMtdData: { date: string; value: number }[] = activeMtdPaid.map((o) => ({
      date: localDateKey(new Date(o.closedAt ?? o.openedAt), ctx.timezone),
      value: o.total,
    }));
    const mtdTotal = monthToDateAccumulation(dailyMtdData, currentDateKey);
    const projectedTotal = projectMonthEnd(mtdTotal, dayOfMonth, totalDaysInMonth);

    // Hitung Qty Produk Terjual & Rata-rata
    const curItemsSold = activeCurPaid.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
    const prevItemsSold = activePrevPaid.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
    const curProdPerOrder = curReport.summary.orderCount ? Math.round((curItemsSold / curReport.summary.orderCount) * 10) / 10 : 0;
    const prevProdPerOrder = prevReport.summary.orderCount ? Math.round((prevItemsSold / prevReport.summary.orderCount) * 10) / 10 : 0;

    // Filter stok terendah (paling sedikit dulu, merah bila <= 0)
    const lowStock = [...stockItems]
      .sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name, 'id'))
      .slice(0, 5);

    // Format waktu pembaruan
    const now = new Date();
    const updatedTimeStr = `${formatDisplayDate(todayKey)}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;

    return {
      ctx,
      todayKey,
      fromKey,
      toKey,
      prevRange,
      curReport,
      prevReport,
      activeOpen,
      curItemsSold,
      prevItemsSold,
      curProdPerOrder,
      prevProdPerOrder,
      mtdTotal,
      projectedTotal,
      lowStock,
      updatedTimeStr,
    };
  }, [data, selectedOutlet, periodType, currentDateKey]);

  // Handler tombol geser tanggal ‹ dan ›
  const handleShiftDate = (direction: -1 | 1) => {
    if (periodType === 'daily') {
      setCurrentDateKey((prev) => shiftDateDays(prev, direction));
    } else if (periodType === 'weekly') {
      setCurrentDateKey((prev) => shiftDateDays(prev, direction * 7));
    } else if (periodType === 'monthly') {
      const [y, m, d] = currentDateKey.split('-').map(Number);
      let year = y ?? 2026;
      let month = (m ?? 1) + direction;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      const days = getDaysInMonth(year, month);
      const day = Math.min(d ?? 1, days);
      setCurrentDateKey(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  };

  if (state.status === 'error') {
    return (
      <div className="space-y-24">
        <PageHeader title="Ringkasan penjualan" />
        <ErrorBox message={state.message} onRetry={state.reload} />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-24" aria-busy="true" aria-label="Memuat dashboard">
        <PageHeader title="Ringkasan penjualan" />
        <div className="h-44 w-full max-w-sm rounded-lg bg-surface animate-pulse" />
        <div className="grid grid-cols-1 laptop:grid-cols-3 gap-16">
          <div className="h-160 rounded-xl bg-surface animate-pulse" />
          <div className="h-160 rounded-xl bg-surface animate-pulse" />
          <div className="h-160 rounded-xl bg-surface animate-pulse" />
        </div>
        <div className="h-280 rounded-xl bg-surface animate-pulse" />
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-200 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const {
    ctx,
    todayKey,
    fromKey,
    toKey,
    curReport,
    prevReport,
    activeOpen,
    curItemsSold,
    prevItemsSold,
    curProdPerOrder,
    prevProdPerOrder,
    mtdTotal,
    projectedTotal,
    lowStock,
    updatedTimeStr,
  } = state.data;

  // Nilai metrik dan perubahannya
  const curTotal = curReport.summary.total;
  const prevTotal = prevReport.summary.total;
  const totalSalesDiff = percentChange(curTotal, prevTotal);

  const curOrdersCount = curReport.summary.orderCount;
  const prevOrdersCount = prevReport.summary.orderCount;
  const ordersCountDiff = percentChange(curOrdersCount, prevOrdersCount);

  const curAvgTicket = curReport.summary.avgTicket;
  const prevAvgTicket = prevReport.summary.avgTicket;
  const avgTicketDiff = percentChange(curAvgTicket, prevAvgTicket);

  const itemsSoldDiff = percentChange(curItemsSold, prevItemsSold);
  const prodPerOrderDiff = percentChange(curProdPerOrder, prevProdPerOrder);

  const unpaidCount = activeOpen.length;
  const unpaidTotal = activeOpen.reduce((sum, o) => sum + o.total, 0);

  // Label rentang aktif
  let activePeriodLabel = formatDisplayDate(currentDateKey);
  if (periodType === 'weekly') {
    activePeriodLabel = `${formatShortDate(fromKey)} – ${formatShortDate(toKey)}`;
  } else if (periodType === 'monthly') {
    const [y, m] = fromKey.split('-').map(Number);
    activePeriodLabel = `${INDO_MONTHS[(m ?? 1) - 1]} ${y}`;
  }

  // Apakah tombol majunya melebihi tanggal hari ini?
  const isFutureDisabled = toKey >= todayKey;

  // Persiapan data grafik per jam
  const curHourly = curReport.summary.byHour; // 24 jam
  const prevHourly = prevReport.summary.byHour; // 24 jam

  const maxHourlyVal = Math.max(
    ...curHourly.map((h) => h.total),
    ...prevHourly.map((h) => h.total),
    100_000
  );

  // Skala sumbu Y: 4 penanda grid
  const ySteps = [0, maxHourlyVal * 0.33, maxHourlyVal * 0.66, maxHourlyVal];

  // Koordinat grafik SVG
  const svgW = 800;
  const svgH = 220;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 30;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const getX = (hour: number) => padLeft + (hour / 23) * plotW;
  const getY = (val: number) => padTop + plotH - (val / maxHourlyVal) * plotH;

  const curPoints = curHourly.map((h) => ({ x: getX(h.hour), y: getY(h.total) }));
  const prevPoints = prevHourly.map((h) => ({ x: getX(h.hour), y: getY(h.total) }));

  const curPath = createSmoothPath(curPoints);
  const prevPath = createSmoothPath(prevPoints);

  // Area kurva hijau dengan gradien
  const areaPath = curPoints.length > 0
    ? `${curPath} L ${curPoints[curPoints.length - 1]!.x} ${padTop + plotH} L ${curPoints[0]!.x} ${padTop + plotH} Z`
    : '';

  return (
    <div className="space-y-24 max-w-full">
      {/* 1. Header: Judul + Ikon Bantuan + Bintang + Diperbarui */}
      <PageHeader
        title="Ringkasan penjualan"
        subtitle={`${ctx.outletName}${selectedOutlet !== 'semua' ? ' (Terfilter)' : ' (Semua outlet)'}`}
        updatedAt={updatedTimeStr}
      />

      {/* Kontrol Periode: Tab Harian / Mingguan / Bulan & Pemilih Tanggal */}
      <div className="flex flex-wrap items-center justify-between gap-12 p-12 rounded-xl bg-surface-raised border border-border cg-card">
        {/* Tab Pilihan Periode */}
        <div className="flex items-center gap-6" role="tablist" aria-label="Pilihan Periode Laporan">
          <button
            type="button"
            role="tab"
            aria-selected={periodType === 'daily'}
            className={`px-14 py-6 rounded-full text-xs font-semibold transition-colors ${
              periodType === 'daily'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
            onClick={() => setPeriodType('daily')}
          >
            Harian
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={periodType === 'weekly'}
            className={`px-14 py-6 rounded-full text-xs font-semibold transition-colors ${
              periodType === 'weekly'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
            onClick={() => setPeriodType('weekly')}
          >
            Mingguan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={periodType === 'monthly'}
            className={`px-14 py-6 rounded-full text-xs font-semibold transition-colors ${
              periodType === 'monthly'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
            onClick={() => setPeriodType('monthly')}
          >
            Bulan
          </button>
        </div>

        {/* Pemilih Tanggal Bergeser dengan Panah ‹ › */}
        <div className="flex items-center gap-8">
          <button
            type="button"
            onClick={() => handleShiftDate(-1)}
            className="p-6 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
            title="Geser periode sebelumnya"
            aria-label="Geser periode sebelumnya"
          >
            <ChevronLeft className="cg-icon cg-icon--sm" aria-hidden />
          </button>

          <div className="flex items-center gap-6 px-12 py-6 rounded-lg bg-surface border border-border text-sm font-medium">
            <Calendar className="cg-icon cg-icon--xs text-accent" aria-hidden />
            <span>{activePeriodLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => handleShiftDate(1)}
            disabled={isFutureDisabled}
            className={`p-6 rounded-lg transition-colors ${
              isFutureDisabled
                ? 'text-text-muted/40 cursor-not-allowed'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
            title={isFutureDisabled ? 'Periode telah mencapai hari ini' : 'Geser periode berikutnya'}
            aria-label="Geser periode berikutnya"
          >
            <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />
          </button>

          {/* Quick date picker jump */}
          <input
            type="date"
            max={todayKey}
            value={currentDateKey}
            onChange={(e) => {
              if (e.target.value) setCurrentDateKey(e.target.value);
            }}
            className="cg-input px-8 py-4 text-xs h-[32px] w-auto"
            aria-label="Pilih tanggal tertentu"
          />
        </div>
      </div>

      {/* 2. Kartu KPI: Kiri (Hero Total), Tengah (Status Bayar), Kanan (Grid 2x2) */}
      <div className="grid grid-cols-1 laptop:grid-cols-12 gap-16">
        {/* KIRI: Total Penjualan Besar + % + Akumulasi Awal Bulan + Proyeksi */}
        <div className="laptop:col-span-5 p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Total Penjualan
            </span>
            <div className="flex items-baseline gap-12 mt-6">
              <span className="text-2xl tablet:text-3xl font-extrabold text-text tracking-tight">
                {formatRp(curTotal)}
              </span>
              <span
                className={`inline-flex items-center gap-2 px-8 py-2 rounded-full text-xs font-bold ${
                  totalSalesDiff >= 0
                    ? 'bg-trend-up/10 text-trend-up'
                    : 'bg-trend-down/10 text-trend-down'
                }`}
                title={`Perubahan dibanding periode sebelumnya (${formatRp(prevTotal)})`}
              >
                {totalSalesDiff >= 0 ? (
                  <TrendingUp className="w-12 h-12" aria-hidden />
                ) : (
                  <TrendingDown className="w-12 h-12" aria-hidden />
                )}
                <span>{totalSalesDiff >= 0 ? `+${totalSalesDiff}%` : `${totalSalesDiff}%`}</span>
              </span>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Dibandingkan periode sebelumnya ({formatRp(prevTotal)})
            </p>
          </div>

          <div className="mt-20 pt-16 border-t border-border grid grid-cols-2 gap-12">
            <div>
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Akumulasi Bulan Ini
              </span>
              <p className="text-sm font-bold text-text mt-2">
                {formatRp(mtdTotal)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Proyeksi Akhir Bulan
              </span>
              <p className="text-sm font-bold text-accent mt-2">
                {formatRp(projectedTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* TENGAH: Belum Dibayar & Terbayar */}
        <div className="laptop:col-span-3 p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between gap-16">
          {/* Terbayar (Lunas) */}
          <div className="flex items-start justify-between p-12 rounded-lg bg-surface border border-border">
            <div>
              <span className="text-xs font-medium text-text-muted">Terbayar (Lunas)</span>
              <p className="text-base font-bold text-text mt-2">{formatRp(curTotal)}</p>
              <p className="text-xs text-text-muted mt-2">{curOrdersCount} transaksi</p>
            </div>
            <div className="p-8 rounded-full bg-success/15 text-success shrink-0">
              <CheckCircle2 className="w-18 h-18" aria-hidden />
            </div>
          </div>

          {/* Belum Dibayar (Pending / Open) */}
          <div className="flex items-start justify-between p-12 rounded-lg bg-surface border border-border">
            <div>
              <span className="text-xs font-medium text-text-muted">Belum Dibayar</span>
              <p className="text-base font-bold text-warning mt-2">{formatRp(unpaidTotal)}</p>
              <p className="text-xs text-text-muted mt-2">{unpaidCount} pesanan aktif</p>
            </div>
            <div className="p-8 rounded-full bg-warning/15 text-warning shrink-0">
              <Clock className="w-18 h-18" aria-hidden />
            </div>
          </div>
        </div>

        {/* KANAN: Grid 2x2 Transaksi, Rata-rata per transaksi, Produk terjual, Produk per transaksi */}
        <div className="laptop:col-span-4 p-16 rounded-xl bg-surface-raised border border-border cg-card grid grid-cols-2 gap-12">
          {/* 1. Transaksi */}
          <div className="p-10 rounded-lg bg-surface border border-border flex flex-col justify-between">
            <span className="text-xs text-text-muted">Transaksi</span>
            <div className="my-4">
              <span className="text-lg font-bold text-text">{curOrdersCount}</span>
            </div>
            <span
              className={`text-[11px] font-semibold flex items-center gap-2 ${
                ordersCountDiff >= 0 ? 'text-trend-up' : 'text-trend-down'
              }`}
            >
              {ordersCountDiff >= 0 ? '↗' : '↘'} {ordersCountDiff >= 0 ? `+${ordersCountDiff}%` : `${ordersCountDiff}%`}
            </span>
          </div>

          {/* 2. Penjualan per Transaksi */}
          <div className="p-10 rounded-lg bg-surface border border-border flex flex-col justify-between">
            <span className="text-xs text-text-muted truncate">Penjualan / Transaksi</span>
            <div className="my-4">
              <span className="text-lg font-bold text-text truncate">{formatRp(curAvgTicket)}</span>
            </div>
            <span
              className={`text-[11px] font-semibold flex items-center gap-2 ${
                avgTicketDiff >= 0 ? 'text-trend-up' : 'text-trend-down'
              }`}
            >
              {avgTicketDiff >= 0 ? '↗' : '↘'} {avgTicketDiff >= 0 ? `+${avgTicketDiff}%` : `${avgTicketDiff}%`}
            </span>
          </div>

          {/* 3. Produk Terjual */}
          <div className="p-10 rounded-lg bg-surface border border-border flex flex-col justify-between">
            <span className="text-xs text-text-muted">Produk Terjual</span>
            <div className="my-4">
              <span className="text-lg font-bold text-text">{curItemsSold} item</span>
            </div>
            <span
              className={`text-[11px] font-semibold flex items-center gap-2 ${
                itemsSoldDiff >= 0 ? 'text-trend-up' : 'text-trend-down'
              }`}
            >
              {itemsSoldDiff >= 0 ? '↗' : '↘'} {itemsSoldDiff >= 0 ? `+${itemsSoldDiff}%` : `${itemsSoldDiff}%`}
            </span>
          </div>

          {/* 4. Produk per Transaksi */}
          <div className="p-10 rounded-lg bg-surface border border-border flex flex-col justify-between">
            <span className="text-xs text-text-muted truncate">Produk / Transaksi</span>
            <div className="my-4">
              <span className="text-lg font-bold text-text">{curProdPerOrder} item</span>
            </div>
            <span
              className={`text-[11px] font-semibold flex items-center gap-2 ${
                prodPerOrderDiff >= 0 ? 'text-trend-up' : 'text-trend-down'
              }`}
            >
              {prodPerOrderDiff >= 0 ? '↗' : '↘'} {prodPerOrderDiff >= 0 ? `+${prodPerOrderDiff}%` : `${prodPerOrderDiff}%`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Grafik Garis Per Jam 00–23 (SVG Murni Halus Buatan Sendiri) */}
      <div className="p-20 rounded-xl bg-surface-raised border border-border cg-card">
        <div className="flex flex-wrap items-center justify-between gap-12 mb-16">
          <div>
            <h2 className="text-base font-bold text-text">Penjualan per Jam (00:00 – 23:00)</h2>
            <p className="text-xs text-text-muted">Perbandingan pola transaksi per jam terhadap periode sebelumnya</p>
          </div>

          {/* Legenda Grafik */}
          <div className="flex items-center gap-16 text-xs">
            <div className="flex items-center gap-6">
              <span className="w-16 h-3 rounded-full bg-accent" />
              <span className="font-medium text-text">Periode Ini</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="w-16 h-3 border-t-2 border-dashed border-text-muted/60" />
              <span className="text-text-muted">Periode Sebelumnya</span>
            </div>
          </div>
        </div>

        {/* Area Grafik SVG Interaktif */}
        <div className="relative w-full overflow-hidden" tabIndex={0} aria-label="Grafik garis penjualan per jam">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-auto overflow-visible select-none"
            role="img"
            aria-label="Grafik perbandingan penjualan per jam"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent, #0E8044)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-accent, #0E8044)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Garis Grid Horizontal & Label Sumbu Y */}
            {ySteps.map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgW - padRight}
                    y2={y}
                    stroke="var(--color-border, #E5E7EB)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--color-text-muted, #6B7280)"
                  >
                    {formatYLabel(val)}
                  </text>
                </g>
              );
            })}

            {/* Label Sumbu X (Jam) */}
            {[0, 4, 8, 12, 16, 20, 23].map((hr) => {
              const x = getX(hr);
              return (
                <g key={hr}>
                  <line
                    x1={x}
                    y1={padTop + plotH}
                    x2={x}
                    y2={padTop + plotH + 5}
                    stroke="var(--color-border, #E5E7EB)"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={padTop + plotH + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--color-text-muted, #6B7280)"
                  >
                    {String(hr).padStart(2, '0')}:00
                  </text>
                </g>
              );
            })}

            {/* Area Fill Gradien Periode Ini */}
            {areaPath && (
              <path d={areaPath} fill={`url(#${gradientId})`} />
            )}

            {/* Kurva Periode Sebelumnya (Garis Abu Putus-putus) */}
            {prevPath && (
              <path
                d={prevPath}
                fill="none"
                stroke="var(--color-text-muted, #9CA3AF)"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            )}

            {/* Kurva Periode Ini (Garis Hijau Zamrud Halus) */}
            {curPath && (
              <path
                d={curPath}
                fill="none"
                stroke="var(--color-accent, #0E8044)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {/* Titik Interaktif Per Jam */}
            {curPoints.map((pt, i) => {
              const isHovered = hoveredHour === i;
              return (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 6 : 3}
                    fill="var(--color-accent, #0E8044)"
                    stroke="var(--color-surface-raised, #FFFFFF)"
                    strokeWidth={isHovered ? 2 : 1}
                    className="transition-all cursor-pointer"
                  />
                  {/* Invisible broad hitbox for mouse & focus */}
                  <rect
                    x={pt.x - (plotW / 24) / 2}
                    y={padTop}
                    width={plotW / 23}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer focus:outline-none"
                    tabIndex={0}
                    aria-label={`Pukul ${String(i).padStart(2, '0')}:00, Penjualan ${formatRp(curHourly[i]?.total || 0)}`}
                    onMouseEnter={() => setHoveredHour(i)}
                    onMouseLeave={() => setHoveredHour(null)}
                    onFocus={() => setHoveredHour(i)}
                    onBlur={() => setHoveredHour(null)}
                  />
                </g>
              );
            })}
          </svg>

          {/* Tooltip Mengambang */}
          {hoveredHour !== null && (
            <div
              className="absolute z-20 px-12 py-8 rounded-lg bg-neutral-900 text-white text-xs shadow-pop pointer-events-none transform -translate-x-1/2 -translate-y-full mb-8 animate-fadeIn"
              style={{
                left: `${(getX(hoveredHour) / svgW) * 100}%`,
                top: `${(getY(curHourly[hoveredHour]?.total || 0) / svgH) * 100}%`,
              }}
            >
              <p className="font-bold border-b border-white/20 pb-2 mb-4">
                Pukul {String(hoveredHour).padStart(2, '0')}:00
              </p>
              <div className="flex justify-between gap-12">
                <span className="text-white/70">Periode ini:</span>
                <span className="font-bold text-accent-soft">
                  {formatRp(curHourly[hoveredHour]?.total || 0)}
                </span>
              </div>
              <div className="flex justify-between gap-12">
                <span className="text-white/70">Sebelumnya:</span>
                <span>{formatRp(prevHourly[hoveredHour]?.total || 0)}</span>
              </div>
              <div className="flex justify-between gap-12 pt-2 border-t border-white/10 mt-2">
                <span className="text-white/70">Perubahan:</span>
                <span className="font-semibold">
                  {percentChange(
                    curHourly[hoveredHour]?.total || 0,
                    prevHourly[hoveredHour]?.total || 0
                  )}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Grid 8 Widget (4 Kolom >=1280, 2 Kolom >=768, 1 Kolom Mobile) */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16">
        {/* Widget 1: Metode Pembayaran */}
        <WidgetCard
          title="Metode Pembayaran"
          viewAllHref="/laporan/jenis-bayar"
        >
          {curReport.summary.byMethod.length === 0 ? (
            <EmptyWidget text="Belum ada transaksi pembayaran" />
          ) : (
            <div className="space-y-10">
              {curReport.summary.byMethod.slice(0, 4).map((m) => {
                const maxAmount = curReport.summary.byMethod[0]?.amount || 1;
                const pct = Math.min(100, Math.round((m.amount / maxAmount) * 100));
                return (
                  <div key={m.methodName} className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-text truncate max-w-[140px]">{m.methodName}</span>
                      <span className="font-bold text-text">{formatRp(m.amount)}</span>
                    </div>
                    <div className="w-full h-6 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 2: Void (Transaksi Dibatalkan) */}
        <WidgetCard
          title="Transaksi Dibatalkan (Void)"
          viewAllHref="/laporan/void"
        >
          {curReport.control.voidCount === 0 ? (
            <EmptyWidget text="Tidak ada transaksi void pada periode ini" />
          ) : (
            <div className="space-y-12">
              <div className="p-10 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-danger">Total Void</span>
                <span className="text-sm font-bold text-danger">
                  {formatRp(curReport.control.voidTotal)} ({curReport.control.voidCount}x)
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Semua pembatalan tercatat dengan rincian otorisasi kasir/manajer.
              </p>
            </div>
          )}
        </WidgetCard>

        {/* Widget 3: Penjualan per Kasir */}
        <WidgetCard
          title="Penjualan per Kasir"
          viewAllHref="/laporan/kasir"
        >
          {curReport.byCashier.length === 0 ? (
            <EmptyWidget text="Belum ada transaksi per kasir" />
          ) : (
            <div className="space-y-10">
              {curReport.byCashier.slice(0, 4).map((c) => {
                const maxAmount = curReport.byCashier[0]?.amount || 1;
                const pct = Math.min(100, Math.round((c.amount / maxAmount) * 100));
                return (
                  <div key={c.key} className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-text truncate max-w-[140px]">{c.label}</span>
                      <span className="font-bold text-text">{formatRp(c.amount)}</span>
                    </div>
                    <div className="w-full h-6 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 4: Produk Terlaris */}
        <WidgetCard
          title="Produk Terlaris"
          viewAllHref="/laporan/produk"
        >
          {curReport.summary.topProducts.length === 0 ? (
            <EmptyWidget text="Belum ada penjualan produk" />
          ) : (
            <div className="space-y-10">
              {curReport.summary.topProducts.slice(0, 4).map((p) => {
                const maxQty = curReport.summary.topProducts[0]?.qty || 1;
                const pct = Math.min(100, Math.round((p.qty / maxQty) * 100));
                return (
                  <div key={p.productId} className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-text truncate max-w-[140px]">{p.name}</span>
                      <span className="font-bold text-text">{p.qty} terjual</span>
                    </div>
                    <div className="w-full h-6 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 5: Stok Terendah (Merah bila minus / <= 0) */}
        <WidgetCard
          title="Stok Terendah"
          viewAllHref="/inventori/stok"
        >
          {lowStock.length === 0 ? (
            <EmptyWidget text="Seluruh persediaan stok aman" />
          ) : (
            <div className="space-y-8">
              {lowStock.slice(0, 4).map((s) => {
                const isCritical = s.qty <= 0;
                return (
                  <div
                    key={s.productId}
                    className="flex items-center justify-between text-xs py-4 border-b border-border/50 last:border-0"
                  >
                    <span className="text-text font-medium truncate max-w-[140px]">{s.name}</span>
                    <span
                      className={`font-bold px-6 py-2 rounded ${
                        isCritical
                          ? 'bg-danger/10 text-danger'
                          : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {s.qty} {s.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 6: Penjualan per Kategori */}
        <WidgetCard
          title="Penjualan per Kategori"
          viewAllHref="/kategori"
        >
          {curReport.byCategory.length === 0 ? (
            <EmptyWidget text="Belum ada penjualan kategori" />
          ) : (
            <div className="space-y-10">
              {curReport.byCategory.slice(0, 4).map((cat) => {
                const maxAmount = curReport.byCategory[0]?.amount || 1;
                const pct = Math.min(100, Math.round((cat.amount / maxAmount) * 100));
                return (
                  <div key={cat.key} className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-text truncate max-w-[140px]">{cat.label}</span>
                      <span className="font-bold text-text">{formatRp(cat.amount)}</span>
                    </div>
                    <div className="w-full h-6 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 7: Jenis Order */}
        <WidgetCard
          title="Jenis Order"
          viewAllHref="/laporan/jenis-order"
        >
          {curReport.byType.length === 0 ? (
            <EmptyWidget text="Belum ada transaksi jenis order" />
          ) : (
            <div className="space-y-10">
              {curReport.byType.slice(0, 4).map((t) => {
                const maxAmount = curReport.byType[0]?.amount || 1;
                const pct = Math.min(100, Math.round((t.amount / maxAmount) * 100));
                return (
                  <div key={t.key} className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-text truncate max-w-[140px]">{t.label}</span>
                      <span className="font-bold text-text">{formatRp(t.amount)}</span>
                    </div>
                    <div className="w-full h-6 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        {/* Widget 8: Komisi per Kasir (Kosong sesuai spesifikasi) */}
        <WidgetCard
          title="Komisi per Kasir"
          viewAllHref="/pengaturan/karyawan"
        >
          <EmptyWidget text="Belum ada data komisi" />
        </WidgetCard>
      </div>
    </div>
  );
}

/** Komponen pembungkus kartu widget */
function WidgetCard({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between min-w-0">
      <div>
        {/* Header Widget */}
        <div className="flex items-center justify-between gap-8 mb-12">
          <h3 className="text-sm font-bold text-text truncate">{title}</h3>
          <button
            type="button"
            className="p-4 rounded text-text-muted hover:text-text hover:bg-surface cursor-pointer"
            title="Opsi lain"
            aria-label={`Opsi lain untuk ${title}`}
          >
            <MoreHorizontal className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>

        {/* Konten Widget */}
        <div className="py-4">{children}</div>
      </div>

      {/* Footer Widget: Link Lihat Semua */}
      <div className="mt-16 pt-10 border-t border-border flex justify-end">
        <Link
          href={viewAllHref}
          className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
        >
          <span>Lihat semua</span>
          <ArrowUpRight className="w-12 h-12" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** Keadaan kosong widget */
function EmptyWidget({ text }: { text: string }) {
  return (
    <div className="py-16 text-center text-xs text-text-muted italic bg-surface/50 rounded-lg">
      {text}
    </div>
  );
}

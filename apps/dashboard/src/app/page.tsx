'use client';
import { useState } from 'react';
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
function createSmoothPath(points: { x: number; y: number }[], bounds?: { min: number; max: number }): string {
  const clampY = (y: number) => (bounds ? Math.min(bounds.max, Math.max(bounds.min, y)) : y);
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);

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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
      prevOpenOrders,
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
      data.listOrders({ status: 'open', from: prevUtc.from, to: prevUtc.to, all: true }),
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
    const prevUnpaidTotal = filterByOutlet(prevOpenOrders).reduce((sum, o) => sum + o.total, 0);
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
    const updatedTimeStr = `${formatDisplayDate(todayKey)}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    return {
      ctx,
      todayKey,
      fromKey,
      toKey,
      prevRange,
      curReport,
      prevReport,
      activeOpen,
      prevUnpaidTotal,
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
        <div className="cg-skeleton w-full max-w-sm" style={{ height: 44 }} />
        <div className="grid grid-cols-1 laptop:grid-cols-3 gap-16">
          <div className="cg-skeleton" style={{ height: 160 }} />
          <div className="cg-skeleton" style={{ height: 160 }} />
          <div className="cg-skeleton" style={{ height: 160 }} />
        </div>
        <div className="cg-skeleton" style={{ height: 280 }} />
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 200 }} />
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
    prevUnpaidTotal,
    prevRange,
    curItemsSold,
    prevItemsSold,
    curProdPerOrder,
    prevProdPerOrder,
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

  // Persen perubahan dua angka (dua desimal); periode sebelumnya 0 dan sekarang ada = 100
  const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : Math.round(((cur - prev) / prev) * 10000) / 100);
  const money2 = (n: number) => `Rp ${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const Delta = ({ v }: { v: number }) => (
    <span className={`ml-4 inline-flex items-center gap-2 text-xs font-semibold whitespace-nowrap ${v >= 0 ? 'text-trend-up' : 'text-trend-down'}`}>
      <span aria-hidden>{v >= 0 ? '↗' : '↘'}</span>
      <span>{Math.abs(v)}%</span>
      <span className="sr-only">{v >= 0 ? 'naik' : 'turun'}</span>
    </span>
  );

  const unpaidDiff = pct(unpaidTotal, prevUnpaidTotal);
  const paidDiff = pct(curTotal, prevTotal);

  // Data grafik: Harian = per jam; Mingguan dan Bulan = per tanggal. Periode sebelumnya disejajarkan menurut urutan.
  const dayKeys = (from: string, to: string) => { const out: string[] = []; for (let k = from; k <= to && out.length < 400; k = shiftDateDays(k, 1)) out.push(k); return out; };
  const shortDM = (k: string) => { const [, m, d] = k.split('-').map(Number); return `${String(d).padStart(2, '0')} ${INDO_MONTHS_SHORT[(m ?? 1) - 1] ?? ''}`; };
  let labels: string[];
  let curSeries: number[];
  let prevSeries: number[];
  let xTicks: number[];
  if (periodType === 'daily') {
    labels = curReport.summary.byHour.map((h) => `${String(h.hour).padStart(2, '0')}:00`);
    curSeries = curReport.summary.byHour.map((h) => h.total);
    prevSeries = prevReport.summary.byHour.map((h) => h.total);
    xTicks = [0, 4, 8, 12, 16, 20, 23];
  } else {
    const ck = dayKeys(fromKey, toKey);
    const pk = dayKeys(prevRange.from, prevRange.to);
    const cm = new Map(curReport.byDay.map((r) => [r.key, r.amount]));
    const pm = new Map(prevReport.byDay.map((r) => [r.key, r.amount]));
    labels = ck.map(shortDM);
    curSeries = ck.map((k) => cm.get(k) ?? 0);
    prevSeries = ck.map((_, i) => pm.get(pk[i] ?? '') ?? 0);
    const every = ck.length > 10 ? 3 : 1;
    xTicks = ck.map((_, i) => i).filter((i) => i % every === 0 || i === ck.length - 1);
  }
  const nPts = Math.max(curSeries.length, 1);

  // Skala sumbu Y dibulatkan ke angka rapi: 4 selang sama besar
  const rawMax = Math.max(...curSeries, ...prevSeries, 100_000);
  const rawStep = rawMax / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rawStep) ?? 10) * mag;
  const ySteps = [0, 1, 2, 3, 4].map((i) => i * step);
  const yMax = step * 4;
  const formatYLabel2 = (v: number) => (v === 0 ? '0,00' : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2).replace('.', ',')} jt` : `${(v / 1_000).toFixed(2).replace('.', ',')} rb`);

  const svgW = 800;
  const svgH = 260;
  const padLeft = 64;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 30;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;
  const getX = (i: number) => padLeft + (nPts === 1 ? plotW / 2 : (i / (nPts - 1)) * plotW);
  const getY = (val: number) => padTop + plotH - (val / yMax) * plotH;
  const curPath = createSmoothPath(curSeries.map((v, i) => ({ x: getX(i), y: getY(v) })), { min: padTop, max: padTop + plotH });
  const prevPath = createSmoothPath(prevSeries.map((v, i) => ({ x: getX(i), y: getY(v) })), { min: padTop, max: padTop + plotH });

  const rangeText = periodType === 'daily' ? formatDisplayDate(currentDateKey) : `${formatDisplayDate(fromKey)} - ${formatDisplayDate(toKey)}`;
  const navText = periodType === 'daily' ? formatShortDate(currentDateKey).replace(/ (\d{4})$/, (_, y: string) => ` ${y.slice(2)}`) : `${shortDM(fromKey)} ${fromKey.slice(2, 4)} - ${shortDM(toKey)} ${toKey.slice(2, 4)}`;
  const periodNoun = periodType === 'daily' ? 'hari ini' : periodType === 'weekly' ? 'minggu ini' : 'bulan ini';
  const gain = curTotal - prevTotal;

  return (
    <div className="space-y-24 max-w-full">
      <section className="rounded-xl bg-surface-raised border border-border cg-card overflow-hidden" aria-label="Dashboard penjualan">
        {/* Judul, bantuan, bintang, waktu pembaruan */}
        <div className="px-20 pt-20 pb-4 border-b border-border">
          <PageHeader title="Dashboard Penjualan" updatedAt={updatedTimeStr} />
        </div>

        {/* Periode: Harian | Mingguan | Bulan, lalu geser rentang */}
        <div className="px-20 py-12 border-b border-border flex flex-wrap items-center gap-12">
          <div
            role="tablist"
            aria-label="Pilihan periode ringkasan penjualan"
            className="inline-flex items-stretch h-[36px] rounded-md border border-border overflow-hidden shrink-0"
            onKeyDown={(e) => {
              const periods: PeriodType[] = ['daily', 'weekly', 'monthly'];
              const i = periods.indexOf(periodType);
              const move = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!move) return;
              e.preventDefault();
              const next = periods[(i + move + periods.length) % periods.length];
              if (next) { setPeriodType(next); document.getElementById(`period-tab-${next}`)?.focus(); }
            }}
          >
            {(['daily', 'weekly', 'monthly'] as const).map((t, idx) => {
              const label = t === 'daily' ? 'Harian' : t === 'weekly' ? 'Mingguan' : 'Bulan';
              const isActive = periodType === t;
              return (
                <button
                  key={t}
                  id={`period-tab-${t}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={`px-16 text-sm font-medium whitespace-nowrap transition-colors ${idx > 0 ? 'border-l border-border' : ''} ${isActive ? 'bg-accent text-on-accent' : 'bg-surface-raised text-text hover:bg-surface'}`}
                  onClick={() => setPeriodType(t)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-stretch h-[36px] rounded-md border border-border overflow-hidden shrink-0">
            <button type="button" onClick={() => handleShiftDate(-1)} className="w-[36px] flex items-center justify-center bg-surface-raised text-text-muted hover:text-text hover:bg-surface" title="Geser periode sebelumnya" aria-label="Geser periode sebelumnya">
              <ChevronLeft className="cg-icon cg-icon--sm" aria-hidden />
            </button>
            <span className="px-16 flex items-center text-sm border-x border-border bg-surface-raised whitespace-nowrap" aria-live="polite">{navText}</span>
            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              disabled={isFutureDisabled}
              className={`w-[36px] flex items-center justify-center bg-surface-raised ${isFutureDisabled ? 'text-text-muted/40 cursor-not-allowed' : 'text-text-muted hover:text-text hover:bg-surface'}`}
              title={isFutureDisabled ? 'Periode telah mencapai hari ini' : 'Geser periode berikutnya'}
              aria-label="Geser periode berikutnya"
            >
              <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />
            </button>
          </div>
        </div>

        {/* Ringkasan angka */}
        <div className="px-20 py-20 grid grid-cols-1 laptop:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-24 items-center border-b border-border">
          <div>
            <span className="text-sm text-text-muted">Total Penjualan<Delta v={paidDiff} /></span>
            <p className="text-2xl tablet:text-3xl font-bold text-text tracking-tight mt-2 break-words">{money2(curTotal)}</p>
            <p className="text-xs text-text-muted mt-2">Proyeksi Bulan Ini {money2(projectedTotal)}</p>
          </div>

          <div className="grid gap-16">
            <div>
              <span className="text-sm text-text-muted">Penjualan Belum Dibayar<Delta v={unpaidDiff} /></span>
              <p className="text-lg font-bold text-text mt-2 break-words">{money2(unpaidTotal)}</p>
              <p className="text-xs text-text-muted">{unpaidCount} pesanan aktif</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Penjualan Terbayar<Delta v={paidDiff} /></span>
              <p className="text-lg font-bold text-text mt-2 break-words">{money2(curTotal)}</p>
              <p className="text-xs text-text-muted">{curOrdersCount} transaksi</p>
            </div>
          </div>

          <div className="rounded-lg bg-surface border border-border grid grid-cols-2 min-w-0">
            <div className="p-16 border-b border-r border-border min-w-0">
              <span className="text-sm text-text-muted">Transaksi<Delta v={pct(curOrdersCount, prevOrdersCount)} /></span>
              <p className="text-base font-bold text-text mt-2">{curOrdersCount}</p>
            </div>
            <div className="p-16 border-b border-border min-w-0">
              <span className="text-sm text-text-muted">Penjualan per Transaksi<Delta v={pct(curAvgTicket, prevAvgTicket)} /></span>
              <p className="text-base font-bold text-text mt-2 break-words">{money2(curAvgTicket)}</p>
            </div>
            <div className="p-16 border-r border-border min-w-0">
              <span className="text-sm text-text-muted">Produk Terjual<Delta v={pct(curItemsSold, prevItemsSold)} /></span>
              <p className="text-base font-bold text-text mt-2">{curItemsSold.toLocaleString('id-ID')}</p>
            </div>
            <div className="p-16 min-w-0">
              <span className="text-sm text-text-muted">Produk per Transaksi<Delta v={pct(curProdPerOrder, prevProdPerOrder)} /></span>
              <p className="text-base font-bold text-text mt-2">{curProdPerOrder.toLocaleString('id-ID')}</p>
            </div>
          </div>
        </div>

        {/* Grafik penjualan */}
        <div className="px-20 py-20">
          <div className="flex flex-wrap items-center justify-between gap-12">
            <h2 className="text-base font-bold text-text">Penjualan <span className="text-xs font-normal text-text-muted">{rangeText}</span></h2>
            {gain > 0 && (
              <p className="inline-flex items-center gap-8 px-12 py-6 rounded-full bg-surface border border-border text-sm m-0">
                <TrendingUp className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
                <span>Dengan pakai CG POS, penjualanmu {periodNoun} meningkat senilai <strong className="text-accent">{formatRp(gain)}</strong></span>
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-16 text-xs mt-12">
            <span className="flex items-center gap-6"><span className="w-8 h-8 rounded-full bg-text-muted/50" aria-hidden /><span className="text-text-muted">Periode Sebelumnya</span></span>
            <span className="flex items-center gap-6"><span className="w-8 h-8 rounded-full bg-accent" aria-hidden /><span className="text-text">Total Penjualan</span></span>
          </div>

          <div className="relative w-full mt-8">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-auto overflow-visible select-none"
              role="img"
              aria-label={`Grafik penjualan ${rangeText} dibandingkan periode sebelumnya`}
              onMouseLeave={() => setHoverIdx(null)}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * svgW;
                const i = Math.round(((x - padLeft) / plotW) * (nPts - 1));
                setHoverIdx(i >= 0 && i < nPts ? i : null);
              }}
            >
              {ySteps.map((val) => (
                <g key={val}>
                  <line x1={padLeft} y1={getY(val)} x2={svgW - padRight} y2={getY(val)} stroke="var(--color-border)" strokeWidth="1" />
                  <text x={padLeft - 8} y={getY(val) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{formatYLabel2(val)}</text>
                </g>
              ))}
              {xTicks.map((i) => (
                <text key={i} x={getX(i)} y={padTop + plotH + 20} textAnchor="middle" fontSize="11" fill="var(--color-text-muted)">{labels[i]}</text>
              ))}
              {prevPath && <path d={prevPath} fill="none" stroke="var(--color-text-muted)" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />}
              {curPath && <path d={curPath} fill="none" stroke="var(--color-accent)" strokeWidth="3.5" strokeLinecap="round" />}
              {hoverIdx !== null && (
                <g>
                  <line x1={getX(hoverIdx)} y1={padTop} x2={getX(hoverIdx)} y2={padTop + plotH} stroke="var(--color-border)" strokeWidth="1" />
                  <circle cx={getX(hoverIdx)} cy={getY(curSeries[hoverIdx] ?? 0)} r="5" fill="var(--color-accent)" />
                </g>
              )}
            </svg>
            {hoverIdx !== null && (
              <div
                className="absolute top-0 px-10 py-6 rounded-md bg-surface-raised border border-border shadow-pop text-xs pointer-events-none"
                style={{ left: `${Math.min(80, Math.max(0, (getX(hoverIdx) / svgW) * 100))}%` }}
                role="status"
              >
                <strong className="block">{labels[hoverIdx]}</strong>
                <span className="block text-accent">Total Penjualan: {formatRp(curSeries[hoverIdx] ?? 0)}</span>
                <span className="block text-text-muted">Periode Sebelumnya: {formatRp(prevSeries[hoverIdx] ?? 0)}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Grid 8 Widget (4 Kolom >=1280, 2 Kolom >=768, 1 Kolom Mobile) */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16 items-start">
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
    <div className="py-12 px-8 text-center text-xs text-text-muted italic bg-surface/50 rounded-lg">
      {text}
    </div>
  );
}

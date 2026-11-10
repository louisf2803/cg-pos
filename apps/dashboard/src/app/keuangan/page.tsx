'use client';

import { useState, useId, useMemo } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  DollarSign,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
} from 'lucide-react';
import {
  formatRp,
  extractIncomeBreakdown,
  shiftDateDays,
  getDaysInMonth,
  type StatementRow,
  type Account,
  type TrialRow,
  type CashFlow,
  type BalanceSheetTotals,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const INDO_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function formatYLabel(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const jt = abs / 1_000_000;
    return `${sign}${jt % 1 === 0 ? jt : jt.toFixed(1)} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)} rb`;
  }
  return `${sign}${abs}`;
}

/** Menghasilkan kurva cubic bezier mulus (spline) */
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

export default function FinanceDashboardPage() {
  const data = useData();

  // Dialog panduan dashboard
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Mode waktu grafik Laba Rugi & Arus Kas: 'day' | 'month'
  const [plTimeMode, setPlTimeMode] = useState<'day' | 'month'>('day');
  const [cfTimeMode, setCfTimeMode] = useState<'day' | 'month'>('day');

  // Tooltip state untuk grafik
  const [hoveredPlIndex, setHoveredPlIndex] = useState<number | null>(null);
  const [hoveredCfIndex, setHoveredCfIndex] = useState<number | null>(null);

  const state = useAsync(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [curYear, curMonth] = today.split('-').map(Number);
    const y = curYear ?? 2026;
    const m = curMonth ?? 1;

    // Rentang bulan ini
    const monthFrom = `${y}-${String(m).padStart(2, '0')}-01`;
    const span = { from: monthFrom, to: today };

    // 1. Data utama keuangan
    const [income, accounts, trial, cashFlow, balance] = await Promise.all([
      data.incomeStatement(span),
      data.listAccounts(),
      data.trialBalance(span),
      data.cashFlow(span),
      data.balanceSheet(today),
    ]);

    // 2. Data time series untuk 7 hari terakhir (Mode Hari)
    const last7Days = Array.from({ length: 7 }, (_, i) => shiftDateDays(today, -(6 - i)));
    const dailyResults = await Promise.all(
      last7Days.map(async (dayKey) => {
        const [dayIncome, dayCf] = await Promise.all([
          data.incomeStatement({ from: dayKey, to: dayKey }),
          data.cashFlow({ from: dayKey, to: dayKey }),
        ]);
        const breakdown = extractIncomeBreakdown(dayIncome);
        const dayNum = Number(dayKey.slice(8, 10));
        const monthNum = Number(dayKey.slice(5, 7));
        const shortLabel = `${dayNum} ${INDO_MONTHS_SHORT[monthNum - 1]}`;
        return {
          key: dayKey,
          label: shortLabel,
          revenue: breakdown.revenue,
          expenses: breakdown.expenses,
          netProfit: breakdown.netProfit,
          inflow: dayCf.inflow,
          outflow: dayCf.outflow,
          netCash: dayCf.net,
        };
      })
    );

    // 3. Data time series untuk 6 bulan terakhir (Mode Bulan)
    const monthBuckets: { from: string; to: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      let bMonth = m - i;
      let bYear = y;
      while (bMonth < 1) {
        bMonth += 12;
        bYear -= 1;
      }
      const days = getDaysInMonth(bYear, bMonth);
      const mm = String(bMonth).padStart(2, '0');
      monthBuckets.push({
        from: `${bYear}-${mm}-01`,
        to: `${bYear}-${mm}-${String(days).padStart(2, '0')}`,
        label: `${INDO_MONTHS_SHORT[bMonth - 1]} ${bYear}`,
      });
    }

    const monthlyResults = await Promise.all(
      monthBuckets.map(async (bucket) => {
        const [mIncome, mCf] = await Promise.all([
          data.incomeStatement(bucket),
          data.cashFlow(bucket),
        ]);
        const breakdown = extractIncomeBreakdown(mIncome);
        return {
          key: bucket.from,
          label: bucket.label,
          revenue: breakdown.revenue,
          expenses: breakdown.expenses,
          netProfit: breakdown.netProfit,
          inflow: mCf.inflow,
          outflow: mCf.outflow,
          netCash: mCf.net,
        };
      })
    );

    return {
      today,
      span,
      income,
      accounts,
      trial,
      cashFlow,
      balance,
      dailyResults,
      monthlyResults,
    };
  }, [data]);

  if (state.status === 'error') {
    return (
      <div className="space-y-24">
        <PageHeader title="Dashboard keuangan" />
        <ErrorBox message={state.message} onRetry={state.reload} />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-24" aria-busy="true" aria-label="Memuat dashboard keuangan">
        <PageHeader title="Dashboard keuangan" />
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="h-280 rounded-xl bg-surface animate-pulse" />
          <div className="h-280 rounded-xl bg-surface animate-pulse" />
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="h-240 rounded-xl bg-surface animate-pulse" />
          <div className="h-240 rounded-xl bg-surface animate-pulse" />
        </div>
      </div>
    );
  }

  const {
    today,
    income,
    accounts,
    trial,
    cashFlow,
    balance,
    dailyResults,
    monthlyResults,
  } = state.data;

  // Rincian Laba Rugi periode bulan ini
  const incomeSummary = extractIncomeBreakdown(income);

  // Akun kas & bank aktif beserta saldo
  const cashAccounts = accounts.filter(
    (a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive
  );
  const trialMap = new Map(trial.map((t) => [t.accountId, t]));
  const cashAccountsWithBalance = cashAccounts.map((acc) => {
    const t = trialMap.get(acc.id);
    const balanceVal = t ? t.closing : 0;
    return {
      ...acc,
      balance: balanceVal,
    };
  }).sort((a, b) => b.balance - a.balance);

  const totalCashBalance = cashAccountsWithBalance.reduce((sum, a) => sum + a.balance, 0);

  // Neraca
  const balanceTotals: BalanceSheetTotals = balance.totals;
  const isNeracaBalanced = balanceTotals.balanced;

  // Time series aktif untuk Laba Rugi
  const plSeries = plTimeMode === 'day' ? dailyResults : monthlyResults;
  // Time series aktif untuk Arus Kas
  const cfSeries = cfTimeMode === 'day' ? dailyResults : monthlyResults;

  return (
    <div className="space-y-24 max-w-full">
      {/* 1. Header: Judul + ? + Bintang + Tanggal + Tombol Aksi */}
      <PageHeader
        title="Dashboard keuangan"
        subtitle={`Posisi keuangan per ${today} · Diperbarui otomatis dari catatan pembukuan`}
        actions={
          <div className="flex items-center gap-8">
            {/* Tombol Panduan Dashboard */}
            <button
              type="button"
              className="cg-btn cg-btn--secondary inline-flex items-center gap-6 text-xs font-semibold"
              onClick={() => setShowGuideModal(true)}
            >
              <HelpCircle className="cg-icon cg-icon--xs" aria-hidden />
              <span>Panduan dashboard</span>
            </button>

            {/* Tombol Tambah Widget (Placeholder nonaktif dengan tooltip) */}
            <button
              type="button"
              disabled
              className="cg-btn cg-btn--secondary inline-flex items-center gap-6 text-xs font-semibold opacity-50 cursor-not-allowed"
              title="Fitur kustomisasi tata letak widget akan hadir pada pembaruan mendatang"
              aria-label="Tambah widget (segera hadir pada pembaruan mendatang)"
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Tambah widget</span>
            </button>
          </div>
        }
      />

      {/* Grid Utama 4 Widget Keuangan: 2 Grafik di atas, 2 Kartu di bawah */}
      <div className="grid grid-cols-1 laptop:grid-cols-2 gap-20">
        {/* WIDGET 1: LABA RUGI */}
        <div className="p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div>
            {/* Header Widget */}
            <div className="flex flex-wrap items-center justify-between gap-8 mb-16">
              <div>
                <h2 className="text-base font-bold text-text">Laba Rugi</h2>
                <p className="text-xs text-text-muted">Pendapatan, total beban, dan laba bersih</p>
              </div>

              {/* Pilihan Hari / Bulan */}
              <div className="flex items-center gap-4 bg-surface p-2 rounded-lg border border-border">
                <button
                  type="button"
                  className={`px-10 py-4 rounded-md text-xs font-semibold transition-colors ${
                    plTimeMode === 'day'
                      ? 'bg-surface-raised text-accent shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                  onClick={() => setPlTimeMode('day')}
                >
                  Hari
                </button>
                <button
                  type="button"
                  className={`px-10 py-4 rounded-md text-xs font-semibold transition-colors ${
                    plTimeMode === 'month'
                      ? 'bg-surface-raised text-accent shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                  onClick={() => setPlTimeMode('month')}
                >
                  Bulan
                </button>
              </div>
            </div>

            {/* 3 Nilai Ringkasan Laba Rugi */}
            <div className="grid grid-cols-3 gap-8 p-12 rounded-lg bg-surface border border-border mb-16">
              <div>
                <span className="text-[11px] text-text-muted block">Pendapatan</span>
                <span className="text-sm font-bold text-accent">
                  {formatRp(incomeSummary.revenue)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-muted block">Total Beban</span>
                <span className="text-sm font-bold text-danger">
                  {formatRp(incomeSummary.expenses)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-muted block">Laba Bersih</span>
                <span
                  className={`text-sm font-bold ${
                    incomeSummary.netProfit >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatRp(incomeSummary.netProfit)}
                </span>
              </div>
            </div>

            {/* Legenda Grafik */}
            <div className="flex items-center justify-end gap-16 text-xs mb-8">
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-accent" />
                <span className="text-text-muted">Pendapatan</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-danger" />
                <span className="text-text-muted">Beban</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-blue-500" />
                <span className="text-text-muted">Laba Bersih</span>
              </div>
            </div>

            {/* Grafik Garis SVG Murni */}
            <LineChartMulti
              series={plSeries.map((d) => ({
                label: d.label,
                val1: d.revenue,
                val2: d.expenses,
                val3: d.netProfit,
              }))}
              line1Color="var(--color-accent, #0E8044)"
              line2Color="var(--color-danger, #DC2626)"
              line3Color="#3B82F6"
              label1="Pendapatan"
              label2="Beban"
              label3="Laba Bersih"
              hoveredIndex={hoveredPlIndex}
              onHover={setHoveredPlIndex}
            />
          </div>

          <div className="mt-16 pt-10 border-t border-border flex justify-end">
            <Link
              href="/keuangan/laporan?tab=laba-rugi"
              className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
            >
              <span>Laporan laba rugi lengkap</span>
              <ArrowUpRight className="w-12 h-12" aria-hidden />
            </Link>
          </div>
        </div>

        {/* WIDGET 2: ARUS KAS */}
        <div className="p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div>
            {/* Header Widget */}
            <div className="flex flex-wrap items-center justify-between gap-8 mb-16">
              <div>
                <h2 className="text-base font-bold text-text">Arus Kas</h2>
                <p className="text-xs text-text-muted">Penerimaan masuk, pengeluaran keluar, dan saldo bersih</p>
              </div>

              {/* Pilihan Hari / Bulan */}
              <div className="flex items-center gap-4 bg-surface p-2 rounded-lg border border-border">
                <button
                  type="button"
                  className={`px-10 py-4 rounded-md text-xs font-semibold transition-colors ${
                    cfTimeMode === 'day'
                      ? 'bg-surface-raised text-accent shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                  onClick={() => setCfTimeMode('day')}
                >
                  Hari
                </button>
                <button
                  type="button"
                  className={`px-10 py-4 rounded-md text-xs font-semibold transition-colors ${
                    cfTimeMode === 'month'
                      ? 'bg-surface-raised text-accent shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                  onClick={() => setCfTimeMode('month')}
                >
                  Bulan
                </button>
              </div>
            </div>

            {/* 3 Nilai Ringkasan Arus Kas */}
            <div className="grid grid-cols-3 gap-8 p-12 rounded-lg bg-surface border border-border mb-16">
              <div>
                <span className="text-[11px] text-text-muted block">Kas Masuk</span>
                <span className="text-sm font-bold text-success">
                  {formatRp(cashFlow.inflow)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-muted block">Kas Keluar</span>
                <span className="text-sm font-bold text-danger">
                  {formatRp(cashFlow.outflow)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-muted block">Saldo Bersih</span>
                <span
                  className={`text-sm font-bold ${
                    cashFlow.net >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatRp(cashFlow.net)}
                </span>
              </div>
            </div>

            {/* Legenda Grafik */}
            <div className="flex items-center justify-end gap-16 text-xs mb-8">
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-success" />
                <span className="text-text-muted">Kas Masuk</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-danger" />
                <span className="text-text-muted">Kas Keluar</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="w-12 h-3 rounded-full bg-blue-500" />
                <span className="text-text-muted">Saldo Bersih</span>
              </div>
            </div>

            {/* Grafik Garis SVG Murni */}
            <LineChartMulti
              series={cfSeries.map((d) => ({
                label: d.label,
                val1: d.inflow,
                val2: d.outflow,
                val3: d.netCash,
              }))}
              line1Color="var(--color-success, #16A34A)"
              line2Color="var(--color-danger, #DC2626)"
              line3Color="#3B82F6"
              label1="Kas Masuk"
              label2="Kas Keluar"
              label3="Saldo Bersih"
              hoveredIndex={hoveredCfIndex}
              onHover={setHoveredCfIndex}
            />
          </div>

          <div className="mt-16 pt-10 border-t border-border flex justify-end">
            <Link
              href="/keuangan/laporan?tab=arus-kas"
              className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
            >
              <span>Laporan arus kas lengkap</span>
              <ArrowUpRight className="w-12 h-12" aria-hidden />
            </Link>
          </div>
        </div>

        {/* WIDGET 3: KARTU SALDO KAS */}
        <div className="p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-16">
              <div className="flex items-center gap-8">
                <div className="p-8 rounded-lg bg-accent/10 text-accent">
                  <Wallet className="cg-icon cg-icon--sm" aria-hidden />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Saldo Kas & Bank</h2>
                  <p className="text-xs text-text-muted">Daftar rekening kas dan bank operasional</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-text-muted block">Total Kas & Bank</span>
                <span className="text-base font-extrabold text-text">
                  {formatRp(totalCashBalance)}
                </span>
              </div>
            </div>

            {/* Daftar Akun Kas */}
            {cashAccountsWithBalance.length === 0 ? (
              <div className="py-24 text-center text-xs text-text-muted italic bg-surface/50 rounded-lg">
                Belum ada akun kas dan bank terdaftar
              </div>
            ) : (
              <div className="space-y-8">
                {cashAccountsWithBalance.slice(0, 5).map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-10 rounded-lg bg-surface border border-border text-xs"
                  >
                    <div className="min-w-0 pr-8">
                      <span className="font-semibold text-text truncate block">{acc.name}</span>
                      <span className="text-[11px] text-text-muted font-mono">{acc.code}</span>
                    </div>
                    <span className="font-bold text-text shrink-0 cg-num">
                      {formatRp(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-16 pt-10 border-t border-border flex justify-end">
            <Link
              href="/keuangan/kas"
              className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
            >
              <span>Buku kas & bank</span>
              <ArrowUpRight className="w-12 h-12" aria-hidden />
            </Link>
          </div>
        </div>

        {/* WIDGET 4: KARTU NERACA */}
        <div className="p-20 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-16">
              <div className="flex items-center gap-8">
                <div className="p-8 rounded-lg bg-accent/10 text-accent">
                  <Building2 className="cg-icon cg-icon--sm" aria-hidden />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Posisi Neraca</h2>
                  <p className="text-xs text-text-muted">Aset, kewajiban liabilitas, dan ekuitas modal</p>
                </div>
              </div>

              {/* Status Seimbang */}
              <div>
                {isNeracaBalanced ? (
                  <span className="inline-flex items-center gap-4 px-8 py-4 rounded-full text-xs font-semibold bg-success/15 text-success">
                    <CheckCircle2 className="w-12 h-12" aria-hidden />
                    <span>Seimbang</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-4 px-8 py-4 rounded-full text-xs font-semibold bg-danger/15 text-danger">
                    <AlertTriangle className="w-12 h-12" aria-hidden />
                    <span>Tidak Seimbang</span>
                  </span>
                )}
              </div>
            </div>

            {/* 3 Komponen Neraca */}
            <div className="space-y-12">
              <div className="p-12 rounded-lg bg-surface border border-border flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-text-muted block">Total Aset (Aktiva)</span>
                  <span className="text-base font-bold text-text mt-2 block">
                    {formatRp(balanceTotals.assets)}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-xs">
                  A
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12">
                <div className="p-12 rounded-lg bg-surface border border-border">
                  <span className="text-xs font-medium text-text-muted block">Liabilitas (Kewajiban)</span>
                  <span className="text-sm font-bold text-warning mt-2 block">
                    {formatRp(balanceTotals.liabilities)}
                  </span>
                </div>
                <div className="p-12 rounded-lg bg-surface border border-border">
                  <span className="text-xs font-medium text-text-muted block">Ekuitas (Modal)</span>
                  <span className="text-sm font-bold text-text mt-2 block">
                    {formatRp(balanceTotals.equity)}
                  </span>
                </div>
              </div>

              {/* Visualisasi Bar Proporsi: Aset = Liabilitas + Ekuitas */}
              <div className="space-y-4 pt-4">
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>Proporsi Kewajiban & Modal</span>
                  <span>
                    {balanceTotals.assets > 0
                      ? `${Math.round(((balanceTotals.liabilities + balanceTotals.equity) / balanceTotals.assets) * 100)}% dari Aset`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-8 rounded-full bg-surface overflow-hidden flex">
                  <div
                    className="h-full bg-warning transition-all"
                    style={{
                      width: `${balanceTotals.assets > 0 ? Math.min(100, Math.round((balanceTotals.liabilities / balanceTotals.assets) * 100)) : 0}%`,
                    }}
                    title={`Liabilitas: ${formatRp(balanceTotals.liabilities)}`}
                  />
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${balanceTotals.assets > 0 ? Math.min(100, Math.round((balanceTotals.equity / balanceTotals.assets) * 100)) : 100}%`,
                    }}
                    title={`Ekuitas: ${formatRp(balanceTotals.equity)}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-10 border-t border-border flex justify-end">
            <Link
              href="/keuangan/laporan?tab=neraca"
              className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
            >
              <span>Laporan neraca lengkap</span>
              <ArrowUpRight className="w-12 h-12" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* Modal Panduan Dashboard Keuangan */}
      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-raised border border-border shadow-pop p-24 select-none animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h3 id="guide-title" className="text-base font-bold text-text">
                Panduan Dashboard Keuangan
              </h3>
              <button
                type="button"
                className="p-6 rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
                onClick={() => setShowGuideModal(false)}
                aria-label="Tutup panduan"
              >
                <X className="cg-icon cg-icon--sm" aria-hidden />
              </button>
            </div>

            <div className="py-16 space-y-16 text-xs text-text leading-relaxed">
              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-6">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">1</span>
                  Laba Rugi
                </span>
                <p className="text-text-muted">
                  Memantau total pendapatan dari penjualan bersih, beban operasional dan HPP, serta laba bersih usaha pada rentang waktu yang Anda pilih.
                </p>
              </div>

              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-6">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">2</span>
                  Arus Kas (Cash Flow)
                </span>
                <p className="text-text-muted">
                  Menampilkan uang riil yang masuk ke bisnis (pembayaran tunai/non-tunai) dan uang yang keluar (belanja bahan, biaya kas operasional).
                </p>
              </div>

              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-6">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">3</span>
                  Saldo Kas & Bank
                </span>
                <p className="text-text-muted">
                  Menunjukkan posisi saldo likuid terkini di seluruh laci kasir dan rekening bank outlet Anda.
                </p>
              </div>

              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-6">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">4</span>
                  Posisi Neraca
                </span>
                <p className="text-text-muted">
                  Mengukur kekayaan usaha (Aset) dan memastikan keseimbangan akuntansi terhadap Kewajiban (Liabilitas) dan Modal Pemilik (Ekuitas).
                </p>
              </div>
            </div>

            <div className="pt-12 border-t border-border flex justify-end">
              <button
                type="button"
                className="cg-btn cg-btn--primary px-20 py-8 text-xs font-semibold"
                onClick={() => setShowGuideModal(false)}
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Komponen grafik SVG multi-garis buatan sendiri */
function LineChartMulti({
  series,
  line1Color,
  line2Color,
  line3Color,
  label1,
  label2,
  label3,
  hoveredIndex,
  onHover,
}: {
  series: { label: string; val1: number; val2: number; val3: number }[];
  line1Color: string;
  line2Color: string;
  line3Color: string;
  label1: string;
  label2: string;
  label3: string;
  hoveredIndex: number | null;
  onHover: (idx: number | null) => void;
}) {
  const chartId = useId();
  if (series.length === 0) return null;

  const svgW = 540;
  const svgH = 180;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 25;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const allVals = series.flatMap((s) => [s.val1, s.val2, s.val3]);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(100_000, ...allVals);
  const range = maxVal - minVal || 1;

  const getX = (idx: number) => padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minVal) / range) * plotH;

  const pts1 = series.map((s, i) => ({ x: getX(i), y: getY(s.val1) }));
  const pts2 = series.map((s, i) => ({ x: getX(i), y: getY(s.val2) }));
  const pts3 = series.map((s, i) => ({ x: getX(i), y: getY(s.val3) }));

  const path1 = createSmoothPath(pts1);
  const path2 = createSmoothPath(pts2);
  const path3 = createSmoothPath(pts3);

  const ySteps = [minVal, minVal + range * 0.5, maxVal];

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Grafik perbandingan keuangan multi-garis"
      >
        {/* Garis Grid Horizontal */}
        {ySteps.map((val, i) => {
          const y = getY(val);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgW - padRight}
                y2={y}
                stroke="var(--color-border, #E5E7EB)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="9"
                fill="var(--color-text-muted, #6B7280)"
              >
                {formatYLabel(val)}
              </text>
            </g>
          );
        })}

        {/* Label Sumbu X */}
        {series.map((s, i) => {
          const x = getX(i);
          return (
            <text
              key={i}
              x={x}
              y={padTop + plotH + 16}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-text-muted, #6B7280)"
            >
              {s.label}
            </text>
          );
        })}

        {/* Garis 2 (Beban / Kas Keluar) */}
        <path
          d={path2}
          fill="none"
          stroke={line2Color}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Garis 1 (Pendapatan / Kas Masuk) */}
        <path
          d={path1}
          fill="none"
          stroke={line1Color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Garis 3 (Laba Bersih / Saldo Bersih) */}
        <path
          d={path3}
          fill="none"
          stroke={line3Color}
          strokeWidth="2"
          strokeDasharray="4 2"
          strokeLinecap="round"
        />

        {/* Titik Interaktif */}
        {series.map((s, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <g key={i}>
              <circle
                cx={pts1[i]!.x}
                cy={pts1[i]!.y}
                r={isHovered ? 5 : 2.5}
                fill={line1Color}
                stroke="var(--color-surface-raised, #FFFFFF)"
                strokeWidth={isHovered ? 2 : 1}
              />
              <circle
                cx={pts2[i]!.x}
                cy={pts2[i]!.y}
                r={isHovered ? 5 : 2.5}
                fill={line2Color}
                stroke="var(--color-surface-raised, #FFFFFF)"
                strokeWidth={isHovered ? 2 : 1}
              />
              <circle
                cx={pts3[i]!.x}
                cy={pts3[i]!.y}
                r={isHovered ? 5 : 2.5}
                fill={line3Color}
                stroke="var(--color-surface-raised, #FFFFFF)"
                strokeWidth={isHovered ? 2 : 1}
              />
              <rect
                x={pts1[i]!.x - (plotW / Math.max(1, series.length)) / 2}
                y={padTop}
                width={plotW / Math.max(1, series.length)}
                height={plotH}
                fill="transparent"
                className="cursor-pointer focus:outline-none"
                tabIndex={0}
                aria-label={`${s.label}: ${label1} ${formatRp(s.val1)}, ${label2} ${formatRp(s.val2)}, ${label3} ${formatRp(s.val3)}`}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(i)}
                onBlur={() => onHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIndex !== null && series[hoveredIndex] && (
        <div
          className="absolute z-20 px-10 py-6 rounded-lg bg-neutral-900 text-white text-[11px] shadow-pop pointer-events-none transform -translate-x-1/2 -translate-y-full mb-6 animate-fadeIn"
          style={{
            left: `${(getX(hoveredIndex) / svgW) * 100}%`,
            top: `${(pts1[hoveredIndex]!.y / svgH) * 100}%`,
          }}
        >
          <p className="font-bold border-b border-white/20 pb-2 mb-4">
            {series[hoveredIndex]!.label}
          </p>
          <div className="flex justify-between gap-10">
            <span className="text-white/70">{label1}:</span>
            <span className="font-bold text-accent-soft">
              {formatRp(series[hoveredIndex]!.val1)}
            </span>
          </div>
          <div className="flex justify-between gap-10">
            <span className="text-white/70">{label2}:</span>
            <span className="text-red-300">
              {formatRp(series[hoveredIndex]!.val2)}
            </span>
          </div>
          <div className="flex justify-between gap-10 pt-2 border-t border-white/10 mt-2 font-semibold">
            <span className="text-white/70">{label3}:</span>
            <span className="text-blue-300">
              {formatRp(series[hoveredIndex]!.val3)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useId, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  Plus,
  TrendingUp,
  Wallet,
  Building2,
  DollarSign,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
  ChevronUp,
  ChevronDown,
  Trash2,
  RotateCcw,
  Clock,
  ArrowDownUp,
  CreditCard,
} from 'lucide-react';
import {
  formatRp,
  extractIncomeBreakdown,
  shiftDateDays,
  getDaysInMonth,
  agingBucket,
  AGING_BUCKETS,
  payablesBySupplier,
  DEFAULT_FINANCE_WIDGETS,
  FINANCE_WIDGET_CATALOG,
  VALID_WIDGET_IDS,
  validateAndMigrateLayout,
  addWidgetToLayout,
  removeWidgetFromLayout,
  moveWidgetInLayout,
  getAvailableWidgets,
  serializeFinanceLayout,
  getFinanceLayoutStorageKey,
  type FinanceWidgetId,
  type FinanceWidgetMeta,
  type StatementRow,
  type Account,
  type TrialRow,
  type CashFlow,
  type BalanceSheetTotals,
  type PayableRow,
  type PaymentMethod,
  type Order,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useAuth } from '@/lib/auth';

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

/** Menghasilkan kurva monotone cubic bezier */
function createSmoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  if (n === 2) return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)} L ${points[1]!.x.toFixed(2)} ${points[1]!.y.toFixed(2)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dX = points[i + 1]!.x - points[i]!.x;
    const dY = points[i + 1]!.y - points[i]!.y;
    dx.push(dX);
    slope.push(dX === 0 ? 0 : dY / dX);
  }

  const m: number[] = new Array(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slope[i - 1]! + slope[i]!) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i]! / slope[i]!;
      const beta = m[i + 1]! / slope[i]!;
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[i] = tau * alpha * slope[i]!;
        m[i + 1] = tau * beta * slope[i]!;
      }
    }
  }

  let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const dX = dx[i]!;
    const cp1x = p1.x + dX / 3;
    const cp1y = p1.y + (m[i]! * dX) / 3;
    const cp2x = p2.x - dX / 3;
    const cp2y = p2.y - (m[i + 1]! * dX) / 3;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function FinanceDashboardPage() {
  const data = useData();
  const auth = useAuth();

  // Dialog panduan dashboard
  const [showGuideModal, setShowGuideModal] = useState(false);
  // Dialog tambah widget
  const [showAddModal, setShowAddModal] = useState(false);

  // Kunci storage terisolasi per pengguna
  const storageKey = useMemo(() => {
    return getFinanceLayoutStorageKey(auth?.email);
  }, [auth?.email]);

  // Tata letak widget aktif
  const [widgets, setWidgets] = useState<FinanceWidgetId[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          return validateAndMigrateLayout(stored);
        }
      } catch {
        // Fallback
      }
    }
    return [...DEFAULT_FINANCE_WIDGETS];
  });

  // Muat ulang bila user auth berubah
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          setWidgets(validateAndMigrateLayout(stored));
        } else {
          setWidgets([...DEFAULT_FINANCE_WIDGETS]);
        }
      } catch {
        setWidgets([...DEFAULT_FINANCE_WIDGETS]);
      }
    }
  }, [storageKey]);

  function persistLayout(newWidgets: FinanceWidgetId[]) {
    setWidgets(newWidgets);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, serializeFinanceLayout(newWidgets));
      }
    } catch {
      // Abaikan galat quota localStorage
    }
  }

  function handleAddWidget(id: FinanceWidgetId) {
    const updated = addWidgetToLayout(widgets, id);
    persistLayout(updated);
    setShowAddModal(false);
  }

  function handleRemoveWidget(id: FinanceWidgetId) {
    const updated = removeWidgetFromLayout(widgets, id);
    persistLayout(updated);
  }

  function handleMoveWidget(id: FinanceWidgetId, direction: 'up' | 'down') {
    const updated = moveWidgetInLayout(widgets, id, direction);
    persistLayout(updated);
  }

  function handleResetDefault() {
    persistLayout([...DEFAULT_FINANCE_WIDGETS]);
  }

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

    // 1. Data utama keuangan (termasuk hutang & non-tunai)
    const [
      income,
      accounts,
      trial,
      cashFlow,
      balance,
      payables,
      paymentMethods,
      paidOrders,
    ] = await Promise.all([
      data.incomeStatement(span),
      data.listAccounts(),
      data.trialBalance(span),
      data.cashFlow(span),
      data.balanceSheet(today),
      data.payablesAging(today).catch(() => [] as PayableRow[]),
      data.listPaymentMethods().catch(() => [] as PaymentMethod[]),
      data.listOrders({ status: 'paid', from: span.from, to: span.to, all: true }).catch(() => [] as Order[]),
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
      payables,
      paymentMethods,
      paidOrders,
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
          <div className="h-[280px] rounded-xl bg-surface animate-pulse" />
          <div className="h-[280px] rounded-xl bg-surface animate-pulse" />
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="h-[240px] rounded-xl bg-surface animate-pulse" />
          <div className="h-[240px] rounded-xl bg-surface animate-pulse" />
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
    payables,
    paymentMethods,
    paidOrders,
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
  const cashAccountsWithBalance = cashAccounts
    .map((acc) => {
      const t = trialMap.get(acc.id);
      const balanceVal = t ? t.closing : 0;
      return {
        ...acc,
        balance: balanceVal,
      };
    })
    .sort((a, b) => b.balance - a.balance);

  const totalCashBalance = cashAccountsWithBalance.reduce((sum, a) => sum + a.balance, 0);

  // Neraca
  const balanceTotals: BalanceSheetTotals = balance.totals;
  const isNeracaBalanced = balanceTotals.balanced;

  // Umur hutang
  const agingBuckets = AGING_BUCKETS.map((_, i) =>
    payables.filter((r) => agingBucket(r.daysOverdue) === i).reduce((n, r) => n + r.outstanding, 0)
  );
  const totalPayables = payables.reduce((n, r) => n + r.outstanding, 0);
  const suppliersWithDebt = payablesBySupplier(payables);

  // Rekonsiliasi non-tunai ringkas
  const nonCashMethods = paymentMethods.filter(
    (m) => m.kind !== 'cash' && m.kind !== 'complimentary'
  );
  const nonCashMethodIds = new Set(nonCashMethods.map((m) => m.id));
  const nonCashPayments = paidOrders.flatMap((o) =>
    o.payments.filter((p) => nonCashMethodIds.has(p.methodId))
  );
  const totalNonCashAmount = nonCashPayments.reduce((sum, p) => sum + p.amount, 0);

  // Agregasi non-tunai per metode
  const nonCashByMethodMap = new Map<string, { name: string; amount: number; count: number }>();
  for (const m of nonCashMethods) {
    nonCashByMethodMap.set(m.id, { name: m.name, amount: 0, count: 0 });
  }
  for (const p of nonCashPayments) {
    const cur = nonCashByMethodMap.get(p.methodId) ?? { name: p.methodName, amount: 0, count: 0 };
    cur.amount += p.amount;
    cur.count += 1;
    nonCashByMethodMap.set(p.methodId, cur);
  }
  const nonCashSummaryList = Array.from(nonCashByMethodMap.values())
    .filter((it) => it.amount > 0 || it.count > 0)
    .sort((a, b) => b.amount - a.amount);

  // Time series aktif
  const plSeries = plTimeMode === 'day' ? dailyResults : monthlyResults;
  const cfSeries = cfTimeMode === 'day' ? dailyResults : monthlyResults;

  // Render konten spesifik per ID widget
  function renderWidgetBody(id: FinanceWidgetId) {
    switch (id) {
      case 'laba-rugi':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-8 mb-16">
                <div>
                  <h2 className="text-base font-bold text-text">Laba Rugi</h2>
                  <p className="text-xs text-text-muted">Pendapatan, total beban, dan laba bersih</p>
                </div>
                <div className="flex items-center gap-4 bg-surface p-[2px] rounded-lg border border-border">
                  <button
                    type="button"
                    className={`px-[10px] py-[4px] rounded-md text-xs font-semibold transition-colors ${
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
                    className={`px-[10px] py-[4px] rounded-md text-xs font-semibold transition-colors ${
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

              <div className="grid grid-cols-3 gap-8 p-12 rounded-lg bg-surface border border-border mb-16">
                <div>
                  <span className="text-[11px] text-text-muted block">Pendapatan</span>
                  <span className="text-sm font-bold text-accent-strong">
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
                      incomeSummary.netProfit >= 0 ? 'text-accent-strong' : 'text-danger'
                    }`}
                  >
                    {formatRp(incomeSummary.netProfit)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-16 text-xs mb-8">
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-accent" />
                  <span className="text-text-muted">Pendapatan</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-danger" />
                  <span className="text-text-muted">Beban</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-info-strong" />
                  <span className="text-text-muted">Laba Bersih</span>
                </div>
              </div>

              <LineChartMulti
                series={plSeries.map((d) => ({
                  label: d.label,
                  val1: d.revenue,
                  val2: d.expenses,
                  val3: d.netProfit,
                }))}
                line1Color="var(--color-accent, #0E8044)"
                line2Color="var(--color-danger, #DC2626)"
                line3Color="var(--color-info-strong, #0369A1)"
                label1="Pendapatan"
                label2="Beban"
                label3="Laba Bersih"
                hoveredIndex={hoveredPlIndex}
                onHover={setHoveredPlIndex}
              />
            </div>

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/laporan?tab=laba-rugi"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Laporan laba rugi lengkap</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );

      case 'arus-kas':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-8 mb-16">
                <div>
                  <h2 className="text-base font-bold text-text">Arus Kas</h2>
                  <p className="text-xs text-text-muted">Penerimaan masuk, pengeluaran keluar, dan saldo bersih</p>
                </div>
                <div className="flex items-center gap-4 bg-surface p-[2px] rounded-lg border border-border">
                  <button
                    type="button"
                    className={`px-[10px] py-[4px] rounded-md text-xs font-semibold transition-colors ${
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
                    className={`px-[10px] py-[4px] rounded-md text-xs font-semibold transition-colors ${
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

              <div className="flex items-center justify-end gap-16 text-xs mb-8">
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-success" />
                  <span className="text-text-muted">Kas Masuk</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-danger" />
                  <span className="text-text-muted">Kas Keluar</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <span className="w-12 h-[3px] rounded-full bg-info-strong" />
                  <span className="text-text-muted">Saldo Bersih</span>
                </div>
              </div>

              <LineChartMulti
                series={cfSeries.map((d) => ({
                  label: d.label,
                  val1: d.inflow,
                  val2: d.outflow,
                  val3: d.netCash,
                }))}
                line1Color="var(--color-success, #16A34A)"
                line2Color="var(--color-danger, #DC2626)"
                line3Color="var(--color-info-strong, #0369A1)"
                label1="Kas Masuk"
                label2="Kas Keluar"
                label3="Saldo Bersih"
                hoveredIndex={hoveredCfIndex}
                onHover={setHoveredCfIndex}
              />
            </div>

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/laporan?tab=arus-kas"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Laporan arus kas lengkap</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );

      case 'saldo-kas':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-8">
                  <div className="p-8 rounded-lg bg-accent-soft text-accent">
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

              {cashAccountsWithBalance.length === 0 ? (
                <div className="py-24 text-center text-xs text-text-muted italic bg-surface rounded-lg">
                  Belum ada akun kas dan bank terdaftar
                </div>
              ) : (
                <div className="space-y-4">
                  {cashAccountsWithBalance.slice(0, 5).map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between px-[10px] py-[6px] rounded-lg bg-surface border border-border text-xs"
                    >
                      <div className="min-w-0 pr-8">
                        <span className="font-semibold text-text truncate block leading-tight">{acc.name}</span>
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

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/kas"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Buku kas & bank</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );

      case 'posisi-neraca':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-8">
                  <div className="p-8 rounded-lg bg-accent-soft text-accent">
                    <Building2 className="cg-icon cg-icon--sm" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-text">Posisi Neraca</h2>
                    <p className="text-xs text-text-muted">Aset, kewajiban liabilitas, dan ekuitas modal</p>
                  </div>
                </div>

                <div>
                  {isNeracaBalanced ? (
                    <span className="inline-flex items-center gap-4 px-8 py-[4px] rounded-full text-xs font-semibold bg-success-soft text-success-strong">
                      <CheckCircle2 className="w-12 h-12" aria-hidden />
                      <span>Seimbang</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-4 px-8 py-[4px] rounded-full text-xs font-semibold bg-danger-soft text-danger-strong">
                      <AlertTriangle className="w-12 h-12" aria-hidden />
                      <span>Tidak Seimbang</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-12">
                <div className="p-12 rounded-lg bg-surface border border-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-text-muted block">Total Aset (Aktiva)</span>
                    <span className="text-base font-bold text-text mt-[2px] block">
                      {formatRp(balanceTotals.assets)}
                    </span>
                  </div>
                  <span className="px-8 py-[2px] rounded-md bg-accent-soft text-accent font-semibold text-xs">
                    Aktiva
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-12">
                  <div className="p-12 rounded-lg bg-surface border border-border">
                    <span className="text-xs font-medium text-text-muted block">Liabilitas (Kewajiban)</span>
                    <span className="text-sm font-bold text-warning-strong mt-[2px] block">
                      {formatRp(balanceTotals.liabilities)}
                    </span>
                  </div>
                  <div className="p-12 rounded-lg bg-surface border border-border">
                    <span className="text-xs font-medium text-text-muted block">Ekuitas (Modal)</span>
                    <span className="text-sm font-bold text-text mt-[2px] block">
                      {formatRp(balanceTotals.equity)}
                    </span>
                  </div>
                </div>

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
                      className="h-full bg-warning-strong transition-all"
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
        );

      case 'umur-hutang':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-8">
                  <div className="p-8 rounded-lg bg-accent-soft text-accent">
                    <Clock className="cg-icon cg-icon--sm" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-text">Umur Hutang</h2>
                    <p className="text-xs text-text-muted">Faktur pembelian belum dibayar & jatuh tempo</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-text-muted block">Total Hutang Usaha</span>
                  <span className="text-base font-extrabold text-danger">
                    {formatRp(totalPayables)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 tablet:grid-cols-4 gap-8 mb-16">
                {AGING_BUCKETS.map((label, idx) => (
                  <div
                    key={label}
                    className="p-8 rounded-lg bg-surface border border-border text-center space-y-[2px]"
                  >
                    <span className="text-[10px] text-text-muted block leading-tight truncate">
                      {label}
                    </span>
                    <span className="text-xs font-bold text-text block cg-num">
                      {formatRp(agingBuckets[idx] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>

              {suppliersWithDebt.length === 0 ? (
                <div className="py-20 text-center text-xs text-text-muted italic bg-surface rounded-lg">
                  Tidak ada hutang usaha berjalan. Semua faktur pembelian sudah lunas.
                </div>
              ) : (
                <div className="space-y-4">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                    Pemasok Utama Tertunggak
                  </span>
                  {suppliersWithDebt.slice(0, 3).map((s) => (
                    <div
                      key={s.supplierName}
                      className="flex items-center justify-between px-[10px] py-[6px] rounded-lg bg-surface border border-border text-xs"
                    >
                      <div className="min-w-0 pr-8">
                        <span className="font-semibold text-text truncate block">{s.supplierName}</span>
                        <span className="text-[11px] text-text-muted">{s.count} faktur</span>
                      </div>
                      <span className="font-bold text-danger shrink-0 cg-num">
                        {formatRp(s.outstanding)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/laporan?tab=hutang"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Daftar umur hutang lengkap</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );

      case 'arus-ringkas': {
        const totalFlow = cashFlow.inflow + cashFlow.outflow;
        const inPct = totalFlow > 0 ? Math.round((cashFlow.inflow / totalFlow) * 100) : 50;
        const outPct = 100 - inPct;

        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-8">
                  <div className="p-8 rounded-lg bg-accent-soft text-accent">
                    <ArrowDownUp className="cg-icon cg-icon--sm" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-text">Penerimaan & Pengeluaran Ringkas</h2>
                    <p className="text-xs text-text-muted">Ringkasan arus kas masuk vs keluar periode ini</p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-4 px-8 py-[4px] rounded-full text-xs font-semibold ${
                    cashFlow.net >= 0 ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger-strong'
                  }`}
                >
                  {cashFlow.net >= 0 ? 'Surplus' : 'Defisit'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-12 mb-16">
                <div className="p-12 rounded-lg bg-surface border border-border space-y-[2px]">
                  <span className="text-[11px] text-text-muted block">Total Kas Masuk</span>
                  <span className="text-base font-extrabold text-success block">
                    {formatRp(cashFlow.inflow)}
                  </span>
                  <span className="text-[10px] text-text-muted block">{inPct}% dari perputaran</span>
                </div>

                <div className="p-12 rounded-lg bg-surface border border-border space-y-[2px]">
                  <span className="text-[11px] text-text-muted block">Total Kas Keluar</span>
                  <span className="text-base font-extrabold text-danger block">
                    {formatRp(cashFlow.outflow)}
                  </span>
                  <span className="text-[10px] text-text-muted block">{outPct}% dari perputaran</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Rasio Arus Masuk vs Keluar</span>
                  <span className="font-semibold text-text">
                    Bersih: {formatRp(cashFlow.net)}
                  </span>
                </div>
                <div className="w-full h-8 rounded-full bg-surface overflow-hidden flex">
                  <div
                    className="h-full bg-success transition-all"
                    style={{ width: `${inPct}%` }}
                    title={`Kas Masuk: ${formatRp(cashFlow.inflow)}`}
                  />
                  <div
                    className="h-full bg-danger transition-all"
                    style={{ width: `${outPct}%` }}
                    title={`Kas Keluar: ${formatRp(cashFlow.outflow)}`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/laporan?tab=arus-kas"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Laporan arus kas lengkap</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );
      }

      case 'rekonsiliasi-ringkas':
        return (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-8">
                  <div className="p-8 rounded-lg bg-accent-soft text-accent">
                    <CreditCard className="cg-icon cg-icon--sm" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-text">Rekonsiliasi Non-tunai Ringkas</h2>
                    <p className="text-xs text-text-muted">Pembayaran non-tunai (kartu, QRIS, transfer)</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-text-muted block">Total Non-tunai</span>
                  <span className="text-base font-extrabold text-accent-strong">
                    {formatRp(totalNonCashAmount)}
                  </span>
                </div>
              </div>

              {nonCashSummaryList.length === 0 ? (
                <div className="py-20 text-center text-xs text-text-muted italic bg-surface rounded-lg">
                  Belum ada transaksi pembayaran non-tunai pada periode ini.
                </div>
              ) : (
                <div className="space-y-6 mb-16">
                  {nonCashSummaryList.slice(0, 4).map((it) => (
                    <div
                      key={it.name}
                      className="flex items-center justify-between px-[10px] py-[6px] rounded-lg bg-surface border border-border text-xs"
                    >
                      <div className="min-w-0 pr-8">
                        <span className="font-semibold text-text truncate block">{it.name}</span>
                        <span className="text-[11px] text-text-muted">{it.count} transaksi lunas</span>
                      </div>
                      <span className="font-bold text-text shrink-0 cg-num">
                        {formatRp(it.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-border flex justify-end">
              <Link
                href="/keuangan/rekonsiliasi"
                className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-4 transition-colors"
              >
                <span>Halaman rekonsiliasi non-tunai</span>
                <ArrowUpRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  const availableWidgets = getAvailableWidgets(widgets);

  return (
    <div className="space-y-24 max-w-full">
      {/* 1. Header: Judul + Panduan + Kembalikan Bawaan + Tambah Widget */}
      <PageHeader
        title="Dashboard keuangan"
        subtitle={`Posisi keuangan per ${today} · Diperbarui otomatis dari catatan pembukuan`}
        actions={
          <div className="flex flex-wrap items-center gap-8">
            {/* Tombol Panduan Dashboard */}
            <button
              type="button"
              className="cg-btn cg-btn--secondary inline-flex items-center gap-[6px] text-xs font-semibold"
              onClick={() => setShowGuideModal(true)}
            >
              <HelpCircle className="cg-icon cg-icon--xs" aria-hidden />
              <span>Panduan dashboard</span>
            </button>

            {/* Tombol Kembalikan Bawaan */}
            <button
              type="button"
              className="cg-btn cg-btn--secondary inline-flex items-center gap-[6px] text-xs font-semibold"
              onClick={handleResetDefault}
              title="Kembalikan susunan widget ke pengaturan bawaan sistem"
              data-testid="btn-reset-layout"
            >
              <RotateCcw className="cg-icon cg-icon--xs" aria-hidden />
              <span>Kembalikan bawaan</span>
            </button>

            {/* Tombol Tambah Widget */}
            <button
              type="button"
              className="cg-btn cg-btn--primary inline-flex items-center gap-[6px] text-xs font-semibold"
              onClick={() => setShowAddModal(true)}
              data-testid="btn-add-widget"
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Tambah widget</span>
            </button>
          </div>
        }
      />

      {/* Keadaan Kosong (Tanpa Widget) */}
      {widgets.length === 0 && (
        <div
          className="cg-empty py-32 space-y-12 text-center"
          data-testid="empty-widgets-state"
        >
          <p className="text-base font-bold text-text">Belum ada widget di dashboard keuangan Anda</p>
          <p className="text-sm text-text-muted max-w-[480px] mx-auto">
            Pilih widget dari katalog untuk memantau performa laba rugi, arus kas, saldo rekening kas & bank, posisi neraca, dan umur hutang.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 pt-8">
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setShowAddModal(true)}
              data-testid="btn-empty-add"
            >
              <Plus className="cg-icon cg-icon--xs mr-[6px]" aria-hidden />
              <span>Tambah Widget Pertama</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleResetDefault}
              data-testid="btn-empty-reset"
            >
              <RotateCcw className="cg-icon cg-icon--xs mr-[6px]" aria-hidden />
              <span>Pasang Widget Bawaan</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid Widget Dinamis */}
      {widgets.length > 0 && (
        <div className="grid grid-cols-1 laptop:grid-cols-2 gap-20 items-start">
          {widgets.map((widgetId, index) => {
            const meta = FINANCE_WIDGET_CATALOG.find((w) => w.id === widgetId);
            const isFirst = index === 0;
            const isLast = index === widgets.length - 1;

            return (
              <div
                key={widgetId}
                className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col min-w-0"
                data-testid={`widget-${widgetId}`}
              >
                {/* Header Kontrol Kartu: Nama & Tombol Urut Naik/Turun/Hapus */}
                <div className="flex items-center justify-between gap-8 mb-12 pb-8 border-b border-border">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted truncate">
                    {meta?.title ?? widgetId}
                  </span>

                  <div className="flex items-center gap-[4px] shrink-0">
                    <button
                      type="button"
                      className="p-[4px] rounded-md text-text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      disabled={isFirst}
                      onClick={() => handleMoveWidget(widgetId, 'up')}
                      title="Pindahkan widget ke atas"
                      aria-label={`Pindahkan widget ${meta?.title ?? widgetId} ke atas`}
                      data-testid={`btn-move-up-${widgetId}`}
                    >
                      <ChevronUp className="w-[14px] h-[14px]" aria-hidden />
                    </button>

                    <button
                      type="button"
                      className="p-[4px] rounded-md text-text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      disabled={isLast}
                      onClick={() => handleMoveWidget(widgetId, 'down')}
                      title="Pindahkan widget ke bawah"
                      aria-label={`Pindahkan widget ${meta?.title ?? widgetId} ke bawah`}
                      data-testid={`btn-move-down-${widgetId}`}
                    >
                      <ChevronDown className="w-[14px] h-[14px]" aria-hidden />
                    </button>

                    <button
                      type="button"
                      className="p-[4px] rounded-md text-text-muted hover:text-danger hover:bg-danger-soft transition-colors ml-[4px]"
                      onClick={() => handleRemoveWidget(widgetId)}
                      title="Hapus widget dari dashboard"
                      aria-label={`Hapus widget ${meta?.title ?? widgetId}`}
                      data-testid={`btn-remove-${widgetId}`}
                    >
                      <Trash2 className="w-[14px] h-[14px]" aria-hidden />
                    </button>
                  </div>
                </div>

                {/* Konten Widget */}
                {renderWidgetBody(widgetId)}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Dialog Pemilih Widget Baru */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-widget-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-surface-raised border border-border shadow-pop p-24 animate-scaleIn min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-12 border-b border-border shrink-0">
              <div>
                <h3 id="add-widget-title" className="text-base font-bold text-text">
                  Tambah Widget Keuangan
                </h3>
                <p className="text-xs text-text-muted">
                  Pilih widget dari katalog untuk ditampilkan di dashboard keuangan Anda
                </p>
              </div>
              <button
                type="button"
                className="p-[6px] rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup dialog katalog widget"
              >
                <X className="cg-icon cg-icon--sm" aria-hidden />
              </button>
            </div>

            {/* Modal Body: Daftar Widget Tersedia */}
            <div className="py-16 overflow-y-auto space-y-12 min-w-0">
              {availableWidgets.length === 0 ? (
                <div className="py-32 text-center text-xs text-text-muted italic bg-surface rounded-xl">
                  Semua widget yang tersedia ({FINANCE_WIDGET_CATALOG.length} widget) sudah terpasang di dashboard keuangan Anda.
                </div>
              ) : (
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12 min-w-0">
                  {availableWidgets.map((item) => (
                    <div
                      key={item.id}
                      className="p-12 rounded-xl bg-surface border border-border hover:border-accent transition-all flex flex-col justify-between space-y-8"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-[6px] py-[2px] rounded bg-accent-soft text-accent">
                            {item.category}
                          </span>
                          <span className="text-[11px] text-text-muted font-mono">
                            #{item.id}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-text">{item.title}</h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      {/* Pratinjau Mini Widget */}
                      <WidgetMiniPreview id={item.id} />

                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary w-full py-[6px] text-xs font-semibold inline-flex items-center justify-center gap-4"
                        onClick={() => handleAddWidget(item.id)}
                        data-testid={`btn-select-widget-${item.id}`}
                      >
                        <Plus className="w-[14px] h-[14px]" aria-hidden />
                        <span>Pasang di Dashboard</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-12 border-t border-border flex justify-end shrink-0">
              <button
                type="button"
                className="cg-btn cg-btn--secondary text-xs font-semibold"
                onClick={() => setShowAddModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

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
                className="p-[6px] rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
                onClick={() => setShowGuideModal(false)}
                aria-label="Tutup panduan"
              >
                <X className="cg-icon cg-icon--sm" aria-hidden />
              </button>
            </div>

            <div className="py-16 space-y-16 text-xs text-text leading-relaxed">
              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-[6px]">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">1</span>
                  Laba Rugi & Arus Kas
                </span>
                <p className="text-text-muted">
                  Memantau total pendapatan dari penjualan bersih, beban operasional, serta kas riil masuk dan keluar.
                </p>
              </div>

              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-[6px]">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">2</span>
                  Kustomisasi Tata Letak Widget
                </span>
                <p className="text-text-muted">
                  Gunakan tombol Tambah widget untuk memilih kartu baru, tombol panah naik/turun di tiap kartu untuk mengatur posisi, dan tombol tempat sampah untuk menghapus widget.
                </p>
              </div>

              <div className="p-12 rounded-lg bg-surface border border-border space-y-4">
                <span className="font-bold text-text text-sm flex items-center gap-[6px]">
                  <span className="w-8 h-8 rounded-full bg-accent text-on-accent inline-flex items-center justify-center text-[10px]">3</span>
                  Penyimpanan Perangkat
                </span>
                <p className="text-text-muted">
                  Susunan widget Anda tersimpan otomatis di peramban ini. Anda dapat mengklik tombol Kembalikan bawaan kapan saja untuk kembali ke konfigurasi standar.
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

/** Komponen pratinjau mini widget dalam katalog */
function WidgetMiniPreview({ id }: { id: FinanceWidgetId }) {
  switch (id) {
    case 'laba-rugi':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-between" aria-hidden>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Pendapatan / Beban</span>
            <span className="text-accent font-semibold">Tren Laba</span>
          </div>
          <svg viewBox="0 0 100 24" className="w-full h-[24px]">
            <path d="M 0 18 Q 25 10, 50 14 T 100 4" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
            <path d="M 0 20 Q 30 18, 60 16 T 100 12" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        </div>
      );
    case 'arus-kas':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-between" aria-hidden>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Kas Masuk vs Keluar</span>
            <span className="text-success font-semibold">Arus Kas</span>
          </div>
          <div className="flex items-end gap-4 h-[24px]">
            <div className="w-1/4 h-[80%] bg-success rounded-t-sm" />
            <div className="w-1/4 h-[40%] bg-danger rounded-t-sm" />
            <div className="w-1/4 h-[100%] bg-success rounded-t-sm" />
            <div className="w-1/4 h-[50%] bg-danger rounded-t-sm" />
          </div>
        </div>
      );
    case 'saldo-kas':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-center space-y-4" aria-hidden>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-text">Kas Toko</span>
            <span className="font-bold text-accent">Rp 1.250.000</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-text">Bank BCA</span>
            <span className="font-bold text-accent">Rp 8.400.000</span>
          </div>
        </div>
      );
    case 'posisi-neraca':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-between" aria-hidden>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Aktiva</span>
            <span>Kewajiban & Modal</span>
          </div>
          <div className="w-full h-8 rounded-full bg-surface overflow-hidden flex">
            <div className="w-[60%] h-full bg-accent" />
            <div className="w-[40%] h-full bg-warning-strong" />
          </div>
        </div>
      );
    case 'umur-hutang':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex items-center justify-between gap-4" aria-hidden>
          <div className="flex-1 bg-surface p-[4px] rounded text-center">
            <span className="text-[9px] text-text-muted block">Lancar</span>
            <span className="text-[10px] font-bold text-text">0-30 hr</span>
          </div>
          <div className="flex-1 bg-danger-soft p-[4px] rounded text-center">
            <span className="text-[9px] text-danger-strong block">Jatuh Tempo</span>
            <span className="text-[10px] font-bold text-danger">&gt;60 hr</span>
          </div>
        </div>
      );
    case 'arus-ringkas':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-between" aria-hidden>
          <div className="flex justify-between text-[10px]">
            <span className="text-success font-semibold">Masuk 65%</span>
            <span className="text-danger font-semibold">Keluar 35%</span>
          </div>
          <div className="w-full h-8 rounded-full bg-surface overflow-hidden flex">
            <div className="w-[65%] h-full bg-success" />
            <div className="w-[35%] h-full bg-danger" />
          </div>
        </div>
      );
    case 'rekonsiliasi-ringkas':
      return (
        <div className="p-8 rounded-lg bg-surface-raised border border-border/80 h-[64px] flex flex-col justify-center space-y-4" aria-hidden>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-text">QRIS / EDC</span>
            <span className="text-success font-semibold">Tercocokkan</span>
          </div>
          <div className="w-full h-[4px] rounded-full bg-success" />
        </div>
      );
    default:
      return null;
  }
}

/** Komponen grafik SVG multi-garis */
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

  if (series.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-xs text-text-muted italic bg-surface/50 rounded-lg">
        Belum ada data untuk periode ini
      </div>
    );
  }

  const allVals = series.flatMap((s) => [s.val1, s.val2, s.val3]);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(100_000, ...allVals);
  const valRange = maxVal - minVal || 1;

  const width = 600;
  const height = 180;
  const padLeft = 60;
  const padRight = 24;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (idx: number) => {
    if (series.length === 1) return padLeft + plotW / 2;
    return padLeft + (idx / (series.length - 1)) * plotW;
  };

  const getY = (val: number) => {
    return padTop + plotH - ((val - minVal) / valRange) * plotH;
  };

  const zeroY = getY(0);

  const pts1 = series.map((s, i) => ({ x: getX(i), y: getY(s.val1) }));
  const pts2 = series.map((s, i) => ({ x: getX(i), y: getY(s.val2) }));
  const pts3 = series.map((s, i) => ({ x: getX(i), y: getY(s.val3) }));

  const path1 = createSmoothPath(pts1);
  const path2 = createSmoothPath(pts2);
  const path3 = createSmoothPath(pts3);

  const yTicks = [
    minVal,
    minVal + valRange * 0.33,
    minVal + valRange * 0.66,
    maxVal,
  ];

  return (
    <div className="relative select-none min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible block"
        onMouseLeave={() => onHover(null)}
      >
        {/* Garis Grid Horizontal */}
        {yTicks.map((tVal, i) => {
          const y = getY(tVal);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--color-border)"
                strokeDasharray="3,3"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-text-muted font-mono"
              >
                {formatYLabel(tVal)}
              </text>
            </g>
          );
        })}

        {/* Garis Sumbu Nol (Bila ada nilai negatif) */}
        {minVal < 0 && (
          <line
            x1={padLeft}
            y1={zeroY}
            x2={width - padRight}
            y2={zeroY}
            stroke="var(--color-border-input)"
            strokeWidth="1.5"
          />
        )}

        {/* Kurva Garis 1, 2, 3 */}
        <path d={path2} fill="none" stroke={line2Color} strokeWidth="2" strokeDasharray="4,4" />
        <path d={path3} fill="none" stroke={line3Color} strokeWidth="2" />
        <path d={path1} fill="none" stroke={line1Color} strokeWidth="2.5" />

        {/* Titik & Interaksi Hover */}
        {series.map((s, i) => {
          const x = getX(i);
          const isHovered = hoveredIndex === i;

          return (
            <g key={i}>
              {/* Garis Penunjuk Vertikal Saat Hover */}
              {isHovered && (
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={height - padBottom}
                  stroke="var(--color-text-muted)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              )}

              {/* Titik Kurva */}
              <circle cx={x} cy={getY(s.val1)} r={isHovered ? 5 : 3.5} fill={line1Color} />
              <circle cx={x} cy={getY(s.val2)} r={isHovered ? 4.5 : 3} fill={line2Color} />
              <circle cx={x} cy={getY(s.val3)} r={isHovered ? 4.5 : 3} fill={line3Color} />

              {/* Label Sumbu X (Tanggal/Bulan) */}
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                className={`text-[10px] font-sans ${isHovered ? 'fill-text font-bold' : 'fill-text-muted'}`}
              >
                {s.label}
              </text>

              {/* Area Transparan Penangkap Hover */}
              <rect
                x={x - (plotW / series.length) / 2}
                y={padTop}
                width={plotW / series.length}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => onHover(i)}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip Dinamis Melayang */}
      {hoveredIndex !== null && series[hoveredIndex] && (
        <div
          className="absolute z-10 p-8 rounded-lg bg-surface-raised border border-border shadow-pop text-xs space-y-4 pointer-events-none transition-all transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(getX(hoveredIndex) / width) * 100}%`,
            top: `${(getY(series[hoveredIndex].val1) / height) * 100}%`,
          }}
        >
          <div className="font-bold text-text border-b border-border pb-[2px]">
            {series[hoveredIndex].label}
          </div>
          <div className="space-y-[2px]">
            <div className="flex items-center justify-between gap-12">
              <span className="text-text-muted flex items-center gap-4">
                <span className="w-8 h-8 rounded-full" style={{ backgroundColor: line1Color }} />
                {label1}:
              </span>
              <span className="font-bold text-text">{formatRp(series[hoveredIndex].val1)}</span>
            </div>
            <div className="flex items-center justify-between gap-12">
              <span className="text-text-muted flex items-center gap-4">
                <span className="w-8 h-8 rounded-full" style={{ backgroundColor: line2Color }} />
                {label2}:
              </span>
              <span className="font-bold text-text">{formatRp(series[hoveredIndex].val2)}</span>
            </div>
            <div className="flex items-center justify-between gap-12">
              <span className="text-text-muted flex items-center gap-4">
                <span className="w-8 h-8 rounded-full" style={{ backgroundColor: line3Color }} />
                {label3}:
              </span>
              <span className="font-bold text-text">{formatRp(series[hoveredIndex].val3)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

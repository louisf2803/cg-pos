'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatRp, type StatementRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const money = (n: number) => (n < 0 ? `(${formatRp(-n)})` : formatRp(n));

export default function FinanceDashboardPage() {
  const data = useData();
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });

  const state = useAsync(async () => {
    try {
      const [income, accounts, trial, cashFlow, payables, balance] = await Promise.all([
        data.incomeStatement(span),
        data.listAccounts(),
        data.trialBalance(span),
        data.cashFlow(span),
        data.payablesAging(span.to),
        data.balanceSheet(span.to),
      ]);
      return { income, accounts, trial, cashFlow, payables, balance };
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (
        e.code === 'forbidden' ||
        e.message?.toLowerCase().includes('izin') ||
        e.message?.toLowerCase().includes('forbidden') ||
        e.message?.toLowerCase().includes('pemilik')
      ) {
        throw new Error('Hanya pemilik dan admin yang dapat melihat');
      }
      throw err;
    }
  }, [data, span.from, span.to]);

  const payload = state.status === 'ready' ? state.data : null;

  // 1. Laba bersih & Laba kotor
  const netProfit = useMemo(() => {
    if (!payload) return 0;
    const row = payload.income.find((r) => r.section === 'net_profit');
    return row ? row.amount : 0;
  }, [payload]);

  const grossProfit = useMemo(() => {
    if (!payload) return 0;
    const row = payload.income.find((r) => r.section === 'gross_profit');
    return row ? row.amount : 0;
  }, [payload]);

  // 2. Saldo kas dan bank
  const cashBankAccounts = useMemo(() => {
    if (!payload) return [];
    return payload.accounts.filter(
      (a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive
    );
  }, [payload]);

  const cashBankBalance = useMemo(() => {
    if (!payload || cashBankAccounts.length === 0) return 0;
    const ids = new Set(cashBankAccounts.map((a) => a.id));
    return payload.trial
      .filter((r) => ids.has(r.accountId))
      .reduce((acc, r) => acc + r.closing, 0);
  }, [payload, cashBankAccounts]);

  // 3. Arus kas masuk dan keluar
  const cashFlow = payload?.cashFlow;

  // 4. Hutang usaha
  const totalPayables = useMemo(() => {
    if (!payload) return 0;
    return payload.payables.reduce((acc, r) => acc + r.outstanding, 0);
  }, [payload]);

  const overduePayables = useMemo(() => {
    if (!payload) return 0;
    return payload.payables
      .filter((r) => r.daysOverdue > 0)
      .reduce((acc, r) => acc + r.outstanding, 0);
  }, [payload]);

  // 5. Biaya terbesar (section === 'expense')
  const topExpenses = useMemo(() => {
    if (!payload) return [];
    const expenses = payload.income
      .filter((r) => r.section === 'expense' && r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return expenses.slice(0, 5);
  }, [payload]);

  const totalExpenseAmount = useMemo(() => {
    if (!payload) return 0;
    return payload.income
      .filter((r) => r.section === 'expense')
      .reduce((acc, r) => acc + r.amount, 0);
  }, [payload]);

  const maxExpenseAmount = useMemo(() => {
    if (topExpenses.length === 0) return 1;
    return Math.max(1, ...topExpenses.map((e) => e.amount));
  }, [topExpenses]);

  // 6. Neraca balance check
  const balanceSheet = payload?.balance;
  const isBalanced = balanceSheet?.totals?.balanced ?? true;

  const isForbiddenError =
    state.status === 'error' &&
    (state.message.includes('Hanya pemilik dan admin yang dapat melihat') ||
      state.message.toLowerCase().includes('izin') ||
      state.message.toLowerCase().includes('forbidden'));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Dashboard keuangan"
        subtitle="Ringkasan posisi keuangan, laba rugi, arus kas, dan hutang usaha secara otomatis dari catatan jurnal."
        actions={
          <div className="flex gap-8">
            <Link href="/keuangan/laporan" className="cg-btn cg-btn--secondary">
              Laporan lengkap
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-12 mb-24 items-end">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="dk" />
      </div>

      {isForbiddenError && (
        <div className="cg-banner cg-banner--warning mb-16" role="alert">
          <p>
            <strong>Akses Terbatas</strong>
          </p>
          <p>Hanya pemilik dan admin yang dapat melihat dashboard keuangan ini.</p>
        </div>
      )}

      {state.status === 'error' && !isForbiddenError && (
        <div className="mb-16">
          <ErrorBox message={state.message} onRetry={state.reload} />
        </div>
      )}

      {state.status === 'loading' && (
        <div className="grid gap-16" aria-busy="true" aria-label="Memuat data keuangan">
          <div className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 130 }} />
            ))}
          </div>
          <div className="cg-skeleton" style={{ height: 260 }} />
        </div>
      )}

      {state.status === 'ready' && payload && (
        <>
          {/* Peringatan Neraca tidak seimbang */}
          {!isBalanced && balanceSheet?.totals && (
            <div className="cg-banner cg-banner--danger mb-16" role="alert">
              <p>
                <strong>Peringatan: Neraca tidak seimbang!</strong>
              </p>
              <p className="text-sm mt-2">
                Total Aset ({formatRp(balanceSheet.totals.assets)}) tidak sama dengan Kewajiban +
                Ekuitas ({formatRp(balanceSheet.totals.liabilities + balanceSheet.totals.equity)}).
                Silakan periksa jurnal manual atau transaksi terbaru.
              </p>
            </div>
          )}

          {/* Kartu Ringkasan Keuangan (KPI Cards) */}
          <div className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4 mb-24">
            {/* 1. Laba Bersih */}
            <div className="border border-border rounded-lg bg-surface-raised p-16 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-sm text-text-muted">Laba Bersih</span>
                  {netProfit >= 0 ? (
                    <TrendingUp className="cg-icon text-success" aria-hidden />
                  ) : (
                    <TrendingDown className="cg-icon text-danger" aria-hidden />
                  )}
                </div>
                <div
                  className={`text-2xl font-bold cg-num mb-4 ${
                    netProfit >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {money(netProfit)}
                </div>
                <p className="text-xs text-text-muted">
                  Laba kotor: <span className="cg-num">{money(grossProfit)}</span>
                </p>
              </div>
              <div className="mt-12 pt-8 border-t border-border">
                <Link
                  href="/keuangan/laporan?tab=laba-rugi"
                  className="text-xs font-semibold text-accent flex items-center gap-4 hover:underline"
                >
                  Lihat Laba Rugi <ArrowRight className="w-12 h-12" aria-hidden />
                </Link>
              </div>
            </div>

            {/* 2. Saldo Kas & Bank */}
            <div className="border border-border rounded-lg bg-surface-raised p-16 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-sm text-text-muted">Saldo Kas & Bank</span>
                  <Wallet className="cg-icon text-accent" aria-hidden />
                </div>
                <div className="text-2xl font-bold cg-num mb-4">{money(cashBankBalance)}</div>
                <p className="text-xs text-text-muted">
                  {cashBankAccounts.length} akun kas & bank aktif
                </p>
              </div>
              <div className="mt-12 pt-8 border-t border-border">
                <Link
                  href="/keuangan/kas"
                  className="text-xs font-semibold text-accent flex items-center gap-4 hover:underline"
                >
                  Buku Kas & Bank <ArrowRight className="w-12 h-12" aria-hidden />
                </Link>
              </div>
            </div>

            {/* 3. Arus Kas Masuk & Keluar */}
            <div className="border border-border rounded-lg bg-surface-raised p-16 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-sm text-text-muted">Arus Kas</span>
                  <DollarSign className="cg-icon text-accent" aria-hidden />
                </div>
                <div className="text-sm mb-2 flex items-center justify-between">
                  <span className="text-text-muted flex items-center gap-4">
                    <ArrowDownToLine className="w-12 h-12 text-success" aria-hidden /> Masuk
                  </span>
                  <span className="cg-num font-semibold text-success">
                    {cashFlow ? formatRp(cashFlow.inflow) : formatRp(0)}
                  </span>
                </div>
                <div className="text-sm mb-4 flex items-center justify-between">
                  <span className="text-text-muted flex items-center gap-4">
                    <ArrowUpFromLine className="w-12 h-12 text-danger" aria-hidden /> Keluar
                  </span>
                  <span className="cg-num font-semibold text-danger">
                    {cashFlow ? formatRp(cashFlow.outflow) : formatRp(0)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  Bersih:{' '}
                  <span className="cg-num font-semibold">
                    {cashFlow ? money(cashFlow.net) : formatRp(0)}
                  </span>
                </p>
              </div>
              <div className="mt-12 pt-8 border-t border-border">
                <Link
                  href="/keuangan/laporan?tab=arus-kas"
                  className="text-xs font-semibold text-accent flex items-center gap-4 hover:underline"
                >
                  Lihat Arus Kas <ArrowRight className="w-12 h-12" aria-hidden />
                </Link>
              </div>
            </div>

            {/* 4. Total Hutang Usaha */}
            <div className="border border-border rounded-lg bg-surface-raised p-16 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-sm text-text-muted">Hutang Usaha</span>
                  <Building2 className="cg-icon text-accent" aria-hidden />
                </div>
                <div className="text-2xl font-bold cg-num mb-4">{formatRp(totalPayables)}</div>
                <div className="text-xs">
                  {overduePayables > 0 ? (
                    <span className="text-danger font-medium">
                      Jatuh tempo: <span className="cg-num">{formatRp(overduePayables)}</span>
                    </span>
                  ) : (
                    <span className="text-success font-medium">Tidak ada hutang lewat tempo</span>
                  )}
                </div>
              </div>
              <div className="mt-12 pt-8 border-t border-border">
                <Link
                  href="/keuangan/laporan?tab=hutang"
                  className="text-xs font-semibold text-accent flex items-center gap-4 hover:underline"
                >
                  Lihat Umur Hutang <ArrowRight className="w-12 h-12" aria-hidden />
                </Link>
              </div>
            </div>
          </div>

          {/* Tabel 5 Biaya Terbesar */}
          <section className="border border-border rounded-lg bg-surface-raised p-16 mb-24 min-w-0">
            <div className="flex items-center justify-between mb-12">
              <div>
                <h2 className="text-lg font-semibold">5 Biaya Operasional Terbesar</h2>
                <p className="text-xs text-text-muted mt-2">
                  Total beban operasional pada rentang ini:{' '}
                  <strong className="cg-num text-text">{formatRp(totalExpenseAmount)}</strong>
                </p>
              </div>
              <Link
                href="/keuangan/laporan?tab=laba-rugi"
                className="text-sm font-medium text-accent hover:underline hidden tablet:inline-block"
              >
                Rincian beban →
              </Link>
            </div>

            {topExpenses.length === 0 ? (
              <div className="cg-empty">
                <p>
                  <strong>Belum ada beban atau pengeluaran tercatat pada rentang ini.</strong>
                </p>
                <p className="text-text-muted">
                  Biaya akan bertambah saat mencatat kas keluar, pembelian bahan, atau jurnal beban.
                </p>
              </div>
            ) : (
              <div className="cg-data-wrap">
                <table className="cg-data" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Kode</th>
                      <th>Nama Akun Beban</th>
                      <th className="cg-num">Jumlah</th>
                      <th className="cg-num">Porsi</th>
                      <th style={{ minWidth: 140 }}>Proporsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topExpenses.map((exp) => {
                      const pct =
                        totalExpenseAmount > 0
                          ? ((exp.amount / totalExpenseAmount) * 100).toFixed(1)
                          : '0.0';
                      const barWidth = Math.round((exp.amount / maxExpenseAmount) * 100);

                      return (
                        <tr key={exp.code}>
                          <td className="cg-num text-text-muted font-medium">{exp.code}</td>
                          <td className="font-semibold break-words">{exp.name}</td>
                          <td className="cg-num font-semibold text-danger">
                            {formatRp(exp.amount)}
                          </td>
                          <td className="cg-num text-text-muted">{pct}%</td>
                          <td>
                            <div className="flex items-center gap-8">
                              <span
                                className="block h-[12px] w-full rounded-pill bg-accent-soft"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-pill bg-accent"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </span>
                              <span className="text-xs text-text-muted w-[36px] text-right cg-num">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pintasan Menu Keuangan Lainnya */}
          <section className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
            <h2 className="text-base font-semibold mb-12">Pintasan Keuangan</h2>
            <div className="grid gap-12 tablet:grid-cols-3">
              <Link
                href="/keuangan/kas"
                className="p-12 border border-border rounded-lg bg-surface hover:border-accent transition-colors block"
              >
                <div className="font-semibold text-sm">Buku Kas & Bank</div>
                <div className="text-xs text-text-muted mt-2">
                  Catat uang masuk, uang keluar, dan mutasi saldo kas.
                </div>
              </Link>
              <Link
                href="/keuangan/jurnal"
                className="p-12 border border-border rounded-lg bg-surface hover:border-accent transition-colors block"
              >
                <div className="font-semibold text-sm">Jurnal Umum</div>
                <div className="text-xs text-text-muted mt-2">
                  Lihat seluruh ayat jurnal dan buat jurnal manual seimbang.
                </div>
              </Link>
              <Link
                href="/keuangan/akun"
                className="p-12 border border-border rounded-lg bg-surface hover:border-accent transition-colors block"
              >
                <div className="font-semibold text-sm">Daftar Akun (COA)</div>
                <div className="text-xs text-text-muted mt-2">
                  Kelola struktur akun buku besar dan kategori akuntansi.
                </div>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

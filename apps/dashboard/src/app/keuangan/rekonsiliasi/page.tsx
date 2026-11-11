'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  buildNonCashReconciliation,
  buildReconcileCsv,
  formatRp,
  toCsv,
  type NonCashReconcileRow,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { fmtDate } from '@/components/fin-common';

export default function NonCashReconciliationPage() {
  const data = useData();
  const { value, setValue, range, today } = useReport();

  // Pengelompokan: 'method' (ringkasan per metode) atau 'date_method' (per hari & metode)
  const [groupBy, setGroupBy] = useState<'method' | 'date_method'>('method');

  // Input manual penerimaan bank/penyedia disimpan di state lokal halaman
  const [actualMap, setActualMap] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string>('');

  // Ambil daftar metode pembayaran
  const methodsAsync = useAsync(async () => {
    return data.listPaymentMethods();
  }, [data]);

  // Ambil pesanan dalam rentang tanggal
  const ordersAsync = useAsync(async () => {
    return data.listOrders({
      status: 'paid',
      from: range.from,
      to: range.to,
      all: true,
    });
  }, [data, range.from, range.to]);

  const reconciliation = useMemo(() => {
    if (ordersAsync.status !== 'ready' || !ordersAsync.data) {
      return null;
    }

    return buildNonCashReconciliation({
      orders: ordersAsync.data,
      paymentMethods: methodsAsync.status === 'ready' ? methodsAsync.data : [],
      actualAmounts: actualMap,
      groupBy,
    });
  }, [ordersAsync, methodsAsync, actualMap, groupBy]);

  const filledRows = useMemo(() => {
    if (!reconciliation) return [];
    return reconciliation.rows.filter(
      (r) => r.actualAmount !== undefined && r.actualAmount !== null
    );
  }, [reconciliation]);

  const filledCount = filledRows.length;
  const totalFilledActual = useMemo(
    () => filledRows.reduce((sum, r) => sum + (r.actualAmount ?? 0), 0),
    [filledRows]
  );
  const filledDiff = useMemo(
    () => filledRows.reduce((sum, r) => sum + (r.diff ?? 0), 0),
    [filledRows]
  );
  const allFilledMatched =
    filledCount > 0 && filledRows.every((r) => r.status === 'matched');

  const handleActualChange = (id: string, rawVal: string) => {
    const clean = rawVal.replace(/[^\d]/g, '');
    setActualMap((prev) => {
      const next = { ...prev };
      if (clean === '') {
        delete next[id];
      } else {
        next[id] = Number(clean);
      }
      return next;
    });
  };

  const handleMatchAllWithSystem = () => {
    if (!reconciliation) return;
    const next: Record<string, number> = { ...actualMap };
    for (const row of reconciliation.rows) {
      next[row.id] = row.systemAmount;
    }
    setActualMap(next);
    setNotice('Semua nominal diterima di bank disamakan dengan catatan sistem.');
  };

  const handleClearActuals = () => {
    setActualMap({});
    setNotice('Semua input penerimaan bank dikosongkan.');
  };

  const handleDownloadCsv = () => {
    if (!reconciliation || reconciliation.rows.length === 0) return;
    const csvRows = buildReconcileCsv(reconciliation.rows, groupBy === 'date_method');
    const csvString = toCsv(csvRows);
    downloadCsvWithHistory({
      fileName: `rekonsiliasi-non-tunai-${range.from}-${range.to}.csv`,
      csvContent: csvString,
      reportName: 'Rekonsiliasi Non-Tunai',
      period: range.label,
      rowCount: reconciliation.rows.length,
      sourceUrl: '/keuangan/rekonsiliasi',
    });
  };

  const isLoading =
    ordersAsync.status === 'loading' || methodsAsync.status === 'loading';
  const hasError =
    ordersAsync.status === 'error' || methodsAsync.status === 'error';
  const errorMessage =
    ordersAsync.status === 'error'
      ? ordersAsync.message
      : methodsAsync.status === 'error'
      ? methodsAsync.message
      : '';

  const handleRetry = () => {
    ordersAsync.reload();
    methodsAsync.reload();
  };

  return (
    <>
      <PageHeader
        title="Rekonsiliasi non-tunai"
        subtitle="Cocokkan penerimaan non-tunai (QRIS, kartu debit/kredit, transfer) antara catatan sistem POS dan mutasi rekening bank atau penyedia pembayaran."
        actions={
          <div className="flex flex-wrap gap-8 items-center">
            <button
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadCsv}
              disabled={!reconciliation || reconciliation.rows.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
            <button
              className="cg-btn cg-btn--secondary"
              onClick={handleMatchAllWithSystem}
              disabled={!reconciliation || reconciliation.rows.length === 0}
            >
              <Check className="cg-icon" aria-hidden /> Samakan dgn sistem
            </button>
          </div>
        }
      />

      {/* Catatan Penyimpanan Sesi */}
      <div
        role="note"
        className="cg-banner cg-banner--info mb-16 flex items-center gap-8 text-sm"
      >
        <Info className="w-16 h-16 flex-shrink-0" aria-hidden />
        <span>
          Nominal penerimaan bank tersimpan sementara di sesi peramban perangkat ini.
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className="cg-banner cg-banner--success mb-16 flex justify-between items-center"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="text-xs underline hover:opacity-75"
            onClick={() => setNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12 mb-16 min-w-0">
        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Dicatat Sistem POS
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-accent-strong cg-num">
              {formatRp(reconciliation?.totalSystemAmount ?? 0)}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {reconciliation?.totalTransactions ?? 0} transaksi non-tunai
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Diterima di Bank / Penyedia
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-text cg-num">
              {filledCount > 0 ? formatRp(totalFilledActual) : '—'}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {filledCount > 0 ? `${filledCount} metode telah diisi` : 'Belum ada input aktual'}
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Total Selisih
            </span>
            <strong
              className={`text-xl tablet:text-2xl font-bold block truncate text-left cg-num ${
                filledCount === 0
                  ? 'text-text'
                  : filledDiff === 0
                  ? 'text-accent-strong'
                  : filledDiff > 0
                  ? 'text-accent-strong'
                  : 'text-danger'
              }`}
            >
              {filledCount === 0
                ? '—'
                : `${filledDiff > 0 ? '+' : ''}${formatRp(filledDiff)}`}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {filledCount === 0
              ? 'Belum ada nominal bank diisi'
              : filledDiff === 0
              ? 'Saldo seimbang'
              : filledDiff > 0
              ? 'Penerimaan bank lebih besar'
              : 'Penerimaan bank kurang'}
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Status Rekonsiliasi
            </span>
            <div className="flex items-center gap-[6px] my-[2px]">
              {filledCount === 0 ? (
                <span className="cg-badge text-text-muted text-xs font-semibold">
                  Belum diisi
                </span>
              ) : allFilledMatched ? (
                <span className="cg-badge cg-badge--success flex items-center gap-4 text-xs font-semibold">
                  <CheckCircle2 className="w-[14px] h-[14px]" aria-hidden /> Sudah cocok semua
                </span>
              ) : (
                <span className="cg-badge cg-badge--danger flex items-center gap-4 text-xs font-semibold">
                  <AlertCircle className="w-[14px] h-[14px]" aria-hidden /> Ada selisih
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {reconciliation?.matchedCount ?? 0} cocok · {reconciliation?.mismatchCount ?? 0} selisih
          </span>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col tablet:flex-row gap-12 mb-16 justify-between items-stretch tablet:items-center">
        {/* Toggle Grouping */}
        <div className="flex items-center gap-[6px] bg-[var(--color-surface-raised)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <button
            type="button"
            className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
              groupBy === 'method'
                ? 'bg-[var(--color-surface)] text-[var(--color-accent)] font-bold shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
            onClick={() => setGroupBy('method')}
          >
            Per Metode Bayar
          </button>
          <button
            type="button"
            className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
              groupBy === 'date_method'
                ? 'bg-[var(--color-surface)] text-[var(--color-accent)] font-bold shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
            onClick={() => setGroupBy('date_method')}
          >
            Per Hari & Metode
          </button>
        </div>

        {/* Date Filter & Clear */}
        <div className="flex flex-wrap gap-8 items-center justify-end">
          {Object.keys(actualMap).length > 0 && (
            <button
              type="button"
              className="cg-btn cg-btn--ghost text-xs text-danger"
              onClick={handleClearActuals}
            >
              Reset isian
            </button>
          )}
          <RangePicker value={value} onChange={setValue} today={today} />
        </div>
      </div>

      {/* Main Content Area */}
      {hasError ? (
        <ErrorBox
          message={errorMessage || 'Gagal memuat data rekonsiliasi.'}
          onRetry={handleRetry}
        />
      ) : isLoading ? (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat rekonsiliasi">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 48 }} />
          ))}
        </div>
      ) : !reconciliation || reconciliation.rows.length === 0 ? (
        <div className="cg-empty">
          <SlidersHorizontal className="w-12 h-12 text-text-muted mb-8" aria-hidden />
          <p>
            <strong>Tidak ada transaksi non-tunai pada rentang tanggal ini.</strong>
          </p>
          <p className="text-text-muted text-sm mt-4">
            Transaksi yang dibayar menggunakan QRIS, kartu debit/kredit, atau transfer akan otomatis muncul di sini.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden tablet:block cg-data-wrap min-w-0">
            <table
              className="cg-data min-w-0"
              aria-label="Tabel rekonsiliasi non-tunai"
            >
              <thead>
                <tr>
                  {groupBy === 'date_method' && <th>Tanggal</th>}
                  <th>Metode Pembayaran</th>
                  <th>Kategori</th>
                  <th className="text-right">Transaksi</th>
                  <th className="text-right">Dicatat Sistem</th>
                  <th className="text-right min-w-[180px]">Diterima di Bank / EDC</th>
                  <th className="text-right">Selisih</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.rows.map((row) => (
                  <tr key={row.id}>
                    {groupBy === 'date_method' && (
                      <td className="whitespace-nowrap text-sm font-medium">
                        {row.date ? fmtDate(row.date) : '—'}
                      </td>
                    )}
                    <td className="font-semibold text-sm">
                      {row.methodName}
                    </td>
                    <td className="text-xs text-text-muted">
                      <span className="cg-badge">
                        {row.methodKind === 'gateway'
                          ? 'QRIS / Gateway'
                          : row.methodKind === 'noncash'
                          ? 'Kartu / EDC / Transfer'
                          : row.methodKind}
                      </span>
                    </td>
                    <td className="text-right cg-num text-sm">
                      {row.transactionCount}
                    </td>
                    <td className="text-right cg-num font-bold text-sm">
                      {formatRp(row.systemAmount)}
                    </td>
                    <td className="text-right py-8 px-12">
                      <div className="flex items-center h-[44px] w-[180px] ml-auto border border-border rounded-lg bg-surface-raised focus-within:border-accent focus-within:ring-1 focus-within:ring-accent overflow-hidden transition-colors">
                        <span className="pl-[10px] pr-4 text-xs font-semibold text-text-muted select-none shrink-0">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full h-full bg-transparent pr-[10px] text-right cg-num text-sm text-text font-semibold focus:outline-hidden"
                          placeholder="0"
                          value={
                            row.actualAmount !== undefined
                              ? new Intl.NumberFormat('id-ID').format(row.actualAmount)
                              : ''
                          }
                          onChange={(e) => handleActualChange(row.id, e.target.value)}
                          aria-label={`Input penerimaan aktual bank untuk ${row.methodName}`}
                        />
                      </div>
                    </td>
                    <td
                      className={`text-right cg-num font-semibold text-sm ${
                        row.diff === undefined
                          ? 'text-text-muted'
                          : row.diff === 0
                          ? 'text-[var(--color-accent)]'
                          : row.diff > 0
                          ? 'text-accent'
                          : 'text-danger'
                      }`}
                    >
                      {row.diff !== undefined
                        ? `${row.diff > 0 ? '+' : ''}${formatRp(row.diff)}`
                        : '—'}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {row.status === 'matched' ? (
                        <span className="cg-badge cg-badge--success inline-flex items-center gap-4">
                          <CheckCircle2 className="w-3 h-3" aria-hidden /> Sudah cocok
                        </span>
                      ) : row.status === 'mismatch' ? (
                        <span className="cg-badge cg-badge--danger inline-flex items-center gap-4">
                          <AlertCircle className="w-3 h-3" aria-hidden /> Selisih
                        </span>
                      ) : (
                        <span className="cg-badge text-text-muted">
                          Belum diisi
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="grid gap-12 tablet:hidden min-w-0" aria-label="Daftar rekonsiliasi mobile">
            {reconciliation.rows.map((row) => (
              <div key={row.id} className="cg-card p-12 min-w-0">
                <div className="flex justify-between items-start gap-8 mb-8">
                  <div>
                    {groupBy === 'date_method' && row.date && (
                      <span className="text-xs text-text-muted block mb-[2px]">
                        {fmtDate(row.date)}
                      </span>
                    )}
                    <strong className="text-sm font-bold block">
                      {row.methodName}
                    </strong>
                    <span className="text-xs text-text-muted">
                      {row.transactionCount} transaksi
                    </span>
                  </div>

                  <div>
                    {row.status === 'matched' ? (
                      <span className="cg-badge cg-badge--success text-xs">
                        Sudah cocok
                      </span>
                    ) : row.status === 'mismatch' ? (
                      <span className="cg-badge cg-badge--danger text-xs">
                        Selisih
                      </span>
                    ) : (
                      <span className="cg-badge text-xs text-text-muted">
                        Belum diisi
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 text-xs mb-8 pt-8 border-t border-[var(--color-border)]">
                  <div>
                    <span className="text-text-muted block">Dicatat Sistem:</span>
                    <strong className="cg-num text-sm text-[var(--color-accent)] font-bold">
                      {formatRp(row.systemAmount)}
                    </strong>
                  </div>

                  <div>
                    <span className="text-text-muted block">Selisih:</span>
                    <strong
                      className={`cg-num text-sm font-bold ${
                        row.diff === undefined
                          ? 'text-text-muted'
                          : row.diff === 0
                          ? 'text-[var(--color-accent)]'
                          : row.diff > 0
                          ? 'text-accent'
                          : 'text-danger'
                      }`}
                    >
                      {row.diff !== undefined
                        ? `${row.diff > 0 ? '+' : ''}${formatRp(row.diff)}`
                        : '—'}
                    </strong>
                  </div>
                </div>

                <div className="pt-8 border-t border-border">
                  <label
                    htmlFor={`mob-input-${row.id}`}
                    className="text-xs text-text-muted block mb-4"
                  >
                    Diterima di Bank / EDC:
                  </label>
                  <div className="flex items-center h-[44px] w-full border border-border rounded-lg bg-surface-raised focus-within:border-accent focus-within:ring-1 focus-within:ring-accent overflow-hidden transition-colors">
                    <span className="pl-12 pr-4 text-xs font-semibold text-text-muted select-none shrink-0">
                      Rp
                    </span>
                    <input
                      id={`mob-input-${row.id}`}
                      type="text"
                      inputMode="numeric"
                      className="w-full h-full bg-transparent pr-12 text-right cg-num text-sm text-text font-semibold focus:outline-hidden"
                      placeholder="0"
                      value={
                        row.actualAmount !== undefined
                          ? new Intl.NumberFormat('id-ID').format(row.actualAmount)
                          : ''
                      }
                      onChange={(e) => handleActualChange(row.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

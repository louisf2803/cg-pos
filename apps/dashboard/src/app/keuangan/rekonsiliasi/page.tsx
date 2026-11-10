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
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekonsiliasi-non-tunai-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      {/* Catatan Penyimpanan Permanen */}
      <div
        role="note"
        className="cg-banner cg-banner--info mb-16 flex items-start gap-8"
      >
        <Info className="w-5 h-5 flex-shrink-0 mt-2" aria-hidden />
        <div className="text-sm">
          <strong>Penyimpanan Sesi Lokal:</strong> Angka penerimaan bank yang Anda
          masukkan saat ini disimpan di memori peramban perangkat ini. Fitur
          penyimpanan permanen berkas rekonsiliasi ke server menyusul.
        </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16 min-w-0">
        <div className="cg-card p-16">
          <p className="text-xs text-text-muted mb-4 uppercase tracking-wider">
            Dicatat Sistem POS
          </p>
          <p className="text-xl font-bold cg-num text-[var(--color-accent)]">
            {formatRp(reconciliation?.totalSystemAmount ?? 0)}
          </p>
          <p className="text-xs text-text-muted mt-4">
            {reconciliation?.totalTransactions ?? 0} transaksi non-tunai
          </p>
        </div>

        <div className="cg-card p-16">
          <p className="text-xs text-text-muted mb-4 uppercase tracking-wider">
            Diterima di Bank / Penyedia
          </p>
          <p className="text-xl font-bold cg-num">
            {formatRp(reconciliation?.totalActualAmount ?? 0)}
          </p>
          <p className="text-xs text-text-muted mt-4">Total input aktual</p>
        </div>

        <div className="cg-card p-16">
          <p className="text-xs text-text-muted mb-4 uppercase tracking-wider">
            Total Selisih
          </p>
          <p
            className={`text-xl font-bold cg-num ${
              (reconciliation?.totalDiff ?? 0) === 0
                ? 'text-[var(--color-accent)]'
                : (reconciliation?.totalDiff ?? 0) > 0
                ? 'text-accent'
                : 'text-danger'
            }`}
          >
            {(reconciliation?.totalDiff ?? 0) > 0 ? '+' : ''}
            {formatRp(reconciliation?.totalDiff ?? 0)}
          </p>
          <p className="text-xs text-text-muted mt-4">
            {(reconciliation?.totalDiff ?? 0) === 0
              ? 'Saldo seimbang'
              : (reconciliation?.totalDiff ?? 0) > 0
              ? 'Penerimaan bank lebih besar'
              : 'Penerimaan bank kurang'}
          </p>
        </div>

        <div className="cg-card p-16">
          <p className="text-xs text-text-muted mb-4 uppercase tracking-wider">
            Status Rekonsiliasi
          </p>
          <div className="flex items-center gap-6 mt-4">
            {reconciliation?.allMatched ? (
              <span className="cg-badge cg-badge--success flex items-center gap-4 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Sudah cocok semua
              </span>
            ) : reconciliation?.mismatchCount ? (
              <span className="cg-badge cg-badge--danger flex items-center gap-4 text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {reconciliation.mismatchCount} ada selisih
              </span>
            ) : (
              <span className="cg-badge cg-badge--info flex items-center gap-4 text-xs font-semibold">
                {reconciliation?.unenteredCount ?? 0} belum diisi
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-8">
            {reconciliation?.matchedCount ?? 0} cocok · {reconciliation?.mismatchCount ?? 0} selisih
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col sm:flex-row gap-12 mb-16 justify-between items-stretch sm:items-center">
        {/* Toggle Grouping */}
        <div className="flex items-center gap-6 bg-[var(--color-surface-raised)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <button
            type="button"
            className={`px-12 py-6 text-xs font-medium rounded transition-colors ${
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
            className={`px-12 py-6 text-xs font-medium rounded transition-colors ${
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
          <div className="hidden md:block cg-data-wrap min-w-0">
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
                    <td className="text-right">
                      <div className="inline-flex items-center justify-end">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="cg-input cg-num text-right py-4 px-8 w-36 text-sm"
                          placeholder="Ketik nominal…"
                          value={
                            row.actualAmount !== undefined
                              ? row.actualAmount.toString()
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
          <div className="grid gap-12 md:hidden min-w-0" aria-label="Daftar rekonsiliasi mobile">
            {reconciliation.rows.map((row) => (
              <div key={row.id} className="cg-card p-12 min-w-0">
                <div className="flex justify-between items-start gap-8 mb-8">
                  <div>
                    {groupBy === 'date_method' && row.date && (
                      <span className="text-xs text-text-muted block mb-2">
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

                <div className="pt-8 border-t border-[var(--color-border)]">
                  <label
                    htmlFor={`mob-input-${row.id}`}
                    className="text-xs text-text-muted block mb-4"
                  >
                    Diterima di Bank / EDC (Rp):
                  </label>
                  <input
                    id={`mob-input-${row.id}`}
                    type="text"
                    inputMode="numeric"
                    className="cg-input cg-num text-right py-6 px-10 w-full text-sm"
                    placeholder="Masukkan nominal diterima…"
                    value={
                      row.actualAmount !== undefined
                        ? row.actualAmount.toString()
                        : ''
                    }
                    onChange={(e) => handleActualChange(row.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

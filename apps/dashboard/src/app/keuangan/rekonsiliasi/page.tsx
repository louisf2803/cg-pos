'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Info,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  buildNonCashReconciliation,
  buildReconcileCsv,
  formatRp,
  toCsv,
  type NonCashReconcileRow,
  type SaveReconciliationInput,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { fmtDate } from '@/components/fin-common';
import { ReconcileModal } from '@/components/reconcile-modal';
import { OutletReconcileCard } from '@/components/outlet-reconcile-card';

export default function NonCashReconciliationPage() {
  const data = useData();
  const { value, setValue, range, today } = useReport();

  // Pengelompokan: 'method', 'shift_method', atau 'date_method'
  const [groupBy, setGroupBy] = useState<'method' | 'shift_method' | 'date_method'>('shift_method');
  // Filter status: 'all', 'unreconciled', atau 'reconciled'
  const [statusFilter, setStatusFilter] = useState<'all' | 'unreconciled' | 'reconciled'>('all');
  // Tampilkan pengaturan outlet
  const [showSettings, setShowSettings] = useState(false);
  // Baris yang sedang diedit di modal
  const [editingRow, setEditingRow] = useState<NonCashReconcileRow | null>(null);
  const [notice, setNotice] = useState<string>('');

  // Ambil daftar metode pembayaran
  const methodsAsync = useAsync(async () => {
    return data.listPaymentMethods();
  }, [data]);

  // Ambil shift dalam rentang tanggal
  const shiftsAsync = useAsync(async () => {
    return data.listShiftReports(range);
  }, [data, range.from, range.to]);

  // Ambil pesanan dalam rentang tanggal
  const ordersAsync = useAsync(async () => {
    return data.listOrders({
      status: 'paid',
      from: range.from,
      to: range.to,
      all: true,
    });
  }, [data, range.from, range.to]);

  // Ambil data rekonsiliasi yang tersimpan di server
  const reconsAsync = useAsync(async () => {
    return data.listNonCashReconciliations({
      from: range.from,
      to: range.to,
    });
  }, [data, range.from, range.to]);

  // Ambil pengaturan outlet
  const outletAsync = useAsync(async () => {
    return data.getOutletSettings();
  }, [data]);

  // Peta data rekonsiliasi tersimpan
  const savedMap = useMemo(() => {
    const map: Record<string, { isReconciled: boolean; actualAmount?: number; feeAmount?: number; reconciledAt?: string }> = {};
    if (reconsAsync.status === 'ready' && reconsAsync.data) {
      for (const r of reconsAsync.data) {
        const key = r.shiftId ? `${r.shiftId}_${r.methodId}` : r.methodId;
        map[key] = {
          isReconciled: r.status === 'reconciled',
          actualAmount: r.actualAmount,
          feeAmount: r.feeAmount,
          reconciledAt: r.reconciledAt,
        };
      }
    }
    return map;
  }, [reconsAsync]);

  const rawReconciliation = useMemo(() => {
    if (ordersAsync.status !== 'ready' || !ordersAsync.data) {
      return null;
    }

    const shifts = (shiftsAsync.status === 'ready' && shiftsAsync.data)
      ? shiftsAsync.data.map((r) => r.shift)
      : [];

    return buildNonCashReconciliation({
      orders: ordersAsync.data,
      paymentMethods: methodsAsync.status === 'ready' ? methodsAsync.data : [],
      shifts,
      groupBy,
      savedReconciliations: savedMap,
    });
  }, [ordersAsync, methodsAsync, shiftsAsync, groupBy, savedMap]);

  // Filter baris berdasarkan status rekonsiliasi
  const reconciliation = useMemo(() => {
    if (!rawReconciliation) return null;
    let filteredRows = rawReconciliation.rows;
    if (statusFilter === 'reconciled') {
      filteredRows = filteredRows.filter((r) => r.isReconciled);
    } else if (statusFilter === 'unreconciled') {
      filteredRows = filteredRows.filter((r) => !r.isReconciled);
    }
    return {
      ...rawReconciliation,
      rows: filteredRows,
    };
  }, [rawReconciliation, statusFilter]);

  const handleSaveModal = async (input: SaveReconciliationInput) => {
    await data.saveNonCashReconciliation(input);
    setNotice(`Rekonsiliasi ${editingRow?.methodName ?? ''} berhasil disimpan ke buku besar.`);
    reconsAsync.reload();
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
    ordersAsync.status === 'loading' ||
    methodsAsync.status === 'loading' ||
    shiftsAsync.status === 'loading';
  const hasError =
    ordersAsync.status === 'error' ||
    methodsAsync.status === 'error' ||
    shiftsAsync.status === 'error';
  const errorMessage =
    ordersAsync.status === 'error'
      ? ordersAsync.message
      : methodsAsync.status === 'error'
      ? methodsAsync.message
      : shiftsAsync.status === 'error'
      ? shiftsAsync.message
      : '';

  const handleRetry = () => {
    ordersAsync.reload();
    methodsAsync.reload();
    shiftsAsync.reload();
    reconsAsync.reload();
    outletAsync.reload();
  };

  return (
    <>
      <PageHeader
        title="Rekonsiliasi non-tunai"
        subtitle="Cocokkan penerimaan non-tunai (QRIS, kartu debit/kredit, transfer) per shift dan metode bayar dengan mutasi rekening bank atau payment gateway."
        actions={
          <div className="flex flex-wrap gap-8 items-center">
            <button
              type="button"
              className={`cg-btn ${showSettings ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="cg-icon" aria-hidden /> Pengaturan outlet
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadCsv}
              disabled={!reconciliation || reconciliation.rows.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
        }
      />

      {/* Banner Arahan Louis: Payment Gateway Belum Tersambung */}
      <div
        role="note"
        className="cg-banner cg-banner--info mb-16 flex items-start gap-12 text-xs"
      >
        <Info className="w-16 h-16 flex-shrink-0 mt-[2px]" aria-hidden />
        <div>
          <strong>Integrasi Gateway DOKU Belum Tersambung:</strong>
          <span className="block mt-[2px] text-text-muted">
            Pencocokan settlement otomatis ditunda sesuai arahan integrasi. Rekonsiliasi penerimaan QRIS & non-tunai dilakukan manual melalui akun Piutang Gateway (1-1300) dan Biaya Gateway (6-2100).
          </span>
        </div>
      </div>

      {/* Kartu Pengaturan Outlet (Bisa Ditampilkan / Disembunyikan) */}
      {showSettings && outletAsync.status === 'ready' && outletAsync.data && (
        <div className="mb-16">
          <OutletReconcileCard
            options={outletAsync.data.options}
            onSaved={() => outletAsync.reload()}
          />
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="cg-banner cg-banner--success mb-16 flex justify-between items-center"
        >
          <span className="text-sm font-medium">{notice}</span>
          <button
            type="button"
            className="text-xs underline hover:opacity-75"
            onClick={() => setNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Ringkasan KPI Rekonsiliasi */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12 mb-16 min-w-0">
        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Penerimaan Sistem POS
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-accent-strong cg-num">
              {formatRp(rawReconciliation?.totalSystemAmount ?? 0)}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {rawReconciliation?.totalTransactions ?? 0} transaksi non-tunai
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Diterima di Bank / EDC
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-text cg-num">
              {rawReconciliation && rawReconciliation.totalActualAmount > 0
                ? formatRp(rawReconciliation.totalActualAmount)
                : '—'}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            Potongan MDR: {formatRp(rawReconciliation?.totalFeeAmount ?? 0)}
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Total Selisih
            </span>
            <strong
              className={`text-xl tablet:text-2xl font-bold block truncate text-left cg-num ${
                !rawReconciliation || rawReconciliation.totalActualAmount === 0
                  ? 'text-text'
                  : rawReconciliation.totalDiff === 0
                  ? 'text-accent-strong'
                  : rawReconciliation.totalDiff > 0
                  ? 'text-accent-strong'
                  : 'text-danger'
              }`}
            >
              {!rawReconciliation || rawReconciliation.totalActualAmount === 0
                ? '—'
                : `${rawReconciliation.totalDiff > 0 ? '+' : ''}${formatRp(rawReconciliation.totalDiff)}`}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {!rawReconciliation || rawReconciliation.totalActualAmount === 0
              ? 'Belum ada input aktual'
              : rawReconciliation.totalDiff === 0
              ? 'Saldo mutasi seimbang'
              : rawReconciliation.totalDiff > 0
              ? 'Mutasi bank lebih besar'
              : 'Penerimaan bank kurang'}
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Status Penyimpanan Server
            </span>
            <div className="flex items-center gap-[6px] my-[2px]">
              <span className="cg-badge cg-badge--success flex items-center gap-4 text-xs font-semibold">
                <CheckCircle2 className="w-[14px] h-[14px]" aria-hidden />
                {rawReconciliation?.reconciledCount ?? 0} Terekonsiliasi
              </span>
            </div>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            {((rawReconciliation?.rows.length ?? 0) - (rawReconciliation?.reconciledCount ?? 0))} baris belum direkonsiliasi
          </span>
        </div>
      </div>

      {/* Filter Pengelompokan, Status, dan Rentang Tanggal */}
      <div className="flex flex-col laptop:flex-row gap-12 mb-16 justify-between items-stretch laptop:items-center">
        <div className="flex flex-wrap items-center gap-8">
          {/* Switcher Grouping */}
          <div className="flex items-center gap-[4px] bg-surface-raised p-4 rounded-lg border border-border">
            <button
              type="button"
              className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
                groupBy === 'shift_method'
                  ? 'bg-surface text-accent font-bold shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setGroupBy('shift_method')}
            >
              Per Shift Kasir
            </button>
            <button
              type="button"
              className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
                groupBy === 'method'
                  ? 'bg-surface text-accent font-bold shadow-xs'
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
                  ? 'bg-surface text-accent font-bold shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setGroupBy('date_method')}
            >
              Per Hari & Metode
            </button>
          </div>

          {/* Filter Status Rekonsiliasi */}
          <div className="flex items-center gap-[4px] bg-surface-raised p-4 rounded-lg border border-border">
            <button
              type="button"
              className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
                statusFilter === 'all'
                  ? 'bg-surface text-text font-bold shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setStatusFilter('all')}
            >
              Semua Status
            </button>
            <button
              type="button"
              className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
                statusFilter === 'unreconciled'
                  ? 'bg-surface text-danger font-bold shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setStatusFilter('unreconciled')}
            >
              Belum Direkonsiliasi
            </button>
            <button
              type="button"
              className={`px-12 py-[6px] text-xs font-medium rounded transition-colors ${
                statusFilter === 'reconciled'
                  ? 'bg-surface text-accent-strong font-bold shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setStatusFilter('reconciled')}
            >
              Terekonsiliasi
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-8 items-center justify-end">
          <RangePicker value={value} onChange={setValue} today={today} />
        </div>
      </div>

      {/* Main Content Area */}
      {hasError ? (
        <ErrorBox
          message={errorMessage || 'Gagal memuat data rekonsiliasi non-tunai.'}
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
            <strong>Tidak ada transaksi non-tunai pada kriteria ini.</strong>
          </p>
          <p className="text-text-muted text-sm mt-4">
            Ubah rentang tanggal atau filter status rekonsiliasi untuk melihat data lainnya.
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
                  {groupBy === 'shift_method' && <th>Shift Kasir</th>}
                  {groupBy === 'date_method' && <th>Tanggal</th>}
                  <th>Metode Pembayaran</th>
                  <th>Kategori</th>
                  <th className="text-right">Transaksi</th>
                  <th className="text-right">Dicatat POS</th>
                  <th className="text-right">Diterima Bank</th>
                  <th className="text-right">Biaya Gateway</th>
                  <th className="text-right">Selisih</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.rows.map((row) => (
                  <tr key={row.id}>
                    {groupBy === 'shift_method' && (
                      <td className="whitespace-nowrap text-sm font-semibold">
                        {row.shiftNumber || (row.shiftId ? `Shift #${row.shiftId.slice(0, 6)}` : 'Shift Berjalan')}
                      </td>
                    )}
                    {groupBy === 'date_method' && (
                      <td className="whitespace-nowrap text-sm font-medium">
                        {row.date ? fmtDate(row.date) : '—'}
                      </td>
                    )}
                    <td className="font-bold text-sm">
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
                    <td className="text-right cg-num font-bold text-sm text-text">
                      {formatRp(row.systemAmount)}
                    </td>
                    <td className="text-right cg-num font-semibold text-sm">
                      {row.actualAmount !== undefined ? formatRp(row.actualAmount) : '—'}
                    </td>
                    <td className="text-right cg-num text-sm text-text-muted">
                      {row.feeAmount ? formatRp(row.feeAmount) : '—'}
                    </td>
                    <td
                      className={`text-right cg-num font-semibold text-sm ${
                        row.diff === undefined
                          ? 'text-text-muted'
                          : row.diff === 0
                          ? 'text-accent-strong'
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
                      {row.isReconciled ? (
                        <span className="cg-badge cg-badge--success inline-flex items-center gap-4">
                          <CheckCircle2 className="w-12 h-12" aria-hidden /> Terekonsiliasi
                        </span>
                      ) : row.status === 'matched' ? (
                        <span className="cg-badge cg-badge--success inline-flex items-center gap-4">
                          <CheckCircle2 className="w-12 h-12" aria-hidden /> Cocok (Draf)
                        </span>
                      ) : row.status === 'mismatch' ? (
                        <span className="cg-badge cg-badge--danger inline-flex items-center gap-4">
                          <AlertCircle className="w-12 h-12" aria-hidden /> Ada Selisih
                        </span>
                      ) : (
                        <span className="cg-badge text-text-muted">
                          Belum Diisi
                        </span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className={`cg-btn text-xs ${row.isReconciled ? 'cg-btn--ghost' : 'cg-btn--secondary'}`}
                        onClick={() => setEditingRow(row)}
                      >
                        {row.isReconciled ? 'Sesuaikan' : 'Rekonsiliasi'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="grid gap-12 tablet:hidden min-w-0" aria-label="Daftar rekonsiliasi mobile">
            {reconciliation.rows.map((row) => (
              <div key={row.id} className="cg-card p-12 min-w-0 flex flex-col gap-8">
                <div className="flex justify-between items-start gap-8">
                  <div>
                    {row.shiftNumber && (
                      <span className="text-xs font-bold text-accent block mb-[2px]">
                        {row.shiftNumber}
                      </span>
                    )}
                    {row.date && (
                      <span className="text-xs text-text-muted block mb-[2px]">
                        {fmtDate(row.date)}
                      </span>
                    )}
                    <strong className="text-sm font-bold block text-text">
                      {row.methodName}
                    </strong>
                    <span className="text-xs text-text-muted">
                      {row.transactionCount} transaksi
                    </span>
                  </div>

                  <div>
                    {row.isReconciled ? (
                      <span className="cg-badge cg-badge--success text-xs">
                        Terekonsiliasi
                      </span>
                    ) : row.status === 'matched' ? (
                      <span className="cg-badge cg-badge--success text-xs">
                        Cocok
                      </span>
                    ) : row.status === 'mismatch' ? (
                      <span className="cg-badge cg-badge--danger text-xs">
                        Selisih
                      </span>
                    ) : (
                      <span className="cg-badge text-xs text-text-muted">
                        Belum Diisi
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 text-xs pt-8 border-t border-border">
                  <div>
                    <span className="text-text-muted block">Dicatat POS:</span>
                    <strong className="cg-num text-sm text-text font-bold">
                      {formatRp(row.systemAmount)}
                    </strong>
                  </div>

                  <div>
                    <span className="text-text-muted block">Diterima Bank:</span>
                    <strong className="cg-num text-sm text-accent-strong font-bold">
                      {row.actualAmount !== undefined ? formatRp(row.actualAmount) : '—'}
                    </strong>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-8 border-t border-border">
                  <div className="text-xs">
                    <span className="text-text-muted">Selisih: </span>
                    <strong
                      className={`cg-num font-bold ${
                        row.diff === undefined
                          ? 'text-text-muted'
                          : row.diff === 0
                          ? 'text-accent-strong'
                          : 'text-danger'
                      }`}
                    >
                      {row.diff !== undefined
                        ? `${row.diff > 0 ? '+' : ''}${formatRp(row.diff)}`
                        : '—'}
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary text-xs"
                    onClick={() => setEditingRow(row)}
                  >
                    {row.isReconciled ? 'Ubah' : 'Rekonsiliasi'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Dialog Input Rekonsiliasi & Biaya Gateway */}
      {editingRow && (
        <ReconcileModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={handleSaveModal}
        />
      )}
    </>
  );
}

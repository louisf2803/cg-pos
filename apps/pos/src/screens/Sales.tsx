import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Download,
  FileText,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import {
  filterPosOrders,
  filterPosRefunds,
  formatRp,
  groupRefundsByOrder,
  orderTypeLabel,
  posSalesRange,
  summarizePosSales,
  toCsv,
  type Order,
  type OrderType,
  type OutletContext,
  type PosRangePreset,
  type Refund,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { DiscountLines, Modal } from '../ui';
import { ReceiptDialog } from './Receipt';

type SalesTab = 'paid' | 'void' | 'refund';

const RANGE_OPTIONS: { id: PosRangePreset; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
];

const ORDER_TYPES: OrderType[] = ['dine_in', 'takeaway', 'delivery', 'service'];

function fmtTime(iso: string, tz: string, withDate = false): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      ...(withDate ? { day: '2-digit', month: 'short' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getVoidMeta(o: Order): { reason?: string; authorizedBy?: string } {
  const extra = o as Order & { voidReason?: string; reason?: string; authorizedBy?: string };
  return {
    reason: extra.voidReason ?? extra.reason ?? (o.label ? o.label : undefined),
    authorizedBy: extra.authorizedBy,
  };
}

function triggerCsvDownload(filename: string, rows: (string | number)[][]) {
  const csv = `\uFEFF${toCsv(rows)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Layar Penjualan, Void, dan Riwayat Refund di POS. */
export function Sales({
  ctx,
  onClose,
}: {
  ctx: OutletContext;
  onClose: () => void;
}) {
  const data = useData();
  const [preset, setPreset] = useState<PosRangePreset>('today');
  const [tab, setTab] = useState<SalesTab>('paid');
  const [search, setSearch] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<OrderType | ''>('');
  const [onlyRefunded, setOnlyRefunded] = useState(false);
  const [methodFilter, setMethodFilter] = useState('');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const range = useMemo(() => posSalesRange(ctx.timezone, preset), [ctx.timezone, preset]);

  const load = useAsync(async () => {
    const [paidOrders, voidOrders, refunds, employees, tables] = await Promise.all([
      data.listOrders({ status: 'paid', from: range.from, to: range.to, by: 'closed', limit: 200 }),
      data.listOrders({ status: 'void', from: range.from, to: range.to, by: 'closed', limit: 200 }),
      data.listRefundsBetween({ from: range.from, to: range.to }),
      data.listEmployees(),
      data.listTables(),
    ]);
    return { paidOrders, voidOrders, refunds, employees, tables };
  }, [data, range.from, range.to]);

  const paidOrders = load.status === 'ready' ? load.data.paidOrders : [];
  const voidOrders = load.status === 'ready' ? load.data.voidOrders : [];
  const refunds = load.status === 'ready' ? load.data.refunds : [];
  const employees = load.status === 'ready' ? load.data.employees : [];
  const tables = load.status === 'ready' ? load.data.tables : [];

  const employeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name);
    return map;
  }, [employees]);

  const tableNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables) map.set(t.id, t.name);
    return map;
  }, [tables]);

  const ordersById = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of paidOrders) map.set(o.id, o);
    for (const o of voidOrders) map.set(o.id, o);
    return map;
  }, [paidOrders, voidOrders]);

  const refundsByOrder = useMemo(() => groupRefundsByOrder(refunds), [refunds]);

  const stats = useMemo(
    () => summarizePosSales(paidOrders, voidOrders, refunds),
    [paidOrders, voidOrders, refunds],
  );

  const refundMethods = useMemo(
    () => Array.from(new Set(refunds.map((r) => r.methodName))).sort((a, b) => a.localeCompare(b)),
    [refunds],
  );

  const filteredPaid = useMemo(
    () =>
      filterPosOrders(paidOrders, search, {
        cashierId: cashierFilter,
        orderType: typeFilter,
        onlyRefunded,
        refundsByOrder,
        employeeNames,
        tableNames,
      }),
    [paidOrders, search, cashierFilter, typeFilter, onlyRefunded, refundsByOrder, employeeNames, tableNames],
  );

  const filteredVoid = useMemo(
    () =>
      filterPosOrders(voidOrders, search, {
        cashierId: cashierFilter,
        orderType: typeFilter,
        employeeNames,
        tableNames,
      }),
    [voidOrders, search, cashierFilter, typeFilter, employeeNames, tableNames],
  );

  const filteredRefunds = useMemo(
    () => filterPosRefunds(refunds, ordersById, search, methodFilter),
    [refunds, ordersById, search, methodFilter],
  );

  const hasFilters = Boolean(
    search.trim() || cashierFilter || typeFilter || (tab === 'paid' && onlyRefunded) || (tab === 'refund' && methodFilter),
  );

  function resetFilters() {
    setSearch('');
    setCashierFilter('');
    setTypeFilter('');
    setOnlyRefunded(false);
    setMethodFilter('');
  }

  async function openRefundOrder(refund: Refund) {
    setOpenError('');
    const cached = ordersById.get(refund.orderId);
    if (cached) {
      setDetailOrder(cached);
      return;
    }
    setOpeningOrderId(refund.orderId);
    try {
      const ord = await data.getOrder(refund.orderId);
      if (ord) {
        setDetailOrder(ord);
      } else {
        setOpenError(`Pesanan asal untuk refund ${refund.number} tidak ditemukan.`);
      }
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : 'Gagal memuat rincian pesanan.');
    } finally {
      setOpeningOrderId(null);
    }
  }

  function exportActiveTab() {
    const suffix = preset === 'today' ? 'hari-ini' : preset;
    if (tab === 'paid') {
      const rows: (string | number)[][] = [
        ['Nomor', 'Waktu', 'Jenis', 'Meja', 'Kasir', 'Pelanggan', 'Metode Bayar', 'Total', 'Total Refund', 'Bersih'],
        ...filteredPaid.map((o) => {
          const refTotal = refundsByOrder.get(o.id)?.total ?? 0;
          return [
            o.number,
            fmtDateTime(o.closedAt ?? o.openedAt, ctx.timezone),
            orderTypeLabel(o.type),
            o.tableId ? (tableNames.get(o.tableId) ?? '') : '',
            employeeNames.get(o.cashierId) ?? o.cashierId,
            o.customerName ?? '',
            o.payments.map((p) => `${p.methodName} (${p.amount})`).join('; '),
            o.total,
            refTotal,
            o.total - refTotal,
          ];
        }),
      ];
      triggerCsvDownload(`pos-penjualan-${suffix}.csv`, rows);
      return;
    }
    if (tab === 'void') {
      const rows: (string | number)[][] = [
        ['Nomor', 'Waktu Batal', 'Jenis', 'Meja', 'Kasir', 'Pelanggan', 'Alasan / Catatan', 'Nilai Batal'],
        ...filteredVoid.map((o) => {
          const meta = getVoidMeta(o);
          return [
            o.number,
            fmtDateTime(o.closedAt ?? o.openedAt, ctx.timezone),
            orderTypeLabel(o.type),
            o.tableId ? (tableNames.get(o.tableId) ?? '') : '',
            employeeNames.get(o.cashierId) ?? o.cashierId,
            o.customerName ?? '',
            meta.reason ?? '',
            o.total,
          ];
        }),
      ];
      triggerCsvDownload(`pos-void-${suffix}.csv`, rows);
      return;
    }
    const rows: (string | number)[][] = [
      ['Nomor Refund', 'Waktu Refund', 'Nomor Pesanan', 'Pelanggan', 'Metode Pengembalian', 'Alasan', 'Catatan', 'Jumlah Refund'],
      ...filteredRefunds.map((r) => {
        const ord = ordersById.get(r.orderId);
        return [
          r.number,
          fmtDateTime(r.createdAt, ctx.timezone),
          ord?.number ?? r.orderId,
          ord?.customerName ?? '',
          r.methodName,
          r.reason,
          r.note ?? '',
          r.total,
        ];
      }),
    ];
    triggerCsvDownload(`pos-refund-${suffix}.csv`, rows);
  }

  const withDate = preset !== 'today';
  const voidSumFiltered = useMemo(
    () => filteredVoid.reduce((s, o) => s + o.total, 0),
    [filteredVoid],
  );
  const refundSumFiltered = useMemo(
    () => filteredRefunds.reduce((s, r) => s + r.total, 0),
    [filteredRefunds],
  );

  return (
    <div className="flex flex-col h-full bg-surface min-w-0">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-12 px-16 py-12 bg-surface-raised border-b border-border shrink-0">
        <div className="flex items-center gap-12 min-w-0">
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            aria-label="Kembali"
          >
            <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
            <span className="hidden tablet:inline">Kembali</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-text leading-tight truncate">
              {preset === 'today' ? 'Penjualan Hari Ini' : 'Riwayat Penjualan'}
            </h1>
            <p className="text-xs text-text-muted truncate">
              {ctx.outletName} · {range.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8 shrink-0">
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={exportActiveTab}
            disabled={load.status !== 'ready'}
            data-testid="pos-sales-export"
          >
            <Download className="cg-icon cg-icon--sm" aria-hidden />
            <span className="hidden tablet:inline">Unduh CSV</span>
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={() => load.reload()}
            aria-label="Perbarui"
          >
            <RefreshCw
              className={`cg-icon cg-icon--sm ${load.status === 'loading' ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-5xl mx-auto p-16 space-y-16 min-w-0">
          {/* Pemilih rentang & tab kontrol */}
          <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 min-w-0">
            <div className="flex flex-wrap items-center gap-6" role="group" aria-label="Rentang waktu">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="cg-chip"
                  aria-pressed={preset === opt.id}
                  onClick={() => setPreset(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="cg-tabs" role="tablist" aria-label="Kategori transaksi POS">
              <button
                type="button"
                role="tab"
                className="cg-tab"
                aria-selected={tab === 'paid'}
                onClick={() => setTab('paid')}
              >
                Penjualan ({paidOrders.length})
              </button>
              <button
                type="button"
                role="tab"
                className="cg-tab"
                aria-selected={tab === 'void'}
                onClick={() => setTab('void')}
              >
                Void ({voidOrders.length})
              </button>
              <button
                type="button"
                role="tab"
                className="cg-tab"
                aria-selected={tab === 'refund'}
                onClick={() => setTab('refund')}
              >
                Refund ({refunds.length})
              </button>
            </div>
          </div>

          {load.status === 'error' && (
            <div className="cg-banner cg-banner--danger" role="alert">
              <div className="flex-1 min-w-0">
                <strong>Gagal memuat data transaksi</strong>
                <p className="mt-2">{load.message}</p>
              </div>
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm"
                onClick={() => load.reload()}
              >
                Muat ulang
              </button>
            </div>
          )}

          {openError && (
            <div className="cg-banner cg-banner--warning" role="alert">
              <div className="flex-1 min-w-0">
                <strong>Rincian pesanan tidak tersedia</strong>
                <p className="mt-2">{openError}</p>
              </div>
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm"
                onClick={() => setOpenError('')}
              >
                Tutup
              </button>
            </div>
          )}

          {/* Ringkasan KPI */}
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12 min-w-0">
            <div className="bg-surface-raised border border-border rounded-lg p-12 flex flex-col justify-between min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Total Penjualan
              </span>
              <span className="text-xl tablet:text-2xl font-bold text-text mt-4 tabular-nums">
                {formatRp(stats.grossTotal)}
              </span>
              <span className="text-xs text-text-muted mt-4 truncate">
                Rata-rata: {stats.paidCount > 0 ? formatRp(stats.avgPaidTicket) : 'Rp 0'} / transaksi
              </span>
            </div>

            <div className="bg-surface-raised border border-border rounded-lg p-12 flex flex-col justify-between min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Jumlah Transaksi
              </span>
              <span className="text-xl tablet:text-2xl font-bold text-text mt-4 tabular-nums">
                {stats.paidCount} Pesanan
              </span>
              <span className="text-xs text-text-muted mt-4 truncate">
                {stats.voidCount} void · {stats.refundCount} refund
              </span>
            </div>

            <div className="bg-surface-raised border border-border rounded-lg p-12 flex flex-col justify-between min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Total Refund
              </span>
              <span
                className={`text-xl tablet:text-2xl font-bold mt-4 tabular-nums ${
                  stats.refundTotal > 0 ? 'text-danger' : 'text-text'
                }`}
              >
                {formatRp(stats.refundTotal)}
              </span>
              <span className="text-xs text-text-muted mt-4 truncate">
                {stats.refundCount} kali pengembalian dana
              </span>
            </div>

            <div className="bg-surface-raised border border-border rounded-lg p-12 flex flex-col justify-between min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Penjualan Bersih
              </span>
              <span className="text-xl tablet:text-2xl font-bold text-accent mt-4 tabular-nums">
                {formatRp(stats.netTotal)}
              </span>
              <span className="text-xs text-text-muted mt-4 truncate">
                Nilai void: {formatRp(stats.voidTotal)}
              </span>
            </div>
          </div>

          {/* Filter & Pencarian */}
          <div className="bg-surface-raised border border-border rounded-lg p-12 space-y-12 min-w-0">
            <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-8 min-w-0">
              <div className="cg-search tablet:col-span-2 min-w-0">
                <Search className="cg-icon cg-icon--sm" aria-hidden />
                <input
                  type="search"
                  placeholder={
                    tab === 'refund'
                      ? 'Cari nomor refund, nomor pesanan, alasan, atau catatan…'
                      : tab === 'void'
                        ? 'Cari nomor void, kasir, alasan batal, pelanggan, atau item…'
                        : 'Cari nomor pesanan, kasir, pelanggan, meja, atau item…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="cg-input w-full"
                />
              </div>

              {tab !== 'refund' ? (
                <>
                  <select
                    aria-label="Filter kasir"
                    className="cg-input min-w-0"
                    value={cashierFilter}
                    onChange={(e) => setCashierFilter(e.target.value)}
                  >
                    <option value="">Semua kasir</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter jenis pesanan"
                    className="cg-input min-w-0"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as OrderType | '')}
                  >
                    <option value="">Semua jenis pesanan</option>
                    {ORDER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {orderTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <select
                  aria-label="Filter metode pengembalian"
                  className="cg-input tablet:col-span-2 laptop:col-span-2 min-w-0"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="">Semua metode pengembalian</option>
                  {refundMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {(tab === 'paid' || hasFilters) && (
              <div className="flex flex-wrap items-center justify-between gap-8">
                <div className="flex flex-wrap items-center gap-8">
                  {tab === 'paid' && (
                    <button
                      type="button"
                      className="cg-chip"
                      aria-pressed={onlyRefunded}
                      onClick={() => setOnlyRefunded((v) => !v)}
                    >
                      <RotateCcw className="cg-icon cg-icon--xs" aria-hidden />
                      <span>Hanya yang di-refund</span>
                    </button>
                  )}
                  {tab === 'void' && (
                    <span className="text-xs text-text-muted">
                      Menampilkan {filteredVoid.length} pesanan void · total {formatRp(voidSumFiltered)}
                    </span>
                  )}
                  {tab === 'refund' && (
                    <span className="text-xs text-text-muted">
                      Menampilkan {filteredRefunds.length} catatan refund · total {formatRp(refundSumFiltered)}
                    </span>
                  )}
                </div>

                {hasFilters && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={resetFilters}
                  >
                    <X className="cg-icon cg-icon--xs" aria-hidden />
                    <span>Reset filter</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Daftar Sesuai Tab */}
          {load.status === 'loading' ? (
            <div className="space-y-8" aria-label="Memuat transaksi">
              <div className="cg-skeleton h-16 w-full" />
              <div className="cg-skeleton h-16 w-full" />
              <div className="cg-skeleton h-16 w-full" />
            </div>
          ) : tab === 'paid' ? (
            <section className="space-y-8" aria-label="Daftar transaksi penjualan">
              {filteredPaid.length === 0 ? (
                <div className="cg-empty bg-surface-raised border border-border rounded-lg">
                  <ShoppingBag className="cg-icon" aria-hidden />
                  <h3>
                    {hasFilters
                      ? 'Tidak ada transaksi lunas yang cocok'
                      : 'Belum ada transaksi lunas'}
                  </h3>
                  <p>
                    {hasFilters
                      ? 'Ubah filter atau kata kunci pencarian untuk melihat transaksi lainnya.'
                      : 'Transaksi yang sudah dibayar pada rentang ini akan tampil di sini.'}
                  </p>
                </div>
              ) : (
                <div className="bg-surface-raised border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {filteredPaid.map((o) => {
                    const ref = refundsByOrder.get(o.id);
                    const cashier = employeeNames.get(o.cashierId);
                    const tableName = o.tableId ? tableNames.get(o.tableId) : undefined;
                    const itemCount = o.items.reduce((sum, it) => sum + it.qty, 0);
                    return (
                      <div
                        key={o.id}
                        className="p-12 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 hover:bg-surface/40 transition-colors"
                      >
                        <div className="min-w-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-6">
                            <span className="font-bold text-text text-sm">{o.number}</span>
                            <span className="cg-badge">{orderTypeLabel(o.type)}</span>
                            {tableName && <span className="cg-badge cg-badge--info">Meja {tableName}</span>}
                            {ref && (
                              <span className="cg-badge cg-badge--warning">
                                Refund {ref.count}× (-{formatRp(ref.total)})
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-12 gap-y-4 text-xs text-text-muted">
                            <span>{fmtTime(o.closedAt ?? o.openedAt, ctx.timezone, withDate)}</span>
                            <span>{itemCount} item</span>
                            {cashier && <span>Kasir: {cashier}</span>}
                            {o.customerName && <span>Pelanggan: {o.customerName}</span>}
                            {o.label && <span>Catatan: {o.label}</span>}
                          </div>
                          {o.payments.length > 0 && (
                            <p className="text-xs text-text-muted truncate">
                              Bayar:{' '}
                              {o.payments
                                .map((p) => `${p.methodName} (${formatRp(p.amount)})`)
                                .join(' + ')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between tablet:justify-end gap-12 shrink-0">
                          <div className="text-left tablet:text-right">
                            <p className="font-bold text-text cg-num">{formatRp(o.total)}</p>
                            {ref && (
                              <p className="text-xs text-accent cg-num">
                                Bersih {formatRp(o.total - ref.total)}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => setDetailOrder(o)}
                          >
                            <FileText className="cg-icon cg-icon--xs" aria-hidden />
                            <span>Rincian</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : tab === 'void' ? (
            <section className="space-y-8" aria-label="Laporan void POS">
              {filteredVoid.length === 0 ? (
                <div className="cg-empty bg-surface-raised border border-border rounded-lg">
                  <Ban className="cg-icon" aria-hidden />
                  <h3>
                    {hasFilters
                      ? 'Tidak ada pembatalan (void) yang cocok'
                      : 'Tidak ada transaksi void'}
                  </h3>
                  <p>
                    {hasFilters
                      ? 'Coba reset filter kasir, jenis order, atau kata kunci.'
                      : 'Belum ada pesanan yang dibatalkan pada rentang waktu ini.'}
                  </p>
                </div>
              ) : (
                <div className="bg-surface-raised border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {filteredVoid.map((o) => {
                    const cashier = employeeNames.get(o.cashierId);
                    const tableName = o.tableId ? tableNames.get(o.tableId) : undefined;
                    const meta = getVoidMeta(o);
                    const itemCount = o.items.reduce((sum, it) => sum + it.qty, 0);
                    return (
                      <div
                        key={o.id}
                        className="p-12 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 hover:bg-surface/40 transition-colors"
                      >
                        <div className="min-w-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-6">
                            <span className="font-bold text-text text-sm">{o.number}</span>
                            <span className="cg-badge cg-badge--danger">Dibatalkan</span>
                            <span className="cg-badge">{orderTypeLabel(o.type)}</span>
                            {tableName && <span className="cg-badge cg-badge--info">Meja {tableName}</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-12 gap-y-4 text-xs text-text-muted">
                            <span>Batal: {fmtTime(o.closedAt ?? o.openedAt, ctx.timezone, withDate)}</span>
                            <span>Buka: {fmtTime(o.openedAt, ctx.timezone, withDate)}</span>
                            <span>{itemCount} item</span>
                            {cashier && <span>Kasir: {cashier}</span>}
                            {o.customerName && <span>Pelanggan: {o.customerName}</span>}
                          </div>
                          <p className="text-xs text-danger truncate">
                            Alasan: {meta.reason ?? 'Tidak ada catatan alasan'}
                            {meta.authorizedBy ? ` · Otorisasi: ${employeeNames.get(meta.authorizedBy) ?? meta.authorizedBy}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center justify-between tablet:justify-end gap-12 shrink-0">
                          <div className="text-left tablet:text-right">
                            <p className="font-bold text-danger cg-num">{formatRp(o.total)}</p>
                            <p className="text-xs text-text-muted">Nilai dibatalkan</p>
                          </div>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => setDetailOrder(o)}
                          >
                            <FileText className="cg-icon cg-icon--xs" aria-hidden />
                            <span>Rincian Void</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section className="space-y-8" aria-label="Riwayat refund per transaksi">
              {filteredRefunds.length === 0 ? (
                <div className="cg-empty bg-surface-raised border border-border rounded-lg">
                  <RotateCcw className="cg-icon" aria-hidden />
                  <h3>
                    {hasFilters
                      ? 'Tidak ada riwayat refund yang cocok'
                      : 'Belum ada transaksi refund'}
                  </h3>
                  <p>
                    {hasFilters
                      ? 'Coba ubah kata kunci atau filter metode pengembalian.'
                      : 'Pengembalian dana yang dicatat pada rentang waktu ini akan muncul di sini.'}
                  </p>
                </div>
              ) : (
                <div className="bg-surface-raised border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {filteredRefunds.map((r) => {
                    const ord = ordersById.get(r.orderId);
                    const cashier = ord ? employeeNames.get(ord.cashierId) : undefined;
                    return (
                      <div
                        key={r.id}
                        className="p-12 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 hover:bg-surface/40 transition-colors"
                      >
                        <div className="min-w-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-6">
                            <span className="font-bold text-text text-sm">{r.number}</span>
                            <span className="cg-badge cg-badge--warning">{r.methodName}</span>
                            {ord ? (
                              <span className="cg-badge">Order {ord.number}</span>
                            ) : (
                              <span className="cg-badge">Order di luar rentang</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-12 gap-y-4 text-xs text-text-muted">
                            <span>{fmtDateTime(r.createdAt, ctx.timezone)}</span>
                            <span>{r.items.reduce((s, it) => s + it.qty, 0)} item dikembalikan</span>
                            {cashier && <span>Kasir: {cashier}</span>}
                            {ord?.customerName && <span>Pelanggan: {ord.customerName}</span>}
                          </div>
                          <p className="text-xs text-text">
                            <span className="font-semibold">Alasan:</span> {r.reason}
                            {r.note ? ` · ${r.note}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center justify-between tablet:justify-end gap-12 shrink-0">
                          <div className="text-left tablet:text-right">
                            <p className="font-bold text-danger cg-num">-{formatRp(r.total)}</p>
                            {ord && (
                              <p className="text-xs text-text-muted cg-num">
                                Order: {formatRp(ord.total)}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            disabled={openingOrderId === r.orderId}
                            onClick={() => void openRefundOrder(r)}
                          >
                            <FileText className="cg-icon cg-icon--xs" aria-hidden />
                            <span>
                              {openingOrderId === r.orderId ? 'Memuat…' : 'Lihat Transaksi'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {detailOrder && (
        <SalesDetailModal
          order={detailOrder}
          ctx={ctx}
          employeeNames={employeeNames}
          tableNames={tableNames}
          onClose={() => setDetailOrder(null)}
          onOpenReceipt={(o) => {
            setDetailOrder(null);
            setReceiptOrder(o);
          }}
        />
      )}

      {receiptOrder && (
        <ReceiptDialog
          order={receiptOrder}
          ctx={ctx}
          kind="receipt"
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </div>
  );
}

function SalesDetailModal({
  order,
  ctx,
  employeeNames,
  tableNames,
  onClose,
  onOpenReceipt,
}: {
  order: Order;
  ctx: OutletContext;
  employeeNames: ReadonlyMap<string, string>;
  tableNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onOpenReceipt: (order: Order) => void;
}) {
  const data = useData();
  const refunds = useAsync(
    () => (order.status === 'void' ? Promise.resolve([] as Refund[]) : data.listRefunds(order.id)),
    [data, order.id, order.status],
  );

  // Tutup modal otomatis bila komponen di-unmount saat pindah layar.
  useEffect(() => () => undefined, []);

  const refundList = refunds.status === 'ready' ? refunds.data : [];
  const totalRefunded = refundList.reduce((sum, r) => sum + r.total, 0);
  const voidMeta = order.status === 'void' ? getVoidMeta(order) : null;
  const cashierName = employeeNames.get(order.cashierId) ?? '—';
  const tableName = order.tableId ? tableNames.get(order.tableId) : undefined;
  const itemNameById = new Map(order.items.map((it) => [it.id, it.name]));

  return (
    <Modal
      title={`Rincian ${order.status === 'void' ? 'Void' : 'Transaksi'} ${order.number}`}
      onClose={onClose}
      labelledBy="pos-sales-detail-title"
    >
      <div className="space-y-12 text-sm max-h-[68vh] overflow-y-auto pr-4">
        {order.status === 'void' && (
          <div className="cg-banner cg-banner--danger" role="status">
            <Ban className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <div className="min-w-0">
              <strong>Pesanan Dibatalkan (Void)</strong>
              <p className="mt-2">
                Alasan: {voidMeta?.reason ?? 'Tidak ada catatan alasan'}
                {voidMeta?.authorizedBy
                  ? ` · Otorisasi: ${employeeNames.get(voidMeta.authorizedBy) ?? voidMeta.authorizedBy}`
                  : ''}
              </p>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-1 tablet:grid-cols-2 gap-8 bg-surface p-12 rounded border border-border text-xs">
          <div>
            <dt className="text-text-muted">Status</dt>
            <dd className="font-semibold text-text mt-2">
              {order.status === 'void' ? 'Dibatalkan (Void)' : 'Lunas'}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">
              {order.status === 'void' ? 'Waktu Batal' : 'Waktu Selesai'}
            </dt>
            <dd className="font-semibold text-text mt-2">
              {fmtDateTime(order.closedAt ?? order.openedAt, ctx.timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Waktu Dibuka</dt>
            <dd className="font-semibold text-text mt-2">
              {fmtDateTime(order.openedAt, ctx.timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Kasir</dt>
            <dd className="font-semibold text-text mt-2">{cashierName}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Jenis Pesanan</dt>
            <dd className="font-semibold text-text mt-2">
              {orderTypeLabel(order.type)}
              {tableName ? ` · Meja ${tableName}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Pelanggan / Catatan</dt>
            <dd className="font-semibold text-text mt-2">
              {order.customerName ?? 'Umum'}
              {order.label ? ` · ${order.label}` : ''}
            </dd>
          </div>
        </dl>

        {/* Daftar item */}
        <section className="space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Daftar Item ({order.items.reduce((s, it) => s + it.qty, 0)})
          </h3>
          <ul className="divide-y divide-border border border-border rounded bg-surface px-12">
            {order.items.map((it) => (
              <li key={it.id} className="py-8 flex justify-between gap-12 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-text">
                    {it.name} <span className="text-text-muted font-normal">× {it.qty}</span>
                  </p>
                  <p className="text-text-muted mt-2">@ {formatRp(it.unitPrice)}</p>
                  {it.extras && it.extras.length > 0 && (
                    <p className="text-text-muted mt-2">
                      + {it.extras.map((ex) => `${ex.name}${ex.price > 0 ? ` (${formatRp(ex.price)})` : ''}`).join(', ')}
                    </p>
                  )}
                  {it.note && <p className="italic text-text-muted mt-2">Catatan: {it.note}</p>}
                </div>
                <span className="cg-num font-semibold text-text shrink-0">{formatRp(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Ringkasan nominal */}
        <section className="bg-surface border border-border rounded p-12 space-y-6 text-xs">
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Subtotal</span>
            <span className="cg-num">{formatRp(order.subtotal)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between gap-12 text-accent">
                <span>Potongan</span>
                <span className="cg-num">-{formatRp(order.discountTotal)}</span>
              </div>
              <DiscountLines entries={order.discounts} />
            </div>
          )}
          {order.serviceCharge > 0 && (
            <div className="flex justify-between gap-12">
              <span className="text-text-muted">Biaya layanan</span>
              <span className="cg-num">{formatRp(order.serviceCharge)}</span>
            </div>
          )}
          {order.taxTotal > 0 && (
            <div className="flex justify-between gap-12">
              <span className="text-text-muted">Pajak</span>
              <span className="cg-num">{formatRp(order.taxTotal)}</span>
            </div>
          )}
          {order.rounding !== 0 && (
            <div className="flex justify-between gap-12">
              <span className="text-text-muted">Pembulatan</span>
              <span className="cg-num">{formatRp(order.rounding)}</span>
            </div>
          )}
          <div className="flex justify-between gap-12 pt-6 border-t border-border font-bold text-sm">
            <span>{order.status === 'void' ? 'Nilai Dibatalkan' : 'Total Transaksi'}</span>
            <span className="cg-num">{formatRp(order.total)}</span>
          </div>
          {totalRefunded > 0 && (
            <>
              <div className="flex justify-between gap-12 text-danger">
                <span>Total Refund</span>
                <span className="cg-num">-{formatRp(totalRefunded)}</span>
              </div>
              <div className="flex justify-between gap-12 font-bold text-accent">
                <span>Penjualan Bersih</span>
                <span className="cg-num">{formatRp(order.total - totalRefunded)}</span>
              </div>
            </>
          )}
        </section>

        {/* Pembayaran */}
        {order.payments.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Pembayaran</h3>
            <ul className="border border-border rounded bg-surface px-12 divide-y divide-border text-xs">
              {order.payments.map((p) => (
                <li key={p.id} className="py-8 flex justify-between gap-12">
                  <div>
                    <span className="font-semibold text-text">{p.methodName}</span>
                    {p.reference && <span className="block text-text-muted">Ref: {p.reference}</span>}
                    {p.change > 0 && <span className="block text-text-muted">Kembalian: {formatRp(p.change)}</span>}
                  </div>
                  <span className="cg-num font-semibold">{formatRp(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Riwayat Refund Per Transaksi */}
        {order.status !== 'void' && (
          <section className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Riwayat Refund Transaksi
            </h3>
            {refunds.status === 'loading' ? (
              <div className="cg-skeleton h-12 w-full" />
            ) : refunds.status === 'error' ? (
              <p className="text-xs text-danger">{refunds.message}</p>
            ) : refundList.length === 0 ? (
              <p className="text-xs text-text-muted">Tidak ada pengembalian dana untuk transaksi ini.</p>
            ) : (
              <ul className="border border-border rounded bg-surface divide-y divide-border text-xs">
                {refundList.map((r) => (
                  <li key={r.id} className="p-12 space-y-4">
                    <div className="flex items-center justify-between gap-8">
                      <div className="flex flex-wrap items-center gap-6">
                        <span className="font-bold text-text">{r.number}</span>
                        <span className="cg-badge cg-badge--warning">{r.methodName}</span>
                      </div>
                      <span className="cg-num font-bold text-danger">-{formatRp(r.total)}</span>
                    </div>
                    <p className="text-text-muted">{fmtDateTime(r.createdAt, ctx.timezone)}</p>
                    <p className="text-text">
                      Alasan: {r.reason}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                    {r.items.length > 0 && (
                      <p className="text-text-muted">
                        Item:{' '}
                        {r.items
                          .map(
                            (ri) =>
                              `${itemNameById.get(ri.orderItemId) ?? 'Item'} ×${ri.qty} (${formatRp(ri.amount)})`,
                          )
                          .join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="cg-modal__actions mt-12">
        <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>
          Tutup
        </button>
        {order.status === 'paid' && (
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => onOpenReceipt(order)}
          >
            <Printer className="cg-icon cg-icon--sm" aria-hidden />
            <span>Cetak / Lihat Struk</span>
          </button>
        )}
      </div>
    </Modal>
  );
}

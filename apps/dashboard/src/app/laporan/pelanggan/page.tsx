'use client';
import { useMemo, useState } from 'react';
import { Download, ArrowUpDown } from 'lucide-react';
import {
  formatRp,
  toCsv,
  type Customer,
  type Order,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

type SortOption = 'spend' | 'frequency' | 'points' | 'recent' | 'name';
type FilterOption = 'semua' | 'aktif' | 'inaktif' | 'berpoin';

interface CustomerStat {
  customer: Customer;
  orderCount: number;
  totalSpend: number;
  avgSpend: number;
  lastOrderDate: string | null;
}

const fmtDate = (iso: string | null, tz: string) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function LaporanPelanggan() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';

  const [filterMode, setFilterMode] = useState<FilterOption>('semua');
  const [sortBy, setSortBy] = useState<SortOption>('spend');
  const [q, setQ] = useState('');

  // Fetch registered customers
  const customersState = useAsync(async () => {
    return data.listCustomers({ limit: 500 });
  }, [data]);

  const orders: Order[] = state.status === 'ready' && state.data ? state.data.orders : [];
  const customers: Customer[] = customersState.status === 'ready' && customersState.data ? customersState.data : [];

  // Aggregate stats per customer
  const {
    customerStats,
    totalCustomerSpend,
    totalCustomerOrders,
    anonymousSpend,
    anonymousOrders,
    activeCustomerCount,
    totalMemberPoints,
  } = useMemo(() => {
    const map = new Map<string, { count: number; spend: number; lastDate: string | null }>();

    let anonSpend = 0;
    let anonOrders = 0;

    for (const o of orders) {
      if (o.customerId) {
        const cur = map.get(o.customerId) || { count: 0, spend: 0, lastDate: null };
        cur.count += 1;
        cur.spend += o.total;
        const orderDate = o.closedAt ?? o.openedAt;
        if (!cur.lastDate || orderDate > cur.lastDate) {
          cur.lastDate = orderDate;
        }
        map.set(o.customerId, cur);
      } else {
        anonSpend += o.total;
        anonOrders += 1;
      }
    }

    let totCustSpend = 0;
    let totCustOrders = 0;
    let activeCount = 0;
    let totPoints = 0;

    const stats: CustomerStat[] = customers.map((c) => {
      totPoints += c.pointsBalance || 0;
      const agg = map.get(c.id);
      if (agg && agg.count > 0) {
        activeCount++;
        totCustSpend += agg.spend;
        totCustOrders += agg.count;
        return {
          customer: c,
          orderCount: agg.count,
          totalSpend: agg.spend,
          avgSpend: Math.round(agg.spend / agg.count),
          lastOrderDate: agg.lastDate,
        };
      }
      return {
        customer: c,
        orderCount: 0,
        totalSpend: 0,
        avgSpend: 0,
        lastOrderDate: null,
      };
    });

    return {
      customerStats: stats,
      totalCustomerSpend: totCustSpend,
      totalCustomerOrders: totCustOrders,
      anonymousSpend: anonSpend,
      anonymousOrders: anonOrders,
      activeCustomerCount: activeCount,
      totalMemberPoints: totPoints,
    };
  }, [customers, orders]);

  // Filter & Search
  const filteredList = useMemo(() => {
    let result = customerStats;

    // Filter by mode
    if (filterMode === 'aktif') {
      result = result.filter((item) => item.orderCount > 0);
    } else if (filterMode === 'inaktif') {
      result = result.filter((item) => item.orderCount === 0);
    } else if (filterMode === 'berpoin') {
      result = result.filter((item) => (item.customer.pointsBalance || 0) > 0);
    }

    // Filter by search keyword
    const needle = q.trim().toLowerCase();
    if (needle) {
      result = result.filter((item) => {
        const c = item.customer;
        return (
          c.name.toLowerCase().includes(needle) ||
          (c.phone && c.phone.toLowerCase().includes(needle)) ||
          (c.code && c.code.toLowerCase().includes(needle)) ||
          (c.email && c.email.toLowerCase().includes(needle))
        );
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'spend') return b.totalSpend - a.totalSpend;
      if (sortBy === 'frequency') return b.orderCount - a.orderCount;
      if (sortBy === 'points') return (b.customer.pointsBalance || 0) - (a.customer.pointsBalance || 0);
      if (sortBy === 'recent') {
        if (!a.lastOrderDate) return 1;
        if (!b.lastOrderDate) return -1;
        return b.lastOrderDate.localeCompare(a.lastOrderDate);
      }
      if (sortBy === 'name') return a.customer.name.localeCompare(b.customer.name, 'id');
      return 0;
    });

    return result;
  }, [customerStats, filterMode, q, sortBy]);

  const allOrdersSpend = totalCustomerSpend + anonymousSpend;
  const memberSpendRatio = allOrdersSpend > 0 ? Math.round((totalCustomerSpend / allOrdersSpend) * 100) : 0;
  const avgBasketSpend = totalCustomerOrders > 0 ? Math.round(totalCustomerSpend / totalCustomerOrders) : 0;

  function downloadCsv() {
    const rows: (string | number)[][] = [];

    rows.push(['LAPORAN ANALITIK PELANGGAN']);
    rows.push(['Rentang Waktu', range.label]);
    rows.push(['Total Pelanggan Terdaftar', customers.length]);
    rows.push(['Pelanggan Aktif Belanja', activeCustomerCount]);
    rows.push(['Total Belanja Member (Rp)', totalCustomerSpend]);
    rows.push(['Total Transaksi Member', totalCustomerOrders]);
    rows.push(['Total Belanja Non-Member (Rp)', anonymousSpend]);
    rows.push(['Total Transaksi Non-Member', anonymousOrders]);
    rows.push([]);

    rows.push([
      'Kode Pelanggan',
      'Nama Pelanggan',
      'No. Telepon',
      'Email',
      'Jumlah Transaksi',
      'Total Belanja (Rp)',
      'Rata-rata Belanja (Rp)',
      'Saldo Poin',
      'Transaksi Terakhir',
    ]);

    for (const item of filteredList) {
      const c = item.customer;
      rows.push([
        c.code ?? '-',
        c.name,
        c.phone ?? '-',
        c.email ?? '-',
        item.orderCount,
        item.totalSpend,
        item.avgSpend,
        c.pointsBalance || 0,
        fmtDate(item.lastOrderDate, tz),
      ]);
    }

    const csvContent = toCsv(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-pelanggan-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLoading = ctx.status === 'loading' || state.status === 'loading' || customersState.status === 'loading';
  const isError = ctx.status === 'error' || state.status === 'error' || customersState.status === 'error';
  const errorMsg = ctx.status === 'error' ? ctx.message : state.status === 'error' ? state.message : customersState.status === 'error' ? customersState.message : '';

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Laporan pelanggan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined}
        actions={
          <button
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={isLoading || isError || filteredList.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {isError && (
        <ErrorBox
          message={errorMsg || 'Gagal memuat data pelanggan'}
          onRetry={() => {
            if (ctx.status === 'error') ctx.reload();
            if (state.status === 'error') state.reload();
            if (customersState.status === 'error') customersState.reload();
          }}
        />
      )}

      {isLoading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 88 }} />
            ))}
          </div>
          <div className="cg-skeleton" style={{ height: 280 }} />
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            <div className="cg-data min-w-0">
              <span className="cg-data__label">Pelanggan Aktif</span>
              <span className="cg-data__value text-success-strong">
                {activeCustomerCount} <span className="text-sm font-normal text-text-muted">/ {customers.length}</span>
              </span>
              <span className="cg-data__sub text-text-muted">
                {customers.length > 0 ? Math.round((activeCustomerCount / customers.length) * 100) : 0}% terdaftar belanja
              </span>
            </div>

            <div className="cg-data min-w-0">
              <span className="cg-data__label">Omzet Member</span>
              <span className="cg-data__value text-brand-strong">{formatRp(totalCustomerSpend)}</span>
              <span className="cg-data__sub text-text-muted">{memberSpendRatio}% dari total omzet</span>
            </div>

            <div className="cg-data min-w-0">
              <span className="cg-data__label">Rata-rata Belanja</span>
              <span className="cg-data__value">{formatRp(avgBasketSpend)}</span>
              <span className="cg-data__sub text-text-muted">{totalCustomerOrders} transaksi member</span>
            </div>

            <div className="cg-data min-w-0">
              <span className="cg-data__label">Poin Beredar</span>
              <span className="cg-data__value text-accent-strong">
                {totalMemberPoints.toLocaleString('id-ID')}
              </span>
              <span className="cg-data__sub text-text-muted">total saldo poin tersimpan</span>
            </div>
          </div>

          {/* Rangkuman Non-Member / Anonim */}
          {anonymousOrders > 0 && (
            <div
              className="p-12 border rounded-md flex flex-wrap items-center justify-between gap-8 text-sm"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-hover, #f8f9fa)',
              }}
            >
              <div>
                <span className="font-semibold">Transaksi Non-Member (Tamu Umum):</span>{' '}
                <span className="text-text-muted">
                  {anonymousOrders} pesanan tanpa kartu member ({formatRp(anonymousSpend)}).
                </span>
              </div>
              <div className="text-text-muted">
                Rata-rata per belanja: {formatRp(Math.round(anonymousSpend / anonymousOrders))}
              </div>
            </div>
          )}

          {/* Filters, Search, and Sort */}
          <div className="flex flex-wrap items-center justify-between gap-12 mt-4">
            <div className="flex flex-wrap gap-8" role="group" aria-label="Filter status pelanggan">
              <button
                className="cg-chip"
                aria-pressed={filterMode === 'semua'}
                onClick={() => setFilterMode('semua')}
              >
                Semua ({customers.length})
              </button>
              <button
                className="cg-chip"
                aria-pressed={filterMode === 'aktif'}
                onClick={() => setFilterMode('aktif')}
              >
                Pernah Belanja ({activeCustomerCount})
              </button>
              <button
                className="cg-chip"
                aria-pressed={filterMode === 'inaktif'}
                onClick={() => setFilterMode('inaktif')}
              >
                Belum Belanja ({customers.length - activeCustomerCount})
              </button>
              <button
                className="cg-chip"
                aria-pressed={filterMode === 'berpoin'}
                onClick={() => setFilterMode('berpoin')}
              >
                Punya Poin ({customers.filter((c) => (c.pointsBalance || 0) > 0).length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-12 flex-1 justify-end max-w-xl">
              <div className="flex items-center gap-[6px]">
                <ArrowUpDown className="cg-icon text-text-muted" aria-hidden />
                <label htmlFor="sort-pelanggan" className="cg-sr">Urutkan berdasarkan</label>
                <select
                  id="sort-pelanggan"
                  className="cg-input py-[6px] text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  <option value="spend">Total Belanja (Tertinggi)</option>
                  <option value="frequency">Jumlah Transaksi (Terbanyak)</option>
                  <option value="points">Saldo Poin (Terbanyak)</option>
                  <option value="recent">Kunjungan Terakhir (Terbaru)</option>
                  <option value="name">Nama (A-Z)</option>
                </select>
              </div>

              <label className="cg-search flex-1 min-w-[200px]">
                <span className="cg-sr">Cari nama, kode, atau kontak pelanggan</span>
                <input
                  className="cg-input"
                  type="search"
                  placeholder="Cari pelanggan..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Table Container */}
          <div className="cg-card p-16 grid gap-12 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-8">
              <h2 className="text-h3 font-semibold">Daftar Transaksi Pelanggan</h2>
              <span className="text-text-muted text-sm" aria-live="polite">
                Menampilkan {filteredList.length} dari {customers.length} pelanggan
              </span>
            </div>

            <div className="min-w-0 overflow-x-auto">
              {filteredList.length === 0 ? (
                <div className="cg-empty py-24 text-center">
                  <p className="font-medium">
                    {q
                      ? `Tidak ditemukan pelanggan yang cocok dengan "${q}".`
                      : 'Belum ada data pelanggan untuk kategori ini.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <th className="py-8 px-8 font-semibold">Pelanggan</th>
                      <th className="py-8 px-8 font-semibold">Kontak</th>
                      <th className="py-8 px-8 font-semibold text-right">Pesanan</th>
                      <th className="py-8 px-8 font-semibold text-right">Total Belanja</th>
                      <th className="py-8 px-8 font-semibold text-right">Rata-rata</th>
                      <th className="py-8 px-8 font-semibold text-right">Poin</th>
                      <th className="py-8 px-8 font-semibold">Kunjungan Terakhir</th>
                      <th className="py-8 px-8 font-semibold text-right">Kontribusi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((item) => {
                      const c = item.customer;
                      const sharePct = totalCustomerSpend > 0
                        ? Math.round((item.totalSpend / totalCustomerSpend) * 100)
                        : 0;

                      return (
                        <tr
                          key={c.id}
                          className="border-b hover:bg-surface-hover"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <td className="py-[10px] px-8 font-medium">
                            <div>{c.name}</div>
                            {c.code && (
                              <span className="text-xs text-text-muted">
                                {c.code}
                              </span>
                            )}
                          </td>
                          <td className="py-[10px] px-8 text-text-muted">
                            <div>{c.phone || '-'}</div>
                            {c.email && (
                              <div className="text-xs">{c.email}</div>
                            )}
                          </td>
                          <td className="py-[10px] px-8 text-right font-medium">
                            {item.orderCount > 0 ? (
                              <span>{item.orderCount}x</span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-[10px] px-8 text-right font-medium">
                            {item.totalSpend > 0 ? (
                              <span className="text-brand-strong">{formatRp(item.totalSpend)}</span>
                            ) : (
                              <span className="text-text-muted">Rp 0</span>
                            )}
                          </td>
                          <td className="py-[10px] px-8 text-right text-text-muted">
                            {item.orderCount > 0 ? formatRp(item.avgSpend) : '-'}
                          </td>
                          <td className="py-[10px] px-8 text-right font-medium">
                            {(c.pointsBalance || 0) > 0 ? (
                              <span className="text-accent-strong">
                                {c.pointsBalance.toLocaleString('id-ID')}
                              </span>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                          <td className="py-[10px] px-8 text-text-muted">
                            {fmtDate(item.lastOrderDate, tz)}
                          </td>
                          <td className="py-[10px] px-8 text-right">
                            <div className="inline-flex items-center gap-[6px] justify-end w-[112px]">
                              <span className="text-xs">{sharePct}%</span>
                              <div
                                className="h-[8px] w-16 rounded-full"
                                style={{ backgroundColor: 'var(--color-border)' }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, sharePct))}%`,
                                    backgroundColor: 'var(--color-primary)',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

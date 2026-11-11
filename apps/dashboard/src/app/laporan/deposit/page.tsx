'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  formatRp,
  localDateKey,
  summarizeDepositRefunds,
  summarizeDepositSales,
  type DepositRefundRecord,
  type DepositSaleRecord,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { dateRange, presetRange } from '@/lib/range';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker, type RangeValue } from '@/components/range-picker';

function shiftDateIso(dayKey: string, deltaDays: number, hhmm: string): string {
  const ms = new Date(`${dayKey}T00:00:00+07:00`).getTime() + deltaDays * 86400_000;
  const targetDay = localDateKey(new Date(ms), 'Asia/Jakarta');
  return `${targetDay}T${hhmm}:00+07:00`;
}

function buildSampleDepositSales(todayKey: string): DepositSaleRecord[] {
  return [
    {
      id: 'ds-1',
      occurredAt: shiftDateIso(todayKey, 0, '10:15'),
      customerName: 'Rina Kusuma',
      packageName: 'Deposit 500rb Bonus 50rb',
      salePrice: 500000,
      creditAmount: 550000,
      methodName: 'QRIS',
      orderNumber: 'DEP/2611/004',
    },
    {
      id: 'ds-2',
      occurredAt: shiftDateIso(todayKey, 0, '13:40'),
      customerName: 'Budi Santoso',
      packageName: 'Deposit 100rb',
      salePrice: 100000,
      creditAmount: 100000,
      methodName: 'Tunai',
      orderNumber: 'DEP/2611/005',
    },
    {
      id: 'ds-3',
      occurredAt: shiftDateIso(todayKey, -2, '16:20'),
      customerName: 'Dewi Permata',
      packageName: 'Deposit 500rb Bonus 50rb',
      salePrice: 500000,
      creditAmount: 550000,
      methodName: 'Transfer Bank BCA',
      orderNumber: 'DEP/2611/002',
    },
    {
      id: 'ds-4',
      occurredAt: shiftDateIso(todayKey, -5, '11:05'),
      customerName: 'Andi Wijaya',
      packageName: 'Deposit 100rb',
      salePrice: 100000,
      creditAmount: 100000,
      methodName: 'Kartu Debit EDC',
      orderNumber: 'DEP/2611/001',
    },
  ];
}

function buildSampleDepositRefunds(todayKey: string): DepositRefundRecord[] {
  return [
    {
      id: 'dr-1',
      occurredAt: shiftDateIso(todayKey, -1, '15:10'),
      customerName: 'Fajar Pratama',
      amount: 150000,
      reason: 'Pelanggan pindah domisili (sisa saldo dikembalikan tunai)',
      processedBy: 'Sari (Manajer)',
    },
    {
      id: 'dr-2',
      occurredAt: shiftDateIso(todayKey, -4, '18:30'),
      customerName: 'Nadia Putri',
      amount: 50000,
      reason: 'Salah input nominal pengisian saldo di kasir',
      processedBy: 'Bima (Pemilik)',
    },
  ];
}

function fmtDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function LaporanDepositPage() {
  const data = useData();
  const ctxState = useAsync(() => data.getContext(), [data]);

  const [tab, setTab] = useState<'sales' | 'refunds'>('sales');
  const [range, setRange] = useState<RangeValue>({ preset: '7d', from: '', to: '' });
  const [search, setSearch] = useState('');

  const tz = ctxState.status === 'ready' ? ctxState.data.timezone : 'Asia/Jakarta';
  const today = localDateKey(new Date(), tz);

  const resolvedRange = useMemo(() => {
    if (range.preset === 'custom') {
      return dateRange(tz, range.from || today, range.to || today);
    }
    return presetRange(tz, range.preset);
  }, [tz, range, today]);

  const sampleSales = useMemo(() => buildSampleDepositSales(today), [today]);
  const sampleRefunds = useMemo(() => buildSampleDepositRefunds(today), [today]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = new Date(resolvedRange.from).getTime();
    const endMs = new Date(resolvedRange.to).getTime();
    return sampleSales.filter((row) => {
      const t = new Date(row.occurredAt).getTime();
      if (t < startMs || t >= endMs) return false;
      if (!q) return true;
      return (
        row.customerName.toLowerCase().includes(q) ||
        row.packageName.toLowerCase().includes(q) ||
        row.orderNumber.toLowerCase().includes(q)
      );
    });
  }, [sampleSales, resolvedRange, search]);

  const filteredRefunds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = new Date(resolvedRange.from).getTime();
    const endMs = new Date(resolvedRange.to).getTime();
    return sampleRefunds.filter((row) => {
      const t = new Date(row.occurredAt).getTime();
      if (t < startMs || t >= endMs) return false;
      if (!q) return true;
      return (
        row.customerName.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q)
      );
    });
  }, [sampleRefunds, resolvedRange, search]);

  const salesSummary = useMemo(() => summarizeDepositSales(filteredSales), [filteredSales]);
  const refundSummary = useMemo(() => summarizeDepositRefunds(filteredRefunds), [filteredRefunds]);

  return (
    <>
      <PageHeader
        title="Laporan deposit"
        subtitle="Pantau transaksi penjualan paket deposit dan pengembalian saldo pelanggan"
        helpText="Menampilkan ringkasan pembelian paket deposit dan pengembalian (refund) saldo dalam rentang tanggal terpilih."
        actions={
          <Link href="/deposit" className="cg-btn cg-btn--secondary cg-btn--sm">
            Kelola Paket Deposit
          </Link>
        }
      />

      <div className="cg-banner cg-banner--info mb-16 flex flex-wrap items-center justify-between gap-8" role="status">
        <span>
          <strong>Pratinjau tampilan — menunggu dukungan server.</strong> Data di bawah merupakan contoh transaksi penjualan &amp; refund deposit statis sesuai rentang tanggal.
        </span>
        <span className="cg-badge text-[11px] font-semibold">Pratinjau</span>
      </div>

      {ctxState.status === 'error' && (
        <ErrorBox message={ctxState.message} onRetry={ctxState.reload} />
      )}

      {ctxState.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan deposit">
          <div className="cg-skeleton h-[44px]" />
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px]" />
        </div>
      )}

      {ctxState.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          <RangePicker
            value={{ preset: range.preset, from: range.from || today, to: range.to || today }}
            today={today}
            onChange={setRange}
          />

          <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
            <div className="cg-tabs" role="tablist" aria-label="Tab Laporan Deposit">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'sales'}
                className={`cg-tab ${tab === 'sales' ? 'cg-tab--active' : ''}`}
                onClick={() => setTab('sales')}
              >
                Penjualan Deposit ({filteredSales.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'refunds'}
                className={`cg-tab ${tab === 'refunds' ? 'cg-tab--active' : ''}`}
                onClick={() => setTab('refunds')}
              >
                Refund Deposit ({filteredRefunds.length})
              </button>
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-[340px]">
              <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                type="search"
                className="cg-input pl-32"
                placeholder={tab === 'sales' ? 'Cari pelanggan atau paket...' : 'Cari pelanggan atau alasan...'}
                aria-label="Cari transaksi deposit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {tab === 'sales' ? (
            <>
              <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total penjualan deposit</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {formatRp(salesSummary.totalSalePrice)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total saldo diberikan</dt>
                  <dd className="text-xl font-bold cg-num text-accent-strong mt-4">
                    {formatRp(salesSummary.totalCreditGiven)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Jumlah transaksi · bonus</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {salesSummary.count}x · +{formatRp(salesSummary.totalBonus)}
                  </dd>
                </div>
              </dl>

              {filteredSales.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada penjualan paket deposit pada rentang ini.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Pilih rentang tanggal lain atau bersihkan kata pencarian.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredSales.map((row) => (
                      <li
                        key={row.id}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8 min-w-0">
                          <div className="min-w-0">
                            <strong className="text-sm text-text block break-words">
                              {row.customerName}
                            </strong>
                            <span className="text-xs text-text-muted cg-num">{row.orderNumber}</span>
                          </div>
                          <span className="cg-badge text-xs shrink-0">{row.methodName}</span>
                        </div>
                        <div className="text-xs text-text-muted">{fmtDateTime(row.occurredAt, tz)}</div>
                        <div className="text-sm font-medium text-text break-words">{row.packageName}</div>
                        <div className="flex items-center justify-between pt-8 border-t border-border/60 text-sm">
                          <span className="text-text-muted">Harga jual / Saldo</span>
                          <span className="cg-num font-bold text-text">
                            {formatRp(row.salePrice)} → {formatRp(row.creditAmount)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>No. Transaksi</th>
                          <th>Pelanggan</th>
                          <th>Paket Deposit</th>
                          <th className="cg-num">Nominal Saldo</th>
                          <th className="cg-num">Harga Jual</th>
                          <th>Metode Bayar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((row) => (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap text-text-muted">
                              {fmtDateTime(row.occurredAt, tz)}
                            </td>
                            <td className="cg-num font-semibold whitespace-nowrap">{row.orderNumber}</td>
                            <td className="font-medium break-words">{row.customerName}</td>
                            <td className="break-words">{row.packageName}</td>
                            <td className="cg-num font-bold whitespace-nowrap">
                              {formatRp(row.creditAmount)}
                            </td>
                            <td className="cg-num whitespace-nowrap">{formatRp(row.salePrice)}</td>
                            <td className="whitespace-nowrap">
                              <span className="cg-badge text-xs">{row.methodName}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <dl className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total nominal refund deposit</dt>
                  <dd className="text-xl font-bold cg-num text-danger-strong mt-4">
                    {formatRp(refundSummary.totalRefundAmount)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Jumlah pengembalian saldo</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {refundSummary.count} transaksi
                  </dd>
                </div>
              </dl>

              {filteredRefunds.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada refund saldo deposit pada rentang ini.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Pilih rentang tanggal lain atau bersihkan kata pencarian.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredRefunds.map((row) => (
                      <li
                        key={row.id}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8">
                          <strong className="text-sm text-text break-words">{row.customerName}</strong>
                          <strong className="cg-num text-sm text-danger-strong shrink-0">
                            {formatRp(row.amount)}
                          </strong>
                        </div>
                        <div className="text-xs text-text-muted">{fmtDateTime(row.occurredAt, tz)}</div>
                        <p className="text-sm text-text break-words">{row.reason}</p>
                        <div className="text-xs text-text-muted pt-4 border-t border-border/60">
                          Diproses oleh: {row.processedBy}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Pelanggan</th>
                          <th className="cg-num">Nominal Refund</th>
                          <th>Alasan</th>
                          <th>Diproses Oleh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRefunds.map((row) => (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap text-text-muted">
                              {fmtDateTime(row.occurredAt, tz)}
                            </td>
                            <td className="font-medium break-words">{row.customerName}</td>
                            <td className="cg-num font-bold text-danger-strong whitespace-nowrap">
                              {formatRp(row.amount)}
                            </td>
                            <td className="break-words">{row.reason}</td>
                            <td className="whitespace-nowrap text-text-muted">{row.processedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}


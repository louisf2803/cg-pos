'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Boxes,
  ShieldAlert,
  ShoppingBag,
  DollarSign,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  formatRp,
  getTopProducts,
  getTopLowestStock,
  getTopMinStock,
  getTopOrderTypes,
  STOCK_STATUS_LABEL,
  type Order,
  type StockItem,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

export default function LaporanTeratasPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  // Ambil data pesanan lunas dalam rentang waktu terpilih
  const ordersState = useAsync(async (): Promise<Order[]> => {
    return data.listOrders({
      status: 'paid',
      from: range.from,
      to: range.to,
      by: 'closed',
      all: true,
    });
  }, [data, range.from, range.to]);

  // Ambil data stok persediaan terkini
  const stockState = useAsync(async (): Promise<StockItem[]> => {
    return data.listStock();
  }, [data]);

  // Kalkulasi data murni untuk masing-masing kartu
  const topProducts = useMemo(() => {
    if (ordersState.status !== 'ready' || !ordersState.data) return [];
    return getTopProducts(ordersState.data, 10);
  }, [ordersState]);

  const topLowestStock = useMemo(() => {
    if (stockState.status !== 'ready' || !stockState.data) return [];
    return getTopLowestStock(stockState.data, 10);
  }, [stockState]);

  const topMinStock = useMemo(() => {
    if (stockState.status !== 'ready' || !stockState.data) return [];
    return getTopMinStock(stockState.data, 10);
  }, [stockState]);

  const topOrderTypes = useMemo(() => {
    if (ordersState.status !== 'ready' || !ordersState.data) return [];
    return getTopOrderTypes(ordersState.data, 10);
  }, [ordersState]);

  const hasSalesError = ordersState.status === 'error';
  const hasStockError = stockState.status === 'error';

  return (
    <div className="space-y-24 max-w-full overflow-hidden">
      <PageHeader
        title="10 Laporan Teratas"
        subtitle="Peringkat 10 data terbaik untuk penjualan, persediaan bahan baku, dan saluran transaksi dalam periode terpilih."
      />

      {/* Baris Filter Rentang Tanggal */}
      <div className="flex flex-wrap items-center justify-between gap-12 bg-surface p-16 rounded-lg border border-border">
        <RangePicker value={value} today={today} onChange={setValue} />
        <span className="text-xs text-text-muted">
          Data penjualan diperbarui otomatis sesuai rentang waktu.
        </span>
      </div>

      {/* Banner Galat Global jika salah satu sumber data gagal */}
      {hasSalesError && (
        <ErrorBox
          message={`Gagal memuat data penjualan: ${ordersState.message}`}
          onRetry={ordersState.reload}
        />
      )}
      {hasStockError && (
        <ErrorBox
          message={`Gagal memuat data stok: ${stockState.message}`}
          onRetry={stockState.reload}
        />
      )}

      {/* Grid 2 Kolom di Laptop/Desktop, 1 Kolom di Mobile */}
      <div className="grid grid-cols-1 laptop:grid-cols-2 gap-20 min-w-0">
        {/* KARTU 1: Produk Terlaris */}
        <section
          className="bg-surface border border-border rounded-lg p-20 flex flex-col justify-between min-w-0 space-y-16"
          aria-labelledby="heading-produk-terlaris"
        >
          <div>
            <div className="flex items-start justify-between gap-12 pb-12 border-b border-border">
              <div className="space-y-4 min-w-0">
                <h2
                  id="heading-produk-terlaris"
                  className="font-bold text-base text-text flex items-center gap-8"
                >
                  <TrendingUp className="w-16 h-16 text-accent shrink-0" aria-hidden />
                  <span>Produk Terlaris</span>
                </h2>
                <p className="text-xs text-text-muted">
                  10 menu dengan kuantitas penjualan tertinggi
                </p>
              </div>
              <Link
                href="/laporan/produk"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-4 shrink-0 pt-2"
              >
                <span>Lihat lengkap</span>
                <ArrowRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>

            <div className="pt-12 min-w-0">
              {ordersState.status === 'loading' && (
                <div className="space-y-8" aria-busy="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="cg-skeleton h-[36px]" />
                  ))}
                </div>
              )}

              {ordersState.status === 'ready' && topProducts.length === 0 && (
                <div className="cg-empty py-24 text-center">
                  <p className="text-sm font-medium">Belum ada produk terjual.</p>
                  <p className="text-xs text-text-muted mt-2">
                    Transaksi lunas dalam rentang tanggal terpilih akan terdaftar di sini.
                  </p>
                </div>
              )}

              {ordersState.status === 'ready' && topProducts.length > 0 && (
                <div className="overflow-x-auto min-w-0">
                  <table className="w-full min-w-0 text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-8 pr-8 w-[24px]">#</th>
                        <th className="py-8 px-8">Menu / Produk</th>
                        <th className="py-8 px-8 text-right w-[48px]">Terjual</th>
                        <th className="py-8 pl-8 text-right w-[90px]">Total Penjualan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topProducts.map((p) => (
                        <tr key={p.productId} className="hover:bg-surface-raised transition-colors">
                          <td className="py-8 pr-8">
                            <span
                              className={`w-20 h-20 rounded-full flex items-center justify-center font-bold text-[11px] ${
                                p.rank === 1
                                  ? 'bg-accent text-on-accent'
                                  : p.rank <= 3
                                  ? 'bg-surface-raised border border-border text-text font-semibold'
                                  : 'text-text-muted'
                              }`}
                            >
                              {p.rank}
                            </span>
                          </td>
                          <td className="py-8 px-8 font-medium text-text break-words">
                            <div>{p.name}</div>
                            {p.percentSales ? (
                              <div className="text-[10px] text-text-muted">
                                {p.percentSales}% dari omzet
                              </div>
                            ) : null}
                          </td>
                          <td className="py-8 px-8 text-right font-semibold text-text whitespace-nowrap">
                            {p.qty}
                          </td>
                          <td className="py-8 pl-8 text-right font-semibold text-accent whitespace-nowrap">
                            {formatRp(p.totalSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Dihitung dari transaksi lunas</span>
            <span>Maksimal 10 produk</span>
          </div>
        </section>

        {/* KARTU 2: Laba Kotor per Produk (Fitur Segera) */}
        <section
          className="bg-surface border border-border rounded-lg p-20 flex flex-col justify-between min-w-0 space-y-16 opacity-90"
          aria-labelledby="heading-laba-kotor"
        >
          <div>
            <div className="flex items-start justify-between gap-12 pb-12 border-b border-border">
              <div className="space-y-4 min-w-0">
                <div className="flex flex-wrap items-center gap-8">
                  <h2
                    id="heading-laba-kotor"
                    className="font-bold text-base text-text flex items-center gap-8"
                  >
                    <DollarSign className="w-16 h-16 text-text-muted shrink-0" aria-hidden />
                    <span>Laba Kotor per Produk</span>
                  </h2>
                  <span className="cg-badge cg-badge--warning text-[10px] font-bold">
                    Segera
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  Perhitungan margin keuntungan kotor setelah HPP per produk
                </p>
              </div>
            </div>

            <div className="pt-16 space-y-16">
              <div className="cg-banner cg-banner--info text-xs">
                <div>
                  <p className="font-semibold text-sm">Sedang Disiapkan</p>
                  <p className="mt-4 leading-relaxed">
                    Laporan laba kotor per transaksi membutuhkan pelacakan Harga Pokok Penjualan (HPP) historis pada saat transaksi terjadi. Permintaan telah dicatat di sistem untuk pembaruan berikutnya.
                  </p>
                </div>
              </div>

              {/* Rintisan kartu nonaktif yang rapi */}
              <div className="p-16 border border-dashed border-border rounded-md bg-surface-raised space-y-12">
                <div className="flex items-center gap-8 text-text-muted text-xs">
                  <Clock className="w-14 h-14" aria-hidden />
                  <span>Rincian data yang akan ditampilkan:</span>
                </div>
                <ul className="text-xs text-text-muted space-y-6 list-disc pl-20">
                  <li>Harga jual rata-rata produk vs HPP bahan baku</li>
                  <li>Laba kotor nominal per unit terjual</li>
                  <li>Persentase margin laba per item (%)</li>
                  <li>Peringkat 10 menu penyumbang keuntungan terbesar</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Memerlukan rekonsiliasi HPP</span>
            <span>Akan hadir segera</span>
          </div>
        </section>

        {/* KARTU 3: Stok Terendah */}
        <section
          className="bg-surface border border-border rounded-lg p-20 flex flex-col justify-between min-w-0 space-y-16"
          aria-labelledby="heading-stok-terendah"
        >
          <div>
            <div className="flex items-start justify-between gap-12 pb-12 border-b border-border">
              <div className="space-y-4 min-w-0">
                <h2
                  id="heading-stok-terendah"
                  className="font-bold text-base text-text flex items-center gap-8"
                >
                  <Boxes className="w-16 h-16 text-accent shrink-0" aria-hidden />
                  <span>Stok Terendah</span>
                </h2>
                <p className="text-xs text-text-muted">
                  10 bahan baku dan barang dengan saldo sisa paling sedikit
                </p>
              </div>
              <Link
                href="/inventori/stok"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-4 shrink-0 pt-2"
              >
                <span>Lihat lengkap</span>
                <ArrowRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>

            <div className="pt-12 min-w-0">
              {stockState.status === 'loading' && (
                <div className="space-y-8" aria-busy="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="cg-skeleton h-[36px]" />
                  ))}
                </div>
              )}

              {stockState.status === 'ready' && topLowestStock.length === 0 && (
                <div className="cg-empty py-24 text-center">
                  <p className="text-sm font-medium">Belum ada data stok persediaan.</p>
                  <p className="text-xs text-text-muted mt-2">
                    Bahan baku yang dicatat di inventori akan muncul di sini.
                  </p>
                </div>
              )}

              {stockState.status === 'ready' && topLowestStock.length > 0 && (
                <div className="overflow-x-auto min-w-0">
                  <table className="w-full min-w-0 text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-8 pr-8 w-[24px]">#</th>
                        <th className="py-8 px-8">Nama Bahan / Barang</th>
                        <th className="py-8 px-8 text-right w-[60px]">Sisa</th>
                        <th className="py-8 pl-8 text-right w-[70px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topLowestStock.map((s) => (
                        <tr key={s.productId} className="hover:bg-surface-raised transition-colors">
                          <td className="py-8 pr-8 text-text-muted font-medium">
                            {s.rank}
                          </td>
                          <td className="py-8 px-8 font-medium text-text break-words">
                            <div>{s.name}</div>
                            <div className="text-[10px] text-text-muted">Satuan: {s.unit}</div>
                          </td>
                          <td className="py-8 px-8 text-right font-semibold text-text whitespace-nowrap">
                            {s.qty} {s.unit}
                          </td>
                          <td className="py-8 pl-8 text-right whitespace-nowrap">
                            <span
                              className={`cg-badge text-[10px] ${
                                s.status === 'out' || s.status === 'negative'
                                  ? 'cg-badge--danger'
                                  : s.status === 'low'
                                  ? 'cg-badge--warning'
                                  : 'cg-badge--accent'
                              }`}
                            >
                              {STOCK_STATUS_LABEL[s.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Urut sisa stok terkecil</span>
            <span>Maksimal 10 barang</span>
          </div>
        </section>

        {/* KARTU 4: Stok Mendekati Minimum */}
        <section
          className="bg-surface border border-border rounded-lg p-20 flex flex-col justify-between min-w-0 space-y-16"
          aria-labelledby="heading-stok-minimum"
        >
          <div>
            <div className="flex items-start justify-between gap-12 pb-12 border-b border-border">
              <div className="space-y-4 min-w-0">
                <h2
                  id="heading-stok-minimum"
                  className="font-bold text-base text-text flex items-center gap-8"
                >
                  <ShieldAlert className="w-16 h-16 text-warning shrink-0" aria-hidden />
                  <span>Stok Mendekati Minimum</span>
                </h2>
                <p className="text-xs text-text-muted">
                  Bahan baku yang perlu dipesan ulang berdasarkan batas aman
                </p>
              </div>
              <Link
                href="/inventori/stok"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-4 shrink-0 pt-2"
              >
                <span>Lihat lengkap</span>
                <ArrowRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>

            <div className="pt-12 min-w-0">
              {stockState.status === 'loading' && (
                <div className="space-y-8" aria-busy="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="cg-skeleton h-[36px]" />
                  ))}
                </div>
              )}

              {stockState.status === 'ready' && topMinStock.length === 0 && (
                <div className="cg-empty py-24 text-center">
                  <p className="text-sm font-medium">Seluruh stok dalam kondisi aman.</p>
                  <p className="text-xs text-text-muted mt-2">
                    Tidak ada persediaan yang berada di bawah batas minimum saat ini.
                  </p>
                </div>
              )}

              {stockState.status === 'ready' && topMinStock.length > 0 && (
                <div className="overflow-x-auto min-w-0">
                  <table className="w-full min-w-0 text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-8 pr-8 w-[24px]">#</th>
                        <th className="py-8 px-8">Nama Bahan</th>
                        <th className="py-8 px-8 text-right w-[65px]">Sisa / Min</th>
                        <th className="py-8 pl-8 text-right w-[70px]">Kondisi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topMinStock.map((s) => {
                        const diff = s.qty - (s.minQty ?? 0);
                        const isUnder = s.minQty != null && diff < 0;
                        return (
                          <tr key={s.productId} className="hover:bg-surface-raised transition-colors">
                            <td className="py-8 pr-8 text-text-muted font-medium">
                              {s.rank}
                            </td>
                            <td className="py-8 px-8 font-medium text-text break-words">
                              <div>{s.name}</div>
                              <div className="text-[10px] text-text-muted">
                                {s.minQty != null ? `Batas min: ${s.minQty} ${s.unit}` : 'Batas belum diatur'}
                              </div>
                            </td>
                            <td className="py-8 px-8 text-right font-semibold text-text whitespace-nowrap">
                              <div>{s.qty} {s.unit}</div>
                              {s.minQty != null && (
                                <div
                                  className={`text-[10px] ${
                                    isUnder ? 'text-danger font-semibold' : 'text-text-muted'
                                  }`}
                                >
                                  {isUnder ? `Kurang ${Math.abs(diff)}` : `Sisa ${diff}`}
                                </div>
                              )}
                            </td>
                            <td className="py-8 pl-8 text-right whitespace-nowrap">
                              <span
                                className={`cg-badge text-[10px] ${
                                  s.status === 'out' || s.status === 'negative'
                                    ? 'cg-badge--danger'
                                    : s.status === 'low'
                                    ? 'cg-badge--warning'
                                    : 'cg-badge--accent'
                                }`}
                              >
                                {STOCK_STATUS_LABEL[s.status]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Prioritas batas minimum</span>
            <span>Maksimal 10 bahan</span>
          </div>
        </section>

        {/* KARTU 5: Jenis Order Terbanyak */}
        <section
          className="bg-surface border border-border rounded-lg p-20 flex flex-col justify-between min-w-0 space-y-16 laptop:col-span-2 desktop:col-span-1"
          aria-labelledby="heading-jenis-order"
        >
          <div>
            <div className="flex items-start justify-between gap-12 pb-12 border-b border-border">
              <div className="space-y-4 min-w-0">
                <h2
                  id="heading-jenis-order"
                  className="font-bold text-base text-text flex items-center gap-8"
                >
                  <ShoppingBag className="w-16 h-16 text-accent shrink-0" aria-hidden />
                  <span>Jenis Order Terbanyak</span>
                </h2>
                <p className="text-xs text-text-muted">
                  Distribusi saluran pemesanan berdasarkan nilai total omzet
                </p>
              </div>
              <Link
                href="/laporan/jenis-order"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-4 shrink-0 pt-2"
              >
                <span>Lihat lengkap</span>
                <ArrowRight className="w-12 h-12" aria-hidden />
              </Link>
            </div>

            <div className="pt-12 min-w-0">
              {ordersState.status === 'loading' && (
                <div className="space-y-8" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="cg-skeleton h-[36px]" />
                  ))}
                </div>
              )}

              {ordersState.status === 'ready' && topOrderTypes.length === 0 && (
                <div className="cg-empty py-24 text-center">
                  <p className="text-sm font-medium">Belum ada transaksi pesanan.</p>
                  <p className="text-xs text-text-muted mt-2">
                    Transaksi dalam rentang tanggal terpilih akan terinci menurut saluran pesanannya.
                  </p>
                </div>
              )}

              {ordersState.status === 'ready' && topOrderTypes.length > 0 && (
                <div className="overflow-x-auto min-w-0">
                  <table className="w-full min-w-0 text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="py-8 pr-8 w-[24px]">#</th>
                        <th className="py-8 px-8">Saluran Pesanan</th>
                        <th className="py-8 px-8 text-right w-[60px]">Transaksi</th>
                        <th className="py-8 px-8 text-right w-[90px]">Total Omzet</th>
                        <th className="py-8 pl-8 text-right w-[50px]">Porsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topOrderTypes.map((t) => (
                        <tr key={t.type} className="hover:bg-surface-raised transition-colors">
                          <td className="py-8 pr-8 text-text-muted font-medium">
                            {t.rank}
                          </td>
                          <td className="py-8 px-8 font-semibold text-text whitespace-nowrap">
                            {t.label}
                          </td>
                          <td className="py-8 px-8 text-right font-medium text-text whitespace-nowrap">
                            {t.count} nota
                          </td>
                          <td className="py-8 px-8 text-right font-semibold text-accent whitespace-nowrap">
                            {formatRp(t.amount)}
                          </td>
                          <td className="py-8 pl-8 text-right font-medium text-text-muted whitespace-nowrap">
                            {t.percentSales != null ? `${t.percentSales}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Dihitung dari pesanan lunas</span>
            <span>Distribusi persentase omzet</span>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { formatRp, type Order, type OutletContext } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';

const TYPE_LABELS: Record<Order['type'], string> = {
  takeaway: 'Bawa pulang',
  dine_in: 'Makan di tempat',
  delivery: 'Antar',
  service: 'Jasa',
};

export function Sales({
  ctx,
  onClose,
}: {
  ctx: OutletContext;
  onClose: () => void;
}) {
  const data = useData();
  const [search, setSearch] = useState('');

  // Ambil pesanan lunas dari DataLayer
  const paidOrdersAsync = useAsync(
    () => data.listOrders({ status: 'paid', limit: 100 }),
    [data]
  );

  const orders = paidOrdersAsync.status === 'ready' ? paidOrdersAsync.data : [];

  // Hitung metrik ringkasan
  const totalSales = useMemo(
    () => orders.reduce((sum, o) => sum + o.total, 0),
    [orders]
  );
  const totalCount = orders.length;

  // Filter pencarian (nomor, nama pelanggan, atau label meja)
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        o.number.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.label && o.label.toLowerCase().includes(q))
    );
  }, [orders, search]);

  const formatHhmm = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-bg">
      {/* Header Halaman */}
      <header className="flex items-center gap-12 px-16 h-[var(--layout-pos-header,56px)] border-b border-border bg-surface-raised shrink-0">
        <button
          type="button"
          className="cg-btn cg-btn--ghost cg-btn--sm"
          onClick={onClose}
          aria-label="Kembali ke kasir"
        >
          <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
          <span>Kembali</span>
        </button>
        <h1 className="text-base font-bold text-text">Penjualan Hari Ini</h1>
        <button
          type="button"
          className="cg-btn cg-btn--secondary cg-btn--sm ml-auto"
          onClick={paidOrdersAsync.reload}
          title="Muat ulang data"
          aria-label="Muat ulang"
        >
          <RefreshCw className="cg-icon cg-icon--xs" aria-hidden />
          <span className="hidden tablet:inline">Muat ulang</span>
        </button>
      </header>

      {/* Konten Utama */}
      <div className="flex-1 p-16 max-w-[960px] w-full mx-auto space-y-16 overflow-y-auto">
        {/* Dua Kartu Ringkasan (Total Penjualan & Jumlah Transaksi) */}
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Total Penjualan
            </span>
            <div className="mt-8">
              <span className="text-2xl tablet:text-3xl font-extrabold text-accent tabular-nums">
                {formatRp(totalSales)}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Akumulasi seluruh transaksi lunas shift berjalan
            </p>
          </div>

          <div className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Jumlah Transaksi
            </span>
            <div className="mt-8">
              <span className="text-2xl tablet:text-3xl font-extrabold text-text tabular-nums">
                {totalCount} pesanan
              </span>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Rata-rata: {totalCount > 0 ? formatRp(Math.round(totalSales / totalCount)) : 'Rp 0'} / transaksi
            </p>
          </div>
        </div>

        {/* Kolom Pencarian */}
        <div className="flex items-center gap-12">
          <label className="cg-search flex-1 m-0">
            <Search className="cg-icon cg-icon--sm" aria-hidden />
            <span className="cg-sr">Cari transaksi</span>
            <input
              type="search"
              className="cg-input"
              placeholder="Cari nomor struk atau nama pelanggan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {/* Status Memuat / Galat / Kosong / Daftar Transaksi */}
        {paidOrdersAsync.status === 'loading' && (
          <div className="space-y-8" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[68px] rounded-lg" />
            ))}
          </div>
        )}

        {paidOrdersAsync.status === 'error' && (
          <div className="cg-banner cg-banner--danger" role="alert">
            <span>Daftar penjualan gagal dimuat. {paidOrdersAsync.message}</span>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={paidOrdersAsync.reload}
            >
              Coba lagi
            </button>
          </div>
        )}

        {paidOrdersAsync.status === 'ready' && filteredOrders.length === 0 && (
          <div className="cg-empty py-32 text-center bg-surface-raised rounded-xl border border-border">
            <ShoppingBag className="cg-icon cg-icon--lg mx-auto text-text-muted mb-8" />
            <h3 className="font-bold text-sm">
              {search ? 'Transaksi tidak ditemukan' : 'Belum ada transaksi penjualan hari ini'}
            </h3>
            <p className="text-xs text-text-muted mt-4">
              {search
                ? `Tidak ada transaksi yang cocok dengan kata kunci “${search}”.`
                : 'Transaksi yang telah diselesaikan di kasir akan muncul di sini.'}
            </p>
          </div>
        )}

        {paidOrdersAsync.status === 'ready' && filteredOrders.length > 0 && (
          <div className="border border-border rounded-xl bg-surface-raised overflow-hidden shadow-xs">
            <div className="p-12 border-b border-border bg-surface font-semibold text-xs text-text-muted uppercase tracking-wider">
              Daftar Transaksi Lunas ({filteredOrders.length})
            </div>
            <div className="divide-y divide-border">
              {filteredOrders.map((o) => {
                const methodsSummary =
                  o.payments.length > 0
                    ? o.payments
                        .map((p) => `${p.methodName} (${formatRp(p.amount)})`)
                        .join(', ')
                    : 'Lunas';

                const orderName =
                  o.label ||
                  (o.customerName ? `Pelanggan: ${o.customerName}` : null) ||
                  (o.tableId ? `Meja` : 'Pesanan Langsung');

                return (
                  <div
                    key={o.id}
                    className="p-12 tablet:p-16 flex flex-wrap items-center justify-between gap-12 hover:bg-surface/50 transition-colors"
                  >
                    {/* Kiri: Jenis, Nama, Nomor, Waktu */}
                    <div className="min-w-0 space-y-4">
                      <div className="flex items-center gap-8 flex-wrap">
                        <span className="cg-badge cg-badge--accent text-[11px]">
                          {TYPE_LABELS[o.type]}
                        </span>
                        <strong className="text-sm font-bold text-text font-mono">
                          {o.number}
                        </strong>
                        <span className="text-xs text-text-muted">
                          {formatHhmm(o.openedAt)} WIB
                        </span>
                      </div>
                      <p className="text-xs text-text font-medium truncate max-w-[280px] tablet:max-w-[450px]">
                        {orderName} · {o.items.reduce((sum, it) => sum + it.qty, 0)} item
                      </p>
                    </div>

                    {/* Kanan: Metode Pembayaran & Total Nominal */}
                    <div className="text-right shrink-0">
                      <span className="text-sm tablet:text-base font-extrabold text-text tabular-nums block">
                        {formatRp(o.total)}
                      </span>
                      <span className="text-[11px] text-text-muted block mt-2">
                        {methodsSummary}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

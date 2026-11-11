import type { Order } from './types';

export interface CustomerOrderStats {
  paidCount: number;
  totalSpend: number;
  lastOrderDate: string | null;
  voidCount: number;
  unpaidCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

/**
 * Menghitung ringkasan statistik belanja pelanggan dari daftar pesanan.
 */
export function computeCustomerOrderStats(orders: Order[], customerId: string): CustomerOrderStats {
  const customerOrders = orders.filter((o) => !o.customerId || o.customerId === customerId);
  const paidOrders = customerOrders.filter((o) => o.status === 'paid');
  const voidOrders = customerOrders.filter((o) => o.status === 'void');
  const unpaidOrders = customerOrders.filter((o) => o.status === 'open' || o.status === 'partially_paid');

  const totalSpend = paidOrders.reduce((sum, o) => sum + o.total, 0);

  // Ambil tanggal pesanan terakhir yang lunas atau pesanan apa pun
  const dates = customerOrders
    .map((o) => o.closedAt ?? o.openedAt)
    .filter(Boolean)
    .sort();
  const lastOrderDate = dates.length > 0 ? dates[dates.length - 1] ?? null : null;

  return {
    paidCount: paidOrders.length,
    totalSpend,
    lastOrderDate,
    voidCount: voidOrders.length,
    unpaidCount: unpaidOrders.length,
  };
}

/**
 * Menyaring riwayat pesanan pelanggan berdasarkan ID, pencarian teks (nomor pesanan), dan status.
 */
export function filterCustomerOrders(
  orders: Order[],
  customerId: string,
  search?: string,
  statusFilter?: string
): Order[] {
  const q = (search ?? '').trim().toLowerCase();
  return orders.filter((o) => {
    // Pastikan pesanan milik pelanggan ini (jika ada customerId)
    if (o.customerId && o.customerId !== customerId) {
      return false;
    }

    // Filter status jika dipilih
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'unpaid') {
        if (o.status !== 'open' && o.status !== 'partially_paid') return false;
      } else if (o.status !== statusFilter) {
        return false;
      }
    }

    // Filter pencarian nomor pesanan
    if (q && !o.number.toLowerCase().includes(q)) {
      return false;
    }

    return true;
  });
}

/**
 * Membagi daftar pesanan ke dalam halaman (pagination).
 */
export function paginateOrders<T>(
  items: T[],
  page: number,
  pageSize = 5
): PaginatedResult<T> {
  const safePageSize = Math.max(1, pageSize);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const start = (currentPage - 1) * safePageSize;
  const paginatedItems = items.slice(start, start + safePageSize);

  return {
    items: paginatedItems,
    totalCount,
    totalPages,
    currentPage,
    pageSize: safePageSize,
  };
}

/**
 * Memformat daftar metode pembayaran dari pesanan menjadi teks ringkas.
 */
export function formatOrderPaymentMethods(order: Order): string {
  if (!order.payments || order.payments.length === 0) {
    return '—';
  }
  const methods = order.payments.map((p) => p.methodName || p.kind);
  // Hilangkan duplikat nama metode
  const unique = Array.from(new Set(methods));
  return unique.join(', ');
}


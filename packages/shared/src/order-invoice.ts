// Jadikan invoice dari layar pembayaran kasir (A129/A146): pesanan yang belum dibayar menjadi faktur penjualan (piutang) untuk satu pelanggan.
import type { Order } from './types';
import type { SalesInvoiceInput, SalesInvoiceLineInput } from './sales-invoice';

/** Alasan pesanan belum bisa dijadikan invoice; null bila boleh. */
export function orderInvoiceProblem(o: Pick<Order, 'status' | 'paidTotal' | 'items' | 'customerId' | 'total'>): string | null {
  if (o.status !== 'open') return 'Hanya pesanan yang belum dibayar yang bisa dijadikan invoice.';
  if (o.paidTotal > 0) return 'Pesanan sudah ada pembayaran sebagian, jadi tidak bisa dijadikan invoice.';
  if (o.items.length === 0) return 'Pesanan kosong.';
  if (!o.customerId) return 'Pilih pelanggan pada pesanan dulu: invoice selalu ditujukan ke satu pelanggan.';
  if (!(o.total > 0)) return 'Total pesanan harus lebih dari nol.';
  return null;
}

/**
 * Susun faktur dari pesanan. Baris = item pesanan (harga satuan = total baris / jumlah, sudah termasuk ekstra dan potongan baris), ditambah biaya layanan bila ada.
 * Pajak = pajak pesanan. Selisih antara jumlah baris + pajak dan total pesanan (potongan order, pembulatan) dimasukkan sebagai diskon atau baris pembulatan,
 * sehingga total faktur selalu sama dengan total pesanan.
 */
export function orderToInvoiceInput(o: Order, opts: { id: string; termDays: number; note?: string }): SalesInvoiceInput {
  const lines: SalesInvoiceLineInput[] = o.items.map((it) => {
    const extras = it.extras?.length ? ` + ${it.extras.map((e) => e.name).join(', ')}` : '';
    return { name: `${it.name}${extras}`.slice(0, 120), qty: it.qty, unitPrice: Math.max(0, Math.round(it.lineTotal / it.qty)), ...(it.productId ? { productId: it.productId } : {}) };
  });
  if (o.serviceCharge > 0) lines.push({ name: 'Biaya layanan', qty: 1, unitPrice: Math.round(o.serviceCharge) });
  const sum = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0);
  const diff = sum + o.taxTotal - o.total;
  let discount = 0;
  if (diff > 0) discount = diff;
  else if (diff < 0) lines.push({ name: 'Pembulatan', qty: 1, unitPrice: -diff });
  return {
    id: opts.id, ...(o.customerId ? { customerId: o.customerId } : {}), termDays: opts.termDays, discount, taxAmount: o.taxTotal, downPayment: 0, lines,
    note: [`Dari pesanan ${o.number}`, opts.note?.trim()].filter(Boolean).join(' · ').slice(0, 300),
  };
}

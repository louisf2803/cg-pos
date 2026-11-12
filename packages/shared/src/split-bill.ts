import { resolveTieredPrice, type TieredPriceRule } from './tiered-pricing';
import type { Order } from './types';

/** Pisah tagihan per item: pilih berapa dari tiap baris yang dibayar sekarang; sisanya tetap di pesanan asal. */
export interface SplitLine {
  id: string;
  qty: number;
  productId?: string;
  unitPrice?: number;
  basePrice?: number;
  name?: string;
  extras?: unknown[];
}

export interface SplitResult<T extends SplitLine> {
  /** baris yang dibayar sekarang (id baru, jumlah = pilihan) */
  paid: T[];
  /** baris yang tetap di pesanan asal (id lama, jumlah = sisa) */
  remain: T[];
  /** pesan galat bila pilihan tidak sah; paid/remain kosong */
  problem: string | null;
}

export interface SplitOptions {
  /** Jika pesanan memiliki diskon tingkat order, pisah tagihan harus diblokir */
  hasOrderDiscount?: boolean;
  /** Aturan harga bertingkat/grosir per productId */
  tieredRules?: Record<string, TieredPriceRule[]>;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Memisahkan item pesanan dengan validasi ketat dan hitung ulang harga grosir bertingkat.
 *
 * @param lines daftar baris pesanan
 * @param picks jumlah per id baris (0 atau kosong = tidak dipilih). Tidak boleh melebihi jumlah baris.
 * @param makeId pembuat id baru untuk baris yang dipisah
 * @param options opsi tambahan: pemblokiran diskon order & hitung ulang harga grosir
 */
export function splitByItem<T extends SplitLine>(
  lines: T[],
  picks: Record<string, number>,
  makeId: () => string,
  options?: SplitOptions,
): SplitResult<T> {
  const bad = (problem: string): SplitResult<T> => ({ paid: [], remain: [], problem });

  if (options?.hasOrderDiscount) {
    return bad(
      'Pisah tagihan diblokir karena terdapat diskon di tingkat pesanan. Hapus diskon pesanan terlebih dahulu.',
    );
  }

  const known = new Set(lines.map((l) => l.id));
  for (const id of Object.keys(picks)) {
    if ((picks[id] ?? 0) !== 0 && !known.has(id)) {
      return bad('Ada item yang dipilih tidak ada di pesanan.');
    }
  }

  const paid: T[] = [];
  const remain: T[] = [];

  for (const l of lines) {
    const p = round3(picks[l.id] ?? 0);
    if (!Number.isFinite(p) || p < 0) return bad('Jumlah yang dipisah tidak sah.');
    if (p > l.qty) return bad('Jumlah yang dipisah melebihi yang dipesan.');

    const rules = (l.productId ? options?.tieredRules?.[l.productId] : undefined) ?? [];
    const base = l.basePrice ?? l.unitPrice ?? 0;

    if (p > 0) {
      let paidPrice = l.unitPrice;
      if (rules.length > 0 && Number.isFinite(base) && base > 0) {
        paidPrice = resolveTieredPrice(rules, p, base).unitPrice;
      }
      paid.push({
        ...l,
        id: makeId(),
        qty: p,
        unitPrice: paidPrice,
      });
    }

    const rest = round3(l.qty - p);
    if (rest > 0) {
      let remainPrice = l.unitPrice;
      if (rules.length > 0 && Number.isFinite(base) && base > 0) {
        remainPrice = resolveTieredPrice(rules, rest, base).unitPrice;
      }
      remain.push({
        ...l,
        qty: rest,
        unitPrice: remainPrice,
      });
    }
  }

  if (!paid.length) return bad('Pilih minimal satu item untuk dibayar sekarang.');
  if (!remain.length) return bad('Semua item dipilih. Tekan Bayar untuk membayar seluruh pesanan.');

  return { paid, remain, problem: null };
}

/** Ringkasan untuk cetak/tampilan Struk Gabungan dari pesanan-pesanan meja yang dipisah. */
export interface CombinedReceiptSummary {
  tableLabel: string;
  parts: {
    orderNumber: string;
    label?: string;
    itemCount: number;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    serviceCharge: number;
    total: number;
    status: string;
  }[];
  totalCombined: number;
  totalSubtotal: number;
  totalTax: number;
  totalServiceCharge: number;
  totalDiscount: number;
}

/**
 * Menyusun ringkasan struk gabungan untuk seluruh transaksi di meja yang sama.
 */
export function buildCombinedReceiptSummary(
  tableLabel: string,
  orders: Order[],
): CombinedReceiptSummary {
  const parts = orders.map((o) => ({
    orderNumber: o.number,
    label: o.label,
    itemCount: o.items.reduce((sum, i) => sum + i.qty, 0),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    taxTotal: o.taxTotal,
    serviceCharge: o.serviceCharge,
    total: o.total,
    status: o.status === 'paid' ? 'Lunas' : o.status === 'void' ? 'Batal' : 'Belum Lunas',
  }));

  return {
    tableLabel,
    parts,
    totalCombined: parts.reduce((sum, p) => sum + p.total, 0),
    totalSubtotal: parts.reduce((sum, p) => sum + p.subtotal, 0),
    totalTax: parts.reduce((sum, p) => sum + p.taxTotal, 0),
    totalServiceCharge: parts.reduce((sum, p) => sum + p.serviceCharge, 0),
    totalDiscount: parts.reduce((sum, p) => sum + p.discountTotal, 0),
  };
}

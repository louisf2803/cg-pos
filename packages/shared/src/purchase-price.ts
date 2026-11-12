// Pemetaan harga beli (migrasi 0043). Rancangan Claude atas arahan Louis (12 Nov 2026; Majoo tidak bisa dilihat).
// Mode 'manual' = harga diisi pengelola; 'last' = harga baris faktur pembelian terakhir yang tidak batal. Tanpa pengaturan = 'last'.
import type { PurchaseInvoice } from './purchasing';

export type PurchasePriceMode = 'manual' | 'last';

export interface PurchasePriceMapping { productId: string; mode: PurchasePriceMode; manualPrice?: number; manualUnitId?: string }
export interface PurchasePriceInput { productId: string; mode: PurchasePriceMode; price?: number | null; unitId?: string | null }

export type PurchasePriceSource = 'manual' | 'last' | 'none';
export interface PurchasePriceSuggestion {
  source: PurchasePriceSource;
  price?: number;
  unitId?: string;
  /** Hanya untuk source 'last'. */
  invoiceNumber?: string;
  invoiceDate?: string;
}

export const PURCHASE_PRICE_SOURCE_LABEL: Record<PurchasePriceSource, string> = {
  manual: 'Harga manual', last: 'Harga pembelian terakhir', none: 'Belum ada harga',
};

export function purchasePriceProblem(i: PurchasePriceInput): string | null {
  if (!i.productId) return 'Pilih barang.';
  if (i.mode !== 'manual' && i.mode !== 'last') return 'Mode harga harus manual atau pembelian terakhir.';
  if (i.mode === 'manual') {
    if (i.price === null || i.price === undefined || !Number.isFinite(i.price)) return 'Isi harga beli manual.';
    if (i.price < 0) return 'Harga tidak boleh negatif.';
    if (i.price > 1_000_000_000_000) return 'Harga terlalu besar.';
    if (Math.abs(i.price - Math.round(i.price * 1e4) / 1e4) > 1e-9) return 'Harga paling banyak 4 angka di belakang koma.';
  }
  return null;
}

/** Harga baris faktur terakhir (tidak batal) untuk satu barang; faktur terbaru menurut tanggal lalu urutan dalam daftar. */
export function pickLastPurchasePrice(invoices: PurchaseInvoice[], productId: string): PurchasePriceSuggestion {
  const sorted = [...invoices].filter((i) => i.status !== 'void').sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0));
  for (const inv of sorted) {
    const line = inv.lines.find((l) => l.productId === productId);
    if (line) return { source: 'last', price: line.unitPrice, unitId: line.unitId, invoiceNumber: inv.number, invoiceDate: inv.invoiceDate };
  }
  return { source: 'none' };
}

/** Gabungkan pemetaan dan faktur menjadi saran harga (sama dengan pos.purchase_price_suggest). */
export function suggestPurchasePrice(mapping: PurchasePriceMapping | undefined, invoices: PurchaseInvoice[], productId: string): PurchasePriceSuggestion {
  if (mapping?.mode === 'manual' && mapping.manualPrice !== undefined) {
    return { source: 'manual', price: mapping.manualPrice, ...(mapping.manualUnitId ? { unitId: mapping.manualUnitId } : {}) };
  }
  return pickLastPurchasePrice(invoices, productId);
}

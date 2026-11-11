import type { PurchaseLine } from './purchasing';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PurchaseReturnResolution = 'reduce_payable' | 'cash_refund' | 'replace_item';

export const RETURN_RESOLUTION_LABEL: Record<PurchaseReturnResolution, string> = {
  reduce_payable: 'Potong utang pemasok',
  cash_refund: 'Kembali tunai',
  replace_item: 'Tukar barang',
};

export interface PurchaseReturnLineInput {
  lineId: string;
  qty: number;
}

export interface PurchaseReturnLine extends PurchaseReturnLineInput {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseReturn {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  returnDate: string;
  resolution: PurchaseReturnResolution;
  reason: string;
  totalAmount: number;
  lines: PurchaseReturnLine[];
}

export interface PurchaseReturnInput {
  invoiceId: string;
  returnDate: string;
  resolution: PurchaseReturnResolution;
  reason: string;
  lines: PurchaseReturnLineInput[];
}

/** Hitung sisa jumlah maksimum suatu baris faktur yang masih boleh diretur. */
export function maxReturnableQty(receivedQty: number, previouslyReturnedQty: number): number {
  return Math.max(0, round4(receivedQty - previouslyReturnedQty));
}

/** Hitung total sudah diretur per lineId dari riwayat retur faktur yang sama. */
export function returnedQtyByLine(
  returns: readonly Pick<PurchaseReturn, 'invoiceId' | 'lines'>[],
  invoiceId: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const ret of returns) {
    if (ret.invoiceId !== invoiceId) continue;
    for (const line of ret.lines) {
      map.set(line.lineId, round4((map.get(line.lineId) ?? 0) + line.qty));
    }
  }
  return map;
}

/**
 * Validasi pengajuan retur pembelian terhadap baris faktur pembelian & retur sebelumnya.
 * Menolak jumlah negatif, > 4 desimal, atau melebihi sisa diterima dikurangi retur sebelumnya.
 */
export function purchaseReturnProblem(
  input: PurchaseReturnInput,
  invoiceLines: readonly Pick<PurchaseLine, 'id' | 'name' | 'receivedQty' | 'unitPrice'>[],
  previouslyReturnedByLine: ReadonlyMap<string, number>,
): string | null {
  if (!input.invoiceId) return 'Pilih faktur pembelian asal yang sudah menerima barang.';
  if (!input.returnDate) return 'Tanggal retur wajib diisi.';
  const reason = input.reason.trim();
  if (!reason) return 'Alasan retur wajib diisi.';
  if (reason.length > 200) return 'Alasan retur maksimal 200 karakter.';

  let positiveCount = 0;
  for (const item of input.lines) {
    if (!Number.isFinite(item.qty) || item.qty < 0) {
      return 'Jumlah retur tidak boleh negatif.';
    }
    if (round4(item.qty) !== item.qty) {
      return 'Jumlah retur paling banyak 4 angka di belakang koma.';
    }
    if (item.qty === 0) continue;

    positiveCount += 1;
    const invLine = invoiceLines.find((l) => l.id === item.lineId);
    if (!invLine) {
      return 'Baris barang pada faktur tidak ditemukan.';
    }
    const alreadyReturned = previouslyReturnedByLine.get(item.lineId) ?? 0;
    const maxQty = maxReturnableQty(invLine.receivedQty, alreadyReturned);
    if (item.qty > maxQty) {
      return `Jumlah retur ${invLine.name} (${item.qty}) melebihi sisa yang dapat diretur (${maxQty}).`;
    }
  }

  if (positiveCount === 0) {
    return 'Isi minimal satu barang dengan jumlah retur lebih dari 0.';
  }

  return null;
}

/** Hitung total nominal retur dari baris yang diretur. */
export function purchaseReturnTotal(
  lines: readonly PurchaseReturnLineInput[],
  invoiceLines: readonly Pick<PurchaseLine, 'id' | 'unitPrice'>[],
): number {
  let total = 0;
  for (const item of lines) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) continue;
    const invLine = invoiceLines.find((l) => l.id === item.lineId);
    if (!invLine) continue;
    total += round2(item.qty * invLine.unitPrice);
  }
  return round2(total);
}


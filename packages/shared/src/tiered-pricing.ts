export const MAX_TIERED_PRICE_TIERS = 5;

export interface CustomerGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerGroupMember {
  customerId: string;
  groupId: string;
  assignedAt: string;
}

export interface TieredPriceRule {
  tier: number;
  minQty: number;
  unitPrice: number;
}

export interface GroupProductTieredPricing {
  id?: string;
  groupId: string;
  productId: string;
  tiers: TieredPriceRule[];
  updatedAt: string;
}

export interface TieredPriceResolution {
  qty: number;
  basePrice: number;
  unitPrice: number;
  appliedTier: TieredPriceRule | null;
  isTiered: boolean;
  savingsPerUnit: number;
  totalPrice: number;
}

/** Mengurutkan baris harga bertingkat dari qty minimum terkecil dan menormalkan nomor tingkat 1..5. */
export function normalizeTieredPrices(tiers: readonly TieredPriceRule[]): TieredPriceRule[] {
  return [...tiers]
    .sort((a, b) => a.minQty - b.minQty || b.unitPrice - a.unitPrice)
    .slice(0, MAX_TIERED_PRICE_TIERS)
    .map((item, idx) => ({
      tier: idx + 1,
      minQty: Math.floor(item.minQty),
      unitPrice: Math.round(item.unitPrice),
    }));
}

/**
 * Memvalidasi daftar harga grosir bertingkat (maksimal 5 tingkat):
 * - Qty minimum harus naik di setiap tingkat berikutnya.
 * - Harga per unit harus turun di setiap tingkat berikutnya.
 */
export function validateTieredPrices(
  tiers: readonly Pick<TieredPriceRule, 'minQty' | 'unitPrice'>[],
  opts?: { basePrice?: number; allowEmpty?: boolean },
): string | null {
  if (!opts?.allowEmpty && tiers.length === 0) {
    return 'Tambahkan minimal 1 tingkat harga grosir.';
  }
  if (tiers.length > MAX_TIERED_PRICE_TIERS) {
    return `Maksimal ${MAX_TIERED_PRICE_TIERS} tingkat harga grosir per produk.`;
  }

  for (let i = 0; i < tiers.length; i += 1) {
    const row = tiers[i]!;
    if (!Number.isInteger(row.minQty) || row.minQty < 1) {
      return `Tingkat ${i + 1}: jumlah beli minimum harus bilangan bulat minimal 1.`;
    }
    if (!Number.isInteger(row.unitPrice) || row.unitPrice < 0) {
      return `Tingkat ${i + 1}: harga per unit harus bilangan bulat minimal Rp0.`;
    }
    if (
      opts?.basePrice !== undefined &&
      Number.isFinite(opts.basePrice) &&
      row.unitPrice > opts.basePrice
    ) {
      return `Tingkat ${i + 1}: harga grosir tidak boleh melebihi harga dasar produk.`;
    }
    if (i > 0) {
      const prev = tiers[i - 1]!;
      if (row.minQty <= prev.minQty) {
        return `Tingkat ${i + 1}: jumlah minimum harus lebih besar dari tingkat ${i} (${prev.minQty}).`;
      }
      if (row.unitPrice >= prev.unitPrice) {
        return `Tingkat ${i + 1}: harga per unit harus lebih rendah dari tingkat ${i}.`;
      }
    }
  }

  return null;
}

/** Menentukan harga satuan yang berlaku untuk jumlah pembelian tertentu. */
export function resolveTieredPrice(
  tiers: readonly TieredPriceRule[],
  qty: number,
  basePrice: number,
): TieredPriceResolution {
  const safeBase = Math.max(0, Math.round(Number.isFinite(basePrice) ? basePrice : 0));
  const safeQty = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));

  const ordered = [...tiers]
    .filter((t) => Number.isInteger(t.minQty) && t.minQty >= 1 && Number.isFinite(t.unitPrice) && t.unitPrice >= 0)
    .sort((a, b) => a.minQty - b.minQty);

  let matched: TieredPriceRule | null = null;
  for (const row of ordered) {
    if (safeQty >= row.minQty) {
      matched = row;
    } else {
      break;
    }
  }

  const unitPrice = matched ? Math.max(0, Math.round(matched.unitPrice)) : safeBase;
  const savingsPerUnit = matched ? Math.max(0, safeBase - unitPrice) : 0;

  return {
    qty: safeQty,
    basePrice: safeBase,
    unitPrice,
    appliedTier: matched,
    isTiered: matched !== null,
    savingsPerUnit,
    totalPrice: unitPrice * safeQty,
  };
}

/** Menetapkan satu pelanggan ke tepat satu grup (atau melepas keanggotaan jika groupId kosong). */
export function assignCustomerToGroup(
  members: readonly CustomerGroupMember[],
  customerId: string,
  groupId: string | null,
  assignedAt: string = new Date().toISOString(),
): CustomerGroupMember[] {
  const filtered = members.filter((m) => m.customerId !== customerId);
  if (!groupId) return filtered;
  return [...filtered, { customerId, groupId, assignedAt }];
}

/** Menghitung jumlah anggota pada tiap ID grup pelanggan. */
export function countGroupMembers(members: readonly CustomerGroupMember[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of members) {
    counts[m.groupId] = (counts[m.groupId] ?? 0) + 1;
  }
  return counts;
}


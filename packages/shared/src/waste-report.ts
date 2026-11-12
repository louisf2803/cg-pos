import type { StockItem, StockMoveEntry } from './stock';

export type WasteItemKindFilter = 'all' | StockItem['kind'];

export const WASTE_ITEM_KIND_LABEL: Record<StockItem['kind'], string> = {
  ingredient: 'Bahan baku',
  goods: 'Barang jual',
};

export interface WasteByProductRow {
  productId: string;
  productName: string;
  unit: string;
  itemKind?: StockItem['kind'];
  incidentCount: number;
  totalQty: number;
  totalValue: number;
}

export interface WasteSummary {
  incidentCount: number;
  totalValue: number;
  topProduct: WasteByProductRow | null;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Memetakan productId -> jenis barang ('goods' | 'ingredient') dari daftar stok aktif. */
export function buildStockKindMap(
  items: readonly Pick<StockItem, 'productId' | 'kind'>[],
): Record<string, StockItem['kind']> {
  const out: Record<string, StockItem['kind']> = {};
  for (const item of items) {
    out[item.productId] = item.kind;
  }
  return out;
}

/** Menyaring mutasi stok terbuang berdasarkan pencarian nama/alasan dan jenis barang. */
export function filterWasteMoves(
  moves: readonly StockMoveEntry[],
  kindByProductId: Readonly<Record<string, StockItem['kind']>>,
  opts: { search?: string; itemKind?: WasteItemKindFilter } = {},
): StockMoveEntry[] {
  const q = (opts.search ?? '').trim().toLowerCase();
  const wantedKind = opts.itemKind ?? 'all';
  return moves.filter((m) => {
    if (wantedKind !== 'all') {
      const k = kindByProductId[m.productId];
      if (k !== wantedKind) return false;
    }
    if (q) {
      const matchName = m.productName.toLowerCase().includes(q);
      const matchReason = (m.reason ?? '').toLowerCase().includes(q);
      if (!matchName && !matchReason) return false;
    }
    return true;
  });
}

/**
 * Menghitung ringkasan stok terbuang dan rekap per barang.
 * Kuantitas dan nilai memakai nilai mutlak karena mutasi keluar/terbuang bernilai negatif.
 * Tabel per barang diurutkan dari nilai terbuang terbesar.
 */
export function summarizeWasteMoves(
  moves: readonly StockMoveEntry[],
  kindByProductId: Readonly<Record<string, StockItem['kind']>> = {},
): { summary: WasteSummary; byProduct: WasteByProductRow[] } {
  const grouped = new Map<string, WasteByProductRow>();
  let totalValue = 0;

  for (const m of moves) {
    const absCost = Math.abs(m.totalCost);
    const absQty = Math.abs(m.qtyDelta);
    totalValue += absCost;

    const existing = grouped.get(m.productId);
    if (existing) {
      existing.incidentCount += 1;
      existing.totalQty = round4(existing.totalQty + absQty);
      existing.totalValue += absCost;
    } else {
      grouped.set(m.productId, {
        productId: m.productId,
        productName: m.productName,
        unit: m.unit,
        itemKind: kindByProductId[m.productId],
        incidentCount: 1,
        totalQty: round4(absQty),
        totalValue: absCost,
      });
    }
  }

  const byProduct = [...grouped.values()].sort((a, b) => {
    if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
    if (b.incidentCount !== a.incidentCount) return b.incidentCount - a.incidentCount;
    return a.productName.localeCompare(b.productName, 'id');
  });

  let topProduct: WasteByProductRow | null = null;
  for (const row of byProduct) {
    if (
      !topProduct ||
      row.incidentCount > topProduct.incidentCount ||
      (row.incidentCount === topProduct.incidentCount && row.totalValue > topProduct.totalValue)
    ) {
      topProduct = row;
    }
  }

  return {
    summary: {
      incidentCount: moves.length,
      totalValue,
      topProduct,
    },
    byProduct,
  };
}


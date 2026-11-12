import { formatRp } from './money';
import { marginPct, recipeCost, type RecipeIngredient, type RecipeProduct } from './recipe';
import type { Order, Product, Category } from './types';
import type { StockItem } from './stock';

export type HppCostSource = 'recipe_average' | 'recipe_buy_price' | 'recipe_incomplete' | 'stock_average' | 'none';

export const HPP_COST_SOURCE_LABEL: Record<HppCostSource, string> = {
  recipe_average: 'Resep (biaya rata-rata)',
  recipe_buy_price: 'Resep (harga beli bahan)',
  recipe_incomplete: 'Resep (biaya belum lengkap)',
  stock_average: 'Biaya rata-rata stok',
  none: 'Belum ada resep/biaya',
};

export interface ProductHppItem {
  id: string;
  name: string;
  sku?: string;
  categoryId: string | null;
  categoryName: string;
  kind: 'goods' | 'service' | 'bundle';
  isActive: boolean;

  // Satuan
  unitPrice: number;
  unitHpp: number;
  costSource: HppCostSource;
  unitMarginRp: number;
  unitMarginPct: number | null;

  // Penjualan Periode
  soldQty: number;
  totalSales: number;
  totalHpp: number;
  totalGrossMargin: number;
  totalMarginPct: number | null;
}

export interface HppReportSummary {
  productCount: number;
  withHppCount: number;
  withoutHppCount: number;
  thinMarginCount: number;
  negativeMarginCount: number;
  totalSoldQty: number;
  totalSales: number;
  totalHpp: number;
  totalGrossMargin: number;
  overallMarginPct: number | null;
}

export interface BuildHppReportParams {
  products: Product[];
  categories: Category[];
  recipes: RecipeProduct[];
  ingredients: RecipeIngredient[];
  stockItems?: StockItem[];
  orders?: Order[];
}

export function buildHppReport(params: BuildHppReportParams): {
  items: ProductHppItem[];
  summary: HppReportSummary;
} {
  const { products, categories, recipes, ingredients, stockItems = [], orders = [] } = params;

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const stockMap = new Map(stockItems.map((s) => [s.productId, s]));

  const salesMap = new Map<string, { qty: number; totalSales: number }>();
  for (const o of orders) {
    if (o.status !== 'paid') continue;
    for (const it of o.items) {
      const cur = salesMap.get(it.productId) ?? { qty: 0, totalSales: 0 };
      cur.qty += it.qty;
      cur.totalSales += it.lineTotal;
      salesMap.set(it.productId, cur);
    }
  }

  const items: ProductHppItem[] = products.map((p) => {
    const categoryName = p.categoryId && catMap.get(p.categoryId) ? catMap.get(p.categoryId)! : 'Tanpa Kategori';
    const recipe = recipeMap.get(p.id);
    const stock = stockMap.get(p.id);

    let unitHpp = 0;
    let costSource: HppCostSource = 'none';

    if (recipe && recipe.lines.length > 0) {
      const cost = recipeCost(recipe.lines, ingredientMap);
      unitHpp = cost.total;
      if (cost.unknownLines > 0) {
        costSource = 'recipe_incomplete';
      } else {
        const hasBuyPriceOnly = recipe.lines.some((l) => {
          const ing = ingredientMap.get(l.ingredientId);
          return ing?.costSource === 'buy_price';
        });
        costSource = hasBuyPriceOnly ? 'recipe_buy_price' : 'recipe_average';
      }
    } else if (stock && stock.avgCost > 0) {
      unitHpp = stock.avgCost;
      costSource = 'stock_average';
    }

    const unitPrice = p.price;
    const unitMarginRp = unitPrice - unitHpp;
    const unitMarginPct = marginPct(unitPrice, unitHpp);

    const sales = salesMap.get(p.id) ?? { qty: 0, totalSales: 0 };
    const soldQty = sales.qty;
    const totalSales = sales.totalSales;
    const totalHpp = Math.round(soldQty * unitHpp);
    const totalGrossMargin = totalSales - totalHpp;
    const totalMarginPct = totalSales > 0 ? Math.round(((totalSales - totalHpp) / totalSales) * 1000) / 10 : null;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryId: p.categoryId,
      categoryName,
      kind: p.kind ?? 'goods',
      isActive: p.isActive,
      unitPrice,
      unitHpp,
      costSource,
      unitMarginRp,
      unitMarginPct,
      soldQty,
      totalSales,
      totalHpp,
      totalGrossMargin,
      totalMarginPct,
    };
  });

  let totalSoldQty = 0;
  let totalSales = 0;
  let totalHpp = 0;
  let withHppCount = 0;
  let withoutHppCount = 0;
  let thinMarginCount = 0;
  let negativeMarginCount = 0;

  for (const it of items) {
    totalSoldQty += it.soldQty;
    totalSales += it.totalSales;
    totalHpp += it.totalHpp;

    if (it.costSource !== 'none' && it.unitHpp > 0) {
      withHppCount++;
    } else {
      withoutHppCount++;
    }

    if (it.unitMarginPct !== null) {
      if (it.unitMarginPct < 0) {
        negativeMarginCount++;
      } else if (it.unitMarginPct < 30) {
        thinMarginCount++;
      }
    }
  }

  const totalGrossMargin = totalSales - totalHpp;
  const overallMarginPct = totalSales > 0 ? Math.round(((totalSales - totalHpp) / totalSales) * 1000) / 10 : null;

  const summary: HppReportSummary = {
    productCount: items.length,
    withHppCount,
    withoutHppCount,
    thinMarginCount,
    negativeMarginCount,
    totalSoldQty,
    totalSales,
    totalHpp,
    totalGrossMargin,
    overallMarginPct,
  };

  return { items, summary };
}

export type HppFilterStatus = 'all' | 'with_hpp' | 'without_hpp' | 'thin_margin' | 'negative_margin';
export type HppSalesFilter = 'all' | 'sold_only';
export type HppSortField = 'margin_pct' | 'margin_rp' | 'hpp' | 'sold_qty' | 'sales' | 'name';
export type SortDirection = 'asc' | 'desc';

export function filterAndSortHppItems(
  items: ProductHppItem[],
  options: {
    search?: string;
    categoryId?: string;
    statusFilter?: HppFilterStatus;
    salesFilter?: HppSalesFilter;
    sortField?: HppSortField;
    sortDirection?: SortDirection;
  }
): ProductHppItem[] {
  const {
    search = '',
    categoryId = 'all',
    statusFilter = 'all',
    salesFilter = 'all',
    sortField = 'margin_pct',
    sortDirection = 'desc',
  } = options;

  const q = search.trim().toLowerCase();

  return items
    .filter((it) => {
      if (q && !it.name.toLowerCase().includes(q) && !(it.sku && it.sku.toLowerCase().includes(q))) {
        return false;
      }
      if (categoryId !== 'all' && it.categoryId !== categoryId) {
        return false;
      }
      if (salesFilter === 'sold_only' && it.soldQty <= 0) {
        return false;
      }
      if (statusFilter === 'with_hpp' && (it.costSource === 'none' || it.unitHpp <= 0)) {
        return false;
      }
      if (statusFilter === 'without_hpp' && it.costSource !== 'none' && it.unitHpp > 0) {
        return false;
      }
      if (statusFilter === 'thin_margin' && (it.unitMarginPct === null || it.unitMarginPct < 0 || it.unitMarginPct >= 30)) {
        return false;
      }
      if (statusFilter === 'negative_margin' && (it.unitMarginPct === null || it.unitMarginPct >= 0)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'margin_pct':
          cmp = (a.unitMarginPct ?? -999) - (b.unitMarginPct ?? -999);
          break;
        case 'margin_rp':
          cmp = a.unitMarginRp - b.unitMarginRp;
          break;
        case 'hpp':
          cmp = a.unitHpp - b.unitHpp;
          break;
        case 'sold_qty':
          cmp = a.soldQty - b.soldQty;
          break;
        case 'sales':
          cmp = a.totalSales - b.totalSales;
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name, 'id');
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
}

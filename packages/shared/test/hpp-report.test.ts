import { describe, expect, it } from 'vitest';
import { buildHppReport, filterAndSortHppItems } from '../src/hpp-report';
import type { Category, Order, Product, RecipeIngredient, RecipeProduct, StockItem } from '../src';

describe('buildHppReport', () => {
  const categories: Category[] = [
    { id: 'c1', name: 'Minuman' },
    { id: 'c2', name: 'Makanan' },
  ];

  const ingredients: RecipeIngredient[] = [
    { id: 'i1', name: 'Biji Kopi', baseUnit: 'gram', unitCost: 150, costSource: 'average', units: [{ unitId: 'u1', name: 'gram', factor: 1 }] },
    { id: 'i2', name: 'Susu', baseUnit: 'ml', unitCost: 20, costSource: 'average', units: [{ unitId: 'u2', name: 'ml', factor: 1 }] },
    { id: 'i3', name: 'Sirup Karamel', baseUnit: 'ml', unitCost: 50, costSource: 'buy_price', units: [{ unitId: 'u3', name: 'ml', factor: 1 }] },
  ];

  const recipes: RecipeProduct[] = [
    {
      id: 'p1',
      name: 'Kopi Susu',
      price: 20000,
      isActive: true,
      lines: [
        { ingredientId: 'i1', qty: 20, unitId: 'u1' }, // 20 * 150 = 3000
        { ingredientId: 'i2', qty: 150, unitId: 'u2' }, // 150 * 20 = 3000 -> Total HPP = 6000
      ],
    },
    {
      id: 'p2',
      name: 'Caramel Latte',
      price: 25000,
      isActive: true,
      lines: [
        { ingredientId: 'i1', qty: 20, unitId: 'u1' }, // 3000
        { ingredientId: 'i2', qty: 150, unitId: 'u2' }, // 3000
        { ingredientId: 'i3', qty: 30, unitId: 'u3' }, // 30 * 50 = 1500 -> Total HPP = 7500
      ],
    },
  ];

  const stockItems: StockItem[] = [
    { productId: 'p3', name: 'Keripik Kentang', kind: 'goods', unit: 'pcs', qty: 50, avgCost: 8000 },
  ];

  const products: Product[] = [
    { id: 'p1', name: 'Kopi Susu', price: 20000, categoryId: 'c1', kind: 'goods', isActive: true, sku: 'KPS-01' },
    { id: 'p2', name: 'Caramel Latte', price: 25000, categoryId: 'c1', kind: 'goods', isActive: true, sku: 'CRL-01' },
    { id: 'p3', name: 'Keripik Kentang', price: 12000, categoryId: 'c2', kind: 'goods', isActive: true, sku: 'KRP-01' },
    { id: 'p4', name: 'Produk Misterius', price: 10000, categoryId: null, kind: 'goods', isActive: true },
  ];

  const orders: Order[] = [
    {
      id: 'o1',
      number: 'ORD-001',
      type: 'dine_in',
      status: 'paid',
      openedAt: '2026-11-12T01:00:00Z',
      closedAt: '2026-11-12T01:10:00Z',
      subtotal: 52000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      total: 52000,
      paidTotal: 52000,
      items: [
        { id: 'it1', productId: 'p1', name: 'Kopi Susu', qty: 2, unitPrice: 20000, lineTotal: 40000 },
        { id: 'it2', productId: 'p3', name: 'Keripik Kentang', qty: 1, unitPrice: 12000, lineTotal: 12000 },
      ],
      payments: [],
    },
    {
      id: 'o2',
      number: 'ORD-002',
      type: 'takeaway',
      status: 'void', // should be excluded from sales
      openedAt: '2026-11-12T02:00:00Z',
      subtotal: 20000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      total: 20000,
      paidTotal: 0,
      items: [{ id: 'it3', productId: 'p1', name: 'Kopi Susu', qty: 1, unitPrice: 20000, lineTotal: 20000 }],
      payments: [],
    },
  ];

  it('computes unit HPP and gross margins correctly for recipes and direct stock', () => {
    const { items, summary } = buildHppReport({ products, categories, recipes, ingredients, stockItems, orders });

    expect(items).toHaveLength(4);

    const kopi = items.find((x) => x.id === 'p1')!;
    expect(kopi.unitHpp).toBe(6000);
    expect(kopi.costSource).toBe('recipe_average');
    expect(kopi.unitMarginRp).toBe(14000);
    expect(kopi.unitMarginPct).toBe(70);
    expect(kopi.soldQty).toBe(2);
    expect(kopi.totalSales).toBe(40000);
    expect(kopi.totalHpp).toBe(12000);
    expect(kopi.totalGrossMargin).toBe(28000);
    expect(kopi.totalMarginPct).toBe(70);

    const caramel = items.find((x) => x.id === 'p2')!;
    expect(caramel.unitHpp).toBe(7500);
    expect(caramel.costSource).toBe('recipe_buy_price');
    expect(caramel.soldQty).toBe(0);
    expect(caramel.unitMarginRp).toBe(17500);

    const keripik = items.find((x) => x.id === 'p3')!;
    expect(keripik.unitHpp).toBe(8000);
    expect(keripik.costSource).toBe('stock_average');
    expect(keripik.soldQty).toBe(1);
    expect(keripik.totalGrossMargin).toBe(4000);

    const unknown = items.find((x) => x.id === 'p4')!;
    expect(unknown.unitHpp).toBe(0);
    expect(unknown.costSource).toBe('none');

    expect(summary.totalSoldQty).toBe(3);
    expect(summary.totalSales).toBe(52000);
    expect(summary.totalHpp).toBe(20000);
    expect(summary.totalGrossMargin).toBe(32000);
    expect(summary.withHppCount).toBe(3);
    expect(summary.withoutHppCount).toBe(1);
  });

  it('filters and sorts items properly', () => {
    const { items } = buildHppReport({ products, categories, recipes, ingredients, stockItems, orders });

    // filter search
    const searched = filterAndSortHppItems(items, { search: 'kopi' });
    expect(searched).toHaveLength(1);
    expect(searched[0].id).toBe('p1');

    // filter category
    const catFiltered = filterAndSortHppItems(items, { categoryId: 'c2' });
    expect(catFiltered).toHaveLength(1);
    expect(catFiltered[0].id).toBe('p3');

    // filter sold only
    const soldOnly = filterAndSortHppItems(items, { salesFilter: 'sold_only' });
    expect(soldOnly).toHaveLength(2);

    // sort by margin % descending
    const sorted = filterAndSortHppItems(items, { sortField: 'margin_pct', sortDirection: 'desc' });
    expect(sorted[0].id).toBe('p4'); // 100% since HPP is 0
    expect(sorted[1].id).toBe('p1'); // 70%
    expect(sorted[2].id).toBe('p2'); // 70%
    expect(sorted[3].id).toBe('p3'); // 33.3%
  });
});

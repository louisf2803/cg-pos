import type { Employee, Order, Product } from './types';

export type CommissionRateType = 'percent' | 'fixed';

export interface CommissionGroup {
  id: string;
  name: string;
  rateType: CommissionRateType;
  /** Jika percent: 0 < nilai <= 100. Jika fixed: bilangan bulat rupiah per unit terjual. */
  rateValue: number;
  employeeIds: string[];
  categoryIds: string[];
  productIds: string[];
  isActive: boolean;
}

export interface CommissionEmployeeRow {
  employeeId: string;
  name: string;
  role: Employee['role'];
  commissionTotal: number;
  matchedSalesTotal: number;
  matchedQty: number;
  groupNames: string[];
}

export interface CommissionReport {
  rows: CommissionEmployeeRow[];
  totalCommission: number;
  totalMatchedSales: number;
  totalMatchedQty: number;
}

/** Validasi aturan grup komisi. Mengembalikan pesan kesalahan Bahasa Indonesia atau null. */
export function commissionGroupProblem(
  input: Pick<CommissionGroup, 'name' | 'rateType' | 'rateValue'>,
): string | null {
  const name = input.name.trim();
  if (!name) return 'Nama grup komisi wajib diisi.';
  if (name.length > 80) return 'Nama grup komisi maksimal 80 karakter.';
  if (!Number.isFinite(input.rateValue) || input.rateValue <= 0) {
    return 'Nilai tarif komisi harus lebih besar dari 0.';
  }
  if (input.rateType === 'percent' && input.rateValue > 100) {
    return 'Tarif persen komisi maksimal 100%.';
  }
  if (input.rateType === 'fixed' && !Number.isInteger(input.rateValue)) {
    return 'Tarif nominal per item harus berupa bilangan bulat rupiah.';
  }
  return null;
}

/** Periksa apakah sebuah produk termasuk ke dalam cakupan grup komisi. */
export function groupMatchesProduct(
  group: Pick<CommissionGroup, 'categoryIds' | 'productIds'>,
  productId: string,
  productCategoryMap: ReadonlyMap<string, string | null>,
): boolean {
  if (group.productIds.includes(productId)) return true;
  const catId = productCategoryMap.get(productId) ?? null;
  return Boolean(catId && group.categoryIds.includes(catId));
}

/**
 * Hitung laporan komisi per karyawan dari daftar pesanan nyata dan aturan grup komisi.
 * Produk yang tidak masuk ke grup aktif karyawan terkait menghasilkan komisi 0.
 */
export function computeCommissionReport(input: {
  groups: readonly CommissionGroup[];
  orders: readonly Order[];
  employees: readonly Employee[];
  products: readonly Pick<Product, 'id' | 'categoryId'>[];
}): CommissionReport {
  const activeGroups = input.groups.filter((g) => g.isActive);
  const productCategoryMap = new Map<string, string | null>();
  for (const p of input.products) {
    productCategoryMap.set(p.id, p.categoryId);
  }

  const acc = new Map<
    string,
    {
      employee: Employee;
      commissionTotal: number;
      matchedSalesTotal: number;
      matchedQty: number;
      groupNames: Set<string>;
    }
  >();

  for (const emp of input.employees) {
    const assigned = activeGroups
      .filter((g) => g.employeeIds.includes(emp.id))
      .map((g) => g.name);
    acc.set(emp.id, {
      employee: emp,
      commissionTotal: 0,
      matchedSalesTotal: 0,
      matchedQty: 0,
      groupNames: new Set(assigned),
    });
  }

  for (const order of input.orders) {
    if (order.status !== 'paid') continue;
    const entry = acc.get(order.cashierId);
    if (!entry) continue;

    for (const item of order.items) {
      const matchingGroups = activeGroups.filter(
        (g) =>
          g.employeeIds.includes(order.cashierId) &&
          groupMatchesProduct(g, item.productId, productCategoryMap),
      );
      if (matchingGroups.length === 0) continue;

      let itemCommission = 0;
      for (const g of matchingGroups) {
        entry.groupNames.add(g.name);
        if (g.rateType === 'percent') {
          itemCommission += Math.round((item.lineTotal * g.rateValue) / 100);
        } else {
          itemCommission += Math.round(g.rateValue * item.qty);
        }
      }

      entry.commissionTotal += itemCommission;
      entry.matchedSalesTotal += item.lineTotal;
      entry.matchedQty += item.qty;
    }
  }

  const rows: CommissionEmployeeRow[] = Array.from(acc.values())
    .map((item) => ({
      employeeId: item.employee.id,
      name: item.employee.name,
      role: item.employee.role,
      commissionTotal: item.commissionTotal,
      matchedSalesTotal: item.matchedSalesTotal,
      matchedQty: item.matchedQty,
      groupNames: Array.from(item.groupNames),
    }))
    .sort((a, b) => b.commissionTotal - a.commissionTotal || a.name.localeCompare(b.name));

  let totalCommission = 0;
  let totalMatchedSales = 0;
  let totalMatchedQty = 0;
  for (const row of rows) {
    totalCommission += row.commissionTotal;
    totalMatchedSales += row.matchedSalesTotal;
    totalMatchedQty += row.matchedQty;
  }

  return {
    rows,
    totalCommission,
    totalMatchedSales,
    totalMatchedQty,
  };
}


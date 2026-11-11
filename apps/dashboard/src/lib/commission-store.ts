import {
  groupMatchesProduct,
  type CommissionGroup,
  type Product,
} from '@cgpos/shared';

export const COMMISSION_GROUPS_STORAGE_KEY = 'cgpos_commission_groups';

export function loadCommissionGroups(): CommissionGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COMMISSION_GROUPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is CommissionGroup =>
        Boolean(g) &&
        typeof g.id === 'string' &&
        typeof g.name === 'string' &&
        (g.rateType === 'percent' || g.rateType === 'fixed') &&
        typeof g.rateValue === 'number' &&
        Array.isArray(g.employeeIds) &&
        Array.isArray(g.categoryIds) &&
        Array.isArray(g.productIds),
    );
  } catch {
    return [];
  }
}

export function saveCommissionGroups(groups: CommissionGroup[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMMISSION_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Ignore storage quota errors
  }
}

export function countGroupProducts(
  group: Pick<CommissionGroup, 'categoryIds' | 'productIds'>,
  products: readonly Pick<Product, 'id' | 'categoryId'>[],
): number {
  const catMap = new Map<string, string | null>();
  for (const p of products) catMap.set(p.id, p.categoryId);
  return products.filter((p) => groupMatchesProduct(group, p.id, catMap)).length;
}


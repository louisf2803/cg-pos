import { describe, expect, it } from 'vitest';
import {
  assignCustomerToGroup,
  countGroupMembers,
  normalizeTieredPrices,
  resolveTieredPrice,
  validateTieredPrices,
} from '../src/tiered-pricing';

describe('tiered-pricing', () => {
  it('validates qty increasing and unitPrice decreasing up to 5 tiers', () => {
    const valid = [
      { tier: 1, minQty: 5, unitPrice: 22000 },
      { tier: 2, minQty: 12, unitPrice: 20000 },
      { tier: 3, minQty: 24, unitPrice: 18500 },
      { tier: 4, minQty: 50, unitPrice: 17000 },
      { tier: 5, minQty: 100, unitPrice: 15500 },
    ];
    expect(validateTieredPrices(valid, { basePrice: 25000 })).toBeNull();

    // Reject more than 5 tiers
    expect(
      validateTieredPrices([...valid, { tier: 6, minQty: 200, unitPrice: 14000 }], { basePrice: 25000 }),
    ).toContain('Maksimal 5 tingkat');

    // Reject price not strictly decreasing
    expect(
      validateTieredPrices([
        { minQty: 5, unitPrice: 22000 },
        { minQty: 10, unitPrice: 22000 },
      ]),
    ).toContain('lebih rendah');

    // Reject qty not strictly increasing
    expect(
      validateTieredPrices([
        { minQty: 10, unitPrice: 22000 },
        { minQty: 10, unitPrice: 20000 },
      ]),
    ).toContain('lebih besar');

    // Reject tier price higher than base price
    expect(
      validateTieredPrices([{ minQty: 2, unitPrice: 30000 }], { basePrice: 25000 }),
    ).toContain('melebihi harga dasar');
  });

  it('resolves exact boundary qty and picks highest matching tier', () => {
    const tiers = normalizeTieredPrices([
      { tier: 2, minQty: 12, unitPrice: 20000 },
      { tier: 1, minQty: 5, unitPrice: 22000 },
      { tier: 3, minQty: 24, unitPrice: 18000 },
    ]);

    // Below minimum qty falls back to base price
    expect(resolveTieredPrice(tiers, 4, 25000)).toEqual({
      qty: 4,
      basePrice: 25000,
      unitPrice: 25000,
      appliedTier: null,
      isTiered: false,
      savingsPerUnit: 0,
      totalPrice: 100000,
    });

    // Exact boundary qty matches tier 1
    expect(resolveTieredPrice(tiers, 5, 25000).unitPrice).toBe(22000);
    expect(resolveTieredPrice(tiers, 5, 25000).appliedTier?.tier).toBe(1);

    // Between tier 1 and tier 2 still gets tier 1
    expect(resolveTieredPrice(tiers, 11, 25000).unitPrice).toBe(22000);

    // Exact boundary qty matches tier 2
    expect(resolveTieredPrice(tiers, 12, 25000).unitPrice).toBe(20000);
    expect(resolveTieredPrice(tiers, 12, 25000).savingsPerUnit).toBe(5000);

    // Beyond highest tier gets tier 3
    expect(resolveTieredPrice(tiers, 50, 25000).unitPrice).toBe(18000);
    expect(resolveTieredPrice(tiers, 50, 25000).totalPrice).toBe(900000);
  });

  it('keeps customer assigned to at most one group and counts accurately', () => {
    let members = assignCustomerToGroup([], 'c1', 'g-reseller', '2026-11-11T10:00:00Z');
    members = assignCustomerToGroup(members, 'c2', 'g-reseller', '2026-11-11T10:01:00Z');
    // Move c1 to g-vip
    members = assignCustomerToGroup(members, 'c1', 'g-vip', '2026-11-11T10:02:00Z');

    expect(members).toHaveLength(2);
    expect(countGroupMembers(members)).toEqual({
      'g-reseller': 1,
      'g-vip': 1,
    });

    // Remove c2 from group
    members = assignCustomerToGroup(members, 'c2', null);
    expect(countGroupMembers(members)).toEqual({ 'g-vip': 1 });
  });
});


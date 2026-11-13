import { describe, expect, it } from 'vitest';
import {
  resolveEffectivePrice,
  type CartPricingRules,
} from './cart';
import type { GroupProductTieredPricing, PriceSchedule } from '@cgpos/shared';

describe('cart pricing resolution', () => {
  const schedules: PriceSchedule[] = [
    {
      id: 'sch-1',
      productId: 'prod-kopi',
      newPrice: 18000,
      startAt: '2020-01-01T00:00:00Z',
      endAt: '2030-01-01T00:00:00Z',
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];

  const tieredPrices: GroupProductTieredPricing[] = [
    {
      id: 'tp-1',
      groupId: 'grp-reseller',
      productId: 'prod-kopi',
      tiers: [
        { tier: 1, minQty: 5, unitPrice: 15000 },
        { tier: 2, minQty: 10, unitPrice: 12000 },
      ],
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  it('uses base price when no schedule or customer group applies', () => {
    const price = resolveEffectivePrice('prod-kopi', 20000, 1);
    expect(price).toBe(20000);
  });

  it('applies scheduled price when schedule is active', () => {
    const rules: CartPricingRules = { schedules };
    const price = resolveEffectivePrice('prod-kopi', 20000, 1, rules);
    expect(price).toBe(18000);
  });

  it('applies tiered price based on quantity for customer group', () => {
    const rules: CartPricingRules = {
      schedules,
      tieredPrices,
      customerGroupId: 'grp-reseller',
    };

    // 1 item: below tier 1 (min 5), so uses scheduled price 18000
    expect(resolveEffectivePrice('prod-kopi', 20000, 1, rules)).toBe(18000);

    // 5 items: reaches tier 1, so 15000
    expect(resolveEffectivePrice('prod-kopi', 20000, 5, rules)).toBe(15000);

    // 12 items: reaches tier 2, so 12000
    expect(resolveEffectivePrice('prod-kopi', 20000, 12, rules)).toBe(12000);
  });
});

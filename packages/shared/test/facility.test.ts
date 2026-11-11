import { describe, expect, it } from 'vitest';
import {
  birthdayRuleProblem,
  buildBirthdayCustomersList,
  buildFacilityUsageReport,
  DEFAULT_BIRTHDAY_RULE,
  DEFAULT_LOYALTY_TIERS,
  facilityDraftProblem,
  isFacilityProduct,
  loyaltyTierProblem,
  normalizeFacilitySku,
  summarizeTierDistribution,
  tierForPoints,
  toFacilityReportCsv,
  type CatalogProduct,
  type Customer,
  type FacilityMeta,
  type Order,
} from '../src';

describe('facility helpers', () => {
  it('validates facility drafts and normalizes SKU', () => {
    expect(normalizeFacilitySku('  VIP-01  ')).toBe('VIP-01');
    expect(normalizeFacilitySku('   ')).toBeUndefined();

    expect(
      facilityDraftProblem({
        name: 'Ruang VIP 1',
        price: 75000,
        capacity: 8,
        unit: 'jam',
      })
    ).toBeNull();

    expect(
      facilityDraftProblem({
        name: '   ',
        price: 75000,
        capacity: 8,
        unit: 'jam',
      })
    ).toMatch(/Nama fasilitas/);

    expect(
      facilityDraftProblem({
        name: 'Meja Biliar',
        price: -1000,
        capacity: 4,
        unit: 'jam',
      })
    ).toMatch(/Tarif sewa/);

    expect(
      facilityDraftProblem({
        name: 'Ruang Meeting',
        price: 50000,
        capacity: 0,
        unit: 'sesi',
      })
    ).toMatch(/Kapasitas/);
  });

  it('detects facility products by metadata, FAS prefix, or Fasilitas category', () => {
    const meta: Record<string, FacilityMeta> = {
      f1: { capacity: 10, unit: 'jam' },
    };
    const catNames = new Map([
      ['cat-fas', 'Fasilitas VIP'],
      ['cat-svc', 'Jasa Kurir'],
    ]);

    expect(isFacilityProduct({ id: 'f1', kind: 'service', categoryId: null }, meta, catNames)).toBe(true);
    expect(isFacilityProduct({ id: 'f2', kind: 'service', sku: 'FAS-02', categoryId: null }, meta, catNames)).toBe(true);
    expect(isFacilityProduct({ id: 'f3', kind: 'service', categoryId: 'cat-fas' }, meta, catNames)).toBe(true);
    expect(isFacilityProduct({ id: 's1', kind: 'service', categoryId: 'cat-svc' }, meta, catNames)).toBe(false);
    expect(isFacilityProduct({ id: 'f1', kind: 'goods', categoryId: 'cat-fas' }, meta, catNames)).toBe(false);
  });

  it('aggregates facility usage revenue and exports BOM UTF-8 CSV', () => {
    const catalog: CatalogProduct[] = [
      {
        id: 'f-vip',
        name: 'Ruang VIP A',
        categoryId: 'cat-fas',
        kind: 'service',
        trackStock: false,
        isActive: true,
        isFavorite: false,
        price: 80000,
        sku: 'FAS-VIP',
        variants: [],
      },
      {
        id: 'f-bil',
        name: 'Meja Biliar 1',
        categoryId: 'cat-fas',
        kind: 'service',
        trackStock: false,
        isActive: false,
        isFavorite: false,
        price: 45000,
        sku: 'FAS-BIL',
        variants: [],
      },
    ];
    const meta: Record<string, FacilityMeta> = {
      'f-vip': { capacity: 8, unit: 'jam' },
      'f-bil': { capacity: 4, unit: 'jam' },
    };
    const orders = [
      {
        id: 'o1',
        status: 'paid',
        openedAt: '2026-11-10T04:00:00Z',
        closedAt: '2026-11-10T05:00:00Z',
        items: [
          { id: 'i1', productId: 'f-vip', name: 'Ruang VIP A', qty: 2, unitPrice: 80000, lineTotal: 160000 },
          { id: 'i2', productId: 'p-kopi', name: 'Latte', qty: 1, unitPrice: 24000, lineTotal: 24000 },
        ],
      },
      {
        id: 'o2',
        status: 'void',
        openedAt: '2026-11-10T06:00:00Z',
        closedAt: '2026-11-10T06:10:00Z',
        items: [{ id: 'i3', productId: 'f-vip', name: 'Ruang VIP A', qty: 5, unitPrice: 80000, lineTotal: 400000 }],
      },
      {
        id: 'o3',
        status: 'paid',
        openedAt: '2026-11-11T04:00:00Z',
        closedAt: '2026-11-11T05:00:00Z',
        items: [{ id: 'i4', productId: 'f-bil', name: 'Meja Biliar 1', qty: 3, unitPrice: 45000, lineTotal: 135000 }],
      },
    ] as unknown as Order[];

    const report = buildFacilityUsageReport(orders, catalog, meta, {
      timezone: 'Asia/Jakarta',
      from: '2026-11-10',
      to: '2026-11-11',
      categoryNames: new Map([['cat-fas', 'Fasilitas']]),
    });

    expect(report.summary.totalRevenue).toBe(295000);
    expect(report.summary.totalUsageCount).toBe(5);
    expect(report.summary.totalTransactions).toBe(2);
    expect(report.summary.registeredCount).toBe(2);
    expect(report.summary.activeCount).toBe(1);
    expect(report.summary.topFacility?.name).toBe('Ruang VIP A');
    expect(report.daily).toHaveLength(2);

    const csv = toFacilityReportCsv(report, '10-11 Nov 2026');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Ruang VIP A');
    expect(csv).toContain('160000');
  });

  it('validates loyalty tier groups and distributes customers accurately', () => {
    expect(loyaltyTierProblem({ name: 'Perunggu', minPoints: 0, earnMultiplier: 1 })).toBeNull();
    expect(
      loyaltyTierProblem({ name: 'perak', minPoints: 100, earnMultiplier: 1.5 }, DEFAULT_LOYALTY_TIERS)
    ).toMatch(/sudah ada/);

    expect(tierForPoints(0, DEFAULT_LOYALTY_TIERS)?.name).toBe('Perunggu');
    expect(tierForPoints(250, DEFAULT_LOYALTY_TIERS)?.name).toBe('Perak');
    expect(tierForPoints(1500, DEFAULT_LOYALTY_TIERS)?.name).toBe('Utama');

    const dist = summarizeTierDistribution(
      [
        { id: 'c1', pointsBalance: 10 },
        { id: 'c2', pointsBalance: 120 },
        { id: 'c3', pointsBalance: 600 },
      ],
      DEFAULT_LOYALTY_TIERS
    );
    expect(dist.rows.find((r) => r.tier.name === 'Perak')?.memberCount).toBe(1);
    expect(dist.rows.find((r) => r.tier.name === 'Emas')?.memberCount).toBe(1);
  });

  it('validates birthday rule and sorts customer birthdays accurately', () => {
    expect(birthdayRuleProblem(DEFAULT_BIRTHDAY_RULE)).toBeNull();
    expect(birthdayRuleProblem({ isActive: true, bonusPoints: 0, noteTemplate: 'Hai' })).toMatch(/Bonus poin/);

    const customers: Customer[] = [
      { id: 'c1', name: 'Dewi', birthDate: '1996-11-11', pointsBalance: 20, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'c2', name: 'Budi', birthDate: '1992-11-25', pointsBalance: 10, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'c3', name: 'Sari', birthDate: '1994-03-14', pointsBalance: 5, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'c4', name: 'Tanpa Tgl', pointsBalance: 0, createdAt: '2026-01-01T00:00:00Z' },
    ];

    const list = buildBirthdayCustomersList(customers, '2026-11-11', { c2: 2026 });
    expect(list).toHaveLength(3);
    expect(list[0]!.customer.id).toBe('c1');
    expect(list[0]!.isToday).toBe(true);
    expect(list[0]!.ageThisYear).toBe(30);
    expect(list[1]!.isThisMonth).toBe(true);
    expect(list[1]!.alreadyGrantedThisYear).toBe(true);
    expect(list[2]!.isThisMonth).toBe(false);
  });
});


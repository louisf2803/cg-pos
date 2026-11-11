import { describe, expect, it } from 'vitest';
import {
  buildWarehouseQueue,
  computeSatisfactionSummary,
  customerCustomFieldProblem,
  customerPolicyProblem,
  DEFAULT_CUSTOMER_CUSTOM_FIELDS,
  DEFAULT_CUSTOMER_POLICY,
  evaluateCustomerCompleteness,
  SAMPLE_SATISFACTION_ITEMS,
  type Customer,
  type StockItem,
} from '../src';

describe('customer config, satisfaction summary, and warehouse queue', () => {
  it('validates custom customer fields and forbids PIN/password columns', () => {
    expect(
      customerCustomFieldProblem({
        label: 'Ukuran cangkir favorit',
        fieldType: 'text',
        options: [],
      })
    ).toBeNull();

    expect(
      customerCustomFieldProblem({
        label: 'PIN Member Rahasia',
        fieldType: 'text',
        options: [],
      })
    ).toMatch(/keamanan/i);

    expect(
      customerCustomFieldProblem(
        {
          label: 'Preferensi seduh',
          fieldType: 'select',
          options: ['A'],
        },
        DEFAULT_CUSTOMER_CUSTOM_FIELDS
      )
    ).toMatch(/sudah ada/i);

    expect(
      customerCustomFieldProblem({
        label: 'Tingkat Pedas',
        fieldType: 'select',
        options: ['Sedang'],
      })
    ).toMatch(/minimal 2 opsi/);
  });

  it('validates customer policy bounds and evaluates completeness', () => {
    expect(customerPolicyProblem(DEFAULT_CUSTOMER_POLICY)).toBeNull();
    expect(
      customerPolicyProblem({ ...DEFAULT_CUSTOMER_POLICY, customerIdPrefix: '!' })
    ).toMatch(/Prefiks ID pelanggan/);
    expect(
      customerPolicyProblem({ ...DEFAULT_CUSTOMER_POLICY, birthdayReminderDaysBefore: 45 })
    ).toMatch(/0 sampai 30/);

    const customers: Customer[] = [
      { id: '1', name: 'A', phone: '0812', email: 'a@test.id', pointsBalance: 0, createdAt: '2026-01-01T00:00:00Z' },
      { id: '2', name: 'B', birthDate: '1995-05-05', pointsBalance: 0, createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(evaluateCustomerCompleteness(customers)).toEqual({
      total: 2,
      withPhone: 1,
      withEmail: 1,
      withBirthDate: 1,
      missingPhoneCount: 1,
    });
  });

  it('computes satisfaction rating distribution and top tags', () => {
    const sum = computeSatisfactionSummary(SAMPLE_SATISFACTION_ITEMS);
    expect(sum.totalCount).toBe(5);
    expect(sum.avgScore).toBe(4.4);
    expect(sum.satisfiedPct).toBe(80);
    expect(sum.byRating[0]).toEqual({ score: 5, count: 3, pct: 60 });
    expect(sum.topTags[0]?.count).toBeGreaterThanOrEqual(2);
  });

  it('prioritizes out and low stock items in warehouse queue', () => {
    const items: StockItem[] = [
      { productId: '1', name: 'Gula Aren', kind: 'ingredient', unit: 'kg', qty: 10, avgCost: 20000, value: 200000, status: 'ok', categoryId: 'cat-1', categoryName: 'Pemanis' },
      { productId: '2', name: 'Susu Oat', kind: 'ingredient', unit: 'L', qty: 1, avgCost: 30000, value: 30000, minQty: 5, status: 'low', categoryId: 'cat-2', categoryName: 'Susu' },
      { productId: '3', name: 'Biji Arabika', kind: 'goods', unit: 'kg', qty: 0, avgCost: 150000, value: 0, minQty: 2, status: 'out' },
    ];

    const urgent = buildWarehouseQueue(items, 'low_or_out', '');
    expect(urgent.summary.outCount).toBe(1);
    expect(urgent.summary.lowCount).toBe(1);
    expect(urgent.rows.map((r) => r.name)).toEqual(['Biji Arabika', 'Susu Oat']);

    const searchByCat = buildWarehouseQueue(items, 'all', 'susu', 'cat-2');
    expect(searchByCat.rows).toHaveLength(1);
    expect(searchByCat.rows[0]?.name).toBe('Susu Oat');
  });
});


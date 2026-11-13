import { describe, expect, it } from 'vitest';
import { qrisCounts, qrisTab, qrisTotals, type GatewayTransaction } from '../src/qris-report';

const tx = (status: string, amount: number, fee: number): GatewayTransaction => ({ id: status + amount, outletName: 'O', reference: 'R', amount, fee, status, createdAt: '2026-11-13T00:00:00Z' });

describe('laporan QRIS', () => {
  it('memetakan status gateway ke tab', () => {
    expect(qrisTab('paid')).toBe('success');
    for (const s of ['failed', 'expired', 'cancelled']) expect(qrisTab(s)).toBe('failed');
    expect(qrisTab('created')).toBe('processing');
    expect(qrisTab('pending')).toBe('pending');
    expect(qrisTab('refunded')).toBe('pending');
  });
  it('total, biaya, dan bersih', () => {
    expect(qrisTotals([tx('paid', 10000, 70), tx('paid', 20000, 140)])).toEqual({ count: 2, amount: 30000, fee: 210, net: 29790 });
    expect(qrisTotals([])).toEqual({ count: 0, amount: 0, fee: 0, net: 0 });
  });
  it('hitungan per tab', () => {
    expect(qrisCounts([tx('paid', 1, 0), tx('failed', 1, 0), tx('expired', 1, 0), tx('created', 1, 0)])).toEqual({ success: 1, failed: 2, processing: 1, pending: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  computePaymentFee,
  DEFAULT_ONLINE_CHANNELS,
  inferPaymentChannel,
  mergeOnlineChannels,
  mergePaymentMethodConfigs,
  onlineChannelProblem,
  paymentMethodProblem,
  summarizeOnlineChannels,
  type PaymentMethod,
  type PaymentMethodConfig,
} from '../src';

describe('payment methods and CG Order channel helpers', () => {
  it('infers channels and keeps built-in QRIS gateway inactive in preview', () => {
    const serverMethods: PaymentMethod[] = [
      { id: 'm-cash', code: 'CASH', name: 'Tunai', kind: 'cash', requiresOnline: false },
      { id: 'm-qris', code: 'QRIS', name: 'QRIS', kind: 'gateway', requiresOnline: true },
      { id: 'm-edc', code: 'EDC', name: 'Kartu', kind: 'noncash', requiresOnline: false },
      { id: 'm-trf', code: 'TRF', name: 'Transfer bank', kind: 'noncash', requiresOnline: false },
    ];

    expect(inferPaymentChannel(serverMethods[0]!)).toBe('cash');
    expect(inferPaymentChannel(serverMethods[1]!)).toBe('qris');
    expect(inferPaymentChannel(serverMethods[2]!)).toBe('edc');
    expect(inferPaymentChannel(serverMethods[3]!)).toBe('va');

    const custom: PaymentMethodConfig[] = [
      {
        id: 'pm-ew1',
        code: 'OVO_KASIR',
        name: 'Dompet Digital Konter',
        channel: 'ewallet',
        baseKind: 'noncash',
        isActive: true,
        feePct: 0.7,
        feeFixed: 0,
        requiresOnline: false,
        isBuiltIn: false,
      },
    ];

    const merged = mergePaymentMethodConfigs(
      serverMethods,
      {
        'm-qris': { isActive: true, feePct: 0.7 },
        'm-edc': { feePct: 1.5, feeFixed: 500 },
      },
      custom
    );

    expect(merged).toHaveLength(5);
    expect(merged.find((m) => m.id === 'm-qris')?.isActive).toBe(false);
    expect(merged.find((m) => m.id === 'm-edc')?.feePct).toBe(1.5);
    expect(merged.find((m) => m.id === 'pm-ew1')?.channel).toBe('ewallet');
  });

  it('validates payment method fields and calculates integer Rupiah MDR fees', () => {
    expect(
      paymentMethodProblem({
        name: 'EDC BCA',
        code: 'EDC_BCA',
        channel: 'edc',
        feePct: 1.5,
        feeFixed: 1000,
      })
    ).toBeNull();

    expect(
      paymentMethodProblem({
        name: 'Bad Code',
        code: 'invalid code!',
        channel: 'edc',
        feePct: 0,
        feeFixed: 0,
      })
    ).toMatch(/Kode metode/);

    expect(
      paymentMethodProblem({
        name: 'MDR Kelebihan',
        code: 'MDR99',
        channel: 'edc',
        feePct: 40,
        feeFixed: 0,
      })
    ).toMatch(/25%/);

    expect(computePaymentFee(100000, { feePct: 1.5, feeFixed: 500 })).toEqual({
      fee: 2000,
      net: 98000,
    });
    expect(computePaymentFee(0, { feePct: 1.5, feeFixed: 500 })).toEqual({
      fee: 0,
      net: 0,
    });
  });

  it('merges CG Order channels cleanly without vendor leakage and summarizes readiness', () => {
    const merged = mergeOnlineChannels([
      { id: 'delivery', status: 'active', prepMinutes: 15, priceMarkupPct: 20 },
    ]);

    expect(merged).toHaveLength(DEFAULT_ONLINE_CHANNELS.length);
    for (const ch of merged) {
      expect(ch.name.toLowerCase()).not.toContain('majoo');
      expect(ch.description.toLowerCase()).not.toContain('majoo');
    }

    const summary = summarizeOnlineChannels(merged);
    expect(summary.total).toBe(5);
    expect(summary.activeCount).toBe(3);
    expect(summary.pausedCount).toBe(0);
    expect(summary.setupCount).toBe(2);

    expect(
      onlineChannelProblem({
        name: 'CG Order QR Meja',
        prepMinutes: 0,
        priceMarkupPct: 0,
        openHours: '08:00 - 22:00',
      })
    ).toMatch(/persiapan/);
  });
});


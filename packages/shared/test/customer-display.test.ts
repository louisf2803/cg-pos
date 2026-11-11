import { describe, expect, it } from 'vitest';
import {
  buildCustomerDisplayUrl,
  createIdleCustomerDisplaySnapshot,
  customerDisplayItemCount,
  isCustomerDisplayUrl,
  parseCustomerDisplaySnapshot,
} from '../src';

describe('customer-display', () => {
  it('mengenali dan menyusun URL layar pelanggan tanpa kehilangan origin', () => {
    expect(isCustomerDisplayUrl('')).toBe(false);
    expect(isCustomerDisplayUrl('?foo=bar')).toBe(false);
    expect(isCustomerDisplayUrl('?display=customer')).toBe(true);
    expect(buildCustomerDisplayUrl('https://pos.cg.local/pos/?outlet=1')).toBe(
      'https://pos.cg.local/pos/?outlet=1&display=customer',
    );
  });

  it('membuat snapshot idle dan memvalidasi deserialisasi JSON secara aman', () => {
    const snap = createIdleCustomerDisplaySnapshot('Kopi Contoh', {
      outletAddress: 'Jl. Melati No. 1',
      cashierName: 'Sari',
      welcomeMessage: 'Selamat datang!',
      updatedAt: '2026-11-12T02:00:00.000Z',
    });
    expect(snap.phase).toBe('idle');
    expect(parseCustomerDisplaySnapshot(JSON.stringify(snap))).toEqual(snap);
    expect(parseCustomerDisplaySnapshot('rusak')).toBeNull();
    expect(parseCustomerDisplaySnapshot(JSON.stringify({ version: 2 }))).toBeNull();
  });

  it('menghitung jumlah unit pada daftar baris layar pelanggan', () => {
    expect(
      customerDisplayItemCount([
        { id: '1', name: 'Kopi Tubruk', qty: 2, unitPrice: 15_000, lineTotal: 30_000 },
        { id: '2', name: 'Roti Bakar', qty: 1, unitPrice: 18_000, lineTotal: 18_000 },
      ]),
    ).toBe(3);
  });
});


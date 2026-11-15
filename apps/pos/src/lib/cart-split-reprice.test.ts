import { describe, expect, it } from 'vitest';
import { splitByItem } from '@cgpos/shared';
import { repriceLines, type CartLine } from './cart';

const tiers = [{ groupId: 'g1', productId: 'p1', updatedAt: '', tiers: [{ tier: 1, minQty: 1, unitPrice: 10000 }, { tier: 2, minQty: 5, unitPrice: 8000 }] }];
const rules = { customerGroupId: 'g1', tieredPrices: tiers };
const line = (o: Partial<CartLine>): CartLine => ({ id: 'a', productId: 'p1', name: 'Kopi', qty: 6, unitPrice: 8000, basePrice: 8000, listPrice: 10000, extras: [], ...o }) as CartLine;

describe('hitung ulang harga setelah pisah tagihan', () => {
  it('bagian yang turun di bawah batas grosir kembali ke harga tingkat bawah', () => {
    const r = splitByItem([line({})], { a: 2 }, () => 'n');
    const paid = repriceLines(r.paid, rules); const remain = repriceLines(r.remain, rules);
    expect(paid[0]!.unitPrice).toBe(10000); // 2 pcs: belum tingkat 2
    expect(remain[0]!.unitPrice).toBe(10000); // 4 pcs: tingkat 2 butuh minimal 5
  });
  it('baris berharga manual tidak disentuh', () => {
    const l = line({ manualPrice: true, unitPrice: 7000, basePrice: 7000 });
    expect(repriceLines([{ ...l, qty: 1 }], rules)[0]!.unitPrice).toBe(7000);
  });
});

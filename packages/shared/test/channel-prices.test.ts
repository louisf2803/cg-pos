import { describe, expect, it } from 'vitest';
import { channelPriceProblem, createFakePriceRules, effectiveTimedPrice, priceRuleError, timePriceProblem, timeRulesOverlap, type TimePriceInput } from '../src/channel-prices';

const rule = (id: string, days: number[], s: string, e: string, price = 1000, isActive = true, productId = 'p1'): TimePriceInput => ({ id, productId, days, startTime: s, endTime: e, price, isActive });
const mk = () => createFakePriceRules({ productExists: async (id) => id.startsWith('p') });

describe('validasi harga', () => {
  it('harga kanal bilangan bulat tidak negatif', () => {
    expect(channelPriceProblem(25000)).toBeNull();
    expect(channelPriceProblem(-1)).toMatch(/tidak negatif/);
    expect(channelPriceProblem(10.5)).toMatch(/bilangan bulat/);
  });
  it('aturan waktu: hari, format jam, urutan jam', () => {
    expect(timePriceProblem(rule('a', [1, 2], '15:00', '17:00'))).toBeNull();
    expect(timePriceProblem(rule('a', [], '15:00', '17:00'))).toMatch(/minimal satu hari/);
    expect(timePriceProblem(rule('a', [1, 1], '15:00', '17:00'))).toMatch(/Hari tidak valid/);
    expect(timePriceProblem(rule('a', [8], '15:00', '17:00'))).toMatch(/Hari tidak valid/);
    expect(timePriceProblem(rule('a', [1], '3pm', '17:00'))).toMatch(/JJ:MM/);
    expect(timePriceProblem(rule('a', [1], '17:00', '15:00'))).toMatch(/setelah jam mulai/);
  });
  it('terjemahan galat server', () => {
    expect(priceRuleError({ message: 'overlapping rule' }).message).toMatch(/bertabrakan/);
    expect(priceRuleError({ message: 'not allowed' }).code).toBe('forbidden');
  });
});

describe('tumpang tindih dan harga berlaku', () => {
  it('beririsan hanya bila hari dan jam sama-sama beririsan; batas jam tidak dihitung', () => {
    expect(timeRulesOverlap(rule('a', [1, 2], '15:00', '17:00'), rule('b', [2, 3], '16:00', '18:00'))).toBe(true);
    expect(timeRulesOverlap(rule('a', [1], '15:00', '17:00'), rule('b', [2], '15:00', '17:00'))).toBe(false);
    expect(timeRulesOverlap(rule('a', [1], '15:00', '17:00'), rule('b', [1], '17:00', '19:00'))).toBe(false);
    expect(timeRulesOverlap(rule('a', [1], '15:00', '17:00'), rule('b', [1], '16:00', '18:00', 1, false))).toBe(false);
    expect(timeRulesOverlap(rule('a', [1], '15:00', '17:00'), rule('b', [1], '16:00', '18:00', 1, true, 'p2'))).toBe(false);
  });
  it('harga berlaku pada hari dan jam yang cocok, jam akhir tidak termasuk', () => {
    const rules = [{ ...rule('a', [1, 2, 3, 4, 5], '15:00', '17:00', 20000), startTime: '15:00:00', endTime: '17:00:00' }];
    expect(effectiveTimedPrice(rules, 'p1', 3, '15:00')).toBe(20000);
    expect(effectiveTimedPrice(rules, 'p1', 3, '16:59')).toBe(20000);
    expect(effectiveTimedPrice(rules, 'p1', 3, '17:00')).toBeNull();
    expect(effectiveTimedPrice(rules, 'p1', 6, '16:00')).toBeNull();
    expect(effectiveTimedPrice(rules, 'p2', 3, '16:00')).toBeNull();
  });
});

describe('penyimpanan demo', () => {
  it('harga kanal: simpan ulang mengubah, hapus, produk tak dikenal ditolak', async () => {
    const s = mk();
    await s.saveChannelPrice('p1', 'gofood', 25000);
    await s.saveChannelPrice('p1', 'gofood', 27000);
    expect(await s.listChannelPrices()).toEqual([{ productId: 'p1', channel: 'gofood', price: 27000 }]);
    await expect(s.saveChannelPrice('x', 'gofood', 1)).rejects.toThrow(/Produk/);
    await s.deleteChannelPrice('p1', 'gofood');
    expect(await s.listChannelPrices()).toEqual([]);
  });
  it('aturan waktu: tumpang tindih ditolak, ubah dengan id sama boleh, nonaktif tidak bertabrakan', async () => {
    const s = mk();
    await s.saveTimePrice(rule('a', [1, 2], '15:00', '17:00', 20000));
    await expect(s.saveTimePrice(rule('b', [2], '16:00', '18:00'))).rejects.toThrow(/bertabrakan/);
    await s.saveTimePrice(rule('b', [2], '17:00', '18:00'));
    await s.saveTimePrice(rule('c', [2], '16:00', '18:00', 1, false));
    await s.saveTimePrice(rule('a', [1, 2], '15:00', '16:30', 21000));
    const list = await s.listTimePrices();
    expect(list).toHaveLength(3);
    expect(list.find((r) => r.id === 'a')).toMatchObject({ endTime: '16:30', price: 21000 });
    await s.deleteTimePrice('c');
    expect(await s.listTimePrices()).toHaveLength(2);
  });
});

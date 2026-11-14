import { describe, expect, it } from 'vitest';
import { declaredBasePrice, type ChannelPrice, type Product, type TimePrice } from '@cgpos/shared';
import { localDayTime, reduce, resolveEffectivePrice, type CartPricingRules, type CartState } from './cart';

const kopi: Product = { id: 'p-kopi', name: 'Kopi', categoryId: null, price: 20000, kind: 'goods', trackStock: false, isActive: true, isFavorite: false };
const empty: CartState = { type: 'takeaway', lines: [], discounts: [] };

const channelPrices: ChannelPrice[] = [{ productId: 'p-kopi', channel: 'gofood', price: 25000 }];
// Senin-Jumat 15.00-17.00: happy hour 15.000
const timePrices: TimePrice[] = [{ id: 't1', productId: 'p-kopi', days: [1, 2, 3, 4, 5], startTime: '15:00:00', endTime: '17:00:00', price: 15000, isActive: true }];
// Rabu 14 Okt 2026 16.00 WIB = 09.00 UTC
const happy = new Date('2026-10-14T09:00:00Z');
const normal = new Date('2026-10-14T03:00:00Z'); // 10.00 WIB
const rules = (over: Partial<CartPricingRules>): CartPricingRules => ({ channelPrices, timePrices, timezone: 'Asia/Jakarta', ...over });

describe('hari dan jam di zona waktu outlet', () => {
  it('menghitung hari 1-7 dan jam HH:MM', () => {
    expect(localDayTime(happy, 'Asia/Jakarta')).toEqual({ day: 3, time: '16:00' });
    expect(localDayTime(new Date('2026-10-18T17:30:00Z'), 'Asia/Jakarta')).toEqual({ day: 1, time: '00:30' }); // Minggu 17.30 UTC = Senin 00.30 WIB
  });
});

describe('harga kanal dan harga waktu', () => {
  it('harga waktu berlaku di dalam jamnya dan harga normal di luar', () => {
    expect(resolveEffectivePrice('p-kopi', 20000, 1, rules({ now: happy }))).toBe(15000);
    expect(resolveEffectivePrice('p-kopi', 20000, 1, rules({ now: normal }))).toBe(20000);
    expect(resolveEffectivePrice('p-kopi', 20000, 1, rules({ now: new Date('2026-10-14T10:00:00Z') }))).toBe(20000); // tepat 17.00 sudah di luar
  });

  it('harga kanal mengalahkan harga waktu; produk tanpa harga kanal memakai aturan lain', () => {
    expect(resolveEffectivePrice('p-kopi', 20000, 1, rules({ now: happy, channel: 'gofood' }))).toBe(25000);
    expect(resolveEffectivePrice('p-kopi', 20000, 1, rules({ now: happy, channel: 'grabfood' }))).toBe(15000);
    expect(resolveEffectivePrice('p-lain', 30000, 1, rules({ now: happy, channel: 'gofood' }))).toBe(30000);
  });

  it('kanal hanya berlaku untuk jenis order Antar; memilih kanal menghitung ulang baris yang sudah ada', () => {
    let s = reduce(empty, { t: 'add', product: kopi, pricing: rules({ now: normal }) });
    expect(s.lines[0]!.unitPrice).toBe(20000);
    s = reduce(s, { t: 'type', type: 'delivery', pricing: rules({ now: normal }) });
    s = reduce(s, { t: 'channel', channel: 'gofood', pricing: rules({ now: normal }) });
    expect(s.lines[0]!.unitPrice).toBe(25000);
    expect(s.lines[0]!.basePrice).toBe(25000); // dari aturan, bukan diubah kasir
    s = reduce(s, { t: 'type', type: 'takeaway', pricing: rules({ now: normal }) });
    expect(s.channel).toBeUndefined();
    expect(s.lines[0]!.unitPrice).toBe(20000);
  });

  it('harga dari aturan tidak dilaporkan sebagai perubahan harga kasir, tetapi harga manual tetap', () => {
    let s = reduce(empty, { t: 'add', product: kopi, pricing: rules({ now: happy }) });
    expect(s.lines[0]).toMatchObject({ unitPrice: 15000, basePrice: 15000, listPrice: 20000 });
    expect(declaredBasePrice(s.lines[0]!)).toEqual({});
    s = reduce(s, { t: 'price', lineId: s.lines[0]!.id, unitPrice: 12000 });
    expect(declaredBasePrice(s.lines[0]!)).toEqual({ basePrice: 15000 });
  });

  it('harga manual kasir tidak ditimpa saat kanal berganti', () => {
    let s = reduce(empty, { t: 'add', product: kopi, pricing: rules({ now: normal }) });
    s = reduce(s, { t: 'price', lineId: s.lines[0]!.id, unitPrice: 18000 });
    s = reduce(s, { t: 'type', type: 'delivery', pricing: rules({ now: normal }) });
    s = reduce(s, { t: 'channel', channel: 'gofood', pricing: rules({ now: normal }) });
    expect(s.lines[0]!.unitPrice).toBe(18000);
  });
});

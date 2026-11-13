// Harga kanal ojek online dan harga berdasarkan waktu (A135; migrasi 0135). Dikelola dari dashboard; kasir belum memakainya.
import { DataError } from './types';

export type Channel = 'gofood' | 'grabfood' | 'shopeefood';
export const CHANNELS: Channel[] = ['gofood', 'grabfood', 'shopeefood'];
export const CHANNEL_LABEL: Record<Channel, string> = { gofood: 'GoFood', grabfood: 'GrabFood', shopeefood: 'ShopeeFood' };

export interface ChannelPrice { productId: string; channel: Channel; price: number }

/** Hari 1 = Senin sampai 7 = Minggu. */
export const DAY_LABEL: Record<number, string> = { 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab', 7: 'Min' };
export interface TimePrice { id: string; productId: string; days: number[]; startTime: string; endTime: string; price: number; isActive: boolean }
export interface TimePriceInput { id: string; productId: string; days: number[]; startTime: string; endTime: string; price: number; isActive: boolean }

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Jam disimpan HH:MM:SS di server; layar memakai HH:MM. */
export const hm = (t: string) => t.slice(0, 5);

export function channelPriceProblem(price: number): string | null {
  if (!Number.isInteger(price) || price < 0) return 'Harga harus bilangan bulat rupiah, tidak negatif.';
  if (price > 1_000_000_000) return 'Harga terlalu besar.';
  return null;
}

export function timePriceProblem(i: TimePriceInput): string | null {
  if (i.days.length === 0) return 'Pilih minimal satu hari.';
  if (new Set(i.days).size !== i.days.length || i.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return 'Hari tidak valid.';
  if (!HM.test(i.startTime) || !HM.test(i.endTime)) return 'Jam harus berformat JJ:MM.';
  if (i.endTime <= i.startTime) return 'Jam selesai harus setelah jam mulai (aturan tidak melewati tengah malam).';
  return channelPriceProblem(i.price);
}

/** Dua aturan tumpang tindih bila memakai produk yang sama, ada hari yang sama, dan jamnya beririsan (keduanya aktif). */
export function timeRulesOverlap(a: TimePriceInput | TimePrice, b: TimePriceInput | TimePrice): boolean {
  if (a.productId !== b.productId || !a.isActive || !b.isActive || a.id === b.id) return false;
  if (!a.days.some((d) => b.days.includes(d))) return false;
  return hm(a.startTime) < hm(b.endTime) && hm(b.startTime) < hm(a.endTime);
}

/** Harga berlaku pada hari (1-7) dan jam (HH:MM) tertentu; null bila tidak ada aturan yang cocok (pakai harga normal). */
export function effectiveTimedPrice(rules: TimePrice[], productId: string, day: number, time: string): number | null {
  const r = rules.find((x) => x.isActive && x.productId === productId && x.days.includes(day) && hm(x.startTime) <= time && time < hm(x.endTime));
  return r ? r.price : null;
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengatur harga.',
  'invalid channel': 'Kanal tidak dikenal.',
  'invalid price': 'Harga harus bilangan bulat rupiah, tidak negatif.',
  'product not found': 'Produk tidak ditemukan.',
  'invalid days': 'Hari tidak valid.',
  'invalid time': 'Jam selesai harus setelah jam mulai.',
  'overlapping rule': 'Jam dan hari bertabrakan dengan aturan lain untuk produk ini.',
};
export function priceRuleError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal menyimpan harga.'));
}

/** Mode demo: harga disimpan di memori. */
export function createFakePriceRules(deps: { productExists: (id: string) => Promise<boolean> }) {
  const channel = new Map<string, ChannelPrice>();
  const timed = new Map<string, TimePrice>();
  const key = (p: string, c: Channel) => `${p}|${c}`;
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async listChannelPrices(): Promise<ChannelPrice[]> { return clone([...channel.values()]); },
    async saveChannelPrice(productId: string, ch: Channel, price: number): Promise<void> {
      const problem = channelPriceProblem(price);
      if (problem) throw new DataError('invalid', problem);
      if (!CHANNELS.includes(ch)) throw new DataError('invalid', SERVER_MESSAGES['invalid channel']!);
      if (!(await deps.productExists(productId))) throw new DataError('not_found', SERVER_MESSAGES['product not found']!);
      channel.set(key(productId, ch), { productId, channel: ch, price });
    },
    async deleteChannelPrice(productId: string, ch: Channel): Promise<void> { channel.delete(key(productId, ch)); },
    async listTimePrices(): Promise<TimePrice[]> { return clone([...timed.values()]); },
    async saveTimePrice(input: TimePriceInput): Promise<void> {
      const problem = timePriceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!(await deps.productExists(input.productId))) throw new DataError('not_found', SERVER_MESSAGES['product not found']!);
      const candidate = { ...input, days: [...input.days].sort() };
      if ([...timed.values()].some((r) => timeRulesOverlap(r, candidate))) throw new DataError('invalid', SERVER_MESSAGES['overlapping rule']!);
      timed.set(input.id, candidate);
    },
    async deleteTimePrice(id: string): Promise<void> { timed.delete(id); },
  };
}

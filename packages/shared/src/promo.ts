import { formatRp } from './money';
import type { OrderType } from './order-calc';
import type { Coupon, DiscountEntry, Promotion, PromotionInput } from './types';
import { newId } from './id';

/**
 * Promo, kupon, dan diskon manual. Semuanya diubah menjadi potongan tingkat order (rupiah bulat),
 * karena hitungan angka order (computeOrder) dan aturan server memakai satu angka potongan order.
 */
export interface PromoLine { productId: string; qty: number; unitPrice: number; extrasTotal?: number }
export interface PromoCart { orderType: OrderType; lines: PromoLine[] }

export const PROMO_KINDS: { id: Promotion['kind']; label: string; hint: string }[] = [
  { id: 'percent_order', label: 'Diskon persen untuk seluruh pesanan', hint: 'Mis. 10% dari total belanja' },
  { id: 'amount_order', label: 'Potongan rupiah untuk seluruh pesanan', hint: 'Mis. Rp 5.000 untuk belanja di atas Rp 50.000' },
  { id: 'percent_item', label: 'Diskon persen untuk produk tertentu', hint: 'Mis. 20% untuk semua kopi susu' },
  { id: 'amount_item', label: 'Potongan rupiah per produk tertentu', hint: 'Mis. Rp 3.000 untuk setiap croissant' },
  { id: 'free_item', label: 'Gratis satu produk', hint: 'Mis. beli kopi, gratis cookies' },
];
export const kindLabel = (k: Promotion['kind']) => PROMO_KINDS.find((x) => x.id === k)?.label ?? k;

const ALL_TYPES: OrderType[] = ['dine_in', 'takeaway', 'delivery', 'service'];
export const lineGross = (l: PromoLine) => Math.round(l.qty * l.unitPrice) + Math.round(l.extrasTotal ?? 0);
export const cartGross = (c: PromoCart) => c.lines.reduce((n, l) => n + lineGross(l), 0);

export function promotionProblem(i: PromotionInput): string | null {
  const name = i.name.trim();
  if (!name) return 'Nama promo wajib diisi.';
  if (name.length > 80) return 'Nama promo maksimal 80 karakter.';
  if (i.kind === 'percent_order' || i.kind === 'percent_item') {
    if (!Number.isFinite(i.value) || i.value < 1 || i.value > 100) return 'Persen diskon harus antara 1 dan 100.';
  } else if (i.kind === 'amount_order' || i.kind === 'amount_item') {
    if (!Number.isFinite(i.value) || i.value < 1 || !Number.isInteger(i.value)) return 'Potongan harus berupa rupiah bulat, minimal Rp 1.';
  } else if (i.kind === 'free_item') {
    if (!i.freeProductId) return 'Pilih produk yang digratiskan.';
  } else return 'Jenis promo tidak dikenal.';
  if ((i.minSpend ?? 0) < 0) return 'Belanja minimum tidak boleh negatif.';
  if (i.orderTypes && i.orderTypes.length === 0) return 'Pilih minimal satu jenis order.';
  if (i.startsAt && i.endsAt && new Date(i.endsAt) <= new Date(i.startsAt)) return 'Tanggal berakhir harus setelah tanggal mulai.';
  return null;
}

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
export function couponCodeProblem(code: string): string | null {
  const c = normalizeCode(code);
  if (c.length < 3 || c.length > 20) return 'Kode kupon 3 sampai 20 karakter.';
  if (!/^[A-Z0-9_-]+$/.test(c)) return 'Kode kupon hanya boleh huruf, angka, strip, dan garis bawah.';
  return null;
}
export function couponInputProblem(i: { code: string; usageLimit?: number; validFrom?: string; validTo?: string }): string | null {
  const p = couponCodeProblem(i.code);
  if (p) return p;
  if (i.usageLimit !== undefined && (!Number.isInteger(i.usageLimit) || i.usageLimit < 1)) return 'Batas pemakaian harus bilangan bulat minimal 1.';
  if (i.validFrom && i.validTo && new Date(i.validTo) <= new Date(i.validFrom)) return 'Tanggal berakhir harus setelah tanggal mulai.';
  return null;
}

type Window = { isActive: boolean; start?: string; end?: string };
function windowProblem(w: Window, now: Date, what: string): string | null {
  if (!w.isActive) return `${what} sedang dinonaktifkan.`;
  if (w.start && now < new Date(w.start)) return `${what} belum mulai berlaku.`;
  if (w.end && now > new Date(w.end)) return `${what} sudah berakhir.`;
  return null;
}

/** Alasan kupon tidak bisa dipakai, atau null. `used` = jumlah pemakaian pada pesanan yang tidak dibatalkan. */
export function couponProblem(c: Coupon, p: Promotion | undefined, now: Date, used: number): string | null {
  if (!p) return 'Promo untuk kupon ini sudah tidak ada.';
  const own = windowProblem({ isActive: c.isActive, start: c.validFrom, end: c.validTo }, now, 'Kupon');
  if (own) return own;
  if (c.usageLimit !== undefined && used >= c.usageLimit) return 'Kupon sudah habis dipakai.';
  return null;
}

/**
 * Id produk yang sedang ikut promo tingkat item (potongan persen/nominal per item atau gratis item) untuk jenis order ini.
 * Promo yang berlaku untuk semua produk (daftar produk kosong) tidak dihitung, supaya filter "Promo" di kasir tetap bermakna.
 */
export function promoProductIds(promos: Promotion[], now: Date, orderType: OrderType): Set<string> {
  const ids = new Set<string>();
  for (const p of promos) {
    if (p.kind !== 'percent_item' && p.kind !== 'amount_item' && p.kind !== 'free_item') continue;
    if (windowProblem({ isActive: p.isActive, start: p.startsAt, end: p.endsAt }, now, 'Promo')) continue;
    if (!p.orderTypes.includes(orderType)) continue;
    for (const id of p.productIds) ids.add(id);
    if (p.kind === 'free_item' && p.freeProductId) ids.add(p.freeProductId);
  }
  return ids;
}

/** Bisa dipakai pada keranjang ini? Mengembalikan alasan bila tidak. */
export function promotionBlock(p: Promotion, cart: PromoCart, now: Date): string | null {
  const w = windowProblem({ isActive: p.isActive, start: p.startsAt, end: p.endsAt }, now, 'Promo');
  if (w) return w;
  if (!p.orderTypes.includes(cart.orderType)) return 'Promo ini tidak berlaku untuk jenis order ini.';
  const gross = cartGross(cart);
  if (cart.lines.length === 0) return 'Pesanan masih kosong.';
  if (gross < p.minSpend) return `Belanja minimum ${formatRp(p.minSpend)}.`;
  if (p.kind === 'percent_item' || p.kind === 'amount_item') {
    if (!matching(p, cart).length) return 'Tidak ada produk yang berlaku untuk promo ini di pesanan.';
  }
  if (p.kind === 'free_item') {
    if (p.productIds.length && !cart.lines.some((l) => p.productIds.includes(l.productId))) return 'Pesanan belum berisi produk syarat promo.';
    if (!cart.lines.some((l) => l.productId === p.freeProductId)) return 'Tambahkan produk gratisnya ke pesanan dulu.';
  }
  return null;
}

const matching = (p: Promotion, cart: PromoCart) => cart.lines.filter((l) => p.productIds.length === 0 || p.productIds.includes(l.productId));

/** Besar potongan sebelum dibatasi sisa tagihan. Nol bila tidak berlaku. */
export function promotionAmount(p: Promotion, cart: PromoCart): number {
  const gross = cartGross(cart);
  switch (p.kind) {
    case 'percent_order': return Math.round((gross * p.value) / 100);
    case 'amount_order': return p.value;
    case 'percent_item': return matching(p, cart).reduce((n, l) => n + Math.round((lineGross(l) * p.value) / 100), 0);
    case 'amount_item': return matching(p, cart).reduce((n, l) => n + Math.min(lineGross(l), Math.round(l.qty * p.value)), 0);
    case 'free_item': { const l = cart.lines.find((x) => x.productId === p.freeProductId); return l ? Math.round(l.unitPrice) : 0; }
  }
}

export function describePromotion(p: Promotion, productName?: (id: string) => string | undefined): string {
  const names = (ids: string[]) => (ids.length === 0 ? 'semua produk' : ids.map((i) => productName?.(i) ?? 'produk').slice(0, 3).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : ''));
  switch (p.kind) {
    case 'percent_order': return `Diskon ${p.value}%`;
    case 'amount_order': return `Potongan ${formatRp(p.value)}`;
    case 'percent_item': return `Diskon ${p.value}% untuk ${names(p.productIds)}`;
    case 'amount_item': return `Potongan ${formatRp(p.value)} per ${names(p.productIds)}`;
    case 'free_item': return `Gratis ${p.freeProductId ? productName?.(p.freeProductId) ?? 'produk' : 'produk'}`;
  }
}

/** Diskon yang dipilih kasir; nilainya dihitung ulang tiap isi pesanan berubah. */
export interface AppliedDiscount {
  id: string;
  source: 'promo' | 'coupon' | 'manual' | 'points';
  /** tukar poin: jumlah poin; `fixed` = nilai rupiahnya */
  points?: number;
  promotionId?: string; couponId?: string; code?: string;
  label: string;
  /** diskon manual */
  manual?: { mode: 'percent' | 'amount'; value: number };
  /** pesanan lama yang promonya sudah tidak ada: angka tetap dari pesanan itu */
  fixed?: number;
  authorizedBy?: string;
}

export function manualProblem(mode: 'percent' | 'amount', value: number, gross: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Isi besar diskon.';
  if (mode === 'percent') return value > 100 ? 'Persen diskon maksimal 100.' : null;
  if (!Number.isInteger(value)) return 'Potongan harus rupiah bulat.';
  return value > gross ? `Potongan tidak boleh melebihi total belanja (${formatRp(gross)}).` : null;
}

export interface ResolvedDiscounts { entries: DiscountEntry[]; total: number; skipped: { id: string; label: string; reason: string }[] }

/** Hitung semua diskon terpilih berurutan; tiap diskon dibatasi sisa tagihan, jadi total tidak pernah melebihi belanja. */
export function resolveDiscounts(applied: AppliedDiscount[], promos: Promotion[], cart: PromoCart, now: Date): ResolvedDiscounts {
  const gross = cartGross(cart);
  let left = gross;
  const entries: DiscountEntry[] = []; const skipped: ResolvedDiscounts['skipped'] = [];
  // tukar poin dihitung terakhir dan tidak boleh dipotong: nilainya harus persis poin x nilai per poin (aturan server)
  const ordered = [...applied.filter((a) => a.source !== 'points'), ...applied.filter((a) => a.source === 'points')];
  for (const a of ordered) {
    let amount = 0; let reason: string | null = null;
    if (a.source === 'points') {
      amount = a.fixed ?? 0;
      if (amount > left) { skipped.push({ id: a.id, label: a.label, reason: 'Potongan poin melebihi sisa tagihan.' }); continue; }
      if (amount > 0) { left -= amount; entries.push({ id: a.id, source: 'points', points: a.points, label: a.label, amount, authorizedBy: a.authorizedBy }); }
      continue;
    }
    if (a.manual) {
      reason = manualProblem(a.manual.mode, a.manual.value, gross);
      amount = a.manual.mode === 'percent' ? Math.round((left * a.manual.value) / 100) : a.manual.value;
    } else if (a.promotionId) {
      const p = promos.find((x) => x.id === a.promotionId);
      if (p) { reason = promotionBlock(p, cart, now); if (!reason) amount = promotionAmount(p, cart); }
      else if (a.fixed !== undefined) amount = a.fixed;
      else reason = 'Promo sudah tidak ada.';
    } else if (a.fixed !== undefined) amount = a.fixed;
    amount = Math.min(amount, left);
    if (reason || amount <= 0) { skipped.push({ id: a.id, label: a.label, reason: reason ?? 'Tidak ada potongan.' }); continue; }
    left -= amount;
    entries.push({ id: a.id, source: a.source, promotionId: a.promotionId, couponId: a.couponId, label: a.label, amount, authorizedBy: a.authorizedBy });
  }
  return { entries, total: gross - left, skipped };
}

/** Sesuaikan entri dengan potongan yang akhirnya dipakai penghitung order (selisih pembulatan masuk ke entri terakhir). */
export function fitDiscounts(entries: DiscountEntry[], total: number): DiscountEntry[] {
  if (total <= 0) return [];
  const out: DiscountEntry[] = []; let left = total;
  for (const e of entries) {
    if (left <= 0) break;
    const amount = Math.min(e.amount, left); left -= amount; out.push({ ...e, amount });
  }
  if (left > 0 && out.length) out[out.length - 1] = { ...out[out.length - 1]!, amount: out[out.length - 1]!.amount + left };
  return out;
}

/** Entri diskon tersimpan pada pesanan lama menjadi pilihan di keranjang. */
export function appliedFromEntries(entries: DiscountEntry[]): AppliedDiscount[] {
  return entries.map((e) => ({
    id: e.id, source: e.source, points: e.points, promotionId: e.promotionId, couponId: e.couponId, label: e.label, authorizedBy: e.authorizedBy,
    ...(e.source === 'points' ? { fixed: e.amount } : e.source === 'manual' || !e.promotionId ? { manual: { mode: 'amount' as const, value: e.amount } } : { fixed: e.amount }),
  }));
}

export const newApplied = (a: Omit<AppliedDiscount, 'id'>): AppliedDiscount => ({ id: newId(), ...a });
export { ALL_TYPES as ALL_ORDER_TYPES };

import { DataError } from './types';
import { fitDiscounts } from './promo';
import type { Coupon, Customer, DiscountEntry, Order, Promotion, OrderItem, Payment, Product, SalesSummary, Shift } from './types';
import type { CalcResult, OrderType } from './order-calc';
import { localParts } from './order-number';
import { newId } from './id';

/** Baris mentah dari PostgREST; bentuknya dijaga oleh kueri di supabase.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
const num = (v: unknown, d = 0): number => (v === null || v === undefined ? d : Number(v));

/** Galat dari tabel/RPC Supabase -> DataError dengan pesan yang bisa dibaca kasir. */
export function mapDbError(err: { code?: string; message?: string }): DataError {
  const msg = err.message ?? 'Galat tidak dikenal';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|ERR_INTERNET/i.test(msg)) return new DataError('network', 'Tidak ada koneksi ke server');
  if (err.code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return new DataError('forbidden', 'Akunmu tidak punya izin untuk tindakan ini');
  }
  if (err.code === 'PGRST301' || /jwt/i.test(msg)) return new DataError('forbidden', 'Sesi berakhir, silakan masuk lagi');
  if (err.code === '23505') return new DataError('invalid', 'Data yang sama sudah ada');
  if (err.code === '23503') return new DataError('invalid', 'Data terkait tidak ditemukan');
  if (/^no access$/i.test(msg)) return new DataError('forbidden', 'Hanya owner atau manajer yang boleh mengatur PIN');
  if (/PIN must be exactly 6 digits/i.test(msg)) return new DataError('invalid', 'PIN harus 6 digit angka');
  if (/employee not found/i.test(msg)) return new DataError('not_found', 'Karyawan tidak ditemukan');
  if (/not your device/i.test(msg)) return new DataError('forbidden', 'Perangkat ini bukan milik akunmu');
  return new DataError('invalid', msg);
}

/** Penolakan op dari sync_push (teks galat dari fungsi database) -> DataError. */
export function mapOpError(message: string): DataError {
  if (/order_locked|only unpaid orders can be voided|order is void/i.test(message)) {
    return new DataError('order_locked', 'Pesanan sudah ada pembayaran atau sudah ditutup, tidak bisa diubah');
  }
  if (/version_conflict/i.test(message)) return new DataError('order_locked', 'Pesanan berubah di perangkat lain, muat ulang dulu');
  if (/exceeds balance|payments .* exceed/i.test(message)) return new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
  if (/not enough points/i.test(message)) return new DataError('invalid', 'Saldo poin pelanggan tidak cukup. Muat ulang saldo lalu coba lagi.');
  if (/loyalty is not active/i.test(message)) return new DataError('invalid', 'Loyalti sedang tidak aktif, tukar poin tidak bisa dipakai.');
  if (/points discount/i.test(message)) return new DataError('invalid', 'Potongan poin tidak sesuai aturan loyalti.');
  if (/shift_closed|shift not found/i.test(message)) return new DataError('no_open_shift', 'Shift tidak terbuka, buka kasir dulu');
  if (/gateway payments/i.test(message)) return new DataError('invalid', 'Pembayaran QRIS (DOKU) belum diaktifkan');
  if (/duplicate key.*number|outlet_id, number/i.test(message)) return new DataError('invalid', 'Nomor pesanan bentrok, coba lagi');
  if (/one_open_per_device|shifts_one_open/i.test(message)) return new DataError('shift_already_open', 'Masih ada shift yang terbuka di perangkat ini');
  return new DataError('invalid', message || 'Server menolak operasi ini');
}

export function toPromotion(r: Row): Promotion {
  return {
    id: r.id, name: r.name, kind: r.kind, value: num(r.value), minSpend: num(r.min_spend), productIds: (r.product_ids ?? []) as string[],
    ...(r.free_product_id ? { freeProductId: r.free_product_id } : {}), orderTypes: (r.order_types ?? []) as OrderType[],
    ...(r.starts_at ? { startsAt: r.starts_at } : {}), ...(r.ends_at ? { endsAt: r.ends_at } : {}), isActive: !!r.is_active,
  };
}
export function toCoupon(r: Row, used: number): Coupon {
  return {
    id: r.id, promotionId: r.promotion_id, code: r.code, usedCount: used, isActive: !!r.is_active,
    ...(r.usage_limit != null ? { usageLimit: num(r.usage_limit) } : {}), ...(r.valid_from ? { validFrom: r.valid_from } : {}), ...(r.valid_to ? { validTo: r.valid_to } : {}),
  };
}
const DISCOUNT_LABEL = { manual: 'Diskon manual', coupon: 'Kupon', promo: 'Promo', points: 'Tukar poin' } as const;
export function toDiscounts(raw: unknown): DiscountEntry[] {
  return ((raw ?? []) as Row[]).map((d) => ({
    id: d.id, source: d.source as DiscountEntry['source'], label: DISCOUNT_LABEL[d.source as keyof typeof DISCOUNT_LABEL] ?? 'Diskon', amount: num(d.amount),
    ...(d.source === 'points' ? { points: num(d.points_used) } : {}),
    ...(d.promotion_id ? { promotionId: d.promotion_id } : {}), ...(d.coupon_id ? { couponId: d.coupon_id } : {}), ...(d.authorized_by ? { authorizedBy: d.authorized_by } : {}),
    ...(d.reference ? { reference: d.reference as string } : {}),
  }));
}

export function toCustomer(r: Row): Customer {
  return {
    id: r.id, name: r.name, pointsBalance: num(r.points_balance), createdAt: r.created_at,
    ...(r.code ? { code: r.code } : {}), ...(r.phone ? { phone: r.phone } : {}), ...(r.email ? { email: r.email } : {}),
    ...(r.gender ? { gender: r.gender } : {}), ...(r.birth_date ? { birthDate: r.birth_date } : {}),
    ...(r.city ? { city: r.city } : {}), ...(r.address ? { address: r.address } : {}), ...(r.note ? { note: r.note } : {}),
  };
}

export function toShift(r: Row): Shift {
  return {
    id: r.id, cashierId: r.cashier_id, openedAt: r.opened_at, openingCash: num(r.opening_cash), status: r.status,
    closedAt: r.closed_at ?? undefined,
    counted: r.closing_cash_counted === null || r.closing_cash_counted === undefined ? undefined : num(r.closing_cash_counted),
    expectedCash: r.expected_cash === null || r.expected_cash === undefined ? undefined : num(r.expected_cash),
    variance: r.cash_variance === null || r.cash_variance === undefined ? undefined : num(r.cash_variance),
  };
}

export function toProduct(r: Row): Product {
  const units: Row[] = r.product_units ?? [];
  const base = units.find((u) => u.is_base && !u.deleted_at) ?? units[0];
  return {
    id: r.id, name: r.name, categoryId: r.category_id ?? null, price: num(base?.price), sku: base?.sku ?? undefined,
    kind: r.kind === 'service' ? 'service' : r.kind === 'bundle' ? 'bundle' : 'goods', trackStock: !!r.track_stock, isActive: !!r.is_active,
    isFavorite: !!r.is_favorite, parentId: r.parent_id ?? null, isSellable: r.is_sellable === false ? false : undefined,
    ...(r.photo_path ? { photoUrl: String(r.photo_path) } : {}),
    ...(r.print_station_id ? { printStationId: String(r.print_station_id) } : {}),
    ...(r.allow_price_override && num(r.max_price_override_pct) > 0 ? { priceOverridePct: num(r.max_price_override_pct) } : {}),
  };
}

export function toOrder(r: Row): Order {
  const items: OrderItem[] = ((r.order_items ?? []) as Row[])
    .filter((i) => !i.voided_at)
    .sort((a, b) => num(a.sort) - num(b.sort))
    .map((i) => ({
      id: i.id, productId: i.product_id, name: i.name, qty: num(i.qty), unitPrice: num(i.unit_price),
      lineTotal: num(i.line_total), note: i.note ?? undefined,
      ...(((i.order_item_extras ?? []) as Row[]).length
        ? { extras: ((i.order_item_extras ?? []) as Row[]).map((e) => ({ optionId: e.option_id, name: e.name, price: num(e.price) })) }
        : {}),
    }));
  const payments: Payment[] = ((r.payments ?? []) as Row[])
    .filter((p) => p.status === 'succeeded')
    .sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)))
    .map((p) => ({
      id: p.id, methodId: p.method_id, methodName: p.payment_methods?.name ?? '', kind: p.payment_methods?.kind ?? 'cash',
      amount: num(p.amount), tendered: p.tendered === null || p.tendered === undefined ? undefined : num(p.tendered),
      change: num(p.change_given), paidAt: p.paid_at, ...(p.reference ? { reference: p.reference as string } : {}),
    }));
  return {
    id: r.id, number: r.number, type: r.order_type as OrderType, tableId: r.table_id ?? undefined, customerId: r.customer_id ?? undefined, label: r.label ?? undefined, guestCount: r.guest_count ?? undefined, shiftId: r.shift_id ?? undefined,
    cashierId: r.cashier_id, status: r.status, items, ...(r.order_discounts ? { discounts: toDiscounts(r.order_discounts) } : {}), subtotal: num(r.subtotal), discountTotal: num(r.discount_total),
    serviceCharge: num(r.service_charge), taxTotal: num(r.tax_total), rounding: num(r.rounding), total: num(r.total),
    paidTotal: num(r.paid_total), payments, openedAt: r.opened_at, closedAt: r.closed_at ?? undefined,
  };
}

/** Bagian urut dari "OUT1/A/261109/007" -> 7; bukan angka -> 0. */
export function seqOf(orderNumber: string): number {
  const n = Number(orderNumber.split('/').pop());
  return Number.isFinite(n) ? n : 0;
}

export function nextSeq(existingNumbers: string[], cachedMax: number): number {
  return Math.max(cachedMax, ...existingNumbers.map(seqOf), 0) + 1;
}

export interface NewOrderPayloadInput {
  id: string; number: string; orderType: OrderType; tableId?: string | null; customerId?: string | null; label?: string | null; guestCount?: number | null;
  shiftId?: string | null; cashierId: string; openedAt: string; baseVersion?: number;
  calc: CalcResult; orderDiscount: number; authorizedBy?: string | null; discounts?: DiscountEntry[];
  items: { id: string; productId: string; productUnitId: string; name: string; sku?: string | null; qty: number; unitPrice: number; basePrice?: number; note?: string | null; extras?: { optionId: string; name: string; price: number }[] }[];
}

/** Payload op `order.upsert` dari hasil computeOrder. Angka harus lolos pemeriksaan server (subtotal = jumlah baris, dst). */
export function buildOrderPayload(i: NewOrderPayloadInput): Row {
  const lineTax = new Map(i.calc.lines.map((l) => [l.id, l.taxAmount]));
  const lineTotal = new Map(i.calc.lines.map((l) => [l.id, l.lineTotal]));
  return {
    id: i.id, number: i.number, order_type: i.orderType, table_id: i.tableId ?? null, customer_id: i.customerId ?? null, label: i.label ?? null,
    ...(i.guestCount != null ? { guest_count: i.guestCount } : {}),
    shift_id: i.shiftId ?? null, cashier_id: i.cashierId, opened_at: i.openedAt, client_created_at: i.openedAt,
    ...(i.baseVersion !== undefined ? { base_version: i.baseVersion } : {}),
    subtotal: i.calc.subtotal, discount_total: i.calc.discountTotal, service_charge: i.calc.serviceCharge,
    tax_total: i.calc.taxTotal, rounding: i.calc.rounding, total: i.calc.total,
    ...(i.calc.grossTotal > i.calc.subtotal ? { tax_inclusive: true } : {}),
    items: i.items.map((it, idx) => ({
      id: it.id, product_id: it.productId, product_unit_id: it.productUnitId, name: it.name, sku: it.sku ?? null,
      qty: it.qty, unit_price: it.unitPrice, ...(it.basePrice != null ? { base_price: it.basePrice } : {}), extras_total: Math.round(it.qty * (it.extras ?? []).reduce((a, e) => a + e.price, 0)), discount: 0, tax_amount: lineTax.get(it.id) ?? 0,
      line_total: lineTotal.get(it.id) ?? Math.round(it.qty * it.unitPrice), note: it.note ?? null, is_free: false, sort: idx,
      extras: (it.extras ?? []).map((e) => ({ id: newId(), option_id: e.optionId, name: e.name, price: e.price, qty: it.qty })),
    })),
    discounts: i.calc.discountTotal <= 0 ? [] : (i.discounts?.length ? fitDiscounts(i.discounts, i.calc.discountTotal) : [{ id: newId(), source: 'manual' as const, label: '', amount: i.calc.discountTotal, authorizedBy: i.authorizedBy ?? undefined }])
      .map((d) => ({ id: d.id, source: d.source, promotion_id: d.promotionId ?? null, coupon_id: d.couponId ?? null, points_used: d.source === 'points' ? d.points ?? 0 : 0, amount: d.amount, authorized_by: d.authorizedBy ?? i.authorizedBy ?? null, ...(d.reference ? { reference: d.reference } : {}) })),
    tax_lines: i.calc.taxLines.map((t) => ({ tax_id: t.taxId ?? null, name: t.name, rate: t.rate, base_amount: t.base, amount: t.amount })),
  };
}

/** Pesanan tersimpan berharga inklusif pajak: harga menu seluruh baris melebihi subtotal bersih. (Kolom orders.tax_inclusive sengaja tidak dibaca agar klien tetap jalan sebelum migrasi 0012 diterapkan.) */
function storedIsInclusive(raw: Row): boolean {
  const items = ((raw.order_items ?? []) as Row[]).filter((it) => !it.voided_at);
  const gross = items.reduce((a, it) => a + Math.round(num(it.qty) * num(it.unit_price)) + Math.round(num(it.extras_total)), 0);
  return num(raw.tax_total) > 0 && gross > num(raw.subtotal);
}

/**
 * Payload op `order.upsert` dari pesanan yang sudah tersimpan, hanya mengganti pembulatan/total.
 * Dipakai saat pembayaran pertama menentukan pembulatan (tunai vs non-tunai), sebelum payment.add.
 */
export function payloadFromStored(raw: Row, rounding: number): Row {
  const total = num(raw.subtotal) - num(raw.discount_total) + num(raw.service_charge) + num(raw.tax_total) + rounding;
  return {
    id: raw.id, number: raw.number, order_type: raw.order_type, table_id: raw.table_id ?? null, customer_id: raw.customer_id ?? null,
    guest_count: raw.guest_count ?? null, label: raw.label ?? null, note: raw.note ?? null, queue_no: raw.queue_no ?? null,
    shift_id: raw.shift_id ?? null, cashier_id: raw.cashier_id, opened_at: raw.opened_at,
    client_created_at: raw.client_created_at ?? raw.opened_at, base_version: raw.version,
    subtotal: num(raw.subtotal), discount_total: num(raw.discount_total), service_charge: num(raw.service_charge),
    tax_total: num(raw.tax_total), rounding, total,
    ...(storedIsInclusive(raw) ? { tax_inclusive: true } : {}),
    items: ((raw.order_items ?? []) as Row[]).map((it) => ({
      id: it.id, product_id: it.product_id, product_unit_id: it.product_unit_id, name: it.name, sku: it.sku ?? null,
      qty: num(it.qty), unit_price: num(it.unit_price), ...(it.base_price != null ? { base_price: num(it.base_price) } : {}), extras_total: num(it.extras_total), discount: num(it.discount),
      tax_amount: num(it.tax_amount), line_total: num(it.line_total), note: it.note ?? null, is_free: !!it.is_free,
      sort: num(it.sort), voided_at: it.voided_at ?? null, void_reason: it.void_reason ?? null,
      extras: ((it.order_item_extras ?? []) as Row[]).map((e) => ({ id: e.id, option_id: e.option_id, name: e.name, price: num(e.price), qty: num(e.qty) })),
    })),
    discounts: ((raw.order_discounts ?? []) as Row[]).map((d) => ({
      id: d.id, order_item_id: d.order_item_id ?? null, source: d.source, promotion_id: d.promotion_id ?? null,
      coupon_id: d.coupon_id ?? null, points_used: num(d.points_used), amount: num(d.amount), authorized_by: d.authorized_by ?? null,
      ...(d.reference ? { reference: d.reference } : {}),
    })),
    tax_lines: ((raw.order_tax_lines ?? []) as Row[]).map((t) => ({
      tax_id: t.tax_id ?? null, name: t.name, rate: num(t.rate), base_amount: num(t.base_amount), amount: num(t.amount),
    })),
  };
}

/** Ringkasan penjualan dari pesanan lunas dalam rentang (tanggal tutup). Aturannya sama dengan data palsu. */
export function summarizeSales(paid: Order[], timezone: string): SalesSummary {
  const byMethod = new Map<string, { methodName: string; amount: number; count: number }>();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, count: 0 }));
  const top = new Map<string, { productId: string; name: string; qty: number; amount: number }>();
  for (const o of paid) {
    for (const p of o.payments) {
      const cur = byMethod.get(p.methodName) ?? { methodName: p.methodName, amount: 0, count: 0 };
      cur.amount += p.amount; cur.count += 1; byMethod.set(p.methodName, cur);
    }
    const h = localParts(new Date(o.closedAt ?? o.openedAt), timezone).h;
    byHour[h]!.total += o.total; byHour[h]!.count += 1;
    for (const i of o.items) {
      const cur = top.get(i.productId) ?? { productId: i.productId, name: i.name, qty: 0, amount: 0 };
      cur.qty += i.qty; cur.amount += i.lineTotal; top.set(i.productId, cur);
    }
  }
  const sum = (f: (o: Order) => number) => paid.reduce((a, o) => a + f(o), 0);
  const total = sum((o) => o.total);
  return {
    orderCount: paid.length, gross: sum((o) => o.subtotal), discounts: sum((o) => o.discountTotal),
    serviceCharge: sum((o) => o.serviceCharge), tax: sum((o) => o.taxTotal), total,
    avgTicket: paid.length ? Math.round(total / paid.length) : 0,
    byMethod: [...byMethod.values()].sort((a, b) => b.amount - a.amount), byHour,
    topProducts: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

export interface RefundPayloadInput {
  id: string; orderId: string; shiftId?: string | null; number: string; methodId: string; restock: boolean; authorizedBy: string;
  reason: string; note?: string | null; items: { orderItemId: string; qty: number; amount: number }[];
}
/** Payload op `refund.add`. Total = jumlah nilai baris; server menolak bila melebihi yang dibayar. */
export function buildRefundPayload(i: RefundPayloadInput): Row {
  return {
    id: i.id, order_id: i.orderId, shift_id: i.shiftId ?? null, number: i.number, method_id: i.methodId,
    total: i.items.reduce((a, x) => a + x.amount, 0), restock: i.restock, refund_delivery: false,
    authorized_by: i.authorizedBy, auth_method: 'pin', approved_offline: false, reason: i.reason.trim(), note: i.note?.trim() || null,
    items: i.items.map((x) => ({ order_item_id: x.orderItemId, qty: x.qty, amount: x.amount })),
  };
}

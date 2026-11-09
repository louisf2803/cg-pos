import type { DataLayer } from './data';
import { DataError } from './types';
import type {
  CatalogInput, CatalogProduct, Category, Employee, Order, OrderDraft, OrderItem, OutletContext, Payment, PaymentMethod, Product, ProductInput,
  SalesRange, SalesSummary, Shift, ShiftReport,
} from './types';
import { computeOrder } from './order-calc';
import { formatOrderNumber, localDateKey, localParts } from './order-number';
import { newId } from './id';
import { assembleCatalog, variantProductName, variantsProblem } from './variants';
import { roundToStep } from './money';

const CTX: OutletContext = {
  orgName: 'Kopi Contoh', outletId: 'outlet-1', outletCode: 'OUT1', outletName: 'Outlet Contoh', timezone: 'Asia/Jakarta', deviceCode: 'A',
  settings: {
    taxCalc: 'after_discount', taxMode: 'per_order', serviceChargePct: 0, serviceChargeTaxable: false,
    serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 100, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true,
  },
  taxes: [{ id: 'tax-pb1', name: 'PB1', rate: 10 }],
};

const CATEGORIES: Category[] = [
  { id: 'c-kopi', name: 'Kopi', sort: 1 }, { id: 'c-non', name: 'Non-kopi', sort: 2 },
  { id: 'c-makan', name: 'Makanan', sort: 3 }, { id: 'c-camil', name: 'Camilan', sort: 4 },
];
const P = (id: string, name: string, categoryId: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name, categoryId, price, kind: 'goods', trackStock: true, isActive: true, isFavorite: false, stock: 50, ...extra });
const PRODUCTS: Product[] = [
  P('p1', 'Kopi susu gula aren', 'c-kopi', 20000, { isFavorite: true, sku: 'KP-001' }),
  P('p2', 'Americano', 'c-kopi', 18000, { sku: 'KP-002' }),
  P('p3', 'Latte', 'c-kopi', 24000, { sku: 'KP-003' }),
  P('p4', 'Espresso', 'c-kopi', 15000, { sku: 'KP-004' }),
  P('p5', 'Teh tarik', 'c-non', 16000, { sku: 'NK-001' }),
  P('p6', 'Cokelat panas', 'c-non', 22000, { sku: 'NK-002' }),
  P('p7', 'Jus jeruk', 'c-non', 19000, { sku: 'NK-003' }),
  P('p7s', 'Es teh manis (S)', 'c-non', 8000, { sku: 'NK-005S', parentId: 'pv-teh' }),
  P('p7m', 'Es teh manis (M)', 'c-non', 10000, { sku: 'NK-005M', parentId: 'pv-teh' }),
  P('p7l', 'Es teh manis (L)', 'c-non', 13000, { sku: 'NK-005L', parentId: 'pv-teh' }),
  P('p8', 'Air mineral', 'c-non', 5000, { sku: 'NK-004', stock: 3 }),
  P('p9', 'Roti bakar cokelat keju', 'c-makan', 18500, { sku: 'MK-001' }),
  P('p10', 'Nasi goreng kampung', 'c-makan', 32000, { sku: 'MK-002' }),
  P('p11', 'Mie goreng telur', 'c-makan', 28000, { sku: 'MK-003' }),
  P('p12', 'Kentang goreng', 'c-camil', 15000, { sku: 'CM-001' }),
  P('p13', 'Pisang goreng', 'c-camil', 14000, { sku: 'CM-002', stock: 0 }),
  P('p14', 'Singkong keju', 'c-camil', 16000, { sku: 'CM-003' }),
];
const EMPLOYEES: (Employee & { pin: string })[] = [
  { id: 'e-owner', name: 'Pemilik', role: 'owner', pin: '111111' },
  { id: 'e-sari', name: 'Sari', role: 'cashier', pin: '222222' },
  { id: 'e-budi', name: 'Budi', role: 'manager', pin: '333333' },
];
const METHODS: PaymentMethod[] = [
  { id: 'm-cash', code: 'CASH', name: 'Tunai', kind: 'cash', requiresOnline: false },
  { id: 'm-qris', code: 'QRIS', name: 'QRIS', kind: 'gateway', requiresOnline: true },
  { id: 'm-edc', code: 'EDC', name: 'Kartu', kind: 'noncash', requiresOnline: false },
  { id: 'm-trf', code: 'TRF', name: 'Transfer bank', kind: 'noncash', requiresOnline: false },
];

export interface FakeOptions { now?: () => Date; seed?: boolean }

/** Data palsu di memori. PIN disimpan polos HANYA di sini; versi asli memakai bcrypt di server. */
export function createFakeData(opts: FakeOptions = {}): DataLayer & { reset(): void } {
  const now = opts.now ?? (() => new Date());
  let categories: Category[] = [];
  let products: Product[] = [];
  let orders: Order[] = [];
  let shifts: Shift[] = [];
  let cashMoves: { shiftId: string; kind: 'in' | 'out'; amount: number }[] = [];
  const seqByDay = new Map<string, number>();

  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const method = (id: string) => {
    const m = METHODS.find((x) => x.id === id);
    if (!m) throw new DataError('not_found', 'Metode bayar tidak ditemukan');
    return m;
  };

  function seqFor(d: Date): number {
    const key = localDateKey(d, CTX.timezone);
    const n = (seqByDay.get(key) ?? 0) + 1;
    seqByDay.set(key, n);
    return n;
  }

  function recompute(draft: OrderDraft, step: number) {
    const items = draft.items.map((i) => ({
      id: i.id, qty: i.qty, unitPrice: i.unitPrice,
      taxRate: products.find((p) => p.id === i.productId)?.taxRate,
    }));
    return computeOrder({
      orderType: draft.type, items, orderDiscount: draft.orderDiscount,
      orderTaxes: CTX.taxes.map((t) => ({ taxId: t.id, name: t.name, rate: t.rate })),
      settings: CTX.settings, roundingStep: step,
    });
  }

  function reset() {
    categories = opts.seed === false ? [] : clone(CATEGORIES);
    products = opts.seed === false ? [] : clone(PRODUCTS);
    orders = []; shifts = []; cashMoves = []; seqByDay.clear();
    if (opts.seed !== false) seedHistory();
  }

  /** riwayat hari ini untuk dashboard: pesanan lunas tersebar sepanjang jam kerja */
  function seedHistory() {
    const base = now();
    const p = localParts(base, CTX.timezone);
    const shiftId = 'seed-shift';
    shifts.push({ id: shiftId, cashierId: 'e-sari', openedAt: new Date(base.getTime() - 6 * 3600_000).toISOString(), openingCash: 100000, status: 'closed', closedAt: new Date(base.getTime() - 3600_000).toISOString() });
    const plan: { hour: number; items: [string, number][]; method: string }[] = [
      { hour: 8, items: [['p1', 2], ['p9', 1]], method: 'm-cash' }, { hour: 9, items: [['p2', 1]], method: 'm-qris' },
      { hour: 9, items: [['p3', 2], ['p12', 1]], method: 'm-cash' }, { hour: 10, items: [['p10', 2], ['p5', 2]], method: 'm-edc' },
      { hour: 11, items: [['p1', 1], ['p14', 1]], method: 'm-qris' }, { hour: 12, items: [['p10', 3], ['p7', 3]], method: 'm-cash' },
      { hour: 12, items: [['p11', 2], ['p8', 2]], method: 'm-qris' }, { hour: 13, items: [['p3', 1], ['p9', 2]], method: 'm-cash' },
    ];
    plan.filter((x) => x.hour <= Math.max(p.h, 8)).forEach((x, idx) => {
      const at = new Date(Date.UTC(p.y, p.m - 1, p.d, x.hour - 7, 10 + idx * 3));
      const draftItems = x.items.map(([pid, qty], k) => {
        const pr = products.find((q) => q.id === pid)!;
        return { id: `seed-${idx}-${k}`, productId: pid, name: pr.name, qty, unitPrice: pr.price };
      });
      const calc = recompute({ id: `seed-o${idx}`, type: 'takeaway', items: draftItems }, 0);
      const m = method(x.method);
      const items: OrderItem[] = draftItems.map((d, k) => ({ ...d, lineTotal: calc.lines[k]!.lineTotal }));
      const pay: Payment = { id: `seed-pay${idx}`, methodId: m.id, methodName: m.name, kind: m.kind, amount: calc.total, tendered: calc.total, change: 0, paidAt: at.toISOString() };
      orders.push({
        id: `seed-o${idx}`, number: formatOrderNumber(CTX.outletCode, CTX.deviceCode, at, seqFor(at), CTX.timezone), type: 'takeaway',
        shiftId, cashierId: 'e-sari', status: 'paid', items, subtotal: calc.subtotal, discountTotal: calc.discountTotal,
        serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal, rounding: calc.rounding, total: calc.total, paidTotal: calc.total,
        payments: [pay], openedAt: at.toISOString(), closedAt: at.toISOString(),
      });
    });
  }
  reset();

  const self: DataLayer & { reset(): void } = {
    reset,
    async getContext() { return clone(CTX); },
    async listCategories() { return clone([...categories].sort((a, b) => a.sort - b.sort)); },
    async saveCategory(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama kategori wajib diisi');
      if (input.id) {
        const c = categories.find((x) => x.id === input.id);
        if (!c) throw new DataError('not_found', 'Kategori tidak ditemukan');
        c.name = name; return clone(c);
      }
      const c: Category = { id: newId(), name, sort: categories.length + 1 };
      categories.push(c); return clone(c);
    },
    async listProducts(q = {}) {
      const s = q.search?.trim().toLowerCase();
      return clone(products.filter((p) =>
        (q.includeInactive || p.isActive) &&
        (q.categoryId === undefined || q.categoryId === null || p.categoryId === q.categoryId) &&
        (!s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s))));
    },
    async getProduct(id) { return clone(products.find((p) => p.id === id) ?? null); },
    async saveProduct(input: ProductInput) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      if (!Number.isFinite(input.price) || input.price < 0) throw new DataError('invalid', 'Harga tidak boleh negatif');
      if (input.sku && products.some((p) => p.sku === input.sku && p.id !== input.id)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
      if (input.id) {
        const p = products.find((x) => x.id === input.id);
        if (!p) throw new DataError('not_found', 'Produk tidak ditemukan');
        Object.assign(p, { name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku || undefined,
          kind: input.kind ?? p.kind, trackStock: input.trackStock ?? p.trackStock, isFavorite: input.isFavorite ?? p.isFavorite, isActive: input.isActive ?? p.isActive });
        return clone(p);
      }
      const p: Product = { id: newId(), name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku || undefined,
        kind: input.kind ?? 'goods', trackStock: input.trackStock ?? true, stock: 0, isActive: input.isActive ?? true, isFavorite: input.isFavorite ?? false };
      products.push(p); return clone(p);
    },
    async setProductActive(id, active) {
      const p = products.find((x) => x.id === id);
      if (!p) throw new DataError('not_found', 'Produk tidak ditemukan');
      p.isActive = active;
    },

    async listCatalog(q = {}) {
      let list = assembleCatalog(products);
      if (!q.includeInactive) list = list.filter((p) => p.isActive);
      if (q.categoryId) list = list.filter((p) => p.categoryId === q.categoryId);
      const s = q.search?.trim().toLowerCase();
      if (s) list = list.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s) || p.variants.some((v) => v.label.toLowerCase().includes(s) || (v.sku ?? '').toLowerCase().includes(s)));
      return clone(list);
    },
    async getCatalogProduct(id) {
      return clone(assembleCatalog(products).find((c) => c.id === id || c.variants.some((v) => v.id === id)) ?? null);
    },
    async saveCatalogProduct(input: CatalogInput): Promise<CatalogProduct> {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      const problem = variantsProblem(input.variants);
      if (problem) throw new DataError('invalid', problem);
      const groupId = input.id;
      const mine = (p: Product) => p.id === groupId || p.parentId === groupId;
      const skus = [input.variants.length ? undefined : input.sku, ...input.variants.map((v) => v.sku)].map((x) => x?.trim()).filter((x): x is string => !!x);
      if (new Set(skus).size !== skus.length || skus.some((k) => products.some((p) => p.sku === k && !mine(p)))) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
      const kind = input.kind ?? 'goods', trackStock = input.trackStock ?? true, isFavorite = input.isFavorite ?? false, active = input.isActive ?? true;
      if (input.variants.length === 0) {
        if (!Number.isFinite(input.price) || input.price < 0) throw new DataError('invalid', 'Harga tidak boleh negatif');
        const kids = groupId ? products.filter((p) => p.parentId === groupId) : [];
        for (const k of kids) products.splice(products.indexOf(k), 1);
        const cur = groupId ? products.find((p) => p.id === groupId) : undefined;
        const patch = { name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku?.trim() || undefined, kind, trackStock, isFavorite, isActive: active };
        if (cur) Object.assign(cur, patch);
        else products.push({ id: groupId ?? newId(), stock: 0, ...patch });
        return clone((await this.getCatalogProduct(groupId ?? products[products.length - 1]!.id))!);
      }
      const parentId = groupId ?? newId();
      const single = products.find((p) => p.id === parentId && !p.parentId);
      if (single) products.splice(products.indexOf(single), 1); // produk tunggal berubah jadi berarian
      const kept = new Set(input.variants.map((v) => v.id).filter(Boolean));
      for (const k of products.filter((p) => p.parentId === parentId && !kept.has(p.id))) products.splice(products.indexOf(k), 1);
      for (const v of input.variants) {
        const patch = { name: variantProductName(name, v.label), categoryId: input.categoryId, price: Math.round(v.price), sku: v.sku?.trim() || undefined, kind, trackStock, isFavorite, isActive: active && (v.isActive ?? true), parentId };
        const cur = v.id ? products.find((p) => p.id === v.id) : undefined;
        if (cur) Object.assign(cur, patch); else products.push({ id: newId(), stock: 0, ...patch });
      }
      return clone((await this.getCatalogProduct(parentId))!);
    },
    async setCatalogActive(id, active) {
      const hit = products.filter((p) => p.id === id || p.parentId === id);
      if (!hit.length) throw new DataError('not_found', 'Produk tidak ditemukan');
      for (const p of hit) p.isActive = active;
    },

    async listEmployees() { return EMPLOYEES.map(({ pin: _pin, ...e }) => e); },
    async verifyPin(employeeId, pin) { return EMPLOYEES.some((e) => e.id === employeeId && e.pin === pin); },
    async setEmployeePin(employeeId, pin) {
      if (!/^\d{6}$/.test(pin)) throw new DataError('invalid', 'PIN harus 6 digit angka');
      const e = EMPLOYEES.find((x) => x.id === employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      e.pin = pin;
    },
    async listPaymentMethods() { return clone(METHODS); },

    async currentShift() { return clone(shifts.find((s) => s.status === 'open') ?? null); },
    async openShift({ id, cashierId, openingCash }) {
      if (shifts.some((s) => s.status === 'open')) throw new DataError('shift_already_open', 'Masih ada shift yang terbuka di perangkat ini');
      if (openingCash < 0) throw new DataError('bad_amount', 'Modal awal tidak boleh negatif');
      const s: Shift = { id, cashierId, openedAt: now().toISOString(), openingCash: Math.round(openingCash), status: 'open' };
      shifts.push(s); return clone(s);
    },
    async closeShift({ shiftId, counted }) {
      const s = shifts.find((x) => x.id === shiftId);
      if (!s) throw new DataError('not_found', 'Shift tidak ditemukan');
      if (s.status === 'closed') throw new DataError('invalid', 'Shift sudah ditutup');
      const pays = orders.filter((o) => o.shiftId === s.id).flatMap((o) => o.payments);
      const cashSales = pays.filter((p) => p.kind === 'cash').reduce((a, p) => a + p.amount, 0);
      const otherSales = pays.filter((p) => p.kind !== 'cash').reduce((a, p) => a + p.amount, 0);
      const cashIn = cashMoves.filter((m) => m.shiftId === s.id && m.kind === 'in').reduce((a, m) => a + m.amount, 0);
      const cashOut = cashMoves.filter((m) => m.shiftId === s.id && m.kind === 'out').reduce((a, m) => a + m.amount, 0);
      const expected = s.openingCash + cashSales + cashIn - cashOut;
      Object.assign(s, { status: 'closed', closedAt: now().toISOString(), counted: Math.round(counted), expectedCash: expected, variance: Math.round(counted) - expected });
      const sold = new Map<string, { productId: string; name: string; qty: number; amount: number }>();
      for (const o of orders.filter((x) => x.shiftId === s.id && x.status === 'paid')) {
        for (const i of o.items) {
          const cur = sold.get(i.productId) ?? { productId: i.productId, name: i.name, qty: 0, amount: 0 };
          cur.qty += i.qty; cur.amount += i.lineTotal; sold.set(i.productId, cur);
        }
      }
      return {
        shift: clone(s), expectedCash: expected, counted: s.counted!, variance: s.variance!, cashSales, otherSales, cashIn, cashOut,
        orderCount: orders.filter((o) => o.shiftId === s.id && o.status === 'paid').length,
        productsSold: [...sold.values()].sort((a, b) => b.amount - a.amount),
      } satisfies ShiftReport;
    },

    async nextOrderNumber() {
      const d = now();
      const key = localDateKey(d, CTX.timezone);
      const n = (seqByDay.get(key) ?? 0) + 1;
      return formatOrderNumber(CTX.outletCode, CTX.deviceCode, d, n, CTX.timezone);
    },
    async saveOrder(draft, cashierId) {
      const shift = shifts.find((s) => s.status === 'open');
      if (CTX.settings.requireOpenShift && !shift) throw new DataError('no_open_shift', 'Buka kasir dulu sebelum membuat pesanan');
      if (draft.items.length === 0) throw new DataError('invalid', 'Pesanan masih kosong');
      if (draft.items.some((i) => i.qty <= 0)) throw new DataError('invalid', 'Jumlah item harus lebih dari 0');
      const existing = orders.find((o) => o.id === draft.id);
      if (existing && (existing.status !== 'open' || existing.paidTotal > 0)) throw new DataError('order_locked', 'Pesanan sudah ada pembayaran, tidak bisa diubah');
      const calc = recompute(draft, 0);
      const items: OrderItem[] = draft.items.map((d, k) => ({ ...d, lineTotal: calc.lines[k]!.lineTotal }));
      const at = now();
      const o: Order = existing ?? {
        id: draft.id, number: formatOrderNumber(CTX.outletCode, CTX.deviceCode, at, seqFor(at), CTX.timezone), type: draft.type, tableId: draft.tableId,
        shiftId: shift?.id, cashierId, status: 'open', items, subtotal: 0, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 0, paidTotal: 0,
        payments: [], openedAt: at.toISOString(),
      };
      Object.assign(o, { type: draft.type, tableId: draft.tableId, items, subtotal: calc.subtotal, discountTotal: calc.discountTotal,
        serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal, rounding: 0, total: calc.total });
      if (!existing) orders.push(o);
      return clone(o);
    },
    async addPayment(orderId, pay) {
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.status === 'void') throw new DataError('order_locked', 'Pesanan sudah dibatalkan');
      if (o.payments.some((p) => p.id === pay.id)) return clone(o);                // idempoten
      const m = method(pay.methodId);
      // pembulatan mengikuti metode; dihitung pada pembayaran yang melunasi
      const step = m.kind === 'cash' ? CTX.settings.roundingCashStep : CTX.settings.roundingNoncashStep;
      let total = o.total, rounding = o.rounding;
      if (o.paidTotal === 0 && step) { total = roundToStep(o.total, step); rounding = total - o.total; }
      const balance = total - o.paidTotal;
      if (pay.amount <= 0 || pay.amount > balance) throw new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
      const tendered = pay.tendered ?? pay.amount;
      const change = Math.max(tendered - pay.amount, 0);                          // sama dengan server (tendered - amount)
      const at = pay.paidAt ?? now().toISOString();
      o.payments.push({ id: pay.id, methodId: m.id, methodName: m.name, kind: m.kind, amount: pay.amount, tendered, change: m.kind === 'cash' ? change : 0, paidAt: at });
      o.total = total; o.rounding = rounding; o.paidTotal += pay.amount;
      o.status = o.paidTotal >= o.total ? 'paid' : 'partially_paid';
      if (o.status === 'paid') {
        o.closedAt = at;
        for (const it of o.items) { const p = products.find((x) => x.id === it.productId); if (p?.trackStock && p.stock !== undefined) p.stock -= it.qty; }
      }
      return clone(o);
    },
    async voidUnpaidOrder(orderId) {
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.paidTotal > 0 || o.status !== 'open') throw new DataError('order_locked', 'Hanya pesanan yang belum dibayar yang bisa dibatalkan; pesanan lunas lewat refund');
      o.status = 'void'; o.closedAt = now().toISOString(); return clone(o);
    },
    async getOrder(id) { return clone(orders.find((o) => o.id === id) ?? null); },
    async listOrders(q = {}) {
      return clone(orders
        .filter((o) => (!q.status || o.status === q.status) && (!q.from || o.openedAt >= q.from) && (!q.to || o.openedAt < q.to))
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, q.limit ?? 200));
    },

    async salesSummary(range: SalesRange) {
      const paid = orders.filter((o) => o.status === 'paid' && (o.closedAt ?? o.openedAt) >= range.from && (o.closedAt ?? o.openedAt) < range.to);
      const byMethod = new Map<string, { methodName: string; amount: number; count: number }>();
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, count: 0 }));
      const top = new Map<string, { productId: string; name: string; qty: number; amount: number }>();
      for (const o of paid) {
        for (const p of o.payments) {
          const cur = byMethod.get(p.methodName) ?? { methodName: p.methodName, amount: 0, count: 0 };
          cur.amount += p.amount; cur.count += 1; byMethod.set(p.methodName, cur);
        }
        const h = localParts(new Date(o.closedAt ?? o.openedAt), CTX.timezone).h;
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
      } satisfies SalesSummary;
    },
  };
  return self;
}

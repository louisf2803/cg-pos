import type { SupabaseClient } from '@supabase/supabase-js';
import { createTableOps } from './table-ops';
import { DEFAULT_LOYALTY, loyaltyRulesProblem, type LoyaltyEntry, type LoyaltyRules } from './loyalty';
import { photoPath, photoProblem } from './photo';
import { customerProblem, normalizePhone, searchTerm } from './customer';
import { makeStockItem, opnameProblem, stockFilterMatches, stockPostProblem, stockSearchMatches, type StockItem, type StockMove, type StockMoveKind, type StockOpname, type StockOpnameInput, type StockOpnameLine, type StockOpnameSummary } from './stock';
import {
  invoiceOutstanding, purchaseInvoiceProblem, purchaseOrderProblem, purchasePayProblem, purchaseReceiveProblem, supplierProblem,
  type PayAccount, type PurchaseInvoice, type PurchaseInvoiceInput, type PurchaseInvoiceSummary, type PurchaseItem, type PurchaseLine, type PurchaseOrder, type PurchaseOrderInput, type PurchaseOrderSummary, type PurchasePayInput, type PurchasePayment, type PurchaseReceiveInput, type Supplier, type SupplierInput,
} from './purchasing';

import { groupTickets, type KitchenRow, type KitchenStatus } from './kitchen';
import {
  accountProblem, balanceSheetOf, balanceSheetTotals, cashFlowOf, incomeStatementOf, journalProblem, ledgerOf,
  type Account, type AccountCategory, type AccountInput, type FinLine, type Journal, type JournalInput, type JournalSummary, type PayableRow, type StatementRow, type TrialRow,
} from './finance';

const PHOTO_BUCKET = 'menu-images';
const PROMO_COLUMNS = 'id,name,kind,value,min_spend,product_ids,free_product_id,order_types,starts_at,ends_at,is_active';
const COUPON_COLUMNS = 'id,promotion_id,code,usage_limit,valid_from,valid_to,is_active';
const CUSTOMER_COLUMNS = 'id,code,name,phone,email,gender,birth_date,city,address,note,points_balance,created_at';
import { paymentRefProblem } from './payment-rules';
import { buildShiftReport, type ShiftInputs, type ShiftReportRow } from './shift-report';
import type { DataLayer } from './data';
import { DataError } from './types';
import { couponInputProblem, normalizeCode, promotionProblem } from './promo';
import type {
  Bundle, CatalogInput, CatalogProduct, Category, Department, ExtraGroup, Refund, RefundInput, DiningTable, Floor, ManagedEmployee, TableStatus, Employee, Order, OrderDraft, OutletContext, PaymentMethod, Product, ProductInput, SalesRange, SalesSummary,
  Shift, ShiftReport,
} from './types';
import type { OrderType } from './order-calc';
import { computeOrder } from './order-calc';
import { formatOrderNumber, localDateKey } from './order-number';
import { roundToStep } from './money';
import { newId } from './id';
import { DEFAULT_TAX, outletInfoProblem, outletOptionsProblem, taxSettingsProblem, type TaxSettings } from './outlet';
import { refundAmounts, refundProblem } from './refund';
import { extraGroupProblem, extrasLineTotal } from './extras';
import { bundleProblem } from './bundle';
import { assembleCatalog, variantProductName, variantsProblem } from './variants';
import {
  buildOrderPayload, buildRefundPayload, mapDbError, mapOpError, nextSeq, payloadFromStored, summarizeSales, toOrder, toProduct, toShift, toCustomer, toPromotion, toCoupon,
} from './supabase-map';
import type { Row } from './supabase-map';

export interface SupabaseDataOptions {
  /** Perangkat kasir (pos.devices.id). Kosong: dicari perangkat aktif milik pengguna yang sedang masuk. */
  deviceId?: string;
  /** Outlet tujuan bila tidak ada perangkat (dashboard). Kosong: outlet aktif pertama yang terlihat. */
  outletId?: string;
  now?: () => Date;
}

const PRODUCT_SELECT =
  'id,name,category_id,kind,is_active,show_in_menu,is_favorite,track_stock,parent_id,is_sellable,photo_path,product_units(id,price,sku,is_base,deleted_at)';
const ORDER_SELECT =
  'id,number,order_type,table_id,label,guest_count,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,' +
  'order_items(id,product_id,name,qty,unit_price,line_total,note,sort,voided_at,order_item_extras(option_id,name,price,qty)),' +
  'payments(id,method_id,amount,tendered,change_given,status,paid_at,reference,payment_methods(name,kind))';
/** Untuk membangun ulang payload op: semua kolom yang dibutuhkan _apply_op. */
const ORDER_RAW_SELECT =
  'id,number,order_type,table_id,customer_id,guest_count,label,note,queue_no,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,client_created_at,' +
  'order_items(id,product_id,product_unit_id,name,sku,qty,unit_price,extras_total,discount,tax_amount,line_total,note,is_free,sort,voided_at,void_reason,order_item_extras(id,option_id,name,price,qty)),' +
  'order_discounts(id,order_item_id,source,promotion_id,coupon_id,points_used,amount,authorized_by),' +
  'order_tax_lines(tax_id,name,rate,base_amount,amount)';

interface Resolved {
  ctx: OutletContext;
  orgId: string;
  device: { id: string; code: string } | null;
}

/**
 * DataLayer nyata di atas Supabase (schema `pos`). Versi ONLINE: dipakai dashboard dan POS web.
 *  - baca lewat tabel (dijaga RLS), tulis transaksi lewat RPC pos.sync_push (aturan bisnis ada di database)
 *  - PIN lewat RPC pos.verify_pin; hash PIN tidak pernah keluar dari server
 * Tablet offline-first (Expo) memakai pos.sync_pull + antrean lokal; tanda tangan DataLayer sama.
 */
export function createSupabaseData(client: SupabaseClient, opts: SupabaseDataOptions = {}): DataLayer {
  const now = opts.now ?? (() => new Date());
  const db = () => client.schema('pos');

  function must<T>(res: { data: T | null; error: { code?: string; message?: string } | null }): T {
    if (res.error) throw mapDbError(res.error);
    return res.data as T;
  }

  /** Ambil semua baris halaman demi halaman (PostgREST membatasi 1000 baris per permintaan). */
  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const rows = must(await build(from, from + page - 1)) ?? [];
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }

  let resolved: Promise<Resolved> | null = null;
  const resolve = (): Promise<Resolved> => {
    resolved ??= load().catch((e) => { resolved = null; throw e; });
    return resolved;
  };

  /** Lokasi stok outlet (satu per outlet; dibuat saat outlet dibuat). */
  const locCache = new Map<string, string>();
  async function stockLocation(outletId: string): Promise<string> {
    const hit = locCache.get(outletId);
    if (hit) return hit;
    const row = must(await db().from('locations').select('id').eq('outlet_id', outletId).eq('kind', 'outlet').eq('is_active', true).limit(1).maybeSingle()) as Row | null;
    if (!row) throw new DataError('not_found', 'Lokasi stok outlet ini belum ada.');
    locCache.set(outletId, row.id as string);
    return row.id as string;
  }
  function toStockItem(p: Row, unitName: Map<string, string>, b: Row | undefined): StockItem {
    return makeStockItem({
      productId: p.id as string, name: p.name as string, kind: p.kind === 'ingredient' ? 'ingredient' : 'goods', unit: (p.base_unit_id && unitName.get(p.base_unit_id as string)) || 'unit',
      qty: Number(b?.qty ?? 0), avgCost: Number(b?.avg_cost ?? 0), ...(p.stock_alert_min !== null && p.stock_alert_min !== undefined ? { minQty: Number(p.stock_alert_min) } : {}),
    });
  }

  function mapOpnameError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur opname belum aktif di database (migrasi 0015 belum diterapkan).');
    if (/not allowed/i.test(m)) return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengelola opname.');
    if (/finalized|already finalized/i.test(m)) return new DataError('order_locked', 'Opname ini sudah selesai dan tidak bisa diubah.');
    if (/opname has no lines/i.test(m)) return new DataError('invalid', 'Isi hitung fisik minimal satu item sebelum menyelesaikan opname.');
    if (/opname not found/i.test(m)) return new DataError('not_found', 'Opname tidak ditemukan.');
    if (/does not track stock/i.test(m)) return new DataError('not_found', 'Ada barang yang tidak ditemukan atau stoknya tidak dilacak.');
    if (/invalid line|duplicate product|too many lines/i.test(m)) return new DataError('invalid', 'Isian opname ditolak server. Periksa jumlah dan item ganda.');
    return mapDbError(error);
  }

  /** Baris PO atau faktur dengan nama barang dan satuan dari daftar barang beli. */
  function poLines(rows: Row[], items: PurchaseItem[], kind: 'order' | 'invoice'): PurchaseLine[] {
    const item = new Map(items.map((i) => [i.productId, i]));
    return rows.map((l): PurchaseLine => {
      const it = item.get(l.product_id as string);
      const qty = Number(l.qty), price = Number(l.unit_price), disc = Number(l.discount ?? 0);
      return {
        id: l.id, productId: l.product_id, name: it?.name ?? '(barang tidak lagi dilacak)', unitId: l.unit_id, unit: it?.units.find((u) => u.unitId === l.unit_id)?.name ?? 'unit',
        qty, receivedQty: kind === 'invoice' ? Number(l.received_qty) : 0, unitPrice: price, discount: disc, lineTotal: kind === 'invoice' ? Number(l.line_total) : Math.round((qty * price - disc) * 100) / 100,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }

  function mapPurchaseError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur pembelian belum aktif di database (migrasi 0016 belum diterapkan).');
    if (/not allowed/i.test(m)) return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengelola pembelian.');
    if (/order already received|order is cancelled/i.test(m)) return new DataError('order_locked', 'PO ini sudah diterima atau dibatalkan dan tidak bisa diubah.');
    if (/order is not open/i.test(m)) return new DataError('invalid', 'PO ini tidak bisa dibuatkan faktur (belum dipesan atau sudah selesai).');
    if (/supplier not found/i.test(m)) return new DataError('not_found', 'Pemasok tidak ditemukan atau sudah nonaktif.');
    if (/invoice not found/i.test(m)) return new DataError('not_found', 'Faktur tidak ditemukan.');
    if (/invoice is not open/i.test(m)) return new DataError('invalid', 'Faktur ini tidak bisa dibayar lagi.');
    if (/payment account must be/i.test(m)) return new DataError('invalid', 'Pilih akun kas atau bank yang aktif.');
    if (/payment exceeds/i.test(m)) return new DataError('invalid', 'Jumlah bayar melebihi sisa hutang.');
    if (/received quantity exceeds/i.test(m)) return new DataError('invalid', 'Jumlah diterima melebihi sisa pesanan.');
    if (/does not track stock/i.test(m)) return new DataError('not_found', 'Ada barang yang tidak ditemukan atau stoknya tidak dilacak.');
    if (/unit does not belong/i.test(m)) return new DataError('invalid', 'Satuan tidak sesuai dengan barangnya.');
    if (/invalid line|invalid received|invalid amount|invalid term|negative|too many lines|no lines|larger than/i.test(m)) return new DataError('invalid', 'Isian pembelian ditolak server. Periksa jumlah, harga, diskon, dan baris.');
    return mapDbError(error);
  }

  function mapFinanceError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur jurnal manual belum aktif di database (migrasi 0017 belum diterapkan).');
    if (/not allowed|report access|permission denied/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik dan admin yang boleh melihat dan mengubah data keuangan.');
    if (/not balanced/i.test(m)) return new DataError('invalid', 'Jurnal tidak seimbang: total debit harus sama dengan total kredit.');
    if (/account not found or not postable/i.test(m)) return new DataError('invalid', 'Ada akun yang tidak ditemukan, nonaktif, atau berupa akun induk.');
    if (/books are locked|locked through/i.test(m)) return new DataError('order_locked', 'Tanggal jurnal berada di periode yang sudah dikunci.');
    if (/only manual journals/i.test(m)) return new DataError('invalid', 'Hanya jurnal manual dan saldo awal yang bisa dibalik.');
    if (/not posted/i.test(m)) return new DataError('invalid', 'Jurnal ini belum atau tidak lagi terposting.');
    if (/journal not found/i.test(m)) return new DataError('not_found', 'Jurnal tidak ditemukan.');
    if (/at least 2 lines|exactly one of|invalid amount|too many lines|description required|invalid kind|date required/i.test(m)) return new DataError('invalid', 'Isian jurnal ditolak server. Periksa tanggal, uraian, akun, dan jumlah.');
    if (error.code === '23505') return new DataError('invalid', 'Kode akun sudah dipakai akun lain.');
    if (/system account|system_key|category of an account/i.test(m)) return new DataError('invalid', 'Akun sistem atau akun yang sudah punya jurnal tidak bisa diubah seperti itu.');
    return mapDbError(error);
  }

  /** Semua halaman hasil query (server membatasi 1000 baris per permintaan). */
  async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const rows = (must(await build(from, from + 999) as { data: Row[] | null; error: { code?: string; message?: string } | null }) ?? []);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  const toAccount = (r: Row): Account => ({
    id: r.id, code: r.code, name: r.name, kind: r.kind === 'header' ? 'header' : 'detail', category: r.category as AccountCategory, isActive: !!r.is_active, ...(r.system_key ? { systemKey: r.system_key as string } : {}),
  });

  /** Baris jurnal terposting (dan yang di-void) sampai tanggal `to`, bentuk datar untuk rumus laporan. */
  async function finLinesUpTo(to: string, accountIds?: string[]): Promise<FinLine[]> {
    const accs = new Map((((must(await db().from('accounts').select('id,code,name,kind,category,system_key,is_active')) as Row[] | null) ?? []).map(toAccount)).map((a) => [a.id, a]));
    const ids = accountIds ?? [...accs.keys()];
    if (ids.length === 0) return [];
    const rows = await pageAll((f, t) => db().from('journal_lines')
      .select('entry_id,account_id,debit,credit,memo,journal_entries!inner(number,entry_date,description,source_type,status)')
      .in('account_id', ids).in('journal_entries.status', ['posted', 'voided']).lte('journal_entries.entry_date', to)
      .order('entry_id').order('line_no').range(f, t));
    return rows.map((l): FinLine => {
      const e = l.journal_entries as Row, a = accs.get(l.account_id as string)!;
      return { entryId: l.entry_id, number: e.number, date: e.entry_date, description: e.description, sourceType: e.source_type, status: e.status, accountId: a.id, code: a.code, name: a.name, category: a.category,
        debit: Number(l.debit), credit: Number(l.credit), ...(l.memo ? { memo: l.memo as string } : {}) };
    });
  }

  function mapKitchenError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur dapur belum aktif di database (migrasi 0018 belum diterapkan).');
    if (/not allowed/i.test(m)) return new DataError('forbidden', 'Akun ini tidak boleh mengakses dapur outlet ini.');
    if (/order not found/i.test(m)) return new DataError('not_found', 'Pesanan belum tersimpan di server. Simpan pesanan dulu.');
    if (/order is not active/i.test(m)) return new DataError('invalid', 'Pesanan ini sudah dibatalkan atau ditutup.');
    if (/invalid status|no items|too many items/i.test(m)) return new DataError('invalid', 'Pengubahan status ditolak server.');
    return mapDbError(error);
  }

  async function load(): Promise<Resolved> {
    const { data: u } = await client.auth.getUser();
    const userId = u.user?.id;
    if (!userId) throw new DataError('forbidden', 'Belum masuk. Silakan masuk dulu');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dq: any = db().from('devices').select('id,org_id,outlet_id,code').eq('is_active', true);
    dq = opts.deviceId ? dq.eq('id', opts.deviceId) : dq.eq('user_id', userId);
    const device = ((must(await dq.order('created_at').limit(1)) as Row[] | null) ?? [])[0] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let oq: any = db().from('outlets').select('id,org_id,code,name,address,phone,timezone').is('deleted_at', null).eq('is_active', true);
    if (device) oq = oq.eq('id', device.outlet_id);
    else if (opts.outletId) oq = oq.eq('id', opts.outletId);
    const outlet = ((must(await oq.order('created_at').limit(1)) as Row[] | null) ?? [])[0];
    if (!outlet) throw new DataError('not_found', 'Akunmu belum terhubung ke outlet mana pun');

    const [org, st, taxes] = await Promise.all([
      db().from('orgs').select('name').eq('id', outlet.org_id).single(),
      db().from('outlet_settings').select('*').eq('outlet_id', outlet.id).single(),
      db().from('taxes').select('id,name,rate').eq('is_default', true).is('deleted_at', null),
    ]);
    const s = must(st) as Row;
    const ctx: OutletContext = {
      orgName: (must(org) as Row).name, outletId: outlet.id, outletCode: outlet.code, outletName: outlet.name,
      timezone: outlet.timezone, deviceCode: device?.code ?? '-',
      address: outlet.address ?? undefined, phone: outlet.phone ?? undefined, receiptFooter: s.receipt_footer ?? undefined,
      settings: {
        taxCalc: s.tax_calc, taxMode: s.tax_mode, serviceChargePct: Number(s.service_charge_pct),
        serviceChargeTaxable: !!s.service_charge_taxable, serviceChargeOrderTypes: (s.service_charge_order_types ?? []) as OrderType[],
        roundingCashStep: Number(s.rounding_cash_step), roundingNoncashStep: Number(s.rounding_noncash_step),
        requireOpenShift: !!s.require_open_shift, allowNegativeStock: !!s.allow_negative_stock,
      },
      taxes: ((must(taxes) as Row[] | null) ?? []).map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) })),
    };
    return { ctx, orgId: outlet.org_id, device: device ? { id: device.id, code: device.code } : null };
  }

  async function requireDevice(): Promise<{ r: Resolved; deviceId: string }> {
    const r = await resolve();
    if (!r.device) throw new DataError('invalid', 'Perangkat kasir belum didaftarkan untuk akun ini');
    return { r, deviceId: r.device.id };
  }

  async function pushOps(deviceId: string, ops: { type: string; entityId?: string; payload: unknown }[]): Promise<void> {
    const body = ops.map((o) => ({ op_id: newId(), type: o.type, entity_id: o.entityId ?? null, payload: o.payload }));
    const { data, error } = await db().rpc('sync_push', { p_device: deviceId, p_ops: body });
    if (error) throw mapDbError(error);
    for (const r of (data ?? []) as { status: string; error?: string }[]) {
      if (r.status === 'rejected') throw mapOpError(r.error ?? '');
    }
  }

  // ---- penomoran: awalan {outlet}/{perangkat}/{yymmdd}/ harus cocok dengan aturan server ----
  const seqCache = new Map<string, number>();
  async function reserveNumber(r: Resolved, peek: boolean): Promise<string> {
    const at = now();
    const base = formatOrderNumber(r.ctx.outletCode, r.ctx.deviceCode, at, 1, r.ctx.timezone);
    const prefix = base.slice(0, base.lastIndexOf('/') + 1);
    const day = localDateKey(at, r.ctx.timezone);
    const rows = must(await db().from('orders').select('number').eq('outlet_id', r.ctx.outletId).like('number', `${prefix}%`)
      .order('number', { ascending: false }).limit(1)) as Row[] | null;
    const seq = nextSeq((rows ?? []).map((x) => x.number), seqCache.get(`${prefix}${day}`) ?? 0);
    if (!peek) seqCache.set(`${prefix}${day}`, seq);
    return formatOrderNumber(r.ctx.outletCode, r.ctx.deviceCode, at, seq, r.ctx.timezone);
  }

  async function fetchOrderRaw(id: string): Promise<Row | null> {
    return must(await db().from('orders').select(ORDER_RAW_SELECT).eq('id', id).maybeSingle()) as Row | null;
  }

  async function fetchOrders(f: (qb: any) => any, limit?: number): Promise<Order[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (limit !== undefined) {
      const rows = must(await f(db().from('orders').select(ORDER_SELECT)).order('opened_at', { ascending: false }).limit(limit)) as Row[] | null;
      return withCustomerNames((rows ?? []).map(toOrder));
    }
    const rows = await fetchAll<Row>((from, to) =>
      f(db().from('orders').select(ORDER_SELECT)).order('opened_at', { ascending: false }).order('id').range(from, to));
    return withCustomerNames(rows.map(toOrder));
  }

  function shiftQuery(deviceId: string) {
    return db().from('shifts').select('*').eq('device_id', deviceId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function refundRows(filter: (qb: any) => any): Promise<Refund[]> {
    const rows = await fetchAll<Row>((from, to) =>
      filter(db().from('refunds').select('id,number,order_id,total,reason,note,created_at,payment_methods(name),refund_items(order_item_id,qty,amount)').neq('status', 'failed'))
        .order('created_at').order('id').range(from, to));
    return rows.map((r): Refund => ({
      id: r.id, number: r.number, orderId: r.order_id, total: Number(r.total), reason: r.reason, note: r.note ?? undefined, methodName: r.payment_methods?.name ?? '', createdAt: r.created_at,
      items: ((r.refund_items ?? []) as Row[]).map((i) => ({ orderItemId: i.order_item_id, qty: Number(i.qty), amount: Number(i.amount) })),
    }));
  }

  /** Kumpulkan bahan laporan satu shift dari tabel (dijaga RLS). Dipakai tutup kasir dan ringkasan shift berjalan. */
  async function gatherShiftInputs(shiftId: string): Promise<ShiftInputs> {
    const [shiftRow, pays, moves, items, paidCount, shiftRefunds] = await Promise.all([
      db().from('shifts').select('*').eq('id', shiftId).single(),
      fetchAll<Row>((f, t) => db().from('payments').select('amount,payment_methods(name,kind)').eq('shift_id', shiftId).eq('status', 'succeeded').order('id').range(f, t)),
      fetchAll<Row>((f, t) => db().from('cash_movements').select('kind,amount').eq('shift_id', shiftId).order('id').range(f, t)),
      fetchAll<Row>((f, t) => db().from('order_items').select('product_id,name,qty,line_total,orders!inner(shift_id,status)')
        .eq('orders.shift_id', shiftId).eq('orders.status', 'paid').is('voided_at', null).order('id').range(f, t)),
      db().from('orders').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId).eq('status', 'paid'),
      fetchAll<Row>((f, t) => db().from('refunds').select('total,payment_methods(kind)').eq('shift_id', shiftId).neq('status', 'failed').order('id').range(f, t)),
    ]);
    const sumOf = (rows: Row[], f: (r: Row) => boolean) => rows.filter(f).reduce((a, x) => a + Number(x.amount), 0);
    return {
      shift: toShift(must(shiftRow) as Row),
      payments: pays.map((p) => ({ methodName: (p.payment_methods?.name ?? '?') as string, kind: (p.payment_methods?.kind ?? 'cash') as PaymentMethod['kind'], amount: Number(p.amount) })),
      cashIn: sumOf(moves, (m) => m.kind === 'in'), cashOut: sumOf(moves, (m) => m.kind === 'out'),
      cashRefunds: shiftRefunds.filter((r) => r.payment_methods?.kind === 'cash').reduce((a, r) => a + Number(r.total), 0),
      paidOrderCount: paidCount.count ?? 0,
      soldLines: items.map((i) => ({ productId: i.product_id as string, name: i.name as string, qty: Number(i.qty), amount: Number(i.line_total) })),
    };
  }

  /** Pemakaian kupon = baris diskon pada pesanan yang tidak dibatalkan (kolom used_count tidak dipakai: kasir tidak boleh menulisnya). */
  async function couponUsage(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const lines = (must(await db().from('order_discounts').select('coupon_id,order_id').in('coupon_id', ids)) as Row[] | null) ?? [];
    if (lines.length === 0) return out;
    const orderIds = [...new Set(lines.map((l) => l.order_id as string))];
    const live = new Set<string>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const rows = (must(await db().from('orders').select('id').in('id', orderIds.slice(i, i + 100)).neq('status', 'void')) as Row[] | null) ?? [];
      for (const r of rows) live.add(r.id as string);
    }
    for (const l of lines) if (live.has(l.order_id as string)) out.set(l.coupon_id as string, (out.get(l.coupon_id as string) ?? 0) + 1);
    return out;
  }

  /** Nama pelanggan untuk daftar pesanan (satu permintaan tambahan per 50 pelanggan berbeda). */
  async function withCustomerNames(orders: Order[]): Promise<Order[]> {
    const ids = [...new Set(orders.map((o) => o.customerId).filter((x): x is string => !!x))];
    if (ids.length === 0) return orders;
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 50) {
      const rows = (must(await db().from('customers').select('id,name').in('id', ids.slice(i, i + 50))) as Row[] | null) ?? [];
      for (const r of rows) names.set(r.id as string, r.name as string);
    }
    return orders.map((o) => (o.customerId && names.has(o.customerId) ? { ...o, customerName: names.get(o.customerId) } : o));
  }

  const self: DataLayer = {
    async getContext() {
      return JSON.parse(JSON.stringify((await resolve()).ctx)) as OutletContext;
    },

    // ---------- katalog ----------
    async getOutletSettings() {
      const { ctx } = await resolve();
      const [o, st] = await Promise.all([
        db().from('outlets').select('code,name,address,phone,timezone').eq('id', ctx.outletId).single(),
        db().from('outlet_settings').select('*').eq('outlet_id', ctx.outletId).single(),
      ]);
      const a = must(o) as Row, s = must(st) as Row;
      return {
        info: { code: a.code, name: a.name, address: a.address ?? '', phone: a.phone ?? '', timezone: a.timezone },
        options: {
          serviceChargePct: Number(s.service_charge_pct), serviceChargeTaxable: !!s.service_charge_taxable, serviceChargeOrderTypes: (s.service_charge_order_types ?? []) as OrderType[],
          roundingCashStep: Number(s.rounding_cash_step), roundingNoncashStep: Number(s.rounding_noncash_step), requireOpenShift: !!s.require_open_shift,
          allowNegativeStock: !!s.allow_negative_stock, receiptFooter: s.receipt_footer ?? '',
        },
      };
    },
    async saveOutletInfo(input) {
      const problem = outletInfoProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const row = must(await db().from('outlets').update({ name: input.name.trim(), address: input.address.trim() || null, phone: input.phone.trim() || null }).eq('id', ctx.outletId).select('id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('forbidden', 'Hanya pemilik yang bisa mengubah informasi outlet');
      resolved = null;
    },
    async getTaxSettings() {
      const { ctx } = await resolve();
      const [tax, st] = await Promise.all([
        db().from('taxes').select('id,name,rate,is_default').is('deleted_at', null).order('created_at').limit(1),
        db().from('outlet_settings').select('tax_calc').eq('outlet_id', ctx.outletId).single(),
      ]);
      const t = ((must(tax) as Row[] | null) ?? [])[0];
      const inclusive = (must(st) as Row).tax_calc === 'inclusive';
      return t ? { enabled: !!t.is_default, name: t.name, rate: Number(t.rate), inclusive } satisfies TaxSettings : { ...DEFAULT_TAX, inclusive };
    },
    async saveTaxSettings(input) {
      const problem = taxSettingsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { orgId, ctx } = await resolve();
      if (input.inclusive) {
        // mode harga termasuk pajak butuh migrasi 0012 (kolom orders.tax_inclusive); tolak dulu daripada pesanan ditolak server nanti
        const probe = await db().from('orders').select('tax_inclusive').limit(1);
        if (probe.error) throw new DataError('invalid', 'Mode harga sudah termasuk pajak belum bisa dinyalakan: database belum menerima migrasi 0012 (minta Claude menerapkannya).');
      }
      const rows = (must(await db().from('taxes').select('id').is('deleted_at', null).order('created_at').limit(1)) as Row[] | null) ?? [];
      const fields = { name: input.name.trim(), rate: input.rate, is_default: input.enabled };
      if (rows[0]) {
        const r = must(await db().from('taxes').update(fields).eq('id', rows[0].id).select('id').maybeSingle()) as Row | null;
        if (!r) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang bisa mengubah pajak');
      } else {
        must(await db().from('taxes').insert({ id: newId(), org_id: orgId, ...fields }));
      }
      const cur = (must(await db().from('outlet_settings').select('tax_calc').eq('outlet_id', ctx.outletId).single()) as Row).tax_calc as string;
      const taxCalc = input.inclusive ? 'inclusive' : cur === 'inclusive' ? 'after_discount' : cur;
      const s = must(await db().from('outlet_settings').update({ tax_calc: taxCalc }).eq('outlet_id', ctx.outletId).select('outlet_id').maybeSingle()) as Row | null;
      if (!s) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang bisa mengubah pajak');
      resolved = null;
    },
    async saveOutletOptions(input) {
      const problem = outletOptionsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const row = must(await db().from('outlet_settings').update({
        service_charge_pct: input.serviceChargePct, service_charge_taxable: input.serviceChargeTaxable, service_charge_order_types: input.serviceChargeOrderTypes,
        rounding_cash_step: input.roundingCashStep, rounding_noncash_step: input.roundingNoncashStep, require_open_shift: input.requireOpenShift,
        allow_negative_stock: input.allowNegativeStock, receipt_footer: input.receiptFooter.trim() || null,
      }).eq('outlet_id', ctx.outletId).select('outlet_id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang bisa mengubah pengaturan outlet');
      resolved = null;
    },
    async listFloors() {
      const { ctx } = await resolve();
      const rows = must(await db().from('floors').select('id,name,sort').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort').order('name')) as Row[] | null;
      return (rows ?? []).map((r): Floor => ({ id: r.id, name: r.name, sort: Number(r.sort ?? 0) }));
    },
    async saveFloor(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama lantai wajib diisi');
      const { orgId, ctx } = await resolve();
      const floors = await self.listFloors();
      if (floors.some((f) => f.id !== input.id && f.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Lantai "${name}" sudah ada`);
      if (input.id) {
        const row = must(await db().from('floors').update({ name }).eq('id', input.id).is('deleted_at', null).select('id,name,sort').maybeSingle()) as Row | null;
        if (!row) throw new DataError('not_found', 'Lantai tidak ditemukan');
        return { id: row.id, name: row.name, sort: Number(row.sort ?? 0) };
      }
      const row = must(await db().from('floors').insert({ id: newId(), org_id: orgId, outlet_id: ctx.outletId, name, sort: floors.length + 1 }).select('id,name,sort').single()) as Row;
      return { id: row.id, name: row.name, sort: Number(row.sort ?? 0) };
    },
    async deleteFloor(id) {
      const status = await self.listTableStatus();
      const inUse = status.find((t) => t.floorId === id && t.order);
      if (inUse) throw new DataError('invalid', `Meja ${inUse.name} sedang dipakai pesanan ${inUse.order!.number}. Selesaikan dulu pesanannya`);
      const cur = must(await db().from('floors').select('name').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Lantai tidak ditemukan');
      const at = new Date().toISOString();
      for (const t of status.filter((x) => x.floorId === id)) must(await db().from('tables').update({ deleted_at: at }).eq('id', t.id));
      must(await db().from('floors').update({ deleted_at: at }).eq('id', id));
    },
    async listTables() {
      const { ctx } = await resolve();
      const rows = must(await db().from('tables').select('id,floor_id,name,sort').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort').order('name')) as Row[] | null;
      return (rows ?? []).map((r): DiningTable => ({ id: r.id, floorId: r.floor_id ?? null, name: r.name, sort: Number(r.sort ?? 0) }));
    },
    async saveTable(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama meja wajib diisi');
      const { orgId, ctx } = await resolve();
      const tables = await self.listTables();
      if (tables.some((t) => t.id !== input.id && t.floorId === input.floorId && t.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Meja "${name}" sudah ada di lantai ini`);
      const out = (r: Row): DiningTable => ({ id: r.id, floorId: r.floor_id ?? null, name: r.name, sort: Number(r.sort ?? 0) });
      if (input.id) {
        const row = must(await db().from('tables').update({ name, floor_id: input.floorId }).eq('id', input.id).is('deleted_at', null).select('id,floor_id,name,sort').maybeSingle()) as Row | null;
        if (!row) throw new DataError('not_found', 'Meja tidak ditemukan');
        return out(row);
      }
      const row = must(await db().from('tables').insert({ id: newId(), org_id: orgId, outlet_id: ctx.outletId, floor_id: input.floorId, name, sort: tables.length + 1 }).select('id,floor_id,name,sort').single()) as Row;
      return out(row);
    },
    async deleteTable(id) {
      const busy = (await self.listTableStatus()).find((t) => t.id === id);
      if (!busy) throw new DataError('not_found', 'Meja tidak ditemukan');
      if (busy.order) throw new DataError('invalid', `Meja ini sedang dipakai pesanan ${busy.order.number}. Selesaikan dulu pesanannya`);
      must(await db().from('tables').update({ deleted_at: new Date().toISOString() }).eq('id', id));
    },
    moveOrderTable: (orderId, toTableId) => tableOps.moveOrderTable(orderId, toTableId),
    mergeOrders: (input) => tableOps.mergeOrders(input),
    async listTableStatus() {
      const tables = await self.listTables();
      const rows = must(await db().from('orders').select('id,number,table_id,label,guest_count,total,opened_at').not('table_id', 'is', null).in('status', ['open', 'partially_paid']).order('opened_at')) as Row[] | null;
      const byTable = new Map((rows ?? []).map((o) => [o.table_id as string, o]));
      return tables.map((t): TableStatus => {
        const o = byTable.get(t.id);
        return o ? { ...t, order: { id: o.id, number: o.number, label: o.label ?? undefined, guestCount: o.guest_count ?? undefined, total: Number(o.total), openedAt: o.opened_at } } : t;
      });
    },
    async listCategories() {
      const [cats, ing] = await Promise.all([
        fetchAll<Row>((f, t) => db().from('categories').select('id,name,sort,department_id').is('deleted_at', null).order('sort').order('name').order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('products').select('category_id').eq('kind', 'ingredient').not('category_id', 'is', null).is('deleted_at', null).order('id').range(f, t)),
      ]);
      const ingredientCats = new Set(ing.map((r) => r.category_id as string));
      return cats.filter((c) => !ingredientCats.has(c.id)).map((c): Category => ({ id: c.id, name: c.name, sort: Number(c.sort ?? 0), departmentId: c.department_id ?? null }));
    },
    async saveCategory(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama kategori wajib diisi');
      const { orgId } = await resolve();
      const cols = 'id,name,sort,department_id';
      const out = (row: Row): Category => ({ id: row.id, name: row.name, sort: Number(row.sort ?? 0), departmentId: row.department_id ?? null });
      const clash = (e: unknown): never => { throw e instanceof DataError && /duplicate|unique|already/i.test(e.message) ? new DataError('invalid', `Kategori "${name}" sudah ada`) : e; };
      try {
        if (input.id) {
          const patch: Record<string, unknown> = { name };
          if (input.departmentId !== undefined) patch.department_id = input.departmentId;
          const row = must(await db().from('categories').update(patch).eq('id', input.id).is('deleted_at', null).select(cols).maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Kategori tidak ditemukan');
          return out(row);
        }
        const sort = (await self.listCategories()).length + 1;
        return out(must(await db().from('categories').insert({ id: newId(), org_id: orgId, name, sort, department_id: input.departmentId ?? null }).select(cols).single()) as Row);
      } catch (e) { return clash(e); }
    },
    async deleteCategory(id) {
      const cur = must(await db().from('categories').select('name').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Kategori tidak ditemukan');
      must(await db().from('products').update({ category_id: null }).eq('category_id', id));
      // nama dilepas agar bisa dipakai lagi (unik per organisasi, baris terhapus tetap ikut hitungan)
      must(await db().from('categories').update({ deleted_at: new Date().toISOString(), name: `${cur.name} (dihapus ${id.slice(0, 8)})` }).eq('id', id));
    },
    async categoryProductCounts() {
      const rows = await fetchAll<Row>((f, t) => db().from('products').select('category_id').in('kind', ['goods', 'service']).is('parent_id', null).not('category_id', 'is', null).is('deleted_at', null).order('id').range(f, t));
      const out: Record<string, number> = {};
      for (const r of rows) out[r.category_id] = (out[r.category_id] ?? 0) + 1;
      return out;
    },
    async listDepartments() {
      const rows = await fetchAll<Row>((f, t) => db().from('departments').select('id,name,sort').is('deleted_at', null).order('sort').order('name').order('id').range(f, t));
      return rows.map((r): Department => ({ id: r.id, name: r.name, sort: Number(r.sort ?? 0) }));
    },
    async saveDepartment(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama departemen wajib diisi');
      const { orgId } = await resolve();
      const out = (row: Row): Department => ({ id: row.id, name: row.name, sort: Number(row.sort ?? 0) });
      try {
        if (input.id) {
          const row = must(await db().from('departments').update({ name }).eq('id', input.id).is('deleted_at', null).select('id,name,sort').maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Departemen tidak ditemukan');
          return out(row);
        }
        const sort = (await self.listDepartments()).length + 1;
        return out(must(await db().from('departments').insert({ id: newId(), org_id: orgId, name, sort }).select('id,name,sort').single()) as Row);
      } catch (e) { throw e instanceof DataError && /duplicate|unique|already/i.test(e.message) ? new DataError('invalid', `Departemen "${name}" sudah ada`) : e; }
    },
    async deleteDepartment(id) {
      const cur = must(await db().from('departments').select('name').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Departemen tidak ditemukan');
      must(await db().from('categories').update({ department_id: null }).eq('department_id', id));
      // nama dilepas agar bisa dipakai lagi (unik per organisasi, baris terhapus tetap ikut hitungan)
      must(await db().from('departments').update({ deleted_at: new Date().toISOString(), name: `${cur.name} (dihapus ${id.slice(0, 8)})` }).eq('id', id));
    },
    async listBundles(q = {}) {
      let qb = db().from('products').select(PRODUCT_SELECT).eq('kind', 'bundle').is('deleted_at', null);
      if (!q.includeInactive) qb = qb.eq('is_active', true);
      const rows = (must(await qb.order('name')) as Row[] | null) ?? [];
      if (rows.length === 0) return [];
      const items = (must(await db().from('bundle_items').select('bundle_id,product_id,qty').in('bundle_id', rows.map((r) => r.id))) as Row[] | null) ?? [];
      const names = new Map<string, string>();
      const compIds = [...new Set(items.map((i) => i.product_id as string))];
      if (compIds.length) for (const r of (must(await db().from('products').select('id,name').in('id', compIds)) as Row[] | null) ?? []) names.set(r.id, r.name);
      return rows.map((r): Bundle => {
        const p = toProduct(r);
        return { id: p.id, name: p.name, categoryId: p.categoryId, price: p.price, sku: p.sku, isActive: p.isActive,
          items: items.filter((i) => i.bundle_id === p.id).map((i) => ({ productId: i.product_id, name: names.get(i.product_id) ?? '?', qty: Number(i.qty) })) };
      });
    },
    async saveBundle(input) {
      const problem = bundleProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { orgId } = await resolve();
      const name = input.name.trim();
      const comps = (must(await db().from('products').select('id,kind').in('id', input.items.map((i) => i.productId)).is('deleted_at', null)) as Row[] | null) ?? [];
      if (comps.length !== new Set(input.items.map((i) => i.productId)).size) throw new DataError('not_found', 'Ada produk dalam paket yang tidak ditemukan');
      if (comps.some((c) => c.kind === 'bundle')) throw new DataError('invalid', 'Paket tidak boleh berisi paket lain');
      const sameName = (must(await db().from('products').select('id').eq('kind', 'bundle').ilike('name', name.replace(/[%_]/g, '\\$&')).is('deleted_at', null)) as Row[] | null) ?? [];
      if (sameName.some((r) => r.id !== input.id)) throw new DataError('invalid', `Paket "${name}" sudah ada`);
      const sku = input.sku?.trim() || null;
      let id = input.id;
      try {
        if (id) {
          const patch: Row = { name, category_id: input.categoryId };
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          const row = must(await db().from('products').update(patch).eq('id', id).eq('kind', 'bundle').select('id').maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Paket tidak ditemukan');
          must(await db().from('product_units').update({ price: input.price, sku }).eq('product_id', id).eq('is_base', true).is('deleted_at', null).select('id'));
        } else {
          const unit = ((must(await db().from('units').select('id').eq('name', 'pcs').is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
          if (!unit) throw new DataError('not_found', "Satuan 'pcs' belum ada di org ini");
          id = newId();
          must(await db().from('products').insert({ id, org_id: orgId, kind: 'bundle', name, category_id: input.categoryId, base_unit_id: unit.id, is_sellable: true, show_in_menu: true, track_stock: false, is_favorite: false, is_active: input.isActive ?? true }));
          must(await db().from('product_units').insert({ org_id: orgId, product_id: id, unit_id: unit.id, conversion: 1, is_base: true, price: input.price, sku }));
        }
        must(await db().from('bundle_items').delete().eq('bundle_id', id));
        must(await db().from('bundle_items').insert(input.items.map((i) => ({ bundle_id: id, product_id: i.productId, org_id: orgId, qty: i.qty }))));
      } catch (e) {
        if (e instanceof DataError && /sudah ada/.test(e.message)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
        throw e;
      }
      return (await self.listBundles({ includeInactive: true })).find((b) => b.id === id)!;
    },
    async setBundleActive(id, active) {
      const row = must(await db().from('products').update({ is_active: active }).eq('id', id).eq('kind', 'bundle').select('id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('not_found', 'Paket tidak ditemukan');
    },
    async listExtraGroups() {
      const rows = must(await db().from('extra_groups')
        .select('id,name,is_required,select_mode,max_select,extra_options(id,name,price,sort,deleted_at),product_extra_groups(product_id)')
        .is('deleted_at', null).order('name')) as Row[] | null;
      return (rows ?? []).map((g): ExtraGroup => ({
        id: g.id, name: g.name, required: !!g.is_required, mode: g.select_mode, maxSelect: g.max_select ?? null,
        options: ((g.extra_options ?? []) as Row[]).filter((o) => !o.deleted_at).map((o) => ({ id: o.id, name: o.name, price: Number(o.price), sort: Number(o.sort) })).sort((a, b) => a.sort - b.sort),
        productIds: ((g.product_extra_groups ?? []) as Row[]).map((x) => x.product_id),
      }));
    },
    async saveExtraGroup(input) {
      const problem = extraGroupProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { orgId } = await resolve();
      const name = input.name.trim();
      const existing = await self.listExtraGroups();
      if (existing.some((g) => g.id !== input.id && g.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Grup "${name}" sudah ada`);
      const old = input.id ? existing.find((g) => g.id === input.id) : undefined;
      if (input.id && !old) throw new DataError('not_found', 'Grup tidak ditemukan');
      const id = old?.id ?? newId();
      const row = { name, is_required: input.required, select_mode: input.mode, max_select: input.mode === 'single' ? null : input.maxSelect ?? null };
      if (old) must(await db().from('extra_groups').update(row).eq('id', id));
      else must(await db().from('extra_groups').insert({ id, org_id: orgId, ...row }));
      // pilihan: yang dihapus dari daftar dinonaktifkan (soft delete) agar pesanan lama tetap merujuk baris yang ada
      const keep = new Map((old?.options ?? []).map((o) => [o.id, o]));
      const opts = input.options.filter((o) => o.name.trim()).map((o, k) => ({ id: o.id && keep.has(o.id) ? o.id : newId(), name: o.name.trim(), price: o.price, sort: k + 1 }));
      const gone = [...keep.keys()].filter((k) => !opts.some((o) => o.id === k));
      if (gone.length) must(await db().from('extra_options').update({ deleted_at: new Date().toISOString() }).in('id', gone));
      if (opts.length) must(await db().from('extra_options').upsert(opts.map((o) => ({ ...o, org_id: orgId, group_id: id, deleted_at: null })), { onConflict: 'id' }));
      const ids = [...new Set(input.productIds)];
      const drop = (old?.productIds ?? []).filter((p) => !ids.includes(p));
      if (drop.length) must(await db().from('product_extra_groups').delete().eq('group_id', id).in('product_id', drop));
      if (ids.length) must(await db().from('product_extra_groups').upsert(ids.map((p, k) => ({ product_id: p, group_id: id, org_id: orgId, sort: k })), { onConflict: 'product_id,group_id' }));
      return (await self.listExtraGroups()).find((g) => g.id === id)!;
    },
    async deleteExtraGroup(id) {
      const cur = must(await db().from('extra_groups').select('id').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Grup tidak ditemukan');
      must(await db().from('product_extra_groups').delete().eq('group_id', id));
      must(await db().from('extra_groups').update({ deleted_at: new Date().toISOString() }).eq('id', id));
    },
    async listProducts(q = {}) {
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(PRODUCT_SELECT).eq('is_sellable', true).in('kind', ['goods', 'service', 'bundle']).is('deleted_at', null);
        if (!q.includeInactive) qb = qb.eq('is_active', true).eq('show_in_menu', true);
        if (q.categoryId) qb = qb.eq('category_id', q.categoryId);
        return qb.order('name').order('id').range(f, t);
      });
      const s = q.search?.trim().toLowerCase();
      return rows.map(toProduct).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s));
    },
    async getProduct(id) {
      const row = must(await db().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle()) as Row | null;
      return row ? toProduct(row) : null;
    },
    async saveProduct(input: ProductInput) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      if (!Number.isFinite(input.price) || input.price < 0) throw new DataError('invalid', 'Harga tidak boleh negatif');
      const price = Math.round(input.price);
      const sku = input.sku?.trim() || null;
      const { orgId } = await resolve();
      try {
        if (input.id) {
          const patch: Row = { name, category_id: input.categoryId };
          if (input.kind) patch.kind = input.kind;
          if (input.trackStock !== undefined) patch.track_stock = input.trackStock;
          if (input.isFavorite !== undefined) patch.is_favorite = input.isFavorite;
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          const row = must(await db().from('products').update(patch).eq('id', input.id).select('id').maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Produk tidak ditemukan');
          must(await db().from('product_units').update({ price, sku }).eq('product_id', input.id).eq('is_base', true).is('deleted_at', null).select('id'));
          return (await self.getProduct(input.id))!;
        }
        const unit = ((must(await db().from('units').select('id').eq('name', 'pcs').is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
        if (!unit) throw new DataError('not_found', "Satuan 'pcs' belum ada di org ini");
        const id = newId();
        must(await db().from('products').insert({
          id, org_id: orgId, kind: input.kind ?? 'goods', name, category_id: input.categoryId, base_unit_id: unit.id,
          is_sellable: true, show_in_menu: true, track_stock: input.trackStock ?? true, is_favorite: input.isFavorite ?? false,
          is_active: input.isActive ?? true,
        }));
        must(await db().from('product_units').insert({ org_id: orgId, product_id: id, unit_id: unit.id, conversion: 1, is_base: true, price, sku }));
        return (await self.getProduct(id))!;
      } catch (e) {
        if (e instanceof DataError && /sudah ada/.test(e.message)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
        throw e;
      }
    },
    async setProductActive(id, active) {
      const row = must(await db().from('products').update({ is_active: active }).eq('id', id).select('id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('not_found', 'Produk tidak ditemukan');
    },

    // ---------- katalog gaya pemilik (produk + varian) ----------
    async listCatalog(q = {}) {
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(PRODUCT_SELECT).in('kind', ['goods', 'service']).is('deleted_at', null);
        if (q.categoryId) qb = qb.eq('category_id', q.categoryId);
        return qb.order('name').order('id').range(f, t);
      });
      let list = assembleCatalog(rows.map(toProduct));
      if (!q.includeInactive) list = list.filter((p) => p.isActive);
      const s = q.search?.trim().toLowerCase();
      if (s) list = list.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s) || p.variants.some((v) => v.label.toLowerCase().includes(s) || (v.sku ?? '').toLowerCase().includes(s)));
      return list;
    },
    async getCatalogProduct(id) {
      const row = must(await db().from('products').select(PRODUCT_SELECT).eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!row) return null;
      const parentId = (row.parent_id as string | null) ?? (row.is_sellable === false ? (row.id as string) : null);
      if (!parentId) return assembleCatalog([toProduct(row)])[0] ?? null;
      const head = parentId === row.id ? row : (must(await db().from('products').select(PRODUCT_SELECT).eq('id', parentId).maybeSingle()) as Row | null);
      const kids = (must(await db().from('products').select(PRODUCT_SELECT).eq('parent_id', parentId).is('deleted_at', null)) as Row[] | null) ?? [];
      return assembleCatalog([...(head ? [toProduct(head)] : []), ...kids.map(toProduct)])[0] ?? null;
    },
    async saveCatalogProduct(input: CatalogInput): Promise<CatalogProduct> {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      const problem = variantsProblem(input.variants);
      if (problem) throw new DataError('invalid', problem);
      const kind = input.kind ?? 'goods';
      if (input.variants.length === 0) {
        if (input.id) { // dari produk berarian menjadi tunggal: varian lama diarsipkan, induk dijual langsung
          const kids = (must(await db().from('products').select('id').eq('parent_id', input.id).is('deleted_at', null)) as Row[] | null) ?? [];
          if (kids.length) {
            must(await db().from('products').update({ deleted_at: now().toISOString(), is_active: false }).eq('parent_id', input.id));
            must(await db().from('products').update({ is_sellable: true, show_in_menu: true }).eq('id', input.id));
          }
        }
        const p = await self.saveProduct({ id: input.id, name, categoryId: input.categoryId, price: input.price, sku: input.sku, kind, trackStock: input.trackStock, isFavorite: input.isFavorite, isActive: input.isActive });
        return (await self.getCatalogProduct(p.id))!;
      }
      for (const v of input.variants) if (!Number.isFinite(v.price) || v.price < 0) throw new DataError('invalid', 'Harga varian tidak valid');
      const { orgId } = await resolve();
      const unit = ((must(await db().from('units').select('id').eq('name', 'pcs').is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
      if (!unit) throw new DataError('not_found', "Satuan 'pcs' belum ada di org ini");
      const parentId = input.id ?? newId();
      const trackStock = input.trackStock ?? true;
      const isFavorite = input.isFavorite ?? false;
      const groupActive = input.isActive ?? true;
      try {
        const existing = input.id ? (must(await db().from('products').select('id').eq('id', input.id).maybeSingle()) as Row | null) : null;
        if (!existing) {
          must(await db().from('products').insert({ id: parentId, org_id: orgId, kind, name, category_id: input.categoryId, base_unit_id: unit.id,
            is_sellable: false, show_in_menu: false, track_stock: false, is_favorite: isFavorite, is_active: groupActive }));
        } else {
          must(await db().from('products').update({ name, category_id: input.categoryId, kind, is_sellable: false, show_in_menu: false, is_favorite: isFavorite, is_active: groupActive }).eq('id', parentId));
        }
        const kids = (must(await db().from('products').select('id').eq('parent_id', parentId).is('deleted_at', null)) as Row[] | null) ?? [];
        const kidIds = new Set(kids.map((k) => k.id as string));
        const keep = new Set(input.variants.map((v) => v.id).filter((x): x is string => !!x && kidIds.has(x)));
        const drop = [...kidIds].filter((id) => !keep.has(id));
        if (drop.length) must(await db().from('products').update({ deleted_at: now().toISOString(), is_active: false }).in('id', drop));
        for (const v of input.variants) {
          const childName = variantProductName(name, v.label);
          const price = Math.round(v.price);
          const sku = v.sku?.trim() || null;
          const active = groupActive && (v.isActive ?? true);
          if (v.id && kidIds.has(v.id)) {
            must(await db().from('products').update({ name: childName, category_id: input.categoryId, kind, is_active: active, track_stock: trackStock, is_favorite: isFavorite }).eq('id', v.id));
            must(await db().from('product_units').update({ price, sku }).eq('product_id', v.id).eq('is_base', true).is('deleted_at', null).select('id'));
          } else {
            const id = newId();
            must(await db().from('products').insert({ id, org_id: orgId, kind, name: childName, category_id: input.categoryId, base_unit_id: unit.id, parent_id: parentId,
              is_sellable: true, show_in_menu: true, track_stock: trackStock, is_favorite: isFavorite, is_active: active }));
            must(await db().from('product_units').insert({ org_id: orgId, product_id: id, unit_id: unit.id, conversion: 1, is_base: true, price, sku }));
          }
        }
      } catch (e) {
        if (e instanceof DataError && /sudah ada/.test(e.message)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
        throw e;
      }
      return (await self.getCatalogProduct(parentId))!;
    },
    async setCatalogActive(id, active) {
      const rows = (must(await db().from('products').update({ is_active: active }).or(`id.eq.${id},parent_id.eq.${id}`).is('deleted_at', null).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Produk tidak ditemukan');
    },

    async setProductPhoto(productId, photo) {
      const { orgId } = await resolve();
      const head = must(await db().from('products').select('id').eq('id', productId).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!head) throw new DataError('not_found', 'Produk tidak ditemukan');
      if (photo) {
        const problem = photoProblem(photo);
        if (problem) throw new DataError('invalid', problem);
        const path = photoPath(orgId, productId, photo.contentType, now().getTime());
        const up = await client.storage.from(PHOTO_BUCKET).upload(path, photo.data, { contentType: photo.contentType, cacheControl: '31536000', upsert: false });
        if (up.error) throw new DataError('invalid', `Foto gagal diunggah: ${up.error.message}`);
        const url = client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
        must(await db().from('products').update({ photo_path: url }).eq('id', productId));
      } else {
        must(await db().from('products').update({ photo_path: null }).or(`id.eq.${productId},parent_id.eq.${productId}`));
      }
      return (await self.getCatalogProduct(productId))!;
    },

    // ---------- pelanggan ----------
    async listCustomers(q = {}) {
      let qb = db().from('customers').select(CUSTOMER_COLUMNS).is('deleted_at', null).order('name').limit(Math.min(q.limit ?? 50, 500));
      const term = searchTerm(q.search ?? '');
      if (term) {
        const digits = term.replace(/\D/g, '');
        qb = qb.or([`name.ilike.%${term}%`, `code.ilike.%${term}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(','));
      }
      return ((must(await qb) as Row[] | null) ?? []).map(toCustomer);
    },
    async getCustomer(id) {
      const row = must(await db().from('customers').select(CUSTOMER_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      return row ? toCustomer(row) : null;
    },
    async saveCustomer(input) {
      const problem = customerProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
      if (phone) {
        let dup = db().from('customers').select('id,name').eq('phone', phone).is('deleted_at', null).limit(1);
        if (input.id) dup = dup.neq('id', input.id);
        const hit = ((must(await dup) as Row[] | null) ?? [])[0];
        if (hit) throw new DataError('invalid', `Nomor ini sudah dipakai pelanggan ${hit.name}.`);
      }
      const fields = {
        name: input.name.trim(), phone, email: input.email?.trim() || null, gender: input.gender ?? null, birth_date: input.birthDate || null,
        city: input.city?.trim() || null, address: input.address?.trim() || null, note: input.note?.trim() || null,
      };
      if (input.id) {
        const rows = (must(await db().from('customers').update(fields).eq('id', input.id).is('deleted_at', null).select(CUSTOMER_COLUMNS)) as Row[] | null) ?? [];
        if (!rows[0]) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
        return toCustomer(rows[0]);
      }
      const { orgId } = await resolve();
      const rows = must(await db().from('customers').insert({ ...fields, org_id: orgId }).select(CUSTOMER_COLUMNS)) as Row[] | null;
      return toCustomer(rows![0]!);
    },
    async deleteCustomer(id) {
      const rows = (must(await db().from('customers').update({ deleted_at: now().toISOString() }).eq('id', id).is('deleted_at', null).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
    },

    // ---------- promo dan kupon ----------
    async listPromotions(q = {}) {
      let qb = db().from('promotions').select(PROMO_COLUMNS).is('deleted_at', null).order('name');
      if (q.activeOnly) qb = qb.eq('is_active', true);
      return ((must(await qb) as Row[] | null) ?? []).map(toPromotion);
    },
    async savePromotion(input) {
      const problem = promotionProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const itemKind = input.kind === 'percent_item' || input.kind === 'amount_item' || input.kind === 'free_item';
      const fields = {
        name: input.name.trim(), kind: input.kind, value: input.kind === 'free_item' ? 0 : input.value, min_spend: input.minSpend ?? 0,
        product_ids: itemKind ? input.productIds ?? [] : [], free_product_id: input.kind === 'free_item' ? input.freeProductId ?? null : null,
        order_types: input.orderTypes ?? ['dine_in', 'takeaway', 'delivery', 'service'], starts_at: input.startsAt || null, ends_at: input.endsAt || null,
        is_active: input.isActive ?? true,
      };
      if (input.id) {
        const rows = (must(await db().from('promotions').update(fields).eq('id', input.id).is('deleted_at', null).select(PROMO_COLUMNS)) as Row[] | null) ?? [];
        if (!rows[0]) throw new DataError('not_found', 'Promo tidak ditemukan');
        return toPromotion(rows[0]);
      }
      const { orgId } = await resolve();
      const rows = must(await db().from('promotions').insert({ ...fields, org_id: orgId }).select(PROMO_COLUMNS)) as Row[] | null;
      return toPromotion(rows![0]!);
    },
    async deletePromotion(id) {
      const rows = (must(await db().from('promotions').update({ deleted_at: now().toISOString() }).eq('id', id).is('deleted_at', null).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Promo tidak ditemukan');
    },
    async listCoupons(promotionId) {
      let qb = db().from('coupons').select(COUPON_COLUMNS).order('code');
      if (promotionId) qb = qb.eq('promotion_id', promotionId);
      const rows = (must(await qb) as Row[] | null) ?? [];
      const used = await couponUsage(rows.map((r) => r.id as string));
      return rows.map((r) => toCoupon(r, used.get(r.id as string) ?? 0));
    },
    async saveCoupon(input) {
      const problem = couponInputProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const code = normalizeCode(input.code);
      let dup = db().from('coupons').select('id').eq('code', code).limit(1);
      if (input.id) dup = dup.neq('id', input.id);
      if ((((must(await dup) as Row[] | null) ?? [])[0])) throw new DataError('invalid', `Kode ${code} sudah dipakai kupon lain.`);
      const fields = { promotion_id: input.promotionId, code, usage_limit: input.usageLimit ?? null, valid_from: input.validFrom || null, valid_to: input.validTo || null, is_active: input.isActive ?? true };
      let row: Row | undefined;
      if (input.id) {
        row = ((must(await db().from('coupons').update(fields).eq('id', input.id).select(COUPON_COLUMNS)) as Row[] | null) ?? [])[0];
        if (!row) throw new DataError('not_found', 'Kupon tidak ditemukan');
      } else {
        const { orgId } = await resolve();
        row = ((must(await db().from('coupons').insert({ ...fields, org_id: orgId }).select(COUPON_COLUMNS)) as Row[] | null) ?? [])[0];
      }
      return toCoupon(row!, (await couponUsage([row!.id as string])).get(row!.id as string) ?? 0);
    },
    async deleteCoupon(id) {
      if (((await couponUsage([id])).get(id) ?? 0) > 0) throw new DataError('invalid', 'Kupon ini sudah pernah dipakai. Nonaktifkan saja supaya riwayatnya utuh.');
      const rows = (must(await db().from('coupons').delete().eq('id', id).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Kupon tidak ditemukan');
    },
    async findCoupon(code) {
      const row = ((must(await db().from('coupons').select(COUPON_COLUMNS).eq('code', normalizeCode(code)).limit(1)) as Row[] | null) ?? [])[0];
      if (!row) return null;
      const promo = ((must(await db().from('promotions').select(PROMO_COLUMNS).eq('id', row.promotion_id).is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
      if (!promo) return null;
      return { coupon: toCoupon(row, (await couponUsage([row.id as string])).get(row.id as string) ?? 0), promotion: toPromotion(promo) };
    },

    // ---------- loyalti ----------
    async getLoyaltyRules() {
      const row = ((must(await db().from('loyalty_rules').select('earn_amount,earn_points,redeem_value_per_point,is_active').limit(1)) as Row[] | null) ?? [])[0];
      if (!row) return { ...DEFAULT_LOYALTY };
      return { isActive: !!row.is_active, earnAmount: Number(row.earn_amount), earnPoints: Number(row.earn_points), redeemValuePerPoint: Number(row.redeem_value_per_point) } satisfies LoyaltyRules;
    },
    async saveLoyaltyRules(rules) {
      const problem = loyaltyRulesProblem(rules);
      if (problem) throw new DataError('invalid', problem);
      const { orgId } = await resolve();
      must(await db().from('loyalty_rules').upsert({
        org_id: orgId, earn_amount: rules.earnAmount, earn_points: rules.earnPoints, redeem_value_per_point: rules.redeemValuePerPoint, is_active: rules.isActive, updated_at: now().toISOString(),
      }, { onConflict: 'org_id' }));
      return { ...rules };
    },
    async listLoyaltyLedger(customerId, limit = 50) {
      const rows = (must(await db().from('loyalty_ledger').select('id,customer_id,order_id,points_delta,kind,note,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(limit)) as Row[] | null) ?? [];
      return rows.map((r): LoyaltyEntry => ({ id: r.id, customerId: r.customer_id, points: Number(r.points_delta), kind: r.kind, createdAt: r.created_at, ...(r.order_id ? { orderId: r.order_id } : {}), ...(r.note ? { note: r.note } : {}) }));
    },
    async adjustPoints(customerId, delta, note) {
      if (!Number.isInteger(delta) || delta === 0) throw new DataError('invalid', 'Isi jumlah poin yang berbeda dari nol.');
      const { data, error } = await db().rpc('loyalty_adjust', { p_customer: customerId, p_delta: delta, p_note: note ?? null });
      if (error) {
        if (/negative/i.test(error.message)) throw new DataError('invalid', 'Saldo poin tidak boleh menjadi negatif.');
        if (/not allowed/i.test(error.message)) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengoreksi poin.');
        throw mapDbError(error);
      }
      return Number(data);
    },

    // ---------- stok ----------
    async listStock(q) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const [prods, units, bals] = await Promise.all([
        fetchAll<Row>((f, t) => db().from('products').select('id,name,kind,base_unit_id,stock_alert_min').in('kind', ['goods', 'ingredient']).eq('track_stock', true).is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('units').select('id,name').is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('stock_balances').select('product_id,qty,avg_cost').eq('location_id', loc).order('product_id').range(f, t)),
      ]);
      const unitName = new Map(units.map((u) => [u.id as string, u.name as string]));
      const bal = new Map(bals.map((b) => [b.product_id as string, b]));
      return prods.map((p) => toStockItem(p, unitName, bal.get(p.id as string)))
        .filter((i) => (!q?.kind || i.kind === q.kind) && stockFilterMatches(i, q?.status) && stockSearchMatches(i, q?.search))
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async postStock(input) {
      const problem = stockPostProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const { error } = await db().rpc('stock_post', {
        p_location: loc, p_product: input.productId, p_kind: input.kind, p_qty: input.qty,
        p_unit_cost: input.kind === 'adjust_in' ? input.unitCost ?? null : null, p_reason: input.reason?.trim() || null, p_key: input.id,
      });
      if (error) {
        if (/not allowed/i.test(error.message)) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengubah stok.');
        if (/product not found|does not track stock/i.test(error.message)) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak.');
        if (/qty must be|unit cost|reason too long|kind must be/i.test(error.message)) throw new DataError('invalid', 'Isian stok ditolak server. Periksa jumlah, harga, dan alasan.');
        throw mapDbError(error);
      }
      const [p, units, b] = await Promise.all([
        db().from('products').select('id,name,kind,base_unit_id,stock_alert_min').eq('id', input.productId).single(),
        db().from('units').select('id,name').is('deleted_at', null),
        db().from('stock_balances').select('product_id,qty,avg_cost').eq('location_id', loc).eq('product_id', input.productId).maybeSingle(),
      ]);
      const unitName = new Map((must(units) as Row[]).map((u) => [u.id as string, u.name as string]));
      return toStockItem(must(p) as Row, unitName, (must(b) as Row | null) ?? undefined);
    },
    async listStockMoves(productId, q) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const rows = must(await db().from('stock_movements').select('id,kind,qty_delta,unit_cost,total_cost,qty_after,avg_cost_after,reason,ref_type,occurred_at')
        .eq('location_id', loc).eq('product_id', productId).order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).limit(q?.limit ?? 100)) as Row[] | null;
      return (rows ?? []).map((r): StockMove => ({
        id: r.id, productId, kind: r.kind as StockMoveKind, qtyDelta: Number(r.qty_delta), unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost),
        qtyAfter: Number(r.qty_after ?? 0), avgCostAfter: Number(r.avg_cost_after ?? 0), occurredAt: r.occurred_at,
        ...(r.reason ? { reason: r.reason } : {}), ...(r.ref_type ? { refType: r.ref_type } : {}),
      }));
    },
    async setStockMin(productId, min) {
      if (min !== null && (!Number.isFinite(min) || min < 0)) throw new DataError('invalid', 'Batas minimum tidak boleh negatif.');
      const row = must(await db().from('products').update({ stock_alert_min: min }).eq('id', productId).select('id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('forbidden', 'Barang tidak ditemukan, atau akunmu tidak boleh mengubahnya.');
    },

    async listOpnames() {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const rows = must(await db().from('stock_opnames').select('id,number,status,counted_at,finalized_at,note,stock_opname_lines(difference)')
        .eq('location_id', loc).order('created_at', { ascending: false }).limit(200)) as Row[] | null;
      return (rows ?? []).map((r): StockOpnameSummary => {
        const lines = (r.stock_opname_lines ?? []) as Row[];
        return {
          id: r.id, number: r.number, status: r.status, countedAt: r.counted_at, lineCount: lines.length, diffCount: lines.filter((l) => Number(l.difference) !== 0).length,
          ...(r.finalized_at ? { finalizedAt: r.finalized_at } : {}), ...(r.note ? { note: r.note } : {}),
        };
      });
    },
    async getOpname(id) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const o = must(await db().from('stock_opnames').select('id,number,status,counted_at,finalized_at,note,stock_opname_lines(product_id,system_qty,counted_qty,difference)')
        .eq('id', id).eq('location_id', loc).maybeSingle()) as Row | null;
      if (!o) return null;
      const lines = (o.stock_opname_lines ?? []) as Row[];
      const [items, mv] = await Promise.all([
        self.listStock(),
        o.status === 'final'
          ? fetchAll<Row>((f, t) => db().from('stock_movements').select('product_id,total_cost').eq('ref_type', 'opname').eq('ref_id', id).order('id').range(f, t))
          : Promise.resolve([] as Row[]),
      ]);
      const item = new Map(items.map((i) => [i.productId, i]));
      const cost = new Map(mv.map((m) => [m.product_id as string, Number(m.total_cost)]));
      const out: StockOpnameLine[] = lines.map((l) => {
        const it = item.get(l.product_id as string);
        const diff = Number(l.difference);
        return {
          productId: l.product_id as string, name: it?.name ?? '(barang tidak lagi dilacak)', unit: it?.unit ?? 'unit', systemQty: Number(l.system_qty), countedQty: Number(l.counted_qty), difference: diff,
          value: o.status === 'final' ? cost.get(l.product_id as string) ?? 0 : Math.round(diff * (it?.avgCost ?? 0)),
        };
      }).sort((a, b) => a.name.localeCompare(b.name, 'id'));
      return { id: o.id, number: o.number, status: o.status, countedAt: o.counted_at, lines: out, ...(o.finalized_at ? { finalizedAt: o.finalized_at } : {}), ...(o.note ? { note: o.note } : {}) };
    },
    async saveOpname(input: StockOpnameInput) {
      const problem = opnameProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const { error } = await db().rpc('stock_opname_save', {
        p_id: input.id, p_location: loc, p_note: input.note?.trim() || null,
        p_lines: input.lines.map((l) => ({ product_id: l.productId, counted_qty: l.countedQty })),
      });
      if (error) throw mapOpnameError(error);
      return (await self.getOpname(input.id))!;
    },
    async finalizeOpname(id) {
      const { error } = await db().rpc('stock_opname_finalize', { p_id: id });
      if (error) throw mapOpnameError(error);
      return (await self.getOpname(id))!;
    },
    async deleteOpname(id) {
      const rows = must(await db().from('stock_opnames').delete().eq('id', id).eq('status', 'draft').select('id')) as Row[] | null;
      if (!rows || rows.length === 0) throw new DataError('not_found', 'Draf opname tidak ditemukan, atau sudah selesai.');
    },

    // ---------- pemasok dan pembelian ----------
    async listSuppliers(q) {
      let query = db().from('suppliers').select('id,code,name,phone,email,address,term_days,is_active').order('name');
      if (!q?.includeInactive) query = query.eq('is_active', true);
      const rows = (must(await query.limit(1000)) as Row[] | null) ?? [];
      const term = q?.search?.trim().toLowerCase();
      return rows.map((r): Supplier => ({
        id: r.id, name: r.name, termDays: Number(r.term_days), isActive: !!r.is_active,
        ...(r.code ? { code: r.code } : {}), ...(r.phone ? { phone: r.phone } : {}), ...(r.email ? { email: r.email } : {}), ...(r.address ? { address: r.address } : {}),
      })).filter((x) => !term || x.name.toLowerCase().includes(term) || (x.code ?? '').toLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async saveSupplier(input: SupplierInput) {
      const problem = supplierProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { orgId } = await resolve();
      const clean = (v?: string) => v?.trim() || null;
      const fields = { code: clean(input.code), name: input.name.trim(), phone: clean(input.phone), email: clean(input.email), address: clean(input.address), term_days: input.termDays, is_active: input.isActive ?? true, updated_at: now().toISOString() };
      const res = input.id
        ? await db().from('suppliers').update(fields).eq('id', input.id).select('id').maybeSingle()
        : await db().from('suppliers').insert({ id: newId(), org_id: orgId, ...fields }).select('id').single();
      const row = must(res) as Row | null;
      if (!row) throw new DataError('forbidden', 'Pemasok tidak ditemukan, atau akunmu tidak boleh mengubahnya.');
      return (await self.listSuppliers({ includeInactive: true })).find((x) => x.id === row.id)!;
    },
    async listPurchaseItems() {
      const [prods, units, pus, bals] = await Promise.all([
        fetchAll<Row>((f, t) => db().from('products').select('id,name,kind,base_unit_id').in('kind', ['goods', 'ingredient']).eq('track_stock', true).is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('units').select('id,name').is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('product_units').select('product_id,unit_id,conversion,is_base,buy_price').is('deleted_at', null).order('id').range(f, t)),
        (async () => { const { ctx } = await resolve(); const loc = await stockLocation(ctx.outletId); return fetchAll<Row>((f, t) => db().from('stock_balances').select('product_id,avg_cost').eq('location_id', loc).order('product_id').range(f, t)); })(),
      ]);
      const unitName = new Map(units.map((u) => [u.id as string, u.name as string]));
      const avg = new Map(bals.map((b) => [b.product_id as string, Number(b.avg_cost)]));
      const byProduct = new Map<string, Row[]>();
      for (const pu of pus) { const a = byProduct.get(pu.product_id as string) ?? []; a.push(pu); byProduct.set(pu.product_id as string, a); }
      return prods.map((p): PurchaseItem => {
        const us = (byProduct.get(p.id as string) ?? []).map((pu) => ({ unitId: pu.unit_id as string, name: unitName.get(pu.unit_id as string) ?? 'unit', conversion: Number(pu.conversion), isBase: !!pu.is_base, buyPrice: Number(pu.buy_price ?? 0) }));
        us.sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.conversion - b.conversion);
        return { productId: p.id, name: p.name, kind: p.kind === 'ingredient' ? 'ingredient' : 'goods', baseUnit: (p.base_unit_id && unitName.get(p.base_unit_id as string)) || 'unit', avgCost: avg.get(p.id as string) ?? 0, units: us };
      }).filter((i) => i.units.length > 0).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async listPayAccounts() {
      const rows = (must(await db().from('accounts').select('id,code,name').eq('category', 'cash_bank').eq('kind', 'detail').eq('is_active', true).order('code')) as Row[] | null) ?? [];
      return rows.map((r): PayAccount => ({ id: r.id, code: r.code, name: r.name }));
    },
    async listPurchaseOrders() {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const [rows, sup] = await Promise.all([
        db().from('purchase_orders').select('id,number,supplier_id,status,order_date,expected_date,total,purchase_order_lines(id)').eq('location_id', loc).order('created_at', { ascending: false }).limit(300),
        self.listSuppliers({ includeInactive: true }),
      ]);
      const name = new Map(sup.map((x) => [x.id, x.name]));
      return ((must(rows) as Row[] | null) ?? []).map((r): PurchaseOrderSummary => ({
        id: r.id, number: r.number, supplierId: r.supplier_id, supplierName: name.get(r.supplier_id as string) ?? '', status: r.status, orderDate: r.order_date, total: Number(r.total), lineCount: ((r.purchase_order_lines ?? []) as Row[]).length,
        ...(r.expected_date ? { expectedDate: r.expected_date } : {}),
      }));
    },
    async getPurchaseOrder(id) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const o = must(await db().from('purchase_orders').select('id,number,supplier_id,status,order_date,expected_date,discount,tax_amount,other_cost,total,note,purchase_order_lines(id,product_id,unit_id,qty,unit_price,discount)')
        .eq('id', id).eq('location_id', loc).maybeSingle()) as Row | null;
      if (!o) return null;
      const [items, sup] = await Promise.all([self.listPurchaseItems(), self.listSuppliers({ includeInactive: true })]);
      const lines = poLines((o.purchase_order_lines ?? []) as Row[], items, 'order');
      return {
        id: o.id, number: o.number, supplierId: o.supplier_id, supplierName: sup.find((x) => x.id === o.supplier_id)?.name ?? '', status: o.status, orderDate: o.order_date,
        discount: Number(o.discount), taxAmount: Number(o.tax_amount), otherCost: Number(o.other_cost), total: Number(o.total), lines,
        ...(o.expected_date ? { expectedDate: o.expected_date } : {}), ...(o.note ? { note: o.note } : {}),
      } satisfies PurchaseOrder;
    },
    async savePurchaseOrder(input: PurchaseOrderInput) {
      const problem = purchaseOrderProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const { error } = await db().rpc('purchase_order_save', {
        p_id: input.id, p_location: loc, p_supplier: input.supplierId, p_date: input.orderDate ?? null, p_expected: input.expectedDate || null,
        p_discount: input.discount, p_tax: input.tax, p_other: input.otherCost, p_note: input.note?.trim() || null, p_status: input.status,
        p_lines: input.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, qty: l.qty, unit_price: l.unitPrice, discount: l.discount ?? 0 })),
      });
      if (error) throw mapPurchaseError(error);
      return (await self.getPurchaseOrder(input.id))!;
    },
    async listPurchaseInvoices(q) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      let query = db().from('purchase_invoices').select('id,number,supplier_id,supplier_invoice_no,invoice_date,due_date,status,total,paid_total,purchase_invoice_lines(qty,received_qty)').eq('location_id', loc);
      if (q?.supplierId) query = query.eq('supplier_id', q.supplierId);
      if (q?.status) query = query.eq('status', q.status);
      const [rows, sup] = await Promise.all([query.order('created_at', { ascending: false }).limit(300), self.listSuppliers({ includeInactive: true })]);
      const name = new Map(sup.map((x) => [x.id, x.name]));
      return ((must(rows) as Row[] | null) ?? []).map((r): PurchaseInvoiceSummary => {
        const ls = (r.purchase_invoice_lines ?? []) as Row[];
        return {
          id: r.id, number: r.number, supplierName: r.supplier_id ? name.get(r.supplier_id as string) ?? '' : '(tanpa pemasok)', invoiceDate: r.invoice_date, status: r.status,
          total: Number(r.total), paidTotal: Number(r.paid_total), outstanding: invoiceOutstanding(Number(r.total), Number(r.paid_total)), fullyReceived: ls.every((l) => Number(l.received_qty) >= Number(l.qty)),
          ...(r.supplier_id ? { supplierId: r.supplier_id } : {}), ...(r.supplier_invoice_no ? { supplierInvoiceNo: r.supplier_invoice_no } : {}), ...(r.due_date ? { dueDate: r.due_date } : {}),
        };
      });
    },
    async getPurchaseInvoice(id) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const i = must(await db().from('purchase_invoices').select('id,number,supplier_id,order_id,supplier_invoice_no,invoice_date,due_date,term_days,status,subtotal,discount,tax_amount,other_cost,total,paid_total,note,'
        + 'purchase_invoice_lines(id,product_id,unit_id,qty,received_qty,unit_price,discount,line_total),purchase_payments(id,number,paid_at,account_id,amount,note)').eq('id', id).eq('location_id', loc).maybeSingle()) as Row | null;
      if (!i) return null;
      const [items, sup, accs] = await Promise.all([self.listPurchaseItems(), self.listSuppliers({ includeInactive: true }), db().from('accounts').select('id,name')]);
      const accName = new Map(((must(accs) as Row[] | null) ?? []).map((a) => [a.id as string, a.name as string]));
      const payments = ((i.purchase_payments ?? []) as Row[]).map((p): PurchasePayment => ({
        id: p.id, number: p.number, paidAt: p.paid_at, accountName: accName.get(p.account_id as string) ?? '', amount: Number(p.amount), ...(p.note ? { note: p.note } : {}),
      })).sort((a, b) => a.number.localeCompare(b.number));
      return {
        id: i.id, number: i.number, supplierName: i.supplier_id ? sup.find((x) => x.id === i.supplier_id)?.name ?? '' : '(tanpa pemasok)', invoiceDate: i.invoice_date, termDays: Number(i.term_days), status: i.status,
        subtotal: Number(i.subtotal), discount: Number(i.discount), taxAmount: Number(i.tax_amount), otherCost: Number(i.other_cost), total: Number(i.total), paidTotal: Number(i.paid_total),
        outstanding: invoiceOutstanding(Number(i.total), Number(i.paid_total)), lines: poLines((i.purchase_invoice_lines ?? []) as Row[], items, 'invoice'), payments,
        ...(i.supplier_id ? { supplierId: i.supplier_id } : {}), ...(i.order_id ? { orderId: i.order_id } : {}), ...(i.supplier_invoice_no ? { supplierInvoiceNo: i.supplier_invoice_no } : {}),
        ...(i.due_date ? { dueDate: i.due_date } : {}), ...(i.note ? { note: i.note } : {}),
      } satisfies PurchaseInvoice;
    },
    async createPurchaseInvoice(input: PurchaseInvoiceInput) {
      const problem = purchaseInvoiceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const { error } = await db().rpc('purchase_invoice_create', {
        p_id: input.id, p_location: loc, p_supplier: input.supplierId ?? null, p_order: input.orderId ?? null, p_supplier_no: input.supplierInvoiceNo?.trim() || null,
        p_date: input.invoiceDate ?? null, p_term: input.termDays ?? null, p_discount: input.discount, p_tax: input.tax, p_other: input.otherCost, p_note: input.note?.trim() || null,
        p_lines: input.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, qty: l.qty, unit_price: l.unitPrice, discount: l.discount ?? 0, received_qty: l.receivedQty ?? l.qty })),
      });
      if (error) throw mapPurchaseError(error);
      return (await self.getPurchaseInvoice(input.id))!;
    },
    async receivePurchase(input: PurchaseReceiveInput) {
      const cur = await self.getPurchaseInvoice(input.invoiceId);
      if (!cur) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      const problem = purchaseReceiveProblem(input, cur.lines);
      if (problem) throw new DataError('invalid', problem);
      const { error } = await db().rpc('purchase_receive', {
        p_invoice: input.invoiceId, p_receipt: input.id, p_note: input.note?.trim() || null,
        p_items: input.items.filter((x) => x.qty > 0).map((x) => ({ line_id: x.lineId, qty: x.qty })),
      });
      if (error) throw mapPurchaseError(error);
      return (await self.getPurchaseInvoice(input.invoiceId))!;
    },
    async payPurchase(input: PurchasePayInput) {
      const cur = await self.getPurchaseInvoice(input.invoiceId);
      if (!cur) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      if (!cur.payments.some((p) => p.id === input.id)) {
        const problem = purchasePayProblem(input, cur.outstanding);
        if (problem) throw new DataError('invalid', problem);
      }
      const { error } = await db().rpc('purchase_pay', {
        p_id: input.id, p_invoice: input.invoiceId, p_account: input.accountId, p_amount: input.amount, p_date: input.paidAt ?? null, p_note: input.note?.trim() || null,
      });
      if (error) throw mapPurchaseError(error);
      return (await self.getPurchaseInvoice(input.invoiceId))!;
    },

    // ---------- dapur ----------
    async kitchenBoard(servedMinutes = 0) {
      const { ctx } = await resolve();
      const { data, error } = await db().rpc('kitchen_board', { p_outlet: ctx.outletId, p_served_minutes: servedMinutes });
      if (error) throw mapKitchenError(error);
      return groupTickets(((data ?? []) as Row[]).map((r): KitchenRow => ({
        itemId: r.item_id, orderId: r.order_id, orderNumber: r.order_number, orderType: r.order_type, name: r.name, qty: Number(r.qty), status: r.status as KitchenStatus, sentAt: r.sent_at, statusAt: r.status_at,
        extras: ((r.extras ?? []) as Row[]).map((e) => ({ name: e.name as string, qty: Number(e.qty) })),
        ...(r.table_name ? { tableName: r.table_name as string } : {}), ...(r.label ? { label: r.label as string } : {}), ...(r.guest_count !== null && r.guest_count !== undefined ? { guestCount: Number(r.guest_count) } : {}),
        ...(r.queue_no !== null && r.queue_no !== undefined ? { queueNo: Number(r.queue_no) } : {}), ...(r.note ? { note: r.note as string } : {}),
      })));
    },
    async kitchenSend(orderId) {
      const { device } = await resolve();
      const { data, error } = await db().rpc('kitchen_send', { p_order: orderId, p_device: device?.id ?? null });
      if (error) throw mapKitchenError(error);
      return { sent: Number((data as { sent: number }).sent) };
    },
    async kitchenSetStatus(itemIds, status) {
      if (itemIds.length === 0) throw new DataError('invalid', 'Pilih baris yang mau diubah.');
      const { error } = await db().rpc('kitchen_set_status', { p_items: itemIds, p_status: status });
      if (error) throw mapKitchenError(error);
    },

    // ---------- keuangan ----------
    async listAccounts() {
      const rows = (must(await db().from('accounts').select('id,code,name,kind,category,system_key,is_active').order('code')) as Row[] | null) ?? [];
      return rows.map(toAccount);
    },
    async saveAccount(input: AccountInput) {
      const problem = accountProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const code = input.code.trim(), name = input.name.trim();
      const all = await self.listAccounts();
      if (all.some((a) => a.id !== input.id && a.code === code)) throw new DataError('invalid', `Kode ${code} sudah dipakai akun lain.`);
      if (input.id) {
        const cur = all.find((a) => a.id === input.id);
        if (!cur) throw new DataError('not_found', 'Akun tidak ditemukan.');
        if (cur.systemKey && (input.isActive === false || input.category !== cur.category || input.kind !== cur.kind)) throw new DataError('invalid', 'Akun sistem dipakai pembukuan otomatis: hanya namanya yang boleh diubah.');
        const { error } = await db().from('accounts').update({ code, name, kind: input.kind, category: input.category, is_active: input.isActive ?? cur.isActive }).eq('id', input.id);
        if (error) throw mapFinanceError(error);
        return { ...cur, code, name, kind: input.kind, category: input.category, isActive: input.isActive ?? cur.isActive };
      }
      const { orgId } = await resolve();
      const row = { id: newId(), org_id: orgId, code, name, kind: input.kind, category: input.category, is_active: input.isActive ?? true };
      const { error } = await db().from('accounts').insert(row);
      if (error) throw mapFinanceError(error);
      return { id: row.id, code, name, kind: input.kind, category: input.category, isActive: row.is_active } as Account;
    },
    async listJournal(q) {
      let query = db().from('journal_entries').select('id,number,entry_date,description,source_type,status,reverses_entry_id,journal_lines(debit)')
        .in('status', ['posted', 'voided']).gte('entry_date', q.from).lte('entry_date', q.to);
      if (q.sourceType) query = query.eq('source_type', q.sourceType);
      const term = searchTerm(q.search ?? '');
      if (term) query = query.or(`number.ilike.%${term}%,description.ilike.%${term}%`);
      const rows = (must(await query.order('entry_date', { ascending: false }).order('number', { ascending: false }).limit(500)) as Row[] | null) ?? [];
      return rows.map((r): JournalSummary => ({
        id: r.id, number: r.number, date: r.entry_date, description: r.description, sourceType: r.source_type, status: r.status,
        total: Math.round(((r.journal_lines ?? []) as Row[]).reduce((n, l) => n + Number(l.debit), 0) * 100) / 100, ...(r.reverses_entry_id ? { reversesId: r.reverses_entry_id as string } : {}),
      }));
    },
    async getJournal(id) {
      const { data, error } = await db().from('journal_entries').select('id,number,entry_date,description,source_type,status,reverses_entry_id,journal_lines(account_id,debit,credit,memo,line_no)').eq('id', id).in('status', ['posted', 'voided']).maybeSingle();
      if (error) throw mapFinanceError(error);
      if (!data) return null;
      const r = data as Row;
      const acc = new Map((await self.listAccounts()).map((a) => [a.id, a]));
      const lines = ((r.journal_lines ?? []) as Row[]).sort((a, b) => Number(a.line_no) - Number(b.line_no)).map((l) => ({
        accountId: l.account_id as string, code: acc.get(l.account_id as string)?.code ?? '', name: acc.get(l.account_id as string)?.name ?? '', debit: Number(l.debit), credit: Number(l.credit), ...(l.memo ? { memo: l.memo as string } : {}),
      }));
      return { id: r.id, number: r.number, date: r.entry_date, description: r.description, sourceType: r.source_type, status: r.status, total: Math.round(lines.reduce((n, l) => n + l.debit, 0) * 100) / 100,
        ...(r.reverses_entry_id ? { reversesId: r.reverses_entry_id as string } : {}), lines } as Journal;
    },
    async postJournal(input: JournalInput) {
      const problem = journalProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('journal_manual_post', {
        p_id: input.id, p_org: orgId, p_date: input.date, p_desc: input.description.trim(), p_kind: input.kind,
        p_lines: input.lines.filter((l) => l.accountId).map((l) => ({ account_id: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo?.trim() || null })),
      });
      if (error) throw mapFinanceError(error);
      const j = await self.getJournal((data as { id: string }).id);
      if (!j) throw new DataError('not_found', 'Jurnal tidak ditemukan.');
      return j;
    },
    async reverseJournal(id, reason, date) {
      const { data, error } = await db().rpc('journal_reverse', { p_entry: id, p_date: date ?? null, p_reason: reason?.trim() || null });
      if (error) throw mapFinanceError(error);
      const j = await self.getJournal((data as { id: string }).id);
      if (!j) throw new DataError('not_found', 'Jurnal tidak ditemukan.');
      return j;
    },
    async ledger(accountId, range) {
      const acc = (await self.listAccounts()).find((a) => a.id === accountId);
      if (!acc) throw new DataError('not_found', 'Akun tidak ditemukan.');
      try { return ledgerOf(await finLinesUpTo(range.to, [accountId]), acc, range.from, range.to); } catch (e) { throw e instanceof DataError ? e : mapFinanceError(e as { message?: string }); }
    },
    async trialBalance(range) {
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('report_trial_balance', { p_org: orgId, p_from: range.from, p_to: range.to, p_outlet: null });
      if (error) throw mapFinanceError(error);
      return ((data ?? []) as Row[]).map((r): TrialRow => ({ accountId: r.account_id, code: r.code, name: r.name, category: r.category as AccountCategory, opening: Number(r.opening), debit: Number(r.debit), credit: Number(r.credit), closing: Number(r.closing) }));
    },
    async incomeStatement(range) {
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('report_income_statement', { p_org: orgId, p_from: range.from, p_to: range.to, p_outlet: null });
      if (error) throw mapFinanceError(error);
      return ((data ?? []) as Row[]).map((r): StatementRow => ({ section: r.section, ...(r.code ? { code: r.code as string } : {}), name: r.name, amount: Number(r.amount) }));
    },
    async balanceSheet(asOf) {
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('report_balance_sheet', { p_org: orgId, p_as_of: asOf, p_outlet: null });
      if (error) throw mapFinanceError(error);
      const rows = ((data ?? []) as Row[]).map((r): StatementRow => ({ section: r.section, ...(r.code ? { code: r.code as string } : {}), name: r.name, amount: Number(r.amount) }));
      return { rows, totals: balanceSheetTotals(rows) };
    },
    async cashFlow(range) {
      const ids = (await self.listAccounts()).filter((a) => a.category === 'cash_bank').map((a) => a.id);
      try { return cashFlowOf(await finLinesUpTo(range.to, ids), range.from, range.to); } catch (e) { throw e instanceof DataError ? e : mapFinanceError(e as { message?: string }); }
    },
    async payablesAging(asOf) {
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('report_payables_aging', { p_org: orgId, p_as_of: asOf });
      if (error) throw mapFinanceError(error);
      return ((data ?? []) as Row[]).map((r): PayableRow => ({ ...(r.supplier_id ? { supplierId: r.supplier_id as string } : {}), supplierName: r.supplier_name, invoiceId: r.invoice_id, number: r.number, ...(r.due_date ? { dueDate: r.due_date as string } : {}), outstanding: Number(r.outstanding), daysOverdue: Number(r.days_overdue) }));
    },

    // ---------- karyawan dan metode bayar ----------
    async listEmployees() {
      const { ctx } = await resolve();
      const rows = must(await db().from('employees').select('id,name,role,employee_outlets!inner(outlet_id)')
        .eq('employee_outlets.outlet_id', ctx.outletId).eq('is_active', true).is('deleted_at', null)
        .in('role', ['owner', 'manager', 'cashier']).order('name')) as Row[] | null;
      return (rows ?? []).map((e): Employee => ({ id: e.id, name: e.name, role: e.role }));
    },
    async listManagedEmployees() {
      const { ctx } = await resolve();
      const rows = must(await db().from('employees').select('id,name,role,is_active,employee_outlets!inner(outlet_id)')
        .eq('employee_outlets.outlet_id', ctx.outletId).is('deleted_at', null)
        .in('role', ['owner', 'manager', 'cashier']).order('name')) as Row[] | null;
      return (rows ?? []).map((e): ManagedEmployee => ({ id: e.id, name: e.name, role: e.role, isActive: !!e.is_active }));
    },
    async saveEmployee(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama karyawan wajib diisi');
      if (input.role !== 'manager' && input.role !== 'cashier') throw new DataError('invalid', 'Peran tidak dikenal');
      const { orgId, ctx } = await resolve();
      const clash = (await self.listManagedEmployees()).some((x) => x.id !== input.id && x.isActive && x.name.toLowerCase() === name.toLowerCase());
      if (clash) throw new DataError('invalid', `Sudah ada karyawan aktif bernama "${name}"`);
      const out = (r: Row): ManagedEmployee => ({ id: r.id, name: r.name, role: r.role, isActive: !!r.is_active });
      if (input.id) {
        const patch: Record<string, unknown> = { name, role: input.role };
        if (input.isActive !== undefined) patch.is_active = input.isActive;
        const row = must(await db().from('employees').update(patch).eq('id', input.id).neq('role', 'owner').is('deleted_at', null).select('id,name,role,is_active').maybeSingle()) as Row | null;
        if (!row) throw new DataError('not_found', 'Karyawan tidak ditemukan, atau datanya hanya bisa diubah pemilik');
        return out(row);
      }
      const id = newId();
      const row = must(await db().from('employees').insert({ id, org_id: orgId, name, role: input.role, is_active: input.isActive ?? true }).select('id,name,role,is_active').single()) as Row;
      must(await db().from('employee_outlets').insert({ employee_id: id, outlet_id: ctx.outletId, org_id: orgId }));
      return out(row);
    },
    async verifyPin(employeeId, pin) {
      const { r } = await requireDevice();
      const { data, error } = await db().rpc('verify_pin', { p_device: r.device!.id, p_employee: employeeId, p_pin: pin });
      if (error) throw mapDbError(error);
      return data === true;
    },
    async setEmployeePin(employeeId, pin) {
      if (!/^\d{6}$/.test(pin)) throw new DataError('invalid', 'PIN harus 6 digit angka');
      const { error } = await db().rpc('admin_set_pin', { p_employee: employeeId, p_pin: pin });
      if (error) throw mapDbError(error);
    },
    async listPaymentMethods() {
      const rows = must(await db().from('payment_methods').select('id,code,name,kind,requires_online')
        .eq('is_active', true).is('deleted_at', null).order('sort').order('code')) as Row[] | null;
      return (rows ?? []).map((m): PaymentMethod => ({ id: m.id, code: m.code, name: m.name, kind: m.kind, requiresOnline: !!m.requires_online }));
    },

    // ---------- shift ----------
    async currentShift() {
      const r = await resolve();
      if (!r.device) return null;
      const row = must(await shiftQuery(r.device.id).eq('status', 'open').maybeSingle()) as Row | null;
      return row ? toShift(row) : null;
    },
    async openShift({ id, cashierId, openingCash }) {
      const { deviceId } = await requireDevice();
      if (openingCash < 0) throw new DataError('bad_amount', 'Modal awal tidak boleh negatif');
      if (await self.currentShift()) throw new DataError('shift_already_open', 'Masih ada shift yang terbuka di perangkat ini');
      await pushOps(deviceId, [{
        type: 'shift.open', entityId: id,
        payload: { id, cashier_id: cashierId, opened_at: now().toISOString(), opening_cash: Math.round(openingCash) },
      }]);
      return toShift(must(await db().from('shifts').select('*').eq('id', id).single()) as Row);
    },
    async closeShift({ shiftId, counted, closedBy }) {
      const { deviceId } = await requireDevice();
      const before = must(await db().from('shifts').select('*').eq('id', shiftId).maybeSingle()) as Row | null;
      if (!before) throw new DataError('not_found', 'Shift tidak ditemukan');
      if (before.status === 'closed') throw new DataError('invalid', 'Shift sudah ditutup');
      await pushOps(deviceId, [{
        type: 'shift.close', entityId: shiftId,
        payload: { id: shiftId, closed_by: closedBy, counted: Math.round(counted), closed_at: now().toISOString() },
      }]);
      const inputs = await gatherShiftInputs(shiftId);
      return buildShiftReport(inputs, Math.round(counted));
    },
    async shiftSummary(shiftId) {
      return buildShiftReport(await gatherShiftInputs(shiftId));
    },
    async listShiftReports(range) {
      const { ctx } = await resolve();
      const rows = (must(await db().from('shifts').select('*').eq('outlet_id', ctx.outletId).gte('opened_at', range.from).lt('opened_at', range.to)
        .order('opened_at', { ascending: false }).limit(100)) as Row[] | null) ?? [];
      if (rows.length === 0) return [];
      const emp = (must(await db().from('employees').select('id,name').in('id', [...new Set(rows.map((r) => r.cashier_id as string))])) as Row[] | null) ?? [];
      const names = new Map(emp.map((e) => [e.id as string, e.name as string]));
      const out: ShiftReportRow[] = [];
      for (const r of rows) out.push({ ...buildShiftReport(await gatherShiftInputs(r.id as string)), cashierName: names.get(r.cashier_id as string) ?? '—' });
      return out;
    },

    // ---------- pesanan ----------
    async nextOrderNumber() {
      return reserveNumber(await resolve(), true);
    },
    async saveOrder(draft: OrderDraft, cashierId: string) {
      const { r, deviceId } = await requireDevice();
      const shift = await self.currentShift();
      if (r.ctx.settings.requireOpenShift && !shift) throw new DataError('no_open_shift', 'Buka kasir dulu sebelum membuat pesanan');
      if (draft.items.length === 0) throw new DataError('invalid', 'Pesanan masih kosong');
      if (draft.items.some((i) => i.qty <= 0)) throw new DataError('invalid', 'Jumlah item harus lebih dari 0');
      if (draft.tableId) {
        const busy = must(await db().from('orders').select('id,number').eq('table_id', draft.tableId).in('status', ['open', 'partially_paid']).neq('id', draft.id).limit(1)) as Row[] | null;
        if (busy && busy.length > 0) throw new DataError('invalid', `Meja ini sedang dipakai pesanan ${busy[0]!.number}`);
      }

      const existing = must(await db().from('orders').select('id,number,status,paid_total,version,opened_at').eq('id', draft.id).maybeSingle()) as Row | null;
      if (existing && (existing.status !== 'open' || Number(existing.paid_total) > 0)) {
        throw new DataError('order_locked', 'Pesanan sudah ada pembayaran, tidak bisa diubah');
      }
      const productIds = [...new Set(draft.items.map((i) => i.productId))];
      const units = must(await db().from('product_units').select('id,product_id,sku').in('product_id', productIds).eq('is_base', true).is('deleted_at', null)) as Row[] | null;
      const unitOf = new Map((units ?? []).map((u) => [u.product_id as string, u]));
      const missing = productIds.find((p) => !unitOf.has(p));
      if (missing) throw new DataError('not_found', 'Ada produk di pesanan yang sudah tidak tersedia');

      const calc = computeOrder({
        orderType: draft.type, orderDiscount: draft.orderDiscount ?? (draft.discounts ?? []).reduce((n, d) => n + d.amount, 0), roundingStep: 0, settings: r.ctx.settings,
        items: draft.items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice, extrasTotal: extrasLineTotal(i.qty, i.extras) })),
        orderTaxes: r.ctx.taxes.map((t) => ({ taxId: t.id, name: t.name, rate: t.rate })),
      });
      const items = draft.items.map((i) => ({
        id: i.id, productId: i.productId, productUnitId: unitOf.get(i.productId)!.id as string, name: i.name,
        sku: (unitOf.get(i.productId)!.sku as string | null) ?? null, qty: i.qty, unitPrice: i.unitPrice, note: i.note ?? null, extras: i.extras,
      }));

      for (let attempt = 0; ; attempt++) {
        const number = existing ? (existing.number as string) : await reserveNumber(r, false);
        const payload = buildOrderPayload({
          id: draft.id, number, orderType: draft.type, tableId: draft.tableId, customerId: draft.customerId, label: draft.label, guestCount: draft.guestCount, shiftId: shift?.id,
          cashierId, openedAt: existing ? (existing.opened_at as string) : now().toISOString(),
          baseVersion: existing ? Number(existing.version) : undefined, calc, orderDiscount: draft.orderDiscount ?? 0, discounts: draft.discounts,
          authorizedBy: cashierId, items,
        });
        try {
          await pushOps(deviceId, [{ type: 'order.upsert', entityId: draft.id, payload }]);
          break;
        } catch (e) {
          // nomor bentrok (mis. dua tab membuat pesanan bersamaan): ambil nomor berikutnya sekali lagi
          if (!existing && attempt < 2 && e instanceof DataError && /Nomor pesanan bentrok/.test(e.message)) continue;
          throw e;
        }
      }
      return (await self.getOrder(draft.id))!;
    },
    async addPayment(orderId, pay) {
      const { r, deviceId } = await requireDevice();
      const raw = await fetchOrderRaw(orderId);
      if (!raw) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (raw.status === 'void') throw new DataError('order_locked', 'Pesanan sudah dibatalkan');
      const dup = must(await db().from('payments').select('id').eq('id', pay.id).maybeSingle()) as Row | null;
      if (dup) return (await self.getOrder(orderId))!;                       // idempoten, seperti data palsu

      const method = must(await db().from('payment_methods').select('id,kind,name').eq('id', pay.methodId).maybeSingle()) as Row | null;
      if (!method) throw new DataError('not_found', 'Metode bayar tidak ditemukan');
      if (method.kind === 'gateway') throw new DataError('invalid', 'Pembayaran QRIS (DOKU) belum diaktifkan');
      const refProblem = paymentRefProblem(method.kind as PaymentMethod['kind'], pay.reference);
      if (refProblem) throw new DataError('invalid', refProblem);

      // pembulatan mengikuti metode, ditentukan pada pembayaran pertama (pesanan masih open -> boleh upsert ulang)
      const ops: { type: string; entityId?: string; payload: unknown }[] = [];
      let total = Number(raw.total);
      if (Number(raw.paid_total) === 0) {
        const step = method.kind === 'cash' ? r.ctx.settings.roundingCashStep : r.ctx.settings.roundingNoncashStep;
        const base = Number(raw.total) - Number(raw.rounding);
        const rounded = step ? roundToStep(base, step) : base;
        if (rounded !== total) {
          total = rounded;
          ops.push({ type: 'order.upsert', entityId: orderId, payload: payloadFromStored(raw, rounded - base) });
        }
      }
      const balance = total - Number(raw.paid_total);
      if (pay.amount <= 0 || pay.amount > balance) throw new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
      const shift = await self.currentShift();
      ops.push({
        type: 'payment.add', entityId: pay.id,
        payload: {
          id: pay.id, order_id: orderId, method_id: pay.methodId, shift_id: shift?.id ?? raw.shift_id ?? null,
          amount: pay.amount, tendered: pay.tendered ?? pay.amount, paid_at: pay.paidAt ?? now().toISOString(),
          reference: pay.reference?.trim() || null, created_by: raw.cashier_id,
        },
      });
      await pushOps(deviceId, ops);
      return (await self.getOrder(orderId))!;
    },
    async listRefunds(orderId) {
      return refundRows((qb) => qb.eq('order_id', orderId));
    },
    async listRefundsBetween(range) {
      return refundRows((qb) => qb.gte('created_at', range.from).lt('created_at', range.to));
    },
    async refundOrder(input: RefundInput) {
      const { deviceId } = await requireDevice();
      const prior = (await self.listRefunds(input.orderId)).find((x) => x.id === input.id);
      if (prior) return prior;                                                       // idempoten
      const order = await self.getOrder(input.orderId);
      if (!order) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      const methods = await self.listPaymentMethods();
      const m = methods.find((x) => x.id === input.methodId);
      if (!m) throw new DataError('not_found', 'Metode bayar tidak ditemukan');
      if (m.kind === 'gateway') throw new DataError('invalid', 'Refund ke QRIS belum diaktifkan');
      if (!input.reason.trim()) throw new DataError('invalid', 'Alasan refund wajib diisi');
      const mine = await self.listRefunds(order.id);
      const problem = refundProblem(order, mine, input.items);
      if (problem) throw new DataError('bad_amount', problem);
      const lines = refundAmounts(order, input.items);
      const shift = await self.currentShift();
      const number = `R${mine.length + 1}-${order.number}`;
      const payload = buildRefundPayload({
        id: input.id, orderId: order.id, shiftId: shift?.id, number, methodId: m.id, restock: input.restock, authorizedBy: input.authorizedBy,
        reason: input.reason, note: input.note, items: lines,
      });
      await pushOps(deviceId, [{ type: 'refund.add', entityId: input.id, payload }]);
      return (await self.listRefunds(order.id)).find((x) => x.id === input.id)!;
    },
    async voidUnpaidOrder(orderId, reason, authorizedBy) {
      const { deviceId } = await requireDevice();
      const o = must(await db().from('orders').select('id,status,paid_total').eq('id', orderId).maybeSingle()) as Row | null;
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.status !== 'open' || Number(o.paid_total) > 0) {
        throw new DataError('order_locked', 'Hanya pesanan yang belum dibayar yang bisa dibatalkan; pesanan lunas lewat refund');
      }
      await pushOps(deviceId, [{
        type: 'order.void', entityId: orderId,
        payload: { order_id: orderId, authorized_by: authorizedBy, auth_method: 'pin', reason, voided_by: authorizedBy, voided_at: now().toISOString() },
      }]);
      return (await self.getOrder(orderId))!;
    },
    async getOrder(id) {
      const row = must(await db().from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle()) as Row | null;
      return row ? (await withCustomerNames([toOrder(row)]))[0]! : null;
    },
    async listOrders(q = {}) {
      return fetchOrders((qb) => {
        let x = qb;
        if (q.status) x = x.eq('status', q.status);
        if (q.customerId) x = x.eq('customer_id', q.customerId);
        const col = q.by === 'closed' ? 'closed_at' : 'opened_at';
        if (q.from) x = x.gte(col, q.from);
        if (q.to) x = x.lt(col, q.to);
        return x;
      }, q.all ? undefined : q.limit ?? 200);
    },

    // ---------- laporan ----------
    async salesSummary(range: SalesRange): Promise<SalesSummary> {
      const { ctx } = await resolve();
      const paid = await fetchOrders((qb) => qb.eq('outlet_id', ctx.outletId).eq('status', 'paid').gte('closed_at', range.from).lt('closed_at', range.to));
      return summarizeSales(paid, ctx.timezone);
    },
  };
  const tableOps = createTableOps({
    getOrder: (id) => self.getOrder(id), saveOrder: (d, c) => self.saveOrder(d, c),
    voidUnpaidOrder: (id, r, by) => self.voidUnpaidOrder(id, r, by), listTableStatus: () => self.listTableStatus(),
  });
  return self;
}

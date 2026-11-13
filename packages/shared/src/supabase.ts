import type { SupabaseClient } from '@supabase/supabase-js';
import { createTableOps } from './table-ops';
import { DEFAULT_LOYALTY, loyaltyRulesProblem, type LoyaltyEntry, type LoyaltyRules } from './loyalty';
import { photoExt, photoPath, photoProblem, type ProductPhotoInput } from './photo';
import { attendanceMinutes, attendanceProblem } from './attendance';
import { priceDelta } from './price-change';
import { roleFromRows, roleSaveProblem, roleToRpcArgs } from './roles';
import { isBuiltInRole, type RoleDefinition } from './permission-matrix';
import { purchasePriceProblem, type PurchasePriceMapping, type PurchasePriceSuggestion } from './purchase-price';
import { stockRequestProblem, type StockRequest, type StockRequestStatus } from './stock-requests';
import { approvalProblem, recurringBillProblem, type ApprovalRequest, type ApprovalStatus, type RecurringBill, type RecurringBillRun } from './bills';
import { localDateString } from './local-date';
import { disposalProblem, fixedAssetProblem, type AssetDepreciationEntry, type FixedAsset } from './fixed-assets';
import { attendanceSettingsProblem, hrNameProblem, hrNameTaken, jobLevelProblem, notificationProblem, orgUnitProblem, type AttendanceSettings, type EmployeeHr, type EmployeeNotification, type EmployeeType, type JobLevel, type OrgUnit } from './hr';
import { cashAdvanceProblem, compensationProblem, incidentProblem, mergePayrollRules, payrollRowToRpc, payrollRulesProblem, scheduleProblem, type EmploymentStatus, type IncidentKind, type CashAdvance, type CashAdvanceInput, type EmployeeCompensation, type EmployeeIncident, type EmployeeIncidentInput, type PayrollRecord, type PayrollRecordInput, type PayrollRules, type WeeklySchedule } from './payroll';
import { customerProblem, normalizePhone, searchTerm } from './customer';
import { makeStockItem, opnameProblem, stockFilterMatches, stockPostProblem, stockSearchMatches, type StockItem, type StockMove, type StockMoveEntry, type StockMoveKind, type StockOpname, type StockOpnameInput, type StockOpnameLine, type StockOpnameSummary } from './stock';
import {
  invoiceOutstanding, purchaseInvoiceProblem, purchaseOrderProblem, purchasePayProblem, purchaseReceiveProblem, supplierProblem,
  type PayAccount, type PurchaseInvoice, type PurchaseInvoiceInput, type PurchaseInvoiceSummary, type PurchaseItem, type PurchaseLine, type PurchaseOrder, type PurchaseOrderInput, type PurchaseOrderSummary, type PurchasePayInput, type PurchasePayment, type PurchaseReceiveInput, type Supplier, type SupplierInput,
} from './purchasing';

import { groupTickets, type KitchenRow, type KitchenStatus } from './kitchen';
import { notePresetProblem, type NotePreset } from './notes';
import { sanitizeReceiptTemplate } from './receipt-template';
import { normalizeTemplate, stationProblem, type PrintStation, type SentLine, type StationKind } from './station';
import { priceOverridePctProblem } from './price-override';
import type { DiscountUse, DiscountSource } from './promo-report';
import { transferProblem, type StockLocation, type StockTransfer, type StockTransferInput, type TransferStatus } from './stock-transfer';
import { productUnitProblem, type ProductUnitInput, type ProductUnitRow } from './product-unit';
import type { CustomerGroup, CustomerGroupMember, GroupProductTieredPricing, TieredPriceRule } from './tiered-pricing';
import type { PriceSchedule } from './price-schedule';
import { recipeProblem, type CostSource, type RecipeIngredient, type RecipeLine, type RecipeProduct } from './recipe';
import { parseChanges, type ActivityQuery, type ActivityRow } from './activity';
import { normalizeAuthCode, type AuthCodePermission, type AuthCodeRow } from './auth-code';
import {
  accountProblem, balanceSheetOf, balanceSheetTotals, cashFlowOf, incomeStatementOf, journalProblem, ledgerOf,
  type Account, type AccountCategory, type AccountInput, type FinLine, type Journal, type JournalInput, type JournalSummary, type PayableRow, type StatementRow, type TrialRow,
} from './finance';

const PHOTO_BUCKET = 'menu-images';
/** Bucket PRIVAT untuk selfie absensi (migrasi 0036): tampilan lewat tautan bertanda tangan, bukan URL publik. */
const ATTENDANCE_BUCKET = 'attendance-photos';
const ATTENDANCE_URL_TTL = 600;
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
  Shift, ShiftReport, CashMovement, AttendanceInput, AttendanceRecord, PriceChange,
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
  'id,name,category_id,kind,is_active,show_in_menu,is_favorite,track_stock,parent_id,is_sellable,photo_path,allow_price_override,max_price_override_pct,product_units(id,price,sku,is_base,deleted_at)';
const ORDER_SELECT =
  'id,number,order_type,table_id,label,guest_count,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,' +
  'order_items(id,product_id,name,qty,unit_price,line_total,note,sort,voided_at,order_item_extras(option_id,name,price,qty)),' +
  'payments(id,method_id,amount,tendered,change_given,status,paid_at,reference,payment_methods(name,kind))';
/** Untuk membangun ulang payload op: semua kolom yang dibutuhkan _apply_op. */
const ORDER_RAW_SELECT =
  'id,number,order_type,table_id,customer_id,guest_count,label,note,queue_no,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,client_created_at,' +
  'order_items(id,product_id,product_unit_id,name,sku,qty,unit_price,base_price,extras_total,discount,tax_amount,line_total,note,is_free,sort,voided_at,void_reason,order_item_extras(id,option_id,name,price,qty)),' +
  'order_discounts(id,order_item_id,source,promotion_id,coupon_id,points_used,amount,authorized_by,reference),' +
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
  function transferError(m: string, error: Parameters<typeof mapDbError>[0]): DataError {
    if (/not allowed|no access/i.test(m)) return new DataError('forbidden', 'Hanya pemilik, admin, dan manajer yang boleh memindahkan stok.');
    if (/transfer not found/i.test(m)) return new DataError('not_found', 'Transfer tidak ditemukan.');
    if (/not in transit/i.test(m)) return new DataError('invalid', 'Transfer ini tidak sedang dalam perjalanan.');
    if (/location not found/i.test(m)) return new DataError('not_found', 'Lokasi tidak ditemukan.');
    if (/must differ/i.test(m)) return new DataError('invalid', 'Lokasi asal dan tujuan tidak boleh sama.');
    if (/does not track stock/i.test(m)) return new DataError('invalid', 'Ada barang yang stoknya tidak dilacak.');
    if (/invalid line|duplicate product|lines required|too many lines/i.test(m)) return new DataError('invalid', 'Isi barang dan jumlah ditolak server. Periksa kembali.');
    return mapDbError(error);
  }
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

  function mapPayrollError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m) || error.code === '42P01') return new DataError('invalid', 'Fitur payroll belum aktif di database (migrasi 0037 belum diterapkan).');
    if (/period locked/i.test(m)) return new DataError('order_locked', 'Periode ini sudah dikunci. Buka kunci dulu untuk mengubahnya.');
    if (/net salary mismatch/i.test(m)) return new DataError('invalid', 'Gaji bersih tidak cocok dengan komponennya.');
    if (/cash advance deduction exceeds balance/i.test(m)) return new DataError('invalid', 'Potongan kasbon melebihi saldo.');
    if (/employee not found/i.test(m)) return new DataError('not_found', 'Karyawan tidak ditemukan.');
    if (/invalid period|rows must be an array|too many rows/i.test(m)) return new DataError('invalid', 'Isian payroll ditolak server.');
    if (/not allowed/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengelola payroll (buka kunci periode hanya pemilik).');
    return mapDbError(error);
  }

  async function employeeNames(): Promise<Map<string, string>> {
    return new Map(((must(await db().from('employees').select('id,name')) as Row[] | null) ?? []).map((e) => [e.id as string, e.name as string]));
  }

  async function payrollRows(build: (qb: any) => any): Promise<PayrollRecord[]> {
    const names = await employeeNames();
    const rows = await pageAll((from, to) => build(db().from('payroll_records').select('*')).order('employee_id').range(from, to));
    return rows.map((x): PayrollRecord => ({
      id: x.id as string, employeeId: x.employee_id as string, employeeName: names.get(x.employee_id as string) ?? '(karyawan dihapus)', month: Number(x.period_month), year: Number(x.period_year),
      status: x.status === 'PAID' ? 'PAID' : 'DRAFT', employmentStatus: x.employment_status as EmploymentStatus,
      basicSalary: Number(x.basic_salary), mealAllowance: Number(x.meal_allowance), bpjsAllowance: Number(x.bpjs_allowance),
      latenessCount: Number(x.lateness_count), latenessBonus: Number(x.lateness_bonus), latenessPenalty: Number(x.lateness_penalty),
      absenceCount: Number(x.absence_count), absencePenalty: Number(x.absence_penalty), absenceQuotaRemaining: 0,
      operationalMistakes: Number(x.operational_mistakes_count), operationalPenalty: Number(x.operational_mistakes_penalty),
      stockOpnamePenalty: Number(x.stock_opname_penalty), stockanIncentive: Number(x.stockan_incentive), deepCleaningIncentive: Number(x.deep_cleaning_incentive),
      commission: Number(x.commission), cashAdvanceDeduction: Number(x.cash_advance_deduction), netSalary: Number(x.net_salary),
      ...(x.paid_at ? { paidAt: x.paid_at as string } : {}),
    }));
  }

  function mapRoleError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m) || error.code === '42P01') return new DataError('invalid', 'Fitur peran belum aktif di database (migrasi 0033 belum diterapkan).');
    if (/role not found/i.test(m)) return new DataError('not_found', 'Peran tidak ditemukan.');
    if (/cannot delete a built-in role/i.test(m)) return new DataError('forbidden', 'Peran bawaan tidak bisa dihapus.');
    if (/invalid base_role|too many rows/i.test(m)) return new DataError('invalid', 'Isian peran ditolak server.');
    if (error.code === '23505') return new DataError('invalid', 'Nama peran sudah dipakai. Gunakan nama lain.');
    if (/not allowed/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengelola peran.');
    return mapDbError(error);
  }

  function mapPurchasePriceError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || error.code === '42P01' || /could not find the function|schema cache/i.test(m)) return new DataError('invalid', 'Fitur pemetaan harga beli belum aktif di database (migrasi 0043 belum diterapkan).');
    if (/not allowed/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik, admin, atau manajer yang boleh mengatur harga beli.');
    if (/product not found/i.test(m)) return new DataError('not_found', 'Barang tidak ditemukan atau bukan barang yang dilacak stoknya.');
    if (/unit not found/i.test(m)) return new DataError('not_found', 'Satuan tidak ditemukan.');
    if (/invalid price|invalid mode/i.test(m) || error.code === '23514') return new DataError('invalid', 'Harga atau mode ditolak server.');
    return mapDbError(error);
  }
  function mapStockRequestError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || error.code === '42P01' || /could not find the function|schema cache/i.test(m)) return new DataError('invalid', 'Fitur permintaan barang belum aktif di database (migrasi 0042 belum diterapkan).');
    if (/request already decided/i.test(m)) return new DataError('invalid', 'Permintaan ini sudah diputuskan.');
    if (/request not approved/i.test(m)) return new DataError('invalid', 'Permintaan harus disetujui dulu sebelum dipenuhi.');
    if (/request not found|location not found/i.test(m)) return new DataError('not_found', 'Permintaan atau lokasi tidak ditemukan.');
    if (/not allowed|no access/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik, admin, atau manajer yang boleh mengelola permintaan barang.');
    if (/from and to must differ/i.test(m)) return new DataError('invalid', 'Lokasi peminta dan sumber tidak boleh sama.');
    if (/different organizations/i.test(m)) return new DataError('invalid', 'Lokasi berasal dari organisasi yang berbeda.');
    if (/lines required|invalid line|duplicate product|too many lines|does not track stock/i.test(m)) return new DataError('invalid', 'Isian barang ditolak server: periksa jumlah, barang ganda, dan barang yang stoknya tidak dilacak.');
    return mapDbError(error);
  }
  function mapBillError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || error.code === '42P01' || /could not find the function|schema cache/i.test(m)) return new DataError('invalid', 'Fitur tagihan rutin dan persetujuan belum aktif di database (migrasi 0041 belum diterapkan).');
    if (/cannot decide own request/i.test(m)) return new DataError('forbidden', 'Kamu tidak boleh memutuskan permintaan yang kamu ajukan sendiri.');
    if (/request already decided/i.test(m)) return new DataError('invalid', 'Permintaan ini sudah diputuskan.');
    if (/request not found|bill not found/i.test(m)) return new DataError('not_found', 'Data tidak ditemukan.');
    if (/not allowed/i.test(m) || error.code === '42501' || /row-level security/i.test(m)) return new DataError('forbidden', 'Hanya pemilik, admin, atau manajer yang boleh (membayar tagihan: pemilik dan admin).');
    if (/bill inactive/i.test(m)) return new DataError('invalid', 'Tagihan ini nonaktif.');
    if (/invalid date/i.test(m)) return new DataError('invalid', 'Tanggal bayar tidak valid atau di masa depan.');
    if (/account not found or not postable/i.test(m)) return new DataError('invalid', 'Akun yang dipilih tidak ditemukan, nonaktif, atau berupa akun induk.');
    if (/books are locked|locked through/i.test(m)) return new DataError('order_locked', 'Tanggal berada di periode pembukuan yang sudah dikunci.');
    if (error.code === '23514') return new DataError('invalid', 'Isian ditolak server (di luar batas yang diizinkan).');
    return mapDbError(error);
  }
  function mapAssetError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur aset tetap belum aktif di database (migrasi 0040 belum diterapkan).');
    if (/not allowed/i.test(m) || error.code === '42501') return new DataError('forbidden', 'Hanya pemilik dan admin yang boleh mengelola aset tetap.');
    if (/period in the future/i.test(m)) return new DataError('invalid', 'Periode ini belum tiba.');
    if (/asset already disposed/i.test(m)) return new DataError('invalid', 'Aset ini sudah dilepas.');
    if (/asset not found/i.test(m)) return new DataError('not_found', 'Aset tidak ditemukan.');
    if (/cash account required/i.test(m)) return new DataError('invalid', 'Pilih akun kas/bank penerima hasil penjualan.');
    if (/gain\/loss account required/i.test(m)) return new DataError('invalid', 'Pilih akun laba/rugi pelepasan aset.');
    if (/asset accounts missing/i.test(m)) return new DataError('invalid', 'Akun Peralatan, Akumulasi Penyusutan, atau Beban Penyusutan belum ada di daftar akun.');
    if (/invalid (cost|salvage|life|date|proceeds)|name required|date required/i.test(m)) return new DataError('invalid', 'Isian aset ditolak server. Periksa harga, nilai sisa, umur, dan tanggal.');
    if (/account not found or not postable/i.test(m)) return new DataError('invalid', 'Akun yang dipilih tidak ditemukan, nonaktif, atau berupa akun induk.');
    if (/books are locked|locked through/i.test(m)) return new DataError('order_locked', 'Tanggal berada di periode pembukuan yang sudah dikunci.');
    return mapDbError(error);
  }
  function mapHrError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || error.code === '42P01' || /does not exist|schema cache/i.test(m)) return new DataError('invalid', 'Fitur struktur SDM belum aktif di database (migrasi 0038 belum diterapkan).');
    if (error.code === '23505') return new DataError('invalid', 'Nama ini sudah dipakai.');
    if (error.code === '23503') return new DataError('not_found', 'Data yang dituju tidak ditemukan.');
    if (error.code === '23514') return new DataError('invalid', 'Isian ditolak server (di luar batas yang diizinkan).');
    if (error.code === '42501' || /row-level security|not allowed/i.test(m)) return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengatur struktur SDM.');
    return mapDbError(error);
  }
  function mapAttendanceError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur absensi belum aktif di database (migrasi 0035 belum diterapkan).');
    if (/invalid pin/i.test(m)) return new DataError('bad_pin', 'PIN salah, atau akun terkunci sementara karena terlalu banyak salah.');
    if (/already clocked in/i.test(m)) return new DataError('invalid', 'Karyawan ini sudah clock in.');
    if (/not clocked in/i.test(m)) return new DataError('invalid', 'Karyawan ini belum clock in.');
    if (/employee not at this outlet/i.test(m)) return new DataError('forbidden', 'Karyawan ini tidak terdaftar di outlet ini.');
    if (/outside radius/i.test(m)) return new DataError('forbidden', 'Kamu berada di luar radius absensi outlet ini.');
    if (/location required/i.test(m)) return new DataError('forbidden', 'Lokasi perangkat dibutuhkan untuk absen. Izinkan akses lokasi di peramban lalu coba lagi.');
    if (/invalid location/i.test(m)) return new DataError('invalid', 'Lokasi perangkat tidak valid.');
    if (/invalid photo path/i.test(m)) return new DataError('invalid', 'Foto selfie ditolak server.');
    if (/clock out before clock in|time in the future|clock in required/i.test(m)) return new DataError('invalid', 'Jam masuk dan pulang tidak valid. Pulang harus setelah masuk dan tidak di masa depan.');
    if (/employee not found|outlet not found|attendance not found/i.test(m)) return new DataError('not_found', 'Karyawan atau catatan absensi tidak ditemukan.');
    if (/not allowed/i.test(m)) return new DataError('forbidden', 'Hanya pemilik dan manajer yang boleh mengoreksi absensi.');
    if (error.code === '23505') return new DataError('invalid', 'Karyawan ini masih punya catatan yang belum clock out.');
    return mapDbError(error);
  }

  /** Periksa PIN dulu (salah = berhenti sebelum foto diunggah), lalu unggah selfie ke bucket privat. Mengembalikan jalur objek atau null. */
  async function attendanceVerifyAndUpload(orgId: string, deviceId: string, employeeId: string, pin: string, kind: 'in' | 'out', photo?: ProductPhotoInput): Promise<string | null> {
    const { data, error } = await db().rpc('verify_pin', { p_device: deviceId, p_employee: employeeId, p_pin: pin });
    if (error) throw mapDbError(error);
    if (data !== true) throw new DataError('bad_pin', 'PIN salah, atau akun terkunci sementara karena terlalu banyak salah.');
    if (!photo) return null;
    const problem = photoProblem(photo);
    if (problem) throw new DataError('invalid', problem);
    const path = `${orgId}/${employeeId}/${now().getTime()}-${kind}.${photoExt(photo.contentType)}`;
    const up = await client.storage.from(ATTENDANCE_BUCKET).upload(path, photo.data, { contentType: photo.contentType, upsert: false });
    if (up.error) throw new DataError('invalid', `Foto selfie gagal diunggah: ${up.error.message}`);
    return path;
  }

  /** Catatan absensi + nama karyawan + tautan foto bertanda tangan (hanya pengelola yang berhak melihat objeknya). */
  async function attendanceRows(build: (qb: any) => any): Promise<AttendanceRecord[]> {
    const rows = await pageAll((from, to) => build(db().from('attendance').select('id,employee_id,outlet_id,clock_in_at,clock_in_photo_path,clock_out_at,clock_out_photo_path,note,edited_by')).order('clock_in_at', { ascending: false }).range(from, to));
    if (rows.length === 0) return [];
    const names = new Map<string, string>(((must(await db().from('employees').select('id,name')) as Row[] | null) ?? []).map((e) => [e.id as string, e.name as string]));
    const paths = [...new Set(rows.flatMap((x) => [x.clock_in_photo_path, x.clock_out_photo_path]).filter((p): p is string => !!p))];
    const urls = new Map<string, string>();
    if (paths.length > 0) {
      const signed = await client.storage.from(ATTENDANCE_BUCKET).createSignedUrls(paths, ATTENDANCE_URL_TTL);
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    return rows.map((x): AttendanceRecord => ({
      id: x.id as string, employeeId: x.employee_id as string, employeeName: names.get(x.employee_id as string) ?? '(karyawan dihapus)', outletId: x.outlet_id as string,
      clockInAt: x.clock_in_at as string, ...(x.clock_out_at ? { clockOutAt: x.clock_out_at as string } : {}),
      ...(x.clock_in_photo_path && urls.has(x.clock_in_photo_path as string) ? { clockInPhotoUrl: urls.get(x.clock_in_photo_path as string)! } : {}),
      ...(x.clock_out_photo_path && urls.has(x.clock_out_photo_path as string) ? { clockOutPhotoUrl: urls.get(x.clock_out_photo_path as string)! } : {}),
      ...(x.note ? { note: x.note as string } : {}), edited: !!x.edited_by, minutes: attendanceMinutes(x.clock_in_at as string, (x.clock_out_at as string | null) ?? undefined),
    }));
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

  function billFromRow(x: Row): RecurringBill {
    return { id: x.id as string, name: x.name as string, amount: Number(x.amount), frequency: x.frequency as RecurringBill['frequency'], nextDue: x.next_due as string, expenseAccountId: x.expense_account_id as string, isActive: !!x.is_active, ...(x.supplier_id ? { supplierId: x.supplier_id as string } : {}), ...(x.outlet_id ? { outletId: x.outlet_id as string } : {}), ...(x.notes ? { notes: x.notes as string } : {}) };
  }
  function approvalFromRow(x: Row): ApprovalRequest {
    return { id: x.id as string, kind: x.kind as ApprovalRequest['kind'], title: x.title as string, amount: Number(x.amount), status: x.status as ApprovalStatus, createdAt: x.created_at as string, ...(x.ref_type ? { refType: x.ref_type as string } : {}), ...(x.ref_id ? { refId: x.ref_id as string } : {}), ...(x.note ? { note: x.note as string } : {}), ...(x.requested_by ? { requestedBy: x.requested_by as string } : {}), ...(x.decided_by ? { decidedBy: x.decided_by as string } : {}), ...(x.decided_at ? { decidedAt: x.decided_at as string } : {}), ...(x.decision_note ? { decisionNote: x.decision_note as string } : {}) };
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

  /** Apakah database sudah menerima migrasi 0029 (tabel print_stations)? Dicek sekali per sesi; tanpa itu kolom stasiun tidak dibaca/ditulis. */
  let stationsProbe: Promise<boolean> | null = null;
  const stationsAvailable = (): Promise<boolean> => {
    stationsProbe ??= (async () => { const r = await db().from('print_stations').select('id').limit(1); return !r.error; })().catch(() => false);
    return stationsProbe;
  };
  const productSelect = async (): Promise<string> => PRODUCT_SELECT.replace(',product_units(', (await stationsAvailable()) ? ',print_station_id,product_units(' : ',product_units(');
  /** Apakah database sudah menerima migrasi 0030 (tabel note_presets)? Dicek sekali per sesi. */
  let notesProbe: Promise<boolean> | null = null;
  const notesAvailable = (): Promise<boolean> => {
    notesProbe ??= (async () => { const r = await db().from('note_presets').select('id').limit(1); return !r.error; })().catch(() => false);
    return notesProbe;
  };
  const NOTES_NEED_MIGRATION = 'Catatan siap pakai belum bisa dipakai: database belum menerima migrasi 0030 (menunggu persetujuan Louis).';
  const toNote = (r: Row): NotePreset => ({ id: r.id as string, category: r.category as string, text: r.text as string, sort: Number(r.sort) || 0, isActive: r.is_active !== false });
  const STATION_NEEDS_MIGRATION = 'Stasiun cetak belum bisa dipakai: database belum menerima migrasi 0029 (menunggu persetujuan Louis).';
  const toStation = (r: Row): PrintStation => {
    const kind: StationKind = r.kind === 'label' ? 'label' : 'checker';
    return { id: r.id as string, name: r.name as string, kind, printMode: (['auto', 'ask', 'off'] as const).find((m) => m === r.print_mode) ?? 'ask', copies: Number(r.copies) || 1,
      paper: r.paper === '80' ? '80' : '58', template: normalizeTemplate(r.template, kind), sort: Number(r.sort) || 0, isActive: r.is_active !== false };
  };

  function mapKitchenError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur dapur belum aktif di database (migrasi 0018 belum diterapkan).');
    if (/not allowed/i.test(m)) return new DataError('forbidden', 'Akun ini tidak boleh mengakses dapur outlet ini.');
    if (/order not found/i.test(m)) return new DataError('not_found', 'Pesanan belum tersimpan di server. Simpan pesanan dulu.');
    if (/order is not active/i.test(m)) return new DataError('invalid', 'Pesanan ini sudah dibatalkan atau ditutup.');
    if (/invalid status|no items|too many items/i.test(m)) return new DataError('invalid', 'Pengubahan status ditolak server.');
    return mapDbError(error);
  }

  function mapAuthCodeError(error: { code?: string; message?: string }): DataError {
    const m = error.message ?? '';
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) return new DataError('invalid', 'Fitur kode otorisasi belum aktif di database (migrasi 0020 belum diterapkan).');
    if (/no access/i.test(m)) return new DataError('forbidden', 'Hanya pemilik, admin, atau manajer outlet ini yang boleh mengelola kode otorisasi.');
    if (/not your device/i.test(m)) return new DataError('forbidden', 'Perangkat ini tidak dikenali server.');
    if (/ttl must be|invalid permission/i.test(m)) return new DataError('invalid', 'Pengaturan kode ditolak server.');
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
      receiptHeader: s.receipt_header ?? undefined, receiptShowCashier: s.receipt_show_cashier !== false, receiptShowCustomer: s.receipt_show_customer !== false,
      receiptTemplate: sanitizeReceiptTemplate(s.receipt_template),
      settings: {
        taxCalc: s.tax_calc, taxMode: s.tax_mode, serviceChargePct: Number(s.service_charge_pct),
        serviceChargeTaxable: !!s.service_charge_taxable, serviceChargeOrderTypes: (s.service_charge_order_types ?? []) as OrderType[],
        roundingCashStep: Number(s.rounding_cash_step), roundingNoncashStep: Number(s.rounding_noncash_step),
        requireOpenShift: !!s.require_open_shift, allowNegativeStock: !!s.allow_negative_stock,
        cashOutDailyLimit: s.cash_out_daily_limit == null ? null : Number(s.cash_out_daily_limit),
        defaultOpeningCash: s.default_opening_cash == null ? null : Number(s.default_opening_cash),
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
          cashOutDailyLimit: s.cash_out_daily_limit == null ? null : Number(s.cash_out_daily_limit), requireCashPhoto: !!s.require_cash_photo,
          defaultOpeningCash: s.default_opening_cash == null ? null : Number(s.default_opening_cash),
          receiptHeader: s.receipt_header ?? '', receiptShowCashier: s.receipt_show_cashier !== false, receiptShowCustomer: s.receipt_show_customer !== false,
          receiptTemplate: sanitizeReceiptTemplate(s.receipt_template),
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
      const fields: Row = {
        service_charge_pct: input.serviceChargePct, service_charge_taxable: input.serviceChargeTaxable, service_charge_order_types: input.serviceChargeOrderTypes,
        rounding_cash_step: input.roundingCashStep, rounding_noncash_step: input.roundingNoncashStep, require_open_shift: input.requireOpenShift,
        allow_negative_stock: input.allowNegativeStock, receipt_footer: input.receiptFooter.trim() || null,
      };
      // kolom lama (sudah ada di produksi): hanya dikirim bila pemanggil menyertakannya, supaya klien lama tidak menimpa dengan null
      if (input.cashOutDailyLimit !== undefined) fields.cash_out_daily_limit = input.cashOutDailyLimit;
      if (input.requireCashPhoto !== undefined) fields.require_cash_photo = input.requireCashPhoto;
      // kolom baru (migrasi 0026): hanya dikirim bila diisi; tanpa migrasi, tolak dengan pesan jelas daripada merusak penyimpanan lain
      if (input.defaultOpeningCash != null) {
        const probe = await db().from('outlet_settings').select('default_opening_cash').limit(1);
        if (probe.error) throw new DataError('invalid', 'Modal awal bawaan belum bisa dipakai: database belum menerima migrasi 0026 (minta Claude menerapkannya setelah disetujui).');
        fields.default_opening_cash = input.defaultOpeningCash;
      } else if (input.defaultOpeningCash === null) {
        const probe = await db().from('outlet_settings').select('default_opening_cash').limit(1);
        if (!probe.error) fields.default_opening_cash = null;
      }
      // tampilan struk (migrasi 0027): kolom ditulis hanya bila pemanggil menyertakannya; tanpa migrasi, tolak hanya bila ada yang berbeda dari bawaan
      if (input.receiptHeader !== undefined || input.receiptShowCashier !== undefined || input.receiptShowCustomer !== undefined) {
        const probe = await db().from('outlet_settings').select('receipt_header').limit(1);
        const nonDefault = (input.receiptHeader ?? '').trim() !== '' || input.receiptShowCashier === false || input.receiptShowCustomer === false;
        if (probe.error && nonDefault) throw new DataError('invalid', 'Tampilan struk belum bisa dipakai: database belum menerima migrasi 0027 (minta Claude menerapkannya setelah disetujui).');
        if (!probe.error) {
          if (input.receiptHeader !== undefined) fields.receipt_header = input.receiptHeader.trim() || null;
          if (input.receiptShowCashier !== undefined) fields.receipt_show_cashier = input.receiptShowCashier;
          if (input.receiptShowCustomer !== undefined) fields.receipt_show_customer = input.receiptShowCustomer;
        }
      }
      // templat struk (migrasi 0031): ditulis hanya bila pemanggil menyertakannya; tanpa migrasi, tolak hanya bila ada yang berbeda dari bawaan
      if (input.receiptTemplate !== undefined) {
        const clean = sanitizeReceiptTemplate(input.receiptTemplate);
        const probe = await db().from('outlet_settings').select('receipt_template').limit(1);
        if (probe.error && Object.keys(clean).length > 0) throw new DataError('invalid', 'Templat struk belum bisa dipakai: database belum menerima migrasi 0031 (minta Claude menerapkannya setelah disetujui).');
        if (!probe.error) fields.receipt_template = clean;
      }
      const row = must(await db().from('outlet_settings').update(fields).eq('outlet_id', ctx.outletId).select('outlet_id').maybeSingle()) as Row | null;
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
      let qb = db().from('products').select(await productSelect()).eq('kind', 'bundle').is('deleted_at', null);
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
      const sel = await productSelect();
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(sel).eq('is_sellable', true).in('kind', ['goods', 'service', 'bundle']).is('deleted_at', null);
        if (!q.includeInactive) qb = qb.eq('is_active', true).eq('show_in_menu', true);
        if (q.categoryId) qb = qb.eq('category_id', q.categoryId);
        return qb.order('name').order('id').range(f, t);
      });
      const s = q.search?.trim().toLowerCase();
      return rows.map(toProduct).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s));
    },
    async getCustomItemProductId() {
      const { orgId } = await resolve();
      const { data, error } = await db().rpc('custom_item_product', { p_org: orgId });
      if (error) {
        if (/not allowed|no access/i.test(error.message ?? '')) throw new DataError('forbidden', 'Akun ini tidak boleh menjual item bebas.');
        throw new DataError('invalid', error.message ?? 'Item bebas gagal disiapkan');
      }
      return data as string;
    },
    async getProduct(id) {
      const row = must(await db().from('products').select(await productSelect()).eq('id', id).maybeSingle()) as Row | null;
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
      const sel = await productSelect();
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(sel).in('kind', ['goods', 'service']).is('deleted_at', null);
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
      const row = must(await db().from('products').select(await productSelect()).eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!row) return null;
      const parentId = (row.parent_id as string | null) ?? (row.is_sellable === false ? (row.id as string) : null);
      if (!parentId) return assembleCatalog([toProduct(row)])[0] ?? null;
      const head = parentId === row.id ? row : (must(await db().from('products').select(await productSelect()).eq('id', parentId).maybeSingle()) as Row | null);
      const kids = (must(await db().from('products').select(await productSelect()).eq('parent_id', parentId).is('deleted_at', null)) as Row[] | null) ?? [];
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
      const loc = q?.locationId ?? await stockLocation(ctx.outletId);
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
      const loc = input.locationId ?? await stockLocation(ctx.outletId);
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
    async listStockMovesBetween(range, kinds) {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const items = new Map((await self.listStock()).map((i) => [i.productId, i]));
      const rows = await pageAll((from, to) => {
        let q = db().from('stock_movements').select('id,product_id,kind,qty_delta,unit_cost,total_cost,qty_after,avg_cost_after,reason,ref_type,occurred_at')
          .eq('location_id', loc).gte('occurred_at', range.from).lt('occurred_at', range.to);
        if (kinds?.length) q = q.in('kind', kinds);
        return q.order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).range(from, to);
      });
      return rows.map((r): StockMoveEntry => {
        const it = items.get(r.product_id as string);
        return {
          id: r.id as string, productId: r.product_id as string, kind: r.kind as StockMoveKind, qtyDelta: Number(r.qty_delta), unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost),
          qtyAfter: Number(r.qty_after ?? 0), avgCostAfter: Number(r.avg_cost_after ?? 0), occurredAt: r.occurred_at as string,
          ...(r.reason ? { reason: r.reason as string } : {}), ...(r.ref_type ? { refType: r.ref_type as string } : {}),
          productName: it?.name ?? '(barang tidak lagi dilacak)', unit: it?.unit ?? '',
        };
      });
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
        ...(r.station_id ? { stationId: r.station_id as string } : {}),
        extras: ((r.extras ?? []) as Row[]).map((e) => ({ name: e.name as string, qty: Number(e.qty) })),
        ...(r.table_name ? { tableName: r.table_name as string } : {}), ...(r.label ? { label: r.label as string } : {}), ...(r.guest_count !== null && r.guest_count !== undefined ? { guestCount: Number(r.guest_count) } : {}),
        ...(r.queue_no !== null && r.queue_no !== undefined ? { queueNo: Number(r.queue_no) } : {}), ...(r.note ? { note: r.note as string } : {}),
      })));
    },
    async kitchenSend(orderId) {
      const { device } = await resolve();
      const { data, error } = await db().rpc('kitchen_send', { p_order: orderId, p_device: device?.id ?? null });
      if (error) throw mapKitchenError(error);
      const d = data as { sent: number; lines?: Row[] };
      const lines: SentLine[] = (d.lines ?? []).map((l) => ({
        itemId: l.itemId as string, stationId: l.stationId as string, name: l.name as string, qty: Number(l.qty), ...(l.note ? { note: l.note as string } : {}),
        extras: ((l.extras ?? []) as Row[]).map((e) => ({ name: e.name as string, qty: Number(e.qty) })),
      }));
      return { sent: Number(d.sent), lines };
    },
    async listNotePresets() {
      if (!(await notesAvailable())) return [];
      const { ctx } = await resolve();
      const rows = (must(await db().from('note_presets').select('*').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort').order('category')) as Row[] | null) ?? [];
      return rows.map(toNote);
    },
    async saveNotePreset(input) {
      const problem = notePresetProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!(await notesAvailable())) throw new DataError('invalid', NOTES_NEED_MIGRATION);
      const { ctx, orgId } = await resolve();
      const category = input.category.trim(), text = input.text.trim();
      try {
        if (input.id) {
          const patch: Row = { category, text };
          if (input.sort !== undefined) patch.sort = input.sort;
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          const row = must(await db().from('note_presets').update(patch).eq('id', input.id).is('deleted_at', null).select('*').maybeSingle()) as Row | null;
          if (!row) throw new DataError('forbidden', 'Catatan tidak ditemukan atau hanya pemilik dan manajer yang bisa mengubahnya');
          return toNote(row);
        }
        const last = must(await db().from('note_presets').select('sort').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort', { ascending: false }).limit(1)) as Row[] | null;
        const row = must(await db().from('note_presets').insert({ id: newId(), org_id: orgId, outlet_id: ctx.outletId, category, text, sort: input.sort ?? (Number(last?.[0]?.sort ?? 0) + 1), is_active: input.isActive ?? true }).select('*').single()) as Row;
        return toNote(row);
      } catch (e) {
        if (e instanceof DataError && /duplicate|unique|sudah ada/i.test(e.message)) throw new DataError('invalid', `Catatan "${text}" di kategori ${category} sudah ada`);
        throw e;
      }
    },
    async removeNotePreset(id) {
      if (!(await notesAvailable())) throw new DataError('invalid', NOTES_NEED_MIGRATION);
      const rows = (must(await db().from('note_presets').delete().eq('id', id).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Catatan tidak ditemukan atau tidak boleh dihapus akun ini');
    },
    async listPrintStations() {
      if (!(await stationsAvailable())) return [];
      const { ctx } = await resolve();
      const rows = (must(await db().from('print_stations').select('*').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort').order('name')) as Row[] | null) ?? [];
      return rows.map(toStation);
    },
    async savePrintStation(input) {
      const problem = stationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!(await stationsAvailable())) throw new DataError('invalid', STATION_NEEDS_MIGRATION);
      const { ctx, orgId } = await resolve();
      const name = input.name.trim();
      try {
        if (input.id) {
          const cur = must(await db().from('print_stations').select('*').eq('id', input.id).is('deleted_at', null).maybeSingle()) as Row | null;
          if (!cur) throw new DataError('not_found', 'Stasiun tidak ditemukan');
          const kind: StationKind = input.kind ?? (cur.kind === 'label' ? 'label' : 'checker');
          const patch: Row = { name, kind, template: normalizeTemplate({ ...(normalizeTemplate(cur.template, kind)), ...(input.template ?? {}) }, kind) };
          if (input.printMode) patch.print_mode = input.printMode;
          if (input.copies !== undefined) patch.copies = input.copies;
          if (input.paper) patch.paper = input.paper;
          if (input.sort !== undefined) patch.sort = input.sort;
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          const row = must(await db().from('print_stations').update(patch).eq('id', input.id).select('*').maybeSingle()) as Row | null;
          if (!row) throw new DataError('forbidden', 'Hanya pemilik dan manajer yang bisa mengubah stasiun cetak');
          return toStation(row);
        }
        const kind: StationKind = input.kind ?? 'checker';
        const last = must(await db().from('print_stations').select('sort').eq('outlet_id', ctx.outletId).is('deleted_at', null).order('sort', { ascending: false }).limit(1)) as Row[] | null;
        const row = must(await db().from('print_stations').insert({
          id: newId(), org_id: orgId, outlet_id: ctx.outletId, name, kind, print_mode: input.printMode ?? 'ask', copies: input.copies ?? 1, paper: input.paper ?? '58',
          template: normalizeTemplate(input.template ?? {}, kind), sort: input.sort ?? (Number(last?.[0]?.sort ?? 0) + 1), is_active: input.isActive ?? true,
        }).select('*').single()) as Row;
        return toStation(row);
      } catch (e) {
        if (e instanceof DataError && /duplicate|unique|sudah ada/i.test(e.message)) throw new DataError('invalid', `Stasiun "${name}" sudah ada`);
        throw e;
      }
    },
    async removePrintStation(id) {
      if (!(await stationsAvailable())) throw new DataError('invalid', STATION_NEEDS_MIGRATION);
      const rows = (must(await db().from('print_stations').delete().eq('id', id).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Stasiun tidak ditemukan atau tidak boleh dihapus akun ini');
    },
    async assignProductsToStation(input) {
      if (!(await stationsAvailable())) throw new DataError('invalid', STATION_NEEDS_MIGRATION);
      const ids = [...new Set(input.productIds ?? [])];
      if (ids.length === 0 && input.categoryId === undefined) throw new DataError('invalid', 'Pilih produk atau kategori yang mau dipetakan.');
      if (ids.length > 500) throw new DataError('invalid', 'Terlalu banyak produk sekaligus (maksimal 500).');
      const filters: string[] = [];
      if (ids.length) filters.push(`id.in.(${ids.join(',')})`, `parent_id.in.(${ids.join(',')})`);
      if (input.categoryId !== undefined) filters.push(`category_id.eq.${input.categoryId}`);
      const rows = (must(await db().from('products').update({ print_station_id: input.stationId }).or(filters.join(',')).neq('kind', 'bundle').is('deleted_at', null).select('id')) as Row[] | null) ?? [];
      return { changed: rows.length };
    },
    async kitchenSetStatus(itemIds, status) {
      if (itemIds.length === 0) throw new DataError('invalid', 'Pilih baris yang mau diubah.');
      const { error } = await db().rpc('kitchen_set_status', { p_items: itemIds, p_status: status });
      if (error) throw mapKitchenError(error);
    },
    async issueAuthCode(input) {
      const { ctx } = await resolve();
      const { data, error } = await db().rpc('auth_code_issue', { p_outlet: ctx.outletId, p_permission: input.permission, p_ttl_minutes: input.ttlMinutes, p_note: input.note?.trim() || null });
      if (error) throw mapAuthCodeError(error);
      const r = data as { id: string; code: string; expires_at: string };
      return { id: r.id, code: r.code, expiresAt: r.expires_at };
    },
    async listAuthCodes() {
      const { ctx } = await resolve();
      const { data, error } = await db().rpc('auth_code_list', { p_outlet: ctx.outletId, p_limit: 50 });
      if (error) throw mapAuthCodeError(error);
      return ((data ?? []) as Row[]).map((r): AuthCodeRow => ({
        id: r.id, permission: r.permission as AuthCodePermission, status: r.status as AuthCodeRow['status'], issuedBy: r.issued_by, issuedAt: r.issued_at, expiresAt: r.expires_at,
        ...(r.note ? { note: r.note as string } : {}), ...(r.issuer_email ? { issuerEmail: r.issuer_email as string } : {}), ...(r.used_at ? { usedAt: r.used_at as string } : {}),
        ...(r.used_order_number ? { usedOrderNumber: r.used_order_number as string } : {}), ...(r.revoked_at ? { revokedAt: r.revoked_at as string } : {}),
      }));
    },
    async revokeAuthCode(id) {
      const { data, error } = await db().rpc('auth_code_revoke', { p_id: id });
      if (error) throw mapAuthCodeError(error);
      return data === true;
    },
    async useAuthCode(code, permission, orderId) {
      const { r } = await requireDevice();
      const { data, error } = await db().rpc('auth_code_use', { p_device: r.device!.id, p_code: normalizeAuthCode(code), p_permission: permission, p_order: orderId ?? null });
      if (error) throw mapAuthCodeError(error);
      return typeof data === 'string' ? data : null;
    },

    // ---------- resep dan HPP ----------
    async listRecipeIngredients() {
      const { ctx } = await resolve();
      const loc = await stockLocation(ctx.outletId);
      const [prods, units, pus, bals] = await Promise.all([
        fetchAll<Row>((f, t) => db().from('products').select('id,name,base_unit_id').in('kind', ['ingredient', 'goods']).eq('track_stock', true).is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('units').select('id,name').is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('product_units').select('id,product_id,unit_id,conversion,buy_price,is_base').is('deleted_at', null).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('stock_balances').select('product_id,avg_cost').eq('location_id', loc).order('product_id').range(f, t)),
      ]);
      const unitName = new Map(units.map((u) => [u.id as string, u.name as string]));
      const avg = new Map(bals.map((b) => [b.product_id as string, Number(b.avg_cost ?? 0)]));
      const byProduct = new Map<string, Row[]>();
      for (const pu of pus) { const k = pu.product_id as string; (byProduct.get(k) ?? byProduct.set(k, []).get(k)!).push(pu); }
      return prods.map((p): RecipeIngredient => {
        const list = byProduct.get(p.id as string) ?? [];
        const base = list.find((x) => x.is_base) ?? list.find((x) => x.unit_id === p.base_unit_id);
        const baseUnit = unitName.get(p.base_unit_id as string) ?? 'unit';
        const units = list.map((x) => ({ unitId: x.unit_id as string, name: unitName.get(x.unit_id as string) ?? '?', factor: Number(x.conversion) }));
        if (!units.some((u) => u.unitId === p.base_unit_id)) units.unshift({ unitId: p.base_unit_id as string, name: baseUnit, factor: 1 });
        const average = avg.get(p.id as string) ?? 0;
        const buy = base ? Number(base.buy_price ?? 0) / (Number(base.conversion) || 1) : 0;
        const costSource: CostSource = average > 0 ? 'average' : buy > 0 ? 'buy_price' : 'none';
        return { id: p.id, name: p.name, baseUnit, units, unitCost: average > 0 ? average : buy, costSource };
      }).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async listRecipes() {
      const [prods, lines] = await Promise.all([
        self.listProducts({ includeInactive: true }),
        fetchAll<Row>((f, t) => db().from('recipe_lines').select('id,product_id,ingredient_id,qty,unit_id').order('id').range(f, t)),
      ]);
      const by = new Map<string, RecipeLine[]>();
      for (const l of lines) { const k = l.product_id as string; (by.get(k) ?? by.set(k, []).get(k)!).push({ ingredientId: l.ingredient_id as string, qty: Number(l.qty), unitId: l.unit_id as string }); }
      return prods.filter((p) => p.kind === 'goods' && p.isSellable !== false).map((p): RecipeProduct => ({ id: p.id, name: p.name, price: p.price, isActive: p.isActive, lines: by.get(p.id) ?? [] }));
    },
    async saveRecipe(productId, lines) {
      const ings = await self.listRecipeIngredients();
      const problem = recipeProblem(lines, new Map(ings.map((i) => [i.id, i])));
      if (problem) throw new DataError('invalid', problem);
      const { data, error } = await db().rpc('recipe_save', { p_product: productId, p_lines: lines.map((l) => ({ ingredient_id: l.ingredientId, qty: l.qty, unit_id: l.unitId })) });
      if (error) {
        const m = error.message ?? '';
        if (/not allowed|no access/i.test(m)) throw new DataError('forbidden', 'Hanya pemilik, admin, dan manajer yang boleh mengubah resep.');
        if (/product not found/i.test(m)) throw new DataError('not_found', 'Produk tidak ditemukan.');
        if (/no conversion/i.test(m)) throw new DataError('invalid', 'Salah satu satuan belum punya konversi ke satuan dasar bahan.');
        if (/duplicate key|recipe_lines_product_id_ingredient_id/i.test(m)) throw new DataError('invalid', 'Ada bahan yang muncul dua kali dalam resep.');
        if (/recipe /i.test(m)) throw new DataError('invalid', 'Resep ditolak server. Periksa bahan, satuan, dan jumlah.');
        throw mapDbError(error);
      }
      return Number(data ?? lines.length);
    },

    async listProductUnits(productId) {
      const { data, error } = await db().rpc('product_unit_list', { p_product: productId });
      if (error) {
        if (/product not found/i.test(error.message ?? '')) throw new DataError('not_found', 'Barang tidak ditemukan.');
        throw mapDbError(error);
      }
      return ((data as Row[] | null) ?? []).map((r): ProductUnitRow => ({ unitId: r.unit_id as string, name: r.unit_name as string, conversion: Number(r.conversion), isBase: !!r.is_base, buyPrice: Number(r.buy_price ?? 0), minPurchase: Number(r.min_purchase ?? 1), inUse: !!r.in_use }));
    },
    async saveProductUnit(input: ProductUnitInput) {
      const problem = productUnitProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { error } = await db().rpc('product_unit_save', { p_product: input.productId, p_unit_name: input.unitName.trim(), p_conversion: input.conversion, p_buy_price: input.buyPrice ?? 0, p_min_purchase: input.minPurchase ?? 1 });
      if (error) {
        const m = error.message ?? '';
        if (/not allowed|no access/i.test(m)) throw new DataError('forbidden', 'Hanya pemilik, admin, dan manajer yang boleh mengubah satuan.');
        if (/product not found/i.test(m)) throw new DataError('not_found', 'Barang tidak ditemukan.');
        if (/unit in use/i.test(m)) throw new DataError('invalid', 'Satuan ini sudah dipakai, jadi isinya tidak bisa diubah.');
        if (/already the base unit/i.test(m)) throw new DataError('invalid', 'Itu sudah satuan dasar barang ini.');
        if (/base unit conversion/i.test(m)) throw new DataError('invalid', 'Isi satuan dasar selalu 1.');
        if (/has no units/i.test(m)) throw new DataError('invalid', 'Jenis barang ini tidak punya satuan ganda.');
        if (/unit name|conversion must|buy price|minimum purchase/i.test(m)) throw new DataError('invalid', 'Isian satuan ditolak server. Periksa nama, isi, harga beli, dan minimum beli.');
        throw mapDbError(error);
      }
    },
    async removeProductUnit(productId, unitId) {
      const { data, error } = await db().rpc('product_unit_remove', { p_product: productId, p_unit: unitId });
      if (error) {
        const m = error.message ?? '';
        if (/not allowed|no access/i.test(m)) throw new DataError('forbidden', 'Hanya pemilik, admin, dan manajer yang boleh mengubah satuan.');
        if (/unit in use/i.test(m)) throw new DataError('invalid', 'Satuan ini sudah dipakai, jadi tidak bisa dihapus.');
        if (/base unit/i.test(m)) throw new DataError('invalid', 'Satuan dasar tidak bisa dihapus.');
        throw mapDbError(error);
      }
      return data === true;
    },

    async listDiscountUses(range) {
      const rows = await fetchAll<Row>((f, t) => db().from('order_discounts')
        .select('id,order_id,source,promotion_id,coupon_id,points_used,amount,authorized_by,orders!inner(status,closed_at)')
        .eq('orders.status', 'paid').gte('orders.closed_at', range.from).lt('orders.closed_at', range.to).order('id').range(f, t));
      return rows.map((d): DiscountUse => ({
        orderId: d.order_id as string, source: d.source as DiscountSource, promotionId: (d.promotion_id as string | null) ?? undefined, couponId: (d.coupon_id as string | null) ?? undefined,
        points: Number(d.points_used ?? 0), amount: Number(d.amount ?? 0), authorizedBy: (d.authorized_by as string | null) ?? undefined,
      }));
    },
    async listStockLocations() {
      const { data, error } = await db().rpc('stock_location_list');
      if (error) throw mapDbError(error);
      return ((data as Row[] | null) ?? []).map((r): StockLocation => ({ id: r.id as string, name: r.name as string, kind: r.kind === 'warehouse' ? 'warehouse' : 'outlet' }));
    },
    async listStockTransfers() {
      const { data, error } = await db().rpc('stock_transfer_list', { p_limit: 100 });
      if (error) throw mapDbError(error);
      return ((data as Row[] | null) ?? []).map((r): StockTransfer => ({
        id: r.id as string, number: r.number as string, status: r.status as TransferStatus, fromId: r.from_id as string, fromName: r.from_name as string, toId: r.to_id as string, toName: r.to_name as string,
        note: (r.note as string | null) ?? undefined, createdAt: r.created_at as string,
        lines: ((r.lines as Row[] | null) ?? []).map((l) => ({ productId: l.product_id as string, name: l.name as string, qty: Number(l.qty), receivedQty: Number(l.received_qty) })),
      }));
    },
    async createStockTransfer(input: StockTransferInput) {
      const problem = transferProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { data, error } = await db().rpc('stock_transfer_create', { p_id: input.id, p_from: input.fromId, p_to: input.toId, p_note: input.note?.trim() || null, p_lines: input.lines.map((l) => ({ product_id: l.productId, qty: l.qty })) });
      if (error) throw transferError(error.message ?? '', error);
      return { number: String((data as Row | null)?.number ?? '') };
    },
    async receiveStockTransfer(id) {
      const { error } = await db().rpc('stock_transfer_receive', { p_id: id });
      if (error) throw transferError(error.message ?? '', error);
    },
    async cancelStockTransfer(id) {
      const { error } = await db().rpc('stock_transfer_cancel', { p_id: id });
      if (error) throw transferError(error.message ?? '', error);
    },

    async setPriceOverride(productIds, pct) {
      const problem = priceOverridePctProblem(pct);
      if (problem) throw new DataError('invalid', problem);
      if (!productIds.length) return;
      const rows = (must(await db().from('products').update({ allow_price_override: pct > 0, max_price_override_pct: pct }).in('id', productIds).select('id')) as Row[] | null) ?? [];
      if (rows.length !== productIds.length) throw new DataError('forbidden', 'Sebagian produk tidak ditemukan, atau akunmu tidak boleh mengubahnya.');
    },

    // ---------- log aktivitas ----------
    async listActivity(q: ActivityQuery = {}) {
      const { data, error } = await db().rpc('activity_list', { p_from: q.from ?? null, p_to: q.to ?? null, p_entity: q.entity ?? null, p_limit: q.limit ?? 200 });
      if (error) throw error.code === '42501' || /no access/i.test(error.message ?? '') ? new DataError('forbidden', 'Hanya pemilik, admin, atau manajer yang boleh melihat log aktivitas.') : error;
      return ((data ?? []) as Row[]).map((r): ActivityRow => {
        const d = (r.detail ?? {}) as { name?: unknown; changes?: unknown };
        return {
          id: r.id, at: r.created_at, action: r.action, entity: r.entity,
          ...(r.entity_id ? { entityId: r.entity_id as string } : {}), ...(r.outlet_id ? { outletId: r.outlet_id as string } : {}),
          ...(r.actor_user_id ? { actorUserId: r.actor_user_id as string } : {}), ...(r.actor_email ? { actorEmail: r.actor_email as string } : {}),
          ...(typeof d.name === 'string' && d.name ? { name: d.name } : {}), changes: parseChanges(d.changes),
        };
      });
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
      const rows = must(await db().from('employees').select('id,name,role,is_active,role_id,employee_outlets!inner(outlet_id)')
        .eq('employee_outlets.outlet_id', ctx.outletId).is('deleted_at', null)
        .in('role', ['owner', 'manager', 'cashier']).order('name')) as Row[] | null;
      return (rows ?? []).map((e): ManagedEmployee => ({ id: e.id, name: e.name, role: e.role, isActive: !!e.is_active, ...(e.role_id ? { roleId: e.role_id as string } : {}) }));
    },
    async setEmployeeRoleId(employeeId, roleId) {
      const { error, data: row } = await db().from('employees').update({ role_id: roleId }).eq('id', employeeId).is('deleted_at', null).select('id').maybeSingle();
      if (error) throw error.code === '23503' ? new DataError('not_found', 'Peran tidak ditemukan') : mapDbError(error);
      if (!row) throw new DataError('not_found', 'Karyawan tidak ditemukan, atau akunmu tidak boleh mengubahnya');
      const saved = (await self.listManagedEmployees()).find((x) => x.id === employeeId);
      if (!saved) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      return saved;
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

    // ---------- absensi ----------
    async attendanceOpen() {
      const { deviceId } = await requireDevice();
      const { data, error } = await db().rpc('attendance_status', { p_device: deviceId });
      if (error) throw mapAttendanceError(error);
      return ((data ?? []) as Row[]).map((x) => ({ employeeId: x.employee_id as string, clockInAt: x.clock_in_at as string }));
    },
    async attendanceClockIn(employeeId, pin, photo, location) {
      const { r, deviceId } = await requireDevice();
      const path = await attendanceVerifyAndUpload(r.orgId, deviceId, employeeId, pin, 'in', photo);
      const { data, error } = await db().rpc('attendance_clock_in', { p_device: deviceId, p_employee: employeeId, p_pin: pin, p_photo_path: path, ...(location ? { p_lat: location.lat, p_lng: location.lng } : {}) });
      if (error) throw mapAttendanceError(error);
      const o = data as Row;
      return { id: o.id as string, clockInAt: o.clock_in_at as string };
    },
    async attendanceClockOut(employeeId, pin, photo) {
      const { r, deviceId } = await requireDevice();
      const path = await attendanceVerifyAndUpload(r.orgId, deviceId, employeeId, pin, 'out', photo);
      const { data, error } = await db().rpc('attendance_clock_out', { p_device: deviceId, p_employee: employeeId, p_pin: pin, p_photo_path: path });
      if (error) throw mapAttendanceError(error);
      const o = data as Row;
      return { id: o.id as string, clockInAt: o.clock_in_at as string, clockOutAt: o.clock_out_at as string };
    },
    async listAttendance(range, employeeId) {
      return attendanceRows((qb) => {
        let q = qb.gte('clock_in_at', range.from).lt('clock_in_at', range.to);
        if (employeeId) q = q.eq('employee_id', employeeId);
        return q;
      });
    },
    async saveAttendance(input: AttendanceInput) {
      const problem = attendanceProblem(input, now());
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      let outletId = r.ctx.outletId;
      if (input.id) {
        const cur = must(await db().from('attendance').select('outlet_id').eq('id', input.id).maybeSingle()) as Row | null;
        if (!cur) throw new DataError('not_found', 'Catatan absensi tidak ditemukan');
        outletId = cur.outlet_id as string;
      }
      const { data, error } = await db().rpc('attendance_admin_save', {
        p_id: input.id ?? null, p_org: r.orgId, p_employee: input.employeeId, p_outlet: outletId,
        p_clock_in: input.clockInAt, p_clock_out: input.clockOutAt ?? null, p_note: input.note ?? null,
      });
      if (error) throw mapAttendanceError(error);
      const saved = (await attendanceRows((qb) => qb.eq('id', data as string)))[0];
      if (!saved) throw new DataError('not_found', 'Catatan absensi tidak ditemukan');
      return saved;
    },
    async deleteAttendance(id) {
      const { error } = await db().rpc('attendance_admin_delete', { p_id: id });
      if (error) throw mapAttendanceError(error);
    },

    // ---------- peran kustom (tabel 0033) ----------
    async listRoles() {
      const r = await resolve();
      const roles = (must(await db().from('roles').select('*').eq('org_id', r.orgId).eq('is_built_in', false).is('deleted_at', null).order('name')) as Row[] | null) ?? [];
      if (roles.length === 0) return [];
      const ids = roles.map((x) => x.id as string);
      const grab = async (table: string) => (must(await db().from(table).select('*').in('role_id', ids)) as Row[] | null) ?? [];
      const [dm, pm, df, pf] = await Promise.all([grab('role_dashboard_perms'), grab('role_pos_perms_module'), grab('role_dashboard_feature_perms'), grab('role_pos_feature_perms')]);
      const mine = (rows: Row[], id: string) => rows.filter((x) => x.role_id === id);
      return roles.map((role) => roleFromRows({ role, dashModules: mine(dm, role.id as string), posModules: mine(pm, role.id as string), dashFeatures: mine(df, role.id as string), posFeatures: mine(pf, role.id as string) }));
    },
    async saveRolePermissions(role: RoleDefinition) {
      const problem = roleSaveProblem(role);
      if (problem) throw new DataError(isBuiltInRole(role) ? 'forbidden' : 'invalid', problem);
      const r = await resolve();
      const { data, error } = await db().rpc('save_role_permissions', roleToRpcArgs(role, r.orgId));
      if (error) throw mapRoleError(error);
      const saved = (await self.listRoles()).find((x) => x.id === (data as string));
      if (!saved) throw new DataError('not_found', 'Peran tidak ditemukan setelah disimpan.');
      return saved;
    },
    async deleteRole(roleId) {
      const { error } = await db().rpc('delete_role', { p_id: roleId });
      if (error) throw mapRoleError(error);
    },
    // ---------- payroll (semua tabel dilindungi RLS pemilik/manajer) ----------
    async listCompensation() {
      const r = await resolve();
      const emps = (must(await db().from('employees').select('id,name').eq('is_active', true).is('deleted_at', null).order('name')) as Row[] | null) ?? [];
      const rows = (must(await db().from('employee_compensation').select('employee_id,status,basic_salary,meal_allowance,bpjs_allowance,cash_advance_installment').eq('org_id', r.orgId)) as Row[] | null) ?? [];
      const by = new Map(rows.map((x) => [x.employee_id as string, x]));
      return emps.map((e): EmployeeCompensation => {
        const c = by.get(e.id as string);
        return { employeeId: e.id as string, employeeName: e.name as string, status: ((c?.status as EmploymentStatus | undefined) ?? 'permanent'), basicSalary: Number(c?.basic_salary ?? 0), mealAllowance: Number(c?.meal_allowance ?? 0), bpjsAllowance: Number(c?.bpjs_allowance ?? 0), cashAdvanceInstallment: Number(c?.cash_advance_installment ?? 0) };
      });
    },
    async saveCompensation(input) {
      const problem = compensationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const { error } = await db().from('employee_compensation').upsert({ employee_id: input.employeeId, org_id: r.orgId, status: input.status, basic_salary: input.basicSalary, meal_allowance: input.mealAllowance, bpjs_allowance: input.bpjsAllowance, cash_advance_installment: input.cashAdvanceInstallment }, { onConflict: 'employee_id' });
      if (error) throw mapPayrollError(error);
      const saved = (await self.listCompensation()).find((x) => x.employeeId === input.employeeId);
      if (!saved) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      return saved;
    },
    async listSchedules() {
      const rows = (must(await db().from('employee_schedules').select('employee_id,weekday,start_time')) as Row[] | null) ?? [];
      const out: Record<string, WeeklySchedule> = {};
      for (const x of rows) (out[x.employee_id as string] ??= []).push({ weekday: Number(x.weekday), start: String(x.start_time).slice(0, 5) });
      for (const k of Object.keys(out)) out[k]!.sort((a, b) => a.weekday - b.weekday);
      return out;
    },
    async saveSchedule(employeeId, schedule) {
      const problem = scheduleProblem(schedule);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const del = await db().from('employee_schedules').delete().eq('employee_id', employeeId);
      if (del.error) throw mapPayrollError(del.error);
      if (schedule.length > 0) {
        const { error } = await db().from('employee_schedules').insert(schedule.map((d) => ({ employee_id: employeeId, org_id: r.orgId, weekday: d.weekday, start_time: d.start })));
        if (error) throw mapPayrollError(error);
      }
    },
    async getPayrollRules() {
      const r = await resolve();
      const row = must(await db().from('payroll_rules').select('rules').eq('org_id', r.orgId).maybeSingle()) as Row | null;
      return mergePayrollRules((row?.rules as Record<string, unknown> | undefined) ?? null);
    },
    async savePayrollRules(rules) {
      const problem = payrollRulesProblem(rules);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const { error } = await db().from('payroll_rules').upsert({ org_id: r.orgId, rules }, { onConflict: 'org_id' });
      if (error) throw mapPayrollError(error);
      return mergePayrollRules(rules as unknown as Record<string, unknown>);
    },
    async listIncidents(range, employeeId) {
      const names = await employeeNames();
      const rows = await pageAll((from, to) => {
        let q = db().from('employee_incidents').select('id,employee_id,incident_date,kind,count,notes').gte('incident_date', range.from).lte('incident_date', range.to);
        if (employeeId) q = q.eq('employee_id', employeeId);
        return q.order('incident_date', { ascending: false }).range(from, to);
      });
      return rows.map((x): EmployeeIncident => ({ id: x.id as string, employeeId: x.employee_id as string, employeeName: names.get(x.employee_id as string) ?? '(karyawan dihapus)', date: x.incident_date as string, kind: x.kind as IncidentKind, count: Number(x.count), ...(x.notes ? { notes: x.notes as string } : {}) }));
    },
    async saveIncident(input) {
      const problem = incidentProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const id = input.id ?? newId();
      const { error } = await db().from('employee_incidents').upsert({ id, org_id: r.orgId, employee_id: input.employeeId, incident_date: input.date, kind: input.kind, count: input.count ?? 1, notes: input.notes?.trim() || null }, { onConflict: 'id' });
      if (error) throw mapPayrollError(error);
      const names = await employeeNames();
      return { id, employeeId: input.employeeId, employeeName: names.get(input.employeeId) ?? '', date: input.date, kind: input.kind, count: input.count ?? 1, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
    },
    async deleteIncident(id) {
      const { error } = await db().from('employee_incidents').delete().eq('id', id);
      if (error) throw mapPayrollError(error);
    },
    async listPurchasePriceMappings() {
      const rows = await pageAll((from, to) => db().from('purchase_price_map').select('product_id,mode,manual_price,manual_unit_id').range(from, to));
      return rows.map((x): PurchasePriceMapping => ({ productId: x.product_id as string, mode: x.mode as PurchasePriceMapping['mode'], ...(x.manual_price !== null && x.manual_price !== undefined ? { manualPrice: Number(x.manual_price) } : {}), ...(x.manual_unit_id ? { manualUnitId: x.manual_unit_id as string } : {}) }));
    },
    async setPurchasePriceMapping(input) {
      const problem = purchasePriceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const { error } = await db().rpc('purchase_price_set', { p_org: r.orgId, p_product: input.productId, p_mode: input.mode, p_price: input.mode === 'manual' ? input.price : null, p_unit: input.mode === 'manual' ? input.unitId ?? null : null });
      if (error) throw mapPurchasePriceError(error);
      return input.mode === 'manual'
        ? { productId: input.productId, mode: 'manual', manualPrice: input.price as number, ...(input.unitId ? { manualUnitId: input.unitId } : {}) }
        : { productId: input.productId, mode: 'last' };
    },
    async suggestPurchasePrice(productId) {
      const r = await resolve();
      const { data, error } = await db().rpc('purchase_price_suggest', { p_org: r.orgId, p_product: productId });
      if (error) throw mapPurchasePriceError(error);
      const o = data as Row;
      const source = o.source as PurchasePriceSuggestion['source'];
      return { source, ...(o.price !== null && o.price !== undefined ? { price: Number(o.price) } : {}), ...(o.unit_id ? { unitId: o.unit_id as string } : {}), ...(o.invoice_number ? { invoiceNumber: o.invoice_number as string } : {}), ...(o.invoice_date ? { invoiceDate: o.invoice_date as string } : {}) };
    },
    async listStockRequests(q) {
      const locs = new Map((await self.listStockLocations()).map((l) => [l.id, l.name] as const));
      const rows = await pageAll((from, to) => {
        let qb = db().from('stock_requests').select('id,number,status,requester_location_id,source_location_id,note,decision_note,transfer_id,created_at');
        if (q?.status) qb = qb.eq('status', q.status);
        return qb.order('created_at', { ascending: false }).range(from, to);
      });
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id as string);
      const lineRows = await pageAll((from, to) => db().from('stock_request_lines').select('request_id,product_id,qty,products(name)').in('request_id', ids).range(from, to));
      const byReq = new Map<string, StockRequest['lines']>();
      for (const l of lineRows) {
        const arr = byReq.get(l.request_id as string) ?? [];
        arr.push({ productId: l.product_id as string, name: ((l.products as { name?: string } | null)?.name) ?? '(barang dihapus)', qty: Number(l.qty) });
        byReq.set(l.request_id as string, arr);
      }
      return rows.map((x): StockRequest => ({
        id: x.id as string, number: x.number as string, status: x.status as StockRequestStatus,
        requesterId: x.requester_location_id as string, requesterName: locs.get(x.requester_location_id as string) ?? '(lokasi)',
        sourceId: x.source_location_id as string, sourceName: locs.get(x.source_location_id as string) ?? '(lokasi)',
        createdAt: x.created_at as string, lines: byReq.get(x.id as string) ?? [],
        ...(x.note ? { note: x.note as string } : {}), ...(x.decision_note ? { decisionNote: x.decision_note as string } : {}), ...(x.transfer_id ? { transferId: x.transfer_id as string } : {}),
      }));
    },
    async createStockRequest(input) {
      const problem = stockRequestProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const id = input.id ?? newId();
      const { error } = await db().rpc('stock_request_create', { p_id: id, p_requester: input.requesterId, p_source: input.sourceId, p_note: input.note?.trim() || null, p_lines: input.lines.map((l) => ({ product_id: l.productId, qty: l.qty })) });
      if (error) throw mapStockRequestError(error);
      const saved = (await self.listStockRequests()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan setelah disimpan');
      return saved;
    },
    async decideStockRequest(id, approve, note) {
      const { error } = await db().rpc('stock_request_decide', { p_id: id, p_approve: approve, p_note: note?.trim() || null });
      if (error) throw mapStockRequestError(error);
      const saved = (await self.listStockRequests()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      return saved;
    },
    async fulfillStockRequest(id) {
      const { error } = await db().rpc('stock_request_fulfill', { p_id: id, p_transfer_id: newId() });
      if (error) throw mapStockRequestError(error);
      const saved = (await self.listStockRequests()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      return saved;
    },
    async cancelStockRequest(id) {
      const { error } = await db().rpc('stock_request_cancel', { p_id: id });
      if (error) throw mapStockRequestError(error);
      const saved = (await self.listStockRequests()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      return saved;
    },
    async listRecurringBills(q) {
      const rows = await pageAll((from, to) => {
        let qb = db().from('recurring_bills').select('id,outlet_id,name,supplier_id,amount,frequency,next_due,expense_account_id,is_active,notes');
        if (!q?.includeInactive) qb = qb.eq('is_active', true);
        return qb.order('next_due').range(from, to);
      });
      return rows.map(billFromRow);
    },
    async saveRecurringBill(input) {
      const problem = recurringBillProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const row = { id: input.id ?? newId(), org_id: r.orgId, name: input.name.trim(), amount: input.amount, frequency: input.frequency, next_due: input.nextDue, expense_account_id: input.expenseAccountId, supplier_id: input.supplierId ?? null, outlet_id: input.outletId ?? null, is_active: input.isActive ?? true, notes: input.notes?.trim() || null };
      const { error } = await db().from('recurring_bills').upsert(row, { onConflict: 'id' });
      if (error) throw mapBillError(error);
      return billFromRow(row as Row);
    },
    async deleteRecurringBill(id) {
      const { error } = await db().from('recurring_bills').delete().eq('id', id);
      if (error) throw mapBillError(error);
    },
    async payRecurringBill(billId, payAccountId, date) {
      const { error } = await db().rpc('recurring_bill_pay', { p_bill: billId, p_pay_account: payAccountId, p_date: date });
      if (error) throw mapBillError(error);
      const rows = await pageAll((from, to) => db().from('recurring_bills').select('id,outlet_id,name,supplier_id,amount,frequency,next_due,expense_account_id,is_active,notes').eq('id', billId).range(from, to));
      if (!rows[0]) throw new DataError('not_found', 'Tagihan tidak ditemukan');
      return billFromRow(rows[0]);
    },
    async listRecurringBillRuns(billId) {
      const rows = await pageAll((from, to) => {
        let qb = db().from('recurring_bill_runs').select('bill_id,due_date,paid_on,amount');
        if (billId) qb = qb.eq('bill_id', billId);
        return qb.order('due_date', { ascending: false }).range(from, to);
      });
      return rows.map((x): RecurringBillRun => ({ billId: x.bill_id as string, dueDate: x.due_date as string, paidOn: x.paid_on as string, amount: Number(x.amount) }));
    },
    async listApprovals(q) {
      const rows = await pageAll((from, to) => {
        let qb = db().from('approval_requests').select('id,kind,title,amount,ref_type,ref_id,note,status,requested_by,decided_by,decided_at,decision_note,created_at');
        if (q?.status) qb = qb.eq('status', q.status as ApprovalStatus);
        return qb.order('created_at', { ascending: false }).range(from, to);
      });
      return rows.map(approvalFromRow);
    },
    async requestApproval(input) {
      const problem = approvalProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const id = input.id ?? newId();
      const { error } = await db().rpc('approval_request', { p_id: id, p_org: r.orgId, p_kind: input.kind, p_title: input.title.trim(), p_amount: input.amount, p_ref_type: input.refType ?? null, p_ref_id: input.refId ?? null, p_note: input.note?.trim() || null });
      if (error) throw mapBillError(error);
      const saved = (await self.listApprovals()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan setelah disimpan');
      return saved;
    },
    async decideApproval(id, approve, note) {
      const { error } = await db().rpc('approval_decide', { p_id: id, p_approve: approve, p_note: note?.trim() || null });
      if (error) throw mapBillError(error);
      const saved = (await self.listApprovals()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      return saved;
    },
    async cancelApproval(id) {
      const { error } = await db().rpc('approval_cancel', { p_id: id });
      if (error) throw mapBillError(error);
      const saved = (await self.listApprovals()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      return saved;
    },
    async listFixedAssets() {
      const rows = await pageAll((from, to) => db().from('fixed_assets').select('id,outlet_id,name,acquired_on,cost,salvage_value,useful_life_months,status').order('acquired_on', { ascending: false }).range(from, to));
      const deps = await pageAll((from, to) => db().from('asset_depreciations').select('asset_id,amount').range(from, to));
      const acc = new Map<string, { sum: number; n: number }>();
      for (const d of deps) { const cur = acc.get(d.asset_id as string) ?? { sum: 0, n: 0 }; cur.sum += Number(d.amount); cur.n += 1; acc.set(d.asset_id as string, cur); }
      return rows.map((x): FixedAsset => {
        const a = acc.get(x.id as string) ?? { sum: 0, n: 0 };
        const cost = Number(x.cost); const accumulated = Math.round(a.sum * 100) / 100;
        return { id: x.id as string, name: x.name as string, acquiredOn: x.acquired_on as string, cost, salvageValue: Number(x.salvage_value), usefulLifeMonths: Number(x.useful_life_months ?? 0), status: x.status as FixedAsset['status'], accumulatedDepreciation: accumulated, bookValue: Math.round((cost - accumulated) * 100) / 100, monthsDepreciated: a.n, ...(x.outlet_id ? { outletId: x.outlet_id as string } : {}) };
      });
    },
    async listAssetDepreciations(assetId) {
      const rows = await pageAll((from, to) => {
        let q = db().from('asset_depreciations').select('asset_id,period,amount');
        if (assetId) q = q.eq('asset_id', assetId);
        return q.order('period', { ascending: false }).range(from, to);
      });
      return rows.map((x): AssetDepreciationEntry => ({ assetId: x.asset_id as string, period: x.period as string, amount: Number(x.amount) }));
    },
    async saveFixedAsset(input) {
      const problem = fixedAssetProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const id = input.id ?? newId();
      const { error } = await db().rpc('fixed_asset_acquire', { p_id: id, p_org: r.orgId, p_name: input.name.trim(), p_acquired_on: input.acquiredOn, p_cost: input.cost, p_salvage: input.salvageValue, p_life_months: input.usefulLifeMonths, p_outlet: input.outletId ?? null, p_pay_account: input.payAccountId ?? null });
      if (error) throw mapAssetError(error);
      const saved = (await self.listFixedAssets()).find((x) => x.id === id);
      if (!saved) throw new DataError('not_found', 'Aset tidak ditemukan setelah disimpan');
      return saved;
    },
    async depreciateFixedAssets(period) {
      const r = await resolve();
      const { data, error } = await db().rpc('fixed_asset_depreciate', { p_org: r.orgId, p_period: period });
      if (error) throw mapAssetError(error);
      const o = data as Row;
      return { period: String(o.period), assets: Number(o.assets), total: Number(o.total) };
    },
    async disposeFixedAsset(input) {
      const current = (await self.listFixedAssets()).find((x) => x.id === input.assetId);
      if (!current) throw new DataError('not_found', 'Aset tidak ditemukan');
      const problem = disposalProblem(current, input, localDateString(new Date()));
      if (problem) throw new DataError('invalid', problem);
      const { error } = await db().rpc('fixed_asset_dispose', { p_asset: input.assetId, p_date: input.date, p_proceeds: input.proceeds, p_cash_account: input.cashAccountId ?? null, p_gain_loss_account: input.gainLossAccountId ?? null });
      if (error) throw mapAssetError(error);
      const saved = (await self.listFixedAssets()).find((x) => x.id === input.assetId);
      if (!saved) throw new DataError('not_found', 'Aset tidak ditemukan');
      return saved;
    },
    async listJobLevels() {
      const rows = await pageAll((from, to) => db().from('job_levels').select('id,name,rank').order('rank', { ascending: false }).order('name').range(from, to));
      return rows.map((x): JobLevel => ({ id: x.id as string, name: x.name as string, rank: Number(x.rank) }));
    },
    async saveJobLevel(input) {
      const problem = jobLevelProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const row = { id: input.id ?? newId(), org_id: r.orgId, name: input.name.trim(), rank: input.rank ?? 0 };
      const { error } = await db().from('job_levels').upsert(row, { onConflict: 'id' });
      if (error) throw mapHrError(error);
      return { id: row.id, name: row.name, rank: row.rank };
    },
    async deleteJobLevel(id) {
      const { error } = await db().from('job_levels').delete().eq('id', id);
      if (error) throw mapHrError(error);
    },
    async listOrgUnits() {
      const rows = await pageAll((from, to) => db().from('org_units').select('id,name,parent_id').order('name').range(from, to));
      return rows.map((x): OrgUnit => ({ id: x.id as string, name: x.name as string, ...(x.parent_id ? { parentId: x.parent_id as string } : {}) }));
    },
    async saveOrgUnit(input) {
      const existing = await self.listOrgUnits();
      const problem = orgUnitProblem(input, existing);
      if (problem) throw new DataError('invalid', problem);
      if (hrNameTaken(input.name, existing, input.id)) throw new DataError('invalid', 'Nama unit ini sudah dipakai.');
      const r = await resolve();
      const row = { id: input.id ?? newId(), org_id: r.orgId, name: input.name.trim(), parent_id: input.parentId ?? null };
      const { error } = await db().from('org_units').upsert(row, { onConflict: 'id' });
      if (error) throw mapHrError(error);
      return { id: row.id, name: row.name, ...(row.parent_id ? { parentId: row.parent_id } : {}) };
    },
    async deleteOrgUnit(id) {
      const { error } = await db().from('org_units').delete().eq('id', id);
      if (error) throw mapHrError(error);
    },
    async listEmployeeTypes() {
      const rows = await pageAll((from, to) => db().from('employee_types').select('id,name').order('name').range(from, to));
      return rows.map((x): EmployeeType => ({ id: x.id as string, name: x.name as string }));
    },
    async saveEmployeeType(input) {
      const problem = hrNameProblem(input.name);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const row = { id: input.id ?? newId(), org_id: r.orgId, name: input.name.trim() };
      const { error } = await db().from('employee_types').upsert(row, { onConflict: 'id' });
      if (error) throw mapHrError(error);
      return { id: row.id, name: row.name };
    },
    async deleteEmployeeType(id) {
      const { error } = await db().from('employee_types').delete().eq('id', id);
      if (error) throw mapHrError(error);
    },
    async listEmployeeHr() {
      const rows = await pageAll((from, to) => db().from('employee_hr').select('employee_id,job_level_id,org_unit_id,employee_type_id').range(from, to));
      return rows.map((x): EmployeeHr => ({ employeeId: x.employee_id as string, ...(x.job_level_id ? { jobLevelId: x.job_level_id as string } : {}), ...(x.org_unit_id ? { orgUnitId: x.org_unit_id as string } : {}), ...(x.employee_type_id ? { employeeTypeId: x.employee_type_id as string } : {}) }));
    },
    async saveEmployeeHr(input) {
      const r = await resolve();
      const { error } = await db().from('employee_hr').upsert({ employee_id: input.employeeId, org_id: r.orgId, job_level_id: input.jobLevelId, org_unit_id: input.orgUnitId, employee_type_id: input.employeeTypeId }, { onConflict: 'employee_id' });
      if (error) throw mapHrError(error);
      return { employeeId: input.employeeId, ...(input.jobLevelId ? { jobLevelId: input.jobLevelId } : {}), ...(input.orgUnitId ? { orgUnitId: input.orgUnitId } : {}), ...(input.employeeTypeId ? { employeeTypeId: input.employeeTypeId } : {}) };
    },
    async listAttendanceSettings() {
      const rows = await pageAll((from, to) => db().from('attendance_settings').select('outlet_id,latitude,longitude,radius_m,mode,require_photo').range(from, to));
      return rows.map((x): AttendanceSettings => ({ outletId: x.outlet_id as string, mode: x.mode as AttendanceSettings['mode'], requirePhoto: !!x.require_photo, ...(x.latitude !== null && x.longitude !== null ? { latitude: Number(x.latitude), longitude: Number(x.longitude) } : {}), ...(x.radius_m !== null ? { radiusM: Number(x.radius_m) } : {}) }));
    },
    async saveAttendanceSettings(input) {
      const problem = attendanceSettingsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const { error } = await db().from('attendance_settings').upsert({ outlet_id: input.outletId, org_id: r.orgId, latitude: input.latitude, longitude: input.longitude, radius_m: input.radiusM, mode: input.mode, require_photo: input.requirePhoto }, { onConflict: 'outlet_id' });
      if (error) throw mapHrError(error);
      return { outletId: input.outletId, mode: input.mode, requirePhoto: input.requirePhoto, ...(input.latitude !== null && input.longitude !== null ? { latitude: input.latitude, longitude: input.longitude } : {}), ...(input.radiusM !== null ? { radiusM: input.radiusM } : {}) };
    },
    async listNotifications() {
      const names = await employeeNames();
      const rows = await pageAll((from, to) => db().from('employee_notifications').select('id,employee_id,title,body,created_at').order('created_at', { ascending: false }).range(from, to));
      return rows.map((x): EmployeeNotification => ({ id: x.id as string, title: x.title as string, body: x.body as string, createdAt: x.created_at as string, ...(x.employee_id ? { employeeId: x.employee_id as string, employeeName: names.get(x.employee_id as string) ?? '(karyawan dihapus)' } : {}) }));
    },
    async sendNotification(input) {
      const problem = notificationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const id = newId();
      const { data, error } = await db().from('employee_notifications').insert({ id, org_id: r.orgId, employee_id: input.employeeId ?? null, title: input.title.trim(), body: input.body.trim() }).select('created_at').single();
      if (error) throw mapHrError(error);
      const names = await employeeNames();
      return { id, title: input.title.trim(), body: input.body.trim(), createdAt: (data as Row).created_at as string, ...(input.employeeId ? { employeeId: input.employeeId, employeeName: names.get(input.employeeId) ?? '' } : {}) };
    },
    async deleteNotification(id) {
      const { error } = await db().from('employee_notifications').delete().eq('id', id);
      if (error) throw mapHrError(error);
    },
    async listCashAdvances(employeeId) {
      const names = await employeeNames();
      const rows = await pageAll((from, to) => {
        let q = db().from('cash_advances').select('id,employee_id,kind,amount,entry_date,notes,payroll_period');
        if (employeeId) q = q.eq('employee_id', employeeId);
        return q.order('entry_date', { ascending: false }).range(from, to);
      });
      return rows.map((x): CashAdvance => ({ id: x.id as string, employeeId: x.employee_id as string, employeeName: names.get(x.employee_id as string) ?? '(karyawan dihapus)', kind: x.kind as CashAdvance['kind'], amount: Number(x.amount), date: x.entry_date as string, ...(x.notes ? { notes: x.notes as string } : {}), ...(x.payroll_period ? { payrollPeriod: x.payroll_period as string } : {}) }));
    },
    async saveCashAdvance(input) {
      const problem = cashAdvanceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const r = await resolve();
      const id = input.id ?? newId();
      const { error } = await db().from('cash_advances').upsert({ id, org_id: r.orgId, employee_id: input.employeeId, kind: input.kind, amount: input.amount, entry_date: input.date, notes: input.notes?.trim() || null }, { onConflict: 'id' });
      if (error) throw mapPayrollError(error);
      const names = await employeeNames();
      return { id, employeeId: input.employeeId, employeeName: names.get(input.employeeId) ?? '', kind: input.kind, amount: input.amount, date: input.date, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
    },
    async deleteCashAdvance(id) {
      const { error } = await db().from('cash_advances').delete().eq('id', id);
      if (error) throw mapPayrollError(error);
    },
    async listPayroll(month, year) { return payrollRows((qb) => qb.eq('period_month', month).eq('period_year', year)); },
    async listPayrollYear(year) { return payrollRows((qb) => qb.eq('period_year', year)); },
    async savePayrollPeriod(month, year, rows, lock) {
      const r = await resolve();
      const { error } = await db().rpc('payroll_save_period', { p_org: r.orgId, p_month: month, p_year: year, p_rows: rows.map(payrollRowToRpc), p_lock: lock });
      if (error) throw mapPayrollError(error);
    },
    async unlockPayroll(month, year) {
      const r = await resolve();
      const { data, error } = await db().rpc('payroll_unlock', { p_org: r.orgId, p_month: month, p_year: year });
      if (error) throw mapPayrollError(error);
      return Number(data ?? 0);
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
    async addCashMovement(input) {
      const { deviceId } = await requireDevice();
      if (!Number.isFinite(input.amount) || input.amount <= 0) throw new DataError('bad_amount', 'Jumlah harus lebih dari 0');
      const reason = input.reason.trim();
      if (reason.length < 3) throw new DataError('invalid', 'Alasan wajib diisi (minimal 3 huruf)');
      const occurredAt = now().toISOString();
      try {
        await pushOps(deviceId, [{
          type: 'cash.move', entityId: input.id,
          payload: { id: input.id, shift_id: input.shiftId, kind: input.kind, amount: Math.round(input.amount), reason: reason.slice(0, 120), employee_id: input.employeeId ?? null, occurred_at: occurredAt },
        }]);
      } catch (e) {
        const m = e instanceof Error ? e.message : '';
        if (/daily cash-out limit/i.test(m)) throw new DataError('invalid', 'Batas kas keluar harian terlampaui.');
        if (/needs a photo/i.test(m)) throw new DataError('invalid', 'Outlet ini mewajibkan foto bukti kas; belum didukung di layar ini.');
        throw e;
      }
      return { id: input.id, shiftId: input.shiftId, kind: input.kind, amount: Math.round(input.amount), reason: reason.slice(0, 120), occurredAt };
    },
    async listCashMovements(shiftId) {
      const rows = must(await db().from('cash_movements').select('id,shift_id,kind,amount,reason,occurred_at').eq('shift_id', shiftId).order('occurred_at')) as Row[] | null;
      return (rows ?? []).map((r): CashMovement => ({ id: r.id as string, shiftId: r.shift_id as string, kind: r.kind as 'in' | 'out', amount: Number(r.amount), reason: r.reason as string, occurredAt: r.occurred_at as string }));
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
        sku: (unitOf.get(i.productId)!.sku as string | null) ?? null, qty: i.qty, unitPrice: i.unitPrice, ...(i.basePrice != null ? { basePrice: i.basePrice } : {}), note: i.note ?? null, extras: i.extras,
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
    async listPriceChanges(range) {
      const names = await employeeNames();
      const rows = await pageAll((from, to) => db().from('order_items')
        .select('id,order_id,name,qty,unit_price,base_price,note,orders!inner(number,status,cashier_id,opened_at)')
        .not('base_price', 'is', null).gte('orders.opened_at', range.from).lt('orders.opened_at', range.to)
        .order('created_at', { ascending: false }).range(from, to));
      const out: PriceChange[] = [];
      for (const x of rows) {
        const o = x.orders as unknown as Row;
        const base = Number(x.base_price), unit = Number(x.unit_price), d = priceDelta(base, unit);
        if (!d) continue;
        out.push({
          orderId: x.order_id as string, orderNumber: o.number as string, orderStatus: o.status as PriceChange['orderStatus'],
          itemId: x.id as string, itemName: x.name as string, qty: Number(x.qty), basePrice: base, unitPrice: unit,
          diff: d.diff, diffPct: d.diffPct, lineImpact: d.diff * Number(x.qty),
          cashierId: o.cashier_id as string, cashierName: names.get(o.cashier_id as string) ?? '(karyawan dihapus)',
          at: o.opened_at as string,
          reason: (x.note as string) || undefined,
        });
      }
      return out.sort((a, b) => (a.at < b.at ? 1 : -1));
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
    async voidUnpaidOrder(orderId, reason, authorizedBy, authMethod = 'pin') {
      const { deviceId } = await requireDevice();
      const o = must(await db().from('orders').select('id,status,paid_total').eq('id', orderId).maybeSingle()) as Row | null;
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.status !== 'open' || Number(o.paid_total) > 0) {
        throw new DataError('order_locked', 'Hanya pesanan yang belum dibayar yang bisa dibatalkan; pesanan lunas lewat refund');
      }
      await pushOps(deviceId, [{
        type: 'order.void', entityId: orderId,
        payload: { order_id: orderId, authorized_by: authorizedBy, auth_method: authMethod, reason, voided_by: authorizedBy, voided_at: now().toISOString() },
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

    // ---------- grup pelanggan, harga grosir & jadwal harga ----------
    async listCustomerGroups() {
      const { orgId } = await resolve();
      try {
        const rows = must(await db().from('customer_groups').select('*').eq('org_id', orgId).order('name')) as Row[] | null;
        return (rows ?? []).map((r): CustomerGroup => ({
          id: r.id as string,
          name: r.name as string,
          description: (r.description as string) ?? '',
          createdAt: (r.created_at as string) ?? now().toISOString(),
          updatedAt: (r.updated_at as string) ?? now().toISOString(),
        }));
      } catch (e) {
        return [];
      }
    },
    async saveCustomerGroup(group) {
      const { orgId } = await resolve();
      const res = must(await db().rpc('customer_group_save', {
        p_org: orgId,
        p_id: group.id || null,
        p_name: group.name.trim(),
        p_description: group.description?.trim() ?? '',
      })) as Row;
      return {
        id: res.id as string,
        name: res.name as string,
        description: (res.description as string) ?? '',
        createdAt: (res.created_at as string) ?? now().toISOString(),
        updatedAt: (res.updated_at as string) ?? now().toISOString(),
      };
    },
    async deleteCustomerGroup(id) {
      const { orgId } = await resolve();
      must(await db().rpc('customer_group_delete', {
        p_org: orgId,
        p_id: id,
      }));
    },
    async listCustomerGroupMembers(groupId) {
      const { orgId } = await resolve();
      try {
        let qb = db().from('customer_group_members').select('*').eq('org_id', orgId);
        if (groupId) qb = qb.eq('group_id', groupId);
        const rows = must(await qb) as Row[] | null;
        return (rows ?? []).map((r): CustomerGroupMember => ({
          customerId: r.customer_id as string,
          groupId: r.group_id as string,
          assignedAt: (r.assigned_at as string) ?? now().toISOString(),
        }));
      } catch (e) {
        return [];
      }
    },
    async setCustomerGroup(customerId, groupId) {
      const { orgId } = await resolve();
      must(await db().rpc('customer_group_assign', {
        p_org: orgId,
        p_customer_id: customerId,
        p_group_id: groupId || null,
      }));
    },
    async listTieredPrices(groupId) {
      const { orgId } = await resolve();
      try {
        let qb = db().from('tiered_prices').select('*').eq('org_id', orgId);
        if (groupId) qb = qb.eq('group_id', groupId);
        const rows = must(await qb) as Row[] | null;
        return (rows ?? []).map((r): GroupProductTieredPricing => ({
          id: r.id as string,
          groupId: r.group_id as string,
          productId: r.product_id as string,
          tiers: (r.tiers as TieredPriceRule[]) ?? [],
          updatedAt: (r.updated_at as string) ?? now().toISOString(),
        }));
      } catch (e) {
        return [];
      }
    },
    async saveTieredPrices(input) {
      const { orgId } = await resolve();
      const res = must(await db().rpc('tiered_price_save', {
        p_org: orgId,
        p_id: input.id || null,
        p_group_id: input.groupId,
        p_product_id: input.productId,
        p_tiers: input.tiers,
      })) as Row;
      return {
        id: res.id as string,
        groupId: res.group_id as string,
        productId: res.product_id as string,
        tiers: (res.tiers as TieredPriceRule[]) ?? [],
        updatedAt: (res.updated_at as string) ?? now().toISOString(),
      };
    },
    async deleteTieredPrices(target) {
      const { orgId } = await resolve();
      const p_id = typeof target === 'string' ? target : target.id ?? null;
      const p_group_id = typeof target === 'object' ? target.groupId : null;
      const p_product_id = typeof target === 'object' ? target.productId : null;
      must(await db().rpc('tiered_price_delete', {
        p_org: orgId,
        p_id,
        p_group_id,
        p_product_id,
      }));
    },
    async listPriceSchedules() {
      const { orgId } = await resolve();
      try {
        const rows = must(await db().from('price_schedules').select('*').eq('org_id', orgId).is('deleted_at', null).order('starts_at')) as Row[] | null;
        return (rows ?? []).map((r): PriceSchedule => ({
          id: r.id as string,
          productId: (r.product_id as string) ?? '',
          newPrice: Number(r.price),
          startAt: (r.starts_at as string) ?? now().toISOString(),
          endAt: (r.ends_at as string) ?? now().toISOString(),
          note: (r.note as string) ?? undefined,
          createdAt: (r.created_at as string) ?? now().toISOString(),
        }));
      } catch (e) {
        return [];
      }
    },
    async savePriceSchedule(schedule) {
      const { orgId } = await resolve();
      const res = must(await db().rpc('price_schedule_save', {
        p_org: orgId,
        p_id: schedule.id || null,
        p_product_id: schedule.productId,
        p_price: schedule.newPrice,
        p_start: schedule.startAt,
        p_end: schedule.endAt,
        p_note: schedule.note ?? '',
      })) as Row;
      return {
        id: res.id as string,
        productId: (res.product_id as string) ?? schedule.productId,
        newPrice: Number(res.price),
        startAt: (res.starts_at as string) ?? schedule.startAt,
        endAt: (res.ends_at as string) ?? schedule.endAt,
        note: (res.note as string) ?? undefined,
        createdAt: (res.created_at as string) ?? now().toISOString(),
      };
    },
    async deletePriceSchedule(id) {
      const { orgId } = await resolve();
      must(await db().rpc('price_schedule_delete', {
        p_org: orgId,
        p_id: id,
      }));
    },
  };
  const tableOps = createTableOps({
    getOrder: (id) => self.getOrder(id), saveOrder: (d, c) => self.saveOrder(d, c),
    voidUnpaidOrder: (id, r, by) => self.voidUnpaidOrder(id, r, by), listTableStatus: () => self.listTableStatus(),
  });
  return self;
}

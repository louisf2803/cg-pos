import type { DataLayer } from './data';
import { COFFEE_GROUND_BAHAN_BAKU } from './seed-bahan-baku';
import { mergePaymentMethodConfigs, paymentMethodProblem, type PaymentMethodConfig, type PaymentChannelKind } from './payment-methods';
import { ingredientCategoryName } from './ingredient-categories';
import { createTableOps } from './table-ops';
import { sanitizeReceiptTemplate } from './receipt-template';
import { customerMatches, customerProblem, normalizePhone } from './customer';
import { DEFAULT_LOYALTY, loyaltyRulesProblem, loyaltyRewardProblem, refundPointsDelta, earnedPoints, type LoyaltyEntry, type LoyaltyRules, type LoyaltyProductReward } from './loyalty';
import { couponInputProblem, couponReferenceProblem, fitDiscounts, normalizeCode, normalizeCouponReference, promotionProblem } from './promo';
import { bytesToDataUri, photoProblem } from './photo';
import { buildShiftReport, type ShiftInputs } from './shift-report';
import { priceOverridePctProblem } from './price-override';
import type { DiscountUse } from './promo-report';
import { transferProblem, type StockLocation, type StockTransfer, type StockTransferInput } from './stock-transfer';
import { productUnitProblem, type ProductUnitInput, type ProductUnitRow } from './product-unit';
import type { CustomerGroup, CustomerGroupMember, GroupProductTieredPricing, TieredPriceRule } from './tiered-pricing';
import type { CustomerDepositBalance, CustomerDepositEntry } from './deposit-report';
import type { NonCashReconciliationRecord, SaveReconciliationInput } from './reconcile';
import type { PriceSchedule } from './price-schedule';
import { recipeProblem, type RecipeIngredient, type RecipeLine, type RecipeProduct } from './recipe';
import { parseChanges, type ActivityQuery, type ActivityRow } from './activity';
import { AUTH_CODE_LENGTH, normalizeAuthCode, type AuthCodePermission, type AuthCodeRow, type IssuedAuthCode } from './auth-code';
import { DataError } from './types';
import { attendanceMinutes, attendanceProblem } from './attendance';
import { priceDelta } from './price-change';
import { roleSaveProblem } from './roles';
import { isBuiltInRole, validateRoleName, type RoleDefinition } from './permission-matrix';
import { purchasePriceProblem, suggestPurchasePrice as pickSuggestion, type PurchasePriceMapping } from './purchase-price';
import {
  canDeleteDepositPackage, depositPackageProblem,
  type DepositPackage, type DepositRefundRecord, type DepositSaleRecord,
} from './deposit';
import { localDateString, localMonthStart } from './local-date';
import { createFakeSalesInvoices } from './sales-invoice';
import { fakeOutletComparison } from './outlet-compare';
import { createFakePaymentAccounts } from './payment-accounts';
import { createFakeSalesDocuments } from './sales-documents';
import { createFakeCampaigns } from './crm-campaign';
import { createFakePriceRules } from './channel-prices';
import { createFakeProduction } from './production';
import { createFakeLabelPapers } from './label-paper';
import { stockRequestProblem, type StockRequest } from './stock-requests';
import { approvalProblem, nextDueAfter, recurringBillProblem, type ApprovalRequest, type RecurringBill, type RecurringBillRun } from './bills';
import { depreciationSchedule, disposalGainLoss, disposalProblem, fixedAssetProblem, firstDepreciationPeriod, type AssetDepreciationEntry, type FixedAsset } from './fixed-assets';
import { appointmentProblem, type Appointment, type AppointmentInput } from './appointment';
import { attendanceSettingsProblem, hrNameProblem, hrNameTaken, jobLevelProblem, notificationProblem, orgUnitProblem, type AttendanceSettings, type EmployeeHr, type EmployeeNotification, type EmployeeType, type JobLevel, type OrgUnit } from './hr';
import { cashAdvanceBalances, cashAdvanceProblem, compensationProblem, incidentProblem, mergePayrollRules, payrollRulesProblem, scheduleProblem, type CashAdvance, type CashAdvanceInput, type EmployeeCompensation, type EmployeeIncident, type EmployeeIncidentInput, type PayrollRecord, type PayrollRecordInput, type PayrollRules, type WeeklySchedule } from './payroll';
import type {
  Bundle, BundleInput, Coupon, CouponInput, Customer, DiscountEntry, Promotion, PromotionInput, CatalogInput, CatalogProduct, Category, ExtraGroup, ExtraGroupInput, Department, Refund, RefundInput, DiningTable, Floor, TableStatus, Employee, EmployeeInput, ManagedEmployee, Order, OrderDraft, OrderItem, OutletContext, Payment, PaymentMethod, Product, ProductInput,
  SalesRange, SalesSummary, Shift, ShiftReport, CashMovement, AttendanceInput, AttendanceRecord, PriceChange,
} from './types';
import { computeOrder, type OrderType } from './order-calc';
import { outletInfoProblem, outletOptionsProblem, taxSettingsProblem, type ManagedOutlet } from './outlet';
import { refundAmounts, refundProblem } from './refund';
import { extraGroupProblem, extrasLineTotal } from './extras';
import { bundleProblem } from './bundle';
import { formatOrderNumber, localDateKey, localParts } from './order-number';
import { newId } from './id';
import { assembleCatalog, variantProductName, variantsProblem } from './variants';
import { roundToStep } from './money';
import { paymentRefProblem } from './payment-rules';
import { groupTickets, type KitchenRow, type KitchenStatus } from './kitchen';
import { notePresetProblem, type NotePreset, type NotePresetInput } from './notes';
import { defaultTemplate, normalizeTemplate, stationProblem, type PrintStation, type PrintStationInput, type SentLine } from './station';
import {
  accountProblem, balanceSheetOf, balanceSheetTotals, cashFlowOf, incomeStatementOf, journalProblem, ledgerOf, trialBalanceOf,
  type Account, type AccountInput, type FinLine, type Journal, type JournalInput, type JournalSummary,
} from './finance';
import {
  addDays, invoiceOutstanding, invoiceStatusFor, purchaseInvoiceProblem, purchaseLineTotal, purchaseOrderProblem, purchasePayProblem, purchaseReceiveProblem, purchaseSubtotal, purchaseTotal, purchaseUnitCost, supplierProblem,
  type PayAccount, type PurchaseInvoice, type PurchaseInvoiceInput, type PurchaseInvoiceSummary, type PurchaseItem, type PurchaseLine, type PurchaseOrder, type PurchaseOrderInput, type PurchasePayInput, type PurchasePayment, type PurchaseReceiveInput, type PurchaseUnit, type Supplier, type SupplierInput,
} from './purchasing';
import { applyStockMove, makeStockItem, opnameDifference, opnameProblem, stockFilterMatches, stockPostProblem, stockSearchMatches, type StockItem, type StockMove, type StockMoveKind, type StockOpname, type StockOpnameInput, type StockPostInput } from './stock';

const CTX: OutletContext = {
  orgName: 'Kopi Contoh', outletId: 'outlet-1', outletCode: 'OUT1', outletName: 'Outlet Contoh', timezone: 'Asia/Jakarta', deviceCode: 'A',
  settings: {
    taxCalc: 'after_discount', taxMode: 'per_order', serviceChargePct: 0, serviceChargeTaxable: false,
    serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 100, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true, autoReconcileNoncash: false,
  },
  taxes: [{ id: 'tax-pb1', name: 'PB1', rate: 10, orderTypes: ['dine_in', 'takeaway', 'delivery', 'service'] }],
};

let fakeTax: { id: string; name: string; rate: number; orderTypes?: OrderType[]; orderTypeRates?: Partial<Record<OrderType, number>> } = { id: 'tax-pb1', name: 'PB1', rate: 10, orderTypes: ['dine_in', 'takeaway', 'delivery', 'service'] };
const CTX0 = JSON.parse(JSON.stringify(CTX)) as OutletContext;
const CATEGORIES: Category[] = [
  { id: 'c-kopi', name: 'Kopi', sort: 1, departmentId: 'd-min' }, { id: 'c-non', name: 'Non-kopi', sort: 2, departmentId: 'd-min' },
  { id: 'c-makan', name: 'Makanan', sort: 3, departmentId: 'd-mak' }, { id: 'c-camil', name: 'Camilan', sort: 4, departmentId: 'd-mak' },
];
const DEPARTMENTS: Department[] = [{ id: 'd-min', name: 'Minuman', sort: 1 }, { id: 'd-mak', name: 'Makanan', sort: 2 }];
const P = (id: string, name: string, categoryId: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name, categoryId, price, kind: 'goods', trackStock: true, isActive: true, isFavorite: false, stock: 50, ...extra });
const EXTRA_GROUPS: ExtraGroup[] = [
  { id: 'g-gula', name: 'Level gula', required: false, mode: 'single', maxSelect: null, productIds: ['p1', 'p3', 'pv-teh'], options: [{ id: 'o-normal', name: 'Gula normal', price: 0, sort: 1 }, { id: 'o-less', name: 'Kurang manis', price: 0, sort: 2 }, { id: 'o-no', name: 'Tanpa gula', price: 0, sort: 3 }] },
  { id: 'g-tambah', name: 'Tambahan', required: false, mode: 'multiple', maxSelect: 3, productIds: ['p1', 'p2', 'p3', 'pv-teh'], options: [{ id: 'o-shot', name: 'Extra shot', price: 5000, sort: 1 }, { id: 'o-oat', name: 'Susu oat', price: 6000, sort: 2 }, { id: 'o-cream', name: 'Whipped cream', price: 4000, sort: 3 }] },
];
const PRODUCTS: Product[] = [
  P('p1', 'Kopi susu gula aren', 'c-kopi', 20000, { isFavorite: true, sku: 'KP-001' }),
  P('p2', 'Americano', 'c-kopi', 18000, { sku: 'KP-002' }),
  P('p3', 'Latte', 'c-kopi', 24000, { sku: 'KP-003' }),
  P('p4', 'Espresso', 'c-kopi', 15000, { sku: 'KP-004', photoUrl: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 30'%3E%3Crect width='40' height='30' fill='%23c9a27e'/%3E%3Ccircle cx='20' cy='15' r='9' fill='%236b4423'/%3E%3C/svg%3E" }),
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
  P('p12', 'Kentang goreng', 'c-camil', 15000, { sku: 'CM-001', priceOverridePct: 20 }),
  P('p13', 'Pisang goreng', 'c-camil', 14000, { sku: 'CM-002', stock: 0 }),
  P('p14', 'Singkong keju', 'c-camil', 16000, { sku: 'CM-003' }),
];
const ALL_TYPES: Promotion['orderTypes'] = ['dine_in', 'takeaway', 'delivery', 'service'];
const SEED_PROMOS: Promotion[] = [
  { id: 'pr-10', name: 'Diskon 10% belanja 30 ribu', kind: 'percent_order', value: 10, minSpend: 30000, productIds: [], orderTypes: ALL_TYPES, isActive: true },
  { id: 'pr-kopi', name: 'Hemat kopi', kind: 'amount_item', value: 3000, minSpend: 0, productIds: ['p1', 'p2'], orderTypes: ALL_TYPES, isActive: true },
  { id: 'pr-5k', name: 'Potongan 5 ribu', kind: 'amount_order', value: 5000, minSpend: 0, productIds: [], orderTypes: ALL_TYPES, isActive: true },
];
const SEED_COUPONS: Coupon[] = [{ id: 'cp-hemat5', promotionId: 'pr-5k', code: 'HEMAT5', usageLimit: 2, usedCount: 0, isActive: true }];
const SEED_CUSTOMERS: Customer[] = [
  { id: 'cu-budi', name: 'Pak Budi', phone: '081234567801', pointsBalance: 0, createdAt: '2026-10-01T03:00:00Z' },
  { id: 'cu-ani', name: 'Bu Ani', phone: '081234567802', email: 'ani@example.com', gender: 'female', pointsBalance: 0, createdAt: '2026-10-05T03:00:00Z' },
  { id: 'cu-dewi', name: 'Kak Dewi', phone: '081234567803', birthDate: '1996-03-14', pointsBalance: 0, createdAt: '2026-10-20T03:00:00Z' },
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
  { id: 'm-free', code: 'FREE', name: 'Gratis', kind: 'complimentary', requiresOnline: false },
];


/** Daftar akun bawaan (sama dengan data bawaan server): [kode, nama, jenis, kelompok, kunci sistem]. */
const FAKE_COA: [string, string, 'header' | 'detail', Account['category'], string | undefined][] = [
  ['1-1000', 'Aset Lancar', 'header', 'other_current_asset', undefined], ['1-1100', 'Kas', 'detail', 'cash_bank', 'cash_main'], ['1-1200', 'Bank', 'detail', 'cash_bank', 'bank_main'],
  ['1-1300', 'Piutang Gateway (DOKU)', 'detail', 'receivable', 'gateway_clearing'], ['1-1310', 'Piutang Non-tunai (EDC/Transfer)', 'detail', 'receivable', 'noncash_clearing'],
  ['1-1400', 'Piutang Usaha', 'detail', 'receivable', 'accounts_receivable'], ['1-1500', 'Persediaan', 'detail', 'inventory', 'inventory'],
  ['1-1600', 'Uang Muka Pemasok', 'detail', 'other_current_asset', 'supplier_advance'], ['1-1700', 'Pajak Masukan', 'detail', 'other_current_asset', 'purchase_tax_input'],
  ['1-2000', 'Aset Tetap', 'header', 'fixed_asset', undefined], ['1-2100', 'Peralatan', 'detail', 'fixed_asset', 'fixed_asset_equipment'],
  ['1-2900', 'Akumulasi Penyusutan', 'detail', 'accumulated_depreciation', 'accumulated_depreciation'], ['2-1000', 'Kewajiban Jangka Pendek', 'header', 'short_term_liability', undefined],
  ['2-1100', 'Utang Usaha', 'detail', 'payable', 'accounts_payable'], ['2-1200', 'Pajak Penjualan Terutang', 'detail', 'short_term_liability', 'tax_payable'],
  ['2-1300', 'Deposit Pelanggan', 'detail', 'short_term_liability', 'customer_deposit'], ['3-1000', 'Modal Disetor', 'detail', 'equity', 'paid_in_capital'],
  ['3-2000', 'Saldo Awal Ekuitas', 'detail', 'equity', 'opening_balance_equity'], ['4-1000', 'Penjualan', 'detail', 'revenue', 'sales_revenue'], ['4-1100', 'Biaya Layanan', 'detail', 'revenue', 'service_revenue'],
  ['4-1900', 'Diskon Penjualan', 'detail', 'revenue', 'sales_discount'], ['4-1950', 'Retur Penjualan', 'detail', 'revenue', 'sales_returns'], ['5-1000', 'Harga Pokok Penjualan', 'detail', 'cogs', 'cogs'],
  ['5-2000', 'Selisih Persediaan', 'detail', 'cogs', 'inventory_adjustment'], ['6-1000', 'Beban Gaji', 'detail', 'expense', undefined], ['6-1100', 'Beban Sewa', 'detail', 'expense', undefined],
  ['6-1900', 'Beban Kas Keluar Lainnya', 'detail', 'expense', 'cash_out_expense'], ['6-2000', 'Beban Penyusutan', 'detail', 'expense', 'depreciation_expense'], ['6-2100', 'Biaya Gateway', 'detail', 'expense', 'gateway_fee_expense'],
  ['6-2200', 'Beban Gratis/Complimentary', 'detail', 'expense', 'complimentary_expense'], ['6-2300', 'Selisih Kas', 'detail', 'expense', 'cash_over_short'], ['6-2400', 'Selisih Rekonsiliasi', 'detail', 'expense', 'reconciliation_diff'],
  ['7-1000', 'Pendapatan Lain-lain', 'detail', 'other_income', undefined], ['7-1100', 'Pembulatan', 'detail', 'other_income', 'rounding'], ['7-1200', 'Kas Masuk Lainnya', 'detail', 'other_income', 'cash_in_other'],
  ['8-1000', 'Beban Lain-lain', 'detail', 'other_expense', undefined],
];
const coaId = (code: string, key?: string) => (key === 'cash_main' ? 'acc-kas' : key === 'bank_main' ? 'acc-bank' : `acc-${code}`);
interface FakeEntry { id: string; number: string; date: string; description: string; sourceType: string; sourceId?: string; status: 'posted' | 'voided'; reversesId?: string; lines: { accountId: string; debit: number; credit: number; memo?: string }[] }

export interface FakeOptions { now?: () => Date; seed?: boolean; /** dua pesanan terbuka yang sudah ada di layar dapur, untuk pengembangan layar dapur */ kitchenDemo?: boolean }

/** Data palsu di memori. PIN disimpan polos HANYA di sini; versi asli memakai bcrypt di server. */
export function createFakeData(opts: FakeOptions = {}): DataLayer & { reset(): void } {
  const now = opts.now ?? (() => new Date());
  let categories: Category[] = [];
  let departments: Department[] = [];
  let floors: Floor[] = [];
  let refunds: (Refund & { shiftId?: string; methodKind: PaymentMethod['kind'] })[] = [];
  let tables: DiningTable[] = [];
  let customers: (Customer & { deleted?: boolean })[] = [];
  let promotions: (Promotion & { deleted?: boolean })[] = [];
  let coupons: Coupon[] = [];
  let loyaltyRules: LoyaltyRules = { ...DEFAULT_LOYALTY };
  let loyaltyProductRewards: LoyaltyProductReward[] = [];
  let ledger: LoyaltyEntry[] = [];
  let ingredients: { id: string; name: string; unit: string; qty: number; categoryId?: string }[] = [];
  let recipes = new Map<string, RecipeLine[]>();
  let costs = new Map<string, number>();
  let mins = new Map<string, number>();
  let moves: StockMove[] = [];
  let stockKeys = new Set<string>();
  let opnames: (StockOpname & { values: Map<string, number> })[] = [];
  type FLine = { id: string; productId: string; unitId: string; qty: number; receivedQty: number; unitPrice: number; discount: number; lineTotal: number };
  type FOrder = { id: string; number: string; supplierId: string; status: PurchaseOrder['status']; orderDate: string; expectedDate?: string; discount: number; taxAmount: number; otherCost: number; total: number; note?: string; lines: FLine[]; requestId?: string | null; downPayment?: number };
  type FInvoice = { id: string; number: string; supplierId?: string; orderId?: string; supplierInvoiceNo?: string; invoiceDate: string; dueDate?: string; termDays: number; status: PurchaseInvoice['status'];
    subtotal: number; discount: number; taxAmount: number; otherCost: number; total: number; paidTotal: number; note?: string; lines: FLine[]; payments: PurchasePayment[]; downPayment?: number; attachmentName?: string | null; attachmentDataUrl?: string | null; voidReason?: string | null; voidAt?: string | null };
  let suppliers: Supplier[] = [];
  let pOrders: FOrder[] = [];
  let pInvoices: FInvoice[] = [];
  let receiptKeys = new Set<string>();
  let accounts: Account[] = [];
  const kitchen = new Map<string, { status: KitchenStatus; sentAt: string; statusAt: string; stationId?: string }>();
  let stations: PrintStation[] = [];
  let notePresets: NotePreset[] = [];
  let customerGroups: CustomerGroup[] = [];
  let customerGroupMembers: CustomerGroupMember[] = [];
  let tieredPrices: GroupProductTieredPricing[] = [];
  let priceSchedules: PriceSchedule[] = [];
  const customerDepositBalances = new Map<string, { purchased: number; used: number; refunded: number; lastAt?: string }>();
  let customerDepositEntries: CustomerDepositEntry[] = [];
  let reconciliations: NonCashReconciliationRecord[] = [];
  let paymentMethods: (PaymentMethod & { isActive?: boolean })[] = [];
  let paymentConfigs: PaymentMethodConfig[] = [];
  type AuthCodeFake = { id: string; code: string; permission: AuthCodePermission; note?: string; issuedAt: string; expiresAt: string; usedAt?: string; revokedAt?: string };
  // contoh untuk demo/tes tampilan: dua kode aktif (void dan komplimen) supaya alur kasir bisa dicoba tanpa dashboard
  const authCodes: AuthCodeFake[] = [
    { id: 'demo-code-void', code: '24681357', permission: 'void_order', note: 'Contoh untuk demo', issuedAt: now().toISOString(), expiresAt: new Date(now().getTime() + 86400000).toISOString() },
    { id: 'demo-code-free', code: '13572468', permission: 'complimentary', note: 'Contoh untuk demo', issuedAt: now().toISOString(), expiresAt: new Date(now().getTime() + 86400000).toISOString() },
  ];
  let authCodeFails: number[] = [];
  // contoh log untuk demo/tes tampilan; kolom diisi seperti keluaran database (`{kolom: [lama, baru]}`)
  const ago = (min: number) => new Date(now().getTime() - min * 60000).toISOString();
  const activityLog: ActivityRow[] = ([
    ['a1', 20, 'product.updated', 'product', 'Kopi susu', { price: [22000, 24000], description: [null, 'Espresso, susu segar, gula aren'] }],
    ['a2', 95, 'employee.pin_changed', 'employee', 'Sari', {}],
    ['a3', 400, 'tax.updated', 'tax', 'PB1', { rate: [10, 11], is_active: [false, true] }],
    ['a4', 1500, 'product.created', 'product', 'Es teh tarik', {}],
    ['a5', 2900, 'table.deleted', 'table', 'Meja 12', {}],
    ['a6', 4300, 'order.finalize_failed', 'order', 'KOP/01/0042', {}],
    ['a7', 9000, 'outlet_settings.updated', 'outlet_settings', '', { service_charge_rate: [0, 5] }],
  ] as [string, number, string, string, string, Record<string, [unknown, unknown]>][]).map(([id, min, action, entity, name, ch], i) => ({
    id: `demo-log-${id}`, at: ago(min), action, entity, entityId: `demo-ent-${i}`, ...(name ? { name } : {}),
    actorUserId: action.startsWith('order.') ? undefined : 'u-owner', actorEmail: action.startsWith('order.') ? undefined : i % 2 ? 'budi@contoh.id' : 'pemilik@contoh.id',
    changes: parseChanges(ch),
  }));
  let stored: FakeEntry[] = [];
  const seqOf = new Map<string, number>();
  let extraGroups: ExtraGroup[] = [];
  let bundleItems = new Map<string, { productId: string; qty: number }[]>();
  let outlet: {
    address: string;
    phone: string;
    receiptFooter: string;
    email?: string;
    taxIdNumber?: string;
    businessType?: string;
    outletGroup?: string;
    logoUrl?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
  } = { address: '', phone: '', receiptFooter: '' };
  let outletsList: ManagedOutlet[] = [
    {
      id: 'out-1',
      code: 'OUT1',
      name: 'Outlet Contoh',
      address: 'Jl. Sudirman No. 12, Jakarta',
      phone: '081234567890',
      timezone: 'Asia/Jakarta',
      isActive: true,
      outletGroup: 'Jabodetabek',
      email: 'kontak@kopicontoh.id',
      taxIdNumber: '01.234.567.8-901.000',
      bankName: 'BCA',
      bankAccountNumber: '1234567890',
      bankAccountName: 'Kopi Contoh',
    },
  ];
  let employees: (ManagedEmployee & { pin: string })[] = [];
  let attendance: AttendanceRecord[] = [];
  let customRoles: RoleDefinition[] = [];
  let compensation = new Map<string, Omit<EmployeeCompensation, 'employeeName'>>();
  let schedules = new Map<string, WeeklySchedule>();
  let payrollRules: Record<string, unknown> = {};
  let incidents: EmployeeIncident[] = [];
  const purchasePriceMaps: PurchasePriceMapping[] = [];
  const stockRequests: StockRequest[] = [];
  const recurringBills: RecurringBill[] = [];
  const recurringRuns: RecurringBillRun[] = [];
  const approvals: ApprovalRequest[] = [];
  const fixedAssets: FixedAsset[] = [];
  const assetDepreciations: AssetDepreciationEntry[] = [];
  const jobLevels: JobLevel[] = [];
  const orgUnits: OrgUnit[] = [];
  const employeeTypes: EmployeeType[] = [];
  const employeeHr: EmployeeHr[] = [];
  const attendanceSettings: AttendanceSettings[] = [];
  const notifications: EmployeeNotification[] = [];
  let appointments: Appointment[] = [];
  let depositPackages: DepositPackage[] = [];
  let depositSales: DepositSaleRecord[] = [];
  let depositRefunds: DepositRefundRecord[] = [];
  let cashAdvances: (CashAdvance)[] = [];
  let payrollRecords: PayrollRecord[] = [];
  let products: Product[] = [];
  let orders: Order[] = [];
  let shifts: Shift[] = [];
  let cashMoves: CashMovement[] = [];
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

  /** Gerakan stok untuk satu produk terjual; paket menggerakkan stok komponennya. */
  function stockMove(productId: string, qty: number, kind?: StockMoveKind) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (p.kind === 'bundle') { for (const c of bundleItems.get(p.id) ?? []) stockMove(c.productId, qty * c.qty, kind); return; }
    if (p.trackStock && p.stock !== undefined) recordStock(p.id, qty, kind ?? (qty < 0 ? 'sale' : 'refund_return'), {});
  }

  /** Stok yang dilacak: barang jual (qty di Product.stock) dan bahan baku (daftar terpisah). */
  function stockBal(id: string): { name: string; kind: 'goods' | 'ingredient'; unit: string; qty: number; categoryId?: string } | null {
    const ing = ingredients.find((i) => i.id === id);
    if (ing) return { name: ing.name, kind: 'ingredient', unit: ing.unit, qty: ing.qty, categoryId: ing.categoryId };
    const p = products.find((x) => x.id === id);
    return p && p.trackStock && p.kind !== 'bundle' && p.stock !== undefined ? { name: p.name, kind: 'goods', unit: 'pcs', qty: p.stock } : null;
  }
  function recordStock(id: string, delta: number, kind: StockMoveKind, o: { unitCost?: number; reason?: string; refType?: string }) {
    const b = stockBal(id)!;
    const avg = costs.get(id) ?? 0;
    const r = applyStockMove({ qty: b.qty, avgCost: avg }, delta, o.unitCost ?? avg);
    const ing = ingredients.find((i) => i.id === id);
    if (ing) ing.qty = r.qty; else products.find((x) => x.id === id)!.stock = r.qty;
    costs.set(id, r.avgCost);
    moves.unshift({ id: newId(), productId: id, kind, qtyDelta: delta, unitCost: r.unitCost, totalCost: r.totalCost, qtyAfter: r.qty, avgCostAfter: r.avgCost, reason: o.reason, refType: o.refType, occurredAt: now().toISOString() });
  }
  function stockItem(id: string, locId?: string): StockItem {
    const b = stockBal(id)!;
    const isWh = locId === LOC_GUDANG;
    const q = isWh ? (whQty.get(id) ?? 0) : b.qty;
    const locationId = locId ?? LOC_OUTLET;
    const locationName = locNames[locationId] ?? 'Outlet utama';
    return makeStockItem({
      productId: id, name: b.name, kind: b.kind, unit: b.unit, qty: q, avgCost: costs.get(id) ?? 0, minQty: mins.get(id),
      ...(b.categoryId ? { categoryId: b.categoryId, categoryName: ingredientCategoryName(b.categoryId) } : {}),
      locationId, locationName,
    });
  }
  function opnameView(o: StockOpname & { values: Map<string, number> }): StockOpname {
    return clone({
      id: o.id, number: o.number, status: o.status, countedAt: o.countedAt, finalizedAt: o.finalizedAt, note: o.note,
      lines: o.lines.map((l) => ({ ...l, value: o.status === 'final' ? o.values.get(l.productId) ?? 0 : Math.round(l.difference * (costs.get(l.productId) ?? 0)) })),
    });
  }
  // ---------- pembelian ----------
  const FAKE_ALT_UNITS: Record<string, PurchaseUnit[]> = {
    'ing-kopi': [{ unitId: 'u-kg', name: 'kg', conversion: 1000, isBase: false, buyPrice: 320000 }],
    'ing-susu': [{ unitId: 'u-liter', name: 'liter', conversion: 1000, isBase: false, buyPrice: 18000 }],
    'ing-gula': [{ unitId: 'u-liter', name: 'liter', conversion: 1000, isBase: false, buyPrice: 40000 }],
    // contoh satuan jual di kasir: air mineral per dus isi 24
    p8: [{ unitId: 'u-dus', name: 'dus', conversion: 24, isBase: false, buyPrice: 100000, sellPrice: 110000 } as PurchaseUnit & { sellPrice: number }],
  };
  // satuan lain yang bisa diubah dari dashboard; bermula dari contoh di atas
  type AltUnit = PurchaseUnit & { minPurchase: number; sellPrice?: number };
  let altUnits = new Map<string, AltUnit[]>();
  // transfer stok: outlet ini dan satu gudang tiruan yang stoknya terpisah
  const LOC_OUTLET = 'loc-outlet', LOC_GUDANG = 'loc-gudang';
  const locNames: Record<string, string> = { [LOC_OUTLET]: 'Outlet utama', [LOC_GUDANG]: 'Gudang pusat' };
  let whQty = new Map<string, number>();
  type FTransfer = Omit<StockTransfer, 'lines'> & { lines: (StockTransfer['lines'][number] & { cost: number })[] };
  let transfers: FTransfer[] = [];
  const seedAltUnits = () => { altUnits = new Map(Object.entries(FAKE_ALT_UNITS).map(([k, v]) => [k, v.map((u) => ({ ...u, minPurchase: 1 }))])); };
  seedAltUnits();
  const baseUnitId = (productId: string) => `u-base-${productId}`;
  function purchaseUnits(productId: string): PurchaseUnit[] {
    const b = stockBal(productId)!;
    return [{ unitId: baseUnitId(productId), name: b.unit, conversion: 1, isBase: true, buyPrice: costs.get(productId) ?? 0 }, ...(altUnits.get(productId) ?? []).map(({ minPurchase: _m, ...u }) => u)];
  }
  const todayKey = () => localDateKey(now(), CTX.timezone);
  const supplierName = (id?: string) => (id ? suppliers.find((x) => x.id === id)?.name ?? '' : '(tanpa pemasok)');
  function checkedLines(lines: PurchaseInvoiceInput['lines']): FLine[] {
    return lines.map((l) => {
      if (!stockBal(l.productId)) throw new DataError('not_found', 'Ada barang yang tidak ditemukan atau stoknya tidak dilacak.');
      if (!purchaseUnits(l.productId).some((u) => u.unitId === l.unitId)) throw new DataError('invalid', 'Satuan tidak sesuai dengan barangnya.');
      return { id: newId(), productId: l.productId, unitId: l.unitId, qty: l.qty, receivedQty: 0, unitPrice: l.unitPrice, discount: l.discount ?? 0, lineTotal: purchaseLineTotal(l.qty, l.unitPrice, l.discount ?? 0) };
    });
  }
  function lineView(l: FLine): PurchaseLine {
    const u = purchaseUnits(l.productId).find((x) => x.unitId === l.unitId);
    return { id: l.id, productId: l.productId, name: stockBal(l.productId)?.name ?? '', unitId: l.unitId, unit: u?.name ?? '', qty: l.qty, receivedQty: l.receivedQty, unitPrice: l.unitPrice, discount: l.discount, lineTotal: l.lineTotal };
  }
  function orderView(o: FOrder): PurchaseOrder {
    const req = o.requestId ? stockRequests.find((r) => r.id === o.requestId) : undefined;
    return clone({ id: o.id, number: o.number, supplierId: o.supplierId, supplierName: supplierName(o.supplierId), status: o.status, orderDate: o.orderDate, expectedDate: o.expectedDate,
      discount: o.discount, taxAmount: o.taxAmount, otherCost: o.otherCost, total: o.total, note: o.note, lines: o.lines.map(lineView),
      requestId: o.requestId, requestNumber: req?.number, downPayment: o.downPayment });
  }
  function invoiceView(i: FInvoice): PurchaseInvoice {
    return clone({ id: i.id, number: i.number, supplierId: i.supplierId, supplierName: supplierName(i.supplierId), orderId: i.orderId, supplierInvoiceNo: i.supplierInvoiceNo, invoiceDate: i.invoiceDate, dueDate: i.dueDate, termDays: i.termDays,
      status: i.status, subtotal: i.subtotal, discount: i.discount, taxAmount: i.taxAmount, otherCost: i.otherCost, total: i.total, paidTotal: i.paidTotal, outstanding: invoiceOutstanding(i.total, i.paidTotal),
      note: i.note, lines: i.lines.map(lineView), payments: i.payments, downPayment: i.downPayment, attachmentName: i.attachmentName, attachmentDataUrl: i.attachmentDataUrl, voidReason: i.voidReason, voidAt: i.voidAt });
  }
  function receiveInto(inv: FInvoice, items: { lineId: string; qty: number }[]) {
    for (const it of items) {
      if (it.qty <= 0) continue;
      const l = inv.lines.find((x) => x.id === it.lineId)!;
      const conv = purchaseUnits(l.productId).find((u) => u.unitId === l.unitId)?.conversion ?? 1;
      const cost = purchaseUnitCost(l, conv, inv);
      l.receivedQty = Math.round((l.receivedQty + it.qty) * 10000) / 10000;
      recordStock(l.productId, Math.round(it.qty * conv * 10000) / 10000, 'purchase_receipt', { unitCost: cost, reason: `Faktur ${inv.number}`, refType: 'purchase_invoice' });
    }
  }

  // ---------- keuangan ----------
  const acct = (key: string) => accounts.find((a) => a.systemKey === key)!;
  const dayOf = (iso: string) => localDateKey(new Date(iso), CTX.timezone);
  const nextNo = (prefix: string) => { const n = (seqOf.get(prefix) ?? 0) + 1; seqOf.set(prefix, n); return `${prefix}-${String(n).padStart(6, '0')}`; };
  const payKey = (kind: string) => (kind === 'cash' ? 'cash_main' : kind === 'gateway' ? 'gateway_clearing' : 'noncash_clearing');
  function storeEntry(date: string, description: string, sourceType: string, sourceId: string | undefined, prefix: string, lines: FakeEntry['lines'], reversesId?: string): FakeEntry {
    const e: FakeEntry = { id: newId(), number: nextNo(prefix), date, description, sourceType, ...(sourceId ? { sourceId } : {}), status: 'posted', ...(reversesId ? { reversesId } : {}), lines: lines.filter((l) => l.debit > 0 || l.credit > 0) };
    stored.push(e); return e;
  }
  /** Jurnal penjualan dan refund diturunkan dari pesanan (server membukukannya saat lunas); sisanya disimpan. */
  function allEntries(): FakeEntry[] {
    const derived: FakeEntry[] = [];
    const paid = orders.filter((o) => o.status === 'paid').sort((a, b) => (a.closedAt ?? a.openedAt).localeCompare(b.closedAt ?? b.openedAt));
    paid.forEach((o, i) => {
      const lines: FakeEntry['lines'] = [];
      const by = new Map<string, number>();
      for (const p of o.payments) by.set(acct(payKey(p.kind)).id, (by.get(acct(payKey(p.kind)).id) ?? 0) + p.amount);
      for (const [accountId, amt] of by) lines.push({ accountId, debit: amt, credit: 0, memo: `Pembayaran ${o.number}` });
      if (o.discountTotal > 0) lines.push({ accountId: acct('sales_discount').id, debit: o.discountTotal, credit: 0 });
      if (o.rounding < 0) lines.push({ accountId: acct('rounding').id, debit: -o.rounding, credit: 0 });
      if (o.subtotal > 0) lines.push({ accountId: acct('sales_revenue').id, debit: 0, credit: o.subtotal, memo: o.number });
      if (o.serviceCharge > 0) lines.push({ accountId: acct('service_revenue').id, debit: 0, credit: o.serviceCharge });
      if (o.taxTotal > 0) lines.push({ accountId: acct('tax_payable').id, debit: 0, credit: o.taxTotal });
      if (o.rounding > 0) lines.push({ accountId: acct('rounding').id, debit: 0, credit: o.rounding });
      const cogs = o.items.reduce((n, it) => n + Math.round(it.qty * (costs.get(it.productId) ?? Math.round(it.unitPrice * 0.4))), 0);
      if (cogs > 0) { lines.push({ accountId: acct('cogs').id, debit: cogs, credit: 0, memo: `HPP ${o.number}` }, { accountId: acct('inventory').id, debit: 0, credit: cogs, memo: `HPP ${o.number}` }); }
      derived.push({ id: `jr-sale-${o.id}`, number: `SAL-${String(i + 1).padStart(6, '0')}`, date: dayOf(o.closedAt ?? o.openedAt), description: `Penjualan ${o.number}`, sourceType: 'sale', sourceId: o.id, status: 'posted', lines });
    });
    refunds.forEach((r, i) => {
      const kind = r.methodKind ?? 'cash';
      derived.push({ id: `jr-refund-${r.id}`, number: `RFN-${String(i + 1).padStart(6, '0')}`, date: dayOf(r.createdAt), description: `Refund ${r.number}`, sourceType: 'refund', sourceId: r.id, status: 'posted',
        lines: [{ accountId: acct('sales_returns').id, debit: r.total, credit: 0 }, { accountId: acct(payKey(kind)).id, debit: 0, credit: r.total }] });
    });
    return [...derived, ...stored];
  }
  function finLines(): FinLine[] {
    const acc = new Map(accounts.map((a) => [a.id, a]));
    return allEntries().flatMap((e) => e.lines.map((l): FinLine => {
      const a = acc.get(l.accountId)!;
      return { entryId: e.id, number: e.number, date: e.date, description: e.description, sourceType: e.sourceType, status: e.status, accountId: a.id, code: a.code, name: a.name, category: a.category, debit: l.debit, credit: l.credit, ...(l.memo ? { memo: l.memo } : {}) };
    }));
  }
  function journalView(e: FakeEntry): Journal {
    const acc = new Map(accounts.map((a) => [a.id, a]));
    return clone({ id: e.id, number: e.number, date: e.date, description: e.description, sourceType: e.sourceType, status: e.status, total: Math.round(e.lines.reduce((n, l) => n + l.debit, 0) * 100) / 100,
      ...(e.reversesId ? { reversesId: e.reversesId } : {}),
      lines: e.lines.map((l) => ({ accountId: l.accountId, code: acc.get(l.accountId)?.code ?? '', name: acc.get(l.accountId)?.name ?? '', debit: l.debit, credit: l.credit, ...(l.memo ? { memo: l.memo } : {}) })) });
  }
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  function seedStock() {
    ingredients = []; costs = new Map(); mins = new Map(); moves = []; stockKeys = new Set(); opnames = []; recipes = new Map(); seedAltUnits(); whQty = new Map(); transfers = [];
    suppliers = opts.seed === false ? [] : [
      { id: 'sp-kopi', code: 'SUP-01', name: 'CV Sumber Kopi Nusantara', phone: '081234500001', termDays: 14, isActive: true },
      { id: 'sp-susu', code: 'SUP-02', name: 'UD Susu Segar Jaya', phone: '081234500002', termDays: 7, isActive: true },
    ];
    pOrders = []; pInvoices = []; receiptKeys = new Set();
    accounts = FAKE_COA.map(([code, name, kind, category, key]) => ({ id: coaId(code, key), code, name, kind, category, isActive: true, ...(key ? { systemKey: key } : {}) }));
    stored = []; seqOf.clear(); kitchen.clear();
    if (opts.seed === false) return;
    const opening: [string, number, number][] = [];
    for (const p of products) if (p.trackStock && p.kind !== 'bundle' && p.stock !== undefined) { costs.set(p.id, Math.round(p.price * 0.4)); opening.push([p.id, p.stock, Math.round(p.price * 0.4)]); }
    // 4 bahan demo (dipakai resep p1-p3 di bawah) + katalog bahan baku nyata Coffee Ground (lihat seed-bahan-baku.ts):
    // stok fisik bahan nyata ini sengaja mulai dari 0 (belum ada angka stok asli dari Louis), hanya nama/satuan/biaya/kategori yang nyata.
    const ing: [string, string, string, number, number, number | undefined, string | undefined][] = [
      ['ing-kopi', 'Biji kopi arabika', 'gram', 5000, 320, 1000, undefined], ['ing-susu', 'Susu segar', 'ml', 12000, 18, 3000, undefined],
      ['ing-gula', 'Gula aren cair', 'ml', 800, 40, 1000, undefined], ['ing-gelas', 'Gelas 16 oz', 'pcs', 0, 700, undefined, undefined],
      ...COFFEE_GROUND_BAHAN_BAKU,
    ];
    for (const [id, name, unit, qty, cost, min, categoryId] of ing) {
      ingredients.push({ id, name, unit, qty: 0, categoryId });
      if (min !== undefined) mins.set(id, min);
      if (qty > 0) opening.push([id, qty, cost]); else costs.set(id, cost);
    }
    mins.set('p8', 5);
    recipes.set('p1', [{ ingredientId: 'ing-kopi', qty: 18, unitId: 'gram' }, { ingredientId: 'ing-susu', qty: 120, unitId: 'ml' }, { ingredientId: 'ing-gula', qty: 20, unitId: 'ml' }, { ingredientId: 'ing-gelas', qty: 1, unitId: 'pcs' }]);
    recipes.set('p2', [{ ingredientId: 'ing-kopi', qty: 18, unitId: 'gram' }, { ingredientId: 'ing-gelas', qty: 1, unitId: 'pcs' }]);
    recipes.set('p3', [{ ingredientId: 'ing-kopi', qty: 18, unitId: 'gram' }, { ingredientId: 'ing-susu', qty: 0.15, unitId: 'liter' }, { ingredientId: 'ing-gelas', qty: 1, unitId: 'pcs' }]);
    for (const [id, qty, cost] of opening) {
      if (qty <= 0) continue;
      const p = products.find((x) => x.id === id);
      if (p) p.stock = 0;                                  // saldo dibangun dari gerakan 'Stok awal', bukan ditambah dua kali
      costs.set(id, 0); recordStock(id, qty, 'opening', { unitCost: cost });
    }
    whQty.set('ing-kopi', 25000); // 25 kg di gudang
    whQty.set('ing-susu', 50000); // 50 L di gudang
    whQty.set('ing-gula', 10000); // 10 L di gudang
    whQty.set('ing-gelas', 2000); // 2000 pcs di gudang
    whQty.set('p8', 20);          // 20 pcs di gudang
  }

  function recompute(draft: OrderDraft, step: number) {
    const items = draft.items.map((i) => ({
      id: i.id, qty: i.qty, unitPrice: i.unitPrice, extrasTotal: extrasLineTotal(i.qty, i.extras),
      taxRate: products.find((p) => p.id === i.productId)?.taxRate,
    }));
    return computeOrder({
      orderType: draft.type, items, orderDiscount: draft.orderDiscount ?? (draft.discounts ?? []).reduce((n, d) => n + d.amount, 0),
      orderTaxes: CTX.taxes.map((t) => ({ taxId: t.id, name: t.name, rate: t.rate, orderTypes: t.orderTypes, orderTypeRates: t.orderTypeRates })),
      settings: CTX.settings, roundingStep: step,
    });
  }

  function reset() {
    categories = opts.seed === false ? [] : clone(CATEGORIES);
    departments = opts.seed === false ? [] : clone(DEPARTMENTS);
    floors = opts.seed === false ? [] : [{ id: 'f-1', name: 'Lantai 1', sort: 1 }, { id: 'f-teras', name: 'Teras', sort: 2 }];
    tables = opts.seed === false ? [] : ['T1', 'T2', 'T3', 'T4'].map((n, i): DiningTable => ({ id: `t-${n}`, floorId: 'f-1', name: n, sort: i + 1 })).concat(['T5', 'T6'].map((n, i): DiningTable => ({ id: `t-${n}`, floorId: 'f-teras', name: n, sort: i + 5 })));
    employees = EMPLOYEES.map((e) => ({
      ...e,
      isActive: true,
      hasPin: !!e.pin,
      isLocked: false,
      lockedUntil: null,
      qrId: `QR-${e.id.toUpperCase()}`,
      roleName: e.role === 'owner' ? 'Pemilik' : e.role === 'manager' ? 'Manajer' : 'Kasir',
    }));
    attendance = [];
    customRoles = [];
    compensation = new Map(); schedules = new Map(); payrollRules = {}; incidents = []; cashAdvances = []; payrollRecords = [];
    customerGroups = opts.seed === false ? [] : [
      { id: 'grp-member', name: 'Member', description: 'Pelanggan terdaftar yang mengumpulkan poin dan promo anggota.', createdAt: '2026-11-01T02:00:00Z', updatedAt: '2026-11-01T02:00:00Z' },
      { id: 'grp-reseller', name: 'Reseller', description: 'Mitra pembelian grosir dengan harga bertingkat sesuai jumlah.', createdAt: '2026-11-01T02:05:00Z', updatedAt: '2026-11-01T02:05:00Z' },
      { id: 'grp-karyawan', name: 'Karyawan', description: 'Tarif khusus staf internal outlet saat bertransaksi.', createdAt: '2026-11-01T02:10:00Z', updatedAt: '2026-11-01T02:10:00Z' },
    ];
    customerGroupMembers = [];
    tieredPrices = [];
    priceSchedules = [];
    customerDepositBalances.clear();
    customerDepositEntries = [];
    if (opts.seed !== false) {
      customerDepositBalances.set('cu-ani', {
        purchased: 550000,
        used: 0,
        refunded: 0,
        lastAt: new Date(now().getTime() - 2 * 86400_000).toISOString(),
      });
      customerDepositBalances.set('cu-budi', {
        purchased: 100000,
        used: 0,
        refunded: 0,
        lastAt: new Date(now().getTime() - 86400_000).toISOString(),
      });
      customerDepositEntries = [
        {
          id: 'de-1',
          customerId: 'cu-ani',
          kind: 'purchase',
          creditAmount: 550000,
          salePrice: 500000,
          packageName: 'Deposit Promo 550rb',
          orderNumber: 'DEP/2611/001',
          paymentMethod: 'Transfer bank',
          occurredAt: new Date(now().getTime() - 2 * 86400_000).toISOString(),
        },
        {
          id: 'de-2',
          customerId: 'cu-budi',
          kind: 'purchase',
          creditAmount: 100000,
          salePrice: 100000,
          packageName: 'Deposit 100rb',
          orderNumber: 'DEP/2611/002',
          paymentMethod: 'Tunai',
          occurredAt: new Date(now().getTime() - 86400_000).toISOString(),
        },
      ];
    }
    paymentMethods = clone(METHODS);
    paymentConfigs = mergePaymentMethodConfigs(paymentMethods, {}, []);
    Object.assign(CTX, JSON.parse(JSON.stringify(CTX0))); fakeTax = { id: 'tax-pb1', name: 'PB1', rate: 10, orderTypes: ['dine_in', 'takeaway', 'delivery', 'service'] };
    outlet = { address: '', phone: '', receiptFooter: '' };
    products = opts.seed === false ? [] : clone(PRODUCTS);
    stations = opts.seed === false ? [] : [
      { id: 'st-dapur', name: 'Dapur', kind: 'checker', printMode: 'auto', copies: 1, paper: '58', template: defaultTemplate('checker'), sort: 1, isActive: true },
      { id: 'st-bar', name: 'Bar', kind: 'checker', printMode: 'ask', copies: 1, paper: '58', template: { ...defaultTemplate('checker'), title: 'CHECKER BAR', showGuests: false }, sort: 2, isActive: true },
    ];
    if (opts.seed !== false) for (const pr of products) { const c = pr.categoryId; if (c === 'c-kopi' || c === 'c-non') pr.printStationId = 'st-bar'; else if (c === 'c-makan' || c === 'c-camil') pr.printStationId = 'st-dapur'; }
    notePresets = opts.seed === false ? [] : [
      ['Level pedas', 'Tidak pedas'], ['Level pedas', 'Sedang'], ['Level pedas', 'Pedas'], ['Gula', 'Kurang manis'], ['Gula', 'Tanpa gula'], ['Es', 'Es sedikit'], ['Es', 'Tanpa es'], ['Permintaan', 'Bungkus terpisah'], ['Permintaan', 'Jangan pakai sedotan'],
    ].map(([category, text], i) => ({ id: `np-${i + 1}`, category: category!, text: text!, sort: i + 1, isActive: true }));
    extraGroups = opts.seed === false ? [] : clone(EXTRA_GROUPS);
    bundleItems = new Map();
    orders = []; shifts = []; cashMoves = []; refunds = []; seqByDay.clear();
    customers = opts.seed === false ? [] : SEED_CUSTOMERS.map((c) => ({ ...c }));
    promotions = opts.seed === false ? [] : clone(SEED_PROMOS);
    coupons = opts.seed === false ? [] : clone(SEED_COUPONS);
    loyaltyRules = opts.seed === false ? { ...DEFAULT_LOYALTY } : { ...DEFAULT_LOYALTY, isActive: true };
    loyaltyProductRewards = opts.seed === false ? [] : [
      { id: 'lrew-1', productId: 'p8', pointsCost: 25, isActive: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
      { id: 'lrew-2', productId: 'p5', pointsCost: 50, isActive: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
      { id: 'lrew-3', productId: 'p1', pointsCost: 75, isActive: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
    ];
    ledger = [];
    appointments = opts.seed === false ? [] : [
      {
        id: 'apt-seed-1',
        kind: 'table',
        targetId: 't-T2',
        targetName: 'Meja T2',
        customerId: 'cu-ani',
        customerName: 'Ani Wulandari',
        customerPhone: '08123456789',
        date: localDateString(now()),
        startTime: '13:00',
        endTime: '15:00',
        startAt: `${localDateString(now())}T13:00`,
        endAt: `${localDateString(now())}T15:00`,
        status: 'confirmed',
        note: 'Dekat jendela',
        createdAt: now().toISOString(),
      },
    ];
    depositPackages = opts.seed === false ? [] : [
      {
        id: 'dep-100',
        name: 'Deposit 100rb',
        creditAmount: 100000,
        salePrice: 100000,
        isActive: true,
        soldCount: 1,
        note: 'Saldo reguler tanpa masa hangus',
      },
      {
        id: 'dep-500',
        name: 'Deposit 500rb Bonus 50rb',
        creditAmount: 550000,
        salePrice: 500000,
        isActive: true,
        soldCount: 1,
        note: 'Bonus saldo 10% untuk pelanggan setia',
      },
    ];
    depositSales = opts.seed === false ? [] : [
      {
        id: 'ds-seed-1',
        occurredAt: new Date(now().getTime() - 2 * 86400_000).toISOString(),
        customerName: 'Ani Wulandari',
        packageName: 'Deposit 500rb Bonus 50rb',
        salePrice: 500000,
        creditAmount: 550000,
        methodName: 'QRIS',
        orderNumber: 'DEP/2611/001',
      },
      {
        id: 'ds-seed-2',
        occurredAt: new Date(now().getTime() - 86400_000).toISOString(),
        customerName: 'Budi Santoso',
        packageName: 'Deposit 100rb',
        salePrice: 100000,
        creditAmount: 100000,
        methodName: 'Tunai',
        orderNumber: 'DEP/2611/002',
      },
    ];
    depositRefunds = [];
    customerDepositBalances.clear();
    if (opts.seed !== false) {
      customerDepositBalances.set('cu-ani', { purchased: 550000, used: 0, refunded: 0, lastAt: new Date(now().getTime() - 2 * 86400_000).toISOString() });
      customerDepositBalances.set('cu-budi', { purchased: 100000, used: 0, refunded: 0, lastAt: new Date(now().getTime() - 86400_000).toISOString() });
    }
    if (opts.seed !== false) pushPoints('cu-ani', 120, 'adjust', 'Saldo awal');
    seedStock();
    if (opts.seed !== false) seedHistory();
    if (opts.seed !== false && opts.kitchenDemo) seedKitchenDemo();
  }

  /** riwayat hari ini untuk dashboard: pesanan lunas tersebar sepanjang jam kerja */
  function seedKitchenDemo() {
    const base = now();
    const specs: { id: string; table: string; ageMin: number; items: [string, number, string?][]; guests: number }[] = [
      { id: 'demo-k1', table: 't-T2', ageMin: 4, guests: 2, items: [['p1', 2, 'tanpa gula'], ['p9', 1]] },
      { id: 'demo-k2', table: 't-T4', ageMin: 23, guests: 4, items: [['p3', 1], ['p10', 2]] },
    ];
    for (const sp of specs) {
      const at = new Date(base.getTime() - sp.ageMin * 60000);
      const draftItems = sp.items.map(([pid, qty, note], k) => { const pr = products.find((q) => q.id === pid)!; return { id: `${sp.id}-${k}`, productId: pid, name: pr.name, qty, unitPrice: pr.price, ...(note ? { note } : {}) }; });
      const calc = recompute({ id: sp.id, type: 'dine_in', items: draftItems }, 0);
      orders.push({ id: sp.id, number: formatOrderNumber(CTX.outletCode, CTX.deviceCode, at, seqFor(at), CTX.timezone), type: 'dine_in', tableId: sp.table, guestCount: sp.guests, cashierId: 'e-sari', status: 'open',
        items: draftItems.map((d, k) => ({ ...d, lineTotal: calc.lines[k]!.lineTotal })), subtotal: calc.subtotal, discountTotal: calc.discountTotal, serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal,
        rounding: calc.rounding, total: calc.total, paidTotal: 0, payments: [], openedAt: at.toISOString() });
      for (const d of draftItems) kitchen.set(d.id, { status: 'new', sentAt: at.toISOString(), statusAt: at.toISOString(), ...(products.find((q) => q.id === d.productId)?.printStationId ? { stationId: products.find((q) => q.id === d.productId)!.printStationId! } : {}) });
    }
    {
      const at = new Date(base.getTime() - 90 * 60000);
      const pr = products.find((q) => q.id === 'p3')!;
      const it = { id: 'demo-free-0', productId: 'p3', name: pr.name, qty: 1, unitPrice: pr.price };
      const calc = recompute({ id: 'demo-free', type: 'takeaway', items: [it] }, 0);
      const m = method('m-free');
      orders.push({ id: 'demo-free', number: formatOrderNumber(CTX.outletCode, CTX.deviceCode, at, seqFor(at), CTX.timezone), type: 'takeaway', cashierId: 'e-sari', status: 'paid',
        items: [{ ...it, lineTotal: calc.lines[0]!.lineTotal }], subtotal: calc.subtotal, discountTotal: 0, serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal, rounding: 0, total: calc.total, paidTotal: calc.total,
        payments: [{ id: 'demo-free-pay', methodId: m.id, methodName: m.name, kind: m.kind, amount: calc.total, change: 0, paidAt: at.toISOString(), reference: 'Kompensasi keluhan pelanggan' }],
        openedAt: at.toISOString(), closedAt: at.toISOString() });
    }
    // satu kasir lagi masih bertugas, supaya keadaan "belum bisa tutup toko" terlihat
    shifts.push({ id: 'demo-shift-open', cashierId: 'e-budi', openedAt: new Date(base.getTime() - 2 * 3600_000).toISOString(), openingCash: 150000, status: 'open' });
  }

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
    // shift contoh sudah ditutup dengan hitungan fisik yang kurang 5.000 dari seharusnya
    const sh = shifts.find((x) => x.id === shiftId)!;
    const rep = buildShiftReport(shiftInputs(sh));
    Object.assign(sh, { expectedCash: rep.expectedCash, counted: rep.expectedCash - 5000, variance: -5000 });
    reconciliations = [
      {
        id: 'rec-seed-qris',
        outletId: CTX.outletId,
        shiftId,
        shiftNumber: 'Shift #seed-s',
        shiftDate: p.y ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : new Date().toISOString().slice(0, 10),
        cashierName: 'Sari Rahayu',
        methodId: 'm-qris',
        methodName: 'QRIS',
        methodKind: 'gateway',
        expectedAmount: 95000,
        actualAmount: 94335,
        feeAmount: 665,
        difference: 0,
        status: 'reconciled',
        bankAccountId: 'acc-bank',
        reconciledAt: new Date(base.getTime() - 2 * 3600_000).toISOString(),
        reconciledBy: 'emp-owner',
        notes: 'Rekonsiliasi gateway QRIS',
      },
      {
        id: 'rec-seed-edc',
        outletId: CTX.outletId,
        shiftId,
        shiftNumber: 'Shift #seed-s',
        shiftDate: p.y ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : new Date().toISOString().slice(0, 10),
        cashierName: 'Sari Rahayu',
        methodId: 'm-edc',
        methodName: 'Kartu',
        methodKind: 'noncash',
        expectedAmount: 110000,
        actualAmount: undefined,
        feeAmount: 0,
        difference: undefined,
        status: 'unreconciled',
      },
    ];
  }
  reset();

  /** Salinan pesanan dengan nama pelanggan terkini (pelanggan yang dihapus lembut tetap terbaca). */
  const named = <T extends Order | null>(o: T): T => {
    if (!o || !o.customerId) return o;
    const c = customers.find((x) => x.id === o.customerId);
    return { ...o, customerName: c?.name ?? o.customerName };
  };

  const couponUsed = (id: string) => orders.filter((o) => o.status !== 'void').reduce((n, o) => n + (o.discounts ?? []).filter((d) => d.couponId === id).length, 0);
  const withUsage = (c: Coupon): Coupon => ({ ...c, usedCount: couponUsed(c.id) });
  const cleanPromo = ({ deleted: _d, ...p }: Promotion & { deleted?: boolean }): Promotion => p;

  /** Buku poin: saldo pelanggan = jumlah baris (sama dengan trigger server). */
  function pushPoints(customerId: string, points: number, kind: LoyaltyEntry['kind'], note: string | undefined, orderId?: string) {
    if (points === 0) return;
    ledger.unshift({ id: newId(), customerId, orderId, points, kind, note, createdAt: now().toISOString() });
    const c = customers.find((x) => x.id === customerId);
    if (c) c.pointsBalance += points;
  }
  function pointsProblem(draft: OrderDraft, entries: DiscountEntry[]): string | null {
    const pts = entries.filter((e) => e.source === 'points');
    if (pts.length === 0) return null;
    if (!draft.customerId) return 'Tukar poin butuh pelanggan pada pesanan.';
    if (!loyaltyRules.isActive) return 'Loyalti sedang tidak aktif, tukar poin tidak bisa dipakai.';
    let used = 0;
    for (const e of pts) {
      if (!e.points || e.points < 1) return 'Potongan poin tidak sesuai aturan loyalti.';
      if (e.amount > 0 && e.amount !== e.points * loyaltyRules.redeemValuePerPoint) return 'Potongan poin tidak sesuai aturan loyalti.';
      used += e.points;
    }
    const bal = customers.find((c) => c.id === draft.customerId)?.pointsBalance ?? 0;
    return used > bal ? 'Saldo poin pelanggan tidak cukup. Muat ulang saldo lalu coba lagi.' : null;
  }

  function shiftInputs(s: Shift): ShiftInputs {
    const mine = orders.filter((o) => o.shiftId === s.id);
    return {
      shift: s,
      payments: mine.flatMap((o) => o.payments).map((p) => ({ methodName: p.methodName, kind: p.kind, amount: p.amount })),
      cashIn: cashMoves.filter((m) => m.shiftId === s.id && m.kind === 'in').reduce((a, m) => a + m.amount, 0),
      cashOut: cashMoves.filter((m) => m.shiftId === s.id && m.kind === 'out').reduce((a, m) => a + m.amount, 0),
      cashRefunds: refunds.filter((r) => r.shiftId === s.id && r.methodKind === 'cash').reduce((a, r) => a + r.total, 0),
      paidOrderCount: mine.filter((o) => o.status === 'paid').length,
      soldLines: mine.filter((o) => o.status === 'paid').flatMap((o) => o.items).map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, amount: i.lineTotal })),
    };
  }

  const salesInvoices = createFakeSalesInvoices({
    customerName: async (id) => (await self.listCustomers({ limit: 5000 })).find((c) => c.id === id)?.name,
    today: () => localDateString(now()),
    newId,
  });

  const salesDocuments = createFakeSalesDocuments({
    customerName: async (id) => (await self.listCustomers({ limit: 5000 })).find((c) => c.id === id)?.name,
    invoiceExists: async (id) => (await self.listSalesInvoices()).some((i) => i.id === id),
    today: () => localDateString(now()),
    newId,
  });
  const campaigns = createFakeCampaigns({ customers: () => self.listCustomers({ limit: 5000 }), now: () => now().toISOString() });
  const production = createFakeProduction({
    stock: (id) => { const b = stockBal(id); return b ? { name: b.name, qty: b.qty } : null; },
    avgCost: (id) => costs.get(id) ?? 0,
    move: (id, delta, kind, unitCost, reason) => recordStock(id, delta, kind, { ...(kind === 'production_in' ? { unitCost } : {}), reason, refType: 'production' }),
    allowNegative: () => CTX.settings.allowNegativeStock,
    today: () => localDateString(now()),
    newId,
  });
  const priceRules = createFakePriceRules({ productExists: async (id) => (await self.listProducts({ includeInactive: true })).some((p) => p.id === id) });
  const paymentAccounts = createFakePaymentAccounts({ methods: () => self.listPaymentMethods(), accounts: () => self.listAccounts() });

  const self: DataLayer & { reset(): void } = {
    reset,
    ...salesInvoices,
    ...paymentAccounts,
    ...salesDocuments,
    ...campaigns,
    ...priceRules,
    ...production,
    ...createFakeLabelPapers(),
    async listGatewayTransactions() { return []; },
    async outletComparison(range) { return fakeOutletComparison({ id: CTX.outletId, name: CTX.outletName }, range, (r) => self.salesSummary(r)); },
    async getContext() { return clone(CTX); },
    async getOutletSettings() {
      const st = CTX.settings;
      return clone({
        info: {
          code: CTX.outletCode,
          name: CTX.outletName,
          address: outlet.address,
          phone: outlet.phone,
          timezone: CTX.timezone,
          email: outlet.email,
          taxIdNumber: outlet.taxIdNumber,
          businessType: outlet.businessType,
          outletGroup: outlet.outletGroup,
          logoUrl: outlet.logoUrl,
          bankName: outlet.bankName,
          bankAccountNumber: outlet.bankAccountNumber,
          bankAccountName: outlet.bankAccountName,
        },
        options: { serviceChargePct: st.serviceChargePct, serviceChargeTaxable: st.serviceChargeTaxable, serviceChargeOrderTypes: st.serviceChargeOrderTypes,
          roundingCashStep: st.roundingCashStep, roundingNoncashStep: st.roundingNoncashStep, requireOpenShift: st.requireOpenShift, allowNegativeStock: st.allowNegativeStock, receiptFooter: outlet.receiptFooter,
          cashOutDailyLimit: st.cashOutDailyLimit ?? null, requireCashPhoto: false, defaultOpeningCash: st.defaultOpeningCash ?? null,
          receiptHeader: CTX.receiptHeader ?? '', receiptShowCashier: CTX.receiptShowCashier !== false, receiptShowCustomer: CTX.receiptShowCustomer !== false, receiptTemplate: clone(CTX.receiptTemplate ?? {}),
          autoReconcileNoncash: !!st.autoReconcileNoncash },
      });
    },
    async saveOutletInfo(input) {
      const problem = outletInfoProblem(input);
      if (problem) throw new DataError('invalid', problem);
      CTX.outletName = input.name.trim(); outlet.address = input.address.trim(); outlet.phone = input.phone.trim();
      CTX.address = outlet.address || undefined; CTX.phone = outlet.phone || undefined;
      outlet.email = input.email?.trim() || undefined;
      outlet.taxIdNumber = input.taxIdNumber?.trim() || undefined;
      outlet.businessType = input.businessType?.trim() || undefined;
      outlet.outletGroup = input.outletGroup?.trim() || undefined;
      outlet.logoUrl = input.logoUrl?.trim() || undefined;
      outlet.bankName = input.bankName?.trim() || undefined;
      outlet.bankAccountNumber = input.bankAccountNumber?.trim() || undefined;
      outlet.bankAccountName = input.bankAccountName?.trim() || undefined;
      const target = outletsList.find((o) => o.code === CTX.outletCode) ?? outletsList[0];
      if (target) {
        Object.assign(target, {
          name: CTX.outletName, address: outlet.address, phone: outlet.phone,
          email: outlet.email, taxIdNumber: outlet.taxIdNumber, outletGroup: outlet.outletGroup,
          bankName: outlet.bankName, bankAccountNumber: outlet.bankAccountNumber, bankAccountName: outlet.bankAccountName,
        });
      }
    },
    async listOutlets() {
      return clone(outletsList);
    },
    async saveOutlet(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama outlet wajib diisi');
      if (input.id) {
        const o = outletsList.find((x) => x.id === input.id);
        if (!o) throw new DataError('not_found', 'Outlet tidak ditemukan');
        Object.assign(o, {
          name,
          address: input.address !== undefined ? input.address.trim() : o.address,
          phone: input.phone !== undefined ? input.phone.trim() : o.phone,
          email: input.email !== undefined ? input.email.trim() : o.email,
          outletGroup: input.outletGroup !== undefined ? input.outletGroup.trim() : o.outletGroup,
          bankName: input.bankName !== undefined ? input.bankName.trim() : o.bankName,
          bankAccountNumber: input.bankAccountNumber !== undefined ? input.bankAccountNumber.trim() : o.bankAccountNumber,
          bankAccountName: input.bankAccountName !== undefined ? input.bankAccountName.trim() : o.bankAccountName,
          isActive: input.isActive ?? o.isActive,
        });
        return clone(o);
      }
      const code = (input.code?.trim() || 'CG' + Math.floor(Math.random() * 90 + 10)).toUpperCase();
      const o: ManagedOutlet = {
        id: newId(),
        code,
        name,
        address: input.address?.trim(),
        phone: input.phone?.trim(),
        email: input.email?.trim(),
        timezone: input.timezone || 'Asia/Jakarta',
        isActive: input.isActive ?? true,
        outletGroup: input.outletGroup?.trim(),
        bankName: input.bankName?.trim(),
        bankAccountNumber: input.bankAccountNumber?.trim(),
        bankAccountName: input.bankAccountName?.trim(),
      };
      outletsList.push(o);
      return clone(o);
    },
    async listOutletGroups() {
      const groups = new Set<string>();
      for (const o of outletsList) if (o.outletGroup) groups.add(o.outletGroup);
      return [...groups].sort();
    },
    async getTaxSettings() {
      return {
        enabled: CTX.taxes.length > 0,
        name: fakeTax.name,
        rate: fakeTax.rate,
        inclusive: CTX.settings.taxCalc === 'inclusive',
        taxMode: CTX.settings.taxMode,
        orderTypes: fakeTax.orderTypes ?? ['dine_in', 'takeaway', 'delivery', 'service'],
        orderTypeRates: fakeTax.orderTypeRates ?? {},
      };
    },
    async saveTaxSettings(input) {
      const problem = taxSettingsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      fakeTax = {
        ...fakeTax,
        name: input.name.trim(),
        rate: input.rate,
        orderTypes: input.orderTypes ?? ['dine_in', 'takeaway', 'delivery', 'service'],
        orderTypeRates: input.orderTypeRates ?? {},
      };
      CTX.taxes = input.enabled ? [{ ...fakeTax }] : [];
      CTX.settings.taxCalc = input.inclusive ? 'inclusive' : CTX.settings.taxCalc === 'inclusive' ? 'after_discount' : CTX.settings.taxCalc;
      if (input.taxMode) CTX.settings.taxMode = input.taxMode;
    },
    async saveOutletOptions(input) {
      const problem = outletOptionsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const { receiptFooter, requireCashPhoto: _p, receiptHeader, receiptShowCashier, receiptShowCustomer, receiptTemplate, ...rest } = input;
      if (receiptTemplate !== undefined) CTX.receiptTemplate = sanitizeReceiptTemplate(receiptTemplate);
      if (receiptHeader !== undefined) CTX.receiptHeader = receiptHeader.trim() || undefined;
      if (receiptShowCashier !== undefined) CTX.receiptShowCashier = receiptShowCashier;
      if (receiptShowCustomer !== undefined) CTX.receiptShowCustomer = receiptShowCustomer;
      Object.assign(CTX.settings, rest); outlet.receiptFooter = receiptFooter.trim(); CTX.receiptFooter = outlet.receiptFooter || undefined;
    },
    async listFloors() { return clone([...floors].sort((a, b) => a.sort - b.sort)); },
    async saveFloor(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama lantai wajib diisi');
      if (floors.some((f) => f.id !== input.id && f.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Lantai "${name}" sudah ada`);
      if (input.id) {
        const f = floors.find((x) => x.id === input.id);
        if (!f) throw new DataError('not_found', 'Lantai tidak ditemukan');
        f.name = name; return clone(f);
      }
      const f: Floor = { id: newId(), name, sort: floors.length + 1 };
      floors.push(f); return clone(f);
    },
    async deleteFloor(id) {
      if (!floors.some((f) => f.id === id)) throw new DataError('not_found', 'Lantai tidak ditemukan');
      const inUse = (await self.listTableStatus()).find((t) => t.floorId === id && t.order);
      if (inUse) throw new DataError('invalid', `Meja ${inUse.name} sedang dipakai pesanan ${inUse.order!.number}. Selesaikan dulu pesanannya`);
      floors = floors.filter((f) => f.id !== id); tables = tables.filter((t) => t.floorId !== id);
    },
    async listTables() { return clone([...tables].sort((a, b) => a.sort - b.sort)); },
    async saveTable(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama meja wajib diisi');
      if (tables.some((t) => t.id !== input.id && t.floorId === input.floorId && t.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Meja "${name}" sudah ada di lantai ini`);
      if (input.id) {
        const t = tables.find((x) => x.id === input.id);
        if (!t) throw new DataError('not_found', 'Meja tidak ditemukan');
        t.name = name; t.floorId = input.floorId; return clone(t);
      }
      const t: DiningTable = { id: newId(), floorId: input.floorId, name, sort: tables.length + 1 };
      tables.push(t); return clone(t);
    },
    async deleteTable(id) {
      const t = (await self.listTableStatus()).find((x) => x.id === id);
      if (!t) throw new DataError('not_found', 'Meja tidak ditemukan');
      if (t.order) throw new DataError('invalid', `Meja ini sedang dipakai pesanan ${t.order.number}. Selesaikan dulu pesanannya`);
      tables = tables.filter((x) => x.id !== id);
    },
    moveOrderTable: (orderId, toTableId) => tableOps.moveOrderTable(orderId, toTableId),
    mergeOrders: (input) => tableOps.mergeOrders(input),
    async listTableStatus(): Promise<TableStatus[]> {
      const live = orders.filter((o) => o.tableId && (o.status === 'open' || o.status === 'partially_paid'));
      return clone([...tables].sort((a, b) => a.sort - b.sort).map((t): TableStatus => {
        const o = live.find((x) => x.tableId === t.id);
        return o ? { ...t, order: { id: o.id, number: o.number, label: o.label, guestCount: o.guestCount, total: o.total, openedAt: o.openedAt } } : t;
      }));
    },
    async listCategories() { return clone([...categories].sort((a, b) => a.sort - b.sort)); },
    async saveCategory(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama kategori wajib diisi');
      if (categories.some((x) => x.id !== input.id && x.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Kategori "${name}" sudah ada`);
      if (input.departmentId && !departments.some((d) => d.id === input.departmentId)) throw new DataError('not_found', 'Departemen tidak ditemukan');
      if (input.id) {
        const c = categories.find((x) => x.id === input.id);
        if (!c) throw new DataError('not_found', 'Kategori tidak ditemukan');
        c.name = name; if (input.departmentId !== undefined) c.departmentId = input.departmentId; return clone(c);
      }
      const c: Category = { id: newId(), name, sort: categories.length + 1, departmentId: input.departmentId ?? null };
      categories.push(c); return clone(c);
    },
    async deleteCategory(id) {
      if (!categories.some((c) => c.id === id)) throw new DataError('not_found', 'Kategori tidak ditemukan');
      categories = categories.filter((c) => c.id !== id);
      for (const p of products) if (p.categoryId === id) p.categoryId = null;
    },
    async categoryProductCounts() {
      const out: Record<string, number> = {};
      for (const p of products) if (p.categoryId) out[p.categoryId] = (out[p.categoryId] ?? 0) + 1;
      return out;
    },
    async listDepartments() { return clone([...departments].sort((a, b) => a.sort - b.sort)); },
    async saveDepartment(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama departemen wajib diisi');
      if (departments.some((x) => x.id !== input.id && x.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Departemen "${name}" sudah ada`);
      if (input.id) {
        const d = departments.find((x) => x.id === input.id);
        if (!d) throw new DataError('not_found', 'Departemen tidak ditemukan');
        d.name = name; return clone(d);
      }
      const d: Department = { id: newId(), name, sort: departments.length + 1 };
      departments.push(d); return clone(d);
    },
    async deleteDepartment(id) {
      if (!departments.some((d) => d.id === id)) throw new DataError('not_found', 'Departemen tidak ditemukan');
      departments = departments.filter((d) => d.id !== id);
      for (const c of categories) if (c.departmentId === id) c.departmentId = null;
    },
    async listBundles(q = {}) {
      return clone(products.filter((p) => p.kind === 'bundle' && (q.includeInactive || p.isActive)).map((p): Bundle => ({
        id: p.id, name: p.name, categoryId: p.categoryId, price: p.price, sku: p.sku, isActive: p.isActive,
        items: (bundleItems.get(p.id) ?? []).map((c) => ({ productId: c.productId, name: products.find((x) => x.id === c.productId)?.name ?? '?', qty: c.qty })),
      })));
    },
    async saveBundle(input: BundleInput) {
      const problem = bundleProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const name = input.name.trim();
      if (products.some((p) => p.id !== input.id && p.name.toLowerCase() === name.toLowerCase() && p.kind === 'bundle')) throw new DataError('invalid', `Paket "${name}" sudah ada`);
      if (input.sku && products.some((p) => p.sku === input.sku && p.id !== input.id)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
      for (const it of input.items) {
        const c = products.find((p) => p.id === it.productId);
        if (!c) throw new DataError('not_found', 'Ada produk dalam paket yang tidak ditemukan');
        if (c.kind === 'bundle') throw new DataError('invalid', 'Paket tidak boleh berisi paket lain');
      }
      const old = input.id ? products.find((p) => p.id === input.id && p.kind === 'bundle') : undefined;
      if (input.id && !old) throw new DataError('not_found', 'Paket tidak ditemukan');
      const patch = { name, categoryId: input.categoryId, price: input.price, sku: input.sku?.trim() || undefined, isActive: input.isActive ?? old?.isActive ?? true };
      const id = old?.id ?? newId();
      if (old) Object.assign(old, patch); else products.push({ id, kind: 'bundle', trackStock: false, isFavorite: false, ...patch });
      bundleItems.set(id, input.items.map((i) => ({ ...i })));
      return (await this.listBundles({ includeInactive: true })).find((b) => b.id === id)!;
    },
    async setBundleActive(id: string, active: boolean) {
      const p = products.find((x) => x.id === id && x.kind === 'bundle');
      if (!p) throw new DataError('not_found', 'Paket tidak ditemukan');
      p.isActive = active;
    },

    async listExtraGroups() { return clone(extraGroups); },
    async saveExtraGroup(input: ExtraGroupInput) {
      const problem = extraGroupProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const name = input.name.trim();
      if (extraGroups.some((g) => g.id !== input.id && g.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Grup "${name}" sudah ada`);
      const old = extraGroups.find((g) => g.id === input.id);
      if (input.id && !old) throw new DataError('not_found', 'Grup tidak ditemukan');
      const options = input.options.filter((o) => o.name.trim()).map((o, k) => ({ id: o.id && old?.options.some((x) => x.id === o.id) ? o.id : newId(), name: o.name.trim(), price: o.price, sort: k + 1 }));
      const g: ExtraGroup = { id: old?.id ?? newId(), name, required: input.required, mode: input.mode, maxSelect: input.mode === 'single' ? null : input.maxSelect ?? null, options, productIds: [...new Set(input.productIds)] };
      extraGroups = old ? extraGroups.map((x) => (x.id === old.id ? g : x)) : [...extraGroups, g];
      return clone(g);
    },
    async deleteExtraGroup(id: string) { extraGroups = extraGroups.filter((g) => g.id !== id); },

    async listProducts(q = {}) {
      const s = q.search?.trim().toLowerCase();
      return clone(products.filter((p) =>
        (q.includeInactive || p.isActive) &&
        (q.categoryId === undefined || q.categoryId === null || p.categoryId === q.categoryId) &&
        (!s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)))
        .map((p) => {
          const alt = (altUnits.get(p.id) ?? []).filter((u) => (u.sellPrice ?? 0) > 0).map((u) => ({ id: u.unitId, name: u.name, conversion: u.conversion, price: u.sellPrice! }));
          return alt.length ? { ...p, sellUnits: alt, baseUnitName: 'pcs' } : p;
        }));
    },
    async getProduct(id) { return clone(products.find((p) => p.id === id) ?? null); },
    async getCustomItemProductId() { return 'custom-item-fake'; },
    async saveProduct(input: ProductInput) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      if (!Number.isFinite(input.price) || input.price < 0) throw new DataError('invalid', 'Harga tidak boleh negatif');
      if (input.sku && products.some((p) => p.sku === input.sku && p.id !== input.id)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
      if (input.id) {
        const p = products.find((x) => x.id === input.id);
        if (!p) throw new DataError('not_found', 'Produk tidak ditemukan');
        Object.assign(p, { name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku || undefined,
          kind: input.kind ?? p.kind, trackStock: input.trackStock ?? p.trackStock, isFavorite: input.isFavorite ?? p.isFavorite, isActive: input.isActive ?? p.isActive,
          taxRate: input.taxRate !== undefined ? input.taxRate : p.taxRate, serviceDurationMin: input.serviceDurationMin !== undefined ? input.serviceDurationMin : p.serviceDurationMin, serviceStaffIds: input.serviceStaffIds !== undefined ? input.serviceStaffIds : p.serviceStaffIds });
        return clone(p);
      }
      const p: Product = { id: newId(), name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku || undefined,
        kind: input.kind ?? 'goods', trackStock: input.trackStock ?? true, stock: 0, isActive: input.isActive ?? true, isFavorite: input.isFavorite ?? false,
        taxRate: input.taxRate !== undefined ? input.taxRate : undefined, serviceDurationMin: input.serviceDurationMin, serviceStaffIds: input.serviceStaffIds };
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
        const patch = { name, categoryId: input.categoryId, price: Math.round(input.price), sku: input.sku?.trim() || undefined, kind, trackStock, isFavorite, isActive: active, taxRate: input.taxRate !== undefined ? input.taxRate : undefined, serviceDurationMin: input.serviceDurationMin, serviceStaffIds: input.serviceStaffIds };
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
        const patch = { name: variantProductName(name, v.label), categoryId: input.categoryId, price: Math.round(v.price), sku: v.sku?.trim() || undefined, kind, trackStock, isFavorite, isActive: active && (v.isActive ?? true), parentId, taxRate: input.taxRate !== undefined ? input.taxRate : undefined, serviceDurationMin: input.serviceDurationMin, serviceStaffIds: input.serviceStaffIds };
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

    async setProductPhoto(productId, photo) {
      const head = products.find((p) => p.id === productId);
      if (!head) throw new DataError('not_found', 'Produk tidak ditemukan');
      if (photo) {
        const problem = photoProblem(photo);
        if (problem) throw new DataError('invalid', problem);
        head.photoUrl = bytesToDataUri(photo);
      } else {
        for (const p of products.filter((x) => x.id === productId || x.parentId === productId)) delete p.photoUrl;
      }
      return (await self.getCatalogProduct(productId))!;
    },

    async listCustomers(q = {}) {
      const list = customers.filter((c) => !c.deleted && customerMatches(c, q.search ?? '')).sort((a, b) => a.name.localeCompare(b.name, 'id'));
      return clone(list.slice(0, q.limit ?? 50).map(({ deleted: _d, ...c }) => c));
    },
    async getCustomer(id) {
      const c = customers.find((x) => x.id === id && !x.deleted);
      if (!c) return null;
      const { deleted: _d, ...rest } = c; return clone(rest);
    },
    async saveCustomer(input) {
      const problem = customerProblem(input, now().toISOString().slice(0, 10));
      if (problem) throw new DataError('invalid', problem);
      const phone = input.phone?.trim() ? normalizePhone(input.phone) : undefined;
      const dup = phone ? customers.find((c) => !c.deleted && c.phone === phone && c.id !== input.id) : undefined;
      if (dup) throw new DataError('invalid', `Nomor ini sudah dipakai pelanggan ${dup.name}.`);
      const fields = {
        name: input.name.trim(), phone, email: input.email?.trim() || undefined, gender: input.gender, birthDate: input.birthDate || undefined,
        city: input.city?.trim() || undefined, address: input.address?.trim() || undefined, note: input.note?.trim() || undefined,
      };
      if (input.id) {
        const c = customers.find((x) => x.id === input.id && !x.deleted);
        if (!c) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
        Object.assign(c, fields);
        const { deleted: _d, ...rest } = c; return clone(rest);
      }
      const c = { id: newId(), pointsBalance: 0, createdAt: now().toISOString(), ...fields };
      customers.push(c);
      return clone(c);
    },
    async deleteCustomer(id) {
      const c = customers.find((x) => x.id === id && !x.deleted);
      if (!c) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
      c.deleted = true;
    },

    async listPromotions(q = {}) {
      return clone(promotions.filter((p) => !p.deleted && (!q.activeOnly || p.isActive)).sort((a, b) => a.name.localeCompare(b.name, 'id')).map(cleanPromo));
    },
    async savePromotion(input) {
      const problem = promotionProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (input.kind === 'free_item' && !products.some((p) => p.id === input.freeProductId)) throw new DataError('invalid', 'Produk gratis tidak ditemukan.');
      const fields: Omit<Promotion, 'id'> = {
        name: input.name.trim(), kind: input.kind, value: input.kind === 'free_item' ? 0 : input.value, minSpend: input.minSpend ?? 0,
        productIds: input.kind === 'percent_item' || input.kind === 'amount_item' || input.kind === 'free_item' ? input.productIds ?? [] : [],
        freeProductId: input.kind === 'free_item' ? input.freeProductId : undefined,
        orderTypes: input.orderTypes ?? [...ALL_TYPES], startsAt: input.startsAt || undefined, endsAt: input.endsAt || undefined, isActive: input.isActive ?? true,
      };
      if (input.id) {
        const p = promotions.find((x) => x.id === input.id && !x.deleted);
        if (!p) throw new DataError('not_found', 'Promo tidak ditemukan');
        Object.assign(p, fields); return clone(cleanPromo(p));
      }
      const p: Promotion = { id: newId(), ...fields };
      promotions.push(p); return clone(p);
    },
    async deletePromotion(id) {
      const p = promotions.find((x) => x.id === id && !x.deleted);
      if (!p) throw new DataError('not_found', 'Promo tidak ditemukan');
      p.deleted = true;
    },
    async listCoupons(promotionId) {
      return clone(coupons.filter((c) => !promotionId || c.promotionId === promotionId).map(withUsage).sort((a, b) => a.code.localeCompare(b.code)));
    },
    async saveCoupon(input) {
      const problem = couponInputProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!promotions.some((p) => p.id === input.promotionId && !p.deleted)) throw new DataError('not_found', 'Promo tidak ditemukan');
      const code = normalizeCode(input.code);
      if (coupons.some((c) => c.code === code && c.id !== input.id)) throw new DataError('invalid', `Kode ${code} sudah dipakai kupon lain.`);
      const fields = { promotionId: input.promotionId, code, usageLimit: input.usageLimit, validFrom: input.validFrom || undefined, validTo: input.validTo || undefined, isActive: input.isActive ?? true };
      if (input.id) {
        const c = coupons.find((x) => x.id === input.id);
        if (!c) throw new DataError('not_found', 'Kupon tidak ditemukan');
        Object.assign(c, fields); return clone(withUsage(c));
      }
      const c: Coupon = { id: newId(), usedCount: 0, ...fields };
      coupons.push(c); return clone(withUsage(c));
    },
    async deleteCoupon(id) {
      const c = coupons.find((x) => x.id === id);
      if (!c) throw new DataError('not_found', 'Kupon tidak ditemukan');
      if (couponUsed(id) > 0) throw new DataError('invalid', 'Kupon ini sudah pernah dipakai. Nonaktifkan saja supaya riwayatnya utuh.');
      coupons = coupons.filter((x) => x.id !== id);
    },
    async findCoupon(code) {
      const c = coupons.find((x) => x.code === normalizeCode(code));
      const p = c && promotions.find((x) => x.id === c.promotionId && !x.deleted);
      return c && p ? clone({ coupon: withUsage(c), promotion: cleanPromo(p) }) : null;
    },

    async getLoyaltyRules() { return { ...loyaltyRules }; },
    async saveLoyaltyRules(rules) {
      const problem = loyaltyRulesProblem(rules);
      if (problem) throw new DataError('invalid', problem);
      loyaltyRules = { ...rules }; return { ...loyaltyRules };
    },
    async listLoyaltyLedger(customerId, limit = 50) { return clone(ledger.filter((e) => e.customerId === customerId).slice(0, limit)); },
    async adjustPoints(customerId, delta, note) {
      const c = customers.find((x) => x.id === customerId && !x.deleted);
      if (!c) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
      if (!Number.isInteger(delta) || delta === 0) throw new DataError('invalid', 'Isi jumlah poin yang berbeda dari nol.');
      if (c.pointsBalance + delta < 0) throw new DataError('invalid', 'Saldo poin tidak boleh menjadi negatif.');
      pushPoints(customerId, delta, 'adjust', note?.trim() || undefined);
      return c.pointsBalance;
    },

    async listStock(q) {
      const ids = [...ingredients.map((i) => i.id), ...products.filter((p) => stockBal(p.id)).map((p) => p.id)];
      const locId = q?.locationId;
      return ids
        .map((id) => stockItem(id, locId))
        .filter((i) => (!q?.kind || i.kind === q.kind) && stockFilterMatches(i, q?.status) && stockSearchMatches(i, q?.search))
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async postStock(input: StockPostInput) {
      const basic = stockPostProblem(input);
      if (basic) throw new DataError('invalid', basic);
      const bal = stockBal(input.productId);
      if (!bal) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak.');
      if (!stockKeys.has(input.id)) {
        const isWh = input.locationId === LOC_GUDANG;
        const currentQty = isWh ? (whQty.get(input.productId) ?? 0) : bal.qty;
        const negProblem = stockPostProblem(input, { allowNegative: CTX.settings.allowNegativeStock, currentQty });
        if (negProblem) throw new DataError('invalid', negProblem);
        stockKeys.add(input.id);
        if (isWh) {
          const delta = input.kind === 'adjust_in' ? input.qty : -input.qty;
          whQty.set(input.productId, currentQty + delta);
        } else {
          recordStock(input.productId, input.kind === 'adjust_in' ? input.qty : -input.qty, input.kind, { unitCost: input.kind === 'adjust_in' ? input.unitCost : undefined, reason: input.reason?.trim() || undefined, refType: 'manual' });
        }
      }
      return stockItem(input.productId, input.locationId);
    },
    async listStockMovesBetween(range, kinds) {
      return clone(moves.filter((m) => m.occurredAt >= range.from && m.occurredAt < range.to && (!kinds?.length || kinds.includes(m.kind)))
        .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
        .map((m) => { const b = stockBal(m.productId); return { ...m, productName: b?.name ?? '(barang dihapus)', unit: b?.unit ?? '' }; }));
    },
    async listStockMoves(productId, q) { return clone(moves.filter((m) => m.productId === productId).slice(0, q?.limit ?? 100)); },
    async setStockMin(productId, min) {
      if (!stockBal(productId)) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak.');
      if (min !== null && (!Number.isFinite(min) || min < 0)) throw new DataError('invalid', 'Batas minimum tidak boleh negatif.');
      if (min === null) mins.delete(productId); else mins.set(productId, min);
    },
    async listOpnames() {
      return opnames.map((o) => ({ id: o.id, number: o.number, status: o.status, countedAt: o.countedAt, finalizedAt: o.finalizedAt, note: o.note, lineCount: o.lines.length, diffCount: o.lines.filter((l) => l.difference !== 0).length }))
        .sort((a, b) => b.number.localeCompare(a.number));
    },
    async getOpname(id) { const o = opnames.find((x) => x.id === id); return o ? opnameView(o) : null; },
    async saveOpname(input: StockOpnameInput) {
      const problem = opnameProblem(input);
      if (problem) throw new DataError('invalid', problem);
      let o = opnames.find((x) => x.id === input.id);
      if (o && o.status !== 'draft') throw new DataError('order_locked', 'Opname yang sudah selesai tidak bisa diubah.');
      for (const l of input.lines) if (!stockBal(l.productId)) throw new DataError('not_found', 'Ada barang yang tidak ditemukan atau stoknya tidak dilacak.');
      if (!o) {
        o = { id: input.id, number: `OPN-${String(opnames.length + 1).padStart(6, '0')}`, status: 'draft', countedAt: now().toISOString(), lines: [], values: new Map() };
        opnames.push(o);
      }
      o.note = input.note?.trim() || undefined;
      const prev = new Map(o.lines.map((l) => [l.productId, l]));
      o.lines = input.lines.map((l) => {
        const b = stockBal(l.productId)!;
        const system = prev.get(l.productId)?.systemQty ?? b.qty;                    // jumlah sistem tetap yang pertama dicatat
        return { productId: l.productId, name: b.name, unit: b.unit, systemQty: system, countedQty: l.countedQty, difference: opnameDifference(system, l.countedQty), value: 0 };
      });
      return opnameView(o);
    },
    async finalizeOpname(id) {
      const o = opnames.find((x) => x.id === id);
      if (!o) throw new DataError('not_found', 'Opname tidak ditemukan.');
      if (o.status !== 'draft') throw new DataError('order_locked', 'Opname ini sudah diselesaikan.');
      if (o.lines.length === 0) throw new DataError('invalid', 'Isi hitung fisik minimal satu item sebelum menyelesaikan opname.');
      for (const l of o.lines) {
        if (l.difference === 0) continue;
        const before = moves.length;
        recordStock(l.productId, l.difference, 'opname_adjust', { reason: `Opname ${o.number}`, refType: 'opname' });
        o.values.set(l.productId, moves.length > before ? moves[0]!.totalCost : 0);
      }
      o.status = 'final'; o.finalizedAt = now().toISOString();
      return opnameView(o);
    },
    async deleteOpname(id) {
      const o = opnames.find((x) => x.id === id);
      if (!o) throw new DataError('not_found', 'Opname tidak ditemukan.');
      if (o.status !== 'draft') throw new DataError('order_locked', 'Opname yang sudah selesai tidak bisa dihapus.');
      opnames = opnames.filter((x) => x.id !== id);
    },
    async listSuppliers(q) {
      const term = q?.search?.trim().toLowerCase();
      return clone(suppliers.filter((x) => (q?.includeInactive || x.isActive) && (!term || x.name.toLowerCase().includes(term) || (x.code ?? '').toLowerCase().includes(term)))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')));
    },
    async saveSupplier(input: SupplierInput) {
      const problem = supplierProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const name = input.name.trim();
      if (suppliers.some((x) => x.id !== input.id && x.isActive && x.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Sudah ada pemasok bernama "${name}".`);
      const clean = (v?: string) => v?.trim() || undefined;
      const row: Supplier = { id: input.id ?? newId(), code: clean(input.code), name, phone: clean(input.phone), email: clean(input.email), address: clean(input.address), termDays: input.termDays, isActive: input.isActive ?? true };
      const at = suppliers.findIndex((x) => x.id === row.id);
      if (input.id && at < 0) throw new DataError('not_found', 'Pemasok tidak ditemukan.');
      if (at >= 0) suppliers[at] = row; else suppliers.push(row);
      return clone(row);
    },
    async listPurchaseItems() {
      const ids = [...ingredients.map((i) => i.id), ...products.filter((p) => stockBal(p.id)).map((p) => p.id)];
      return ids.map((id): PurchaseItem => { const b = stockBal(id)!; return { productId: id, name: b.name, kind: b.kind, baseUnit: b.unit, avgCost: costs.get(id) ?? 0, units: purchaseUnits(id) }; })
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async listPayAccounts(): Promise<PayAccount[]> { return accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive).map((a) => ({ id: a.id, code: a.code, name: a.name })); },
    async listPurchaseOrders() {
      return pOrders.map((o) => {
        const req = o.requestId ? stockRequests.find((r) => r.id === o.requestId) : undefined;
        return { id: o.id, number: o.number, supplierId: o.supplierId, supplierName: supplierName(o.supplierId), status: o.status, orderDate: o.orderDate, expectedDate: o.expectedDate, total: o.total, lineCount: o.lines.length, requestId: o.requestId, requestNumber: req?.number, downPayment: o.downPayment };
      }).sort((a, b) => b.number.localeCompare(a.number));
    },
    async getPurchaseOrder(id) { const o = pOrders.find((x) => x.id === id); return o ? orderView(o) : null; },
    async savePurchaseOrder(input: PurchaseOrderInput) {
      const problem = purchaseOrderProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!suppliers.some((x) => x.id === input.supplierId && x.isActive)) throw new DataError('not_found', 'Pemasok tidak ditemukan.');
      if (input.status !== 'cancelled' && input.lines.length === 0) throw new DataError('invalid', 'Isi minimal satu barang.');
      let o = pOrders.find((x) => x.id === input.id);
      if (o && (o.status === 'received' || o.status === 'partially_received')) throw new DataError('order_locked', 'PO yang sudah diterima tidak bisa diubah.');
      if (o && o.status === 'cancelled') throw new DataError('order_locked', 'PO yang dibatalkan tidak bisa diubah.');
      const lines = checkedLines(input.lines);
      if (purchaseTotal(input.lines, input.discount, input.tax, input.otherCost) < 0) throw new DataError('invalid', 'Diskon melebihi nilai pembelian.');
      const fields = { supplierId: input.supplierId, status: input.status, orderDate: input.orderDate ?? o?.orderDate ?? todayKey(), expectedDate: input.expectedDate || undefined,
        discount: input.discount, taxAmount: input.tax, otherCost: input.otherCost, total: purchaseTotal(input.lines, input.discount, input.tax, input.otherCost), note: input.note?.trim() || undefined, lines,
        requestId: input.requestId ?? o?.requestId ?? null, downPayment: input.downPayment ?? o?.downPayment ?? 0 };
      if (!o) { o = { id: input.id, number: `PO-${String(pOrders.length + 1).padStart(6, '0')}`, ...fields }; pOrders.push(o); } else Object.assign(o, fields);
      return orderView(o);
    },
    async listPurchaseInvoices(q) {
      return pInvoices.filter((i) => (!q?.supplierId || i.supplierId === q.supplierId) && (!q?.status || i.status === q.status))
        .map((i): PurchaseInvoiceSummary => ({ id: i.id, number: i.number, supplierId: i.supplierId, supplierName: supplierName(i.supplierId), supplierInvoiceNo: i.supplierInvoiceNo, invoiceDate: i.invoiceDate, dueDate: i.dueDate,
          status: i.status, total: i.total, paidTotal: i.paidTotal, outstanding: invoiceOutstanding(i.total, i.paidTotal), fullyReceived: i.lines.every((l) => l.receivedQty >= l.qty), downPayment: i.downPayment, hasAttachment: !!i.attachmentName || !!i.attachmentDataUrl }))
        .sort((a, b) => b.number.localeCompare(a.number));
    },
    async getPurchaseInvoice(id) { const i = pInvoices.find((x) => x.id === id); return i ? invoiceView(i) : null; },
    async createPurchaseInvoice(input: PurchaseInvoiceInput) {
      const existing = pInvoices.find((x) => x.id === input.id);
      if (existing) return invoiceView(existing);
      const problem = purchaseInvoiceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (input.supplierId && !suppliers.some((x) => x.id === input.supplierId && x.isActive)) throw new DataError('not_found', 'Pemasok tidak ditemukan.');
      const order = input.orderId ? pOrders.find((o) => o.id === input.orderId) : undefined;
      if (input.orderId && (!order || (order.status !== 'ordered' && order.status !== 'partially_received'))) throw new DataError('invalid', 'PO ini tidak bisa dibuatkan faktur (belum dipesan atau sudah selesai).');
      const lines = checkedLines(input.lines);
      const date = input.invoiceDate ?? todayKey();
      const term = input.termDays ?? suppliers.find((x) => x.id === input.supplierId)?.termDays ?? 0;
      const subtotal = purchaseSubtotal(input.lines);
      const dp = input.downPayment ?? order?.downPayment ?? 0;
      const inv: FInvoice = { id: input.id, number: `FPB-${String(pInvoices.length + 1).padStart(6, '0')}`, supplierId: input.supplierId ?? undefined, orderId: input.orderId ?? undefined,
        supplierInvoiceNo: input.supplierInvoiceNo?.trim() || undefined, invoiceDate: date, dueDate: addDays(date, term), termDays: term, status: 'open', subtotal, discount: input.discount, taxAmount: input.tax,
        otherCost: input.otherCost, total: purchaseTotal(input.lines, input.discount, input.tax, input.otherCost), paidTotal: 0, note: input.note?.trim() || undefined, lines, payments: [],
        downPayment: dp, attachmentName: input.attachmentName ?? null, attachmentDataUrl: input.attachmentDataUrl ?? null };
      receiveInto(inv, input.lines.map((l, i) => ({ lineId: lines[i]!.id, qty: l.receivedQty ?? l.qty })));
      if (inv.total === 0) inv.status = 'paid';
      pInvoices.push(inv);
      {
        const stockValue = subtotal - input.discount + input.otherCost;
        storeEntry(date, `Pembelian ${inv.number}`, 'purchase_invoice', inv.id, 'PUR', [
          { accountId: acct('inventory').id, debit: stockValue, credit: 0, memo: `Persediaan ${inv.number}` }, { accountId: acct('purchase_tax_input').id, debit: input.tax, credit: 0, memo: 'Pajak masukan' },
          { accountId: acct('accounts_payable').id, debit: 0, credit: inv.total, memo: `Utang ${inv.number}` }]);
      }
      if (order) order.status = 'received';
      return invoiceView(inv);
    },
    async receivePurchase(input: PurchaseReceiveInput) {
      const inv = pInvoices.find((x) => x.id === input.invoiceId);
      if (!inv) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      if (receiptKeys.has(input.id)) return invoiceView(inv);
      const problem = purchaseReceiveProblem(input, inv.lines);
      if (problem) throw new DataError('invalid', problem);
      receiptKeys.add(input.id);
      receiveInto(inv, input.items);
      return invoiceView(inv);
    },
    async payPurchase(input: PurchasePayInput) {
      const inv = pInvoices.find((x) => x.id === input.invoiceId);
      if (!inv) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      if (inv.payments.some((p) => p.id === input.id)) return invoiceView(inv);
      if (inv.status !== 'open' && inv.status !== 'partially_paid') throw new DataError('invalid', 'Faktur ini tidak bisa dibayar lagi.');
      const acc = (await self.listPayAccounts()).find((a) => a.id === input.accountId);
      if (!acc) throw new DataError('invalid', 'Akun kas atau bank tidak ditemukan.');
      const problem = purchasePayProblem(input, invoiceOutstanding(inv.total, inv.paidTotal));
      if (problem) throw new DataError('invalid', problem);
      const n = pInvoices.reduce((c, i) => c + i.payments.length, 0) + 1;
      inv.payments.push({ id: input.id, number: `BYR-${String(n).padStart(6, '0')}`, paidAt: input.paidAt ?? todayKey(), accountName: acc.name, amount: input.amount, note: input.note?.trim() || undefined });
      inv.paidTotal = Math.round((inv.paidTotal + input.amount) * 100) / 100;
      inv.status = invoiceStatusFor(inv.total, inv.paidTotal);
      storeEntry(input.paidAt ?? todayKey(), `Bayar ${inv.number}`, 'purchase_payment', input.id, 'PAY', [
        { accountId: acct('accounts_payable').id, debit: input.amount, credit: 0 }, { accountId: input.accountId, debit: 0, credit: input.amount }]);
      return invoiceView(inv);
    },
    async cancelPurchaseInvoice(id: string, reason?: string) {
      const inv = pInvoices.find((x) => x.id === id);
      if (!inv) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      if (inv.status === 'void') return invoiceView(inv);
      if (inv.payments.length > 0) throw new DataError('invalid', 'Faktur yang sudah dibayar tidak bisa dibatalkan langsung. Batalkan pembayaran terlebih dahulu.');
      for (const l of inv.lines) {
        if (l.receivedQty > 0) {
          const conv = purchaseUnits(l.productId).find((u) => u.unitId === l.unitId)?.conversion ?? 1;
          const cost = purchaseUnitCost(l, conv, inv);
          recordStock(l.productId, -Math.round(l.receivedQty * conv * 10000) / 10000, 'adjust_out', { unitCost: cost, reason: `Batal faktur ${inv.number}${reason ? `: ${reason}` : ''}`, refType: 'purchase_invoice' });
          l.receivedQty = 0;
        }
      }
      inv.status = 'void';
      inv.voidReason = reason?.trim() || undefined;
      inv.voidAt = now().toISOString();
      const stockValue = inv.subtotal - inv.discount + inv.otherCost;
      storeEntry(todayKey(), `Batal pembelian ${inv.number}`, 'purchase_invoice_void', inv.id, 'REV', [
        { accountId: acct('inventory').id, debit: 0, credit: stockValue, memo: `Batal persediaan ${inv.number}` },
        { accountId: acct('purchase_tax_input').id, debit: 0, credit: inv.taxAmount, memo: 'Batal pajak masukan' },
        { accountId: acct('accounts_payable').id, debit: inv.total, credit: 0, memo: `Batal utang ${inv.number}` },
      ]);
      if (inv.orderId) {
        const order = pOrders.find((o) => o.id === inv.orderId);
        if (order && order.status === 'received') order.status = 'ordered';
      }
      return invoiceView(inv);
    },
    // ---------- dapur ----------
    async kitchenBoard(servedMinutes = 0) {
      const cut = now().getTime() - Math.max(0, servedMinutes) * 60000;
      const rows: KitchenRow[] = [];
      for (const o of orders) {
        if (o.status === 'void') continue;
        for (const it of o.items) {
          const k = kitchen.get(it.id);
          if (!k || (k.status === 'served' && new Date(k.statusAt).getTime() <= cut)) continue;
          const table = o.tableId ? tables.find((t) => t.id === o.tableId)?.name : undefined;
          rows.push({ itemId: it.id, orderId: o.id, orderNumber: o.number, orderType: o.type, name: it.name, qty: it.qty, extras: (it.extras ?? []).map((e) => ({ name: e.name, qty: it.qty })),
            status: k.status, sentAt: k.sentAt, statusAt: k.statusAt, ...(k.stationId ? { stationId: k.stationId } : {}), ...(table ? { tableName: table } : {}), ...(o.label ? { label: o.label } : {}), ...(o.guestCount !== undefined ? { guestCount: o.guestCount } : {}), ...(it.note ? { note: it.note } : {}) });
        }
      }
      return clone(groupTickets(rows));
    },
    async kitchenSend(orderId) {
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new DataError('not_found', 'Pesanan belum tersimpan di server.');
      if (o.status === 'void') throw new DataError('invalid', 'Pesanan ini sudah dibatalkan.');
      const lines: SentLine[] = []; const at = now().toISOString();
      for (const it of o.items) {
        if (kitchen.has(it.id)) continue;
        const sid = products.find((p) => p.id === it.productId)?.printStationId;
        const st = sid ? stations.find((x) => x.id === sid && x.isActive) : undefined;
        if (!st) continue;
        kitchen.set(it.id, { status: 'new', sentAt: at, statusAt: at, stationId: st.id });
        lines.push({ itemId: it.id, stationId: st.id, name: it.name, qty: it.qty, ...(it.note ? { note: it.note } : {}), extras: (it.extras ?? []).map((e) => ({ name: e.name, qty: 1 })) });
      }
      return { sent: lines.length, lines };
    },
    async listNotePresets() { return clone([...notePresets].sort((a, b) => a.sort - b.sort || a.category.localeCompare(b.category))); },
    async saveNotePreset(input: NotePresetInput) {
      const problem = notePresetProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const category = input.category.trim(), text = input.text.trim();
      const same = (x: NotePreset) => x.category.trim().toLowerCase() === category.toLowerCase() && x.text.trim().toLowerCase() === text.toLowerCase();
      if (notePresets.some((x) => x.id !== input.id && same(x))) throw new DataError('invalid', `Catatan "${text}" di kategori ${category} sudah ada`);
      const cur = input.id ? notePresets.find((x) => x.id === input.id) : undefined;
      if (input.id && !cur) throw new DataError('not_found', 'Catatan tidak ditemukan');
      const next: NotePreset = { id: cur?.id ?? newId(), category, text, sort: input.sort ?? cur?.sort ?? (notePresets.reduce((m, x) => Math.max(m, x.sort), 0) + 1), isActive: input.isActive ?? cur?.isActive ?? true };
      if (cur) Object.assign(cur, next); else notePresets.push(next);
      return clone(next);
    },
    async removeNotePreset(id) {
      if (!notePresets.some((x) => x.id === id)) throw new DataError('not_found', 'Catatan tidak ditemukan');
      notePresets = notePresets.filter((x) => x.id !== id);
    },
    async listPrintStations() { return clone([...stations].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))); },
    async savePrintStation(input: PrintStationInput) {
      const problem = stationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const name = input.name.trim();
      if (stations.some((x) => x.id !== input.id && x.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Stasiun "${name}" sudah ada`);
      const cur = input.id ? stations.find((x) => x.id === input.id) : undefined;
      if (input.id && !cur) throw new DataError('not_found', 'Stasiun tidak ditemukan');
      const kind = input.kind ?? cur?.kind ?? 'checker';
      const next: PrintStation = {
        id: cur?.id ?? newId(), name, kind, printMode: input.printMode ?? cur?.printMode ?? 'ask', copies: input.copies ?? cur?.copies ?? 1, paper: input.paper ?? cur?.paper ?? '58',
        template: normalizeTemplate({ ...(cur?.template ?? defaultTemplate(kind)), ...(input.template ?? {}) }, kind),
        sort: input.sort ?? cur?.sort ?? (stations.reduce((m, x) => Math.max(m, x.sort), 0) + 1), isActive: input.isActive ?? cur?.isActive ?? true,
      };
      if (cur) Object.assign(cur, next); else stations.push(next);
      return clone(next);
    },
    async removePrintStation(id) {
      if (!stations.some((x) => x.id === id)) throw new DataError('not_found', 'Stasiun tidak ditemukan');
      stations = stations.filter((x) => x.id !== id);
      for (const p of products) if (p.printStationId === id) delete p.printStationId;
    },
    async assignProductsToStation(input) {
      if (input.stationId !== null && !stations.some((x) => x.id === input.stationId)) throw new DataError('not_found', 'Stasiun tidak ditemukan');
      const ids = new Set(input.productIds ?? []);
      const hit = (p: Product) => ids.has(p.id) || (p.parentId ? ids.has(p.parentId) : false) || (input.categoryId !== undefined && p.categoryId === input.categoryId);
      let changed = 0;
      for (const p of products) {
        if (!hit(p) || p.kind === 'bundle') continue;
        if ((p.printStationId ?? null) === input.stationId) continue;
        if (input.stationId === null) delete p.printStationId; else p.printStationId = input.stationId;
        changed += 1;
      }
      return { changed };
    },
    async kitchenSetStatus(itemIds, status) {
      if (itemIds.length === 0) throw new DataError('invalid', 'Pilih baris yang mau diubah.');
      const at = now().toISOString();
      for (const id of itemIds) { const k = kitchen.get(id); if (k && k.status !== status) { k.status = status; k.statusAt = at; } }
    },
    async issueAuthCode(input) {
      if (!Number.isInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > 240) throw new DataError('invalid', 'Masa berlaku kode antara 1 dan 240 menit.');
      const code = String(Math.floor(Math.random() * 10 ** AUTH_CODE_LENGTH)).padStart(AUTH_CODE_LENGTH, '0');
      const at = now();
      const row = { id: newId(), code, permission: input.permission, note: input.note?.trim().slice(0, 120) || undefined, issuedAt: at.toISOString(), expiresAt: new Date(at.getTime() + input.ttlMinutes * 60000).toISOString() } as AuthCodeFake;
      authCodes.unshift(row);
      return { id: row.id, code, expiresAt: row.expiresAt } satisfies IssuedAuthCode;
    },
    async listAuthCodes() {
      const t = now().toISOString();
      return authCodes.map((c): AuthCodeRow => ({
        id: c.id, permission: c.permission, note: c.note, issuedBy: 'e-owner', issuerEmail: 'pemilik@contoh.id', issuedAt: c.issuedAt, expiresAt: c.expiresAt,
        status: c.usedAt ? 'used' : c.revokedAt ? 'revoked' : c.expiresAt <= t ? 'expired' : 'active',
        ...(c.usedAt ? { usedAt: c.usedAt } : {}), ...(c.revokedAt ? { revokedAt: c.revokedAt } : {}),
      }));
    },
    async revokeAuthCode(id) {
      const c = authCodes.find((x) => x.id === id);
      if (!c) throw new DataError('not_found', 'Kode tidak ditemukan.');
      if (c.usedAt || c.revokedAt) return false;
      c.revokedAt = now().toISOString();
      return true;
    },
    async useAuthCode(code, permission: AuthCodePermission) {
      const t = now(); const cutoff = t.getTime() - 10 * 60000;
      authCodeFails = authCodeFails.filter((x) => x > cutoff);
      if (authCodeFails.length >= 5) return null;
      const c = authCodes.find((x) => x.code === normalizeAuthCode(code) && x.permission === permission && !x.usedAt && !x.revokedAt && x.expiresAt > t.toISOString());
      if (!c) { authCodeFails.push(t.getTime()); return null; }
      c.usedAt = t.toISOString(); authCodeFails = [];
      return 'e-owner';
    },
    async listRecipeIngredients() {
      const alt: Record<string, { unitId: string; name: string; factor: number }> = { 'ing-kopi': { unitId: 'kg', name: 'kg', factor: 1000 }, 'ing-susu': { unitId: 'liter', name: 'liter', factor: 1000 }, 'ing-gula': { unitId: 'liter', name: 'liter', factor: 1000 } };
      return ingredients.map((i): RecipeIngredient => {
        const cost = costs.get(i.id) ?? 0;
        return { id: i.id, name: i.name, baseUnit: i.unit, unitCost: cost, costSource: cost > 0 ? 'average' : 'none', units: [{ unitId: i.unit, name: i.unit, factor: 1 }, ...(alt[i.id] ? [alt[i.id]!] : [])] };
      }).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    },
    async listRecipes() {
      return products.filter((p) => p.kind === 'goods' && p.isSellable !== false).map((p): RecipeProduct => ({ id: p.id, name: p.name, price: p.price, isActive: p.isActive, lines: clone(recipes.get(p.id) ?? []) }));
    },
    async saveRecipe(productId, lines) {
      const p = products.find((x) => x.id === productId);
      if (!p) throw new DataError('not_found', 'Produk tidak ditemukan.');
      const ings = await this.listRecipeIngredients();
      const problem = recipeProblem(lines, new Map(ings.map((i) => [i.id, i])));
      if (problem) throw new DataError('invalid', problem);
      const describe = (ls: RecipeLine[]) => ls.map((l) => `${ings.find((i) => i.id === l.ingredientId)?.name ?? l.ingredientId} ${l.qty} ${l.unitId}`).join(', ');
      const before = describe(recipes.get(productId) ?? []), after = describe(lines);
      if (lines.length) recipes.set(productId, clone(lines)); else recipes.delete(productId);
      if (before !== after) activityLog.unshift({ id: newId(), at: now().toISOString(), action: 'recipe.updated', entity: 'recipe', entityId: productId, name: p.name, actorUserId: 'u-owner', actorEmail: 'pemilik@contoh.id', changes: [{ column: 'lines', from: before.slice(0, 200) || null, to: after.slice(0, 200) || null }] });
      return lines.length;
    },
    async listProductUnits(productId) {
      const b = stockBal(productId);
      if (!b) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak.');
      const used = (u: { unitId: string; name: string }) =>
        (recipes.size > 0 && [...recipes.values()].some((ls) => ls.some((l) => l.ingredientId === productId && (l.unitId === u.unitId || l.unitId === u.name))))
        || [...pOrders, ...pInvoices].some((o) => o.lines.some((l) => l.productId === productId && l.unitId === u.unitId));
      const base: ProductUnitRow = { unitId: baseUnitId(productId), name: b.unit, conversion: 1, isBase: true, buyPrice: costs.get(productId) ?? 0, minPurchase: 1, inUse: true };
      return clone([base, ...(altUnits.get(productId) ?? []).map((u): ProductUnitRow => ({ ...u, inUse: used(u) }))].sort((a, c) => Number(c.isBase) - Number(a.isBase) || a.conversion - c.conversion));
    },
    async saveProductUnit(input: ProductUnitInput) {
      const b = stockBal(input.productId);
      if (!b) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak.');
      const problem = productUnitProblem(input, b.unit);
      if (problem) throw new DataError('invalid', problem);
      const name = input.unitName.trim();
      const list = altUnits.get(input.productId) ?? [];
      const existing = list.find((u) => u.name.toLowerCase() === name.toLowerCase());
      const rows = await this.listProductUnits(input.productId);
      if (existing) {
        if (existing.conversion !== input.conversion && rows.find((r) => r.unitId === existing.unitId)?.inUse) throw new DataError('invalid', 'Satuan ini sudah dipakai, jadi isinya tidak bisa diubah.');
        existing.conversion = input.conversion; existing.buyPrice = input.buyPrice ?? 0; existing.minPurchase = input.minPurchase ?? 1; existing.sellPrice = input.sellPrice ?? 0;
      } else {
        list.push({ unitId: `u-${name.toLowerCase().replace(/\s+/g, '-')}-${list.length}`, name, conversion: input.conversion, isBase: false, buyPrice: input.buyPrice ?? 0, minPurchase: input.minPurchase ?? 1, sellPrice: input.sellPrice ?? 0 });
        altUnits.set(input.productId, list);
      }
    },
    async removeProductUnit(productId, unitId) {
      const list = altUnits.get(productId) ?? [];
      const idx = list.findIndex((u) => u.unitId === unitId);
      if (idx < 0) return false;
      const row = (await this.listProductUnits(productId)).find((r) => r.unitId === unitId);
      if (row?.inUse) throw new DataError('invalid', 'Satuan ini sudah dipakai, jadi tidak bisa dihapus.');
      list.splice(idx, 1);
      return true;
    },
    async listDiscountUses(range) {
      return orders.filter((o) => o.status === 'paid' && (o.closedAt ?? o.openedAt) >= range.from && (o.closedAt ?? o.openedAt) < range.to)
        .flatMap((o) => (o.discounts ?? []).map((d): DiscountUse => ({ orderId: o.id, source: d.source, promotionId: d.promotionId, couponId: d.couponId, points: d.points ?? 0, amount: d.amount, authorizedBy: d.authorizedBy })));
    },
    async listStockLocations(): Promise<StockLocation[]> {
      return [{ id: LOC_OUTLET, name: locNames[LOC_OUTLET]!, kind: 'outlet' }, { id: LOC_GUDANG, name: locNames[LOC_GUDANG]!, kind: 'warehouse' }];
    },
    async listStockTransfers() {
      return clone(transfers.map(({ lines, ...t }) => ({ ...t, lines: lines.map(({ cost: _c, ...l }) => l) })));
    },
    async createStockTransfer(input: StockTransferInput) {
      const dup = transfers.find((t) => t.id === input.id);
      if (dup) return { number: dup.number };
      const problem = transferProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!locNames[input.fromId] || !locNames[input.toId]) throw new DataError('not_found', 'Lokasi tidak ditemukan.');
      const stockByProduct = new Map<string, number>();
      const lines = input.lines.map((l) => {
        const b = stockBal(l.productId);
        if (!b) throw new DataError('invalid', 'Ada barang yang stoknya tidak dilacak.');
        if (input.fromId === LOC_OUTLET) stockByProduct.set(l.productId, b.qty);
        return { productId: l.productId, name: b.name, qty: l.qty, receivedQty: 0, cost: costs.get(l.productId) ?? 0 };
      });
      if (input.fromId === LOC_OUTLET) {
        const stockErr = transferProblem(input, { allowNegative: CTX.settings.allowNegativeStock, stockByProduct });
        if (stockErr) throw new DataError('invalid', stockErr);
      }
      for (const l of lines) {
        if (input.fromId === LOC_OUTLET) recordStock(l.productId, -l.qty, 'transfer_out', { reason: `Transfer ke ${locNames[input.toId]}`, refType: 'transfer' });
        else whQty.set(l.productId, (whQty.get(l.productId) ?? 0) - l.qty);
      }
      const number = `TRF-${String(transfers.length + 1).padStart(6, '0')}`;
      transfers.unshift({ id: input.id, number, status: 'in_transit', fromId: input.fromId, fromName: locNames[input.fromId]!, toId: input.toId, toName: locNames[input.toId]!, note: input.note?.trim() || undefined, createdAt: now().toISOString(), lines });
      return { number };
    },
    async receiveStockTransfer(id) {
      const t = transfers.find((x) => x.id === id);
      if (!t) throw new DataError('not_found', 'Transfer tidak ditemukan.');
      if (t.status !== 'in_transit') throw new DataError('invalid', 'Transfer ini tidak sedang dalam perjalanan.');
      for (const l of t.lines) {
        if (t.toId === LOC_OUTLET) recordStock(l.productId, l.qty, 'transfer_in', { unitCost: l.cost, reason: `Transfer ${t.number}`, refType: 'transfer' });
        else whQty.set(l.productId, (whQty.get(l.productId) ?? 0) + l.qty);
        l.receivedQty = l.qty;
      }
      t.status = 'received';
    },
    async cancelStockTransfer(id) {
      const t = transfers.find((x) => x.id === id);
      if (!t) throw new DataError('not_found', 'Transfer tidak ditemukan.');
      if (t.status !== 'in_transit') throw new DataError('invalid', 'Transfer ini tidak sedang dalam perjalanan.');
      for (const l of t.lines) {
        if (t.fromId === LOC_OUTLET) recordStock(l.productId, l.qty, 'transfer_in', { unitCost: l.cost, reason: `Transfer ${t.number} dibatalkan`, refType: 'transfer' });
        else whQty.set(l.productId, (whQty.get(l.productId) ?? 0) + l.qty);
      }
      t.status = 'cancelled';
    },
    async setPriceOverride(productIds, pct) {
      const problem = priceOverridePctProblem(pct);
      if (problem) throw new DataError('invalid', problem);
      for (const id of productIds) {
        const p = products.find((x) => x.id === id);
        if (!p) throw new DataError('not_found', 'Produk tidak ditemukan.');
        if (pct > 0) p.priceOverridePct = pct; else delete p.priceOverridePct;
      }
    },
    async listActivity(q: ActivityQuery = {}) {
      const to = q.to ? new Date(q.to).getTime() : now().getTime() + 86400000;
      const from = q.from ? new Date(q.from).getTime() : now().getTime() - 30 * 86400000;
      return clone(activityLog
        .filter((r) => { const t = new Date(r.at).getTime(); return t >= from && t < to && (!q.entity || r.entity === q.entity); })
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, Math.max(1, Math.min(q.limit ?? 200, 500))));
    },
    async listAccounts() { return clone([...accounts].sort((a, b) => a.code.localeCompare(b.code))); },
    async saveAccount(input: AccountInput) {
      const problem = accountProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const code = input.code.trim(), name = input.name.trim();
      if (accounts.some((a) => a.id !== input.id && a.code === code)) throw new DataError('invalid', `Kode ${code} sudah dipakai akun lain.`);
      const used = (id: string) => allEntries().some((e) => e.lines.some((l) => l.accountId === id));
      if (input.id) {
        const a = accounts.find((x) => x.id === input.id);
        if (!a) throw new DataError('not_found', 'Akun tidak ditemukan.');
        if (a.systemKey && (input.isActive === false || input.category !== a.category || input.kind !== a.kind)) throw new DataError('invalid', 'Akun sistem dipakai pembukuan otomatis: hanya namanya yang boleh diubah.');
        if (used(a.id) && (input.category !== a.category || input.kind !== a.kind)) throw new DataError('invalid', 'Akun yang sudah punya jurnal tidak bisa diganti kelompok atau jenisnya.');
        Object.assign(a, { code, name, kind: input.kind, category: input.category, isActive: input.isActive ?? a.isActive });
        return clone(a);
      }
      const a: Account = { id: newId(), code, name, kind: input.kind, category: input.category, isActive: input.isActive ?? true };
      accounts.push(a); return clone(a);
    },
    async listJournal(q) {
      const term = q.search?.trim().toLowerCase();
      return allEntries().filter((e) => e.date >= q.from && e.date <= q.to && (!q.sourceType || e.sourceType === q.sourceType) && (!term || e.number.toLowerCase().includes(term) || e.description.toLowerCase().includes(term)))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
        .map((e): JournalSummary => { const { lines: _l, ...rest } = journalView(e); return rest; });
    },
    async getJournal(id) { const e = allEntries().find((x) => x.id === id); return e ? journalView(e) : null; },
    async postJournal(input: JournalInput) {
      const prior = stored.find((e) => e.sourceId === input.id && (e.sourceType === 'manual' || e.sourceType === 'opening' || e.sourceType === 'transfer'));
      if (prior) return journalView(prior);
      const problem = journalProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const lines = input.lines.filter((l) => l.accountId);
      for (const l of lines) { const a = accounts.find((x) => x.id === l.accountId); if (!a || a.kind !== 'detail' || !a.isActive) throw new DataError('invalid', 'Ada akun yang tidak ditemukan, nonaktif, atau berupa akun induk.'); }
      const prefix = input.kind === 'opening' ? 'OB' : input.kind === 'transfer' ? 'PS' : 'JU';
      const e = storeEntry(input.date, input.description.trim(), input.kind, input.id, prefix, lines.map((l) => ({ ...l, memo: l.memo?.trim() || undefined })));
      return journalView(e);
    },
    async reverseJournal(id, reason, date) {
      const e = stored.find((x) => x.id === id);
      if (!e) throw new DataError('invalid', 'Hanya jurnal manual dan saldo awal yang bisa dibalik.');
      if (e.sourceType !== 'manual' && e.sourceType !== 'opening' && e.sourceType !== 'transfer') throw new DataError('invalid', 'Hanya jurnal manual dan saldo awal yang bisa dibalik.');
      const prior = stored.find((x) => x.reversesId === e.id);
      if (prior) return journalView(prior);
      if (e.status !== 'posted') throw new DataError('invalid', 'Jurnal ini belum atau tidak lagi terposting.');
      const r = storeEntry(date ?? todayKey(), `Pembalik ${e.number}${reason?.trim() ? `: ${reason.trim()}` : ''}`.slice(0, 200), 'reversal', e.id, 'REV', e.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo })), e.id);
      e.status = 'voided';
      return journalView(r);
    },
    async ledger(accountId, range) {
      const a = accounts.find((x) => x.id === accountId);
      if (!a) throw new DataError('not_found', 'Akun tidak ditemukan.');
      return clone(ledgerOf(finLines(), a, range.from, range.to));
    },
    async trialBalance(range) { return trialBalanceOf(finLines(), range.from, range.to); },
    async incomeStatement(range) { return incomeStatementOf(finLines(), range.from, range.to); },
    async balanceSheet(asOf) { const rows = balanceSheetOf(finLines(), asOf); return { rows, totals: balanceSheetTotals(rows) }; },
    async cashFlow(range) { return cashFlowOf(finLines(), range.from, range.to); },
    async payablesAging(asOf) {
      return pInvoices.filter((i) => (i.status === 'open' || i.status === 'partially_paid') && i.invoiceDate <= asOf)
        .map((i) => ({ ...(i.supplierId ? { supplierId: i.supplierId } : {}), supplierName: supplierName(i.supplierId), invoiceId: i.id, number: i.number, ...(i.dueDate ? { dueDate: i.dueDate } : {}),
          outstanding: invoiceOutstanding(i.total, i.paidTotal), daysOverdue: i.dueDate ? Math.max(0, daysBetween(i.dueDate, asOf)) : 0 }))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
    },
    async listEmployees() { return employees.filter((e) => e.isActive).map(({ pin: _pin, isActive: _a, ...e }) => e); },
    async listManagedEmployees() {
      return employees.map(({ pin, ...e }) => {
        const custom = e.roleId ? customRoles.find((r) => r.id === e.roleId) : undefined;
        return {
          ...e,
          roleName: custom ? custom.name : (e.role === 'manager' ? 'Manajer' : 'Kasir'),
          hasPin: !!pin || !!e.hasPin,
          isLocked: !!e.isLocked,
          lockedUntil: e.lockedUntil ?? null,
          qrId: e.qrId ?? null,
        };
      });
    },
    async setEmployeeRoleId(employeeId, roleId) {
      const e = employees.find((x) => x.id === employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      if (roleId !== null && !customRoles.some((r) => r.id === roleId)) throw new DataError('not_found', 'Peran tidak ditemukan');
      if (roleId === null) delete e.roleId; else e.roleId = roleId;
      const custom = e.roleId ? customRoles.find((r) => r.id === e.roleId) : undefined;
      const { pin: _p, ...out } = e;
      return {
        ...out,
        roleName: custom ? custom.name : (e.role === 'manager' ? 'Manajer' : 'Kasir'),
        hasPin: !!e.pin || !!e.hasPin,
        isLocked: !!e.isLocked,
        lockedUntil: e.lockedUntil ?? null,
        qrId: e.qrId ?? null,
      };
    },
    async unlockEmployeePin(employeeId: string) {
      const e = employees.find((x) => x.id === employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      e.isLocked = false;
      e.lockedUntil = null;
    },
    async saveEmployee(input: EmployeeInput) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama karyawan wajib diisi');
      if (input.role !== 'manager' && input.role !== 'cashier') throw new DataError('invalid', 'Peran tidak dikenal');
      if (employees.some((x) => x.id !== input.id && x.isActive && x.name.toLowerCase() === name.toLowerCase())) throw new DataError('invalid', `Sudah ada karyawan aktif bernama "${name}"`);
      if (input.roleId && !customRoles.some((r) => r.id === input.roleId)) throw new DataError('not_found', 'Peran tidak ditemukan');
      if (input.id) {
        const e = employees.find((x) => x.id === input.id);
        if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
        if (e.role === 'owner') throw new DataError('forbidden', 'Data pemilik hanya bisa diubah oleh pemilik');
        e.name = name;
        e.role = input.role;
        if (input.isActive !== undefined) e.isActive = input.isActive;
        if (input.roleId !== undefined) {
          if (input.roleId === null) delete e.roleId; else e.roleId = input.roleId;
        }
        if (input.qrId !== undefined) e.qrId = input.qrId ?? undefined;
        const custom = e.roleId ? customRoles.find((r) => r.id === e.roleId) : undefined;
        const { pin: _p, ...out } = e;
        return {
          ...out,
          roleName: custom ? custom.name : (e.role === 'manager' ? 'Manajer' : 'Kasir'),
          hasPin: !!e.pin || !!e.hasPin,
          isLocked: !!e.isLocked,
          lockedUntil: e.lockedUntil ?? null,
          qrId: e.qrId ?? null,
        };
      }
      const e = {
        id: newId(),
        name,
        role: input.role,
        isActive: input.isActive ?? true,
        pin: '',
        roleId: input.roleId || undefined,
        qrId: input.qrId || undefined,
        isLocked: false,
        lockedUntil: null,
      };
      employees.push(e);
      const custom = e.roleId ? customRoles.find((r) => r.id === e.roleId) : undefined;
      const { pin: _p, ...out } = e;
      return {
        ...out,
        roleName: custom ? custom.name : (e.role === 'manager' ? 'Manajer' : 'Kasir'),
        hasPin: false,
        isLocked: false,
        lockedUntil: null,
        qrId: e.qrId ?? null,
      };
    },
    async verifyPin(employeeId, pin) { return employees.some((e) => e.isActive && e.pin !== '' && e.id === employeeId && e.pin === pin); },
    async setEmployeePin(employeeId, pin) {
      if (!/^\d{6}$/.test(pin)) throw new DataError('invalid', 'PIN harus 6 digit angka');
      const e = employees.find((x) => x.id === employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      e.pin = pin;
    },
    async attendanceOpen() {
      return attendance.filter((a) => !a.clockOutAt).map((a) => ({ employeeId: a.employeeId, clockInAt: a.clockInAt }));
    },
    async attendanceClockIn(employeeId, pin, photo, _location) {
      const e = employees.find((x) => x.id === employeeId && x.isActive);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      if (e.pin === '' || e.pin !== pin) throw new DataError('bad_pin', 'PIN salah');
      if (attendance.some((a) => a.employeeId === employeeId && !a.clockOutAt)) throw new DataError('invalid', 'Karyawan ini sudah clock in');
      const bad = photo ? photoProblem(photo) : null;
      if (bad) throw new DataError('invalid', bad);
      const rec: AttendanceRecord = {
        id: newId(), employeeId, employeeName: e.name, outletId: CTX.outletId, clockInAt: now().toISOString(), edited: false,
        ...(photo ? { clockInPhotoUrl: bytesToDataUri(photo) } : {}),
      };
      attendance.push(rec);
      return { id: rec.id, clockInAt: rec.clockInAt };
    },
    async attendanceClockOut(employeeId, pin, photo) {
      const e = employees.find((x) => x.id === employeeId && x.isActive);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      if (e.pin === '' || e.pin !== pin) throw new DataError('bad_pin', 'PIN salah');
      const rec = attendance.find((a) => a.employeeId === employeeId && !a.clockOutAt);
      if (!rec) throw new DataError('invalid', 'Karyawan ini belum clock in');
      const bad = photo ? photoProblem(photo) : null;
      if (bad) throw new DataError('invalid', bad);
      rec.clockOutAt = new Date(Math.max(now().getTime(), Date.parse(rec.clockInAt))).toISOString();
      if (photo) rec.clockOutPhotoUrl = bytesToDataUri(photo);
      return { id: rec.id, clockInAt: rec.clockInAt, clockOutAt: rec.clockOutAt };
    },
    async listAttendance(range: SalesRange, employeeId?: string) {
      return clone(attendance
        .filter((a) => a.clockInAt >= range.from && a.clockInAt < range.to && (!employeeId || a.employeeId === employeeId))
        .sort((x, y) => (x.clockInAt < y.clockInAt ? 1 : -1))
        .map((a) => ({ ...a, minutes: attendanceMinutes(a.clockInAt, a.clockOutAt) })));
    },
    async saveAttendance(input: AttendanceInput) {
      const problem = attendanceProblem(input, now());
      if (problem) throw new DataError('invalid', problem);
      const e = employees.find((x) => x.id === input.employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const open = !input.clockOutAt;
      if (open && attendance.some((a) => a.employeeId === input.employeeId && !a.clockOutAt && a.id !== input.id)) {
        throw new DataError('invalid', 'Karyawan ini masih punya catatan yang belum clock out');
      }
      const note = (input.note ?? '').trim().slice(0, 300) || undefined;
      let rec = input.id ? attendance.find((a) => a.id === input.id) : undefined;
      if (input.id && !rec) throw new DataError('not_found', 'Catatan absensi tidak ditemukan');
      if (!rec) { rec = { id: newId(), employeeId: e.id, employeeName: e.name, outletId: CTX.outletId, clockInAt: input.clockInAt, edited: true }; attendance.push(rec); }
      rec.employeeId = e.id; rec.employeeName = e.name; rec.clockInAt = new Date(input.clockInAt).toISOString();
      if (input.clockOutAt) rec.clockOutAt = new Date(input.clockOutAt).toISOString(); else delete rec.clockOutAt;
      if (note) rec.note = note; else delete rec.note;
      rec.edited = true;
      return clone({ ...rec, minutes: attendanceMinutes(rec.clockInAt, rec.clockOutAt) });
    },
    async deleteAttendance(id) {
      const i = attendance.findIndex((a) => a.id === id);
      if (i < 0) throw new DataError('not_found', 'Catatan absensi tidak ditemukan');
      attendance.splice(i, 1);
    },
    // ---------- payroll ----------
    async listCompensation() {
      return employees.filter((e) => e.isActive).map((e) => {
        const c = compensation.get(e.id);
        return { employeeId: e.id, employeeName: e.name, status: c?.status ?? 'permanent', basicSalary: c?.basicSalary ?? 0, mealAllowance: c?.mealAllowance ?? 0, bpjsAllowance: c?.bpjsAllowance ?? 0, cashAdvanceInstallment: c?.cashAdvanceInstallment ?? 0 } as EmployeeCompensation;
      });
    },
    async saveCompensation(input) {
      const e = employees.find((x) => x.id === input.employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const problem = compensationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      compensation.set(e.id, { ...input });
      return { ...input, employeeName: e.name };
    },
    async listSchedules() { return clone(Object.fromEntries(schedules)); },
    async saveSchedule(employeeId, schedule) {
      if (!employees.some((x) => x.id === employeeId)) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const problem = scheduleProblem(schedule);
      if (problem) throw new DataError('invalid', problem);
      if (schedule.length === 0) schedules.delete(employeeId); else schedules.set(employeeId, clone(schedule));
    },
    async getPayrollRules() { return mergePayrollRules(payrollRules); },
    async savePayrollRules(rules) {
      const problem = payrollRulesProblem(rules);
      if (problem) throw new DataError('invalid', problem);
      payrollRules = { ...rules };
      return mergePayrollRules(payrollRules);
    },
    async listIncidents(range, employeeId) {
      return clone(incidents.filter((x) => x.date >= range.from && x.date <= range.to && (!employeeId || x.employeeId === employeeId))
        .sort((a, b) => (a.date < b.date ? 1 : -1)));
    },
    async saveIncident(input) {
      const problem = incidentProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const e = employees.find((x) => x.id === input.employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const row: EmployeeIncident = { id: input.id ?? newId(), employeeId: e.id, employeeName: e.name, date: input.date, kind: input.kind, count: input.count ?? 1, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
      const i = incidents.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Catatan tidak ditemukan');
      if (i >= 0) incidents[i] = row; else incidents.push(row);
      return clone(row);
    },
    async deleteIncident(id) {
      const i = incidents.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Catatan tidak ditemukan');
      incidents.splice(i, 1);
    },
    async listPurchasePriceMappings() { return clone(purchasePriceMaps); },
    async setPurchasePriceMapping(input) {
      const problem = purchasePriceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (!stockBal(input.productId)) throw new DataError('not_found', 'Barang tidak ditemukan atau stoknya tidak dilacak');
      const i = purchasePriceMaps.findIndex((m) => m.productId === input.productId);
      const row: PurchasePriceMapping = input.mode === 'manual'
        ? { productId: input.productId, mode: 'manual', manualPrice: input.price as number, ...(input.unitId ? { manualUnitId: input.unitId } : {}) }
        : { productId: input.productId, mode: 'last' };
      if (i >= 0) purchasePriceMaps[i] = row; else purchasePriceMaps.push(row);
      return clone(row);
    },
    async suggestPurchasePrice(productId) {
      const summaries = await self.listPurchaseInvoices();
      const full: PurchaseInvoice[] = [];
      for (const s of summaries) { const inv = await self.getPurchaseInvoice(s.id); if (inv) full.push(inv); }
      return pickSuggestion(purchasePriceMaps.find((m) => m.productId === productId), full, productId);
    },
    async listStockRequests(q) { return clone(stockRequests.filter((r) => !q?.status || r.status === q.status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))); },
    async createStockRequest(input) {
      const problem = stockRequestProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const id = input.id ?? newId();
      const dup = stockRequests.find((r) => r.id === id);
      if (dup) return clone(dup);
      if (!locNames[input.requesterId] || !locNames[input.sourceId]) throw new DataError('not_found', 'Lokasi tidak ditemukan.');
      const lines = input.lines.map((l) => {
        const b = stockBal(l.productId);
        if (!b) throw new DataError('invalid', 'Ada barang yang stoknya tidak dilacak.');
        return { productId: l.productId, name: b.name, qty: l.qty };
      });
      const row: StockRequest = { id, number: `REQ-${String(stockRequests.length + 1).padStart(6, '0')}`, status: 'requested', requesterId: input.requesterId, requesterName: locNames[input.requesterId]!, sourceId: input.sourceId, sourceName: locNames[input.sourceId]!, createdAt: now().toISOString(), lines, ...(input.note?.trim() ? { note: input.note.trim() } : {}) };
      stockRequests.push(row);
      return clone(row);
    },
    async decideStockRequest(id, approve, note) {
      const r = stockRequests.find((x) => x.id === id);
      if (!r) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      if (r.status !== 'requested') throw new DataError('invalid', 'Permintaan ini sudah diputuskan');
      r.status = approve ? 'approved' : 'rejected';
      if (note?.trim()) r.decisionNote = note.trim();
      return clone(r);
    },
    async fulfillStockRequest(id) {
      const r = stockRequests.find((x) => x.id === id);
      if (!r) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      if (r.status !== 'approved') throw new DataError('invalid', 'Permintaan harus disetujui dulu');
      const transferId = newId();
      await self.createStockTransfer({ id: transferId, fromId: r.sourceId, toId: r.requesterId, note: `Permintaan ${r.number}`, lines: r.lines.map((l) => ({ productId: l.productId, qty: l.qty })) });
      r.status = 'fulfilled'; r.transferId = transferId;
      return clone(r);
    },
    async cancelStockRequest(id) {
      const r = stockRequests.find((x) => x.id === id);
      if (!r) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      if (r.status !== 'requested' && r.status !== 'approved') throw new DataError('invalid', 'Permintaan ini sudah diputuskan');
      r.status = 'cancelled';
      return clone(r);
    },
    async listRecurringBills(q) { return clone(recurringBills.filter((b) => q?.includeInactive || b.isActive).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))); },
    async saveRecurringBill(input) {
      const problem = recurringBillProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const row: RecurringBill = { id: input.id ?? newId(), name: input.name.trim(), amount: input.amount, frequency: input.frequency, nextDue: input.nextDue, expenseAccountId: input.expenseAccountId, isActive: input.isActive ?? true, ...(input.supplierId ? { supplierId: input.supplierId } : {}), ...(input.outletId ? { outletId: input.outletId } : {}), ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
      const i = recurringBills.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Tagihan tidak ditemukan');
      if (i >= 0) recurringBills[i] = row; else recurringBills.push(row);
      return clone(row);
    },
    async deleteRecurringBill(id) {
      const i = recurringBills.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Tagihan tidak ditemukan');
      recurringBills.splice(i, 1);
      for (let k = recurringRuns.length - 1; k >= 0; k--) if (recurringRuns[k]!.billId === id) recurringRuns.splice(k, 1);
    },
    async payRecurringBill(billId, payAccountId, date) {
      const b = recurringBills.find((x) => x.id === billId);
      if (!b) throw new DataError('not_found', 'Tagihan tidak ditemukan');
      if (!b.isActive) throw new DataError('invalid', 'Tagihan ini nonaktif');
      if (!payAccountId) throw new DataError('invalid', 'Pilih akun kas/bank pembayar');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDateString(now())) throw new DataError('invalid', 'Tanggal bayar tidak valid atau di masa depan');
      recurringRuns.push({ billId: b.id, dueDate: b.nextDue, paidOn: date, amount: b.amount });
      b.nextDue = nextDueAfter(b.nextDue, b.frequency);
      return clone(b);
    },
    async listRecurringBillRuns(billId) { return clone(recurringRuns.filter((r) => !billId || r.billId === billId).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))); },
    async listApprovals(q) { return clone(approvals.filter((a) => !q?.status || a.status === q.status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))); },
    async requestApproval(input) {
      const problem = approvalProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const id = input.id ?? newId();
      const existing = approvals.find((x) => x.id === id);
      if (existing) return clone(existing);
      const row: ApprovalRequest = { id, kind: input.kind, title: input.title.trim(), amount: input.amount, status: 'pending', requestedBy: 'demo', createdAt: now().toISOString(), ...(input.refType ? { refType: input.refType } : {}), ...(input.refId ? { refId: input.refId } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}) };
      approvals.push(row);
      return clone(row);
    },
    async decideApproval(id, approve, note) {
      const a = approvals.find((x) => x.id === id);
      if (!a) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      if (a.status !== 'pending') throw new DataError('invalid', 'Permintaan ini sudah diputuskan');
      a.status = approve ? 'approved' : 'rejected'; a.decidedBy = 'demo'; a.decidedAt = now().toISOString();
      if (note?.trim()) a.decisionNote = note.trim();
      return clone(a);
    },
    async cancelApproval(id) {
      const a = approvals.find((x) => x.id === id);
      if (!a) throw new DataError('not_found', 'Permintaan tidak ditemukan');
      if (a.status !== 'pending') throw new DataError('invalid', 'Permintaan ini sudah diputuskan');
      a.status = 'cancelled'; a.decidedBy = 'demo'; a.decidedAt = now().toISOString();
      return clone(a);
    },
    async listFixedAssets() { return clone([...fixedAssets].sort((a, b) => (a.acquiredOn < b.acquiredOn ? 1 : -1))); },
    async listAssetDepreciations(assetId) { return clone(assetDepreciations.filter((x) => !assetId || x.assetId === assetId).sort((a, b) => (a.period < b.period ? 1 : -1))); },
    async saveFixedAsset(input) {
      const problem = fixedAssetProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const id = input.id ?? newId();
      const existing = fixedAssets.find((x) => x.id === id);
      if (existing) return clone(existing);
      const row: FixedAsset = { id, name: input.name.trim(), acquiredOn: input.acquiredOn, cost: input.cost, salvageValue: input.salvageValue, usefulLifeMonths: input.usefulLifeMonths, status: 'active', accumulatedDepreciation: 0, bookValue: input.cost, monthsDepreciated: 0, ...(input.outletId ? { outletId: input.outletId } : {}) };
      fixedAssets.push(row);
      return clone(row);
    },
    async depreciateFixedAssets(period) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new DataError('invalid', 'Periode tidak valid');
      const month = period.slice(0, 7) + '-01';
      const thisMonth = localMonthStart(now());
      if (month > thisMonth) throw new DataError('invalid', 'Periode ini belum tiba');
      let assets = 0; let total = 0;
      for (const a of fixedAssets) {
        if (a.status !== 'active' || firstDepreciationPeriod(a.acquiredOn) > month) continue;
        if (assetDepreciations.some((x) => x.assetId === a.id && x.period === month)) continue;
        const step = depreciationSchedule(a)[a.monthsDepreciated];
        if (!step) continue;
        assetDepreciations.push({ assetId: a.id, period: month, amount: step.amount });
        a.monthsDepreciated += 1;
        a.accumulatedDepreciation = Math.round((a.accumulatedDepreciation + step.amount) * 100) / 100;
        a.bookValue = Math.round((a.cost - a.accumulatedDepreciation) * 100) / 100;
        assets += 1; total = Math.round((total + step.amount) * 100) / 100;
      }
      return { period: month, assets, total };
    },
    async disposeFixedAsset(input) {
      const a = fixedAssets.find((x) => x.id === input.assetId);
      if (!a) throw new DataError('not_found', 'Aset tidak ditemukan');
      const problem = disposalProblem(a, input, localDateString(now()));
      if (problem) throw new DataError('invalid', problem);
      void disposalGainLoss(a, input.proceeds);
      a.status = 'disposed';
      return clone(a);
    },
    async listJobLevels() { return clone([...jobLevels].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))); },
    async saveJobLevel(input) {
      const problem = jobLevelProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if (hrNameTaken(input.name, jobLevels, input.id)) throw new DataError('invalid', 'Nama jabatan ini sudah dipakai.');
      const row: JobLevel = { id: input.id ?? newId(), name: input.name.trim(), rank: input.rank ?? 0 };
      const i = jobLevels.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Jabatan tidak ditemukan');
      if (i >= 0) jobLevels[i] = row; else jobLevels.push(row);
      return clone(row);
    },
    async deleteJobLevel(id) {
      const i = jobLevels.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Jabatan tidak ditemukan');
      jobLevels.splice(i, 1);
      for (const h of employeeHr) if (h.jobLevelId === id) delete h.jobLevelId;
    },
    async listOrgUnits() { return clone([...orgUnits].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveOrgUnit(input) {
      const problem = orgUnitProblem(input, orgUnits);
      if (problem) throw new DataError('invalid', problem);
      if (hrNameTaken(input.name, orgUnits, input.id)) throw new DataError('invalid', 'Nama unit ini sudah dipakai.');
      const row: OrgUnit = { id: input.id ?? newId(), name: input.name.trim(), ...(input.parentId ? { parentId: input.parentId } : {}) };
      const i = orgUnits.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Unit tidak ditemukan');
      if (i >= 0) orgUnits[i] = row; else orgUnits.push(row);
      return clone(row);
    },
    async deleteOrgUnit(id) {
      const i = orgUnits.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Unit tidak ditemukan');
      orgUnits.splice(i, 1);
      for (const u of orgUnits) if (u.parentId === id) delete u.parentId;
      for (const h of employeeHr) if (h.orgUnitId === id) delete h.orgUnitId;
    },
    async listEmployeeTypes() { return clone([...employeeTypes].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveEmployeeType(input) {
      const problem = hrNameProblem(input.name);
      if (problem) throw new DataError('invalid', problem);
      if (hrNameTaken(input.name, employeeTypes, input.id)) throw new DataError('invalid', 'Nama tipe karyawan ini sudah dipakai.');
      const row: EmployeeType = { id: input.id ?? newId(), name: input.name.trim() };
      const i = employeeTypes.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Tipe karyawan tidak ditemukan');
      if (i >= 0) employeeTypes[i] = row; else employeeTypes.push(row);
      return clone(row);
    },
    async deleteEmployeeType(id) {
      const i = employeeTypes.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Tipe karyawan tidak ditemukan');
      employeeTypes.splice(i, 1);
      for (const h of employeeHr) if (h.employeeTypeId === id) delete h.employeeTypeId;
    },
    async listEmployeeHr() { return clone(employeeHr); },
    async saveEmployeeHr(input) {
      if (!employees.some((x) => x.id === input.employeeId)) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      if (input.jobLevelId && !jobLevels.some((x) => x.id === input.jobLevelId)) throw new DataError('not_found', 'Jabatan tidak ditemukan');
      if (input.orgUnitId && !orgUnits.some((x) => x.id === input.orgUnitId)) throw new DataError('not_found', 'Unit tidak ditemukan');
      if (input.employeeTypeId && !employeeTypes.some((x) => x.id === input.employeeTypeId)) throw new DataError('not_found', 'Tipe karyawan tidak ditemukan');
      const row: EmployeeHr = { employeeId: input.employeeId, ...(input.jobLevelId ? { jobLevelId: input.jobLevelId } : {}), ...(input.orgUnitId ? { orgUnitId: input.orgUnitId } : {}), ...(input.employeeTypeId ? { employeeTypeId: input.employeeTypeId } : {}) };
      const i = employeeHr.findIndex((x) => x.employeeId === input.employeeId);
      if (i >= 0) employeeHr[i] = row; else employeeHr.push(row);
      return clone(row);
    },
    async listAttendanceSettings() { return clone(attendanceSettings); },
    async saveAttendanceSettings(input) {
      const problem = attendanceSettingsProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const row: AttendanceSettings = { outletId: input.outletId, mode: input.mode, requirePhoto: input.requirePhoto, ...(input.latitude !== null && input.longitude !== null ? { latitude: input.latitude, longitude: input.longitude } : {}), ...(input.radiusM !== null ? { radiusM: input.radiusM } : {}) };
      const i = attendanceSettings.findIndex((x) => x.outletId === input.outletId);
      if (i >= 0) attendanceSettings[i] = row; else attendanceSettings.push(row);
      return clone(row);
    },
    async listNotifications() { return clone([...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))); },
    async sendNotification(input) {
      const problem = notificationProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const e = input.employeeId ? employees.find((x) => x.id === input.employeeId) : undefined;
      if (input.employeeId && !e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const row: EmployeeNotification = { id: newId(), title: input.title.trim(), body: input.body.trim(), createdAt: now().toISOString(), ...(e ? { employeeId: e.id, employeeName: e.name } : {}) };
      notifications.push(row);
      return clone(row);
    },
    async deleteNotification(id) {
      const i = notifications.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Notifikasi tidak ditemukan');
      notifications.splice(i, 1);
    },
    async listAppointments(range) {
      return clone(
        appointments
          .filter((a) => {
            if (range?.from && a.date < range.from) return false;
            if (range?.to && a.date > range.to) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return a.startTime < b.startTime ? -1 : 1;
          }),
      );
    },
    async saveAppointment(input: AppointmentInput) {
      const problem = appointmentProblem(input, appointments);
      if (problem) throw new DataError('invalid', problem);
      const row: Appointment = {
        id: input.id ?? newId(),
        kind: input.kind,
        ...(input.targetId ? { targetId: input.targetId } : {}),
        targetName: input.targetName.trim(),
        ...(input.customerId ? { customerId: input.customerId } : {}),
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        startAt: `${input.date}T${input.startTime}`,
        endAt: `${input.date}T${input.endTime}`,
        status: input.status ?? 'pending',
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        createdAt: now().toISOString(),
      };
      const idx = appointments.findIndex((a) => a.id === row.id);
      if (idx >= 0) {
        row.createdAt = appointments[idx]!.createdAt;
        appointments[idx] = row;
      } else {
        appointments.push(row);
      }
      return clone(row);
    },
    async deleteAppointment(id: string) {
      const idx = appointments.findIndex((a) => a.id === id);
      if (idx < 0) throw new DataError('not_found', 'Reservasi tidak ditemukan');
      appointments.splice(idx, 1);
    },
    async listDepositPackages() {
      return clone(depositPackages);
    },
    async saveDepositPackage(input) {
      const problem = depositPackageProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const row: DepositPackage = {
        id: input.id ?? newId(),
        name: input.name.trim(),
        creditAmount: input.creditAmount,
        salePrice: input.salePrice,
        isActive: input.isActive ?? true,
        soldCount: 0,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      };
      const idx = depositPackages.findIndex((p) => p.id === row.id);
      if (idx >= 0) {
        row.soldCount = depositPackages[idx]!.soldCount;
        depositPackages[idx] = row;
      } else {
        depositPackages.push(row);
      }
      return clone(row);
    },
    async deleteDepositPackage(id) {
      const idx = depositPackages.findIndex((p) => p.id === id);
      if (idx < 0) throw new DataError('not_found', 'Paket deposit tidak ditemukan');
      if (!canDeleteDepositPackage(depositPackages[idx]!)) {
        throw new DataError('forbidden', 'Paket deposit yang pernah terjual tidak dapat dihapus');
      }
      depositPackages.splice(idx, 1);
    },
    async buyDepositPackage(input) {
      const pkg = depositPackages.find((p) => p.id === input.packageId);
      if (!pkg) throw new DataError('not_found', 'Paket deposit tidak ditemukan');
      if (!pkg.isActive) throw new DataError('invalid', 'Paket deposit sedang tidak aktif');
      const cust = customers.find((c) => c.id === input.customerId);
      if (!cust) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
      pkg.soldCount += 1;
      const occurredAt = now().toISOString();
      const orderNumber = `DEP/${localDateKey(now(), CTX.timezone).slice(2, 4)}${localDateKey(now(), CTX.timezone).slice(5, 7)}/${String(depositSales.length + 1).padStart(4, '0')}`;
      const sale: DepositSaleRecord = {
        id: newId(),
        occurredAt,
        customerName: cust.name,
        packageName: pkg.name,
        salePrice: pkg.salePrice,
        creditAmount: pkg.creditAmount,
        methodName: input.paymentMethod ?? 'Tunai',
        orderNumber,
      };
      depositSales.unshift(sale);
      const cur = customerDepositBalances.get(cust.id) ?? { purchased: 0, used: 0, refunded: 0 };
      cur.purchased += pkg.creditAmount;
      cur.lastAt = occurredAt;
      customerDepositBalances.set(cust.id, cur);

      const cashAcc = accounts.find((a) => a.systemKey === 'cash_main') ?? accounts.find((a) => a.code === '1-1100');
      const depAcc = accounts.find((a) => a.systemKey === 'customer_deposit') ?? accounts.find((a) => a.code === '2-1300');
      if (cashAcc && depAcc) {
        storeEntry(
          localDateString(now()),
          `Pembelian paket deposit ${pkg.name} oleh ${cust.name}`,
          'deposit',
          sale.id,
          'DEP',
          [
            { accountId: cashAcc.id, debit: pkg.salePrice, credit: 0, memo: `Kas masuk ${cust.name}` },
            { accountId: depAcc.id, debit: 0, credit: pkg.salePrice, memo: `Deposit ${cust.name}` },
          ],
        );
      }
      return clone(sale);
    },
    async listDepositSales(range) {
      return clone(
        depositSales.filter((s) => {
          if (range?.from && s.occurredAt < range.from) return false;
          if (range?.to && s.occurredAt >= range.to) return false;
          return true;
        }),
      );
    },
    async listDepositRefunds(range) {
      return clone(
        depositRefunds.filter((r) => {
          if (range?.from && r.occurredAt < range.from) return false;
          if (range?.to && r.occurredAt >= range.to) return false;
          return true;
        }),
      );
    },
    async listCashAdvances(employeeId) {
      return clone(cashAdvances.filter((x) => !employeeId || x.employeeId === employeeId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    },
    async saveCashAdvance(input) {
      const problem = cashAdvanceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const e = employees.find((x) => x.id === input.employeeId);
      if (!e) throw new DataError('not_found', 'Karyawan tidak ditemukan');
      const row: CashAdvance = { id: input.id ?? newId(), employeeId: e.id, employeeName: e.name, kind: input.kind, amount: input.amount, date: input.date, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
      const i = cashAdvances.findIndex((x) => x.id === row.id);
      if (input.id && i < 0) throw new DataError('not_found', 'Catatan kasbon tidak ditemukan');
      if (i >= 0) {
        if (cashAdvances[i]!.kind === 'PAYMENT_PAYROLL') throw new DataError('forbidden', 'Potong gaji dicatat otomatis dan tidak bisa diubah.');
        cashAdvances[i] = row;
      } else cashAdvances.push(row);
      return clone(row);
    },
    async deleteCashAdvance(id) {
      const i = cashAdvances.findIndex((x) => x.id === id);
      if (i < 0) throw new DataError('not_found', 'Catatan kasbon tidak ditemukan');
      if (cashAdvances[i]!.kind === 'PAYMENT_PAYROLL') throw new DataError('forbidden', 'Potong gaji dicatat otomatis dan tidak bisa dihapus.');
      cashAdvances.splice(i, 1);
    },
    async listPayroll(month, year) { return clone(payrollRecords.filter((x) => x.month === month && x.year === year)); },
    async listPayrollYear(year) { return clone(payrollRecords.filter((x) => x.year === year)); },
    async savePayrollPeriod(month, year, rows, lock) {
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) throw new DataError('invalid', 'Periode tidak valid');
      if (payrollRecords.some((x) => x.month === month && x.year === year && x.status === 'PAID')) throw new DataError('order_locked', 'Periode ini sudah dikunci. Buka kunci dulu untuk mengubahnya.');
      const period = `${String(month).padStart(2, '0')}/${year}`;
      for (const r of rows) {
        if (!employees.some((e) => e.id === r.employeeId)) throw new DataError('not_found', 'Karyawan tidak ditemukan');
        const calc = r.basicSalary + r.mealAllowance - r.bpjsAllowance + r.latenessBonus - r.latenessPenalty - r.absencePenalty - r.operationalPenalty
          + r.stockanIncentive + r.deepCleaningIncentive - r.stockOpnamePenalty - r.cashAdvanceDeduction + r.commission;
        if (calc !== r.netSalary) throw new DataError('invalid', 'Gaji bersih tidak cocok dengan komponennya.');
        if (lock && r.cashAdvanceDeduction > (cashAdvanceBalances(cashAdvances)[r.employeeId] ?? 0)) {
          throw new DataError('invalid', 'Potongan kasbon melebihi saldo.');
        }
      }
      for (const r of rows) {
        const e = employees.find((x) => x.id === r.employeeId)!;
        const rec: PayrollRecord = { ...r, id: payrollRecords.find((x) => x.employeeId === r.employeeId && x.month === month && x.year === year)?.id ?? newId(), employeeName: e.name, month, year, status: lock ? 'PAID' : 'DRAFT', ...(lock ? { paidAt: now().toISOString() } : {}) };
        const i = payrollRecords.findIndex((x) => x.employeeId === r.employeeId && x.month === month && x.year === year);
        if (i >= 0) payrollRecords[i] = rec; else payrollRecords.push(rec);
        cashAdvances = cashAdvances.filter((c) => !(c.employeeId === r.employeeId && c.kind === 'PAYMENT_PAYROLL' && c.payrollPeriod === period));
        if (lock && r.cashAdvanceDeduction > 0) cashAdvances.push({ id: newId(), employeeId: e.id, employeeName: e.name, kind: 'PAYMENT_PAYROLL', amount: r.cashAdvanceDeduction, date: now().toISOString().slice(0, 10), notes: `Potong gaji ${period}`, payrollPeriod: period });
      }
    },
    async unlockPayroll(month, year) {
      const period = `${String(month).padStart(2, '0')}/${year}`;
      let n = 0;
      for (const x of payrollRecords) if (x.month === month && x.year === year && x.status === 'PAID') { x.status = 'DRAFT'; delete x.paidAt; n++; }
      cashAdvances = cashAdvances.filter((c) => !(c.kind === 'PAYMENT_PAYROLL' && c.payrollPeriod === period));
      return n;
    },
    async listRoles() { return clone(customRoles); },
    async saveRolePermissions(role) {
      if (isBuiltInRole(role)) throw new DataError('forbidden', 'Peran bawaan tidak bisa diubah. Duplikasi dulu menjadi peran kustom.');
      const problem = roleSaveProblem(role) ?? validateRoleName(role.name, customRoles, role.id);
      if (problem) throw new DataError('invalid', problem);
      const saved: RoleDefinition = { ...clone(role), name: role.name.trim(), isBuiltIn: false, id: role.id || newId() };
      const i = customRoles.findIndex((x) => x.id === saved.id);
      if (i >= 0) customRoles[i] = saved; else customRoles.push(saved);
      return clone(saved);
    },
    async deleteRole(roleId) {
      if (isBuiltInRole(roleId)) throw new DataError('forbidden', 'Peran bawaan tidak bisa dihapus.');
      const i = customRoles.findIndex((x) => x.id === roleId);
      if (i < 0) throw new DataError('not_found', 'Peran tidak ditemukan.');
      customRoles.splice(i, 1);
      for (const e of employees) if (e.roleId === roleId) delete e.roleId;
    },
    async listPaymentMethods() { return clone(paymentMethods.filter((m) => m.isActive !== false)); },
    async listPaymentMethodConfigs() {
      return clone(paymentConfigs);
    },
    async savePaymentMethodConfig(input) {
      const cleanName = input.name.trim();
      const cleanCode = input.code.trim().toUpperCase();
      const problem = paymentMethodProblem(
        {
          name: cleanName,
          code: cleanCode,
          channel: input.channel,
          feePct: input.feePct,
          feeFixed: input.feeFixed,
          accountNumber: input.accountNumber,
          settlementNote: input.settlementNote,
        },
        paymentConfigs,
        input.id
      );
      if (problem) throw new DataError('invalid', problem);

      const isGateway = input.code === 'QRIS' || input.channel === 'qris';
      const active = isGateway ? false : input.isActive;
      const existingIdx = input.id ? paymentConfigs.findIndex((c) => c.id === input.id) : paymentConfigs.findIndex((c) => c.code === cleanCode);

      let saved: PaymentMethodConfig;
      if (existingIdx >= 0) {
        const prev = paymentConfigs[existingIdx]!;
        saved = {
          ...prev,
          name: cleanName,
          code: cleanCode,
          channel: input.channel,
          isActive: active,
          feePct: Number(input.feePct.toFixed(2)),
          feeFixed: Math.round(input.feeFixed),
          accountName: input.accountName?.trim() || undefined,
          accountNumber: input.accountNumber?.trim() || undefined,
          settlementNote: input.settlementNote?.trim() || undefined,
        };
        paymentConfigs[existingIdx] = saved;

        const pm = paymentMethods.find((m) => m.id === prev.id || m.code === prev.code);
        if (pm) {
          pm.name = cleanName;
          pm.isActive = active;
        }
      } else {
        const newMethodId = input.id || `pm-${newId()}`;
        saved = {
          id: newMethodId,
          code: cleanCode,
          name: cleanName,
          channel: input.channel,
          baseKind: 'noncash',
          isActive: active,
          feePct: Number(input.feePct.toFixed(2)),
          feeFixed: Math.round(input.feeFixed),
          accountName: input.accountName?.trim() || undefined,
          accountNumber: input.accountNumber?.trim() || undefined,
          settlementNote: input.settlementNote?.trim() || undefined,
          requiresOnline: false,
          isBuiltIn: false,
        };
        paymentConfigs.push(saved);
        paymentMethods.push({
          id: newMethodId,
          code: cleanCode,
          name: cleanName,
          kind: 'noncash',
          requiresOnline: false,
          isActive: active,
        });
      }
      return clone(saved);
    },
    async deletePaymentMethodConfig(id: string) {
      const idx = paymentConfigs.findIndex((c) => c.id === id);
      if (idx < 0) throw new DataError('not_found', 'Metode pembayaran tidak ditemukan');
      if (paymentConfigs[idx]!.isBuiltIn) {
        throw new DataError('forbidden', 'Metode pembayaran bawaan tidak dapat dihapus');
      }
      const [removed] = paymentConfigs.splice(idx, 1);
      const mIdx = paymentMethods.findIndex((m) => m.id === id || (removed && m.code === removed.code));
      if (mIdx >= 0) {
        paymentMethods.splice(mIdx, 1);
      }
    },
    async togglePaymentMethodActive(id: string, isActive: boolean) {
      const cfg = paymentConfigs.find((c) => c.id === id);
      if (!cfg) throw new DataError('not_found', 'Metode pembayaran tidak ditemukan');
      if (cfg.baseKind === 'gateway') {
        cfg.isActive = false;
        return;
      }
      cfg.isActive = isActive;
      const pm = paymentMethods.find((m) => m.id === id || m.code === cfg.code);
      if (pm) {
        pm.isActive = isActive;
      }
    },

    async currentShift() { return clone(shifts.find((s) => s.status === 'open') ?? null); },
    async openShift({ id, cashierId, openingCash }) {
      if (shifts.some((s) => s.status === 'open')) throw new DataError('shift_already_open', 'Masih ada shift yang terbuka di perangkat ini');
      if (openingCash < 0) throw new DataError('bad_amount', 'Modal awal tidak boleh negatif');
      const s: Shift = { id, cashierId, openedAt: now().toISOString(), openingCash: Math.round(openingCash), status: 'open' };
      shifts.push(s); return clone(s);
    },
    async closeShift({ shiftId, counted, closedBy }: { shiftId: string; counted: number; closedBy?: string }) {
      const s = shifts.find((x) => x.id === shiftId);
      if (!s) throw new DataError('not_found', 'Shift tidak ditemukan');
      if (s.status === 'closed') throw new DataError('invalid', 'Shift sudah ditutup');
      const before = shiftInputs(s);
      const r = buildShiftReport(before, Math.round(counted));
      Object.assign(s, { status: 'closed', closedAt: now().toISOString(), counted: r.counted, expectedCash: r.expectedCash, variance: r.variance });
      const isAuto = !!CTX.settings.autoReconcileNoncash;
      for (const m of r.byMethod) {
        if (m.kind === 'cash' || m.kind === 'complimentary' || m.amount <= 0) continue;
        const pMethod = METHODS.find((pm) => pm.name === m.methodName);
        const mId = pMethod?.id || `m-${m.kind}`;
        const existing = reconciliations.find((rec) => rec.shiftId === s.id && rec.methodId === mId);
        if (!existing) {
          reconciliations.push({
            id: `rec-${s.id}-${mId}`,
            outletId: CTX.outletId,
            shiftId: s.id,
            shiftNumber: `Shift #${s.id.slice(0, 6)}`,
            shiftDate: s.openedAt.slice(0, 10),
            cashierName: employees.find((e) => e.id === s.cashierId)?.name ?? 'Kasir',
            methodId: mId,
            methodName: m.methodName,
            methodKind: m.kind,
            expectedAmount: m.amount,
            actualAmount: isAuto ? m.amount : undefined,
            feeAmount: 0,
            difference: isAuto ? 0 : undefined,
            status: isAuto ? 'reconciled' : 'unreconciled',
            bankAccountId: isAuto ? 'acc-bank' : undefined,
            reconciledAt: isAuto ? now().toISOString() : undefined,
            reconciledBy: isAuto ? closedBy || 'emp-owner' : undefined,
          });
        }
      }
      return { ...r, shift: clone(s) } satisfies ShiftReport;
    },
    async listShiftReports(range) {
      return shifts.filter((s) => s.openedAt >= range.from && s.openedAt < range.to)
        .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)).slice(0, 100)
        .map((s) => clone({ ...buildShiftReport(shiftInputs(s)), cashierName: employees.find((e) => e.id === s.cashierId)?.name ?? '—' }));
    },
    async addCashMovement(input) {
      const s = shifts.find((x) => x.id === input.shiftId);
      if (!s) throw new DataError('not_found', 'Shift tidak ditemukan');
      if (s.status !== 'open') throw new DataError('invalid', 'Shift sudah ditutup');
      if (!Number.isFinite(input.amount) || input.amount <= 0) throw new DataError('bad_amount', 'Jumlah harus lebih dari 0');
      const reason = input.reason.trim();
      if (reason.length < 3) throw new DataError('invalid', 'Alasan wajib diisi (minimal 3 huruf)');
      const existing = cashMoves.find((m) => m.id === input.id);
      if (existing) return clone(existing);
      const limit = CTX.settings.cashOutDailyLimit;
      if (input.kind === 'out' && limit != null) {
        const day = now().toISOString().slice(0, 10);
        const used = cashMoves.filter((m) => m.kind === 'out' && m.occurredAt.slice(0, 10) === day).reduce((n, m) => n + m.amount, 0);
        if (used + Math.round(input.amount) > limit) throw new DataError('invalid', 'Batas kas keluar harian terlampaui.');
      }
      const m: CashMovement = { id: input.id, shiftId: input.shiftId, kind: input.kind, amount: Math.round(input.amount), reason: reason.slice(0, 120), occurredAt: now().toISOString() };
      cashMoves.push(m); return clone(m);
    },
    async listCashMovements(shiftId) { return clone(cashMoves.filter((m) => m.shiftId === shiftId)); },
    async shiftSummary(shiftId) {
      const s = shifts.find((x) => x.id === shiftId);
      if (!s) throw new DataError('not_found', 'Shift tidak ditemukan');
      return clone(buildShiftReport(shiftInputs(s)));
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
      if (draft.tableId) {
        if (!tables.some((t) => t.id === draft.tableId)) throw new DataError('not_found', 'Meja tidak ditemukan');
        const busy = orders.find((x) => x.tableId === draft.tableId && x.id !== draft.id && (x.status === 'open' || x.status === 'partially_paid'));
        if (busy) throw new DataError('invalid', `Meja ini sedang dipakai pesanan ${busy.number}`);
      }
      if (draft.customerId && !customers.some((c) => c.id === draft.customerId)) throw new DataError('not_found', 'Pelanggan tidak ditemukan');
      const calc = recompute(draft, 0);
      const items: OrderItem[] = draft.items.map((d, k) => ({ ...d, lineTotal: calc.lines[k]!.lineTotal }));
      const at = now();
      const o: Order = existing ?? {
        id: draft.id, number: formatOrderNumber(CTX.outletCode, CTX.deviceCode, at, seqFor(at), CTX.timezone), type: draft.type, tableId: draft.tableId,
        shiftId: shift?.id, cashierId, status: 'open', items, subtotal: 0, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 0, paidTotal: 0,
        payments: [], openedAt: at.toISOString(),
      };
      const rawEntries: DiscountEntry[] = fitDiscounts(draft.discounts ?? ((draft.orderDiscount ?? 0) > 0 ? [{ id: newId(), source: 'manual', label: 'Diskon manual', amount: draft.orderDiscount! }] : []), calc.discountTotal);
      for (const e of rawEntries) {
        const refErr = couponReferenceProblem(e.reference);
        if (refErr) throw new DataError('invalid', refErr);
      }
      const entries: DiscountEntry[] = rawEntries.map((e) => {
        const ref = normalizeCouponReference(e.reference);
        const { reference: _drop, ...rest } = e;
        return ref ? { ...rest, reference: ref } : rest;
      });
      const pp = pointsProblem(draft, entries);
      if (pp) throw new DataError('invalid', pp);
      Object.assign(o, { discounts: entries, type: draft.type, tableId: draft.tableId, customerId: draft.customerId, label: draft.label, guestCount: draft.guestCount, items, subtotal: calc.subtotal, discountTotal: calc.discountTotal,
        serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal, rounding: 0, total: calc.total });
      if (!existing) orders.push(o);
      return clone(named(o));
    },
    async addPayment(orderId, pay) {
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.status === 'void') throw new DataError('order_locked', 'Pesanan sudah dibatalkan');
      if (o.payments.some((p) => p.id === pay.id)) return clone(named(o));                // idempoten
      const m = method(pay.methodId);
      const refProblem = paymentRefProblem(m.kind, pay.reference);
      if (refProblem) throw new DataError('invalid', refProblem);
      // pembulatan mengikuti metode; dihitung pada pembayaran yang melunasi
      const step = m.kind === 'cash' ? CTX.settings.roundingCashStep : CTX.settings.roundingNoncashStep;
      let total = o.total, rounding = o.rounding;
      if (o.paidTotal === 0 && step) { total = roundToStep(o.total, step); rounding = total - o.total; }
      const balance = total - o.paidTotal;
      if (pay.amount <= 0 || pay.amount > balance) throw new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
      const tendered = pay.tendered ?? pay.amount;
      const change = Math.max(tendered - pay.amount, 0);                          // sama dengan server (tendered - amount)
      const at = pay.paidAt ?? now().toISOString();
      o.payments.push({ id: pay.id, methodId: m.id, methodName: m.name, kind: m.kind, amount: pay.amount, tendered, change: m.kind === 'cash' ? change : 0, paidAt: at, ...(pay.reference?.trim() ? { reference: pay.reference.trim() } : {}) });
      o.total = total; o.rounding = rounding; o.paidTotal += pay.amount;
      o.status = o.paidTotal >= o.total ? 'paid' : 'partially_paid';
      if (o.status === 'paid') {
        o.closedAt = at;
        for (const it of o.items) stockMove(it.productId, -it.qty);
        if (o.customerId) {
          const used = (o.discounts ?? []).filter((d) => d.source === 'points').reduce((n, d) => n + (d.points ?? 0), 0);
          pushPoints(o.customerId, -used, 'redeem', `Tukar poin ${o.number}`, o.id);
          pushPoints(o.customerId, earnedPoints(o.total, loyaltyRules), 'earn', `Belanja ${o.number}`, o.id);
        }
      }
      return clone(named(o));
    },
    async listPriceChanges(range: SalesRange) {
      const out: PriceChange[] = [];
      for (const o of orders) {
        if (o.openedAt < range.from || o.openedAt >= range.to) continue;
        for (const it of o.items) {
          const d = it.basePrice == null ? null : priceDelta(it.basePrice, it.unitPrice);
          if (!d) continue;
          out.push({
            orderId: o.id, orderNumber: o.number, orderStatus: o.status, itemId: it.id, itemName: it.name, qty: it.qty,
            basePrice: it.basePrice!, unitPrice: it.unitPrice, diff: d.diff, diffPct: d.diffPct, lineImpact: d.diff * it.qty,
            cashierId: o.cashierId, cashierName: employees.find((e) => e.id === o.cashierId)?.name ?? '(karyawan dihapus)',
            at: o.openedAt,
            reason: it.note ?? undefined,
          });
        }
      }
      return clone(out.sort((a, b) => (a.at < b.at ? 1 : -1)));
    },
    async listRefundsBetween(range: SalesRange) {
      return clone(refunds.filter((r) => r.createdAt >= range.from && r.createdAt < range.to).map(({ shiftId: _s, methodKind: _k, ...r }) => r));
    },
    async listRefunds(orderId) { return clone(refunds.filter((r) => r.orderId === orderId).map(({ shiftId: _s, methodKind: _k, ...r }) => r)); },
    async refundOrder(input: RefundInput) {
      const prior = refunds.find((r) => r.id === input.id);
      if (prior) { const { shiftId: _s, methodKind: _k, ...r } = prior; return clone(r); }          // idempoten
      const o = orders.find((x) => x.id === input.orderId);
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      const m = method(input.methodId);
      if (m.kind === 'gateway') throw new DataError('invalid', 'Refund ke QRIS belum diaktifkan');
      if (!input.reason.trim()) throw new DataError('invalid', 'Alasan refund wajib diisi');
      const mine = refunds.filter((r) => r.orderId === o.id);
      const problem = refundProblem(o, mine, input.items);
      if (problem) throw new DataError('bad_amount', problem);
      const lines = refundAmounts(o, input.items);
      const r = { id: input.id, number: `R${mine.length + 1}-${o.number}`, orderId: o.id, total: lines.reduce((a, x) => a + x.amount, 0), reason: input.reason.trim(), note: input.note?.trim() || undefined,
        methodName: m.name, createdAt: now().toISOString(), items: lines, shiftId: shifts.find((s) => s.status === 'open')?.id, methodKind: m.kind };
      refunds.push(r);
      if (o.customerId) {
        const earned = ledger.filter((e) => e.orderId === o.id && e.kind === 'earn').reduce((n, e) => n + e.points, 0);
        const redeemed = -ledger.filter((e) => e.orderId === o.id && e.kind === 'redeem').reduce((n, e) => n + e.points, 0);
        pushPoints(o.customerId, refundPointsDelta(earned, redeemed, r.total, o.paidTotal), 'refund_reverse', `Refund ${r.number}`, o.id);
      }
      if (input.restock) for (const l of lines) { const it = o.items.find((i) => i.id === l.orderItemId); if (it) stockMove(it.productId, l.qty); }
      const { shiftId: _s, methodKind: _k, ...out } = r; return clone(out);
    },
    async voidUnpaidOrder(orderId) {
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.paidTotal > 0 || o.status !== 'open') throw new DataError('order_locked', 'Hanya pesanan yang belum dibayar yang bisa dibatalkan; pesanan lunas lewat refund');
      o.status = 'void'; o.closedAt = now().toISOString(); return clone(named(o));
    },
    async getOrder(id) { return clone(named(orders.find((o) => o.id === id) ?? null)); },
    async listOrders(q = {}) {
      return clone(orders.map((o) => named(o))
        .filter((o) => !q.customerId || o.customerId === q.customerId)
        .filter((o) => { const t = q.by === 'closed' ? o.closedAt ?? o.openedAt : o.openedAt; return (!q.status || o.status === q.status) && (!q.from || t >= q.from) && (!q.to || t < q.to); })
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, q.all ? undefined : q.limit ?? 200));
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

    // ---------- grup pelanggan, harga grosir & jadwal harga ----------
    async listCustomerGroups() {
      return clone(customerGroups);
    },
    async saveCustomerGroup(group) {
      const name = group.name.trim();
      if (!name) throw new DataError('invalid', 'Nama grup wajib diisi');
      const id = group.id || newId();
      const existing = customerGroups.find((g) => g.id === id);
      const at = now().toISOString();
      if (existing) {
        existing.name = name;
        existing.description = group.description?.trim() ?? '';
        existing.updatedAt = at;
        return clone(existing);
      }
      const newGroup: CustomerGroup = {
        id,
        name,
        description: group.description?.trim() ?? '',
        createdAt: at,
        updatedAt: at,
      };
      customerGroups.push(newGroup);
      return clone(newGroup);
    },
    async deleteCustomerGroup(id) {
      customerGroups = customerGroups.filter((g) => g.id !== id);
      customerGroupMembers = customerGroupMembers.filter((m) => m.groupId !== id);
      tieredPrices = tieredPrices.filter((t) => t.groupId !== id);
    },
    async listCustomerGroupMembers(groupId) {
      if (groupId) return clone(customerGroupMembers.filter((m) => m.groupId === groupId));
      return clone(customerGroupMembers);
    },
    async setCustomerGroup(customerId, groupId) {
      customerGroupMembers = customerGroupMembers.filter((m) => m.customerId !== customerId);
      if (groupId) {
        customerGroupMembers.push({
          customerId,
          groupId,
          assignedAt: now().toISOString(),
        });
      }
    },
    async listTieredPrices(groupId) {
      if (groupId) return clone(tieredPrices.filter((t) => t.groupId === groupId));
      return clone(tieredPrices);
    },
    async saveTieredPrices(input) {
      const at = now().toISOString();
      const existingIdx = tieredPrices.findIndex((t) => t.groupId === input.groupId && t.productId === input.productId);
      const item: GroupProductTieredPricing = {
        groupId: input.groupId,
        productId: input.productId,
        tiers: clone(input.tiers),
        updatedAt: at,
      };
      if (existingIdx >= 0) {
        tieredPrices[existingIdx] = item;
      } else {
        tieredPrices.push(item);
      }
      return clone(item);
    },
    async deleteTieredPrices(target) {
      if (typeof target === 'string') {
        tieredPrices = tieredPrices.filter((t) => t.id !== target && `${t.groupId}:${t.productId}` !== target);
      } else {
        tieredPrices = tieredPrices.filter(
          (t) => !(target.id && t.id === target.id) && !(t.groupId === target.groupId && t.productId === target.productId)
        );
      }
    },
    async listPriceSchedules() {
      return clone(priceSchedules);
    },
    async savePriceSchedule(schedule) {
      const at = now().toISOString();
      const id = schedule.id || newId();
      const existing = priceSchedules.find((s) => s.id === id);
      if (existing) {
        existing.productId = schedule.productId;
        existing.newPrice = schedule.newPrice;
        existing.startAt = schedule.startAt;
        existing.endAt = schedule.endAt;
        existing.note = schedule.note;
        return clone(existing);
      }
      const item: PriceSchedule = {
        id,
        productId: schedule.productId,
        newPrice: schedule.newPrice,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        note: schedule.note,
        createdAt: at,
      };
      priceSchedules.push(item);
      return clone(item);
    },
    async deletePriceSchedule(id) {
      priceSchedules = priceSchedules.filter((s) => s.id !== id);
    },
    async getCustomerDeposit(customerId: string) {
      const cust = customers.find((c) => c.id === customerId);
      if (!cust) return null;
      const bal = customerDepositBalances.get(customerId);
      const purchased = bal?.purchased ?? 0;
      const used = bal?.used ?? 0;
      const refunded = bal?.refunded ?? 0;
      return {
        customerId: cust.id,
        customerName: cust.name,
        ...(cust.phone ? { customerPhone: cust.phone } : {}),
        totalDepositPurchased: purchased,
        totalDepositUsed: used,
        totalDepositRefunded: refunded,
        currentBalance: purchased - used - refunded,
        ...(bal?.lastAt ? { lastTransactionAt: bal.lastAt } : {}),
      };
    },
    async listCustomerDepositBalances() {
      const out: CustomerDepositBalance[] = [];
      for (const cust of customers) {
        const bal = customerDepositBalances.get(cust.id);
        const purchased = bal?.purchased ?? 0;
        const used = bal?.used ?? 0;
        const refunded = bal?.refunded ?? 0;
        const currentBalance = purchased - used - refunded;
        if (purchased > 0 || used > 0 || refunded > 0) {
          out.push({
            customerId: cust.id,
            customerName: cust.name,
            ...(cust.phone ? { customerPhone: cust.phone } : {}),
            totalDepositPurchased: purchased,
            totalDepositUsed: used,
            totalDepositRefunded: refunded,
            currentBalance,
            ...(bal?.lastAt ? { lastTransactionAt: bal.lastAt } : {}),
          });
        }
      }
      return clone(out);
    },
    async listCustomerDepositEntries(customerId: string) {
      return clone(
        customerDepositEntries
          .filter((e) => e.customerId === customerId)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      );
    },
    async listNonCashReconciliations(filter) {
      let list = [...reconciliations];
      if (filter?.shiftId) {
        list = list.filter((r) => r.shiftId === filter.shiftId);
      }
      if (filter?.status && filter.status !== 'all') {
        list = list.filter((r) => r.status === filter.status);
      }
      if (filter?.from && filter?.to) {
        list = list.filter((r) => {
          const d = r.shiftDate || r.reconciledAt?.slice(0, 10);
          return !d || (d >= filter.from! && d <= filter.to!);
        });
      }
      return clone(list);
    },
    async saveNonCashReconciliation(input) {
      let existing = reconciliations.find((r) =>
        (input.id && r.id === input.id) ||
        (input.shiftId && r.shiftId === input.shiftId && r.methodId === input.methodId)
      );
      const actual = Math.max(0, Math.round(input.actualAmount));
      const fee = input.feeAmount ? Math.max(0, Math.round(input.feeAmount)) : 0;
      const expected = existing ? existing.expectedAmount : actual;
      const diff = (actual + fee) - expected;
      const nowIso = now().toISOString();

      if (!existing) {
        const m = METHODS.find((p) => p.id === input.methodId);
        const s = input.shiftId ? shifts.find((x) => x.id === input.shiftId) : undefined;
        const cashier = s ? employees.find((e) => e.id === s.cashierId) : undefined;
        existing = {
          id: input.id || newId(),
          outletId: CTX.outletId,
          shiftId: input.shiftId,
          shiftNumber: s ? `Shift #${s.id.slice(0, 6)}` : undefined,
          shiftDate: s?.openedAt?.slice(0, 10) || nowIso.slice(0, 10),
          cashierName: cashier?.name || 'Kasir Demo',
          methodId: input.methodId,
          methodName: m?.name || 'Non-Tunai',
          methodKind: m?.kind || 'noncash',
          expectedAmount: expected,
          actualAmount: actual,
          feeAmount: fee,
          difference: diff,
          status: 'reconciled',
          bankAccountId: input.bankAccountId || 'acc-bank',
          reconciledAt: nowIso,
          reconciledBy: 'emp-owner',
          notes: input.notes,
        };
        reconciliations.push(existing);
      } else {
        existing.actualAmount = actual;
        existing.feeAmount = fee;
        existing.difference = diff;
        existing.status = 'reconciled';
        existing.bankAccountId = input.bankAccountId || existing.bankAccountId || 'acc-bank';
        existing.reconciledAt = nowIso;
        existing.reconciledBy = 'emp-owner';
        if (input.notes) existing.notes = input.notes;
      }

      // Jurnal rekonsiliasi non-tunai (piutang kliring -> kas/bank & biaya gateway)
      const isGateway = existing.methodKind === 'gateway';
      const clearAcc = isGateway ? 'acc-1-1300' : 'acc-1-1310';
      const lines: { accountId: string; debit: number; credit: number; memo?: string }[] = [
        { accountId: 'acc-bank', debit: actual, credit: 0, memo: `Penerimaan bank ${existing.methodName}` },
        { accountId: clearAcc, debit: 0, credit: expected, memo: `Kliring ${existing.methodName}` },
      ];
      if (fee > 0) {
        lines.push({ accountId: 'acc-6-2100', debit: fee, credit: 0, memo: `Biaya gateway/MDR ${existing.methodName}` });
      }
      if (diff < 0) {
        lines.push({ accountId: 'acc-6-2400', debit: -diff, credit: 0, memo: `Selisih rekonsiliasi ${existing.methodName}` });
      } else if (diff > 0) {
        lines.push({ accountId: 'acc-6-2400', debit: 0, credit: diff, memo: `Selisih rekonsiliasi ${existing.methodName}` });
      }
      try {
        await self.postJournal({
          id: newId(),
          date: nowIso.slice(0, 10),
          description: `Rekonsiliasi non-tunai ${existing.methodName} (${existing.shiftNumber || 'Harian'})`,
          kind: 'manual',
          lines,
        });
      } catch {
        // bila posting jurnal dilewati di mock, abaikan
      }

      return clone(existing);
    },

    async listLoyaltyProductRewards(activeOnly) {
      const list = activeOnly ? loyaltyProductRewards.filter((r) => r.isActive) : loyaltyProductRewards;
      return list.map((r) => ({
        ...clone(r),
        productName: products.find((p) => p.id === r.productId)?.name ?? r.productName,
      }));
    },

    async saveLoyaltyProductReward(reward) {
      const prob = loyaltyRewardProblem(reward);
      if (prob) throw new DataError('invalid', prob);
      const at = now().toISOString();
      const existing = loyaltyProductRewards.find(
        (r) => (reward.id && r.id === reward.id) || r.productId === reward.productId,
      );
      if (existing) {
        existing.pointsCost = reward.pointsCost;
        if (reward.isActive !== undefined) existing.isActive = reward.isActive;
        existing.updatedAt = at;
        return {
          ...clone(existing),
          productName: products.find((p) => p.id === existing.productId)?.name,
        };
      }
      const item: LoyaltyProductReward = {
        id: reward.id || newId(),
        productId: reward.productId,
        pointsCost: reward.pointsCost,
        isActive: reward.isActive ?? true,
        createdAt: at,
        updatedAt: at,
      };
      loyaltyProductRewards.push(item);
      return {
        ...clone(item),
        productName: products.find((p) => p.id === item.productId)?.name,
      };
    },

    async deleteLoyaltyProductReward(id) {
      loyaltyProductRewards = loyaltyProductRewards.filter((r) => r.id !== id);
    },
  };
  const tableOps = createTableOps({
    getOrder: (id) => self.getOrder(id), saveOrder: (d, c) => self.saveOrder(d, c),
    voidUnpaidOrder: (id, r, by) => self.voidUnpaidOrder(id, r, by), listTableStatus: () => self.listTableStatus(),
  });
  return self;
}

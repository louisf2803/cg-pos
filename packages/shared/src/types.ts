import type { CalcSettings, OrderType } from './order-calc';

export interface Department { id: string; name: string; sort: number }
export interface Category { id: string; name: string; sort: number; departmentId?: string | null }
export interface Product {
  id: string; name: string; categoryId: string | null; price: number; sku?: string;
  kind: 'goods' | 'service' | 'bundle'; trackStock: boolean; stock?: number; isActive: boolean; isFavorite: boolean;
  /** persen pajak khusus produk (mode per_product) */
  taxRate?: number; photoUrl?: string;
  /** produk induk bila ini varian ukuran (S/M/L); tidak ada untuk produk tunggal */
  parentId?: string | null;
  /** false untuk induk grup varian (tidak dijual langsung). Kosong = dijual. */
  isSellable?: boolean;
}
export interface ProductInput {
  id?: string; name: string; categoryId: string | null; price: number; sku?: string;
  kind?: 'goods' | 'service'; trackStock?: boolean; isFavorite?: boolean; isActive?: boolean;
}
/** Satu ukuran/varian dari sebuah produk (mis. Americano: S, M, L), masing-masing punya harga dan SKU sendiri. */
export interface CatalogVariant { id: string; label: string; price: number; sku?: string; isActive: boolean }
/** Produk di mata pemilik: satu baris, dengan varian di dalamnya. variants kosong = produk tunggal. */
export interface CatalogProduct {
  id: string; name: string; categoryId: string | null; kind: 'goods' | 'service'; trackStock: boolean; isActive: boolean; isFavorite: boolean;
  /** produk tunggal: harganya; produk berarian: harga varian termurah */
  price: number; sku?: string; variants: CatalogVariant[];
}
export interface CatalogInput {
  id?: string; name: string; categoryId: string | null; kind?: 'goods' | 'service'; trackStock?: boolean; isFavorite?: boolean; isActive?: boolean;
  price: number; sku?: string;
  variants: { id?: string; label: string; price: number; sku?: string; isActive?: boolean }[];
}
/** Paket: beberapa produk dijual dengan satu harga. Stok yang terpotong adalah stok komponennya. */
export interface Bundle { id: string; name: string; categoryId: string | null; price: number; sku?: string; isActive: boolean; items: { productId: string; name: string; qty: number }[] }
export interface BundleInput { id?: string; name: string; categoryId: string | null; price: number; sku?: string; isActive?: boolean; items: { productId: string; qty: number }[] }
export interface Employee { id: string; name: string; role: 'owner' | 'manager' | 'cashier' }
/** Karyawan untuk layar pengelolaan (termasuk yang nonaktif). */
export interface ManagedEmployee extends Employee { isActive: boolean }
export interface EmployeeInput { id?: string; name: string; role: 'manager' | 'cashier'; isActive?: boolean }
export interface PaymentMethod { id: string; code: string; name: string; kind: 'cash' | 'noncash' | 'gateway' | 'complimentary' | 'deposit'; requiresOnline: boolean }

export interface Shift {
  id: string; cashierId: string; openedAt: string; openingCash: number; status: 'open' | 'closed';
  closedAt?: string; counted?: number; expectedCash?: number; variance?: number;
}
export interface ShiftReport {
  shift: Shift; expectedCash: number; counted: number; variance: number;
  cashSales: number; otherSales: number; cashIn: number; cashOut: number; orderCount: number;
  productsSold: { productId: string; name: string; qty: number; amount: number }[];
}

/** Satu pilihan Ekstra yang menempel pada baris pesanan; harganya per satu unit produk. */
export interface ItemExtra { optionId: string; name: string; price: number }
export interface OrderItem { id: string; productId: string; name: string; qty: number; unitPrice: number; lineTotal: number; note?: string; extras?: ItemExtra[] }
export interface ExtraOption { id: string; name: string; price: number; sort: number }
/** Grup Ekstra (modifier): satu atau banyak pilihan, wajib atau tidak, dengan harga tambahan per pilihan. */
export interface ExtraGroup { id: string; name: string; required: boolean; mode: 'single' | 'multiple'; maxSelect: number | null; options: ExtraOption[]; productIds: string[] }
export interface ExtraGroupInput {
  id?: string; name: string; required: boolean; mode: 'single' | 'multiple'; maxSelect?: number | null;
  options: { id?: string; name: string; price: number }[]; productIds: string[];
}
export interface Payment { id: string; methodId: string; methodName: string; kind: PaymentMethod['kind']; amount: number; tendered?: number; change: number; paidAt: string }
export interface Order {
  id: string; number: string; type: OrderType; tableId?: string; label?: string; guestCount?: number; shiftId?: string; cashierId: string;
  status: 'open' | 'partially_paid' | 'paid' | 'void';
  items: OrderItem[];
  subtotal: number; discountTotal: number; serviceCharge: number; taxTotal: number; rounding: number; total: number; paidTotal: number;
  payments: Payment[]; openedAt: string; closedAt?: string;
}
export interface OrderDraft {
  id: string; type: OrderType; tableId?: string; label?: string; guestCount?: number;
  items: { id: string; productId: string; name: string; qty: number; unitPrice: number; note?: string; extras?: ItemExtra[] }[];
  orderDiscount?: number;
}
export interface Floor { id: string; name: string; sort: number }
export interface DiningTable { id: string; floorId: string | null; name: string; sort: number }
/** Meja beserta pesanan yang sedang memakainya (belum lunas dan belum dibatalkan). */
export interface TableStatus extends DiningTable {
  order?: { id: string; number: string; label?: string; guestCount?: number; total: number; openedAt: string };
}
export interface Refund {
  id: string; number: string; orderId: string; total: number; reason: string; note?: string; methodName: string; createdAt: string;
  items: { orderItemId: string; qty: number; amount: number }[];
}
export interface RefundInput {
  id: string; orderId: string; methodId: string; items: { orderItemId: string; qty: number }[];
  reason: string; note?: string; restock: boolean; authorizedBy: string;
}
export interface PaymentInput { id: string; methodId: string; amount: number; tendered?: number; paidAt?: string }

export interface SalesRange { from: string; to: string }
export interface SalesSummary {
  orderCount: number; gross: number; discounts: number; serviceCharge: number; tax: number; total: number; avgTicket: number;
  byMethod: { methodName: string; amount: number; count: number }[];
  byHour: { hour: number; total: number; count: number }[];
  topProducts: { productId: string; name: string; qty: number; amount: number }[];
}

export interface OutletContext {
  orgName: string; outletId: string; outletCode: string; outletName: string; timezone: string;
  address?: string; phone?: string; receiptFooter?: string;
  deviceCode: string; settings: CalcSettings & { roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean };
  taxes: { id: string; name: string; rate: number }[];
}

export type DataErrorCode = 'no_open_shift' | 'shift_already_open' | 'order_locked' | 'bad_amount' | 'not_found' | 'bad_pin' | 'invalid' | 'forbidden';
export class DataError extends Error {
  constructor(public code: DataErrorCode, message: string) { super(message); }
}

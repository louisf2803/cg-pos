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
  /** batas persen kasir boleh mengubah harga baris; kosong = tidak boleh */
  priceOverridePct?: number;
  /** stasiun cetak tujuan (Dapur/Bar/Label); kosong = tidak diteruskan ke dapur */
  printStationId?: string;
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
  price: number; sku?: string; variants: CatalogVariant[]; photoUrl?: string; priceOverridePct?: number; printStationId?: string;
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
/** roleId = tautan ke peran KUSTOM (tabel 0033); kosong = memakai peran bawaan dari `role`. */
export interface ManagedEmployee extends Employee { isActive: boolean; roleId?: string }
export interface EmployeeInput { id?: string; name: string; role: 'manager' | 'cashier'; isActive?: boolean }
/** Satu catatan absensi. Waktu selalu dari server. minutes = lama kerja, ada bila sudah clock out. */
export interface AttendanceRecord {
  id: string; employeeId: string; employeeName: string; outletId: string; clockInAt: string; clockOutAt?: string;
  /** tautan bertanda tangan berumur pendek ke selfie (bucket privat); hanya untuk pemilik/manajer */
  clockInPhotoUrl?: string; clockOutPhotoUrl?: string; note?: string; edited: boolean; minutes?: number;
}
/** Karyawan yang sedang clock in (belum clock out) di outlet perangkat ini. */
export interface AttendanceOpen { employeeId: string; clockInAt: string }
/** Koreksi atau tambah catatan oleh pemilik/manajer (tanpa PIN karyawan). Tanpa id = catatan baru. */
export interface AttendanceInput { id?: string; employeeId: string; clockInAt: string; clockOutAt?: string; note?: string }
export interface PaymentMethod { id: string; code: string; name: string; kind: 'cash' | 'noncash' | 'gateway' | 'complimentary' | 'deposit'; requiresOnline: boolean }

export interface Shift {
  id: string; cashierId: string; openedAt: string; openingCash: number; status: 'open' | 'closed';
  closedAt?: string; counted?: number; expectedCash?: number; variance?: number;
}
/** Kas masuk atau keluar di laci selama shift (mis. beli es batu, tambah uang kembalian). */
export interface CashMovement { id: string; shiftId: string; kind: 'in' | 'out'; amount: number; reason: string; occurredAt: string }
export interface ShiftReport {
  shift: Shift; expectedCash: number; counted: number; variance: number;
  cashSales: number; otherSales: number; cashIn: number; cashOut: number; orderCount: number;
  /** Penerimaan per metode bayar selama shift, dan refund tunai yang mengurangi kas. */
  byMethod: { methodName: string; kind: PaymentMethod['kind']; count: number; amount: number }[]; cashRefunds: number;
  productsSold: { productId: string; name: string; qty: number; amount: number }[];
}

/** Satu pilihan Ekstra yang menempel pada baris pesanan; harganya per satu unit produk. */
export interface ItemExtra { optionId: string; name: string; price: number }
export interface OrderItem { id: string; productId: string; name: string; qty: number; unitPrice: number; /** harga daftar sebelum diubah kasir; hanya ada bila harga baris diubah */ basePrice?: number; lineTotal: number; note?: string; extras?: ItemExtra[] }
/** Satu baris pesanan yang harganya diubah kasir (dasar laporan Perubahan Harga Kasir). diff dan lineImpact negatif = harga diturunkan. */
export interface PriceChange {
  orderId: string; orderNumber: string; orderStatus: Order['status']; itemId: string; itemName: string; qty: number;
  basePrice: number; unitPrice: number; diff: number; diffPct: number; lineImpact: number; cashierId: string; cashierName: string; at: string;
  reason?: string;
}
export interface ExtraOption { id: string; name: string; price: number; sort: number }
/** Grup Ekstra (modifier): satu atau banyak pilihan, wajib atau tidak, dengan harga tambahan per pilihan. */
export interface ExtraGroup { id: string; name: string; required: boolean; mode: 'single' | 'multiple'; maxSelect: number | null; options: ExtraOption[]; productIds: string[] }
export interface ExtraGroupInput {
  id?: string; name: string; required: boolean; mode: 'single' | 'multiple'; maxSelect?: number | null;
  options: { id?: string; name: string; price: number }[]; productIds: string[];
}
export interface Payment { id: string; methodId: string; methodName: string; kind: PaymentMethod['kind']; amount: number; tendered?: number; change: number; paidAt: string; reference?: string }
/** Pelanggan. pointsBalance = saldo poin loyalti (diisi server). */
export interface Customer {
  id: string; code?: string; name: string; phone?: string; email?: string; gender?: 'female' | 'male' | 'other'; birthDate?: string;
  city?: string; address?: string; note?: string; pointsBalance: number; createdAt: string;
}
export interface CustomerInput {
  id?: string; name: string; phone?: string; email?: string; gender?: 'female' | 'male' | 'other'; birthDate?: string; city?: string; address?: string; note?: string;
}
export type PromotionKind = 'percent_order' | 'amount_order' | 'percent_item' | 'amount_item' | 'free_item';
export interface Promotion {
  id: string; name: string; kind: PromotionKind; value: number; minSpend: number; productIds: string[]; freeProductId?: string;
  orderTypes: OrderType[]; startsAt?: string; endsAt?: string; isActive: boolean;
}
export interface PromotionInput {
  id?: string; name: string; kind: PromotionKind; value: number; minSpend?: number; productIds?: string[]; freeProductId?: string;
  orderTypes?: OrderType[]; startsAt?: string; endsAt?: string; isActive?: boolean;
}
export interface Coupon { id: string; promotionId: string; code: string; usageLimit?: number; usedCount: number; validFrom?: string; validTo?: string; isActive: boolean }
export interface CouponInput { id?: string; promotionId: string; code: string; usageLimit?: number; validFrom?: string; validTo?: string; isActive?: boolean }
/** Satu potongan tingkat order yang tercatat pada pesanan. */
export interface DiscountEntry { id: string; source: 'promo' | 'coupon' | 'manual' | 'points'; points?: number; promotionId?: string; couponId?: string; label: string; amount: number; authorizedBy?: string; /** nomor referensi kupon/promo yang diketik kasir (maks 60 huruf) */ reference?: string }
export interface Order {
  id: string; number: string; type: OrderType; tableId?: string; customerId?: string; customerName?: string; label?: string; guestCount?: number; shiftId?: string; cashierId: string;
  status: 'open' | 'partially_paid' | 'paid' | 'void';
  items: OrderItem[]; discounts?: DiscountEntry[];
  subtotal: number; discountTotal: number; serviceCharge: number; taxTotal: number; rounding: number; total: number; paidTotal: number;
  payments: Payment[]; openedAt: string; closedAt?: string;
}
export interface OrderDraft {
  id: string; type: OrderType; tableId?: string; customerId?: string; customerName?: string; label?: string; guestCount?: number;
  /** rincian potongan order; jumlahnya = orderDiscount. Tanpa rincian, potongan dicatat sebagai manual. */
  discounts?: DiscountEntry[];
  items: { id: string; productId: string; name: string; qty: number; unitPrice: number; /** harga daftar sebelum diubah kasir; hanya diisi bila harga baris diubah */ basePrice?: number; note?: string; extras?: ItemExtra[] }[];
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
/** reference = nomor struk EDC / bukti transfer (opsional) atau alasan gratis (wajib untuk komplimen) */
export interface PaymentInput { id: string; methodId: string; amount: number; tendered?: number; paidAt?: string; reference?: string }

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
  /** tampilan struk (migrasi 0027); tidak diisi = bawaan (tanpa kepala, kasir dan pelanggan tampil) */
  receiptHeader?: string; receiptShowCashier?: boolean; receiptShowCustomer?: boolean;
  /** templat struk (migrasi 0031): tema, bagian tampil/sembunyi, batas cetak; tidak diisi = bawaan */
  receiptTemplate?: Partial<import('./receipt-template').ReceiptTemplate>;
  deviceCode: string; settings: CalcSettings & { roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean; cashOutDailyLimit?: number | null; defaultOpeningCash?: number | null; autoReconcileNoncash?: boolean };
  taxes: { id: string; name: string; rate: number }[];
}

export type DataErrorCode = 'no_open_shift' | 'shift_already_open' | 'order_locked' | 'bad_amount' | 'not_found' | 'bad_pin' | 'invalid' | 'forbidden' | 'network';
export class DataError extends Error {
  constructor(public code: DataErrorCode, message: string) { super(message); }
}

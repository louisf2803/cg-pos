import type { CalcSettings, OrderType } from './order-calc';

export interface Category { id: string; name: string; sort: number }
export interface Product {
  id: string; name: string; categoryId: string | null; price: number; sku?: string;
  kind: 'goods' | 'service'; trackStock: boolean; stock?: number; isActive: boolean; isFavorite: boolean;
  /** persen pajak khusus produk (mode per_product) */
  taxRate?: number; photoUrl?: string;
  /** produk induk bila ini varian ukuran (S/M/L); tidak ada untuk produk tunggal */
  parentId?: string | null;
}
export interface ProductInput {
  id?: string; name: string; categoryId: string | null; price: number; sku?: string;
  kind?: 'goods' | 'service'; trackStock?: boolean; isFavorite?: boolean; isActive?: boolean;
}
export interface Employee { id: string; name: string; role: 'owner' | 'manager' | 'cashier' }
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

export interface OrderItem { id: string; productId: string; name: string; qty: number; unitPrice: number; lineTotal: number; note?: string }
export interface Payment { id: string; methodId: string; methodName: string; kind: PaymentMethod['kind']; amount: number; tendered?: number; change: number; paidAt: string }
export interface Order {
  id: string; number: string; type: OrderType; tableId?: string; shiftId?: string; cashierId: string;
  status: 'open' | 'partially_paid' | 'paid' | 'void';
  items: OrderItem[];
  subtotal: number; discountTotal: number; serviceCharge: number; taxTotal: number; rounding: number; total: number; paidTotal: number;
  payments: Payment[]; openedAt: string; closedAt?: string;
}
export interface OrderDraft {
  id: string; type: OrderType; tableId?: string; label?: string;
  items: { id: string; productId: string; name: string; qty: number; unitPrice: number; note?: string }[];
  orderDiscount?: number;
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
  deviceCode: string; settings: CalcSettings & { roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean };
  taxes: { id: string; name: string; rate: number }[];
}

export type DataErrorCode = 'no_open_shift' | 'shift_already_open' | 'order_locked' | 'bad_amount' | 'not_found' | 'bad_pin' | 'invalid' | 'forbidden';
export class DataError extends Error {
  constructor(public code: DataErrorCode, message: string) { super(message); }
}

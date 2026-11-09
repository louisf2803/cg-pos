import { roundToStep } from './money';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'service';
export type TaxCalc = 'before_discount' | 'after_discount' | 'inclusive';
export type TaxMode = 'per_order' | 'per_product';

export interface CalcItem {
  id: string;
  qty: number;
  unitPrice: number;
  /** total ekstra untuk seluruh qty baris */
  extrasTotal?: number;
  /** potongan pada baris ini (sudah dalam rupiah) */
  discount?: number;
  isFree?: boolean;
  voided?: boolean;
  /** persen pajak untuk mode per_product */
  taxRate?: number;
}

export interface CalcTaxRate { taxId?: string; name: string; rate: number }

export interface CalcSettings {
  taxCalc: TaxCalc;
  taxMode: TaxMode;
  serviceChargePct: number;
  serviceChargeTaxable: boolean;
  serviceChargeOrderTypes: OrderType[];
}

export interface CalcInput {
  orderType: OrderType;
  items: CalcItem[];
  /** potongan tingkat order (promo/kupon/poin/manual), rupiah */
  orderDiscount?: number;
  /** pajak untuk mode per_order */
  orderTaxes?: CalcTaxRate[];
  settings: CalcSettings;
  /** kelipatan pembulatan menurut metode bayar (0 = tanpa) */
  roundingStep?: number;
}

export interface CalcTaxLine { taxId?: string; name: string; rate: number; base: number; amount: number }

export interface CalcResult {
  lines: { id: string; lineTotal: number; taxAmount: number }[];
  /** jumlah baris (sudah dikurangi potongan baris), tanpa pajak */
  subtotal: number;
  /** hanya potongan tingkat order; potongan baris sudah masuk ke subtotal */
  discountTotal: number;
  serviceCharge: number;
  taxTotal: number;
  rounding: number;
  /** = subtotal - discountTotal + serviceCharge + taxTotal + rounding (sama dengan CHECK di database) */
  total: number;
  taxLines: CalcTaxLine[];
}

export class NotSupportedYet extends Error {}

/** Bagi `amount` ke bobot secara proporsional, jumlahnya persis `amount` (sisa pembulatan ke bobot terbesar). */
export function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || amount <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / sum);
  const out = raw.map(Math.floor);
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    out[o.i]! += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Hitung angka satu order. Fungsi murni; tablet dan server memakai ini supaya hasilnya identik.
 * Aturan:
 *  - baris = round(qty*harga) + ekstra - potongan baris; baris gratis/dibatalkan = 0
 *  - subtotal = jumlah baris
 *  - biaya layanan = persen x (subtotal - potongan order), hanya untuk jenis order yang dipilih
 *  - pajak: dasar = subtotal atau subtotal - potongan order (sesuai taxCalc), plus biaya layanan bila kena pajak
 *  - pembulatan menurut kelipatan (terdekat), dihitung terakhir
 * Belum didukung: harga sudah termasuk pajak (inclusive); melempar NotSupportedYet.
 */
export function computeOrder(input: CalcInput): CalcResult {
  const { settings, orderType } = input;
  if (settings.taxCalc === 'inclusive') {
    throw new NotSupportedYet('tax_calc inclusive belum diimplementasikan (butuh aturan subtotal bersih di server)');
  }
  const live = input.items.filter((i) => !i.voided);
  const lineTotals = live.map((i) => {
    if (i.isFree) return 0;
    const gross = Math.round(i.qty * i.unitPrice) + Math.round(i.extrasTotal ?? 0);
    const disc = Math.min(Math.max(Math.round(i.discount ?? 0), 0), gross);
    return gross - disc;
  });
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discountTotal = Math.min(Math.max(Math.round(input.orderDiscount ?? 0), 0), subtotal);
  const afterDiscount = subtotal - discountTotal;

  const serviceCharge = settings.serviceChargeOrderTypes.includes(orderType)
    ? Math.round((afterDiscount * settings.serviceChargePct) / 100)
    : 0;

  const taxLines: CalcTaxLine[] = [];
  const lineTax: number[] = live.map(() => 0);
  const serviceBase = settings.serviceChargeTaxable ? serviceCharge : 0;

  if (settings.taxMode === 'per_order') {
    const base = (settings.taxCalc === 'before_discount' ? subtotal : afterDiscount) + serviceBase;
    for (const t of input.orderTaxes ?? []) {
      taxLines.push({ taxId: t.taxId, name: t.name, rate: t.rate, base, amount: Math.round((base * t.rate) / 100) });
    }
  } else {
    // per produk: potongan order dibagi ke baris menurut nilai baris bila pajak dihitung setelah diskon
    const share = settings.taxCalc === 'after_discount' ? allocate(discountTotal, lineTotals) : lineTotals.map(() => 0);
    const byRate = new Map<number, { base: number; amount: number }>();
    live.forEach((it, idx) => {
      const rate = it.taxRate ?? 0;
      const base = lineTotals[idx]! - share[idx]!;
      const amount = Math.round((base * rate) / 100);
      lineTax[idx] = amount;
      if (rate > 0) {
        const cur = byRate.get(rate) ?? { base: 0, amount: 0 };
        cur.base += base;
        cur.amount += amount;
        byRate.set(rate, cur);
      }
    });
    for (const [rate, v] of byRate) taxLines.push({ name: `Pajak ${rate}%`, rate, base: v.base, amount: v.amount });
  }
  const taxTotal = taxLines.reduce((a, t) => a + t.amount, 0);

  const preRound = afterDiscount + serviceCharge + taxTotal;
  const rounding = input.roundingStep ? roundToStep(preRound, input.roundingStep) - preRound : 0;
  const total = preRound + rounding;

  return {
    lines: live.map((it, idx) => ({ id: it.id, lineTotal: lineTotals[idx]!, taxAmount: lineTax[idx]! })),
    subtotal, discountTotal, serviceCharge, taxTotal, rounding, total, taxLines,
  };
}

/** Kembalian tunai dan sisa tagihan. */
export function cashChange(total: number, alreadyPaid: number, tendered: number) {
  const balance = Math.max(total - alreadyPaid, 0);
  const applied = Math.min(tendered, balance);
  return { applied, change: Math.max(tendered - balance, 0), shortfall: Math.max(balance - tendered, 0) };
}

export const CUSTOMER_DISPLAY_CHANNEL = 'cgpos_customer_display_v1';

export type CustomerDisplayPhase = 'idle' | 'ordering' | 'paying' | 'paid';

export interface CustomerDisplayLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  extrasLabel?: string;
  lineTotal: number;
}

export interface CustomerDisplaySnapshot {
  version: 1;
  outletName: string;
  outletAddress?: string;
  cashierName?: string;
  phase: CustomerDisplayPhase;
  orderNumber?: string;
  orderTypeLabel?: string;
  tableName?: string;
  customerName?: string;
  lines: CustomerDisplayLine[];
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  taxTotal: number;
  rounding: number;
  total: number;
  paidTotal?: number;
  remainingDue?: number;
  paymentMethod?: string;
  tendered?: number;
  change?: number;
  welcomeMessage?: string;
  updatedAt: string;
}

export function isCustomerDisplayUrl(search: string): boolean {
  const clean = search.startsWith('?') ? search.slice(1) : search;
  if (!clean) return false;
  for (const part of clean.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? '' : part.slice(eq + 1);
    try {
      if (decodeURIComponent(rawKey) === 'display' && decodeURIComponent(rawVal) === 'customer') {
        return true;
      }
    } catch {
      if (rawKey === 'display' && rawVal === 'customer') return true;
    }
  }
  return false;
}

export function buildCustomerDisplayUrl(currentHref: string): string {
  const hashIdx = currentHref.indexOf('#');
  const hash = hashIdx === -1 ? '' : currentHref.slice(hashIdx);
  const withoutHash = hashIdx === -1 ? currentHref : currentHref.slice(0, hashIdx);
  const qIdx = withoutHash.indexOf('?');
  const base = qIdx === -1 ? withoutHash : withoutHash.slice(0, qIdx);
  const rawQuery = qIdx === -1 ? '' : withoutHash.slice(qIdx + 1);
  const params = rawQuery
    .split('&')
    .filter((part) => {
      if (!part) return false;
      const eq = part.indexOf('=');
      const rawKey = eq === -1 ? part : part.slice(0, eq);
      return rawKey !== 'display';
    });
  params.push('display=customer');
  return `${base}?${params.join('&')}${hash}`;
}

export function createIdleCustomerDisplaySnapshot(
  outletName: string,
  options?: { outletAddress?: string; cashierName?: string; welcomeMessage?: string; updatedAt?: string },
): CustomerDisplaySnapshot {
  return {
    version: 1,
    outletName,
    ...(options?.outletAddress ? { outletAddress: options.outletAddress } : {}),
    ...(options?.cashierName ? { cashierName: options.cashierName } : {}),
    ...(options?.welcomeMessage ? { welcomeMessage: options.welcomeMessage } : {}),
    phase: 'idle',
    lines: [],
    subtotal: 0,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 0,
    updatedAt: options?.updatedAt ?? new Date().toISOString(),
  };
}

const VALID_PHASES = new Set<CustomerDisplayPhase>(['idle', 'ordering', 'paying', 'paid']);

export function parseCustomerDisplaySnapshot(raw: string | null): CustomerDisplaySnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerDisplaySnapshot> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (!parsed.phase || !VALID_PHASES.has(parsed.phase)) return null;
    if (typeof parsed.outletName !== 'string' || !parsed.outletName.trim()) return null;
    if (!Array.isArray(parsed.lines)) return null;
    const lines: CustomerDisplayLine[] = [];
    for (const row of parsed.lines) {
      if (!row || typeof row !== 'object') continue;
      if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
      if (typeof row.qty !== 'number' || !Number.isFinite(row.qty)) continue;
      if (typeof row.unitPrice !== 'number' || !Number.isFinite(row.unitPrice)) continue;
      if (typeof row.lineTotal !== 'number' || !Number.isFinite(row.lineTotal)) continue;
      lines.push({
        id: row.id,
        name: row.name,
        qty: row.qty,
        unitPrice: row.unitPrice,
        ...(typeof row.extrasLabel === 'string' && row.extrasLabel ? { extrasLabel: row.extrasLabel } : {}),
        lineTotal: row.lineTotal,
      });
    }
    const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const optStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
    return {
      version: 1,
      outletName: parsed.outletName,
      outletAddress: optStr(parsed.outletAddress),
      cashierName: optStr(parsed.cashierName),
      phase: parsed.phase,
      orderNumber: optStr(parsed.orderNumber),
      orderTypeLabel: optStr(parsed.orderTypeLabel),
      tableName: optStr(parsed.tableName),
      customerName: optStr(parsed.customerName),
      lines,
      subtotal: num(parsed.subtotal),
      discountTotal: num(parsed.discountTotal),
      serviceCharge: num(parsed.serviceCharge),
      taxTotal: num(parsed.taxTotal),
      rounding: num(parsed.rounding),
      total: num(parsed.total),
      paidTotal: optNum(parsed.paidTotal),
      remainingDue: optNum(parsed.remainingDue),
      paymentMethod: optStr(parsed.paymentMethod),
      tendered: optNum(parsed.tendered),
      change: optNum(parsed.change),
      welcomeMessage: optStr(parsed.welcomeMessage),
      updatedAt: optStr(parsed.updatedAt) ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function customerDisplayItemCount(lines: readonly CustomerDisplayLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

import type { ShiftReportRow } from './shift-report';

export interface CashierShiftSummary {
  cashierId: string;
  cashierName: string;
  terminalName: string;
  shiftCount: number;
  openShiftCount: number;
  closedShiftCount: number;
  orderCount: number;
  totalOpeningCash: number;
  totalCashSales: number;
  totalOtherSales: number;
  totalCashIn: number;
  totalCashOut: number;
  totalCashRefunds: number;
  totalExpectedCash: number;
  totalCountedCash: number;
  totalVariance: number;
}

export function groupShiftsByCashier(
  rows: readonly ShiftReportRow[],
): CashierShiftSummary[] {
  const map = new Map<string, CashierShiftSummary>();

  for (const r of rows) {
    const cid = r.shift.cashierId;
    let s = map.get(cid);
    if (!s) {
      s = {
        cashierId: cid,
        cashierName: r.cashierName,
        terminalName: 'Terminal 1 (Kasir)',
        shiftCount: 0,
        openShiftCount: 0,
        closedShiftCount: 0,
        orderCount: 0,
        totalOpeningCash: 0,
        totalCashSales: 0,
        totalOtherSales: 0,
        totalCashIn: 0,
        totalCashOut: 0,
        totalCashRefunds: 0,
        totalExpectedCash: 0,
        totalCountedCash: 0,
        totalVariance: 0,
      };
      map.set(cid, s);
    }

    s.shiftCount++;
    if (r.shift.status === 'open') {
      s.openShiftCount++;
    } else {
      s.closedShiftCount++;
    }
    s.orderCount += r.orderCount;
    s.totalOpeningCash += r.shift.openingCash;
    s.totalCashSales += r.cashSales;
    s.totalOtherSales += r.otherSales;
    s.totalCashIn += r.cashIn;
    s.totalCashOut += r.cashOut;
    s.totalCashRefunds += r.cashRefunds;
    s.totalExpectedCash += r.expectedCash;
    s.totalCountedCash += r.shift.status === 'closed' ? r.counted : 0;
    s.totalVariance += r.shift.status === 'closed' ? r.variance : 0;
  }

  return [...map.values()].sort((a, b) => a.cashierName.localeCompare(b.cashierName, 'id'));
}

export function filterShiftRows(
  rows: readonly ShiftReportRow[],
  options: {
    cashierId?: string;
    status?: 'all' | 'open' | 'closed';
    search?: string;
  },
): ShiftReportRow[] {
  const { cashierId = 'all', status = 'all', search = '' } = options;
  const q = search.trim().toLowerCase();

  return rows.filter((r) => {
    if (cashierId !== 'all' && r.shift.cashierId !== cashierId) return false;
    if (status !== 'all' && r.shift.status !== status) return false;
    if (q && !r.cashierName.toLowerCase().includes(q)) return false;
    return true;
  });
}

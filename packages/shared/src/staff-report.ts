import type { Order, Refund } from './types';

export interface StaffReportRow {
  key: string;
  employeeId: string;
  name: string;
  role?: string;
  transactionCount: number;
  totalSales: number;
  avgSalesPerTx: number;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;
  manualDiscountCount: number;
  manualDiscountTotal: number;
  complimentaryCount: number;
  complimentaryTotal: number;
}

export interface StaffReportTotals {
  employeeCount: number;
  transactionCount: number;
  totalSales: number;
  avgSalesPerTx: number;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;
  manualDiscountCount: number;
  manualDiscountTotal: number;
  complimentaryCount: number;
  complimentaryTotal: number;
}

export interface StaffReport {
  totals: StaffReportTotals;
  rows: StaffReportRow[];
}

export interface BuildStaffReportInput {
  orders: Order[];
  employees?: { id: string; name: string; role?: string }[];
  refunds?: Refund[];
  voided?: Order[];
}

/**
 * Laporan karyawan dan kasir dari data transaksi pesanan.
 * Menghitung penjualan, jumlah transaksi, rata-rata transaksi, transaksi batal (void),
 * pengembalian dana (refund), diskon manual, dan pembayaran gratis (komplimen) per karyawan.
 * Murni, tanpa efek samping.
 */
export function buildStaffReport(input: BuildStaffReportInput): StaffReport {
  const employees = input.employees ?? [];
  const empMap = new Map<string, { id: string; name: string; role?: string }>();
  for (const e of employees) {
    empMap.set(e.id, e);
  }

  const rowMap = new Map<string, StaffReportRow>();
  const getOrCreateRow = (empId: string): StaffReportRow => {
    let r = rowMap.get(empId);
    if (!r) {
      const emp = empMap.get(empId);
      r = {
        key: empId,
        employeeId: empId,
        name: emp?.name || (empId === 'unknown' ? 'Tanpa nama' : `Karyawan (${empId})`),
        role: emp?.role,
        transactionCount: 0,
        totalSales: 0,
        avgSalesPerTx: 0,
        voidCount: 0,
        voidTotal: 0,
        refundCount: 0,
        refundTotal: 0,
        manualDiscountCount: 0,
        manualDiscountTotal: 0,
        complimentaryCount: 0,
        complimentaryTotal: 0,
      };
      rowMap.set(empId, r);
    }
    return r;
  };

  // Daftarkan semua karyawan terdaftar agar tetap tampil meski belum ada transaksi
  for (const e of employees) {
    getOrCreateRow(e.id);
  }

  // Peta id pesanan ke id kasir untuk melacak asal refund
  const orderCashierMap = new Map<string, string>();

  // 1. Pesanan lunas (penjualan, transaksi, diskon manual, komplimen)
  const paidOrders = (input.orders ?? []).filter((o) => o.status === 'paid');
  for (const o of paidOrders) {
    const cashierId = o.cashierId || 'unknown';
    orderCashierMap.set(o.id, cashierId);
    const row = getOrCreateRow(cashierId);

    row.transactionCount += 1;
    row.totalSales += o.total;

    // Diskon manual
    if (o.discounts && o.discounts.length > 0) {
      let manualTotal = 0;
      let hasManual = false;
      for (const d of o.discounts) {
        if (d.source === 'manual') {
          manualTotal += d.amount;
          hasManual = true;
        }
      }
      if (hasManual) {
        row.manualDiscountCount += 1;
        row.manualDiscountTotal += manualTotal;
      }
    }

    // Pembayaran gratis (komplimen)
    if (o.payments && o.payments.length > 0) {
      for (const p of o.payments) {
        if (p.kind === 'complimentary') {
          row.complimentaryCount += 1;
          row.complimentaryTotal += p.amount;
        }
      }
    }
  }

  // 2. Transaksi dibatalkan (void)
  const voidedOrders = [
    ...(input.voided ?? []),
    ...(input.orders ?? []).filter((o) => o.status === 'void'),
  ];
  const processedVoidIds = new Set<string>();
  for (const v of voidedOrders) {
    if (processedVoidIds.has(v.id)) continue;
    processedVoidIds.add(v.id);
    const cashierId = v.cashierId || 'unknown';
    orderCashierMap.set(v.id, cashierId);
    const row = getOrCreateRow(cashierId);
    row.voidCount += 1;
    row.voidTotal += v.total;
  }

  // 3. Pengembalian dana (refund)
  if (input.refunds) {
    for (const ref of input.refunds) {
      const cashierId = orderCashierMap.get(ref.orderId) || 'unknown';
      const row = getOrCreateRow(cashierId);
      row.refundCount += 1;
      row.refundTotal += ref.total;
    }
  }

  // Hitung rata-rata dan total keseluruhan
  const totals: StaffReportTotals = {
    employeeCount: rowMap.size,
    transactionCount: 0,
    totalSales: 0,
    avgSalesPerTx: 0,
    voidCount: 0,
    voidTotal: 0,
    refundCount: 0,
    refundTotal: 0,
    manualDiscountCount: 0,
    manualDiscountTotal: 0,
    complimentaryCount: 0,
    complimentaryTotal: 0,
  };

  const rows = [...rowMap.values()].map((r) => {
    r.avgSalesPerTx = r.transactionCount > 0 ? Math.round(r.totalSales / r.transactionCount) : 0;
    totals.transactionCount += r.transactionCount;
    totals.totalSales += r.totalSales;
    totals.voidCount += r.voidCount;
    totals.voidTotal += r.voidTotal;
    totals.refundCount += r.refundCount;
    totals.refundTotal += r.refundTotal;
    totals.manualDiscountCount += r.manualDiscountCount;
    totals.manualDiscountTotal += r.manualDiscountTotal;
    totals.complimentaryCount += r.complimentaryCount;
    totals.complimentaryTotal += r.complimentaryTotal;
    return r;
  });

  totals.avgSalesPerTx = totals.transactionCount > 0 ? Math.round(totals.totalSales / totals.transactionCount) : 0;

  // Urutkan: penjualan tertinggi dulu, lalu transaksi terbanyak, lalu nama
  rows.sort((a, b) => b.totalSales - a.totalSales || b.transactionCount - a.transactionCount || a.name.localeCompare(b.name, 'id'));

  return { totals, rows };
}

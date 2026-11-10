import type { Order, PaymentMethod } from './types';

export type ReconcileStatus = 'unentered' | 'matched' | 'mismatch';

export interface NonCashReconcileRow {
  /** Identifier unik baris rekonsiliasi (mis. methodId atau `${date}_${methodId}`) */
  id: string;
  /** Tanggal transaksi (YYYY-MM-DD), bila dikelompokkan per hari */
  date?: string;
  /** ID shift kasir, bila tersedia */
  shiftId?: string;
  /** ID metode pembayaran */
  methodId: string;
  /** Nama metode pembayaran (mis. QRIS, Debit BCA, Transfer) */
  methodName: string;
  /** Kategori jenis metode pembayaran (noncash, gateway, deposit) */
  methodKind: PaymentMethod['kind'];
  /** Jumlah transaksi non-tunai yang tercatat */
  transactionCount: number;
  /** Total nominal penerimaan yang dicatat sistem POS */
  systemAmount: number;
  /** Total nominal penerimaan yang tercatat di rekening bank atau payment gateway (input manual) */
  actualAmount?: number;
  /** Selisih = actualAmount - systemAmount (hanya dihitung bila actualAmount telah diisi) */
  diff?: number;
  /** Status rekonsiliasi: 'unentered' (belum diisi), 'matched' (cocok), 'mismatch' (selisih) */
  status: ReconcileStatus;
}

export interface ReconcileSummary {
  rows: NonCashReconcileRow[];
  totalTransactions: number;
  totalSystemAmount: number;
  totalActualAmount: number;
  totalDiff: number;
  matchedCount: number;
  mismatchCount: number;
  unenteredCount: number;
  allMatched: boolean;
}

export interface BuildReconcileOptions {
  orders: Order[];
  paymentMethods?: PaymentMethod[];
  /** Peta nilai aktual manual pengguna: key = row.id, value = nominal */
  actualAmounts?: Record<string, number>;
  /** Pengelompokan: 'method' (per metode bayar) atau 'date_method' (per hari dan metode bayar) */
  groupBy?: 'method' | 'date_method';
}

/**
 * Memeriksa apakah sebuah transaksi pembayaran merupakan pembayaran non-tunai.
 */
export function isNonCashPayment(payment: {
  kind?: PaymentMethod['kind'];
  methodName?: string;
}): boolean {
  if (payment.kind) {
    return payment.kind !== 'cash' && payment.kind !== 'complimentary';
  }
  const name = (payment.methodName || '').toLowerCase();
  return !name.includes('tunai') && !name.includes('cash') && !name.includes('gratis') && !name.includes('komplimen');
}

/**
 * Menghitung selisih dan status rekonsiliasi antara catatan sistem dan penerimaan bank.
 */
export function computeReconcileDiff(
  systemAmount: number,
  actualAmount?: number
): { diff?: number; status: ReconcileStatus } {
  if (actualAmount === undefined || isNaN(actualAmount)) {
    return { diff: undefined, status: 'unentered' };
  }
  const diff = actualAmount - systemAmount;
  if (diff === 0) {
    return { diff: 0, status: 'matched' };
  }
  return { diff, status: 'mismatch' };
}

/**
 * Mengolah pesanan lunas menjadi laporan ringkasan rekonsiliasi penerimaan non-tunai.
 */
export function buildNonCashReconciliation(options: BuildReconcileOptions): ReconcileSummary {
  const { orders, paymentMethods = [], actualAmounts = {}, groupBy = 'method' } = options;

  // Peta bantuan info metode pembayaran
  const methodMap = new Map<string, PaymentMethod>();
  for (const m of paymentMethods) {
    methodMap.set(m.id, m);
  }

  // Akumulator baris
  interface TempRow {
    id: string;
    date?: string;
    shiftId?: string;
    methodId: string;
    methodName: string;
    methodKind: PaymentMethod['kind'];
    count: number;
    amount: number;
  }

  const map = new Map<string, TempRow>();

  for (const o of orders) {
    // Hanya pesanan yang lunas atau ada pembayaran yang diperhitungkan
    if (o.status !== 'paid' && o.status !== 'partially_paid') continue;
    if (!o.payments || o.payments.length === 0) continue;

    for (const p of o.payments) {
      if (!isNonCashPayment(p)) continue;
      if (p.amount <= 0) continue;

      // Ambil tanggal YYYY-MM-DD dari pembayaran atau penutupan pesanan
      const dateStr = (p.paidAt || o.closedAt || o.openedAt || '').slice(0, 10);

      const mInfo = methodMap.get(p.methodId);
      const effectiveKind = p.kind || mInfo?.kind || 'noncash';
      const effectiveName = p.methodName || mInfo?.name || 'Non-Tunai';

      const key = groupBy === 'date_method' ? `${dateStr}_${p.methodId}` : p.methodId;

      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.amount += p.amount;
      } else {
        map.set(key, {
          id: key,
          date: groupBy === 'date_method' ? dateStr : undefined,
          shiftId: o.shiftId,
          methodId: p.methodId,
          methodName: effectiveName,
          methodKind: effectiveKind,
          count: 1,
          amount: p.amount,
        });
      }
    }
  }

  // Susun hasil
  const rows: NonCashReconcileRow[] = [];
  let totalTransactions = 0;
  let totalSystemAmount = 0;
  let totalActualAmount = 0;
  let matchedCount = 0;
  let mismatchCount = 0;
  let unenteredCount = 0;

  for (const item of map.values()) {
    const rawActual = actualAmounts[item.id];
    const actual = typeof rawActual === 'number' && !isNaN(rawActual) ? rawActual : undefined;
    const { diff, status } = computeReconcileDiff(item.amount, actual);

    totalTransactions += item.count;
    totalSystemAmount += item.amount;
    if (actual !== undefined) {
      totalActualAmount += actual;
    }

    if (status === 'matched') matchedCount++;
    else if (status === 'mismatch') mismatchCount++;
    else unenteredCount++;

    rows.push({
      id: item.id,
      date: item.date,
      shiftId: item.shiftId,
      methodId: item.methodId,
      methodName: item.methodName,
      methodKind: item.methodKind,
      transactionCount: item.count,
      systemAmount: item.amount,
      actualAmount: actual,
      diff,
      status,
    });
  }

  // Urutkan: bila per tanggal, urutkan tanggal desc lalu nominal desc; bila per metode, nominal desc
  if (groupBy === 'date_method') {
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.systemAmount - a.systemAmount);
  } else {
    rows.sort((a, b) => b.systemAmount - a.systemAmount || a.methodName.localeCompare(b.methodName));
  }

  const totalDiff = totalActualAmount - totalSystemAmount;
  const allMatched = rows.length > 0 && matchedCount === rows.length;

  return {
    rows,
    totalTransactions,
    totalSystemAmount,
    totalActualAmount,
    totalDiff,
    matchedCount,
    mismatchCount,
    unenteredCount,
    allMatched,
  };
}

/**
 * Membentuk baris CSV rekonsiliasi non-tunai untuk diekspor.
 */
export function buildReconcileCsv(
  rows: NonCashReconcileRow[],
  includeDate = false
): (string | number)[][] {
  const header: (string | number)[] = includeDate
    ? [
        'Tanggal',
        'Metode Pembayaran',
        'Jenis',
        'Banyak Transaksi',
        'Dicatat Sistem (Rp)',
        'Diterima Bank/Penyedia (Rp)',
        'Selisih (Rp)',
        'Status',
      ]
    : [
        'Metode Pembayaran',
        'Jenis',
        'Banyak Transaksi',
        'Dicatat Sistem (Rp)',
        'Diterima Bank/Penyedia (Rp)',
        'Selisih (Rp)',
        'Status',
      ];

  const dataRows: (string | number)[][] = rows.map((r) => {
    const statusText =
      r.status === 'matched'
        ? 'Sudah Cocok'
        : r.status === 'mismatch'
        ? `Selisih (${(r.diff ?? 0) >= 0 ? '+' : ''}${r.diff})`
        : 'Belum Diisi';

    const actualText = r.actualAmount !== undefined ? r.actualAmount : '';
    const diffText = r.diff !== undefined ? r.diff : '';

    return includeDate
      ? [
          r.date || '—',
          r.methodName,
          r.methodKind,
          r.transactionCount,
          r.systemAmount,
          actualText,
          diffText,
          statusText,
        ]
      : [
          r.methodName,
          r.methodKind,
          r.transactionCount,
          r.systemAmount,
          actualText,
          diffText,
          statusText,
        ];
  });

  let totalTrans = 0;
  let totalSys = 0;
  let totalAct = 0;
  let hasActual = false;

  for (const r of rows) {
    totalTrans += r.transactionCount;
    totalSys += r.systemAmount;
    if (r.actualAmount !== undefined) {
      totalAct += r.actualAmount;
      hasActual = true;
    }
  }

  const totalDiff = hasActual ? totalAct - totalSys : '';
  const totalStatus =
    rows.length === 0
      ? 'Kosong'
      : rows.every((r) => r.status === 'matched')
      ? 'Semua Cocok'
      : 'Terdapat Selisih / Belum Selesai';

  const summaryRow: (string | number)[] = includeDate
    ? [
        'TOTAL',
        '',
        '',
        totalTrans,
        totalSys,
        hasActual ? totalAct : '',
        totalDiff,
        totalStatus,
      ]
    : [
        'TOTAL',
        '',
        totalTrans,
        totalSys,
        hasActual ? totalAct : '',
        totalDiff,
        totalStatus,
      ];

  return [header, ...dataRows, [], summaryRow];
}

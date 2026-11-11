import { localDateKey } from './order-number';
import type { CatalogProduct, Customer, Order, Product } from './types';

export type FacilityUnit = 'jam' | 'sesi';

export interface FacilityMeta {
  capacity: number;
  unit: FacilityUnit;
  note?: string;
}

export interface FacilityDraft {
  name: string;
  price: number;
  capacity: number;
  unit: FacilityUnit;
  sku?: string;
  categoryId?: string | null;
  isActive?: boolean;
  note?: string;
}

export const DEFAULT_FACILITY_META: FacilityMeta = {
  capacity: 4,
  unit: 'jam',
};

/** Normalkan SKU opsional fasilitas sebelum disimpan. */
export function normalizeFacilitySku(raw?: string): string | undefined {
  const clean = (raw ?? '').trim();
  return clean.length > 0 ? clean : undefined;
}

/** Validasi masukan formulir produk fasilitas. Mengembalikan pesan kesalahan atau null bila valid. */
export function facilityDraftProblem(d: FacilityDraft): string | null {
  if (!d.name.trim()) return 'Nama fasilitas wajib diisi.';
  if (d.name.trim().length > 100) return 'Nama fasilitas maksimal 100 karakter.';
  if (!Number.isFinite(d.price) || !Number.isInteger(d.price) || d.price < 0) {
    return 'Tarif sewa harus berupa bilangan bulat rupiah 0 atau lebih.';
  }
  if (!Number.isFinite(d.capacity) || !Number.isInteger(d.capacity) || d.capacity < 1 || d.capacity > 500) {
    return 'Kapasitas orang harus antara 1 sampai 500.';
  }
  if (d.unit !== 'jam' && d.unit !== 'sesi') {
    return 'Pilih satuan tarif per jam atau per sesi.';
  }
  if ((d.note ?? '').trim().length > 200) {
    return 'Catatan fasilitas maksimal 200 karakter.';
  }
  return null;
}

/** Tentukan apakah item katalog merupakan produk fasilitas berdasarkan metadata lokal, awalan SKU, atau nama kategori. */
export function isFacilityProduct(
  product: Pick<Product | CatalogProduct, 'id' | 'kind' | 'sku' | 'categoryId'>,
  metaMap: Record<string, FacilityMeta>,
  categoryNames?: Map<string, string>
): boolean {
  if (product.kind !== 'service') return false;
  if (metaMap[product.id]) return true;
  if (product.sku && /^FAS[-_]/i.test(product.sku.trim())) return true;
  const catName = product.categoryId ? categoryNames?.get(product.categoryId) : undefined;
  if (catName && /fasilitas/i.test(catName)) return true;
  return false;
}

export interface FacilityUsageRow {
  productId: string;
  name: string;
  sku?: string;
  categoryName: string;
  unit: FacilityUnit;
  capacity: number;
  isActive: boolean;
  usageCount: number;
  transactionCount: number;
  revenue: number;
  avgRate: number;
  sharePct: number;
}

export interface FacilityUsageDaily {
  date: string;
  label: string;
  revenue: number;
  usageCount: number;
  orderCount: number;
}

export interface FacilityUsageSummary {
  totalRevenue: number;
  totalUsageCount: number;
  totalTransactions: number;
  registeredCount: number;
  activeCount: number;
  topFacility: FacilityUsageRow | null;
}

export interface FacilityUsageReport {
  summary: FacilityUsageSummary;
  items: FacilityUsageRow[];
  daily: FacilityUsageDaily[];
}

function shortDayLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthIdx = Number(parts[1]) - 1;
  return `${Number(parts[2])} ${months[monthIdx] ?? parts[1]}`;
}

/** Hitung agregasi pemakaian dan pendapatan produk fasilitas dari pesanan lunas. */
export function buildFacilityUsageReport(
  orders: Order[],
  catalog: CatalogProduct[],
  metaMap: Record<string, FacilityMeta>,
  options?: {
    timezone?: string;
    from?: string;
    to?: string;
    categoryNames?: Map<string, string>;
  }
): FacilityUsageReport {
  const tz = options?.timezone ?? 'Asia/Jakarta';
  const catNames = options?.categoryNames;

  const facilities = new Map<string, CatalogProduct>();
  const variantToFacility = new Map<string, string>();
  for (const item of catalog) {
    if (!isFacilityProduct(item, metaMap, catNames)) continue;
    facilities.set(item.id, item);
    for (const v of item.variants) {
      variantToFacility.set(v.id, item.id);
    }
  }

  const acc = new Map<
    string,
    {
      usageCount: number;
      revenue: number;
      orderIds: Set<string>;
    }
  >();
  for (const id of facilities.keys()) {
    acc.set(id, { usageCount: 0, revenue: 0, orderIds: new Set() });
  }

  const dailyMap = new Map<string, { revenue: number; usageCount: number; orderIds: Set<string> }>();
  const allFacilityOrderIds = new Set<string>();

  for (const order of orders) {
    if (order.status !== 'paid') continue;
    const dateKey = localDateKey(new Date(order.closedAt ?? order.openedAt), tz);
    if (options?.from && dateKey < options.from) continue;
    if (options?.to && dateKey > options.to) continue;

    for (const line of order.items) {
      const targetId = facilities.has(line.productId)
        ? line.productId
        : variantToFacility.get(line.productId);
      if (!targetId) continue;

      const row = acc.get(targetId);
      if (!row) continue;

      row.usageCount += line.qty;
      row.revenue += line.lineTotal;
      row.orderIds.add(order.id);
      allFacilityOrderIds.add(order.id);

      let d = dailyMap.get(dateKey);
      if (!d) {
        d = { revenue: 0, usageCount: 0, orderIds: new Set() };
        dailyMap.set(dateKey, d);
      }
      d.revenue += line.lineTotal;
      d.usageCount += line.qty;
      d.orderIds.add(order.id);
    }
  }

  let totalRevenue = 0;
  let totalUsageCount = 0;
  for (const stats of acc.values()) {
    totalRevenue += stats.revenue;
    totalUsageCount += stats.usageCount;
  }

  const items: FacilityUsageRow[] = [];
  let activeCount = 0;
  for (const [id, prod] of facilities) {
    if (prod.isActive) activeCount++;
    const stats = acc.get(id)!;
    const meta = metaMap[id] ?? DEFAULT_FACILITY_META;
    const sharePct = totalRevenue > 0 ? Number(((stats.revenue / totalRevenue) * 100).toFixed(1)) : 0;
    const avgRate = stats.usageCount > 0 ? Math.round(stats.revenue / stats.usageCount) : prod.price;
    items.push({
      productId: id,
      name: prod.name,
      sku: prod.sku,
      categoryName: (prod.categoryId ? catNames?.get(prod.categoryId) : undefined) ?? 'Tanpa kategori',
      unit: meta.unit,
      capacity: meta.capacity,
      isActive: prod.isActive,
      usageCount: stats.usageCount,
      transactionCount: stats.orderIds.size,
      revenue: stats.revenue,
      avgRate,
      sharePct,
    });
  }

  items.sort((a, b) => b.revenue - a.revenue || b.usageCount - a.usageCount || a.name.localeCompare(b.name, 'id'));

  const daily: FacilityUsageDaily[] = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      label: shortDayLabel(date),
      revenue: d.revenue,
      usageCount: d.usageCount,
      orderCount: d.orderIds.size,
    }));

  const usedItems = items.filter((i) => i.usageCount > 0 || i.revenue > 0);
  const topFacility = usedItems.length > 0 ? usedItems[0]! : null;

  return {
    summary: {
      totalRevenue,
      totalUsageCount,
      totalTransactions: allFacilityOrderIds.size,
      registeredCount: facilities.size,
      activeCount,
      topFacility,
    },
    items,
    daily,
  };
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Ekspor laporan pemakaian fasilitas menjadi string CSV UTF-8 dengan BOM. */
export function toFacilityReportCsv(report: FacilityUsageReport, rangeLabel?: string): string {
  const rows: (string | number)[][] = [
    ['LAPORAN PEMAKAIAN FASILITAS'],
    ...(rangeLabel ? [[`Periode: ${rangeLabel}`]] : []),
    [
      `Total Pendapatan: ${report.summary.totalRevenue}`,
      `Total Pemakaian: ${report.summary.totalUsageCount}`,
      `Total Transaksi: ${report.summary.totalTransactions}`,
    ],
    [],
    ['Nama Fasilitas', 'SKU', 'Kategori', 'Satuan', 'Kapasitas', 'Status', 'Pemakaian', 'Transaksi', 'Pendapatan', 'Tarif Rata-rata', 'Porsi (%)'],
  ];

  for (const row of report.items) {
    rows.push([
      row.name,
      row.sku ?? '-',
      row.categoryName,
      row.unit === 'jam' ? 'Per jam' : 'Per sesi',
      row.capacity,
      row.isActive ? 'Aktif' : 'Nonaktif',
      row.usageCount,
      row.transactionCount,
      row.revenue,
      row.avgRate,
      row.sharePct,
    ]);
  }

  return '\uFEFF' + rows.map((line) => line.map(escapeCsvCell).join(',')).join('\r\n');
}

export interface LoyaltyTierGroup {
  id: string;
  name: string;
  minPoints: number;
  earnMultiplier: number;
  benefitNote: string;
  isActive: boolean;
}

export const DEFAULT_LOYALTY_TIERS: LoyaltyTierGroup[] = [
  { id: 'tier-perunggu', name: 'Perunggu', minPoints: 0, earnMultiplier: 1, benefitNote: 'Tingkat dasar pengumpulan poin reguler.', isActive: true },
  { id: 'tier-perak', name: 'Perak', minPoints: 100, earnMultiplier: 1.2, benefitNote: 'Bonus poin lebih cepat +20% setiap transaksi.', isActive: true },
  { id: 'tier-emas', name: 'Emas', minPoints: 500, earnMultiplier: 1.5, benefitNote: 'Prioritas reservasi meja & kelipatan poin 1,5x.', isActive: true },
  { id: 'tier-utama', name: 'Utama', minPoints: 1000, earnMultiplier: 2, benefitNote: 'Kelipatan poin 2x & penawaran eksklusif.', isActive: true },
];

/** Validasi masukan aturan grup loyalti. Mengembalikan pesan kesalahan atau null bila valid. */
export function loyaltyTierProblem(
  input: { name: string; minPoints: number; earnMultiplier: number },
  existing: LoyaltyTierGroup[] = [],
  editingId?: string
): string | null {
  const cleanName = input.name.trim();
  if (!cleanName) return 'Nama grup loyalti wajib diisi.';
  if (cleanName.length > 40) return 'Nama grup loyalti maksimal 40 karakter.';
  const duplicate = existing.some(
    (t) => t.id !== editingId && t.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) return `Grup "${cleanName}" sudah ada.`;
  if (!Number.isFinite(input.minPoints) || !Number.isInteger(input.minPoints) || input.minPoints < 0 || input.minPoints > 10_000_000) {
    return 'Minimal poin harus bilangan bulat 0 atau lebih.';
  }
  if (!Number.isFinite(input.earnMultiplier) || input.earnMultiplier < 1 || input.earnMultiplier > 10) {
    return 'Pengali poin harus antara 1,0 hingga 10,0.';
  }
  return null;
}

/** Cari grup loyalti tertinggi yang memenuhi saldo poin pelanggan. */
export function tierForPoints(points: number, tiers: LoyaltyTierGroup[]): LoyaltyTierGroup | null {
  const safePoints = Math.max(0, points);
  const eligible = tiers
    .filter((t) => t.isActive && safePoints >= t.minPoints)
    .sort((a, b) => b.minPoints - a.minPoints);
  return eligible[0] ?? null;
}

export interface TierSummaryRow {
  tier: LoyaltyTierGroup;
  memberCount: number;
}

/** Kelompokkan jumlah pelanggan ke masing-masing grup loyalti berdasarkan saldo poin saat ini. */
export function summarizeTierDistribution(
  customers: Pick<Customer, 'id' | 'pointsBalance'>[],
  tiers: LoyaltyTierGroup[]
): { rows: TierSummaryRow[]; unassignedCount: number } {
  const sortedTiers = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  const counts = new Map<string, number>();
  for (const t of sortedTiers) counts.set(t.id, 0);

  let unassignedCount = 0;
  for (const c of customers) {
    const matched = tierForPoints(c.pointsBalance, sortedTiers);
    if (!matched) {
      unassignedCount++;
    } else {
      counts.set(matched.id, (counts.get(matched.id) ?? 0) + 1);
    }
  }

  return {
    rows: sortedTiers.map((tier) => ({ tier, memberCount: counts.get(tier.id) ?? 0 })),
    unassignedCount,
  };
}

export interface BirthdayRuleConfig {
  isActive: boolean;
  bonusPoints: number;
  noteTemplate: string;
}

export const DEFAULT_BIRTHDAY_RULE: BirthdayRuleConfig = {
  isActive: true,
  bonusPoints: 50,
  noteTemplate: 'Bonus poin ulang tahun',
};

/** Validasi pengaturan bonus poin ulang tahun pelanggan. */
export function birthdayRuleProblem(cfg: BirthdayRuleConfig): string | null {
  if (!Number.isFinite(cfg.bonusPoints) || !Number.isInteger(cfg.bonusPoints) || cfg.bonusPoints < 1 || cfg.bonusPoints > 100_000) {
    return 'Bonus poin ulang tahun harus bilangan bulat 1 sampai 100.000.';
  }
  const cleanNote = cfg.noteTemplate.trim();
  if (!cleanNote) return 'Catatan bonus ulang tahun wajib diisi.';
  if (cleanNote.length > 120) return 'Catatan bonus ulang tahun maksimal 120 karakter.';
  return null;
}

export interface CustomerBirthdayInfo {
  customer: Customer;
  month: number;
  day: number;
  ageThisYear: number | null;
  isThisMonth: boolean;
  isToday: boolean;
  alreadyGrantedThisYear: boolean;
}

/** Parsing tanggal lahir YYYY-MM-DD (atau awalan ISO) dan cek status ulang tahun terhadap tanggal acuan. */
export function buildBirthdayCustomersList(
  customers: Customer[],
  referenceDateKey: string,
  grantedYearMap: Record<string, number>
): CustomerBirthdayInfo[] {
  const refMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(referenceDateKey.trim());
  const refYear = refMatch ? Number(refMatch[1]) : 2026;
  const refMonth = refMatch ? Number(refMatch[2]) : 1;
  const refDay = refMatch ? Number(refMatch[3]) : 1;

  const list: CustomerBirthdayInfo[] = [];
  for (const c of customers) {
    if (!c.birthDate) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.birthDate.trim());
    if (!match) continue;
    const birthYear = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const ageThisYear = birthYear >= 1900 && birthYear <= refYear ? refYear - birthYear : null;
    const isThisMonth = month === refMonth;
    const isToday = month === refMonth && day === refDay;
    const alreadyGrantedThisYear = grantedYearMap[c.id] === refYear;

    list.push({
      customer: c,
      month,
      day,
      ageThisYear,
      isThisMonth,
      isToday,
      alreadyGrantedThisYear,
    });
  }

  list.sort((a, b) => {
    if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
    if (a.isThisMonth !== b.isThisMonth) return a.isThisMonth ? -1 : 1;
    if (a.month !== b.month) return a.month - b.month;
    if (a.day !== b.day) return a.day - b.day;
    return a.customer.name.localeCompare(b.customer.name, 'id');
  });

  return list;
}


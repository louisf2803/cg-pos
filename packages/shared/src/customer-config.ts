import type { StockItem } from './stock';
import type { Customer } from './types';

export type CustomerFieldType = 'text' | 'number' | 'date' | 'select';

export const CUSTOMER_FIELD_TYPE_LABELS: Record<CustomerFieldType, string> = {
  text: 'Teks singkat',
  number: 'Angka',
  date: 'Tanggal',
  select: 'Pilihan daftar',
};

export interface CustomerCustomField {
  id: string;
  label: string;
  fieldType: CustomerFieldType;
  required: boolean;
  showInReceipt: boolean;
  isActive: boolean;
  options: string[];
  placeholder?: string;
}

export const DEFAULT_CUSTOMER_CUSTOM_FIELDS: CustomerCustomField[] = [
  {
    id: 'cf-preferensi',
    label: 'Preferensi seduh',
    fieldType: 'select',
    required: false,
    showInReceipt: false,
    isActive: true,
    options: ['Less sugar', 'Tanpa es', 'Susu oat', 'Ekstra panas'],
  },
  {
    id: 'cf-instansi',
    label: 'Perusahaan / komunitas',
    fieldType: 'text',
    required: false,
    showInReceipt: true,
    isActive: true,
    options: [],
    placeholder: 'PT Maju Bersama',
  },
  {
    id: 'cf-member-ext',
    label: 'Nomor kartu fisik lama',
    fieldType: 'number',
    required: false,
    showInReceipt: false,
    isActive: false,
    options: [],
  },
];

/** Validasi definisi kolom kustom pelanggan dan cegah pembuatan kolom kata sandi/PIN. */
export function customerCustomFieldProblem(
  input: {
    label: string;
    fieldType: CustomerFieldType;
    options: string[];
    placeholder?: string;
  },
  existing: CustomerCustomField[] = [],
  editingId?: string
): string | null {
  const cleanLabel = input.label.trim();
  if (!cleanLabel) return 'Nama kolom kustom wajib diisi.';
  if (cleanLabel.length > 50) return 'Nama kolom maksimal 50 karakter.';
  if (/(password|kata sandi|\bpin\b|otp|cvv)/i.test(cleanLabel)) {
    return 'Demi keamanan, jangan membuat kolom untuk PIN, kata sandi, atau kode rahasia.';
  }
  const dup = existing.some(
    (f) => f.id !== editingId && f.label.trim().toLowerCase() === cleanLabel.toLowerCase()
  );
  if (dup) return `Kolom "${cleanLabel}" sudah ada.`;

  if (input.fieldType === 'select') {
    const cleanOpts = input.options.map((o) => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      return 'Untuk tipe pilihan daftar, isi minimal 2 opsi pilihan.';
    }
    if (cleanOpts.length > 20) {
      return 'Opsi pilihan daftar maksimal 20 item.';
    }
  }
  if ((input.placeholder ?? '').trim().length > 80) {
    return 'Teks petunjuk maksimal 80 karakter.';
  }
  return null;
}

export interface CustomerPolicySettings {
  requirePhoneOnCreate: boolean;
  uniquePhoneEnforcement: boolean;
  allowCashierCreate: boolean;
  allowCashierEdit: boolean;
  defaultAutoJoinLoyalty: boolean;
  hidePhoneMaskOnReceipt: boolean;
  birthdayReminderDaysBefore: number;
  inactiveCustomerDaysThreshold: number;
}

export const DEFAULT_CUSTOMER_POLICY: CustomerPolicySettings = {
  requirePhoneOnCreate: true,
  uniquePhoneEnforcement: true,
  allowCashierCreate: true,
  allowCashierEdit: true,
  defaultAutoJoinLoyalty: true,
  hidePhoneMaskOnReceipt: false,
  birthdayReminderDaysBefore: 7,
  inactiveCustomerDaysThreshold: 90,
};

/** Validasi aturan kebijakan pengelolaan data pelanggan. */
export function customerPolicyProblem(cfg: CustomerPolicySettings): string | null {
  if (
    !Number.isInteger(cfg.birthdayReminderDaysBefore) ||
    cfg.birthdayReminderDaysBefore < 0 ||
    cfg.birthdayReminderDaysBefore > 30
  ) {
    return 'Pengingat ulang tahun harus antara 0 sampai 30 hari.';
  }
  if (
    !Number.isInteger(cfg.inactiveCustomerDaysThreshold) ||
    cfg.inactiveCustomerDaysThreshold < 7 ||
    cfg.inactiveCustomerDaysThreshold > 730
  ) {
    return 'Batas pelanggan tidak aktif harus antara 7 sampai 730 hari.';
  }
  return null;
}

/** Ringkas kelengkapan profil pelanggan dari daftar pelanggan aktif di server. */
export function evaluateCustomerCompleteness(customers: Customer[]): {
  total: number;
  withPhone: number;
  withEmail: number;
  withBirthDate: number;
  missingPhoneCount: number;
} {
  let withPhone = 0;
  let withEmail = 0;
  let withBirthDate = 0;
  for (const c of customers) {
    if (c.phone && c.phone.trim()) withPhone++;
    if (c.email && c.email.trim()) withEmail++;
    if (c.birthDate && c.birthDate.trim()) withBirthDate++;
  }
  return {
    total: customers.length,
    withPhone,
    withEmail,
    withBirthDate,
    missingPhoneCount: customers.length - withPhone,
  };
}

export interface SatisfactionFeedbackItem {
  id: string;
  customerName: string;
  orderNumber: string;
  channelLabel: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment: string;
  createdAt: string;
}

export const SAMPLE_SATISFACTION_ITEMS: SatisfactionFeedbackItem[] = [
  {
    id: 'sat-1',
    customerName: 'Bu Ani',
    orderNumber: 'ORD-20261110-014',
    channelLabel: 'Dine-in',
    rating: 5,
    tags: ['Rasa produk', 'Kecepatan sajian', 'Keramahan kasir'],
    comment: 'Kopi susu gula aren konsisten enak dan penyajiannya cepat.',
    createdAt: '2026-11-10T09:15:00Z',
  },
  {
    id: 'sat-2',
    customerName: 'Pak Budi',
    orderNumber: 'ORD-20261110-021',
    channelLabel: 'Takeaway',
    rating: 4,
    tags: ['Rasa produk', 'Kebersihan'],
    comment: 'Kemasan rapi, hanya antrean jam makan siang sedikit padat.',
    createdAt: '2026-11-10T12:40:00Z',
  },
  {
    id: 'sat-3',
    customerName: 'Kak Dewi',
    orderNumber: 'ORD-20261111-003',
    channelLabel: 'CG Order QR Meja',
    rating: 5,
    tags: ['Kemudahan pesan', 'Kebersihan'],
    comment: 'Pesan dari QR meja sangat praktis tanpa harus antre ulang.',
    createdAt: '2026-11-11T03:20:00Z',
  },
  {
    id: 'sat-4',
    customerName: 'Tamu Umum',
    orderNumber: 'ORD-20261109-019',
    channelLabel: 'Pesan-Antar',
    rating: 3,
    tags: ['Waktu tunggu'],
    comment: 'Makanan hangat, namun estimasi waktu antar agak terlambat 10 menit.',
    createdAt: '2026-11-09T11:05:00Z',
  },
  {
    id: 'sat-5',
    customerName: 'Pak Hendra',
    orderNumber: 'ORD-20261109-025',
    channelLabel: 'Dine-in',
    rating: 5,
    tags: ['Suasana outlet', 'Keramahan kasir'],
    comment: 'Area duduk nyaman dan staf sangat membantu saat membagi tagihan.',
    createdAt: '2026-11-09T14:50:00Z',
  },
];

/** Hitung ringkasan indeks kepuasan pelanggan dan sebaran rating. */
export function computeSatisfactionSummary(items: SatisfactionFeedbackItem[]): {
  totalCount: number;
  avgScore: number;
  satisfiedPct: number;
  byRating: { score: 5 | 4 | 3 | 2 | 1; count: number; pct: number }[];
  topTags: { tag: string; count: number }[];
} {
  const totalCount = items.length;
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const tagMap = new Map<string, number>();

  let scoreSum = 0;
  let satisfiedCount = 0;

  for (const item of items) {
    scoreSum += item.rating;
    counts[item.rating]++;
    if (item.rating >= 4) satisfiedCount++;
    for (const tag of item.tags) {
      const clean = tag.trim();
      if (!clean) continue;
      tagMap.set(clean, (tagMap.get(clean) ?? 0) + 1);
    }
  }

  const byRating = ([5, 4, 3, 2, 1] as const).map((score) => ({
    score,
    count: counts[score],
    pct: totalCount > 0 ? Math.round((counts[score] / totalCount) * 100) : 0,
  }));

  const topTags = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'id'));

  return {
    totalCount,
    avgScore: totalCount > 0 ? Number((scoreSum / totalCount).toFixed(1)) : 0,
    satisfiedPct: totalCount > 0 ? Math.round((satisfiedCount / totalCount) * 100) : 0,
    byRating,
    topTags,
  };
}

export type WarehouseFilter = 'all' | 'low_or_out' | 'ingredient' | 'goods';

const STATUS_PRIORITY: Record<StockItem['status'], number> = {
  negative: 0,
  out: 1,
  low: 2,
  ok: 3,
};

/** Saring dan urutkan antrean stok untuk tampilan Layar Gudang (habis dan menipis diprioritaskan). */
export function buildWarehouseQueue(
  items: StockItem[],
  filter: WarehouseFilter,
  search: string,
  categoryId = ''
): {
  rows: StockItem[];
  summary: {
    totalItems: number;
    outCount: number;
    lowCount: number;
    okCount: number;
    totalValuation: number;
  };
} {
  let outCount = 0;
  let lowCount = 0;
  let okCount = 0;
  let totalValuation = 0;

  for (const it of items) {
    if (it.status === 'negative' || it.status === 'out') outCount++;
    else if (it.status === 'low') lowCount++;
    else okCount++;
    totalValuation += Math.max(0, Math.round(it.value));
  }

  const q = search.trim().toLowerCase();
  const rows = items
    .filter((it) => {
      if (filter === 'low_or_out' && it.status === 'ok') return false;
      if (filter === 'ingredient' && it.kind !== 'ingredient') return false;
      if (filter === 'goods' && it.kind !== 'goods') return false;
      if (categoryId && it.categoryId !== categoryId) return false;
      if (q) {
        const hay = `${it.name} ${it.unit} ${it.categoryName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
        a.qty - b.qty ||
        a.name.localeCompare(b.name, 'id')
    );

  return {
    rows,
    summary: {
      totalItems: items.length,
      outCount,
      lowCount,
      okCount,
      totalValuation,
    },
  };
}

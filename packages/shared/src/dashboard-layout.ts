/**
 * Helper murni untuk pengelolaan tata letak widget dashboard keuangan (A38).
 */

export type FinanceWidgetId =
  | 'laba-rugi'
  | 'arus-kas'
  | 'saldo-kas'
  | 'posisi-neraca'
  | 'umur-hutang'
  | 'arus-ringkas'
  | 'rekonsiliasi-ringkas';

export interface FinanceWidgetMeta {
  id: FinanceWidgetId;
  title: string;
  subtitle: string;
  description: string;
  category: 'performa' | 'kas' | 'posisi' | 'kontrol';
}

export const FINANCE_WIDGET_CATALOG: readonly FinanceWidgetMeta[] = [
  {
    id: 'laba-rugi',
    title: 'Laba Rugi',
    subtitle: 'Pendapatan, total beban, dan laba bersih',
    description: 'Grafik tren pendapatan, beban, dan laba bersih per hari atau bulan berjalan.',
    category: 'performa',
  },
  {
    id: 'arus-kas',
    title: 'Arus Kas',
    subtitle: 'Penerimaan masuk, pengeluaran keluar, dan saldo bersih',
    description: 'Grafik penerimaan dan pengeluaran kas operasional serta saldo bersih.',
    category: 'kas',
  },
  {
    id: 'saldo-kas',
    title: 'Saldo Kas & Bank',
    subtitle: 'Daftar rekening kas dan bank operasional',
    description: 'Daftar akun kas dan bank aktif beserta saldo terkini dan total likuiditas.',
    category: 'kas',
  },
  {
    id: 'posisi-neraca',
    title: 'Posisi Neraca',
    subtitle: 'Aset, kewajiban liabilitas, dan ekuitas modal',
    description: 'Ringkasan posisi aset, liabilitas, ekuitas, dan status keseimbangan neraca.',
    category: 'posisi',
  },
  {
    id: 'umur-hutang',
    title: 'Umur Hutang',
    subtitle: 'Hutang pembelian belum lunas dan jatuh tempo',
    description: 'Pemantauan faktur pembelian yang belum dibayar menurut kategori umur jatuh tempo.',
    category: 'posisi',
  },
  {
    id: 'arus-ringkas',
    title: 'Penerimaan & Pengeluaran Ringkas',
    subtitle: 'Ringkasan kas masuk vs keluar periode ini',
    description: 'Kartu metrik kilat perbandingan kas masuk, keluar, dan rasio arus kas.',
    category: 'kas',
  },
  {
    id: 'rekonsiliasi-ringkas',
    title: 'Rekonsiliasi Non-tunai Ringkas',
    subtitle: 'Penyelesaian pembayaran kartu, QRIS, dan transfer',
    description: 'Ringkasan status pencocokan penerimaan non-tunai dengan nominal di bank.',
    category: 'kontrol',
  },
];

export const VALID_WIDGET_IDS: readonly FinanceWidgetId[] = FINANCE_WIDGET_CATALOG.map(
  (w) => w.id
);

export const DEFAULT_FINANCE_WIDGETS: readonly FinanceWidgetId[] = [
  'laba-rugi',
  'arus-kas',
  'saldo-kas',
  'posisi-neraca',
];

export const FINANCE_LAYOUT_SCHEMA_VERSION = 1;

export interface FinanceLayoutStorage {
  version: number;
  widgets: FinanceWidgetId[];
  updatedAt?: string;
}

/**
 * Validasi dan migrasi data mentah dari penyimpanan (localStorage) ke daftar widget valid.
 */
export function validateAndMigrateLayout(raw: unknown): FinanceWidgetId[] {
  if (!raw) {
    return [...DEFAULT_FINANCE_WIDGETS];
  }

  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [...DEFAULT_FINANCE_WIDGETS];
    }
  }

  if (!data || typeof data !== 'object') {
    return [...DEFAULT_FINANCE_WIDGETS];
  }

  let rawList: unknown[] = [];

  // Mendukung bentuk format array polos lama (versi 0)
  if (Array.isArray(data)) {
    rawList = data;
  } else {
    const storageObj = data as Partial<FinanceLayoutStorage>;
    if (Array.isArray(storageObj.widgets)) {
      rawList = storageObj.widgets;
    } else {
      return [...DEFAULT_FINANCE_WIDGETS];
    }
  }

  const result: FinanceWidgetId[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (typeof item === 'string' && VALID_WIDGET_IDS.includes(item as FinanceWidgetId)) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item as FinanceWidgetId);
      }
    }
  }

  return result;
}

/**
 * Tambah satu widget baru ke dalam tata letak.
 */
export function addWidgetToLayout(
  current: readonly FinanceWidgetId[],
  id: FinanceWidgetId
): FinanceWidgetId[] {
  if (!VALID_WIDGET_IDS.includes(id)) {
    return [...current];
  }
  if (current.includes(id)) {
    return [...current];
  }
  return [...current, id];
}

/**
 * Hapus widget dari tata letak.
 */
export function removeWidgetFromLayout(
  current: readonly FinanceWidgetId[],
  id: FinanceWidgetId
): FinanceWidgetId[] {
  return current.filter((w) => w !== id);
}

/**
 * Pindahkan posisi urutan widget naik atau turun.
 */
export function moveWidgetInLayout(
  current: readonly FinanceWidgetId[],
  id: FinanceWidgetId,
  direction: 'up' | 'down'
): FinanceWidgetId[] {
  const index = current.indexOf(id);
  if (index === -1) {
    return [...current];
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= current.length) {
    return [...current];
  }

  const updated = [...current];
  const temp = updated[index]!;
  updated[index] = updated[targetIndex]!;
  updated[targetIndex] = temp;

  return updated;
}

/**
 * Ambil daftar widget yang belum terpasang di dashboard.
 */
export function getAvailableWidgets(
  current: readonly FinanceWidgetId[]
): FinanceWidgetMeta[] {
  const activeSet = new Set<string>(current);
  return FINANCE_WIDGET_CATALOG.filter((w) => !activeSet.has(w.id));
}

/**
 * Serialisasi tata letak widget ke JSON terstandarisasi dengan nomor versi skema.
 */
export function serializeFinanceLayout(
  widgets: readonly FinanceWidgetId[]
): string {
  const storage: FinanceLayoutStorage = {
    version: FINANCE_LAYOUT_SCHEMA_VERSION,
    widgets: [...widgets],
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(storage);
}

/**
 * Buat kunci penyimpanan localStorage terisolasi per pengguna.
 */
export function getFinanceLayoutStorageKey(userId?: string): string {
  return `cgpos_finance_layout_${userId && userId.trim() ? userId.trim() : 'default'}`;
}


/**
 * Helper murni untuk pengelolaan kolom tabel dan ekspor (A32).
 */

export interface ColumnDef<TKey extends string = string> {
  key: TKey;
  label: string;
  defaultVisible?: boolean;
  align?: 'left' | 'right' | 'center';
}

export interface ColumnPref<TKey extends string = string> {
  order: TKey[];
  visible: Record<TKey, boolean>;
}

/**
 * Inisialisasi preferensi kolom dari definisi bawaan.
 */
export function initColumnPrefs<TKey extends string>(
  columns: readonly ColumnDef<TKey>[]
): ColumnPref<TKey> {
  const order: TKey[] = [];
  const visible = {} as Record<TKey, boolean>;

  for (const col of columns) {
    order.push(col.key);
    visible[col.key] = col.defaultVisible !== false;
  }

  return { order, visible };
}

/**
 * Gabungkan preferensi tersimpan (mis. dari localStorage) dengan definisi kolom.
 * Aman menangani kolom baru, kolom lama yang dihapus, atau data rusak.
 */
export function mergeColumnPrefs<TKey extends string>(
  columns: readonly ColumnDef<TKey>[],
  saved: unknown
): ColumnPref<TKey> {
  const defaults = initColumnPrefs(columns);
  if (!saved || typeof saved !== 'object') {
    return defaults;
  }

  const raw = saved as Partial<ColumnPref<TKey>>;
  const knownKeys = new Set(columns.map((c) => c.key));

  const validOrder: TKey[] = [];
  const seen = new Set<TKey>();

  if (Array.isArray(raw.order)) {
    for (const k of raw.order) {
      if (typeof k === 'string' && knownKeys.has(k as TKey) && !seen.has(k as TKey)) {
        validOrder.push(k as TKey);
        seen.add(k as TKey);
      }
    }
  }

  // Tambahkan kolom baru yang belum ada di saved.order
  for (const col of columns) {
    if (!seen.has(col.key)) {
      validOrder.push(col.key);
    }
  }

  // Bangun map visibilitas
  const visible = {} as Record<TKey, boolean>;
  const rawVisible = raw.visible && typeof raw.visible === 'object' ? raw.visible : null;

  for (const col of columns) {
    if (rawVisible && typeof rawVisible[col.key] === 'boolean') {
      visible[col.key] = rawVisible[col.key] as boolean;
    } else {
      visible[col.key] = col.defaultVisible !== false;
    }
  }

  return {
    order: validOrder,
    visible,
  };
}

/**
 * Geser posisi kolom dalam urutan (murni tanpa mutasi).
 */
export function moveColumn<TKey extends string>(
  order: readonly TKey[],
  fromIndex: number,
  toIndex: number
): TKey[] {
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    toIndex < 0 ||
    toIndex >= order.length ||
    fromIndex === toIndex
  ) {
    return [...order];
  }

  const next = [...order];
  const item = next[fromIndex];
  if (item === undefined) return [...order];

  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

/**
 * Ubah visibilitas satu kolom (murni).
 */
export function toggleColumnVisibility<TKey extends string>(
  prefs: ColumnPref<TKey>,
  key: TKey
): ColumnPref<TKey> {
  const current = prefs.visible[key] ?? true;
  return {
    order: [...prefs.order],
    visible: {
      ...prefs.visible,
      [key]: !current,
    },
  };
}

/**
 * Kembalikan daftar kolom yang aktif (tampil) terurut sesuai preferensi.
 */
export function getActiveColumns<TKey extends string, TCol extends ColumnDef<TKey>>(
  columns: readonly TCol[],
  prefs: ColumnPref<TKey>
): TCol[] {
  const map = new Map<TKey, TCol>();
  for (const c of columns) {
    map.set(c.key, c);
  }

  const result: TCol[] = [];
  for (const key of prefs.order) {
    const col = map.get(key);
    if (col && prefs.visible[key] !== false) {
      result.push(col);
    }
  }

  return result;
}

/**
 * Cek apakah setidaknya ada 1 kolom yang tampil.
 */
export function hasVisibleColumns<TKey extends string>(
  prefs: ColumnPref<TKey>
): boolean {
  for (const key of prefs.order) {
    if (prefs.visible[key] !== false) {
      return true;
    }
  }
  return false;
}

/**
 * Proyeksikan satu baris data ke dalam array nilai sesuai urutan kolom aktif.
 */
export function projectCsvRow<TKey extends string>(
  rowMap: Partial<Record<TKey, string | number | null | undefined>>,
  activeKeys: readonly TKey[],
  fallback: string | number = ''
): (string | number)[] {
  return activeKeys.map((k) => {
    const val = rowMap[k];
    if (val === null || val === undefined) return fallback;
    return val;
  });
}


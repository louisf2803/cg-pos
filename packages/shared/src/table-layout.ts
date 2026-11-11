/**
 * Helper murni untuk mode denah meja (Grid vs Kustom) dan pengaturan per meja.
 * Dipakai oleh dashboard (dan siap disambungkan ke DataLayer ketika server mendukung).
 */

export type FloorLayoutMode = 'grid' | 'custom';

export type MinBillBehavior = 'wajib' | 'izinkan' | 'tambah_selisih';

export type CustomTableShape = 'persegi' | 'persegi_panjang' | 'bulat';

export type DecorElementType = 'tanaman' | 'dinding' | 'pintu';

export interface DecorElement {
  id: string;
  type: DecorElementType;
  xPct: number;
  yPct: number;
  floorId?: string;
}

export interface TablePosition {
  /** Posisi mendatar dalam persen (0 - 100). */
  xPct: number;
  /** Posisi vertikal dalam persen (0 - 100). */
  yPct: number;
}

export interface TableSettings {
  timeLimitEnabled: boolean;
  timeLimitMinutes: number;
  reminderEnabled: boolean;
  reminderBeforeMinutes: number;
  minBillEnabled: boolean;
  minBill: number;
  minBillMode?: MinBillBehavior;
  labelEnabled: boolean;
  label: string;
}

export const MAX_TABLE_LABEL_LENGTH = 20;

export const MIN_BILL_BEHAVIORS: readonly MinBillBehavior[] = [
  'wajib',
  'izinkan',
  'tambah_selisih',
];

export const DECOR_ELEMENT_TYPES: readonly DecorElementType[] = [
  'tanaman',
  'dinding',
  'pintu',
];

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  timeLimitEnabled: false,
  timeLimitMinutes: 90,
  reminderEnabled: false,
  reminderBeforeMinutes: 15,
  minBillEnabled: false,
  minBill: 100000,
  minBillMode: 'izinkan',
  labelEnabled: false,
  label: '',
};

/** Bulatkan ke satu angka desimal agar koordinat rapi dan stabil saat diserialisasi. */
function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Jepit satu nilai persentase agar tetap berada di rentang [0, 100]. */
export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return roundPct(value);
}

/** Jepit koordinat meja agar xPct dan yPct selalu berada dalam batas 0-100%. */
export function clampTablePosition(pos: TablePosition): TablePosition {
  return {
    xPct: clampPct(pos.xPct),
    yPct: clampPct(pos.yPct),
  };
}

/** Periksa apakah koordinat meja valid (angka finite di rentang [0, 100]). */
export function isValidTablePosition(pos: TablePosition): boolean {
  return (
    Number.isFinite(pos.xPct) &&
    Number.isFinite(pos.yPct) &&
    pos.xPct >= 0 &&
    pos.xPct <= 100 &&
    pos.yPct >= 0 &&
    pos.yPct <= 100
  );
}

/**
 * Hitung posisi grid bawaan (dalam persen 0-100) untuk daftar ID meja.
 * Berguna untuk inisialisasi mode Denah Kustom maupun tombol "Reset ke Grid".
 */
export function defaultGridPositions(
  tableIds: readonly string[],
  columns = 4,
): Record<string, TablePosition> {
  const safeCols = Math.max(1, Math.min(8, Math.floor(columns) || 4));
  const totalRows = Math.max(1, Math.ceil(tableIds.length / safeCols));
  const out: Record<string, TablePosition> = {};

  tableIds.forEach((id, index) => {
    const col = index % safeCols;
    const row = Math.floor(index / safeCols);
    const xPct =
      safeCols === 1 ? 50 : roundPct(8 + (col / (safeCols - 1)) * 84);
    const yPct =
      totalRows === 1 ? 20 : roundPct(8 + (row / (totalRows - 1)) * 78);
    out[id] = clampTablePosition({ xPct, yPct });
  });

  return out;
}

/** Normalisasi label meja: pangkas spasi berlebih tepi dan batasi maksimal 20 karakter. */
export function formatTableLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_TABLE_LABEL_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_TABLE_LABEL_LENGTH).trimEnd();
}

/** Normalisasi dan isi bawaan yang aman untuk objek pengaturan meja. */
export function sanitizeTableSettings(
  input?: Partial<TableSettings> | null,
): TableSettings {
  const base = { ...DEFAULT_TABLE_SETTINGS, ...(input ?? {}) };
  const timeLimitEnabled = Boolean(base.timeLimitEnabled);
  // Pengingat hanya boleh aktif ketika Batas Waktu aktif.
  const reminderEnabled = timeLimitEnabled && Boolean(base.reminderEnabled);
  const timeLimitMinutes = Number.isFinite(base.timeLimitMinutes)
    ? Math.max(1, Math.round(base.timeLimitMinutes))
    : DEFAULT_TABLE_SETTINGS.timeLimitMinutes;
  const reminderBeforeMinutes = Number.isFinite(base.reminderBeforeMinutes)
    ? Math.max(1, Math.round(base.reminderBeforeMinutes))
    : DEFAULT_TABLE_SETTINGS.reminderBeforeMinutes;
  const minBill = Number.isFinite(base.minBill)
    ? Math.max(0, Math.round(base.minBill))
    : DEFAULT_TABLE_SETTINGS.minBill;
  const minBillMode: MinBillBehavior = MIN_BILL_BEHAVIORS.includes(
    base.minBillMode as MinBillBehavior,
  )
    ? (base.minBillMode as MinBillBehavior)
    : 'izinkan';

  return {
    timeLimitEnabled,
    timeLimitMinutes,
    reminderEnabled,
    reminderBeforeMinutes,
    minBillEnabled: Boolean(base.minBillEnabled),
    minBill,
    minBillMode,
    labelEnabled: Boolean(base.labelEnabled),
    label: formatTableLabel(typeof base.label === 'string' ? base.label : ''),
  };
}

/** Validasi pengaturan per meja. */
export function tableSettingsProblem(settings: TableSettings): string | null {
  if (settings.timeLimitEnabled) {
    if (!Number.isInteger(settings.timeLimitMinutes) || settings.timeLimitMinutes < 1) {
      return 'Batas waktu duduk minimal 1 menit.';
    }
    if (settings.timeLimitMinutes > 1440) {
      return 'Batas waktu duduk maksimal 1.440 menit (24 jam).';
    }
    if (settings.reminderEnabled) {
      if (
        !Number.isInteger(settings.reminderBeforeMinutes) ||
        settings.reminderBeforeMinutes < 1
      ) {
        return 'Pengingat waktu minimal 1 menit sebelum waktu habis.';
      }
      if (settings.timeLimitMinutes <= settings.reminderBeforeMinutes) {
        return 'Batas waktu harus lebih besar dari pengingat waktu.';
      }
    }
  }

  if (settings.minBillEnabled) {
    if (!Number.isInteger(settings.minBill) || settings.minBill < 1) {
      return 'Minimum tagihan harus lebih besar dari Rp 0.';
    }
    if (
      settings.minBillMode !== undefined &&
      !MIN_BILL_BEHAVIORS.includes(settings.minBillMode)
    ) {
      return 'Mode perilaku minimum tagihan tidak valid.';
    }
  }

  if (settings.labelEnabled) {
    const trimmed = settings.label.trim();
    if (!trimmed) {
      return 'Label meja tidak boleh kosong saat diaktifkan.';
    }
    if (trimmed.length > MAX_TABLE_LABEL_LENGTH) {
      return `Label meja maksimal ${MAX_TABLE_LABEL_LENGTH} karakter.`;
    }
  }

  return null;
}

/** Ringkas pengaturan meja menjadi chip info singkat untuk tampilan kartu meja. */
export function summarizeTableSettings(settings?: TableSettings | null): string[] {
  if (!settings) return [];
  const tags: string[] = [];
  if (settings.labelEnabled && settings.label.trim()) {
    tags.push(formatTableLabel(settings.label));
  }
  if (settings.timeLimitEnabled) {
    tags.push(
      settings.reminderEnabled
        ? `${settings.timeLimitMinutes} mnt (ingat -${settings.reminderBeforeMinutes})`
        : `${settings.timeLimitMinutes} mnt`,
    );
  }
  if (settings.minBillEnabled && settings.minBill > 0) {
    const modeTag =
      settings.minBillMode === 'wajib'
        ? ' · Wajib'
        : settings.minBillMode === 'tambah_selisih'
          ? ' · +Selisih'
          : '';
    tags.push(`Min Rp ${settings.minBill.toLocaleString('id-ID')}${modeTag}`);
  }
  return tags;
}

/** Buat elemen dekoratif baru dengan koordinat aman 0-100%. */
export function createDecorElement(
  id: string,
  type: DecorElementType,
  xPct = 50,
  yPct = 50,
  floorId?: string,
): DecorElement {
  const pos = clampTablePosition({ xPct, yPct });
  return {
    id,
    type,
    xPct: pos.xPct,
    yPct: pos.yPct,
    ...(floorId ? { floorId } : {}),
  };
}

/** Sanitasi daftar elemen dekoratif dari JSON tersimpan (abaikan entri cacat). */
export function sanitizeDecorElements(raw: unknown): DecorElement[] {
  if (!Array.isArray(raw)) return [];
  const out: DecorElement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<DecorElement>;
    if (
      typeof obj.id !== 'string' ||
      !obj.id.trim() ||
      !DECOR_ELEMENT_TYPES.includes(obj.type as DecorElementType)
    ) {
      continue;
    }
    const pos = clampTablePosition({
      xPct: typeof obj.xPct === 'number' ? obj.xPct : 50,
      yPct: typeof obj.yPct === 'number' ? obj.yPct : 50,
    });
    out.push({
      id: obj.id,
      type: obj.type as DecorElementType,
      xPct: pos.xPct,
      yPct: pos.yPct,
      ...(typeof obj.floorId === 'string' && obj.floorId ? { floorId: obj.floorId } : {}),
    });
  }
  return out;
}


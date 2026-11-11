export interface ExportRecord {
  id: string;
  reportName: string;
  period: string;
  timestamp: string;
  rowCount: number;
  sizeBytes: number;
  fileName: string;
  sourceUrl?: string;
  params?: Record<string, string | number | boolean>;
}

export interface ExportInput {
  id?: string;
  reportName: string;
  period: string;
  timestamp?: string;
  rowCount: number;
  sizeBytes: number;
  fileName: string;
  sourceUrl?: string;
  params?: Record<string, string | number | boolean>;
}

export const EXPORT_HISTORY_STORAGE_KEY = 'cgpos_export_history_v1';
export const MAX_EXPORT_HISTORY = 50;

/**
 * Format ukuran berkas dalam satuan B, KB, atau MB menggunakan format angka Indonesia (, desimal).
 */
export function formatFileSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1).replace('.', ',');
    return `${kb.endsWith(',0') ? kb.slice(0, -2) : kb} KB`;
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
  return `${mb.endsWith(',0') ? mb.slice(0, -2) : mb} MB`;
}

/**
 * Format cap waktu ISO 8601 ke string waktu lokal Indonesia (Asia/Jakarta).
 * Contoh: "11 Nov 2026, 02:40 WIB"
 */
export function formatExportDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    let day = '';
    let month = '';
    let year = '';
    let hour = '00';
    let minute = '00';

    for (const p of parts) {
      if (p.type === 'day') day = p.value;
      if (p.type === 'month') month = p.value;
      if (p.type === 'year') year = p.value;
      if (p.type === 'hour') hour = p.value;
      if (p.type === 'minute') minute = p.value;
    }

    return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
  } catch {
    return isoString;
  }
}

/**
 * Validasi dan normalisasi rekaman ekspor dari sumber mentah (misal localStorage).
 * Mengabaikan elemen korup dan membatasi jumlah maksimal 50.
 */
export function validateAndMigrateExportHistory(raw: unknown): ExportRecord[] {
  let list: unknown[] = [];

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    return [];
  }

  const result: ExportRecord[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : '';
    const reportName = typeof rec.reportName === 'string' && rec.reportName.trim() ? rec.reportName.trim() : '';
    const period = typeof rec.period === 'string' && rec.period.trim() ? rec.period.trim() : '-';
    const timestamp = typeof rec.timestamp === 'string' && rec.timestamp.trim() ? rec.timestamp.trim() : '';
    const fileName = typeof rec.fileName === 'string' && rec.fileName.trim() ? rec.fileName.trim() : '';
    const rowCount = typeof rec.rowCount === 'number' && !isNaN(rec.rowCount) && rec.rowCount >= 0 ? Math.floor(rec.rowCount) : 0;
    const sizeBytes = typeof rec.sizeBytes === 'number' && !isNaN(rec.sizeBytes) && rec.sizeBytes >= 0 ? Math.floor(rec.sizeBytes) : 0;

    if (!id || !reportName || !timestamp || !fileName) continue;

    const sourceUrl = typeof rec.sourceUrl === 'string' && rec.sourceUrl.trim() ? rec.sourceUrl.trim() : undefined;
    const params = rec.params && typeof rec.params === 'object' && !Array.isArray(rec.params)
      ? (rec.params as Record<string, string | number | boolean>)
      : undefined;

    result.push({
      id,
      reportName,
      period,
      timestamp,
      rowCount,
      sizeBytes,
      fileName,
      sourceUrl,
      params,
    });
  }

  return result.slice(0, MAX_EXPORT_HISTORY);
}

/**
 * Menambahkan rekaman ekspor baru ke riwayat.
 * - Terbaru ditaruh paling atas (indeks 0).
 * - Jika ada duplikat (id sama, atau kombinasi nama laporan + periode + fileName yang sama), yang lama digantikan.
 * - Membatasi maksimal maxLimit entri (bawaan 50).
 */
export function recordExport(
  history: ExportRecord[],
  newEntry: ExportInput,
  maxLimit = MAX_EXPORT_HISTORY
): ExportRecord[] {
  const timestamp = newEntry.timestamp || new Date().toISOString();
  const id = newEntry.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const record: ExportRecord = {
    id,
    reportName: newEntry.reportName.trim() || 'Laporan',
    period: newEntry.period.trim() || '-',
    timestamp,
    rowCount: Math.max(0, Math.floor(newEntry.rowCount || 0)),
    sizeBytes: Math.max(0, Math.floor(newEntry.sizeBytes || 0)),
    fileName: newEntry.fileName.trim() || 'laporan.csv',
    sourceUrl: newEntry.sourceUrl,
    params: newEntry.params,
  };

  // Bersihkan rekaman serupa sebelumnya agar tidak ada duplikasi identik
  const filtered = history.filter((item) => {
    if (item.id === record.id) return false;
    // Cek duplikasi konten laporan yang sama pada periode dan berkas yang sama
    const sameReport = item.reportName.toLowerCase() === record.reportName.toLowerCase();
    const samePeriod = item.period.toLowerCase() === record.period.toLowerCase();
    const sameFile = item.fileName.toLowerCase() === record.fileName.toLowerCase();
    return !(sameReport && samePeriod && sameFile);
  });

  return [record, ...filtered].slice(0, Math.max(1, maxLimit));
}

/**
 * Menghapus rekaman ekspor berdasarkan id.
 */
export function deleteExport(history: ExportRecord[], id: string): ExportRecord[] {
  return history.filter((item) => item.id !== id);
}

/**
 * Mengosongkan seluruh riwayat ekspor.
 */
export function clearExportHistory(): ExportRecord[] {
  return [];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Muat riwayat ekspor dari storage dengan penanganan galat aman.
 */
export function loadExportHistoryFromStorage(storage?: KeyValueStorage): {
  records: ExportRecord[];
  error?: string;
} {
  try {
    let s = storage;
    if (!s && typeof globalThis !== 'undefined') {
      const g = globalThis as { localStorage?: KeyValueStorage };
      if (typeof g.localStorage !== 'undefined') {
        s = g.localStorage;
      }
    }
    if (!s) return { records: [] };
    const raw = s.getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (!raw) return { records: [] };
    const records = validateAndMigrateExportHistory(raw);
    return { records };
  } catch (err) {
    return {
      records: [],
      error: err instanceof Error ? err.message : 'Gagal mengakses penyimpanan lokal browser.',
    };
  }
}

/**
 * Simpan riwayat ekspor ke storage dengan penanganan galat aman (misal QuotaExceededError).
 */
export function saveExportHistoryToStorage(
  records: ExportRecord[],
  storage?: KeyValueStorage
): { success: boolean; error?: string } {
  try {
    let s = storage;
    if (!s && typeof globalThis !== 'undefined') {
      const g = globalThis as { localStorage?: KeyValueStorage };
      if (typeof g.localStorage !== 'undefined') {
        s = g.localStorage;
      }
    }
    if (!s) return { success: false, error: 'Penyimpanan lokal tidak tersedia' };
    s.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_EXPORT_HISTORY)));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal menyimpan ke penyimpanan lokal browser.',
    };
  }
}

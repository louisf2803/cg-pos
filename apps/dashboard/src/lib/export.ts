import {
  loadExportHistoryFromStorage,
  recordExport,
  saveExportHistoryToStorage,
  type ExportInput,
} from '@cgpos/shared';

export interface DownloadCsvOptions {
  fileName: string;
  csvContent: string;
  reportName: string;
  period: string;
  rowCount?: number;
  sourceUrl?: string;
  params?: Record<string, string | number | boolean>;
}

export interface DownloadXlsxOptions {
  fileName: string;
  bytes: Uint8Array;
  reportName: string;
  period: string;
  rowCount: number;
  sourceUrl?: string;
  params?: Record<string, string | number | boolean>;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function triggerBlobDownload(blob: Blob, fileName: string): number {
  if (typeof window === 'undefined') return 0;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
}

function appendExportHistory(input: Omit<ExportInput, 'timestamp'>): void {
  const { records } = loadExportHistoryFromStorage();
  const updated = recordExport(records, { ...input, timestamp: new Date().toISOString() });
  saveExportHistoryToStorage(updated);
  try {
    window.dispatchEvent(new CustomEvent('cgpos-export-history-changed'));
  } catch {
    // Abaikan jika lingkungan tidak mendukung CustomEvent
  }
}

/** Memicu unduhan berkas CSV di peramban dan mengembalikan ukuran byte-nya. */
export function triggerCsvDownload(csvContent: string, fileName: string): number {
  return triggerBlobDownload(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), fileName);
}

/** Memicu unduhan berkas Excel (.xlsx) di peramban dan mengembalikan ukuran byte-nya. */
export function triggerXlsxDownload(bytes: Uint8Array, fileName: string): number {
  return triggerBlobDownload(new Blob([new Uint8Array(bytes)], { type: XLSX_MIME }), fileName);
}

/** Mengunduh berkas Excel (.xlsx) dan mencatat metadatanya ke riwayat ekspor lokal. */
export function downloadXlsxWithHistory(options: DownloadXlsxOptions): void {
  if (typeof window === 'undefined') return;
  const sizeBytes = triggerXlsxDownload(options.bytes, options.fileName);
  appendExportHistory({
    reportName: options.reportName,
    period: options.period,
    rowCount: options.rowCount,
    sizeBytes,
    fileName: options.fileName,
    sourceUrl: options.sourceUrl,
    params: options.params,
  });
}

/**
 * Mengunduh berkas CSV dan otomatis mencatat riwayat ekspor ke penyimpanan lokal.
 */
export function downloadCsvWithHistory(options: DownloadCsvOptions): void {
  if (typeof window === 'undefined') return;

  const sizeBytes = triggerCsvDownload(options.csvContent, options.fileName);

  // Hitung jumlah baris jika tidak disediakan eksplisit
  let rowCount = options.rowCount;
  if (rowCount === undefined) {
    const rawLines = options.csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // Asumsikan baris pertama adalah judul/header kolom
    rowCount = Math.max(0, rawLines.length > 1 ? rawLines.length - 1 : rawLines.length);
  }

  // Catat ke riwayat (isi berkas dalam batas ukuran ikut disimpan agar bisa diunduh ulang)
  appendExportHistory({
    reportName: options.reportName,
    period: options.period,
    rowCount,
    sizeBytes,
    fileName: options.fileName,
    sourceUrl: options.sourceUrl,
    params: options.params,
    csvContent: options.csvContent,
  });
}

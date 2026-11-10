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

/**
 * Mengunduh berkas CSV dan otomatis mencatat riwayat ekspor ke penyimpanan lokal.
 */
export function downloadCsvWithHistory(options: DownloadCsvOptions): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([options.csvContent], { type: 'text/csv;charset=utf-8' });
  const sizeBytes = blob.size;

  // Hitung jumlah baris jika tidak disediakan eksplisit
  let rowCount = options.rowCount;
  if (rowCount === undefined) {
    const rawLines = options.csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // Asumsikan baris pertama adalah judul/header kolom
    rowCount = Math.max(0, rawLines.length > 1 ? rawLines.length - 1 : rawLines.length);
  }

  // Unduh berkas di peramban
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Catat ke riwayat
  const input: ExportInput = {
    reportName: options.reportName,
    period: options.period,
    rowCount,
    sizeBytes,
    fileName: options.fileName,
    sourceUrl: options.sourceUrl,
    params: options.params,
    timestamp: new Date().toISOString(),
  };

  const { records } = loadExportHistoryFromStorage();
  const updated = recordExport(records, input);
  saveExportHistoryToStorage(updated);

  // Kirim event agar komponen riwayat yang sedang aktif langsung diperbarui
  try {
    window.dispatchEvent(new CustomEvent('cgpos-export-history-changed'));
  } catch {
    // Abaikan jika lingkungan tidak mendukung CustomEvent
  }
}

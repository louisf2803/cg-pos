import { describe, expect, it } from 'vitest';
import {
  clearExportHistory,
  deleteExport,
  formatExportDate,
  formatFileSize,
  loadExportHistoryFromStorage,
  MAX_EXPORT_HISTORY,
  MAX_STORED_CSV_BYTES,
  recordExport,
  saveExportHistoryToStorage,
  utf8ByteLength,
  validateAndMigrateExportHistory,
  type ExportRecord,
  type KeyValueStorage,
} from '../src/export-history';

describe('export-history', () => {
  const dummy1: ExportRecord = {
    id: 'exp_1',
    reportName: 'Detail Penjualan',
    period: '01/11/2026 - 10/11/2026',
    timestamp: '2026-11-10T10:00:00.000Z',
    rowCount: 25,
    sizeBytes: 2048,
    fileName: 'penjualan-nov.csv',
    sourceUrl: '/laporan/penjualan',
  };

  const dummy2: ExportRecord = {
    id: 'exp_2',
    reportName: 'Laporan Kas',
    period: 'Hari ini',
    timestamp: '2026-11-10T11:00:00.000Z',
    rowCount: 10,
    sizeBytes: 1024,
    fileName: 'kas-hari-ini.csv',
    sourceUrl: '/keuangan/kas',
  };

  describe('recordExport', () => {
    it('menambahkan ekspor baru di posisi paling atas (terbaru)', () => {
      const initial = [dummy1];
      const result = recordExport(initial, {
        reportName: 'Laporan Produk',
        period: 'Minggu ini',
        rowCount: 50,
        sizeBytes: 4096,
        fileName: 'produk.csv',
      });

      expect(result).toHaveLength(2);
      expect(result[0].reportName).toBe('Laporan Produk');
      expect(result[0].rowCount).toBe(50);
      expect(result[1]).toEqual(dummy1);
    });

    it('membatasi jumlah riwayat maksimal 50 entri', () => {
      let history: ExportRecord[] = [];
      for (let i = 0; i < 60; i++) {
        history = recordExport(history, {
          id: `id_${i}`,
          reportName: `Laporan ${i}`,
          period: 'Periode',
          rowCount: i,
          sizeBytes: i * 100,
          fileName: `file_${i}.csv`,
        });
      }

      expect(history).toHaveLength(MAX_EXPORT_HISTORY);
      expect(history[0].reportName).toBe('Laporan 59');
      expect(history[history.length - 1].reportName).toBe('Laporan 10');
    });

    it('menangani duplikasi: memperbarui dan memindahkan ke atas bila laporan & berkas sama', () => {
      const initial = [dummy1, dummy2];
      const updated = recordExport(initial, {
        reportName: 'Detail Penjualan',
        period: '01/11/2026 - 10/11/2026',
        rowCount: 30, // baris bertambah
        sizeBytes: 2500,
        fileName: 'penjualan-nov.csv',
      });

      expect(updated).toHaveLength(2);
      expect(updated[0].reportName).toBe('Detail Penjualan');
      expect(updated[0].rowCount).toBe(30);
      expect(updated[1].id).toBe('exp_2');
    });

    it('menangani duplikasi berdasarkan id yang sama', () => {
      const initial = [dummy1, dummy2];
      const updated = recordExport(initial, {
        id: 'exp_1',
        reportName: 'Detail Penjualan Baru',
        period: 'Bulan Ini',
        rowCount: 99,
        sizeBytes: 8888,
        fileName: 'penjualan-baru.csv',
      });

      expect(updated).toHaveLength(2);
      expect(updated[0].id).toBe('exp_1');
      expect(updated[0].reportName).toBe('Detail Penjualan Baru');
      expect(updated[1].id).toBe('exp_2');
    });
  });

  describe('deleteExport & clearExportHistory', () => {
    it('menghapus rekaman berdasarkan id', () => {
      const history = [dummy1, dummy2];
      const result = deleteExport(history, 'exp_1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('exp_2');
    });

    it('mengosongkan seluruh riwayat', () => {
      const cleared = clearExportHistory();
      expect(cleared).toEqual([]);
    });
  });

  describe('formatFileSize', () => {
    it('memformat ukuran byte, kilobyte, dan megabyte dalam format Indonesia', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-10)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1,5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(2621440)).toBe('2,5 MB');
    });
  });

  describe('formatExportDate', () => {
    it('memformat ISO string ke waktu Asia/Jakarta', () => {
      const formatted = formatExportDate('2026-11-10T03:00:00.000Z');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('WIB');
    });

    it('mengembalikan string asal bila tanggal tidak valid', () => {
      expect(formatExportDate('tanggal-ngawur')).toBe('tanggal-ngawur');
    });
  });

  describe('validateAndMigrateExportHistory', () => {
    it('memvalidasi dan menyaring data JSON mentah atau array tidak valid', () => {
      expect(validateAndMigrateExportHistory(null)).toEqual([]);
      expect(validateAndMigrateExportHistory('{ "invalid": true }')).toEqual([]);
      expect(validateAndMigrateExportHistory('bukan json')).toEqual([]);

      const rawValid = [
        dummy1,
        { corrupt: true },
        { id: 'exp_partial', reportName: 'Test' }, // kurang field
        dummy2,
      ];

      const validated = validateAndMigrateExportHistory(JSON.stringify(rawValid));
      expect(validated).toHaveLength(2);
      expect(validated[0].id).toBe('exp_1');
      expect(validated[1].id).toBe('exp_2');
    });
  });

  describe('load & save storage', () => {
    it('menyimpan dan memuat kembali dari mock storage', () => {
      const mockStorage: Record<string, string> = {};
      const storageApi: KeyValueStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => { mockStorage[k] = v; },
        removeItem: (k) => { delete mockStorage[k]; },
      };

      const saveRes = saveExportHistoryToStorage([dummy1], storageApi);
      expect(saveRes.success).toBe(true);

      const loadRes = loadExportHistoryFromStorage(storageApi);
      expect(loadRes.records).toHaveLength(1);
      expect(loadRes.records[0].id).toBe('exp_1');
    });

    it('menangani galat storage bila melempar eksepsi (QuotaExceeded / SecurityError)', () => {
      const errorStorage: KeyValueStorage = {
        getItem: () => { throw new Error('Quota exceeded or security error'); },
        setItem: () => { throw new Error('Quota exceeded'); },
        removeItem: () => {},
      };

      const loadRes = loadExportHistoryFromStorage(errorStorage);
      expect(loadRes.records).toEqual([]);
      expect(loadRes.error).toContain('Quota exceeded');

      const saveRes = saveExportHistoryToStorage([dummy1], errorStorage);
      expect(saveRes.success).toBe(false);
      expect(saveRes.error).toContain('Quota exceeded');
    });

    it('menyimpan isi CSV dalam batas ukuran dan memangkas isi terlama saat kuota terbatas', () => {
      expect(utf8ByteLength('Halo café')).toBe(10);

      const smallCsv = '\ufeffNama;Total\nEspresso;15000';
      const hugeCsv = 'x'.repeat(MAX_STORED_CSV_BYTES + 10);
      let list = recordExport([], {
        id: 'exp_old',
        reportName: 'Laporan Lama',
        period: 'Kemarin',
        rowCount: 1,
        sizeBytes: smallCsv.length,
        fileName: 'lama.csv',
        csvContent: smallCsv,
      });
      list = recordExport(list, {
        id: 'exp_new',
        reportName: 'Laporan Baru',
        period: 'Hari ini',
        rowCount: 1,
        sizeBytes: smallCsv.length,
        fileName: 'baru.csv',
        csvContent: smallCsv,
      });
      list = recordExport(list, {
        id: 'exp_huge',
        reportName: 'Laporan Besar',
        period: 'Bulan ini',
        rowCount: 5000,
        sizeBytes: hugeCsv.length,
        fileName: 'besar.csv',
        csvContent: hugeCsv,
      });

      expect(list[0].csvContent).toBeUndefined();
      expect(list[1].csvContent).toBe(smallCsv);
      expect(list[2].csvContent).toBe(smallCsv);

      const store: Record<string, string> = {};
      const tightStorage: KeyValueStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => {
          const parsed = JSON.parse(v) as ExportRecord[];
          if (parsed.filter((r) => !!r.csvContent).length > 1) {
            throw new Error('QuotaExceededError');
          }
          store[k] = v;
        },
      };

      const res = saveExportHistoryToStorage(list, tightStorage);
      expect(res.success).toBe(true);
      const loaded = loadExportHistoryFromStorage(tightStorage).records;
      expect(loaded).toHaveLength(3);
      expect(loaded[1].csvContent).toBe(smallCsv);
      expect(loaded[2].csvContent).toBeUndefined();
    });
  });
});

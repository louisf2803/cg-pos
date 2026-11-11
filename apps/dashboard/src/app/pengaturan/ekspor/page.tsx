'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Database,
  FileSpreadsheet,
  History,
  Layers,
  Search,
  Trash2,
} from 'lucide-react';
import {
  clearExportHistory,
  deleteExport,
  formatExportDate,
  formatFileSize,
  loadExportHistoryFromStorage,
  saveExportHistoryToStorage,
  type ExportRecord,
} from '@cgpos/shared';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

export default function ExportHistoryPage() {
  const [records, setRecords] = useState<ExportRecord[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const loadRecords = useCallback(() => {
    const { records: loaded, error } = loadExportHistoryFromStorage();
    setRecords(loaded);
    if (error) {
      setStorageError(error);
    } else {
      setStorageError(null);
    }
  }, []);

  useEffect(() => {
    loadRecords();

    const onStorageChange = () => {
      loadRecords();
    };

    window.addEventListener('cgpos-export-history-changed', onStorageChange);
    window.addEventListener('storage', onStorageChange);

    return () => {
      window.removeEventListener('cgpos-export-history-changed', onStorageChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [loadRecords]);

  const handleDelete = (id: string, name: string) => {
    const updated = deleteExport(records, id);
    setRecords(updated);
    saveExportHistoryToStorage(updated);
    setStatusNotice(`Riwayat ekspor "${name}" berhasil dihapus.`);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleConfirmClear = () => {
    const cleared = clearExportHistory();
    setRecords(cleared);
    saveExportHistoryToStorage(cleared);
    setIsClearing(false);
    setStatusNotice('Seluruh riwayat ekspor berhasil dibersihkan.');
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.reportName.toLowerCase().includes(q) ||
        r.fileName.toLowerCase().includes(q) ||
        r.period.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  const totalRowsSum = useMemo(() => {
    return records.reduce((acc, r) => acc + r.rowCount, 0);
  }, [records]);

  const totalBytesSum = useMemo(() => {
    return records.reduce((acc, r) => acc + r.sizeBytes, 0);
  }, [records]);

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Riwayat ekspor CSV"
        subtitle="Mencatat berkas ekspor laporan yang pernah diunduh pada peramban ini (maksimal 50 berkas terbaru)."
        actions={
          records.length > 0 ? (
            <button
              type="button"
              className="cg-btn cg-btn--secondary text-danger"
              onClick={() => setIsClearing(true)}
            >
              <Trash2 className="w-[14px] h-[14px] mr-4" aria-hidden />
              Bersihkan riwayat
            </button>
          ) : undefined
        }
      />

      {storageError && (
        <div className="cg-banner cg-banner--warning flex items-start gap-12" role="alert">
          <AlertTriangle className="w-20 h-20 text-warning shrink-0 mt-[2px]" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">Akses penyimpanan lokal terbatas</p>
            <p className="text-text-muted text-sm">{storageError}</p>
          </div>
        </div>
      )}

      {statusNotice && (
        <div className="cg-banner cg-banner--success flex items-center justify-between" role="status">
          <span>{statusNotice}</span>
          <button
            type="button"
            className="text-text-muted hover:text-text-primary text-sm underline ml-12"
            onClick={() => setStatusNotice(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Ringkasan metrik */}
      <div className="grid gap-16 grid-cols-1 tablet:grid-cols-3">
        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
            <History className="w-24 h-24 text-accent" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm">Total ekspor tersimpan</p>
            <p className="text-xl font-bold text-text-primary cg-num">
              {records.length} <span className="text-sm font-normal text-text-muted">berkas</span>
            </p>
          </div>
        </div>

        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
            <Layers className="w-24 h-24 text-accent" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm">Total baris data</p>
            <p className="text-xl font-bold text-text-primary cg-num">
              {totalRowsSum.toLocaleString('id-ID')} <span className="text-sm font-normal text-text-muted">baris</span>
            </p>
          </div>
        </div>

        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
            <Database className="w-24 h-24 text-accent" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm">Ukuran kumulatif</p>
            <p className="text-xl font-bold text-text-primary cg-num">
              {formatFileSize(totalBytesSum)}
            </p>
          </div>
        </div>
      </div>

      {/* Kontrol pencarian & filter */}
      {records.length > 0 && (
        <div className="flex flex-col tablet:flex-row items-stretch tablet:items-center justify-between gap-12">
          <div className="relative flex-1 max-w-[480px]">
            <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input
              type="text"
              className="cg-input pl-[36px] w-full"
              placeholder="Cari nama laporan, periode, atau nama berkas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari riwayat ekspor"
            />
          </div>
          <p className="text-text-muted text-sm">
            Menampilkan <strong className="text-text-primary">{filteredRecords.length}</strong> dari {records.length} berkas
          </p>
        </div>
      )}

      {/* Daftar berkas */}
      {records.length === 0 ? (
        <div className="cg-empty py-48 text-center bg-bg-card rounded-lg border border-border">
          <div className="w-48 h-48 mx-auto mb-16 rounded-full bg-accent-soft flex items-center justify-center">
            <FileSpreadsheet className="w-24 h-24 text-accent" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-8">Belum ada riwayat ekspor data</h2>
          <p className="text-text-muted max-w-[480px] mx-auto text-sm mb-24">
            Setiap kali Anda menekan tombol &apos;Unduh CSV&apos; pada modul Laporan atau Keuangan,
            catatannya akan otomatis tersimpan di sini agar mudah ditinjau atau dibuka kembali.
          </p>
          <div className="flex items-center justify-center gap-12">
            <Link href="/laporan/penjualan" className="cg-btn cg-btn--primary">
              Buka Laporan Penjualan
            </Link>
            <Link href="/laporan/periode" className="cg-btn cg-btn--secondary">
              Laporan Periode
            </Link>
          </div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="cg-card p-32 text-center">
          <p className="text-text-primary font-medium mb-4">Tidak ada riwayat ekspor yang cocok</p>
          <p className="text-text-muted text-sm mb-16">
            Pencarian &quot;{searchQuery}&quot; tidak menemukan berkas laporan apa pun.
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={() => setSearchQuery('')}
          >
            Hapus filter pencarian
          </button>
        </div>
      ) : (
        <div className="space-y-16">
          {/* Tampilan tabel untuk desktop & tablet */}
          <div className="hidden tablet:block min-w-0 overflow-x-auto rounded-lg border border-border bg-bg-card">
            <table className="cg-table w-full text-left text-sm">
              <thead className="bg-bg-subtle text-text-muted border-b border-border">
                <tr>
                  <th className="p-16 font-medium">Laporan &amp; Periode</th>
                  <th className="p-16 font-medium">Nama Berkas</th>
                  <th className="p-16 font-medium">Waktu Ekspor</th>
                  <th className="p-16 font-medium text-right">Jumlah Baris</th>
                  <th className="p-16 font-medium text-right">Ukuran</th>
                  <th className="p-16 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-bg-subtle transition-colors">
                    <td className="p-16">
                      <p className="font-semibold text-text-primary">{item.reportName}</p>
                      <p className="text-text-muted text-xs mt-[2px]">{item.period}</p>
                    </td>
                    <td className="p-16 font-mono text-xs text-text-secondary max-w-[200px] truncate" title={item.fileName}>
                      {item.fileName}
                    </td>
                    <td className="p-16 text-text-secondary whitespace-nowrap text-xs">
                      {formatExportDate(item.timestamp)}
                    </td>
                    <td className="p-16 text-right whitespace-nowrap">
                      <span className="cg-badge cg-badge--neutral font-mono">
                        {item.rowCount.toLocaleString('id-ID')} baris
                      </span>
                    </td>
                    <td className="p-16 text-right whitespace-nowrap text-text-primary font-medium">
                      {formatFileSize(item.sizeBytes)}
                    </td>
                    <td className="p-16 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-8">
                        {item.sourceUrl ? (
                          <Link
                            href={item.sourceUrl}
                            className="cg-btn cg-btn--secondary cg-btn--sm"
                            title="Buka halaman laporan untuk mengunduh ulang data terkini"
                          >
                            <span>Buka Laporan</span>
                            <ArrowUpRight className="w-[12px] h-[12px] ml-4" aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-text-muted text-xs italic">-</span>
                        )}
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          onClick={() => handleDelete(item.id, item.reportName)}
                          title="Hapus rekaman ini dari riwayat"
                          aria-label={`Hapus ${item.reportName}`}
                        >
                          <Trash2 className="w-16 h-16" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tampilan kartu untuk layar mobile (<= 768px) */}
          <div className="block tablet:hidden space-y-12 min-w-0">
            {filteredRecords.map((item) => (
              <div key={item.id} className="cg-card p-16 space-y-12">
                <div className="flex items-start justify-between gap-8">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary leading-tight">{item.reportName}</p>
                    <p className="text-text-muted text-xs mt-4">{item.period}</p>
                  </div>
                  <span className="cg-badge cg-badge--neutral shrink-0 text-xs font-mono">
                    {item.rowCount.toLocaleString('id-ID')} baris
                  </span>
                </div>

                <div className="text-xs text-text-secondary font-mono truncate bg-bg-subtle p-8 rounded border border-border">
                  {item.fileName}
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted pt-4 border-t border-border">
                  <span>{formatExportDate(item.timestamp)}</span>
                  <span className="font-medium text-text-primary">{formatFileSize(item.sizeBytes)}</span>
                </div>

                <div className="flex items-center justify-end gap-8 pt-4">
                  {item.sourceUrl && (
                    <Link
                      href={item.sourceUrl}
                      className="cg-btn cg-btn--secondary cg-btn--sm flex-1 justify-center"
                    >
                      <span>Buka Laporan</span>
                      <ArrowUpRight className="w-[12px] h-[12px] ml-4" aria-hidden />
                    </Link>
                  )}
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm text-danger px-12"
                    onClick={() => handleDelete(item.id, item.reportName)}
                    aria-label={`Hapus ${item.reportName}`}
                  >
                    <Trash2 className="w-16 h-16 mr-4" aria-hidden />
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal konfirmasi bersihkan riwayat */}
      {isClearing && <ClearConfirmDialog onCancel={() => setIsClearing(false)} onConfirm={handleConfirmClear} />}
    </div>
  );
}

function ClearConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const d = useDialog(onCancel);

  return (
    <dialog {...d.props} aria-labelledby="judul-bersihkan-ekspor">
      <div className="p-24 space-y-16">
        <div className="flex items-start gap-16">
          <div className="w-40 h-40 rounded-full bg-danger-soft text-danger flex items-center justify-center shrink-0">
            <Trash2 className="w-20 h-20" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="judul-bersihkan-ekspor" className="text-lg font-bold text-text-primary">
              Bersihkan seluruh riwayat ekspor?
            </h2>
            <p className="text-text-muted text-sm mt-4">
              Semua daftar riwayat unduhan berkas CSV akan dihapus dari peramban ini. Berkas CSV yang telah
              tersimpan di komputer Anda tidak akan terhapus.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-12 pt-8">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onCancel}>
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--danger" onClick={onConfirm}>
            Ya, bersihkan riwayat
          </button>
        </div>
      </div>
    </dialog>
  );
}

'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  exportProductsToCsv,
  formatRp,
  generateProductTemplateCsv,
  parseProductCsv,
  type ParseProductCsvResult,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory, triggerCsvDownload } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ImporEksporProduk() {
  const data = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'error'>('all');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsed, setParsed] = useState<ParseProductCsvResult | null>(null);
  const [parseErr, setParseErr] = useState('');

  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ success: number; skipped: number; failed: number } | null>(null);

  const state = useAsync(async () => {
    const [catalog, categories] = await Promise.all([
      data.listCatalog({ includeInactive: true }),
      data.listCategories(),
    ]);
    return { catalog, categories };
  }, [data]);

  function handleDownloadSample() {
    const csv = generateProductTemplateCsv();
    triggerCsvDownload(csv, 'contoh-produk.csv');
  }

  function handleExportCsv() {
    if (state.status !== 'ready') return;
    const csv = exportProductsToCsv(state.data.catalog, state.data.categories);
    const todayStr = getTodayString();
    downloadCsvWithHistory({
      fileName: `produk-${todayStr}.csv`,
      csvContent: csv,
      reportName: 'Ekspor Katalog Produk',
      period: todayStr,
      rowCount: state.data.catalog.length,
      sourceUrl: '/produk/impor',
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setParseErr('');
    setParsed(null);
    setSummary(null);
    setProgress(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? '');
        if (state.status !== 'ready') {
          setParseErr('Data katalog belum siap. Silakan coba sesaat lagi.');
          return;
        }
        const res = parseProductCsv(text, state.data.categories, state.data.catalog);
        if (res.headerError) {
          setParseErr(res.headerError);
        } else {
          setParsed(res);
        }
      } catch (err) {
        setParseErr(err instanceof Error ? err.message : 'Gagal membaca berkas CSV.');
      }
    };
    reader.onerror = () => {
      setParseErr('Gagal membuka berkas CSV yang dipilih.');
    };
    reader.readAsText(file);
  }

  function handleReset() {
    setSelectedFileName('');
    setParsed(null);
    setParseErr('');
    setSummary(null);
    setProgress(null);
    setApplying(false);
    cancelRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleApply() {
    if (!parsed || applying || state.status !== 'ready') return;
    const validRows = parsed.rows.filter((r) => r.status === 'new' || r.status === 'update');
    if (validRows.length === 0) return;

    setApplying(true);
    cancelRef.current = false;
    setSummary(null);
    setProgress({ current: 0, total: validRows.length });

    let success = 0;
    let failed = 0;
    let processedValid = 0;

    for (let i = 0; i < validRows.length; i++) {
      if (cancelRef.current) {
        break;
      }
      const row = validRows[i]!;
      setProgress({ current: i + 1, total: validRows.length });

      try {
        await data.saveCatalogProduct({
          id: row.status === 'update' ? row.existingId : undefined,
          name: row.name,
          categoryId: row.categoryId ?? null,
          price: row.price,
          sku: row.sku || undefined,
          isActive: row.isActive,
          variants: [],
        });
        success++;
      } catch {
        failed++;
      }
      processedValid++;
    }

    const unattemptedValid = validRows.length - processedValid;
    const skipped = parsed.errorCount + unattemptedValid;

    setSummary({
      success,
      skipped,
      failed,
    });
    setApplying(false);
    state.reload();
  }

  function handleCancelApply() {
    cancelRef.current = true;
  }

  const displayedRows = parsed?.rows.filter((r) => {
    if (filterMode === 'valid') return r.status === 'new' || r.status === 'update';
    if (filterMode === 'error') return r.status === 'error';
    return true;
  });

  return (
    <>
      <PageHeader
        title="Impor dan ekspor produk"
        subtitle="Kelola katalog produk secara massal menggunakan berkas spreadsheet CSV."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/produk" className="cg-btn cg-btn--ghost">
              <ArrowLeft className="cg-icon" aria-hidden /> Kembali ke katalog
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadSample}
            >
              <FileSpreadsheet className="cg-icon" aria-hidden /> Unduh contoh berkas
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={handleExportCsv}
              disabled={state.status !== 'ready'}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV katalog
            </button>
          </div>
        }
      />

      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat data">
          <div className="cg-skeleton" style={{ height: 120 }} />
          <div className="cg-skeleton" style={{ height: 240 }} />
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-24 min-w-0">
          {/* Petunjuk & Unggah Berkas */}
          <div className="grid gap-16 p-20 border border-border rounded-xl bg-surface-raised min-w-0">
            <div className="flex items-start gap-12">
              <FileText className="cg-icon cg-icon--lg text-accent-strong shrink-0 mt-2" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold m-0 mb-4">Pilih berkas CSV produk</h2>
                <p className="text-sm text-text-muted m-0">
                  Kolom yang dibutuhkan: <strong>SKU</strong>, <strong>Nama</strong>, <strong>Kategori</strong>,{' '}
                  <strong>Harga jual</strong>, dan <strong>Aktif</strong> (ya/tidak).
                  Nama produk wajib diisi, harga berupa angka bulat positif, dan kategori harus sudah terdaftar pada menu kategori.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-12">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="cg-sr"
                id="product-csv-upload"
                disabled={applying}
              />
              <label htmlFor="product-csv-upload" className="cg-btn cg-btn--secondary cursor-pointer">
                <Upload className="cg-icon" aria-hidden />
                {selectedFileName ? 'Ganti berkas CSV' : 'Pilih berkas CSV'}
              </label>

              {selectedFileName && (
                <div className="flex items-center gap-8 text-sm">
                  <span className="font-medium text-text">{selectedFileName}</span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    disabled={applying}
                    title="Hapus pilihan"
                  >
                    <RotateCcw className="cg-icon cg-icon--sm" aria-hidden /> Muat ulang
                  </button>
                </div>
              )}
            </div>

            {parseErr && (
              <div className="cg-banner cg-banner--danger" role="alert">
                <AlertCircle className="cg-icon shrink-0" aria-hidden />
                <div>
                  <strong>Terjadi kesalahan format berkas:</strong>
                  <span>{parseErr}</span>
                </div>
              </div>
            )}
          </div>

          {/* Banner Peringatan Truncated */}
          {parsed?.truncated && (
            <div className="cg-banner cg-banner--warning" role="alert">
              <AlertCircle className="cg-icon shrink-0" aria-hidden />
              <div>
                <strong>Batas baris terlampaui:</strong>
                <span>
                  Berkas Anda memiliki {parsed.totalRows} baris. Sistem hanya memproses maksimal 2.000 baris pertama.
                </span>
              </div>
            </div>
          )}

          {/* Ringkasan Hasil Eksekusi */}
          {summary && (
            <div className="cg-banner cg-banner--info" role="status">
              <CheckCircle2 className="cg-icon shrink-0" aria-hidden />
              <div className="flex-1">
                <strong>Proses impor selesai:</strong>
                <div className="flex flex-wrap gap-12 mt-4 text-sm">
                  <span className="cg-badge cg-badge--success">Berhasil: {summary.success}</span>
                  <span className="cg-badge cg-badge--warning">Dilewati: {summary.skipped}</span>
                  {summary.failed > 0 && <span className="cg-badge cg-badge--danger">Gagal: {summary.failed}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Pratinjau Tabel & Aksi */}
          {parsed && (
            <div className="grid gap-16 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-12">
                <div className="flex flex-wrap items-center gap-8">
                  <span className="text-sm font-semibold">Pratinjau ({parsed.rows.length} baris):</span>
                  <span className="cg-badge cg-badge--info">Baru: {parsed.newCount}</span>
                  <span className="cg-badge cg-badge--accent">Perbarui: {parsed.updateCount}</span>
                  {parsed.errorCount > 0 && (
                    <span className="cg-badge cg-badge--danger">Salah: {parsed.errorCount}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-8">
                  <div className="cg-tabs" role="tablist" aria-label="Saring pratinjau">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterMode === 'all'}
                      className="cg-tab"
                      onClick={() => setFilterMode('all')}
                    >
                      Semua ({parsed.rows.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterMode === 'valid'}
                      className="cg-tab"
                      onClick={() => setFilterMode('valid')}
                    >
                      Valid ({parsed.newCount + parsed.updateCount})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterMode === 'error'}
                      className="cg-tab"
                      onClick={() => setFilterMode('error')}
                    >
                      Salah ({parsed.errorCount})
                    </button>
                  </div>

                  <button
                    type="button"
                    className="cg-btn cg-btn--primary"
                    disabled={applying || parsed.newCount + parsed.updateCount === 0}
                    onClick={handleApply}
                  >
                    Terapkan perubahan
                  </button>
                  {applying && (
                    <button
                      type="button"
                      className="cg-btn cg-btn--danger"
                      onClick={handleCancelApply}
                    >
                      Batalkan
                    </button>
                  )}
                </div>
              </div>

              {applying && progress && (
                <div className="p-16 border border-border rounded-xl bg-surface-raised grid gap-8">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Menerapkan produk ke katalog...</span>
                    <span className="cg-num">
                      {progress.current} / {progress.total} (
                      {Math.round((progress.current / progress.total) * 100)}%)
                    </span>
                  </div>
                  <div
                    className="w-full bg-surface rounded-full overflow-hidden"
                    style={{ height: 8 }}
                  >
                    <div
                      className="bg-accent transition-all duration-150"
                      style={{
                        height: '100%',
                        width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {displayedRows && displayedRows.length > 0 ? (
                <div className="cg-data-wrap min-w-0 border border-border rounded-xl">
                  <table className="cg-data">
                    <thead>
                      <tr>
                        <th style={{ width: 64 }}>Baris</th>
                        <th>Status</th>
                        <th>SKU</th>
                        <th>Nama Produk</th>
                        <th>Kategori</th>
                        <th className="cg-num">Harga</th>
                        <th>Aktif</th>
                        <th>Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.map((r) => (
                        <tr key={r.lineNumber}>
                          <td className="text-text-muted cg-num">{r.lineNumber}</td>
                          <td>
                            {r.status === 'new' && (
                              <span className="cg-badge cg-badge--info">
                                <CheckCircle2 className="cg-icon cg-icon--sm" aria-hidden /> Baru
                              </span>
                            )}
                            {r.status === 'update' && (
                              <span className="cg-badge cg-badge--accent">
                                <CheckCircle2 className="cg-icon cg-icon--sm" aria-hidden /> Perbarui
                              </span>
                            )}
                            {r.status === 'error' && (
                              <span className="cg-badge cg-badge--danger">
                                <XCircle className="cg-icon cg-icon--sm" aria-hidden /> Salah
                              </span>
                            )}
                          </td>
                          <td className="font-mono text-xs">{r.sku || '—'}</td>
                          <td className="font-medium max-w-[240px] truncate" title={r.name}>
                            {r.name || '—'}
                          </td>
                          <td>{r.category || '—'}</td>
                          <td className="cg-num">
                            {r.price >= 0 ? formatRp(r.price) : '—'}
                          </td>
                          <td>
                            {r.isActive ? (
                              <span className="cg-badge cg-badge--success">Ya</span>
                            ) : (
                              <span className="cg-badge">Tidak</span>
                            )}
                          </td>
                          <td className="text-xs">
                            {r.status === 'error' ? (
                              <span className="text-danger font-medium">{r.errorReason}</span>
                            ) : r.status === 'update' ? (
                              <span className="text-accent-strong">Memperbarui produk yang sudah ada</span>
                            ) : (
                              <span className="text-text-muted">Menambahkan produk baru</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="cg-empty">
                  <p><strong>Tidak ada baris yang sesuai dengan saringan ini.</strong></p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Download, Printer, BarChart3, Building, ShieldCheck, DollarSign } from 'lucide-react';
import {
  formatRp,
  summarizeAssets,
  type FixedAsset,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { fmtDate } from '@/components/fin-common';
import { AssetNavTabs, AssetAssumptionNote, AssetStatusBadge } from '../common';

export default function AssetReportPage() {
  const data = useData();
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disposed'>('all');

  const assetsAsync = useAsync(() => data.listFixedAssets(), [data]);
  const assets: readonly FixedAsset[] = assetsAsync.status === 'ready' ? assetsAsync.data : [];

  const summary = useMemo(() => {
    return summarizeAssets([...assets]);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (filterStatus === 'all') return assets;
    return assets.filter((a) => a.status === filterStatus);
  }, [assets, filterStatus]);

  const handleExportCsv = () => {
    if (filteredAssets.length === 0) return;

    const headers = [
      'Nama Aset',
      'Tanggal Perolehan',
      'Status',
      'Umur Manfaat (Bulan)',
      'Bulan Disusutkan',
      'Harga Perolehan',
      'Nilai Sisa',
      'Akumulasi Penyusutan',
      'Nilai Buku',
    ];

    const rows = filteredAssets.map((a) => [
      `"${a.name.replace(/"/g, '""')}"`,
      a.acquiredOn,
      a.status === 'active' ? 'Aktif' : 'Dilepas',
      a.usefulLifeMonths,
      a.monthsDepreciated,
      a.cost,
      a.salvageValue,
      a.accumulatedDepreciation,
      a.bookValue,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `laporan-aset-tetap-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Laporan Aset Tetap"
        subtitle="Ringkasan valuasi aset modal, akumulasi penyusutan, dan nilai buku bersih untuk pelaporan keuangan."
        actions={
          <div className="flex items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handlePrint}
              disabled={assets.length === 0}
            >
              <Printer className="cg-icon cg-icon--sm" aria-hidden />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={handleExportCsv}
              disabled={assets.length === 0}
            >
              <Download className="cg-icon cg-icon--sm" aria-hidden />
              <span>Ekspor CSV</span>
            </button>
          </div>
        }
      />

      <AssetNavTabs />

      {assetsAsync.status === 'loading' && (
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16">
          <div className="cg-skeleton h-48 w-full" />
          <div className="cg-skeleton h-48 w-full" />
          <div className="cg-skeleton h-48 w-full" />
          <div className="cg-skeleton h-48 w-full" />
        </div>
      )}

      {assetsAsync.status === 'error' && (
        <ErrorBox message={assetsAsync.message} onRetry={assetsAsync.reload} />
      )}

      {assetsAsync.status === 'ready' && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-16">
            <div className="cg-card p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-xs font-semibold">Total Unit Aset</span>
                <Building className="cg-icon cg-icon--sm text-accent" aria-hidden />
              </div>
              <p className="text-24 font-bold text-text cg-num">{summary.count}</p>
              <p className="text-[11px] text-text-muted">
                {summary.active} unit aktif · {summary.count - summary.active} dilepas
              </p>
            </div>

            <div className="cg-card p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-xs font-semibold">Nilai Perolehan Aset Aktif</span>
                <DollarSign className="cg-icon cg-icon--sm text-info" aria-hidden />
              </div>
              <p className="text-24 font-bold text-text cg-num">{formatRp(summary.cost)}</p>
              <p className="text-[11px] text-text-muted">Modal awal dari aset aktif</p>
            </div>

            <div className="cg-card p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-xs font-semibold">Akumulasi Penyusutan</span>
                <BarChart3 className="cg-icon cg-icon--sm text-warning" aria-hidden />
              </div>
              <p className="text-24 font-bold text-warning cg-num">{formatRp(summary.accumulated)}</p>
              <p className="text-[11px] text-text-muted">Total beban susut terbukukan</p>
            </div>

            <div className="cg-card p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-xs font-semibold">Total Nilai Buku Bersih</span>
                <ShieldCheck className="cg-icon cg-icon--sm text-success" aria-hidden />
              </div>
              <p className="text-24 font-bold text-success cg-num">{formatRp(summary.bookValue)}</p>
              <p className="text-[11px] text-text-muted">Harga perolehan dikurangi akumulasi</p>
            </div>
          </div>

          {/* Table Card */}
          <div className="cg-card p-24 space-y-16">
            <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 border-b border-border pb-12">
              <div>
                <h3 className="font-bold text-base text-text">Daftar Rincian Nilai Aset</h3>
                <p className="text-xs text-text-muted">Posisi pembukuan tiap aset per hari ini.</p>
              </div>

              <div className="flex items-center gap-8">
                <label htmlFor="filter-report-status" className="text-xs font-semibold text-text-muted">
                  Tampilkan:
                </label>
                <select
                  id="filter-report-status"
                  className="cg-input text-xs"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'disposed')}
                >
                  <option value="all">Semua Aset ({assets.length})</option>
                  <option value="active">Hanya Aktif ({summary.active})</option>
                  <option value="disposed">Hanya Dilepas ({summary.count - summary.active})</option>
                </select>
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="p-32 text-center text-sm text-text-muted">
                Tidak ada data aset pada filter yang dipilih.
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nama Aset</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Perolehan</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Status</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Masa (Bln)</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Harga Beli</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Nilai Sisa</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Akumulasi Susut</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Nilai Buku</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-surface/50">
                        <td className="py-12 px-16 font-semibold text-sm text-text">
                          {asset.name}
                        </td>
                        <td className="py-12 px-16 text-xs text-text-muted whitespace-nowrap">
                          {fmtDate(asset.acquiredOn)}
                        </td>
                        <td className="py-12 px-16 text-center">
                          <AssetStatusBadge status={asset.status} />
                        </td>
                        <td className="py-12 px-16 text-xs text-right cg-num whitespace-nowrap">
                          {asset.monthsDepreciated} / {asset.usefulLifeMonths}
                        </td>
                        <td className="py-12 px-16 text-sm text-right font-medium text-text cg-num whitespace-nowrap">
                          {formatRp(asset.cost)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right text-text-muted cg-num whitespace-nowrap">
                          {formatRp(asset.salvageValue)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right text-text-muted cg-num whitespace-nowrap">
                          {formatRp(asset.accumulatedDepreciation)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right font-bold text-accent cg-num whitespace-nowrap">
                          {formatRp(asset.bookValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold bg-surface/40">
                      <td colSpan={4} className="py-12 px-16 text-sm text-text">
                        Total ({filteredAssets.length} Aset)
                      </td>
                      <td className="py-12 px-16 text-sm text-right cg-num whitespace-nowrap">
                        {formatRp(filteredAssets.reduce((s, a) => s + a.cost, 0))}
                      </td>
                      <td className="py-12 px-16 text-sm text-right cg-num whitespace-nowrap">
                        {formatRp(filteredAssets.reduce((s, a) => s + a.salvageValue, 0))}
                      </td>
                      <td className="py-12 px-16 text-sm text-right cg-num whitespace-nowrap text-warning">
                        {formatRp(filteredAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0))}
                      </td>
                      <td className="py-12 px-16 text-sm text-right cg-num whitespace-nowrap text-accent">
                        {formatRp(filteredAssets.reduce((s, a) => s + a.bookValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <AssetAssumptionNote />
    </div>
  );
}

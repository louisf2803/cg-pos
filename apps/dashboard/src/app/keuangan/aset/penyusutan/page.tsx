'use client';

import { useMemo, useState } from 'react';
import { Calendar, Play, CheckCircle2, History, AlertCircle } from 'lucide-react';
import {
  formatRp,
  depreciationSchedule,
  pendingPeriods,
  type FixedAsset,
  type AssetDepreciationEntry,
  type DepreciationRunResult,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { todayKey } from '@/components/fin-common';
import { AssetNavTabs, AssetAssumptionNote } from '../common';

export default function AssetDepreciationPage() {
  const data = useData();

  // Current month default in yyyy-mm format
  const currentMonthKey = todayKey().slice(0, 7); // e.g. "2026-11"
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<DepreciationRunResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedPeriod = `${selectedMonth}-01`;

  const assetsAsync = useAsync(() => data.listFixedAssets(), [data]);
  const depreciationsAsync = useAsync(() => data.listAssetDepreciations(), [data]);

  const assets: readonly FixedAsset[] = assetsAsync.status === 'ready' ? assetsAsync.data : [];
  const depreciations: readonly AssetDepreciationEntry[] =
    depreciationsAsync.status === 'ready' ? depreciationsAsync.data : [];

  // Map asset by ID
  const assetMap = useMemo(() => {
    const map = new Map<string, FixedAsset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  // Depreciations grouped by assetId
  const donePeriodsByAsset = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of depreciations) {
      const list = map.get(d.assetId) || [];
      list.push(d.period);
      map.set(d.assetId, list);
    }
    return map;
  }, [depreciations]);

  // Preview: which active assets are eligible to be depreciated in the selected period?
  const previewItems = useMemo(() => {
    const items: { asset: FixedAsset; amount: number }[] = [];
    const activeAssets = assets.filter((a) => a.status === 'active');

    for (const a of activeAssets) {
      const done = donePeriodsByAsset.get(a.id) || [];
      const pending = pendingPeriods(a, done, selectedPeriod);
      if (pending.includes(selectedPeriod)) {
        const schedule = depreciationSchedule(a);
        const match = schedule.find((s) => s.period === selectedPeriod);
        if (match && match.amount > 0) {
          items.push({ asset: a, amount: match.amount });
        }
      }
    }
    return items;
  }, [assets, donePeriodsByAsset, selectedPeriod]);

  const previewTotal = useMemo(() => {
    return previewItems.reduce((sum, item) => sum + item.amount, 0);
  }, [previewItems]);

  const handleRunDepreciation = async () => {
    setActionError(null);
    setLastResult(null);
    setRunning(true);

    try {
      const res = await data.depreciateFixedAssets(selectedPeriod);
      setLastResult(res);
      assetsAsync.reload();
      depreciationsAsync.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses penyusutan.');
    } finally {
      setRunning(false);
    }
  };

  const reloadData = () => {
    assetsAsync.reload();
    depreciationsAsync.reload();
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Penyusutan Aset Tetap"
        subtitle="Jalankan perhitungan dan pembukuan penyusutan berkala aset tetap secara otomatis untuk periode bulan yang dipilih."
      />

      <AssetNavTabs />

      {/* Action Notification */}
      {actionError && (
        <div role="alert" className="cg-banner cg-banner--danger">
          <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
          <span>{actionError}</span>
        </div>
      )}

      {lastResult && (
        <div
          role="status"
          className={`cg-banner ${
            lastResult.assets > 0 ? 'cg-banner--success' : 'cg-banner--info'
          } flex items-center justify-between`}
        >
          <div className="flex items-center gap-8">
            <CheckCircle2 className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>
              {lastResult.assets > 0
                ? `Penyusutan periode ${selectedMonth} berhasil dicatat: ${lastResult.assets} aset disusutkan dengan total ${formatRp(
                    lastResult.total,
                  )}.`
                : `Penyusutan periode ${selectedMonth} sudah tercatat sebelumnya (0 aset baru disusutkan).`}
            </span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setLastResult(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Period Selection & Run Card */}
      <div className="cg-card p-24 space-y-20">
        <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-16 border-b border-border pb-16">
          <div className="space-y-4">
            <h3 className="font-bold text-base text-text flex items-center gap-8">
              <Calendar className="cg-icon cg-icon--sm text-accent" aria-hidden />
              Periode Bulan Penyusutan
            </h3>
            <p className="text-xs text-text-muted">
              Pilih bulan pembukuan untuk menghitung biaya penyusutan aset tetap aktif.
            </p>
          </div>

          <div className="flex items-center gap-12">
            <input
              type="month"
              aria-label="Pilih bulan penyusutan"
              className="cg-input text-sm"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedMonth(e.target.value);
                  setLastResult(null);
                }
              }}
              disabled={running}
            />

            <button
              type="button"
              className="cg-btn cg-btn--primary"
              disabled={running || assetsAsync.status === 'loading'}
              onClick={handleRunDepreciation}
            >
              <Play className="cg-icon cg-icon--sm" aria-hidden />
              <span>{running ? 'Memproses...' : 'Catat penyusutan bulan ini'}</span>
            </button>
          </div>
        </div>

        {/* Live Preview Section */}
        <div className="space-y-12">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted">
              Pratinjau Aset yang Akan Disusutkan (Periode: {selectedMonth}):
            </span>
            <span className="text-xs font-bold text-text cg-num">
              Total Beban: {formatRp(previewTotal)}
            </span>
          </div>

          {previewItems.length === 0 ? (
            <div className="p-16 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-text-muted">
              Tidak ada aset yang memerlukan pencatatan penyusutan pada periode {selectedMonth}.
              (Semua aset aktif mungkin telah disusutkan untuk bulan ini, atau baru diperoleh setelah periode ini).
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0 border border-border rounded-lg overflow-hidden">
              <table className="cg-data w-full text-left">
                <thead>
                  <tr>
                    <th className="py-8 px-16 text-xs font-semibold text-text-muted">Nama Aset</th>
                    <th className="py-8 px-16 text-xs font-semibold text-text-muted text-right">Nilai Buku Saat Ini</th>
                    <th className="py-8 px-16 text-xs font-semibold text-text-muted text-right">Penyusutan Bulan Ini</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewItems.map(({ asset, amount }) => (
                    <tr key={asset.id} className="hover:bg-surface/50">
                      <td className="py-8 px-16 text-sm font-semibold text-text">{asset.name}</td>
                      <td className="py-8 px-16 text-sm text-right text-text-muted cg-num">
                        {formatRp(asset.bookValue)}
                      </td>
                      <td className="py-8 px-16 text-sm text-right font-bold text-accent cg-num">
                        {formatRp(amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="cg-card p-24 space-y-16">
        <div className="flex items-center justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text flex items-center gap-8">
              <History className="cg-icon cg-icon--sm text-accent" aria-hidden />
              Riwayat Penyusutan Aset
            </h3>
            <p className="text-xs text-text-muted">Daftar entri penyusutan yang telah dibukukan ke dalam sistem.</p>
          </div>
          <span className="px-8 py-[2px] rounded-full text-xs font-bold bg-surface border border-border cg-num">
            {depreciations.length} Entri
          </span>
        </div>

        {depreciationsAsync.status === 'loading' && (
          <div className="space-y-8">
            <div className="cg-skeleton h-40 w-full" />
            <div className="cg-skeleton h-40 w-full" />
            <div className="cg-skeleton h-40 w-full" />
          </div>
        )}

        {depreciationsAsync.status === 'error' && (
          <ErrorBox message={depreciationsAsync.message} onRetry={reloadData} />
        )}

        {depreciationsAsync.status === 'ready' && depreciations.length === 0 && (
          <div className="p-32 text-center text-sm text-text-muted bg-surface rounded-xl border border-border">
            Belum ada riwayat penyusutan aset yang tercatat.
          </div>
        )}

        {depreciationsAsync.status === 'ready' && depreciations.length > 0 && (
          <div className="cg-data-wrap min-w-0">
            <table className="cg-data w-full text-left">
              <thead>
                <tr>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted">Periode</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nama Aset</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Nilai Penyusutan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...depreciations].reverse().map((entry, idx) => {
                  const asset = assetMap.get(entry.assetId);
                  return (
                    <tr key={`${entry.assetId}-${entry.period}-${idx}`} className="hover:bg-surface/50">
                      <td className="py-12 px-16 text-xs font-semibold text-text whitespace-nowrap cg-num">
                        {entry.period.slice(0, 7)}
                      </td>
                      <td className="py-12 px-16 text-sm font-medium text-text">
                        {asset ? asset.name : entry.assetId}
                      </td>
                      <td className="py-12 px-16 text-sm text-right font-bold text-accent cg-num whitespace-nowrap">
                        {formatRp(entry.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssetAssumptionNote />
    </div>
  );
}

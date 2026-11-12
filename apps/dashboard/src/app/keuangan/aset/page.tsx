'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Building2, AlertCircle } from 'lucide-react';
import {
  formatRp,
  fixedAssetProblem,
  type FixedAsset,
  type FixedAssetInput,
  type Account,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog, fmtDate, todayKey } from '@/components/fin-common';
import { AssetNavTabs, AssetAssumptionNote, AssetStatusBadge } from './common';

function AddAssetModal({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: readonly Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [name, setName] = useState('');
  const [acquiredOn, setAcquiredOn] = useState(todayKey());
  const [cost, setCost] = useState('');
  const [salvageValue, setSalvageValue] = useState('0');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('48');
  const [payAccountId, setPayAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive),
    [accounts],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numCost = Math.round(Number(cost) || 0);
    const numSalvage = Math.round(Number(salvageValue) || 0);
    const numLife = Math.round(Number(usefulLifeMonths) || 0);

    const payload: FixedAssetInput = {
      name: name.trim(),
      acquiredOn,
      cost: numCost,
      salvageValue: numSalvage,
      usefulLifeMonths: numLife,
      payAccountId: payAccountId || null,
    };

    const problem = fixedAssetProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    try {
      await data.saveFixedAsset(payload);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan aset tetap.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleSubmit} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text">Tambah Aset Tetap Baru</h3>
            <p className="text-xs text-text-muted mt-4">
              Aset yang telah dicatat tidak dapat diubah kembali; pastikan data perolehan sudah benar.
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <div className="space-y-4">
          <label htmlFor="asset-name" className="text-xs font-semibold text-text-muted block">
            Nama Aset <span className="text-danger">*</span>
          </label>
          <input
            id="asset-name"
            type="text"
            required
            maxLength={120}
            placeholder="Contoh: Mesin Espresso La Marzocco"
            className="cg-input text-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="space-y-4">
            <label htmlFor="asset-acquired" className="text-xs font-semibold text-text-muted block">
              Tanggal Perolehan <span className="text-danger">*</span>
            </label>
            <input
              id="asset-acquired"
              type="date"
              required
              className="cg-input text-sm w-full"
              value={acquiredOn}
              onChange={(e) => setAcquiredOn(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-4">
            <label htmlFor="asset-cost" className="text-xs font-semibold text-text-muted block">
              Harga Perolehan (Rp) <span className="text-danger">*</span>
            </label>
            <input
              id="asset-cost"
              type="number"
              min={1}
              step={1}
              required
              placeholder="0"
              className="cg-input text-sm w-full cg-num"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="space-y-4">
            <label htmlFor="asset-salvage" className="text-xs font-semibold text-text-muted block">
              Nilai Sisa / Residu (Rp) <span className="text-danger">*</span>
            </label>
            <input
              id="asset-salvage"
              type="number"
              min={0}
              step={1}
              required
              placeholder="0"
              className="cg-input text-sm w-full cg-num"
              value={salvageValue}
              onChange={(e) => setSalvageValue(e.target.value)}
              disabled={saving}
            />
            <span className="text-[11px] text-text-muted">Perkiraan nilai aset di akhir umur manfaat (bawaan 0).</span>
          </div>

          <div className="space-y-4">
            <label htmlFor="asset-life" className="text-xs font-semibold text-text-muted block">
              Umur Manfaat (Bulan) <span className="text-danger">*</span>
            </label>
            <input
              id="asset-life"
              type="number"
              min={1}
              max={600}
              step={1}
              required
              placeholder="48"
              className="cg-input text-sm w-full cg-num"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              disabled={saving}
            />
            <span className="text-[11px] text-text-muted">Contoh: 48 bulan = 4 tahun.</span>
          </div>
        </div>

        <div className="space-y-4">
          <label htmlFor="asset-pay-account" className="text-xs font-semibold text-text-muted block">
            Akun Pembayaran Kas / Bank (Opsional)
          </label>
          <select
            id="asset-pay-account"
            className="cg-input text-sm w-full"
            value={payAccountId}
            onChange={(e) => setPayAccountId(e.target.value)}
            disabled={saving}
          >
            <option value="">Kosong — Hanya mencatat aset (saldo awal), tanpa jurnal perolehan</option>
            {cashAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.code} · {acc.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted">
            Jika dipilih, sistem akan membuat jurnal pengurang kas/bank atas pembelian aset ini.
          </span>
        </div>

        <div className="p-12 rounded-lg bg-surface border border-border text-xs text-text-muted space-y-4">
          <p className="font-semibold text-text">Perhatian:</p>
          <p>
            Setelah disimpan, aset tetap tidak dapat diedit nominal dan tanggalnya guna menjaga konsistensi buku besar dan riwayat penyusutan.
          </p>
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Aset'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function FixedAssetListPage() {
  const data = useData();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disposed'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const assetsAsync = useAsync(() => data.listFixedAssets(), [data]);
  const accountsAsync = useAsync(() => data.listAccounts(), [data]);

  const assets: readonly FixedAsset[] = assetsAsync.status === 'ready' ? assetsAsync.data : [];
  const accounts: readonly Account[] = accountsAsync.status === 'ready' ? accountsAsync.data : [];

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      const matchQ = q ? a.name.toLowerCase().includes(q) : true;
      const matchS = statusFilter === 'all' ? true : a.status === statusFilter;
      return matchQ && matchS;
    });
  }, [assets, query, statusFilter]);

  const reloadData = () => {
    assetsAsync.reload();
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Manajemen Aset Tetap"
        subtitle="Kelola pencatatan aset inventaris dan peralatan usaha, perhitungan penyusutan bulanan, hingga pelepasan aset."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah aset</span>
          </button>
        }
      />

      <AssetNavTabs />

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setToastMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col tablet:flex-row items-stretch tablet:items-center justify-between gap-12">
        <div className="relative flex-1 max-w-sm">
          <Search className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="text"
            className="cg-input pl-[36px] text-sm w-full"
            placeholder="Cari nama aset..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-8">
          <label htmlFor="filter-status" className="text-xs font-semibold text-text-muted whitespace-nowrap">
            Status:
          </label>
          <select
            id="filter-status"
            className="cg-input text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disposed')}
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="disposed">Dilepas</option>
          </select>
        </div>
      </div>

      {assetsAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {assetsAsync.status === 'error' && (
        <ErrorBox message={assetsAsync.message} onRetry={reloadData} />
      )}

      {assetsAsync.status === 'ready' && assets.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Building2 className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada aset tetap tercatat</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Mulai catat perlengkapan, mesin, kendaraan, atau peralatan toko untuk menghitung penyusutan bulanan secara otomatis.
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah aset pertama</span>
          </button>
        </div>
      )}

      {assetsAsync.status === 'ready' && assets.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredAssets.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada aset tetap yang sesuai dengan pencarian atau filter.
            </div>
          ) : (
            <>
              {/* Desktop Table (>= 768px) */}
              <div className="hidden tablet:block cg-data-wrap min-w-0">
                <table className="cg-data w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nama Aset</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Tgl Perolehan</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Harga Perolehan</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Akumulasi Susut</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Nilai Buku</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Status</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Progres Susut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-surface/50 transition-colors">
                        <td className="py-12 px-16">
                          <span className="font-bold text-sm text-text block">{asset.name}</span>
                          <span className="text-[11px] text-text-muted">
                            Sisa: {formatRp(asset.salvageValue)}
                          </span>
                        </td>
                        <td className="py-12 px-16 text-xs text-text-muted whitespace-nowrap">
                          {fmtDate(asset.acquiredOn)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right font-medium text-text cg-num whitespace-nowrap">
                          {formatRp(asset.cost)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right text-text-muted cg-num whitespace-nowrap">
                          {formatRp(asset.accumulatedDepreciation)}
                        </td>
                        <td className="py-12 px-16 text-sm text-right font-bold text-accent cg-num whitespace-nowrap">
                          {formatRp(asset.bookValue)}
                        </td>
                        <td className="py-12 px-16 text-center">
                          <AssetStatusBadge status={asset.status} />
                        </td>
                        <td className="py-12 px-16 text-right whitespace-nowrap">
                          <span className="text-xs font-semibold text-text cg-num">
                            {asset.monthsDepreciated} / {asset.usefulLifeMonths}
                          </span>
                          <span className="text-[11px] text-text-muted block">bulan</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (< 768px) */}
              <div className="block tablet:hidden divide-y divide-border">
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="p-16 space-y-12 min-w-0">
                    <div className="flex items-start justify-between gap-12">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-text truncate">{asset.name}</h4>
                        <p className="text-xs text-text-muted">Perolehan: {fmtDate(asset.acquiredOn)}</p>
                      </div>
                      <AssetStatusBadge status={asset.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-xs pt-4 border-t border-border/50">
                      <div>
                        <span className="text-text-muted block">Harga Perolehan:</span>
                        <span className="font-semibold text-text cg-num">{formatRp(asset.cost)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">Nilai Buku:</span>
                        <span className="font-bold text-accent cg-num">{formatRp(asset.bookValue)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Akumulasi Susut:</span>
                        <span className="font-medium text-text-muted cg-num">{formatRp(asset.accumulatedDepreciation)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">Masa Susut:</span>
                        <span className="font-semibold text-text cg-num">{asset.monthsDepreciated} / {asset.usefulLifeMonths} bln</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <AssetAssumptionNote />

      {showAddModal && (
        <AddAssetModal
          accounts={accounts}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            reloadData();
            setToastMsg('Aset tetap berhasil ditambahkan.');
          }}
        />
      )}
    </div>
  );
}

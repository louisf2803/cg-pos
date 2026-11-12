'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Trash2, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import {
  formatRp,
  disposalProblem,
  disposalGainLoss,
  type FixedAsset,
  type FixedAssetDisposalInput,
  type Account,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog, fmtDate, todayKey } from '@/components/fin-common';
import { AssetNavTabs, AssetAssumptionNote } from '../common';

function ConfirmDisposalDialog({
  asset,
  proceeds,
  gainLoss,
  date,
  onConfirm,
  onClose,
  loading,
}: {
  asset: FixedAsset;
  proceeds: number;
  gainLoss: number;
  date: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const { props } = useDialog(onClose);

  return (
    <dialog {...props}>
      <div className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div className="flex items-center gap-8 text-danger">
            <Trash2 className="cg-icon cg-icon--md" aria-hidden />
            <h3 className="font-bold text-base text-text">Konfirmasi Pelepasan Aset</h3>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
        </div>

        <div className="p-16 rounded-xl bg-danger/10 border border-danger/30 text-xs text-text space-y-4">
          <p className="font-bold text-danger text-sm">Peringatan: Tindakan ini permanen!</p>
          <p>
            Setelah pelepasan dikonfirmasi, aset <strong>{asset.name}</strong> akan berstatus dilepas (disposed) dan tidak dapat dibatalkan atau disusutkan kembali di masa mendatang.
          </p>
        </div>

        <div className="space-y-8 bg-surface p-16 rounded-xl border border-border text-xs text-text">
          <div className="flex justify-between">
            <span className="text-text-muted">Nama Aset:</span>
            <span className="font-bold">{asset.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Tanggal Pelepasan:</span>
            <span>{fmtDate(date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Harga Perolehan Awal:</span>
            <span className="cg-num">{formatRp(asset.cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Akumulasi Penyusutan:</span>
            <span className="cg-num">{formatRp(asset.accumulatedDepreciation)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Nilai Buku Saat Ini:</span>
            <span className="cg-num font-semibold">{formatRp(asset.bookValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Hasil Penjualan:</span>
            <span className="cg-num font-semibold">{formatRp(proceeds)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-8 font-bold">
            <span>Dampak Laba / (Rugi):</span>
            <span
              className={`cg-num ${
                gainLoss > 0 ? 'text-success' : gainLoss < 0 ? 'text-danger' : 'text-text'
              }`}
            >
              {gainLoss > 0
                ? `Laba: +${formatRp(gainLoss)}`
                : gainLoss < 0
                ? `Rugi: ${formatRp(gainLoss)}`
                : 'Rp 0 (Impas)'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Melepas Aset...' : 'Ya, Lepas Aset Ini'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function AssetDisposalPage() {
  const data = useData();
  const today = todayKey();

  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [disposalDate, setDisposalDate] = useState(today);
  const [proceeds, setProceeds] = useState('0');
  const [cashAccountId, setCashAccountId] = useState('');
  const [gainLossAccountId, setGainLossAccountId] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const assetsAsync = useAsync(() => data.listFixedAssets(), [data]);
  const accountsAsync = useAsync(() => data.listAccounts(), [data]);

  const assets: readonly FixedAsset[] = assetsAsync.status === 'ready' ? assetsAsync.data : [];
  const accounts: readonly Account[] = accountsAsync.status === 'ready' ? accountsAsync.data : [];

  const activeAssets = useMemo(() => assets.filter((a) => a.status === 'active'), [assets]);

  const selectedAsset = useMemo(
    () => activeAssets.find((a) => a.id === selectedAssetId) || null,
    [activeAssets, selectedAssetId],
  );

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive),
    [accounts],
  );

  // Accounts for gain/loss on disposal (income or expense)
  const gainLossAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.category === 'revenue' ||
            a.category === 'expense' ||
            a.category === 'other_income' ||
            a.category === 'other_expense') &&
          a.kind === 'detail' &&
          a.isActive,
      ),
    [accounts],
  );

  const numProceeds = Math.max(0, Math.round(Number(proceeds) || 0));

  const estimatedGainLoss = useMemo(() => {
    if (!selectedAsset) return 0;
    return disposalGainLoss(selectedAsset, numProceeds);
  }, [selectedAsset, numProceeds]);

  const handleOpenConfirm = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedAsset) {
      setFormError('Pilih aset aktif yang hendak dilepas terlebih dahulu.');
      return;
    }

    const payload: FixedAssetDisposalInput = {
      assetId: selectedAsset.id,
      date: disposalDate,
      proceeds: numProceeds,
      cashAccountId: cashAccountId || null,
      gainLossAccountId: gainLossAccountId || null,
    };

    const problem = disposalProblem(selectedAsset, payload, today);
    if (problem) {
      setFormError(problem);
      return;
    }

    setShowConfirm(true);
  };

  const handleExecuteDisposal = async () => {
    if (!selectedAsset) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const payload: FixedAssetDisposalInput = {
        assetId: selectedAsset.id,
        date: disposalDate,
        proceeds: numProceeds,
        cashAccountId: cashAccountId || null,
        gainLossAccountId: gainLossAccountId || null,
      };

      await data.disposeFixedAsset(payload);
      setShowConfirm(false);
      setSelectedAssetId('');
      setProceeds('0');
      setCashAccountId('');
      setGainLossAccountId('');
      setSuccessMsg(`Aset "${selectedAsset.name}" berhasil dilepas dari pembukuan.`);
      assetsAsync.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memproses pelepasan aset.');
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const reloadData = () => {
    assetsAsync.reload();
    accountsAsync.reload();
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Pelepasan Aset Tetap"
        subtitle="Hentikan pengakuan aset tetap karena penjualan, kerusakan, atau pembuangan, dan catat laba/rugi pelepasan."
      />

      <AssetNavTabs />

      {successMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <div className="flex items-center gap-8">
            <CheckCircle2 className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setSuccessMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {formError && (
        <div role="alert" className="cg-banner cg-banner--danger">
          <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      {assetsAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {assetsAsync.status === 'error' && (
        <ErrorBox message={assetsAsync.message} onRetry={reloadData} />
      )}

      {assetsAsync.status === 'ready' && activeAssets.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <CheckCircle2 className="cg-icon cg-icon--xl mx-auto text-success mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Tidak ada aset aktif untuk dilepas</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Semua aset tetap yang terdaftar telah dilepas atau belum ada aset yang ditambahkan.
          </p>
        </div>
      )}

      {assetsAsync.status === 'ready' && activeAssets.length > 0 && (
        <form onSubmit={handleOpenConfirm} className="grid grid-cols-1 desktop:grid-cols-3 gap-24 items-start">
          {/* Left Form: 2 cols */}
          <div className="cg-card p-24 space-y-16 desktop:col-span-2">
            <div className="border-b border-border pb-12">
              <h3 className="font-bold text-base text-text">Formulir Pelepasan Aset</h3>
              <p className="text-xs text-text-muted mt-4">
                Pilih aset aktif dan masukkan nilai hasil penjualan (jika ada).
              </p>
            </div>

            <div className="space-y-4">
              <label htmlFor="select-asset" className="text-xs font-semibold text-text-muted block">
                Pilih Aset yang Hendak Dilepas <span className="text-danger">*</span>
              </label>
              <select
                id="select-asset"
                required
                className="cg-input text-sm w-full"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
              >
                <option value="">-- Pilih salah satu aset aktif --</option>
                {activeAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — Nilai Buku: {formatRp(a.bookValue)} (Perolehan: {fmtDate(a.acquiredOn)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
              <div className="space-y-4">
                <label htmlFor="disposal-date" className="text-xs font-semibold text-text-muted block">
                  Tanggal Pelepasan <span className="text-danger">*</span>
                </label>
                <input
                  id="disposal-date"
                  type="date"
                  required
                  max={today}
                  className="cg-input text-sm w-full"
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                />
              </div>

              <div className="space-y-4">
                <label htmlFor="disposal-proceeds" className="text-xs font-semibold text-text-muted block">
                  Hasil Penjualan Aset (Rp)
                </label>
                <input
                  id="disposal-proceeds"
                  type="number"
                  min={0}
                  step={1}
                  required
                  placeholder="0"
                  className="cg-input text-sm w-full cg-num"
                  value={proceeds}
                  onChange={(e) => setProceeds(e.target.value)}
                />
                <span className="text-[11px] text-text-muted">Isi 0 bila dibuang, rusak total, atau dihibahkan.</span>
              </div>
            </div>

            <div className="space-y-4">
              <label htmlFor="cash-account" className="text-xs font-semibold text-text-muted block">
                Akun Kas / Bank Penerima Hasil {numProceeds > 0 && <span className="text-danger">*</span>}
              </label>
              <select
                id="cash-account"
                required={numProceeds > 0}
                className="cg-input text-sm w-full"
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
                disabled={numProceeds === 0}
              >
                <option value="">-- Pilih Akun Kas/Bank Penerima --</option>
                {cashAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} · {acc.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-text-muted">Wajib dipilih bila hasil penjualan lebih dari 0.</span>
            </div>

            <div className="space-y-4">
              <label htmlFor="gainloss-account" className="text-xs font-semibold text-text-muted block">
                Akun Laba / Rugi Pelepasan Aset {estimatedGainLoss !== 0 && <span className="text-danger">*</span>}
              </label>
              <select
                id="gainloss-account"
                required={estimatedGainLoss !== 0}
                className="cg-input text-sm w-full"
                value={gainLossAccountId}
                onChange={(e) => setGainLossAccountId(e.target.value)}
              >
                <option value="">-- Pilih Akun Laba/Rugi Pelepasan --</option>
                {gainLossAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} · {acc.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-text-muted">
                Wajib dipilih bila pelepasan menghasilkan laba atau rugi bersih.
              </span>
            </div>

            <div className="pt-12 border-t border-border flex justify-end">
              <button
                type="submit"
                className="cg-btn cg-btn--danger"
                disabled={!selectedAsset}
              >
                <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                <span>Tinjau & Konfirmasi Pelepasan</span>
              </button>
            </div>
          </div>

          {/* Right Summary Card: 1 col */}
          <div className="cg-card p-24 space-y-16">
            <h3 className="font-bold text-base text-text flex items-center gap-8 border-b border-border pb-12">
              <DollarSign className="cg-icon cg-icon--sm text-accent" aria-hidden />
              Kalkulasi Laba / Rugi
            </h3>

            {selectedAsset ? (
              <div className="space-y-12 text-xs">
                <div className="space-y-4">
                  <span className="text-text-muted block">Aset Terpilih:</span>
                  <span className="font-bold text-sm text-text block">{selectedAsset.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-8 border-t border-border">
                  <div>
                    <span className="text-text-muted block">Harga Perolehan:</span>
                    <span className="font-semibold text-text cg-num">{formatRp(selectedAsset.cost)}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Akumulasi Susut:</span>
                    <span className="font-semibold text-text cg-num">{formatRp(selectedAsset.accumulatedDepreciation)}</span>
                  </div>
                </div>

                <div className="pt-8 border-t border-border">
                  <span className="text-text-muted block">Nilai Buku Saat Ini:</span>
                  <span className="font-bold text-sm text-accent cg-num">{formatRp(selectedAsset.bookValue)}</span>
                </div>

                <div className="pt-8 border-t border-border">
                  <span className="text-text-muted block">Hasil Penjualan:</span>
                  <span className="font-bold text-sm text-text cg-num">{formatRp(numProceeds)}</span>
                </div>

                <div
                  className={`p-12 rounded-xl border flex items-center gap-8 ${
                    estimatedGainLoss > 0
                      ? 'bg-success/10 border-success/20 text-success'
                      : estimatedGainLoss < 0
                      ? 'bg-danger/10 border-danger/20 text-danger'
                      : 'bg-surface border-border text-text'
                  }`}
                >
                  {estimatedGainLoss > 0 ? (
                    <TrendingUp className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                  ) : (
                    <TrendingDown className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <span className="text-[11px] block font-semibold">
                      {estimatedGainLoss > 0
                        ? 'Laba Pelepasan Aset:'
                        : estimatedGainLoss < 0
                        ? 'Rugi Pelepasan Aset:'
                        : 'Impas (Tanpa Laba/Rugi):'}
                    </span>
                    <span className="font-bold text-base cg-num">
                      {estimatedGainLoss > 0
                        ? `+${formatRp(estimatedGainLoss)}`
                        : formatRp(estimatedGainLoss)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-16 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-text-muted">
                Pilih aset pada formulir di sebelah kiri untuk melihat rincian perhitungan nilai buku dan estimasi laba/rugi.
              </div>
            )}
          </div>
        </form>
      )}

      <AssetAssumptionNote />

      {showConfirm && selectedAsset && (
        <ConfirmDisposalDialog
          asset={selectedAsset}
          proceeds={numProceeds}
          gainLoss={estimatedGainLoss}
          date={disposalDate}
          loading={submitting}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleExecuteDisposal}
        />
      )}
    </div>
  );
}

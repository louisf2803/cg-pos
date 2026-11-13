'use client';

import { useState } from 'react';
import { Check, Sliders, Info, AlertCircle } from 'lucide-react';
import type { OutletOptions } from '@cgpos/shared';
import { useData } from '@/lib/data';

interface OutletReconcileCardProps {
  options: OutletOptions;
  onSaved: () => void;
}

export function OutletReconcileCard({ options, onSaved }: OutletReconcileCardProps) {
  const data = useData();
  const [autoReconcile, setAutoReconcile] = useState<boolean>(
    options.autoReconcileNoncash ?? false
  );
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async (newValue: boolean) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await data.saveOutletOptions({
        ...options,
        autoReconcileNoncash: newValue,
      });
      setAutoReconcile(newValue);
      setOk(true);
      onSaved();
      setTimeout(() => setOk(false), 3000);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan pengaturan rekonsiliasi outlet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-16 border border-border rounded-xl bg-surface shadow-xs flex flex-col gap-12">
      <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-8 pb-12 border-b border-border">
        <div className="flex items-center gap-8">
          <Sliders className="w-16 h-16 text-accent flex-shrink-0" aria-hidden />
          <div>
            <h3 className="text-sm font-bold text-text">
              Kebijakan Pencatatan Non-Tunai Outlet
            </h3>
            <p className="text-xs text-text-muted mt-[2px]">
              Tentukan apakah penerimaan kartu/QRIS otomatis masuk bank atau memerlukan rekonsiliasi manual.
            </p>
          </div>
        </div>

        {ok && (
          <span className="cg-badge cg-badge--success text-xs inline-flex items-center gap-4">
            <Check className="w-12 h-12" aria-hidden /> Tersimpan
          </span>
        )}
      </div>

      {err && (
        <div role="alert" className="cg-banner cg-banner--danger text-xs flex items-center gap-8">
          <AlertCircle className="w-16 h-16 flex-shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
        <button
          type="button"
          disabled={busy}
          onClick={() => handleSave(false)}
          className={`p-12 rounded-lg border text-left transition-colors flex flex-col justify-between ${
            !autoReconcile
              ? 'border-accent bg-accent/5 ring-1 ring-accent'
              : 'border-border bg-surface-raised hover:border-text-muted'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <strong className="text-xs font-bold text-text">
                Rekonsiliasi Manual (Direkomendasikan)
              </strong>
              {!autoReconcile && (
                <span className="cg-badge cg-badge--success text-[11px] font-semibold">Aktif</span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Penerimaan non-tunai ditampung pada akun Piutang Gateway (1-1300) atau Piutang Non-tunai (1-1310). Diakui ke Kas/Bank setelah dicocokkan dengan mutasi rekening.
            </p>
          </div>
          <span className="text-[11px] text-text-muted mt-8 block">
            Cocok untuk audit ketat dan pencatatan potongan biaya MDR.
          </span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => handleSave(true)}
          className={`p-12 rounded-lg border text-left transition-colors flex flex-col justify-between ${
            autoReconcile
              ? 'border-accent bg-accent/5 ring-1 ring-accent'
              : 'border-border bg-surface-raised hover:border-text-muted'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <strong className="text-xs font-bold text-text">
                Pencatatan Otomatis Saat Tutup Kasir
              </strong>
              {autoReconcile && (
                <span className="cg-badge cg-badge--success text-[11px] font-semibold">Aktif</span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Saat kasir menutup shift, seluruh penerimaan non-tunai langsung otomatis dianggap cocok dan dibukukan langsung ke rekening Bank (1-1200) tanpa menunggu audit manual.
            </p>
          </div>
          <span className="text-[11px] text-text-muted mt-8 block">
            Praktis untuk operasional cepat dengan selisih minimal.
          </span>
        </button>
      </div>

      <div className="flex items-center gap-8 text-[11px] text-text-muted bg-surface-raised p-8 rounded-md border border-border">
        <Info className="w-16 h-16 flex-shrink-0" aria-hidden />
        <span>
          Perubahan mode rekonsiliasi outlet berlaku mulai shift berikutnya yang ditutup oleh kasir.
        </span>
      </div>
    </div>
  );
}

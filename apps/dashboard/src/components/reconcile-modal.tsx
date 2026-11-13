'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, AlertCircle, X, Calculator, ShieldAlert } from 'lucide-react';
import {
  computePaymentFee,
  formatRp,
  parseRp,
  type NonCashReconcileRow,
  type PaymentMethodConfig,
  type SaveReconciliationInput,
} from '@cgpos/shared';
import { useDialog } from '@/components/fin-common';

interface ReconcileModalProps {
  row: NonCashReconcileRow;
  methodConfig?: PaymentMethodConfig;
  onClose: () => void;
  onSave: (input: SaveReconciliationInput) => Promise<void>;
}

export function ReconcileModal({
  row,
  methodConfig,
  onClose,
  onSave,
}: ReconcileModalProps) {
  const d = useDialog(onClose);
  const [actualText, setActualText] = useState<string>(
    row.actualAmount !== undefined ? String(row.actualAmount) : String(row.systemAmount)
  );
  const [feeText, setFeeText] = useState<string>(
    row.feeAmount !== undefined ? String(row.feeAmount) : '0'
  );
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsedActual = parseRp(actualText);
  const parsedFee = parseRp(feeText);
  const totalAccounted = parsedActual + parsedFee;
  const diff = totalAccounted - row.systemAmount;

  const isMatched = diff === 0;

  const handleApplyDefaultFee = () => {
    if (!methodConfig) return;
    const { fee, net } = computePaymentFee(row.systemAmount, methodConfig);
    setFeeText(String(fee));
    setActualText(String(net));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (parsedActual < 0) {
      setErr('Nominal diterima di bank tidak boleh negatif.');
      return;
    }
    if (parsedFee < 0) {
      setErr('Potongan biaya gateway tidak boleh negatif.');
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await onSave({
        id: row.id,
        shiftId: row.shiftId,
        methodId: row.methodId,
        actualAmount: parsedActual,
        feeAmount: parsedFee,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan rekonsiliasi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog {...d.props} aria-labelledby="recon-modal-title">
      <div className="flex flex-col gap-16 min-w-0">
        <div className="flex items-center justify-between border-b border-border pb-12">
          <div>
            <h2 id="recon-modal-title" className="cg-modal__title text-lg font-bold text-text">
              Rekonsiliasi {row.methodName}
            </h2>
            <p className="text-xs text-text-muted mt-[2px]">
              {row.shiftNumber ? `${row.shiftNumber} · ` : ''}
              {row.date ? `${row.date} · ` : ''}
              {row.transactionCount} transaksi dicatat POS
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost p-8 text-text-muted hover:text-text rounded-lg"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            <X className="w-16 h-16" aria-hidden />
          </button>
        </div>

        {err && (
          <div role="alert" className="cg-banner cg-banner--danger text-sm flex items-center gap-8">
            <AlertCircle className="w-16 h-16 flex-shrink-0" aria-hidden />
            <span>{err}</span>
          </div>
        )}

        <div className="p-12 rounded-lg bg-surface-raised border border-border grid grid-cols-2 gap-12 text-xs">
          <div>
            <span className="text-text-muted block mb-4">Penerimaan Bruto POS:</span>
            <strong className="text-base text-accent-strong font-bold cg-num block">
              {formatRp(row.systemAmount)}
            </strong>
          </div>
          <div>
            <span className="text-text-muted block mb-4">Jenis Akun Piutang:</span>
            <span className="cg-badge text-xs font-medium">
              {row.methodKind === 'gateway'
                ? '1-1300 Piutang Gateway (DOKU)'
                : '1-1310 Piutang Non-tunai (EDC/Transfer)'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-16" noValidate>
          <div className="cg-field">
            <label className="cg-label" htmlFor="recon-actual">
              Penerimaan Bersih Masuk Rekening Bank (Netto)
            </label>
            <div className="flex items-center h-[44px] w-full border border-border rounded-lg bg-surface focus-within:border-accent focus-within:ring-1 focus-within:ring-accent overflow-hidden transition-colors">
              <span className="pl-12 pr-4 text-xs font-semibold text-text-muted select-none shrink-0">
                Rp
              </span>
              <input
                id="recon-actual"
                type="text"
                inputMode="numeric"
                className="w-full h-full bg-transparent pr-12 text-right cg-num text-sm text-text font-bold focus:outline-hidden"
                placeholder="0"
                value={new Intl.NumberFormat('id-ID').format(parsedActual)}
                onChange={(e) => setActualText(e.target.value.replace(/[^\d]/g, ''))}
                required
              />
            </div>
            <p className="text-xs text-text-muted mt-4">
              Nominal mutasi kredit rekening bank (Kas/Bank 1-1200) dari EDC / settlement.
            </p>
          </div>

          <div className="cg-field">
            <div className="flex items-center justify-between mb-4">
              <label className="cg-label mb-0" htmlFor="recon-fee">
                Biaya Transaksi Gateway / MDR (Beban)
              </label>
              {methodConfig && (methodConfig.feePct > 0 || methodConfig.feeFixed > 0) && (
                <button
                  type="button"
                  className="text-xs text-accent-strong hover:underline flex items-center gap-4 font-medium"
                  onClick={handleApplyDefaultFee}
                >
                  <Calculator className="w-12 h-12" aria-hidden />
                  Terapkan MDR ({methodConfig.feePct}% + {formatRp(methodConfig.feeFixed)})
                </button>
              )}
            </div>
            <div className="flex items-center h-[44px] w-full border border-border rounded-lg bg-surface focus-within:border-accent focus-within:ring-1 focus-within:ring-accent overflow-hidden transition-colors">
              <span className="pl-12 pr-4 text-xs font-semibold text-text-muted select-none shrink-0">
                Rp
              </span>
              <input
                id="recon-fee"
                type="text"
                inputMode="numeric"
                className="w-full h-full bg-transparent pr-12 text-right cg-num text-sm text-text font-semibold focus:outline-hidden"
                placeholder="0"
                value={new Intl.NumberFormat('id-ID').format(parsedFee)}
                onChange={(e) => setFeeText(e.target.value.replace(/[^\d]/g, ''))}
              />
            </div>
            <p className="text-xs text-text-muted mt-4">
              Potongan komisi/MDR penyedia dibukukan ke akun 6-2100 Biaya Gateway.
            </p>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="recon-notes">
              Catatan Rekonsiliasi (Opsional)
            </label>
            <input
              id="recon-notes"
              type="text"
              className="cg-input text-sm"
              maxLength={150}
              placeholder="Mis. Batch EDC 481 BCA, tanggal settlement, dsb."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Hasil Perhitungan Selisih */}
          <div
            className={`p-12 rounded-lg border flex items-center justify-between ${
              isMatched
                ? 'bg-accent/10 border-accent text-accent-strong'
                : 'bg-danger/10 border-danger text-danger'
            }`}
          >
            <div className="flex items-center gap-8 text-xs font-semibold">
              {isMatched ? (
                <>
                  <CheckCircle2 className="w-16 h-16" aria-hidden />
                  <span>Saldo Seimbang (Netto + Fee = Bruto Sistem)</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-16 h-16" aria-hidden />
                  <span>
                    {diff > 0
                      ? 'Penerimaan Bank Lebih Besar'
                      : 'Penerimaan Bank Kurang (Selisih)'}
                  </span>
                </>
              )}
            </div>
            <strong className="text-base font-bold cg-num">
              {diff > 0 ? `+${formatRp(diff)}` : formatRp(diff)}
            </strong>
          </div>

          <div className="flex justify-end gap-12 pt-8 border-t border-border mt-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </button>
            <button
              type="submit"
              className="cg-btn cg-btn--primary"
              disabled={busy}
            >
              {busy ? 'Menyimpan...' : 'Simpan Rekonsiliasi'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

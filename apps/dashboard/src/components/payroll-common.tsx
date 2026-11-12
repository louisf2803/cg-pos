'use client';

import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { MONTH_NAMES_ID, formatRp, parseRp, payrollErrorMessage } from '@cgpos/shared';

export function PayrollLoadBanner({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const info = payrollErrorMessage(error);
  return (
    <div className="cg-banner cg-banner--danger" role="alert">
      <div className="flex items-start gap-8 min-w-0">
        {info.forbidden && <ShieldAlert className="cg-icon cg-icon--sm shrink-0 mt-4" aria-hidden />}
        <div className="min-w-0">
          {info.forbidden && <strong className="block">Akses khusus Pemilik / Manajer</strong>}
          <span>{info.message}</span>
        </div>
      </div>
      {!info.forbidden && onRetry && (
        <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm shrink-0" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function PayrollNoticeBanner({
  notice,
  onClose,
}: {
  notice: { kind: 'success' | 'danger'; text: string } | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  const cls =
    notice.kind === 'danger'
      ? 'cg-banner cg-banner--danger items-center justify-between'
      : 'cg-banner bg-accent-soft text-accent-strong border border-accent/25 items-center justify-between';
  return (
    <div role={notice.kind === 'danger' ? 'alert' : 'status'} className={cls}>
      <span className="font-medium break-words">{notice.text}</span>
      <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={onClose}>
        Tutup
      </button>
    </div>
  );
}

export function PayrollSkeleton() {
  return (
    <div className="grid gap-16" aria-busy="true" aria-label="Memuat data penggajian">
      <div className="cg-skeleton h-[84px]" />
      <div className="cg-skeleton h-[260px]" />
    </div>
  );
}

export function MonthYearPicker({
  idPrefix,
  month,
  year,
  onChange,
  minYear = 2024,
  maxYear,
}: {
  idPrefix: string;
  month: number;
  year: number;
  onChange: (next: { month: number; year: number }) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const currentYear = new Date().getFullYear();
  const topYear = Math.max(maxYear ?? currentYear + 1, year);
  const lowYear = Math.min(minYear, year);
  const years: number[] = [];
  for (let y = topYear; y >= lowYear; y--) years.push(y);

  return (
    <div className="flex flex-wrap items-end gap-12 min-w-0">
      <div className="cg-field min-w-[140px]">
        <label className="cg-label" htmlFor={`${idPrefix}-bulan`}>
          Bulan
        </label>
        <select
          id={`${idPrefix}-bulan`}
          className="cg-input"
          value={month}
          onChange={(e) => onChange({ month: Number(e.target.value), year })}
        >
          {MONTH_NAMES_ID.map((label, idx) => (
            <option key={label} value={idx + 1}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="cg-field min-w-[100px]">
        <label className="cg-label" htmlFor={`${idPrefix}-tahun`}>
          Tahun
        </label>
        <select
          id={`${idPrefix}-tahun`}
          className="cg-input"
          value={year}
          onChange={(e) => onChange({ month, year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function RupiahField({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="cg-field min-w-0">
      <label className="cg-label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-8 min-w-0">
        <span className="text-xs font-semibold text-text-muted shrink-0">Rp</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="cg-input cg-num min-w-0 flex-1"
          maxLength={12}
          disabled={disabled}
          value={String(value)}
          onChange={(e) => onChange(parseRp(e.target.value))}
        />
      </div>
      <span className="text-xs text-text-muted cg-num">
        {formatRp(value)}
        {hint ? <> · {hint}</> : null}
      </span>
    </div>
  );
}


'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';
import {
  COFFEE_GROUND_PAYROLL_RULES,
  formatRp,
  operationalPenalty,
  payrollErrorMessage,
  payrollRulesProblem,
  type PayrollRules,
} from '@cgpos/shared';
import {
  PayrollLoadBanner,
  PayrollNoticeBanner,
  PayrollSkeleton,
  RupiahField,
} from '@/components/payroll-common';
import { PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

function IntField({
  id,
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  hint?: string;
}) {
  return (
    <div className="cg-field min-w-0">
      <label className="cg-label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-8 min-w-0">
        <input
          id={id}
          type="number"
          min={0}
          max={366}
          step={1}
          inputMode="numeric"
          className="cg-input cg-num min-w-0 flex-1"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === '') {
              onChange(0);
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
          }}
        />
        <span className="text-xs font-medium text-text-muted shrink-0">{unit}</span>
      </div>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

export default function AturanPayrollPage() {
  const data = useData();
  const state = useAsync(() => data.getPayrollRules(), [data]);

  const [draft, setDraft] = useState<PayrollRules>({ ...COFFEE_GROUND_PAYROLL_RULES });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const loadedRules = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (loadedRules) {
      setDraft({ ...loadedRules });
    }
  }, [loadedRules]);

  const problem = payrollRulesProblem(draft);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setNotice({ kind: 'danger', text: problem });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await data.savePayrollRules(draft);
      setDraft(saved);
      setNotice({ kind: 'success', text: 'Aturan payroll organisasi berhasil disimpan.' });
    } catch (err) {
      setNotice({ kind: 'danger', text: payrollErrorMessage(err).message });
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreDefaults() {
    setDraft({ ...COFFEE_GROUND_PAYROLL_RULES });
    setNotice({
      kind: 'success',
      text: 'Angka bawaan Coffee Ground dimuat ke formulir. Tekan Simpan aturan untuk menerapkan ke server.',
    });
  }

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Aturan payroll karyawan"
        subtitle="Atur toleransi telat, bonus tanpa telat, kuota absen tahunan, denda kesalahan operasional, dan nominal insentif per bulan."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/karyawan/payroll" className="cg-btn cg-btn--secondary cg-btn--sm">
              <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
              Kembali ke Payroll
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm"
              onClick={handleRestoreDefaults}
              disabled={state.status !== 'ready' || saving}
            >
              <RotateCcw className="cg-icon cg-icon--sm" aria-hidden />
              Kembalikan bawaan Coffee Ground
            </button>
          </div>
        }
      />

      <PayrollNoticeBanner notice={notice} onClose={() => setNotice(null)} />

      {state.status === 'loading' && <PayrollSkeleton />}

      {state.status === 'error' && (
        <PayrollLoadBanner error={state.message} onRetry={() => state.reload()} />
      )}

      {state.status === 'ready' && (
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-16 min-w-0">
          {/* Kartu Keterlambatan */}
          <section className="cg-card p-16 grid gap-12 min-w-0">
            <div>
              <h2 className="text-base font-bold text-text">Keterlambatan &amp; Bonus Disiplin</h2>
              <p className="text-xs text-text-muted mt-4">
                Telat dihitung dari clock in pertama pada hari terjadwal melebihi jam mulai ditambah toleransi. Karyawan probasi dan admin tidak terkena bonus atau denda telat.
              </p>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12">
              <IntField
                id="rule-grace-min"
                label="Toleransi menit telat"
                unit="menit"
                value={draft.latenessGraceMinutes}
                onChange={(v) => setDraft((p) => ({ ...p, latenessGraceMinutes: v }))}
                hint="0 menit = tepat sesuai jam mulai"
              />
              <RupiahField
                id="rule-no-late-bonus"
                label="Bonus tanpa telat"
                value={draft.noLatenessBonus}
                onChange={(v) => setDraft((p) => ({ ...p, noLatenessBonus: v }))}
                hint="Diberikan bila telat 0 kali/bulan"
              />
              <IntField
                id="rule-forgiven-max"
                label="Batas telat dimaafkan"
                unit="kali / bulan"
                value={draft.latenessForgivenMax}
                onChange={(v) => setDraft((p) => ({ ...p, latenessForgivenMax: v }))}
                hint="1 s.d. batas = tanpa bonus & tanpa denda"
              />
              <RupiahField
                id="rule-late-penalty"
                label="Denda per telat"
                value={draft.latenessPenaltyPerTime}
                onChange={(v) => setDraft((p) => ({ ...p, latenessPenaltyPerTime: v }))}
                hint={`Contoh ${draft.latenessForgivenMax + 1}x telat = ${formatRp((draft.latenessForgivenMax + 1) * draft.latenessPenaltyPerTime)}`}
              />
            </div>
          </section>

          {/* Kartu Absen Tahunan */}
          <section className="cg-card p-16 grid gap-12 min-w-0">
            <div>
              <h2 className="text-base font-bold text-text">Absen &amp; Kuota Tahunan</h2>
              <p className="text-xs text-text-muted mt-4">
                Hari kerja terjadwal yang terlewat tanpa absensi dan tidak ditandai diizinkan mengurangi kuota tahunan sebelum dikenai denda harian.
              </p>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
              <IntField
                id="rule-absence-quota"
                label="Kuota absen tahunan"
                unit="hari / tahun"
                value={draft.absenceYearlyQuota}
                onChange={(v) => setDraft((p) => ({ ...p, absenceYearlyQuota: v }))}
                hint="Sisa kuota dihitung dari gaji bulan sebelumnya di tahun yang sama"
              />
              <RupiahField
                id="rule-absence-penalty"
                label="Denda per hari absen lewat kuota"
                value={draft.absencePenaltyPerDay}
                onChange={(v) => setDraft((p) => ({ ...p, absencePenaltyPerDay: v }))}
                hint="Hanya hari yang baru melampaui kuota yang didenda"
              />
            </div>
          </section>

          {/* Kartu Salah Operasional & Insentif */}
          <section className="cg-card p-16 grid gap-12 min-w-0">
            <div>
              <h2 className="text-base font-bold text-text">Salah Operasional &amp; Insentif Bulanan</h2>
              <p className="text-xs text-text-muted mt-4">
                Simulasi denda salah operasional: ke-1 {formatRp(operationalPenalty(1, draft))}, ke-2{' '}
                {formatRp(draft.operationalPenaltyBase + draft.operationalPenaltyStep)}, ke-3{' '}
                {formatRp(draft.operationalPenaltyBase + draft.operationalPenaltyStep * 2)} (total 3x ={' '}
                {formatRp(operationalPenalty(3, draft))}).
              </p>
            </div>
            <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12">
              <RupiahField
                id="rule-op-base"
                label="Denda salah op (ke-1)"
                value={draft.operationalPenaltyBase}
                onChange={(v) => setDraft((p) => ({ ...p, operationalPenaltyBase: v }))}
              />
              <RupiahField
                id="rule-op-step"
                label="Kenaikan denda per kali"
                value={draft.operationalPenaltyStep}
                onChange={(v) => setDraft((p) => ({ ...p, operationalPenaltyStep: v }))}
              />
              <RupiahField
                id="rule-stockan"
                label="Insentif stokan"
                value={draft.stockanIncentive}
                onChange={(v) => setDraft((p) => ({ ...p, stockanIncentive: v }))}
              />
              <RupiahField
                id="rule-deep-clean"
                label="Insentif deep cleaning"
                value={draft.deepCleaningIncentive}
                onChange={(v) => setDraft((p) => ({ ...p, deepCleaningIncentive: v }))}
              />
            </div>
          </section>

          {problem && (
            <div role="alert" className="cg-banner cg-banner--danger">
              <span>{problem}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-8">
            <button
              type="submit"
              className="cg-btn cg-btn--primary"
              disabled={saving || Boolean(problem)}
              data-testid="save-payroll-rules-btn"
            >
              <Save className="cg-icon cg-icon--sm" aria-hidden />
              {saving ? 'Menyimpan...' : 'Simpan aturan'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}


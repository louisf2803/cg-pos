'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Printer } from 'lucide-react';
import {
  EMPLOYMENT_STATUS_LABEL,
  MONTH_NAMES_ID,
  computePayslipSubtotals,
  formatRp,
  localParts,
  type PayrollRecord,
} from '@cgpos/shared';
import {
  MonthYearPicker,
  PayrollLoadBanner,
  PayrollSkeleton,
} from '@/components/payroll-common';
import { PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

function fmtPaidDate(iso: string | undefined, tz: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(d);
}

export default function SlipGajiPage() {
  const data = useData();
  const initNow = localParts(new Date(), 'Asia/Jakarta');
  const [period, setPeriod] = useState<{ month: number; year: number }>({
    month: initNow.m,
    year: initNow.y,
  });
  const [selectedEmpId, setSelectedEmpId] = useState('');

  // Baca parameter ?month=&year=&employee= saat pertama dibuka tanpa memicu build error SSG
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const m = Number.parseInt(params.get('month') ?? '', 10);
    const y = Number.parseInt(params.get('year') ?? '', 10);
    const emp = params.get('employee') ?? '';
    if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 2000 && y <= 2100) {
      setPeriod({ month: m, year: y });
    }
    if (emp) setSelectedEmpId(emp);
  }, []);

  const state = useAsync(async () => {
    const [ctx, yearRecords] = await Promise.all([
      data.getContext(),
      data.listPayrollYear(period.year),
    ]);
    return { ctx, yearRecords };
  }, [data, period.year]);

  const monthRecords: PayrollRecord[] = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.yearRecords
      .filter((r) => r.month === period.month && r.year === period.year)
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'id'));
  }, [state, period.month, period.year]);

  useEffect(() => {
    if (monthRecords.length === 0) return;
    if (!selectedEmpId || !monthRecords.some((r) => r.employeeId === selectedEmpId)) {
      setSelectedEmpId(monthRecords[0]!.employeeId);
    }
  }, [monthRecords, selectedEmpId]);

  const selectedRecord = useMemo(
    () => monthRecords.find((r) => r.employeeId === selectedEmpId) ?? null,
    [monthRecords, selectedEmpId],
  );

  const subtotals = useMemo(
    () => (selectedRecord ? computePayslipSubtotals(selectedRecord) : null),
    [selectedRecord],
  );

  const tz = state.status === 'ready' ? state.data.ctx.timezone : 'Asia/Jakarta';
  const monthLabel = MONTH_NAMES_ID[period.month - 1] ?? `Bulan ${period.month}`;

  return (
    <div className="grid gap-16 min-w-0">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #slip-cetak-area, #slip-cetak-area * { visibility: visible !important; }
          #slip-cetak-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            background: #ffffff !important;
          }
          .cg-print-hide { display: none !important; }
        }
      `}</style>

      <div className="cg-print-hide">
        <PageHeader
          title="Slip gaji karyawan"
          subtitle="Lihat dan cetak rincian gaji yang sudah disimpan sebagai draf maupun yang telah dikunci (PAID)."
          actions={
            <div className="flex flex-wrap gap-8">
              <Link href="/karyawan/payroll" className="cg-btn cg-btn--secondary cg-btn--sm">
                <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
                Kembali ke Payroll
              </Link>
              <button
                type="button"
                className="cg-btn cg-btn--primary cg-btn--sm"
                disabled={!selectedRecord}
                onClick={() => window.print()}
                data-testid="print-slip-btn"
              >
                <Printer className="cg-icon cg-icon--sm" aria-hidden />
                Cetak slip
              </button>
            </div>
          }
        />
      </div>

      <section className="cg-card p-16 flex flex-wrap items-end gap-12 min-w-0 cg-print-hide">
        <MonthYearPicker
          idPrefix="slip"
          month={period.month}
          year={period.year}
          onChange={setPeriod}
        />
        <div className="cg-field min-w-[220px] flex-1">
          <label className="cg-label" htmlFor="slip-karyawan">
            Karyawan (periode tersimpan)
          </label>
          <select
            id="slip-karyawan"
            className="cg-input"
            value={selectedEmpId}
            disabled={monthRecords.length === 0}
            onChange={(e) => setSelectedEmpId(e.target.value)}
          >
            {monthRecords.length === 0 ? (
              <option value="">Belum ada gaji tersimpan di bulan ini</option>
            ) : (
              monthRecords.map((r) => (
                <option key={r.employeeId} value={r.employeeId}>
                  {r.employeeName} ({EMPLOYMENT_STATUS_LABEL[r.employmentStatus]} · {r.status})
                </option>
              ))
            )}
          </select>
        </div>
      </section>

      {state.status === 'loading' && <PayrollSkeleton />}

      {state.status === 'error' && (
        <PayrollLoadBanner error={state.message} onRetry={() => state.reload()} />
      )}

      {state.status === 'ready' && monthRecords.length === 0 && (
        <div className="cg-empty" data-testid="slip-empty-state">
          <FileText className="cg-icon cg-icon--lg mx-auto mb-8 text-text-muted" aria-hidden />
          <p>
            <strong>Belum ada slip gaji tersimpan untuk {monthLabel} {period.year}</strong>
          </p>
          <p className="text-sm text-text-muted mt-4 mb-12">
            Slip gaji hanya tersedia untuk periode yang sudah disimpan sebagai draf atau dikunci (PAID) di halaman Payroll.
          </p>
          <Link href="/karyawan/payroll" className="cg-btn cg-btn--primary cg-btn--sm">
            Buka halaman Payroll
          </Link>
        </div>
      )}

      {state.status === 'ready' && selectedRecord && subtotals && (
        <article
          id="slip-cetak-area"
          data-testid="slip-cetak-area"
          className="cg-card p-16 tablet:p-24 grid gap-16 min-w-0"
        >
          {/* Kepala slip */}
          <div className="flex flex-wrap items-start justify-between gap-12 pb-12 border-b border-border min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {state.data.ctx.orgName} · {state.data.ctx.outletName}
              </div>
              <h2 className="text-xl font-bold text-text mt-4">Slip Gaji Karyawan</h2>
              <div className="text-sm text-text-muted mt-4">
                Periode: <span className="font-semibold text-text">{monthLabel} {selectedRecord.year}</span>
              </div>
            </div>
            <div className="text-left tablet:text-right min-w-0">
              <span
                className={`cg-badge ${
                  selectedRecord.status === 'PAID'
                    ? 'bg-accent-soft text-accent-strong border border-accent/25'
                    : 'cg-badge--warning'
                }`}
              >
                {selectedRecord.status === 'PAID' ? 'PAID — Lunas' : 'DRAF'}
              </span>
              {selectedRecord.paidAt && (
                <div className="text-xs text-text-muted mt-4">
                  Dikunci: {fmtPaidDate(selectedRecord.paidAt, tz)}
                </div>
              )}
            </div>
          </div>

          {/* Identitas penerima (tanpa PIN / kata sandi) */}
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 p-12 rounded-lg bg-surface border border-border min-w-0">
            <div className="min-w-0">
              <div className="text-xs text-text-muted">Nama Karyawan</div>
              <div className="font-bold text-text break-words mt-4">{selectedRecord.employeeName}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-text-muted">Status Kepegawaian</div>
              <div className="font-semibold text-text mt-4">
                {EMPLOYMENT_STATUS_LABEL[selectedRecord.employmentStatus]}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-text-muted">Ringkasan Kehadiran</div>
              <div className="text-sm text-text mt-4 cg-num">
                Telat {selectedRecord.latenessCount}x · Absen {selectedRecord.absenceCount} hr · Salah op{' '}
                {selectedRecord.operationalMistakes}x
              </div>
            </div>
          </div>

          {/* Rincian Penambah & Pengurang */}
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16 min-w-0">
            <div className="border border-border rounded-xl p-16 grid gap-8 min-w-0">
              <h3 className="text-sm font-bold text-accent-strong border-b border-border pb-8">
                Penerimaan (Penambah)
              </h3>
              <SlipRow label="Gaji pokok" amount={selectedRecord.basicSalary} />
              <SlipRow label="Uang makan" amount={selectedRecord.mealAllowance} />
              <SlipRow label="Bonus tidak telat" amount={selectedRecord.latenessBonus} />
              <SlipRow label="Insentif stokan" amount={selectedRecord.stockanIncentive} />
              <SlipRow label="Insentif deep cleaning" amount={selectedRecord.deepCleaningIncentive} />
              <SlipRow label="Komisi" amount={selectedRecord.commission} />
              <div className="flex items-center justify-between gap-8 pt-8 border-t border-border font-bold text-sm text-text">
                <span>Total Penerimaan</span>
                <span className="cg-num">{formatRp(subtotals.grossEarnings)}</span>
              </div>
            </div>

            <div className="border border-border rounded-xl p-16 grid gap-8 min-w-0">
              <h3 className="text-sm font-bold text-danger border-b border-border pb-8">
                Potongan (Pengurang)
              </h3>
              <SlipRow label="Potongan BPJS" amount={selectedRecord.bpjsAllowance} negative />
              <SlipRow
                label={`Denda telat (${selectedRecord.latenessCount}x)`}
                amount={selectedRecord.latenessPenalty}
                negative
              />
              <SlipRow
                label={`Denda absen (${selectedRecord.absenceCount} hr)`}
                amount={selectedRecord.absencePenalty}
                negative
              />
              <SlipRow
                label={`Denda salah operasional (${selectedRecord.operationalMistakes}x)`}
                amount={selectedRecord.operationalPenalty}
                negative
              />
              <SlipRow label="Denda stock opname" amount={selectedRecord.stockOpnamePenalty} negative />
              <SlipRow label="Potongan kasbon" amount={selectedRecord.cashAdvanceDeduction} negative />
              <div className="flex items-center justify-between gap-8 pt-8 border-t border-border font-bold text-sm text-danger">
                <span>Total Potongan</span>
                <span className="cg-num">-{formatRp(subtotals.totalDeductions)}</span>
              </div>
            </div>
          </div>

          {/* Gaji Bersih */}
          <div className="flex flex-wrap items-center justify-between gap-12 p-16 rounded-xl bg-accent-soft border border-accent/25 min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                Gaji Bersih Diterima
              </div>
              <div className="text-xs text-text-muted mt-4">
                Sisa kuota absen tahunan tercatat: {selectedRecord.absenceQuotaRemaining} hari
              </div>
            </div>
            <div
              className="text-2xl font-bold cg-num text-accent-strong"
              data-testid="slip-net-salary"
            >
              {formatRp(selectedRecord.netSalary)}
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

function SlipRow({
  label,
  amount,
  negative = false,
}: {
  label: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-8 text-sm min-w-0">
      <span className="text-text-muted break-words">{label}</span>
      <span className={`cg-num shrink-0 font-medium ${negative && amount > 0 ? 'text-danger' : 'text-text'}`}>
        {negative && amount > 0 ? `-${formatRp(amount)}` : formatRp(amount)}
      </span>
    </div>
  );
}


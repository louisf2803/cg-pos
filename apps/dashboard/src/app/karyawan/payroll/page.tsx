'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Unlock,
  Users,
} from 'lucide-react';
import {
  EMPLOYMENT_STATUS_LABEL,
  MONTH_NAMES_ID,
  applyWorksheetCashAdvanceOverrides,
  buildWorksheet,
  cashAdvanceBalances,
  draftFlagsFromPayrollRecords,
  formatRp,
  localDateKey,
  localMonthUtcRange,
  localParts,
  monthBounds,
  parseRp,
  pastAbsencesInYear,
  payrollErrorMessage,
  payrollUnlockErrorMessage,
  splitStockOpnamePenalty,
  summarizePayrollTotals,
  toCsv,
  type PayrollRecord,
  type PayrollRecordInput,
  type WorksheetFlags,
  type WorksheetRow,
} from '@cgpos/shared';
import {
  MonthYearPicker,
  PayrollLoadBanner,
  PayrollNoticeBanner,
  PayrollSkeleton,
  RupiahField,
} from '@/components/payroll-common';
import { useDialog } from '@/components/fin-common';
import { PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';

interface DisplayRow {
  employeeId: string;
  employeeName: string;
  status: PayrollRecord['employmentStatus'];
  lateDates: string[];
  absentDates: string[];
  excusedDates: string[];
  pastAbsencesInYear: number;
  cashAdvanceBalance: number;
  result: WorksheetRow['result'];
  periodRecordStatus?: 'DRAFT' | 'PAID';
  paidAt?: string;
}

export default function PayrollPage() {
  const data = useData();
  const initNow = localParts(new Date(), 'Asia/Jakarta');
  const [period, setPeriod] = useState<{ month: number; year: number }>({
    month: initNow.m,
    year: initNow.y,
  });

  const [flags, setFlags] = useState<Record<string, WorksheetFlags>>({});
  const [cashAdvanceOverrides, setCashAdvanceOverrides] = useState<Record<string, number>>({});
  const [defaultCommission, setDefaultCommission] = useState(0);
  const [stockOpnameTotal, setStockOpnameTotal] = useState(0);

  const [busyAction, setBusyAction] = useState<'draft' | 'lock' | 'unlock' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [detailRow, setDetailRow] = useState<DisplayRow | null>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const state = useAsync(async () => {
    const ctx = await data.getContext();
    const tz = ctx.timezone || 'Asia/Jakarta';
    const today = localDateKey(new Date(), tz);
    const utcRange = localMonthUtcRange(period.year, period.month, tz);
    const dateRangeLocal = monthBounds(period.year, period.month);

    const [rules, employees, schedules, incidents, attendance, cashAdvances, payrollYear] =
      await Promise.all([
        data.getPayrollRules(),
        data.listCompensation(),
        data.listSchedules(),
        data.listIncidents(dateRangeLocal),
        data.listAttendance(utcRange),
        data.listCashAdvances(),
        data.listPayrollYear(period.year),
      ]);

    const savedRecords = payrollYear.filter(
      (r) => r.month === period.month && r.year === period.year,
    );
    const pastAbsences = pastAbsencesInYear(payrollYear, period.year, period.month);
    const balances = cashAdvanceBalances(cashAdvances);

    return {
      tz,
      today,
      rules,
      employees,
      schedules,
      incidents,
      attendance,
      balances,
      savedRecords,
      pastAbsences,
    };
  }, [data, period.month, period.year]);

  const payload = state.status === 'ready' ? state.data : null;

  // Inisialisasi suntingan dari rekaman tersimpan (draf/terkunci) setiap berganti periode / selesai memuat
  useEffect(() => {
    if (!payload) return;
    if (payload.savedRecords.length > 0) {
      const seeded = draftFlagsFromPayrollRecords(payload.savedRecords);
      setFlags(seeded.flags);
      setCashAdvanceOverrides(seeded.cashAdvanceOverrides);
      setDefaultCommission(0);
      setStockOpnameTotal(
        payload.savedRecords.reduce((sum, r) => sum + r.stockOpnamePenalty, 0),
      );
    } else {
      setFlags({});
      setCashAdvanceOverrides({});
      setDefaultCommission(0);
      setStockOpnameTotal(0);
    }
  }, [payload]);

  const isLocked = useMemo(
    () => Boolean(payload?.savedRecords.some((r) => r.status === 'PAID')),
    [payload],
  );
  const hasSavedDraft = useMemo(
    () => Boolean(payload && payload.savedRecords.length > 0 && !isLocked),
    [payload, isLocked],
  );
  const paidAtIso = useMemo(
    () => payload?.savedRecords.find((r) => r.paidAt)?.paidAt,
    [payload],
  );

  // Bangun lembar kerja langsung memakai buildWorksheet + computePayroll dari @cgpos/shared
  const computed = useMemo(() => {
    if (!payload) {
      return { rows: [] as DisplayRow[], problems: {} as Record<string, string> };
    }
    const baseWorksheet = buildWorksheet({
      month: period.month,
      year: period.year,
      tz: payload.tz,
      rules: payload.rules,
      today: payload.today,
      employees: payload.employees,
      schedules: payload.schedules,
      attendance: payload.attendance,
      incidents: payload.incidents,
      pastAbsences: payload.pastAbsences,
      cashAdvanceBalance: payload.balances,
      flags,
      defaultCommission,
      stockOpnameTotal,
    });

    const applied = applyWorksheetCashAdvanceOverrides(
      baseWorksheet,
      payload.employees,
      cashAdvanceOverrides,
      payload.balances,
      payload.rules,
    );

    const wsByEmp = new Map(applied.rows.map((w) => [w.employeeId, w]));
    if (isLocked) {
      const savedRows: DisplayRow[] = payload.savedRecords
        .slice()
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'id'))
        .map((rec) => {
          const ws = wsByEmp.get(rec.employeeId);
          return {
            employeeId: rec.employeeId,
            employeeName: rec.employeeName,
            status: rec.employmentStatus,
            lateDates: ws?.lateDates ?? [],
            absentDates: ws?.absentDates ?? [],
            excusedDates: ws?.excusedDates ?? [],
            pastAbsencesInYear: payload.pastAbsences[rec.employeeId] ?? 0,
            cashAdvanceBalance: payload.balances[rec.employeeId] ?? 0,
            result: {
              basicSalary: rec.basicSalary,
              mealAllowance: rec.mealAllowance,
              bpjsAllowance: rec.bpjsAllowance,
              latenessCount: rec.latenessCount,
              latenessBonus: rec.latenessBonus,
              latenessPenalty: rec.latenessPenalty,
              absenceCount: rec.absenceCount,
              absencePenalty: rec.absencePenalty,
              absenceQuotaRemaining: rec.absenceQuotaRemaining,
              operationalMistakes: rec.operationalMistakes,
              operationalPenalty: rec.operationalPenalty,
              stockOpnamePenalty: rec.stockOpnamePenalty,
              stockanIncentive: rec.stockanIncentive,
              deepCleaningIncentive: rec.deepCleaningIncentive,
              commission: rec.commission,
              cashAdvanceDeduction: rec.cashAdvanceDeduction,
              netSalary: rec.netSalary,
            },
            periodRecordStatus: rec.status,
            paidAt: rec.paidAt,
          };
        });
      return { rows: savedRows, problems: {} as Record<string, string> };
    }

    const activeRows: DisplayRow[] = applied.rows
      .slice()
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'id'))
      .map((w) => ({
        employeeId: w.employeeId,
        employeeName: w.employeeName,
        status: w.status,
        lateDates: w.lateDates,
        absentDates: w.absentDates,
        excusedDates: w.excusedDates,
        pastAbsencesInYear: w.period.pastAbsencesInYear,
        cashAdvanceBalance: payload.balances[w.employeeId] ?? 0,
        result: w.result,
      }));
    return { rows: activeRows, problems: applied.problems };
  }, [
    payload,
    period.month,
    period.year,
    flags,
    defaultCommission,
    stockOpnameTotal,
    cashAdvanceOverrides,
    isLocked,
  ]);

  const totals = useMemo(
    () => summarizePayrollTotals(computed.rows.map((r) => r.result)),
    [computed.rows],
  );
  const perPermanentOpnameShare = useMemo(
    () =>
      payload
        ? splitStockOpnamePenalty(
            stockOpnameTotal,
            payload.employees.map((e) => e.status),
          )
        : 0,
    [payload, stockOpnameTotal],
  );
  const kasbonProblemEntries = Object.entries(computed.problems);

  const monthLabel = MONTH_NAMES_ID[period.month - 1] ?? `Bulan ${period.month}`;

  function updateFlag(employeeId: string, patch: Partial<WorksheetFlags>) {
    setFlags((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], ...patch },
    }));
  }

  async function handleSave(lock: boolean) {
    if (!payload || computed.rows.length === 0) return;
    if (lock && kasbonProblemEntries.length > 0) {
      setLockModalOpen(false);
      setNotice({
        kind: 'danger',
        text: 'Periksa potongan kasbon: ada karyawan dengan potongan melebihi sisa saldo kasbon.',
      });
      return;
    }
    setBusyAction(lock ? 'lock' : 'draft');
    setNotice(null);
    const rpcRows: PayrollRecordInput[] = computed.rows.map((r) => ({
      ...r.result,
      employeeId: r.employeeId,
      employmentStatus: r.status,
    }));
    try {
      await data.savePayrollPeriod(period.month, period.year, rpcRows, lock);
      setLockModalOpen(false);
      setNotice({
        kind: 'success',
        text: lock
          ? `Periode ${monthLabel} ${period.year} dikunci (PAID) dan potongan kasbon tercatat.`
          : `Draf payroll ${monthLabel} ${period.year} berhasil disimpan.`,
      });
      state.reload();
    } catch (err) {
      setLockModalOpen(false);
      setNotice({ kind: 'danger', text: payrollErrorMessage(err).message });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUnlock() {
    setBusyAction('unlock');
    setNotice(null);
    try {
      await data.unlockPayroll(period.month, period.year);
      setUnlockModalOpen(false);
      setNotice({
        kind: 'success',
        text: `Periode ${monthLabel} ${period.year} dibuka kembali ke status DRAFT.`,
      });
      state.reload();
    } catch (err) {
      setUnlockModalOpen(false);
      setNotice({ kind: 'danger', text: payrollUnlockErrorMessage(err) });
    } finally {
      setBusyAction(null);
    }
  }

  function handleDownloadCsv() {
    if (computed.rows.length === 0) return;
    const headers = [
      'Karyawan',
      'Status',
      'Gaji Pokok',
      'Uang Makan',
      'Potongan BPJS',
      'Telat (x)',
      'Bonus Telat',
      'Denda Telat',
      'Absen (hr)',
      'Denda Absen',
      'Sisa Kuota Absen',
      'Salah Op (x)',
      'Denda Salah Op',
      'Denda Opname',
      'Insentif Stokan',
      'Insentif Deep Clean',
      'Komisi',
      'Potongan Kasbon',
      'Gaji Bersih',
      'Status Periode',
    ];
    const body = computed.rows.map((row) => [
      row.employeeName,
      EMPLOYMENT_STATUS_LABEL[row.status],
      row.result.basicSalary,
      row.result.mealAllowance,
      row.result.bpjsAllowance,
      row.result.latenessCount,
      row.result.latenessBonus,
      row.result.latenessPenalty,
      row.result.absenceCount,
      row.result.absencePenalty,
      row.result.absenceQuotaRemaining,
      row.result.operationalMistakes,
      row.result.operationalPenalty,
      row.result.stockOpnamePenalty,
      row.result.stockanIncentive,
      row.result.deepCleaningIncentive,
      row.result.commission,
      row.result.cashAdvanceDeduction,
      row.result.netSalary,
      isLocked ? 'PAID' : 'DRAFT',
    ]);
    const csv = toCsv([headers, ...body]);
    downloadCsvWithHistory({
      fileName: `payroll-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
      csvContent: csv,
      reportName: 'Payroll karyawan',
      period: `${monthLabel} ${period.year}`,
      rowCount: computed.rows.length,
      sourceUrl: '/karyawan/payroll',
    });
  }

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Payroll bulanan karyawan"
        subtitle="Hitung gaji bersih bulanan dari kompensasi, jadwal kerja, absensi, catatan harian, insentif, komisi, dan potongan kasbon."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/karyawan/aturan-payroll" className="cg-btn cg-btn--secondary cg-btn--sm">
              <SlidersHorizontal className="cg-icon cg-icon--sm" aria-hidden />
              Aturan payroll
            </Link>
            <Link
              href={`/karyawan/slip?month=${period.month}&year=${period.year}`}
              className="cg-btn cg-btn--secondary cg-btn--sm"
            >
              <FileText className="cg-icon cg-icon--sm" aria-hidden />
              Slip gaji
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={handleDownloadCsv}
              disabled={computed.rows.length === 0}
            >
              <Download className="cg-icon cg-icon--sm" aria-hidden />
              Unduh CSV
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm"
              onClick={() => state.reload()}
              aria-label="Muat ulang data payroll"
            >
              <RefreshCw className="cg-icon cg-icon--sm" aria-hidden />
            </button>
          </div>
        }
      />

      {/* Pemilih Bulan/Tahun & Status Periode */}
      <section className="cg-card p-16 flex flex-wrap items-end justify-between gap-12 min-w-0">
        <MonthYearPicker
          idPrefix="payroll"
          month={period.month}
          year={period.year}
          onChange={setPeriod}
        />

        <div className="flex flex-wrap items-center gap-8">
          {isLocked ? (
            <>
              <span
                className="cg-badge bg-accent-soft text-accent-strong border border-accent/25 font-bold"
                data-testid="payroll-status-badge"
              >
                <Lock className="cg-icon cg-icon--sm" aria-hidden />
                PAID
              </span>
              {paidAtIso && payload && (
                <span className="text-xs text-text-muted">
                  Dikunci {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: payload.tz }).format(new Date(paidAtIso))}
                </span>
              )}
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--sm"
                onClick={() => setUnlockModalOpen(true)}
                disabled={busyAction !== null}
                data-testid="btn-unlock-payroll"
              >
                <Unlock className="cg-icon cg-icon--sm" aria-hidden />
                Buka kunci
              </button>
            </>
          ) : (
            <>
              <span
                className={`cg-badge ${hasSavedDraft ? 'cg-badge--info' : 'cg-badge--warning'}`}
                data-testid="payroll-status-badge"
              >
                {hasSavedDraft ? 'Draf tersimpan' : 'Belum disimpan'}
              </span>
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--sm"
                onClick={() => void handleSave(false)}
                disabled={busyAction !== null || computed.rows.length === 0}
                data-testid="btn-save-draft"
              >
                <Save className="cg-icon cg-icon--sm" aria-hidden />
                {busyAction === 'draft' ? 'Menyimpan...' : 'Simpan draf'}
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--primary cg-btn--sm"
                onClick={() => setLockModalOpen(true)}
                disabled={busyAction !== null || computed.rows.length === 0}
                data-testid="btn-lock-period"
              >
                <Lock className="cg-icon cg-icon--sm" aria-hidden />
                Kunci periode
              </button>
            </>
          )}
        </div>
      </section>

      <PayrollNoticeBanner notice={notice} onClose={() => setNotice(null)} />

      {state.status === 'loading' && <PayrollSkeleton />}

      {state.status === 'error' && (
        <PayrollLoadBanner error={state.message} onRetry={() => state.reload()} />
      )}

      {payload && payload.employees.length === 0 && (
        <div className="cg-empty" data-testid="payroll-empty-state">
          <Users className="cg-icon cg-icon--lg mx-auto mb-8 text-text-muted" aria-hidden />
          <p>
            <strong>Belum ada data kompensasi karyawan</strong>
          </p>
          <p className="text-sm text-text-muted mt-4 mb-12">
            Atur gaji pokok, status kepegawaian, dan jadwal kerja di halaman Jadwal &amp; Kompensasi sebelum menghitung payroll bulanan.
          </p>
          <Link href="/karyawan/jadwal" className="cg-btn cg-btn--primary cg-btn--sm">
            Atur jadwal &amp; kompensasi
          </Link>
        </div>
      )}

      {payload && computed.rows.length > 0 && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 min-w-0">
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Karyawan</div>
              <div className="text-xl font-bold cg-num text-text mt-4">{totals.count}</div>
            </div>
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Total gaji bersih</div>
              <div
                className="text-xl font-bold cg-num text-accent-strong mt-4"
                data-testid="kpi-total-net-salary"
              >
                {formatRp(totals.totalNetSalary)}
              </div>
            </div>
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Total potongan kasbon</div>
              <div
                className="text-xl font-bold cg-num text-text mt-4"
                data-testid="kpi-total-kasbon-deduction"
              >
                {formatRp(totals.totalCashAdvanceDeduction)}
              </div>
            </div>
          </div>

          {/* Pengaturan global periode */}
          <div className="cg-card p-16 grid grid-cols-1 tablet:grid-cols-2 gap-16 min-w-0">
            <RupiahField
              id="global-default-commission"
              label="Komisi default (global)"
              value={defaultCommission}
              disabled={isLocked}
              onChange={setDefaultCommission}
              hint="Untuk karyawan tanpa komisi khusus"
            />
            <RupiahField
              id="global-stock-opname-total"
              label="Denda stock opname total"
              value={stockOpnameTotal}
              disabled={isLocked}
              onChange={setStockOpnameTotal}
              hint={`Dibagi rata ke tetap: ${formatRp(perPermanentOpnameShare)}/org`}
            />
          </div>

          {kasbonProblemEntries.length > 0 && !isLocked && (
            <div role="alert" className="cg-banner cg-banner--danger">
              <span>
                Terdapat potongan kasbon melebihi saldo pada {kasbonProblemEntries.length} karyawan. Sesuaikan nominal sebelum mengunci periode.
              </span>
            </div>
          )}

          {/* Tabel Desktop (min-w-0 agar aman di semua lebar) */}
          <div className="hidden tablet:block cg-card p-0 overflow-hidden min-w-0">
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data w-full" aria-label="Lembar kerja payroll bulanan">
                <thead>
                  <tr>
                    <th>Karyawan</th>
                    <th className="cg-num whitespace-nowrap">Pokok / Makan / BPJS</th>
                    <th className="cg-num whitespace-nowrap">Telat &amp; Bonus/Denda</th>
                    <th className="cg-num whitespace-nowrap">Absen &amp; Kuota</th>
                    <th className="cg-num whitespace-nowrap">Salah Op &amp; Opname</th>
                    <th className="whitespace-nowrap">Insentif</th>
                    <th className="cg-num whitespace-nowrap">Komisi</th>
                    <th className="cg-num whitespace-nowrap">Potongan Kasbon</th>
                    <th className="cg-num whitespace-nowrap">Gaji Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.rows.map((row) => {
                    const rowFlags = flags[row.employeeId] ?? {};
                    const commissionValue = rowFlags.commission ?? defaultCommission;
                    const kasbonProb = computed.problems[row.employeeId];
                    const remainingBalanceAfter =
                      row.cashAdvanceBalance - row.result.cashAdvanceDeduction;
                    return (
                      <tr key={row.employeeId} data-testid={`payroll-row-${row.employeeId}`}>
                        <td className="min-w-[160px] align-top">
                          <div className="font-semibold text-text break-words">
                            {row.employeeName}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 mt-4">
                            <span className="cg-badge cg-badge--info">
                              {EMPLOYMENT_STATUS_LABEL[row.status]}
                            </span>
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              onClick={() => setDetailRow(row)}
                            >
                              <Calendar className="cg-icon cg-icon--sm" aria-hidden />
                              Rincian ({row.lateDates.length + row.absentDates.length})
                            </button>
                          </div>
                        </td>
                        <td className="cg-num whitespace-nowrap align-top text-xs">
                          <div className="font-semibold text-text">{formatRp(row.result.basicSalary)}</div>
                          <div className="text-text-muted mt-4">+{formatRp(row.result.mealAllowance)} mkn</div>
                          <div className="text-danger mt-4">-{formatRp(row.result.bpjsAllowance)} BPJS</div>
                        </td>
                        <td className="cg-num whitespace-nowrap align-top text-xs">
                          <div>{row.result.latenessCount}x</div>
                          {row.result.latenessBonus > 0 && (
                            <div className="text-accent-strong font-semibold mt-4">
                              +{formatRp(row.result.latenessBonus)}
                            </div>
                          )}
                          {row.result.latenessPenalty > 0 && (
                            <div className="text-danger font-semibold mt-4">
                              -{formatRp(row.result.latenessPenalty)}
                            </div>
                          )}
                          {row.result.latenessBonus === 0 && row.result.latenessPenalty === 0 && (
                            <div className="text-text-muted mt-4">Rp 0</div>
                          )}
                        </td>
                        <td className="cg-num whitespace-nowrap align-top text-xs">
                          <div>{row.result.absenceCount} hr</div>
                          <div className="text-text-muted mt-4">
                            Sisa: {row.result.absenceQuotaRemaining} hr
                          </div>
                          {row.result.absencePenalty > 0 && (
                            <div className="text-danger font-semibold mt-4">
                              -{formatRp(row.result.absencePenalty)}
                            </div>
                          )}
                        </td>
                        <td className="cg-num whitespace-nowrap align-top text-xs">
                          <div>{row.result.operationalMistakes}x salah op</div>
                          <div className={row.result.operationalPenalty > 0 ? 'text-danger mt-4' : 'text-text-muted mt-4'}>
                            -{formatRp(row.result.operationalPenalty)}
                          </div>
                          <div className="text-text-muted mt-4">
                            Opname -{formatRp(row.result.stockOpnamePenalty)}
                          </div>
                        </td>
                        <td className="align-top text-xs min-w-[160px]">
                          <label className="flex items-center gap-8 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={row.result.stockanIncentive > 0}
                              disabled={isLocked}
                              onChange={(e) =>
                                updateFlag(row.employeeId, { hasStockan: e.target.checked })
                              }
                            />
                            <span>
                              Stokan ({formatRp(row.result.stockanIncentive)})
                            </span>
                          </label>
                          <label className="flex items-center gap-8 cursor-pointer mt-8">
                            <input
                              type="checkbox"
                              checked={row.result.deepCleaningIncentive > 0}
                              disabled={isLocked || row.status === 'admin'}
                              onChange={(e) =>
                                updateFlag(row.employeeId, { hasDeepCleaning: e.target.checked })
                              }
                            />
                            <span>
                              Deep clean ({formatRp(row.result.deepCleaningIncentive)})
                            </span>
                          </label>
                        </td>
                        <td className="cg-num align-top min-w-[130px]">
                          {row.status === 'probation' ? (
                            <div className="text-xs text-text-muted">Rp 0 (probasi)</div>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Komisi ${row.employeeName}`}
                              className="cg-input cg-num text-right"
                              disabled={isLocked}
                              value={String(isLocked ? row.result.commission : commissionValue)}
                              onChange={(e) =>
                                updateFlag(row.employeeId, {
                                  commission:
                                    e.target.value.trim() === ''
                                      ? undefined
                                      : parseRp(e.target.value),
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="cg-num align-top min-w-[160px]">
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Potongan kasbon ${row.employeeName}`}
                            className="cg-input cg-num text-right"
                            disabled={isLocked}
                            value={String(row.result.cashAdvanceDeduction)}
                            onChange={(e) =>
                              setCashAdvanceOverrides((prev) => ({
                                ...prev,
                                [row.employeeId]: parseRp(e.target.value),
                              }))
                            }
                          />
                          <div className="text-xs text-text-muted mt-4">
                            Saldo: {formatRp(row.cashAdvanceBalance)}
                            {!isLocked && row.cashAdvanceBalance > 0 && (
                              <> · Sisa {formatRp(remainingBalanceAfter)}</>
                            )}
                          </div>
                          {kasbonProb && (
                            <div className="text-xs text-danger font-medium mt-4">{kasbonProb}</div>
                          )}
                        </td>
                        <td className="cg-num whitespace-nowrap align-top font-bold text-base">
                          <span
                            className={
                              row.result.netSalary < 0 ? 'text-danger' : 'text-accent-strong'
                            }
                            data-testid={`net-salary-${row.employeeId}`}
                          >
                            {formatRp(row.result.netSalary)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kartu Mobile 390px */}
          <div className="grid gap-12 tablet:hidden min-w-0">
            {computed.rows.map((row) => {
              const rowFlags = flags[row.employeeId] ?? {};
              const commissionValue = rowFlags.commission ?? defaultCommission;
              const kasbonProb = computed.problems[row.employeeId];
              const remainingBalanceAfter =
                row.cashAdvanceBalance - row.result.cashAdvanceDeduction;
              return (
                <article
                  key={row.employeeId}
                  className="cg-card p-16 grid gap-12 min-w-0"
                  data-testid={`payroll-card-${row.employeeId}`}
                >
                  <div className="flex items-start justify-between gap-8 min-w-0">
                    <div className="min-w-0">
                      <div className="font-bold text-text break-words">{row.employeeName}</div>
                      <div className="flex flex-wrap items-center gap-8 mt-4">
                        <span className="cg-badge cg-badge--info">
                          {EMPLOYMENT_STATUS_LABEL[row.status]}
                        </span>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => setDetailRow(row)}
                        >
                          <Calendar className="cg-icon cg-icon--sm" aria-hidden />
                          Rincian tanggal
                        </button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-text-muted">Gaji bersih</div>
                      <div
                        className={`text-base font-bold cg-num ${
                          row.result.netSalary < 0 ? 'text-danger' : 'text-accent-strong'
                        }`}
                      >
                        {formatRp(row.result.netSalary)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 text-xs p-12 rounded-lg bg-surface border border-border">
                    <div>
                      <span className="text-text-muted">Pokok + Makan: </span>
                      <span className="cg-num font-semibold">
                        {formatRp(row.result.basicSalary + row.result.mealAllowance)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted">BPJS: </span>
                      <span className="cg-num text-danger">-{formatRp(row.result.bpjsAllowance)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Telat ({row.result.latenessCount}x): </span>
                      <span className="cg-num font-semibold">
                        {row.result.latenessBonus > 0
                          ? `+${formatRp(row.result.latenessBonus)}`
                          : row.result.latenessPenalty > 0
                            ? `-${formatRp(row.result.latenessPenalty)}`
                            : 'Rp 0'}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted">Absen ({row.result.absenceCount} hr): </span>
                      <span className="cg-num">Sisa kuota {row.result.absenceQuotaRemaining} hr</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-12 text-xs">
                    <label className="flex items-center gap-8">
                      <input
                        type="checkbox"
                        checked={row.result.stockanIncentive > 0}
                        disabled={isLocked}
                        onChange={(e) =>
                          updateFlag(row.employeeId, { hasStockan: e.target.checked })
                        }
                      />
                      <span>Stokan ({formatRp(row.result.stockanIncentive)})</span>
                    </label>
                    <label className="flex items-center gap-8">
                      <input
                        type="checkbox"
                        checked={row.result.deepCleaningIncentive > 0}
                        disabled={isLocked || row.status === 'admin'}
                        onChange={(e) =>
                          updateFlag(row.employeeId, { hasDeepCleaning: e.target.checked })
                        }
                      />
                      <span>Deep clean ({formatRp(row.result.deepCleaningIncentive)})</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-8 min-w-0">
                    <div className="cg-field min-w-0">
                      <label className="cg-label" htmlFor={`m-comm-${row.employeeId}`}>
                        Komisi
                      </label>
                      <input
                        id={`m-comm-${row.employeeId}`}
                        type="text"
                        inputMode="numeric"
                        className="cg-input cg-num"
                        disabled={isLocked || row.status === 'probation'}
                        value={
                          row.status === 'probation'
                            ? '0'
                            : String(isLocked ? row.result.commission : commissionValue)
                        }
                        onChange={(e) =>
                          updateFlag(row.employeeId, {
                            commission:
                              e.target.value.trim() === ''
                                ? undefined
                                : parseRp(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="cg-field min-w-0">
                      <label className="cg-label" htmlFor={`m-kasbon-${row.employeeId}`}>
                        Potong kasbon
                      </label>
                      <input
                        id={`m-kasbon-${row.employeeId}`}
                        type="text"
                        inputMode="numeric"
                        className="cg-input cg-num"
                        disabled={isLocked}
                        value={String(row.result.cashAdvanceDeduction)}
                        onChange={(e) =>
                          setCashAdvanceOverrides((prev) => ({
                            ...prev,
                            [row.employeeId]: parseRp(e.target.value),
                          }))
                        }
                      />
                      <span className="text-xs text-text-muted">
                        Saldo: {formatRp(row.cashAdvanceBalance)}
                        {!isLocked && row.cashAdvanceBalance > 0 && (
                          <> · Sisa {formatRp(remainingBalanceAfter)}</>
                        )}
                      </span>
                      {kasbonProb && (
                        <span className="text-xs text-danger">{kasbonProb}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {detailRow && (
        <AttendanceDetailDialog
          row={detailRow}
          monthLabel={monthLabel}
          year={period.year}
          onClose={() => setDetailRow(null)}
        />
      )}

      {lockModalOpen && (
        <ConfirmPeriodDialog
          title="Kunci periode payroll?"
          body={`Mengunci periode ${monthLabel} ${period.year} akan mengubah status gaji menjadi PAID (tidak dapat diubah langsung) dan otomatis mencatat potongan kasbon total ${formatRp(totals.totalCashAdvanceDeduction)} ke buku kasbon karyawan.`}
          confirmLabel={busyAction === 'lock' ? 'Mengunci...' : 'Ya, kunci periode'}
          confirmVariant="primary"
          busy={busyAction !== null}
          onClose={() => setLockModalOpen(false)}
          onConfirm={() => void handleSave(true)}
        />
      )}

      {unlockModalOpen && (
        <ConfirmPeriodDialog
          title="Buka kunci periode PAID?"
          body={`Hanya Pemilik / Admin yang diizinkan membuka kembali periode ${monthLabel} ${period.year}. Catatan potongan kasbon otomatis untuk periode ini akan dihapus dari buku kasbon sehingga saldo karyawan kembali seperti sebelum kunci.`}
          confirmLabel={busyAction === 'unlock' ? 'Membuka...' : 'Ya, buka kunci'}
          confirmVariant="danger"
          busy={busyAction !== null}
          onClose={() => setUnlockModalOpen(false)}
          onConfirm={() => void handleUnlock()}
        />
      )}
    </div>
  );
}

function AttendanceDetailDialog({
  row,
  monthLabel,
  year,
  onClose,
}: {
  row: DisplayRow;
  monthLabel: string;
  year: number;
  onClose: () => void;
}) {
  const dlg = useDialog(onClose);
  return (
    <dialog {...dlg.props} aria-labelledby="att-detail-title">
      <h2 id="att-detail-title" className="cg-modal__title">
        Rincian kehadiran: {row.employeeName}
      </h2>
      <p className="text-xs text-text-muted mt-4 mb-12">
        Periode {monthLabel} {year} · Absen bulan sebelumnya tahun ini: {row.pastAbsencesInYear} hari · Sisa kuota tahunan: {row.result.absenceQuotaRemaining} hari.
      </p>
      <div className="cg-modal__body grid gap-12 text-sm">
        <div>
          <strong className="text-text">Tanggal telat otomatis ({row.lateDates.length})</strong>
          <div className="text-xs text-text-muted mt-4">
            {row.lateDates.length > 0 ? row.lateDates.join(', ') : 'Tidak ada telat dari absensi.'}
          </div>
          {row.result.latenessCount > row.lateDates.length && (
            <div className="text-xs text-text-muted mt-4">
              +{row.result.latenessCount - row.lateDates.length}x telat dari catatan harian manual.
            </div>
          )}
        </div>
        <div>
          <strong className="text-text">Tanggal absen otomatis ({row.absentDates.length})</strong>
          <div className="text-xs text-text-muted mt-4">
            {row.absentDates.length > 0
              ? row.absentDates.join(', ')
              : 'Tidak ada absen otomatis dari jadwal terlewat.'}
          </div>
          {row.result.absenceCount > row.absentDates.length && (
            <div className="text-xs text-text-muted mt-4">
              +{row.result.absenceCount - row.absentDates.length} hari absen dari catatan harian manual.
            </div>
          )}
        </div>
        <div>
          <strong className="text-text">Hari diizinkan / cuti / libur ({row.excusedDates.length})</strong>
          <div className="text-xs text-text-muted mt-4">
            {row.excusedDates.length > 0
              ? row.excusedDates.join(', ')
              : 'Belum ada hari diizinkan pada bulan ini.'}
          </div>
        </div>
      </div>
      <div className="cg-modal__actions">
        <button type="button" className="cg-btn cg-btn--primary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </dialog>
  );
}

function ConfirmPeriodDialog({
  title,
  body,
  confirmLabel,
  confirmVariant,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dlg = useDialog(onClose);
  return (
    <dialog {...dlg.props} aria-labelledby="confirm-period-title">
      <h2 id="confirm-period-title" className="cg-modal__title">
        {title}
      </h2>
      <p className="cg-modal__body">{body}</p>
      <div className="cg-modal__actions">
        <button type="button" className="cg-btn cg-btn--secondary" disabled={busy} onClick={onClose}>
          Batal
        </button>
        <button
          type="button"
          className={`cg-btn ${confirmVariant === 'danger' ? 'cg-btn--danger' : 'cg-btn--primary'}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

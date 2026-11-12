'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Copy, Eraser, Search } from 'lucide-react';
import {
  EMPLOYMENT_STATUS_LABEL,
  WEEKDAY_COLUMNS,
  compensationProblem,
  copyScheduleToWorkdays,
  formatRp,
  payrollErrorMessage,
  scheduleArrayFromMap,
  scheduleMapFromArray,
  scheduleProblem,
  type EmployeeCompensation,
  type EmploymentStatus,
  type WeeklySchedule,
} from '@cgpos/shared';
import { PageHeader } from '@/components/page';
import { PayrollLoadBanner, PayrollNoticeBanner, PayrollSkeleton, RupiahField } from '@/components/payroll-common';
import { useData } from '@/lib/data';

interface LoadedData {
  employees: EmployeeCompensation[];
  schedules: Record<string, WeeklySchedule>;
}

const STATUS_HELP: Record<EmploymentStatus, string> = {
  permanent: 'Berhak atas bonus & denda absen/telat serta denda operasional.',
  probation: 'Tanpa bonus, denda telat/absen/operasional, maupun komisi.',
  admin: 'Tanpa gaji pokok, uang makan, BPJS, maupun bonus/denda di payroll.',
};

export default function JadwalDanKompensasiPage() {
  const data = useData();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: LoadedData }
  >({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const [employees, schedules] = await Promise.all([data.listCompensation(), data.listSchedules()]);
      setState({ status: 'ready', data: { employees, schedules } });
    } catch (err) {
      setState({ status: 'error', error: err });
    }
  }, [data]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEmployees = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.data.employees;
    return state.data.employees.filter((e) => e.employeeName.toLowerCase().includes(q));
  }, [state, search]);

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Jadwal kerja &amp; kompensasi"
        subtitle="Atur jadwal masuk mingguan untuk deteksi telat/absen otomatis serta komponen gaji dasar per karyawan."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/karyawan/absensi" className="cg-btn cg-btn--secondary cg-btn--sm">
              Absensi karyawan
            </Link>
            <Link href="/karyawan/catatan" className="cg-btn cg-btn--secondary cg-btn--sm">
              Catatan harian
            </Link>
          </div>
        }
      />

      <PayrollNoticeBanner notice={notice} onClose={() => setNotice(null)} />

      {state.status === 'loading' && <PayrollSkeleton />}
      {state.status === 'error' && <PayrollLoadBanner error={state.error} onRetry={() => void load()} />}

      {state.status === 'ready' && (
        <>
          <div className="cg-card p-16 grid gap-12 min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-12 min-w-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold m-0">Jadwal kerja mingguan</h2>
                <p className="text-xs text-text-muted m-0 mt-4">
                  Isi jam mulai shift per hari kerja (jam lokal outlet). Kosongkan hari libur, lalu klik Simpan pada baris karyawan terkait.
                </p>
              </div>
              <div className="cg-field min-w-[220px]">
                <label className="cg-label" htmlFor="jadwal-cari-karyawan">
                  Cari karyawan
                </label>
                <div className="cg-search m-0">
                  <Search className="cg-icon cg-icon--sm" aria-hidden />
                  <input
                    id="jadwal-cari-karyawan"
                    type="search"
                    className="cg-input w-full"
                    placeholder="Nama karyawan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {state.data.employees.length === 0 ? (
              <div className="cg-empty">
                <CalendarClock className="cg-icon cg-icon--lg text-text-muted" aria-hidden />
                <strong>Belum ada karyawan aktif</strong>
                <p className="text-xs text-text-muted m-0">
                  Tambahkan karyawan aktif di menu Daftar karyawan untuk mengatur jadwal kerja dan kompensasi.
                </p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="cg-empty">
                <strong>Tidak ada karyawan yang cocok</strong>
                <p className="text-xs text-text-muted m-0">Ubah kata kunci pencarian Anda.</p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Jadwal kerja mingguan karyawan">
                  <thead>
                    <tr>
                      <th>Karyawan</th>
                      {WEEKDAY_COLUMNS.map((col) => (
                        <th key={col.weekday}>{col.shortLabel}</th>
                      ))}
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => (
                      <ScheduleRow
                        key={emp.employeeId}
                        employee={emp}
                        initial={state.data.schedules[emp.employeeId] ?? []}
                        onSaved={(text) => {
                          setNotice({ kind: 'success', text });
                          void load();
                        }}
                        onError={(text) => setNotice({ kind: 'danger', text })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {state.data.employees.length > 0 && (
            <section className="grid gap-12 min-w-0" aria-labelledby="judul-kompensasi">
              <div className="min-w-0">
                <h2 id="judul-kompensasi" className="text-base font-semibold m-0">
                  Kompensasi &amp; status kepegawaian
                </h2>
                <p className="text-xs text-text-muted m-0 mt-4">
                  Gaji pokok, tunjangan, potongan BPJS, dan cicilan kasbon otomatis per bulan untuk setiap karyawan aktif. Data hanya terlihat oleh Pemilik dan Manajer.
                </p>
              </div>

              {filteredEmployees.length === 0 ? (
                <div className="cg-card p-16 text-sm text-text-muted">Tidak ada karyawan yang sesuai filter pencarian.</div>
              ) : (
                <div className="grid grid-cols-1 laptop:grid-cols-2 gap-16 min-w-0">
                  {filteredEmployees.map((emp) => (
                    <CompensationCard
                      key={emp.employeeId}
                      employee={emp}
                      onSaved={(text) => {
                        setNotice({ kind: 'success', text });
                        void load();
                      }}
                      onError={(text) => setNotice({ kind: 'danger', text })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ScheduleRow({
  employee,
  initial,
  onSaved,
  onError,
}: {
  employee: EmployeeCompensation;
  initial: WeeklySchedule;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const data = useData();
  const initialMap = useMemo(() => scheduleMapFromArray(initial), [initial]);
  const [draft, setDraft] = useState<Record<number, string>>(initialMap);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initialMap);
  }, [initialMap]);

  const dirty = useMemo(() => {
    return WEEKDAY_COLUMNS.some((c) => (draft[c.weekday] ?? '').trim() !== (initialMap[c.weekday] ?? '').trim());
  }, [draft, initialMap]);

  async function handleSave() {
    if (saving) return;
    const schedule = scheduleArrayFromMap(draft);
    const problem = scheduleProblem(schedule);
    if (problem) {
      onError(problem);
      return;
    }
    setSaving(true);
    try {
      await data.saveSchedule(employee.employeeId, schedule);
      onSaved(
        schedule.length === 0
          ? `Jadwal kerja ${employee.employeeName} dikosongkan.`
          : `Jadwal kerja ${employee.employeeName} (${schedule.length} hari) disimpan.`,
      );
    } catch (err) {
      onError(payrollErrorMessage(err, 'Gagal menyimpan jadwal kerja.').message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr data-testid={`jadwal-row-${employee.employeeId}`}>
      <td className="whitespace-nowrap">
        <strong>{employee.employeeName}</strong>
        <span className="block text-xs text-text-muted">{EMPLOYMENT_STATUS_LABEL[employee.status]}</span>
      </td>
      {WEEKDAY_COLUMNS.map((col) => (
        <td key={col.weekday} className="min-w-[128px]">
          <input
            type="time"
            className="cg-input w-[120px]"
            aria-label={`Jam mulai ${col.label} ${employee.employeeName}`}
            disabled={saving}
            value={draft[col.weekday] ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setDraft((prev) => {
                const next = { ...prev };
                if (val) next[col.weekday] = val;
                else delete next[col.weekday];
                return next;
              });
            }}
          />
        </td>
      ))}
      <td className="whitespace-nowrap">
        <div className="flex items-center gap-8">
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            disabled={saving}
            onClick={() => setDraft((prev) => copyScheduleToWorkdays(prev))}
            title="Salin jam ke Senin sampai Jumat"
          >
            <Copy className="cg-icon cg-icon--xs" aria-hidden />
            <span>Salin ke semua hari kerja</span>
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            disabled={saving}
            aria-label={`Kosongkan jadwal ${employee.employeeName}`}
            onClick={() => setDraft({})}
            title="Kosongkan semua hari"
          >
            <Eraser className="cg-icon cg-icon--xs" aria-hidden />
            <span>Kosongkan</span>
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--primary cg-btn--sm"
            disabled={saving || !dirty}
            aria-label={`Simpan jadwal ${employee.employeeName}`}
            onClick={() => void handleSave()}
          >
            <Check className="cg-icon cg-icon--xs" aria-hidden />
            <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

function CompensationCard({
  employee,
  onSaved,
  onError,
}: {
  employee: EmployeeCompensation;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const data = useData();
  const [status, setStatus] = useState<EmploymentStatus>(employee.status);
  const [basicSalary, setBasicSalary] = useState(employee.basicSalary);
  const [mealAllowance, setMealAllowance] = useState(employee.mealAllowance);
  const [bpjsAllowance, setBpjsAllowance] = useState(employee.bpjsAllowance);
  const [installment, setInstallment] = useState(employee.cashAdvanceInstallment);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setStatus(employee.status);
    setBasicSalary(employee.basicSalary);
    setMealAllowance(employee.mealAllowance);
    setBpjsAllowance(employee.bpjsAllowance);
    setInstallment(employee.cashAdvanceInstallment);
    setErr('');
  }, [employee]);

  const dirty =
    status !== employee.status ||
    basicSalary !== employee.basicSalary ||
    mealAllowance !== employee.mealAllowance ||
    bpjsAllowance !== employee.bpjsAllowance ||
    installment !== employee.cashAdvanceInstallment;

  const baseMonthly = status === 'admin' ? 0 : basicSalary + mealAllowance - bpjsAllowance;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const payload: Omit<EmployeeCompensation, 'employeeName'> = {
      employeeId: employee.employeeId,
      status,
      basicSalary,
      mealAllowance,
      bpjsAllowance,
      cashAdvanceInstallment: installment,
    };
    const problem = compensationProblem(payload);
    if (problem) {
      setErr(problem);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await data.saveCompensation(payload);
      onSaved(`Kompensasi ${employee.employeeName} (${EMPLOYMENT_STATUS_LABEL[status]}) disimpan.`);
    } catch (x) {
      const parsed = payrollErrorMessage(x, 'Gagal menyimpan kompensasi.');
      setErr(parsed.message);
      onError(parsed.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="cg-card p-16 grid gap-12 min-w-0"
      data-testid={`kompensasi-form-${employee.employeeId}`}
      noValidate
    >
      <div className="flex flex-wrap items-start justify-between gap-8 min-w-0">
        <div className="min-w-0">
          <h3 className="text-base font-semibold m-0">{employee.employeeName}</h3>
          <p className="text-xs text-text-muted m-0 mt-4">{STATUS_HELP[status]}</p>
        </div>
        <span className="cg-badge cg-badge--muted shrink-0">
          Dasar bersih: <strong className="cg-num ml-4">{formatRp(baseMonthly)}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12 min-w-0">
        <div className="cg-field tablet:col-span-2 min-w-0">
          <label className="cg-label" htmlFor={`comp-status-${employee.employeeId}`}>
            Status kepegawaian
          </label>
          <select
            id={`comp-status-${employee.employeeId}`}
            className="cg-input"
            disabled={saving}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EmploymentStatus);
              setErr('');
            }}
          >
            <option value="permanent">Tetap</option>
            <option value="probation">Probasi</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <RupiahField
          id={`comp-basic-${employee.employeeId}`}
          label="Gaji pokok"
          value={basicSalary}
          disabled={saving}
          onChange={(v) => {
            setBasicSalary(v);
            setErr('');
          }}
        />
        <RupiahField
          id={`comp-meal-${employee.employeeId}`}
          label="Uang makan"
          value={mealAllowance}
          disabled={saving}
          onChange={(v) => {
            setMealAllowance(v);
            setErr('');
          }}
        />
        <RupiahField
          id={`comp-bpjs-${employee.employeeId}`}
          label="Potongan BPJS"
          value={bpjsAllowance}
          disabled={saving}
          onChange={(v) => {
            setBpjsAllowance(v);
            setErr('');
          }}
        />
        <RupiahField
          id={`comp-kasbon-${employee.employeeId}`}
          label="Cicilan kasbon / bulan"
          value={installment}
          disabled={saving}
          onChange={(v) => {
            setInstallment(v);
            setErr('');
          }}
        />
      </div>

      {err && (
        <p role="alert" className="cg-banner cg-banner--danger m-0">
          <span>{err}</span>
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          className="cg-btn cg-btn--primary cg-btn--sm"
          disabled={saving || !dirty}
          aria-label={`Simpan kompensasi ${employee.employeeName}`}
        >
          <Check className="cg-icon cg-icon--xs" aria-hidden />
          <span>{saving ? 'Menyimpan...' : 'Simpan kompensasi'}</span>
        </button>
      </div>
    </form>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ClipboardList, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  INCIDENT_KIND_LABEL,
  incidentProblem,
  monthBounds,
  payrollErrorMessage,
  summarizeIncidentsByEmployee,
  type EmployeeCompensation,
  type EmployeeIncident,
  type IncidentKind,
} from '@cgpos/shared';
import { fmtDate, todayKey, useDialog } from '@/components/fin-common';
import { PageHeader } from '@/components/page';
import { MonthYearPicker, PayrollLoadBanner, PayrollNoticeBanner, PayrollSkeleton } from '@/components/payroll-common';
import { useData } from '@/lib/data';

interface LoadedData {
  employees: EmployeeCompensation[];
  incidents: EmployeeIncident[];
}

const KIND_BADGE: Record<IncidentKind, string> = {
  LATENESS: 'cg-badge--warn',
  ABSENCE: 'cg-badge--danger',
  OPERATIONAL_MISTAKE: 'cg-badge--danger',
  EXCUSED: 'cg-badge--ok',
};

type DialogState =
  | { kind: 'add' }
  | { kind: 'edit'; item: EmployeeIncident }
  | { kind: 'delete'; item: EmployeeIncident };

export default function CatatanHarianKaryawanPage() {
  const data = useData();
  const initialToday = todayKey();
  const [period, setPeriod] = useState(() => ({
    year: Number(initialToday.slice(0, 4)),
    month: Number(initialToday.slice(5, 7)),
  }));
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | IncidentKind>('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: LoadedData }
  >({ status: 'loading' });

  const bounds = useMemo(() => monthBounds(period.year, period.month), [period.year, period.month]);

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const [employees, incidents] = await Promise.all([
        data.listCompensation(),
        data.listIncidents(bounds, employeeFilter || undefined),
      ]);
      setState({ status: 'ready', data: { employees, incidents } });
    } catch (err) {
      setState({ status: 'error', error: err });
    }
  }, [data, bounds, employeeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleIncidents = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (!kindFilter) return state.data.incidents;
    return state.data.incidents.filter((item) => item.kind === kindFilter);
  }, [state, kindFilter]);

  const employeeSummaries = useMemo(() => {
    if (state.status !== 'ready') return [];
    const targetEmployees = employeeFilter
      ? state.data.employees.filter((e) => e.employeeId === employeeFilter)
      : state.data.employees;
    return summarizeIncidentsByEmployee(state.data.incidents, targetEmployees);
  }, [state, employeeFilter]);

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Catatan harian karyawan"
        subtitle="Catat kesalahan operasional, penyesuaian telat/absen manual, dan hari kerja yang diizinkan (cuti/izin/libur)."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/karyawan/jadwal" className="cg-btn cg-btn--secondary cg-btn--sm">
              Jadwal kerja
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={state.status !== 'ready' || state.data.employees.length === 0}
              onClick={() => setDialog({ kind: 'add' })}
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Catat kejadian</span>
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--info" role="note">
        <Info className="cg-icon cg-icon--sm shrink-0 mt-4" aria-hidden />
        <p className="text-xs leading-relaxed m-0 min-w-0">
          <span className="font-semibold">Telat &amp; absen otomatis</span> dihitung langsung dari absensi masuk terhadap jadwal kerja karyawan. Catatan <em>Telat (manual)</em> atau <em>Absen (manual)</em> di halaman ini bersifat menambah hitungan otomatis tersebut, sedangkan jenis <span className="font-semibold">Diizinkan (cuti/izin/libur)</span> mencegah tanggal terjadwal tersebut dihitung absen otomatis saat periode gaji diproses.
        </p>
      </div>

      <PayrollNoticeBanner notice={notice} onClose={() => setNotice(null)} />

      <div className="cg-card p-16 flex flex-wrap items-end gap-12 min-w-0">
        <MonthYearPicker idPrefix="catatan" month={period.month} year={period.year} onChange={setPeriod} />

        <div className="cg-field min-w-[180px] flex-1">
          <label className="cg-label" htmlFor="catatan-filter-karyawan">
            Karyawan
          </label>
          <select
            id="catatan-filter-karyawan"
            className="cg-input"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
          >
            <option value="">Semua karyawan</option>
            {state.status === 'ready' &&
              state.data.employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeName}
                </option>
              ))}
          </select>
        </div>

        <div className="cg-field min-w-[190px] flex-1">
          <label className="cg-label" htmlFor="catatan-filter-jenis">
            Jenis catatan
          </label>
          <select
            id="catatan-filter-jenis"
            className="cg-input"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as '' | IncidentKind)}
          >
            <option value="">Semua jenis</option>
            <option value="LATENESS">{INCIDENT_KIND_LABEL.LATENESS}</option>
            <option value="ABSENCE">{INCIDENT_KIND_LABEL.ABSENCE}</option>
            <option value="OPERATIONAL_MISTAKE">{INCIDENT_KIND_LABEL.OPERATIONAL_MISTAKE}</option>
            <option value="EXCUSED">{INCIDENT_KIND_LABEL.EXCUSED}</option>
          </select>
        </div>
      </div>

      {state.status === 'loading' && <PayrollSkeleton />}
      {state.status === 'error' && <PayrollLoadBanner error={state.error} onRetry={() => void load()} />}

      {state.status === 'ready' && (
        <>
          <div className="cg-card p-16 grid gap-12 min-w-0">
            <h2 className="text-base font-semibold m-0">Ringkasan per karyawan (bulan terpilih)</h2>
            {employeeSummaries.length === 0 ? (
              <div className="cg-empty">
                <p className="text-xs text-text-muted m-0">Belum ada karyawan aktif.</p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Ringkasan catatan harian per karyawan">
                  <thead>
                    <tr>
                      <th>Karyawan</th>
                      <th className="cg-num">Telat (manual)</th>
                      <th className="cg-num">Absen (manual)</th>
                      <th className="cg-num">Salah operasional</th>
                      <th className="cg-num">Hari diizinkan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeSummaries.map((row) => (
                      <tr key={row.employeeId}>
                        <td>
                          <strong>{row.employeeName}</strong>
                        </td>
                        <td className="cg-num">{row.lateness}</td>
                        <td className="cg-num">{row.absence}</td>
                        <td className="cg-num">{row.operationalMistake}</td>
                        <td className="cg-num">{row.excused}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="cg-card p-16 grid gap-12 min-w-0">
            <h2 className="text-base font-semibold m-0">Daftar catatan harian ({visibleIncidents.length})</h2>
            {visibleIncidents.length === 0 ? (
              <div className="cg-empty">
                <ClipboardList className="cg-icon cg-icon--lg text-text-muted" aria-hidden />
                <strong>Belum ada catatan pada periode ini</strong>
                <p className="text-xs text-text-muted m-0">
                  Klik &ldquo;Catat kejadian&rdquo; untuk menambah catatan manual atau hari izin/cuti.
                </p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Daftar catatan harian karyawan">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Karyawan</th>
                      <th>Jenis</th>
                      <th className="cg-num">Jumlah</th>
                      <th>Catatan</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIncidents.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">{fmtDate(item.date)}</td>
                        <td className="whitespace-nowrap">
                          <strong>{item.employeeName}</strong>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={`cg-badge ${KIND_BADGE[item.kind]}`}>{INCIDENT_KIND_LABEL[item.kind]}</span>
                        </td>
                        <td className="cg-num whitespace-nowrap">{item.count}</td>
                        <td className="max-w-[260px] break-words text-xs text-text-muted">{item.notes || '—'}</td>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-8">
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              aria-label={`Ubah catatan ${item.employeeName} ${item.date}`}
                              onClick={() => setDialog({ kind: 'edit', item })}
                            >
                              <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Ubah</span>
                            </button>
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                              aria-label={`Hapus catatan ${item.employeeName} ${item.date}`}
                              onClick={() => setDialog({ kind: 'delete', item })}
                            >
                              <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {state.status === 'ready' && (dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <IncidentDialog
          employees={state.data.employees}
          initial={dialog.kind === 'edit' ? dialog.item : undefined}
          defaultDate={initialToday >= bounds.from && initialToday <= bounds.to ? initialToday : bounds.from}
          onClose={() => setDialog(null)}
          onSaved={(text) => {
            setDialog(null);
            setNotice({ kind: 'success', text });
            void load();
          }}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteIncidentDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDeleted={(text) => {
            setDialog(null);
            setNotice({ kind: 'success', text });
            void load();
          }}
          onError={(text) => {
            setDialog(null);
            setNotice({ kind: 'danger', text });
          }}
        />
      )}
    </div>
  );
}

function IncidentDialog({
  employees,
  initial,
  defaultDate,
  onClose,
  onSaved,
}: {
  employees: EmployeeCompensation[];
  initial?: EmployeeIncident;
  defaultDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? employees[0]?.employeeId ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [kind, setKind] = useState<IncidentKind>(initial?.kind ?? 'OPERATIONAL_MISTAKE');
  const [count, setCount] = useState(String(initial?.count ?? 1));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsedCount = Number(count);
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      employeeId,
      date,
      kind,
      count: Number.isFinite(parsedCount) ? parsedCount : 0,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const problem = incidentProblem(payload);
    if (problem) {
      setErr(problem);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await data.saveIncident(payload);
      onSaved(
        initial
          ? `Catatan ${saved.employeeName} (${INCIDENT_KIND_LABEL[saved.kind]}) diperbarui.`
          : `Catatan ${saved.employeeName} (${INCIDENT_KIND_LABEL[saved.kind]}) disimpan.`,
      );
    } catch (x) {
      setErr(payrollErrorMessage(x, 'Gagal menyimpan catatan harian.').message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog {...dlg.props}>
      <form onSubmit={handleSubmit} className="grid gap-12" noValidate>
        <div className="cg-modal-head">
          <h3 className="text-base font-semibold m-0">{initial ? 'Ubah catatan harian' : 'Catat kejadian harian'}</h3>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="cg-modal-body grid gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="insiden-karyawan">
              Karyawan
            </label>
            <select
              id="insiden-karyawan"
              className="cg-input"
              disabled={saving}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
            <div className="cg-field">
              <label className="cg-label" htmlFor="insiden-tanggal">
                Tanggal
              </label>
              <input
                id="insiden-tanggal"
                type="date"
                className="cg-input"
                disabled={saving}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setErr('');
                }}
              />
            </div>
            <div className="cg-field">
              <label className="cg-label" htmlFor="insiden-jumlah">
                Jumlah
              </label>
              <input
                id="insiden-jumlah"
                type="number"
                min={1}
                max={31}
                step={1}
                className="cg-input cg-num"
                disabled={saving}
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  setErr('');
                }}
              />
            </div>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="insiden-jenis">
              Jenis catatan
            </label>
            <select
              id="insiden-jenis"
              className="cg-input"
              disabled={saving}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as IncidentKind);
                setErr('');
              }}
            >
              <option value="OPERATIONAL_MISTAKE">{INCIDENT_KIND_LABEL.OPERATIONAL_MISTAKE}</option>
              <option value="EXCUSED">{INCIDENT_KIND_LABEL.EXCUSED}</option>
              <option value="LATENESS">{INCIDENT_KIND_LABEL.LATENESS}</option>
              <option value="ABSENCE">{INCIDENT_KIND_LABEL.ABSENCE}</option>
            </select>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="insiden-catatan">
              Catatan (opsional, maks 300 huruf)
            </label>
            <textarea
              id="insiden-catatan"
              rows={2}
              maxLength={300}
              className="cg-input"
              disabled={saving}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setErr('');
              }}
              placeholder="Mis. Izin sakit surat dokter, lupa kunci etalase, dsb."
            />
          </div>

          {err && (
            <p role="alert" className="cg-banner cg-banner--danger m-0">
              <span>{err}</span>
            </p>
          )}
        </div>

        <div className="cg-modal-foot">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteIncidentDialog({
  item,
  onClose,
  onDeleted,
  onError,
}: {
  item: EmployeeIncident;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onError: (message: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await data.deleteIncident(item.id);
      onDeleted(`Catatan ${item.employeeName} tanggal ${fmtDate(item.date)} dihapus.`);
    } catch (x) {
      onError(payrollErrorMessage(x, 'Gagal menghapus catatan harian.').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog {...dlg.props}>
      <div className="grid gap-12">
        <div className="cg-modal-head">
          <h3 className="text-base font-semibold m-0">Hapus catatan harian?</h3>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>
        <div className="cg-modal-body text-sm">
          Hapus catatan <strong>{INCIDENT_KIND_LABEL[item.kind]}</strong> untuk <strong>{item.employeeName}</strong> pada{' '}
          <strong>{fmtDate(item.date)}</strong> (jumlah: {item.count})?
        </div>
        <div className="cg-modal-foot">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--danger" onClick={() => void handleDelete()} disabled={busy}>
            {busy ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </dialog>
  );
}


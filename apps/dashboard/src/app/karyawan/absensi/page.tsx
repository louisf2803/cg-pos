'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Clock, Download, Edit2, Plus, Search, Trash2, Users } from 'lucide-react';
import {
  attendanceMinutes,
  attendanceProblem,
  attendanceTotals,
  DataError,
  filterAttendanceRecords,
  formatAttendanceClock,
  formatAttendanceDate,
  formatDuration,
  isoToOutletLocalInput,
  outletLocalInputToIso,
  ROLE_LABEL,
  summarizeAttendance,
  toCsv,
  type AttendanceRecord,
  type ColumnDef,
  type ManagedEmployee,
} from '@cgpos/shared';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { useDialog } from '@/components/fin-common';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type AttColKey = 'employeeName' | 'date' | 'clockIn' | 'clockOut' | 'duration' | 'edited' | 'note';

const ATTENDANCE_COLUMNS: ColumnDef<AttColKey>[] = [
  { key: 'employeeName', label: 'Karyawan', align: 'left' },
  { key: 'date', label: 'Tanggal', align: 'left' },
  { key: 'clockIn', label: 'Masuk', align: 'left' },
  { key: 'clockOut', label: 'Pulang', align: 'left' },
  { key: 'duration', label: 'Lama kerja', align: 'right' },
  { key: 'edited', label: 'Status koreksi', align: 'left' },
  { key: 'note', label: 'Catatan', align: 'left' },
];

type TabKey = 'records' | 'summary';

function recordCsvValue(key: AttColKey, r: AttendanceRecord, tz: string): string {
  const mins = r.minutes ?? attendanceMinutes(r.clockInAt, r.clockOutAt);
  switch (key) {
    case 'employeeName':
      return r.employeeName;
    case 'date':
      return formatAttendanceDate(r.clockInAt, tz);
    case 'clockIn':
      return formatAttendanceClock(r.clockInAt, tz);
    case 'clockOut':
      return r.clockOutAt ? formatAttendanceClock(r.clockOutAt, tz) : 'Sedang masuk';
    case 'duration':
      return mins !== undefined ? formatDuration(mins) : '—';
    case 'edited':
      return r.edited ? 'Dikoreksi' : 'Asli';
    case 'note':
      return r.note ?? '';
  }
}

export default function AbsensiKaryawanPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : undefined;
  const { value, setValue, range, today } = useRange(tz);

  const [tab, setTab] = useState<TabKey>('records');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AttendanceRecord | null | 'new'>(null);
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string; subtitle: string } | null>(null);

  const colPrefs = useColumnPrefs<AttColKey>('absensi-karyawan-v1', ATTENDANCE_COLUMNS);

  const state = useAsync(async () => {
    if (!tz) return null;
    const [records, openList, employees] = await Promise.all([
      data.listAttendance(range, employeeFilter || undefined),
      data.attendanceOpen(),
      data.listManagedEmployees(),
    ]);
    return { records, openList, employees };
  }, [data, tz, range.from, range.to, employeeFilter]);

  const activeTz = tz ?? 'Asia/Jakarta';
  const allRecords = state.status === 'ready' && state.data ? state.data.records : [];
  const openList = state.status === 'ready' && state.data ? state.data.openList : [];
  const employees = state.status === 'ready' && state.data ? state.data.employees : [];

  const filteredRecords = useMemo(
    () => filterAttendanceRecords(allRecords, { employeeId: employeeFilter, search }),
    [allRecords, employeeFilter, search],
  );
  const summaryRows = useMemo(() => summarizeAttendance(filteredRecords), [filteredRecords]);
  const stats = useMemo(() => attendanceTotals(filteredRecords, openList), [filteredRecords, openList]);

  function handleDownloadCsv() {
    if (state.status !== 'ready' || !state.data) return;
    if (tab === 'records') {
      if (!colPrefs.hasVisible || filteredRecords.length === 0) return;
      const head = colPrefs.activeColumns.map((c) => c.label);
      const rows: (string | number)[][] = [
        head,
        ...filteredRecords.map((r) => colPrefs.activeColumns.map((c) => recordCsvValue(c.key, r, activeTz))),
      ];
      downloadCsvWithHistory({
        fileName: `absensi-catatan-${range.label.replace(/ sampai /g, '_')}.csv`,
        csvContent: toCsv(rows),
        reportName: 'Absensi Karyawan (Catatan)',
        period: range.label,
        rowCount: filteredRecords.length,
        sourceUrl: `/karyawan/absensi?from=${range.from}&to=${range.to}`,
        params: { from: range.from, to: range.to, ...(employeeFilter ? { employeeId: employeeFilter } : {}) },
      });
      return;
    }

    if (summaryRows.length === 0) return;
    const rows: (string | number)[][] = [
      ['Karyawan', 'Jumlah catatan', 'Total menit', 'Total jam', 'Status'],
      ...summaryRows.map((s) => [
        s.employeeName,
        s.shifts,
        s.minutes,
        formatDuration(s.minutes),
        s.open ? 'Masih masuk' : 'Selesai',
      ]),
    ];
    downloadCsvWithHistory({
      fileName: `absensi-per-karyawan-${range.label.replace(/ sampai /g, '_')}.csv`,
      csvContent: toCsv(rows),
      reportName: 'Absensi Karyawan (Per Karyawan)',
      period: range.label,
      rowCount: summaryRows.length,
      sourceUrl: `/karyawan/absensi?tab=summary&from=${range.from}&to=${range.to}`,
      params: { from: range.from, to: range.to },
    });
  }

  const canExport =
    state.status === 'ready' &&
    Boolean(state.data) &&
    (tab === 'records' ? colPrefs.hasVisible && filteredRecords.length > 0 : summaryRows.length > 0);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Absensi karyawan"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Catatan jam masuk, jam pulang, selfie verifikasi, dan koreksi kehadiran.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-8">
            {tab === 'records' && (
              <ColumnChooser
                columns={ATTENDANCE_COLUMNS}
                prefs={colPrefs.prefs}
                onToggle={colPrefs.toggle}
                onMoveUp={colPrefs.moveUp}
                onMoveDown={colPrefs.moveDown}
                onReset={colPrefs.reset}
              />
            )}
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadCsv}
              disabled={!canExport}
            >
              <Download className="cg-icon" aria-hidden />
              <span>Unduh CSV</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => {
                setNotice('');
                setEditing('new');
              }}
              disabled={state.status !== 'ready'}
            >
              <Plus className="cg-icon" aria-hidden />
              <span>Tambah catatan</span>
            </button>
          </div>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      <div className="flex flex-wrap items-center gap-12 mb-16 min-w-0">
        <label className="cg-search flex-1 min-w-[200px] m-0">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari nama karyawan atau catatan</span>
          <input
            type="search"
            className="cg-input"
            placeholder="Cari nama karyawan atau catatan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="cg-field min-w-[180px] tablet:w-[240px]">
          <label className="cg-sr" htmlFor="filter-karyawan-absensi">Filter karyawan</label>
          <select
            id="filter-karyawan-absensi"
            className="cg-input"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
          >
            <option value="">Semua karyawan</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{!e.isActive ? ' (nonaktif)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div className="cg-banner bg-accent-soft text-accent-strong border border-accent/25 items-center justify-between mb-16" role="status">
          <span className="font-medium break-words">{notice}</span>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={() => setNotice('')}>
            Tutup
          </button>
        </div>
      )}

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat data absensi">
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 84 }} />)}
          </div>
          <div className="cg-skeleton" style={{ height: 220 }} />
        </div>
      )}

      {state.status === 'ready' && state.data && (
        <>
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12 mb-16 min-w-0" aria-label="Ringkasan absensi">
            <div className="cg-card p-12 min-w-0">
              <span className="text-xs text-text-muted flex items-center gap-4">
                <Users className="cg-icon cg-icon--xs text-accent shrink-0" aria-hidden />
                <span>Karyawan masuk</span>
              </span>
              <strong className="cg-num text-lg block mt-4 text-accent-strong">{stats.openCount}</strong>
              <span className="text-xs text-text-muted">Sedang bekerja saat ini</span>
            </div>
            <div className="cg-card p-12 min-w-0">
              <span className="text-xs text-text-muted block">Total catatan</span>
              <strong className="cg-num text-lg block mt-4">{stats.recordCount}</strong>
              <span className="text-xs text-text-muted">Sesuai rentang &amp; filter</span>
            </div>
            <div className="cg-card p-12 min-w-0">
              <span className="text-xs text-text-muted flex items-center gap-4">
                <Clock className="cg-icon cg-icon--xs shrink-0" aria-hidden />
                <span>Total jam kerja</span>
              </span>
              <strong className="cg-num text-lg block mt-4">{formatDuration(stats.totalMinutes)}</strong>
              <span className="text-xs text-text-muted">Akumulasi catatan selesai</span>
            </div>
            <div className="cg-card p-12 min-w-0">
              <span className="text-xs text-text-muted block">Rata-rata jam per catatan</span>
              <strong className="cg-num text-lg block mt-4">
                {stats.completedCount > 0 ? formatDuration(stats.avgMinutes) : '—'}
              </strong>
              <span className="text-xs text-text-muted">{stats.completedCount} catatan selesai</span>
            </div>
          </div>

          <div className="cg-tabs mb-16" role="tablist" aria-label="Tampilan laporan absensi">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'records'}
              className="cg-tab whitespace-nowrap"
              onClick={() => setTab('records')}
            >
              Catatan ({filteredRecords.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'summary'}
              className="cg-tab whitespace-nowrap"
              onClick={() => setTab('summary')}
            >
              Per karyawan ({summaryRows.length})
            </button>
          </div>

          {tab === 'records' ? (
            filteredRecords.length === 0 ? (
              <div className="cg-empty">
                <p><strong>Belum ada catatan absensi pada rentang dan filter ini.</strong></p>
                <p className="text-text-muted mb-12">
                  Catatan muncul saat karyawan masuk/pulang dari kasir POS atau saat Anda menambahkan koreksi manual.
                </p>
                <button
                  type="button"
                  className="cg-btn cg-btn--primary"
                  onClick={() => {
                    setNotice('');
                    setEditing('new');
                  }}
                >
                  <Plus className="cg-icon" aria-hidden />
                  <span>Tambah catatan</span>
                </button>
              </div>
            ) : !colPrefs.hasVisible ? (
              <div className="cg-empty">
                <p><strong>Semua kolom tabel disembunyikan.</strong></p>
                <p className="text-text-muted">Aktifkan kembali kolom melalui tombol Atur kolom di atas.</p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Daftar catatan absensi">
                  <thead>
                    <tr>
                      {colPrefs.activeColumns.map((col) => (
                        <th key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                          {col.label}
                        </th>
                      ))}
                      <th>Selfie</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r) => {
                      const mins = r.minutes ?? attendanceMinutes(r.clockInAt, r.clockOutAt);
                      return (
                        <tr key={r.id}>
                          {colPrefs.activeColumns.map((col) => {
                            if (col.key === 'employeeName') {
                              return <td key={col.key} className="font-semibold">{r.employeeName}</td>;
                            }
                            if (col.key === 'date') {
                              return <td key={col.key} className="whitespace-nowrap">{formatAttendanceDate(r.clockInAt, activeTz)}</td>;
                            }
                            if (col.key === 'clockIn') {
                              return <td key={col.key} className="cg-num whitespace-nowrap">{formatAttendanceClock(r.clockInAt, activeTz)}</td>;
                            }
                            if (col.key === 'clockOut') {
                              return (
                                <td key={col.key} className="cg-num whitespace-nowrap">
                                  {r.clockOutAt ? (
                                    formatAttendanceClock(r.clockOutAt, activeTz)
                                  ) : (
                                    <span className="cg-badge cg-badge--info">Sedang masuk</span>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === 'duration') {
                              return (
                                <td key={col.key} className="text-right cg-num whitespace-nowrap">
                                  {mins !== undefined ? formatDuration(mins) : '—'}
                                </td>
                              );
                            }
                            if (col.key === 'edited') {
                              return (
                                <td key={col.key} className="whitespace-nowrap">
                                  {r.edited ? (
                                    <span className="cg-badge cg-badge--warning">Dikoreksi</span>
                                  ) : (
                                    <span className="text-xs text-text-muted">Asli</span>
                                  )}
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} className="min-w-0">
                                {r.note ? <span className="break-words">{r.note}</span> : <span className="text-text-muted">—</span>}
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap">
                            {r.clockInPhotoUrl || r.clockOutPhotoUrl ? (
                              <div className="flex items-center gap-8">
                                {r.clockInPhotoUrl && (
                                  <button
                                    type="button"
                                    className="flex items-center gap-4 p-4 rounded border border-border hover:border-accent bg-surface cursor-pointer"
                                    aria-label={`Lihat selfie masuk ${r.employeeName}`}
                                    onClick={() =>
                                      setPhotoPreview({
                                        url: r.clockInPhotoUrl!,
                                        title: `Selfie Masuk · ${r.employeeName}`,
                                        subtitle: `${formatAttendanceDate(r.clockInAt, activeTz)} · ${formatAttendanceClock(r.clockInAt, activeTz)}`,
                                      })
                                    }
                                  >
                                    <img
                                      src={r.clockInPhotoUrl}
                                      alt={`Selfie masuk ${r.employeeName}`}
                                      className="w-[32px] h-[32px] object-cover rounded"
                                    />
                                    <span className="text-xs">Masuk</span>
                                  </button>
                                )}
                                {r.clockOutPhotoUrl && (
                                  <button
                                    type="button"
                                    className="flex items-center gap-4 p-4 rounded border border-border hover:border-accent bg-surface cursor-pointer"
                                    aria-label={`Lihat selfie pulang ${r.employeeName}`}
                                    onClick={() =>
                                      setPhotoPreview({
                                        url: r.clockOutPhotoUrl!,
                                        title: `Selfie Pulang · ${r.employeeName}`,
                                        subtitle: `${formatAttendanceDate(r.clockInAt, activeTz)} · ${r.clockOutAt ? formatAttendanceClock(r.clockOutAt, activeTz) : ''}`,
                                      })
                                    }
                                  >
                                    <img
                                      src={r.clockOutPhotoUrl}
                                      alt={`Selfie pulang ${r.employeeName}`}
                                      className="w-[32px] h-[32px] object-cover rounded"
                                    />
                                    <span className="text-xs">Pulang</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-4">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Ubah catatan ${r.employeeName} ${formatAttendanceDate(r.clockInAt, activeTz)}`}
                                onClick={() => {
                                  setNotice('');
                                  setEditing(r);
                                }}
                              >
                                <Edit2 className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Ubah</span>
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                                aria-label={`Hapus catatan ${r.employeeName} ${formatAttendanceDate(r.clockInAt, activeTz)}`}
                                onClick={() => {
                                  setNotice('');
                                  setDeleting(r);
                                }}
                              >
                                <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : summaryRows.length === 0 ? (
            <div className="cg-empty">
              <p><strong>Belum ada ringkasan per karyawan pada rentang dan filter ini.</strong></p>
              <p className="text-text-muted">Ringkasan dihitung dari catatan masuk/pulang pada periode yang dipilih.</p>
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data" aria-label="Ringkasan absensi per karyawan">
                <thead>
                  <tr>
                    <th>Karyawan</th>
                    <th className="text-right">Jumlah catatan</th>
                    <th className="text-right">Total jam</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.employeeId}>
                      <td className="font-semibold">{row.employeeName}</td>
                      <td className="text-right cg-num">{row.shifts}</td>
                      <td className="text-right cg-num">{formatDuration(row.minutes)}</td>
                      <td>
                        {row.open ? (
                          <span className="cg-badge cg-badge--info">Masih masuk</span>
                        ) : (
                          <span className="cg-badge cg-badge--success">Selesai</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing !== null && state.status === 'ready' && (
        <AttendanceFormDialog
          record={editing === 'new' ? null : editing}
          employees={employees}
          tz={activeTz}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            state.reload();
          }}
        />
      )}

      {deleting && (
        <DeleteAttendanceDialog
          record={deleting}
          tz={activeTz}
          onClose={() => setDeleting(null)}
          onDeleted={(msg) => {
            setDeleting(null);
            setNotice(msg);
            state.reload();
          }}
        />
      )}

      {photoPreview && (
        <PhotoDialog preview={photoPreview} onClose={() => setPhotoPreview(null)} />
      )}
    </div>
  );
}

function AttendanceFormDialog({
  record,
  employees,
  tz,
  onClose,
  onSaved,
}: {
  record: AttendanceRecord | null;
  employees: ManagedEmployee[];
  tz: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const selectableEmployees = useMemo(
    () => employees.filter((e) => e.isActive || (record && e.id === record.employeeId)),
    [employees, record],
  );

  const [employeeId, setEmployeeId] = useState(
    () => record?.employeeId ?? selectableEmployees[0]?.id ?? '',
  );
  const [clockInLocal, setClockInLocal] = useState(() =>
    record
      ? isoToOutletLocalInput(record.clockInAt, tz)
      : isoToOutletLocalInput(new Date().toISOString(), tz),
  );
  const [clockOutLocal, setClockOutLocal] = useState(() =>
    record?.clockOutAt ? isoToOutletLocalInput(record.clockOutAt, tz) : '',
  );
  const [note, setNote] = useState(() => record?.note ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');

    if (!employeeId) {
      setErr('Pilih karyawan terlebih dahulu.');
      return;
    }
    const clockInAt = outletLocalInputToIso(clockInLocal, tz);
    if (!clockInAt) {
      setErr('Isi jam masuk yang valid.');
      return;
    }
    let clockOutAt: string | undefined;
    if (clockOutLocal.trim()) {
      const parsedOut = outletLocalInputToIso(clockOutLocal, tz);
      if (!parsedOut) {
        setErr('Isi jam pulang yang valid.');
        return;
      }
      clockOutAt = parsedOut;
    }

    const problem = attendanceProblem({ clockInAt, clockOutAt });
    if (problem) {
      setErr(problem);
      return;
    }

    setSaving(true);
    try {
      const saved = await data.saveAttendance({
        ...(record ? { id: record.id } : {}),
        employeeId,
        clockInAt,
        clockOutAt,
        note: note.trim() || undefined,
      });
      onSaved(
        record
          ? `Catatan absensi ${saved.employeeName} diperbarui.`
          : `Catatan absensi ${saved.employeeName} ditambahkan.`,
      );
    } catch (error) {
      setErr(
        error instanceof DataError || error instanceof Error
          ? error.message
          : 'Gagal menyimpan catatan absensi.',
      );
      setSaving(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="absensi-form-judul">
      <form onSubmit={handleSubmit} className="grid gap-16 min-w-0" noValidate>
        <h2 id="absensi-form-judul" className="cg-modal__title">
          {record ? 'Koreksi catatan absensi' : 'Tambah catatan absensi'}
        </h2>

        {err && (
          <p role="alert" className="cg-banner cg-banner--danger m-0">
            <span>{err}</span>
          </p>
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="absensi-karyawan">Karyawan</label>
          <select
            id="absensi-karyawan"
            className="cg-input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={saving || selectableEmployees.length === 0}
          >
            {selectableEmployees.length === 0 ? (
              <option value="">Belum ada karyawan aktif</option>
            ) : (
              selectableEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({ROLE_LABEL[emp.role]}){!emp.isActive ? ' — Nonaktif' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="absensi-masuk">Jam masuk ({tz})</label>
            <input
              id="absensi-masuk"
              type="datetime-local"
              className="cg-input"
              value={clockInLocal}
              onChange={(e) => {
                setClockInLocal(e.target.value);
                setErr('');
              }}
              required
            />
          </div>
          <div className="cg-field">
            <div className="flex items-center justify-between gap-8">
              <label className="cg-label" htmlFor="absensi-pulang">Jam pulang (opsional)</label>
              {clockOutLocal && (
                <button
                  type="button"
                  className="text-xs text-text-muted underline cursor-pointer"
                  onClick={() => {
                    setClockOutLocal('');
                    setErr('');
                  }}
                >
                  Kosongkan
                </button>
              )}
            </div>
            <input
              id="absensi-pulang"
              type="datetime-local"
              className="cg-input"
              value={clockOutLocal}
              onChange={(e) => {
                setClockOutLocal(e.target.value);
                setErr('');
              }}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="absensi-catatan">Catatan koreksi (maks. 300 huruf)</label>
          <textarea
            id="absensi-catatan"
            className="cg-input"
            rows={2}
            maxLength={300}
            placeholder="Mis. Lupa absen pulang saat shift malam"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={saving || selectableEmployees.length === 0}
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteAttendanceDialog({
  record,
  tz,
  onClose,
  onDeleted,
}: {
  record: AttendanceRecord;
  tz: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function confirmDelete() {
    setBusy(true);
    setErr('');
    try {
      await data.deleteAttendance(record.id);
      onDeleted(`Catatan absensi ${record.employeeName} dihapus.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal menghapus catatan absensi.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="absensi-hapus-judul">
      <div className="grid gap-16 min-w-0">
        <h2 id="absensi-hapus-judul" className="cg-modal__title">Hapus catatan absensi?</h2>
        <p className="cg-modal__body">
          Catatan <strong>{record.employeeName}</strong> tanggal{' '}
          <strong>{formatAttendanceDate(record.clockInAt, tz)}</strong> (masuk{' '}
          {formatAttendanceClock(record.clockInAt, tz)}
          {record.clockOutAt ? `, pulang ${formatAttendanceClock(record.clockOutAt, tz)}` : ', masih masuk'})
          akan dihapus permanen.
        </p>
        {err && (
          <p role="alert" className="cg-banner cg-banner--danger m-0">
            <span>{err}</span>
          </p>
        )}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger"
            onClick={() => void confirmDelete()}
            disabled={busy}
          >
            {busy ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function PhotoDialog({
  preview,
  onClose,
}: {
  preview: { url: string; title: string; subtitle: string };
  onClose: () => void;
}) {
  const d = useDialog(onClose);
  const [broken, setBroken] = useState(false);

  return (
    <dialog {...d.props} aria-labelledby="absensi-foto-judul">
      <div className="grid gap-12 min-w-0">
        <div>
          <h2 id="absensi-foto-judul" className="cg-modal__title">{preview.title}</h2>
          <p className="text-xs text-text-muted mt-4">{preview.subtitle}</p>
        </div>
        {broken ? (
          <p role="status" className="cg-banner cg-banner--warning m-0">
            <span>Foto tidak bisa dimuat atau tautan akses sudah kedaluwarsa. Muat ulang halaman untuk memperbarui tautan.</span>
          </p>
        ) : (
          <img
            src={preview.url}
            alt={preview.title}
            className="w-full rounded-md border border-border object-contain bg-surface"
            style={{ maxHeight: '65vh' }}
            onError={() => setBroken(true)}
          />
        )}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </dialog>
  );
}


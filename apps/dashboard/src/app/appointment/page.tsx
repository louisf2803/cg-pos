'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  CALENDAR_WEEKDAYS_ID,
  appointmentProblem,
  buildCalendarMonth,
  type Appointment,
  type AppointmentInput,
  type AppointmentKind,
  type AppointmentStatus,
  type Customer,
  type DiningTable,
  type Product,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${d}T00:00:00Z`));

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending: '',
  confirmed: 'cg-badge--success',
  completed: 'cg-badge--accent',
  cancelled: 'cg-badge--danger',
};

type ViewTab = 'list' | 'calendar';

export default function AppointmentPage() {
  const data = useData();
  const master = useAsync(async () => {
    const [tables, products, customers, appointments] = await Promise.all([
      data.listTables(),
      data.listProducts({ includeInactive: false }),
      data.listCustomers(),
      data.listAppointments(),
    ]);
    return {
      tables,
      services: products.filter((p) => p.kind === 'service' && p.isActive),
      customers,
      appointments,
    };
  }, [data]);

  const initialToday = todayKey();
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const masterData = master.status === 'ready' ? master.data : null;
  useEffect(() => {
    if (masterData) {
      setAppointments(masterData.appointments);
    }
  }, [masterData]);

  const [tab, setTab] = useState<ViewTab>('list');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | AppointmentKind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');

  const [calYear, setCalYear] = useState(() => Number(initialToday.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(initialToday.slice(5, 7)));
  const [selectedDate, setSelectedDate] = useState<string>(initialToday);

  const [dlgDate, setDlgDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeAppointments = useMemo(
    () => appointments.filter((a) => a.status !== 'cancelled'),
    [appointments],
  );

  const pendingOrConfirmed = useMemo(
    () => appointments.filter((a) => a.status === 'pending' || a.status === 'confirmed').length,
    [appointments],
  );

  const todayActiveCount = useMemo(
    () => activeAppointments.filter((a) => a.date === initialToday).length,
    [activeAppointments, initialToday],
  );

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...appointments]
      .filter((a) => {
        if (kindFilter !== 'all' && a.kind !== kindFilter) return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (!q) return true;
        return (
          a.customerName.toLowerCase().includes(q) ||
          a.customerPhone.toLowerCase().includes(q) ||
          a.targetName.toLowerCase().includes(q) ||
          (a.note ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [appointments, search, kindFilter, statusFilter]);

  const calendarGrid = useMemo(
    () => buildCalendarMonth(calYear, calMonth, appointments),
    [calYear, calMonth, appointments],
  );

  const selectedDayRows = useMemo(
    () =>
      appointments
        .filter((a) => a.date === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [appointments, selectedDate],
  );

  const stepMonth = (delta: number) => {
    const d = new Date(Date.UTC(calYear, calMonth - 1 + delta, 1));
    setCalYear(d.getUTCFullYear());
    setCalMonth(d.getUTCMonth() + 1);
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const cur = appointments.find((a) => a.id === id);
    if (!cur) return;
    try {
      const updated = await data.saveAppointment({
        id: cur.id,
        kind: cur.kind,
        targetId: cur.targetId,
        targetName: cur.targetName,
        customerId: cur.customerId,
        customerName: cur.customerName,
        customerPhone: cur.customerPhone,
        date: cur.date,
        startTime: cur.startTime,
        endTime: cur.endTime,
        status,
        note: cur.note,
      });
      setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setNotice(`Status reservasi diperbarui ke "${APPOINTMENT_STATUS_LABEL[status]}".`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memperbarui status reservasi.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await data.deleteAppointment(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      setNotice('Reservasi berhasil dihapus.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus reservasi.');
    }
  };

  const handleCreated = async (input: AppointmentInput) => {
    const created = await data.saveAppointment(input);
    setAppointments((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
    setDlgDate(null);
    setSelectedDate(created.date);
    setCalYear(Number(created.date.slice(0, 4)));
    setCalMonth(Number(created.date.slice(5, 7)));
    setNotice(
      `Reservasi ${created.customerName} (${APPOINTMENT_KIND_LABEL[created.kind]} · ${created.targetName}) pada ${fmtDate(created.date)} ${created.startTime}–${created.endTime} tersimpan.`,
    );
  };

  return (
    <>
      <PageHeader
        title="Jadwal appointment"
        subtitle="Kelola reservasi jasa, fasilitas, atau meja pelanggan beserta kalender bulanan"
        helpText="Mendukung deteksi otomatis bentrok jadwal untuk slot jasa, fasilitas, atau meja yang sama."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary cg-btn--sm"
            disabled={master.status !== 'ready'}
            onClick={() => setDlgDate(selectedDate || initialToday)}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden /> Reservasi Baru
          </button>
        }
      />

      {notice && (
        <p role="status" className="cg-banner cg-banner--success mb-16">
          {notice}
        </p>
      )}

      {master.status === 'error' && (
        <ErrorBox message={master.message} onRetry={master.reload} />
      )}

      {master.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat jadwal reservasi">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[260px]" />
        </div>
      )}

      {master.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          {/* KPI */}
          <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs text-text-muted">Reservasi Aktif</dt>
              <dd className="text-xl font-bold text-text mt-4 cg-num">
                {activeAppointments.length} jadwal
              </dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs text-text-muted">Menunggu / Dikonfirmasi</dt>
              <dd className="text-xl font-bold text-accent-strong mt-4 cg-num">
                {pendingOrConfirmed} jadwal
              </dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs text-text-muted">Jadwal Hari Ini</dt>
              <dd className="text-xl font-bold text-text mt-4 cg-num">
                {todayActiveCount} jadwal
              </dd>
            </div>
          </dl>

          {/* Tab switch Daftar | Kalender */}
          <div className="flex flex-wrap items-center justify-between gap-12">
            <div className="flex gap-8" role="tablist" aria-label="Tampilan appointment">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'list'}
                className="cg-chip inline-flex items-center gap-8"
                onClick={() => setTab('list')}
              >
                <List className="cg-icon cg-icon--xs" aria-hidden /> Daftar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'calendar'}
                className="cg-chip inline-flex items-center gap-8"
                onClick={() => setTab('calendar')}
              >
                <CalendarDays className="cg-icon cg-icon--xs" aria-hidden /> Kalender
              </button>
            </div>
          </div>

          {tab === 'list' ? (
            <div className="grid gap-16 min-w-0">
              {appointments.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
                  <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                    <Search
                      className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden
                    />
                    <input
                      type="search"
                      className="cg-input pl-32"
                      placeholder="Cari pelanggan, kontak, layanan..."
                      aria-label="Cari reservasi"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-8">
                    {(
                      [
                        { id: 'all', label: 'Semua Jenis' },
                        { id: 'service', label: 'Jasa' },
                        { id: 'facility', label: 'Fasilitas' },
                        { id: 'table', label: 'Meja' },
                      ] as const
                    ).map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className="cg-chip"
                        aria-pressed={kindFilter === k.id}
                        onClick={() => setKindFilter(k.id)}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {appointments.length > 0 && (
                <div className="flex flex-wrap gap-8" role="group" aria-label="Filter status reservasi">
                  {(
                    [
                      { id: 'all', label: 'Semua Status' },
                      { id: 'pending', label: 'Menunggu' },
                      { id: 'confirmed', label: 'Dikonfirmasi' },
                      { id: 'completed', label: 'Selesai' },
                      { id: 'cancelled', label: 'Batal' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="cg-chip"
                      aria-pressed={statusFilter === s.id}
                      onClick={() => setStatusFilter(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {appointments.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada reservasi/appointment.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Tambahkan jadwal pelanggan untuk pemesanan jasa, fasilitas ruang, maupun meja restoran.
                  </p>
                  <button
                    type="button"
                    className="cg-btn cg-btn--primary cg-btn--sm mt-12"
                    onClick={() => setDlgDate(initialToday)}
                  >
                    <Plus className="cg-icon cg-icon--sm" aria-hidden /> Buat Reservasi Pertama
                  </button>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Tidak ada reservasi yang cocok.</strong>
                  </p>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm mt-8"
                    onClick={() => {
                      setSearch('');
                      setKindFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    Tampilkan semua
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredList.map((a) => (
                      <li
                        key={a.id}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8 min-w-0">
                          <div className="min-w-0">
                            <strong className="text-sm font-bold text-text block break-words">
                              {a.customerName}
                            </strong>
                            <span className="text-xs text-text-muted block cg-num">
                              {a.customerPhone}
                            </span>
                          </div>
                          <span className={`cg-badge text-xs shrink-0 ${STATUS_BADGE[a.status]}`}>
                            {APPOINTMENT_STATUS_LABEL[a.status]}
                          </span>
                        </div>

                        <div className="text-xs text-text flex items-center gap-8">
                          <Clock className="w-12 h-12 text-accent shrink-0" aria-hidden />
                          <span className="cg-num font-medium">
                            {fmtDate(a.date)} · {a.startTime}–{a.endTime}
                          </span>
                        </div>

                        <div className="text-sm text-text break-words">
                          <span className="cg-badge text-xs mr-8">
                            {APPOINTMENT_KIND_LABEL[a.kind]}
                          </span>
                          <strong>{a.targetName}</strong>
                        </div>

                        {a.note && (
                          <p className="text-xs text-text-muted break-words">{a.note}</p>
                        )}

                        <div className="flex items-center justify-between gap-8 pt-8 border-t border-border/60">
                          <select
                            aria-label={`Ubah status ${a.customerName}`}
                            className="cg-input text-xs flex-1"
                            value={a.status}
                            onChange={(e) =>
                              handleStatusChange(a.id, e.target.value as AppointmentStatus)
                            }
                          >
                            <option value="pending">Menunggu</option>
                            <option value="confirmed">Dikonfirmasi</option>
                            <option value="completed">Selesai</option>
                            <option value="cancelled">Batal</option>
                          </select>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            aria-label={`Hapus reservasi ${a.customerName}`}
                            onClick={() => handleDelete(a.id)}
                          >
                            <Trash2 className="cg-icon cg-icon--sm text-danger-strong" aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Desktop table */}
                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Tanggal &amp; Jam</th>
                          <th>Pelanggan</th>
                          <th>Jenis &amp; Slot</th>
                          <th>Status</th>
                          <th>Catatan</th>
                          <th className="text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredList.map((a) => (
                          <tr key={a.id}>
                            <td className="whitespace-nowrap">
                              <strong className="text-sm block">{fmtDate(a.date)}</strong>
                              <span className="text-xs text-text-muted cg-num">
                                {a.startTime}–{a.endTime}
                              </span>
                            </td>
                            <td className="min-w-[140px] max-w-[200px]">
                              <strong className="text-sm block break-words">{a.customerName}</strong>
                              <span className="text-xs text-text-muted cg-num">
                                {a.customerPhone}
                              </span>
                            </td>
                            <td className="min-w-[140px] max-w-[220px]">
                              <span className="cg-badge text-xs mb-4 inline-block">
                                {APPOINTMENT_KIND_LABEL[a.kind]}
                              </span>
                              <div className="text-sm font-medium break-words">{a.targetName}</div>
                            </td>
                            <td className="whitespace-nowrap">
                              <select
                                aria-label={`Status ${a.customerName} ${a.startTime}`}
                                className="cg-input text-xs py-4 px-8"
                                value={a.status}
                                onChange={(e) =>
                                  handleStatusChange(a.id, e.target.value as AppointmentStatus)
                                }
                              >
                                <option value="pending">Menunggu</option>
                                <option value="confirmed">Dikonfirmasi</option>
                                <option value="completed">Selesai</option>
                                <option value="cancelled">Batal</option>
                              </select>
                            </td>
                            <td className="text-sm text-text-muted break-words max-w-[220px]">
                              {a.note || '—'}
                            </td>
                            <td className="text-right whitespace-nowrap">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Hapus ${a.customerName}`}
                                onClick={() => handleDelete(a.id)}
                              >
                                <Trash2 className="cg-icon cg-icon--sm text-danger-strong" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Tab Kalender */
            <div className="grid gap-16 min-w-0">
              <div className="rounded-xl border border-border bg-surface-raised p-16 grid gap-12 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <div className="flex items-center gap-8">
                    <button
                      type="button"
                      className="cg-btn cg-btn--secondary cg-btn--sm"
                      aria-label="Bulan sebelumnya"
                      onClick={() => stepMonth(-1)}
                    >
                      <ChevronLeft className="cg-icon cg-icon--sm" aria-hidden />
                    </button>
                    <h2 className="text-base font-bold text-text min-w-[140px] text-center">
                      {calendarGrid.label}
                    </h2>
                    <button
                      type="button"
                      className="cg-btn cg-btn--secondary cg-btn--sm"
                      aria-label="Bulan berikutnya"
                      onClick={() => stepMonth(1)}
                    >
                      <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={() => {
                      setCalYear(Number(initialToday.slice(0, 4)));
                      setCalMonth(Number(initialToday.slice(5, 7)));
                      setSelectedDate(initialToday);
                    }}
                  >
                    Hari Ini
                  </button>
                </div>

                {/* Header hari */}
                <div className="grid grid-cols-7 gap-4 text-center text-xs font-semibold text-text-muted">
                  {CALENDAR_WEEKDAYS_ID.map((w) => (
                    <div key={w} className="py-4">
                      {w}
                    </div>
                  ))}
                </div>

                {/* Grid 7 kolom */}
                <div className="grid grid-cols-7 gap-4">
                  {calendarGrid.cells.map((cell, idx) => {
                    if (!cell) {
                      return <div key={`empty-${idx}`} className="h-[52px] rounded-lg bg-surface/40" />;
                    }
                    const isSelected = selectedDate === cell.dateKey;
                    const isToday = initialToday === cell.dateKey;
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        aria-label={`${cell.day} ${calendarGrid.label}, ${cell.activeCount} reservasi`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedDate(cell.dateKey)}
                        className={`h-[52px] rounded-lg border p-4 flex flex-col items-center justify-between transition-colors min-w-0 ${
                          isSelected
                            ? 'border-accent bg-accent-soft text-accent-strong font-bold'
                            : isToday
                            ? 'border-accent/50 bg-surface-raised text-text'
                            : 'border-border bg-surface text-text hover:bg-surface-raised'
                        }`}
                      >
                        <span className="text-xs cg-num">{cell.day}</span>
                        {cell.activeCount > 0 ? (
                          <span className="cg-badge cg-badge--success text-[10px] px-4 py-0 leading-tight">
                            {cell.activeCount}
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted/50">·</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail hari terpilih */}
              <div className="rounded-xl border border-border bg-surface-raised p-16 grid gap-12 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <div>
                    <h3 className="text-sm font-bold text-text">
                      Jadwal tanggal {fmtDate(selectedDate)}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {selectedDayRows.length} reservasi tercatat pada tanggal ini
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cg-btn cg-btn--primary cg-btn--sm"
                    onClick={() => setDlgDate(selectedDate)}
                  >
                    <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah di tanggal ini
                  </button>
                </div>

                {selectedDayRows.length === 0 ? (
                  <p className="text-sm text-text-muted py-8">
                    Belum ada reservasi pada tanggal {fmtDate(selectedDate)}.
                  </p>
                ) : (
                  <ul className="grid gap-8">
                    {selectedDayRows.map((a) => (
                      <li
                        key={a.id}
                        className="p-12 rounded-lg border border-border bg-surface flex flex-wrap items-center justify-between gap-8"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-8">
                            <strong className="text-sm cg-num text-accent-strong">
                              {a.startTime}–{a.endTime}
                            </strong>
                            <span className="cg-badge text-xs">
                              {APPOINTMENT_KIND_LABEL[a.kind]}
                            </span>
                            <strong className="text-sm text-text break-words">
                              {a.targetName}
                            </strong>
                          </div>
                          <div className="text-xs text-text-muted mt-4">
                            {a.customerName} · {a.customerPhone}
                            {a.note ? ` · ${a.note}` : ''}
                          </div>
                        </div>
                        <span className={`cg-badge text-xs shrink-0 ${STATUS_BADGE[a.status]}`}>
                          {APPOINTMENT_STATUS_LABEL[a.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {dlgDate !== null && master.status === 'ready' && (
        <NewAppointmentDialog
          defaultDate={dlgDate}
          tables={master.data.tables}
          services={master.data.services}
          customers={master.data.customers}
          existing={appointments}
          onClose={() => setDlgDate(null)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

function NewAppointmentDialog({
  defaultDate,
  tables,
  services,
  customers,
  existing,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  tables: DiningTable[];
  services: Product[];
  customers: Customer[];
  existing: Appointment[];
  onClose: () => void;
  onCreated: (input: AppointmentInput) => Promise<void> | void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const [kind, setKind] = useState<AppointmentKind>(tables.length > 0 ? 'table' : 'service');
  const [tableId, setTableId] = useState<string>(tables[0]?.id ?? '');
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '');
  const [manualTarget, setManualTarget] = useState<string>('');
  const [date, setDate] = useState<string>(defaultDate);
  const [startTime, setStartTime] = useState<string>('14:00');
  const [endTime, setEndTime] = useState<string>('15:00');
  const [customerId, setCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'confirmed'>('confirmed');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedTarget = (() => {
    if (kind === 'table' && tables.length > 0) {
      const t = tables.find((x) => x.id === tableId) ?? tables[0];
      return { targetId: t?.id, targetName: t?.name ?? manualTarget };
    }
    if (kind === 'service' && services.length > 0 && serviceId !== '__manual__') {
      const s = services.find((x) => x.id === serviceId);
      return { targetId: s?.id, targetName: s?.name ?? manualTarget };
    }
    return { targetId: undefined, targetName: manualTarget };
  })();

  const handleCustomerPick = (cid: string) => {
    setCustomerId(cid);
    const c = customers.find((x) => x.id === cid);
    if (c) {
      setCustomerName(c.name);
      if (c.phone) setCustomerPhone(c.phone);
      setError(null);
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: AppointmentInput = {
      kind,
      targetId: resolvedTarget.targetId,
      targetName: resolvedTarget.targetName,
      customerId: customerId || undefined,
      customerName,
      customerPhone,
      date,
      startTime,
      endTime,
      status,
      note: note.trim() || undefined,
    };
    const problem = appointmentProblem(input, existing);
    if (problem) {
      setError(problem);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onCreated(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan reservasi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-reservasi-baru"
      onClose={onClose}
      style={{ margin: 'auto', width: 'min(560px, calc(100vw - 16px))' }}
    >
      <form onSubmit={handleSubmit} className="grid gap-12" noValidate>
        <h2 id="judul-reservasi-baru" className="cg-modal__title">
          Reservasi Baru
        </h2>

        <div className="cg-field">
          <span className="cg-label">Jenis reservasi</span>
          <div className="flex flex-wrap gap-8 mt-4" role="group" aria-label="Jenis reservasi">
            {(
              [
                { id: 'service', label: 'Jasa' },
                { id: 'facility', label: 'Fasilitas' },
                { id: 'table', label: 'Meja' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="cg-chip"
                aria-pressed={kind === opt.id}
                onClick={() => {
                  setKind(opt.id);
                  setError(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target jasa / fasilitas / meja */}
        {kind === 'table' && tables.length > 0 ? (
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-meja">
              Pilih meja
            </label>
            <select
              id="apt-meja"
              className="cg-input"
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value);
                setError(null);
              }}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : kind === 'service' && services.length > 0 ? (
          <div className="grid gap-8">
            <div className="cg-field">
              <label className="cg-label" htmlFor="apt-jasa-select">
                Pilih produk jasa
              </label>
              <select
                id="apt-jasa-select"
                className="cg-input"
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setError(null);
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="__manual__">Isi nama jasa lain secara manual</option>
              </select>
            </div>
            {serviceId === '__manual__' && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="apt-target-manual">
                  Nama jasa
                </label>
                <input
                  id="apt-target-manual"
                  className="cg-input"
                  maxLength={100}
                  placeholder="Mis. Potong rambut & pijat kepala"
                  value={manualTarget}
                  onChange={(e) => {
                    setManualTarget(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-target-text">
              Nama {APPOINTMENT_KIND_LABEL[kind].toLowerCase()}
            </label>
            <input
              id="apt-target-text"
              className="cg-input"
              maxLength={100}
              placeholder={
                kind === 'facility'
                  ? 'Mis. Ruang Meeting VIP A / Studio 1'
                  : kind === 'service'
                  ? 'Mis. Potong rambut / Konsultasi kulit'
                  : 'Mis. Meja Outdoor 1'
              }
              value={manualTarget}
              onChange={(e) => {
                setManualTarget(e.target.value);
                setError(null);
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-tgl">
              Tanggal
            </label>
            <input
              id="apt-tgl"
              type="date"
              className="cg-input"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-mulai">
              Jam mulai
            </label>
            <input
              id="apt-mulai"
              type="time"
              className="cg-input"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-selesai">
              Jam selesai
            </label>
            <input
              id="apt-selesai"
              type="time"
              className="cg-input"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>

        {customers.length > 0 && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-pelanggan-pick">
              Ambil dari daftar pelanggan (opsional)
            </label>
            <select
              id="apt-pelanggan-pick"
              className="cg-input"
              value={customerId}
              onChange={(e) => handleCustomerPick(e.target.value)}
            >
              <option value="">Isi manual pelanggan baru</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-nama">
              Nama pelanggan
            </label>
            <input
              id="apt-nama"
              className="cg-input"
              maxLength={120}
              placeholder="Mis. Rina Kartika"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-kontak">
              Nomor kontak / WhatsApp
            </label>
            <input
              id="apt-kontak"
              className="cg-input"
              maxLength={40}
              placeholder="Mis. 081234567890"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-status">
              Status awal
            </label>
            <select
              id="apt-status"
              className="cg-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'confirmed')}
            >
              <option value="confirmed">Dikonfirmasi</option>
              <option value="pending">Menunggu</option>
            </select>
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="apt-catatan">
              Catatan
            </label>
            <input
              id="apt-catatan"
              className="cg-input"
              maxLength={240}
              placeholder="Mis. Dekat jendela / 4 tamu"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-danger-strong text-sm">
            {error}
          </p>
        )}

        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan reservasi'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

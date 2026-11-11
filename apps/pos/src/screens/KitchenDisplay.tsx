import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  Clock,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  accessFor,
  filterKitchenTickets,
  filterRowsByStation,
  formatRole,
  groupTickets,
  KITCHEN_NEXT,
  KITCHEN_NEXT_LABEL,
  KITCHEN_PREV,
  KITCHEN_STATUS_LABEL,
  kitchenAlert,
  orderTypeLabel,
  ticketAdvancePlan,
  waitMinutes,
  type KitchenStatus,
  type KitchenTicket,
  type OutletContext,
  type PrintStation,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { devicePrefs, useDevicePrefs } from '../lib/device-prefs';
import { useOnline } from '../lib/online';
import { useSession } from '../lib/session';
import { DeviceSettings } from './DeviceSettings';

type LaneFilter = 'all' | KitchenStatus;

const LANE_TABS: { id: LaneFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'new', label: 'Baru' },
  { id: 'preparing', label: 'Diproses' },
  { id: 'ready', label: 'Siap' },
];

const ALERT_BADGE: Record<'ok' | 'warn' | 'late', string> = {
  ok: 'cg-badge cg-badge--info',
  warn: 'cg-badge cg-badge--warning',
  late: 'cg-badge cg-badge--danger',
};

const LANE_BADGE: Record<KitchenStatus, string> = {
  new: 'cg-badge cg-badge--accent',
  preparing: 'cg-badge cg-badge--warning',
  ready: 'cg-badge cg-badge--success',
  served: 'cg-badge',
};

/** Layar Tampilan Dapur (KDS) penuh layar per stasiun langsung di aplikasi POS. */
export function KitchenDisplay({
  ctx,
  canSwitchToRegister,
  onSwitchToRegister,
  onLock,
}: {
  ctx: OutletContext;
  canSwitchToRegister: boolean;
  onSwitchToRegister: () => void;
  onLock: () => void;
}) {
  const data = useData();
  const { session } = useSession();
  const prefs = useDevicePrefs();
  const online = useOnline();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [stations, setStations] = useState<PrintStation[]>([]);
  const [lane, setLane] = useState<LaneFilter>('all');
  const [query, setQuery] = useState('');
  const [showServed, setShowServed] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lastSync, setLastSync] = useState('');

  const canEditDevice = accessFor(session.employee.role, 'device_settings') === 'allow';
  const stationId = prefs.kitchenStationId || 'all';

  const loadBoard = useCallback(
    async (silent = false) => {
      if (!silent) {
        setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
      }
      try {
        const [boardTickets, stationList] = await Promise.all([
          data.kitchenBoard(showServed ? 60 : undefined),
          data.listPrintStations(),
        ]);
        setTickets(boardTickets);
        setStations(stationList.filter((s) => s.isActive));
        setStatus('ready');
        setErrorMsg('');
        setNow(new Date());
        setLastSync(
          new Intl.DateTimeFormat('id-ID', {
            timeZone: ctx.timezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date()),
        );
      } catch (e) {
        if (!silent || status !== 'ready') {
          setErrorMsg(e instanceof Error ? e.message : 'Antrean dapur gagal dimuat.');
          setStatus('error');
        }
      }
    },
    [data, showServed, ctx.timezone, status],
  );

  useEffect(() => {
    void loadBoard(false);
    const poll = setInterval(() => void loadBoard(true), 8000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [loadBoard]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* peramban atau mode headless dapat menolak fullscreen */
    }
  }

  async function changeStatus(itemIds: string[], nextStatus: KitchenStatus) {
    if (itemIds.length === 0) return;
    setActionErr('');
    const nextBusy: Record<string, boolean> = {};
    for (const id of itemIds) nextBusy[id] = true;
    setBusyIds((prev) => ({ ...prev, ...nextBusy }));
    try {
      await data.kitchenSetStatus(itemIds, nextStatus);
      await loadBoard(true);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Status pesanan gagal diperbarui.');
    } finally {
      setBusyIds((prev) => {
        const copy = { ...prev };
        for (const id of itemIds) delete copy[id];
        return copy;
      });
    }
  }

  const allStationTickets = useMemo(() => {
    const allRows = tickets.flatMap((t) => t.items);
    const stationRows = filterRowsByStation(allRows, stationId === 'all' ? null : stationId);
    return groupTickets(stationRows);
  }, [tickets, stationId]);

  const counts = useMemo(
    () => ({
      all: allStationTickets.filter((t) => t.lane !== 'served').length,
      new: allStationTickets.filter((t) => t.lane === 'new').length,
      preparing: allStationTickets.filter((t) => t.lane === 'preparing').length,
      ready: allStationTickets.filter((t) => t.lane === 'ready').length,
      served: allStationTickets.filter((t) => t.lane === 'served').length,
    }),
    [allStationTickets],
  );

  const visibleTickets = useMemo(() => {
    const base = showServed
      ? allStationTickets
      : allStationTickets.filter((t) => t.lane !== 'served');
    return filterKitchenTickets(base, { query, lane });
  }, [allStationTickets, showServed, query, lane]);

  const lateCount = useMemo(
    () =>
      allStationTickets.filter(
        (t) => t.lane !== 'served' && kitchenAlert(waitMinutes(t.sentAt, now)) === 'late',
      ).length,
    [allStationTickets, now],
  );

  const activeStation = stations.find((s) => s.id === stationId);

  return (
    <div className="flex flex-col h-screen bg-surface min-w-0">
      {/* Header KDS */}
      <header className="bg-shell-bg text-shell-text border-b border-border flex flex-wrap items-center justify-between gap-8 px-12 py-8 min-h-[56px] shrink-0">
        <div className="flex items-center gap-8 min-w-0">
          <ChefHat className="cg-icon cg-icon--sm shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-sm tablet:text-base font-bold leading-tight truncate">
              Layar Dapur{activeStation ? ` · ${activeStation.name}` : ''}
            </h1>
            <p className="text-[11px] opacity-85 truncate">
              {ctx.outletName} · {session.employee.name} ({formatRole(session.employee.role)})
              {lastSync ? ` · Diperbarui ${lastSync}` : ''}
            </p>
          </div>
          <span
            className="cg-conn hidden tablet:inline-flex"
            aria-label={online ? 'Online' : 'Offline'}
          >
            {online ? <Wifi className="cg-icon cg-icon--xs" aria-hidden /> : <WifiOff className="cg-icon cg-icon--xs" aria-hidden />}
          </span>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          {canSwitchToRegister && (
            <button
              type="button"
              className="px-10 py-6 rounded bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-6 cursor-pointer"
              onClick={onSwitchToRegister}
            >
              <Monitor className="cg-icon cg-icon--xs" aria-hidden />
              <span>Buka Kasir</span>
            </button>
          )}
          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fullscreen ? (
              <Minimize2 className="cg-icon cg-icon--sm" aria-hidden />
            ) : (
              <Maximize2 className="cg-icon cg-icon--sm" aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            onClick={() => void loadBoard(false)}
            aria-label="Perbarui antrean dapur"
            title="Perbarui antrean dapur"
          >
            <RefreshCw className="cg-icon cg-icon--sm" aria-hidden />
          </button>
          {canEditDevice && (
            <button
              type="button"
              className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
              onClick={() => setSettingsOpen(true)}
              aria-label="Pengaturan perangkat"
              title="Pengaturan perangkat"
            >
              <Settings className="cg-icon cg-icon--sm" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            onClick={onLock}
            aria-label="Kunci layar"
            title="Kunci layar"
          >
            <Lock className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>
      </header>

      {/* Toolbar Filter Stasiun, Lajur & Pencarian */}
      <div className="bg-surface-raised border-b border-border px-12 py-8 space-y-8 shrink-0 min-w-0">
        <div className="flex flex-col laptop:flex-row laptop:items-center justify-between gap-8 min-w-0">
          {/* Pilihan Stasiun */}
          <div className="flex items-center gap-6 overflow-x-auto pb-2" role="group" aria-label="Pilih stasiun dapur">
            <button
              type="button"
              className="cg-chip shrink-0"
              aria-pressed={stationId === 'all'}
              onClick={() => devicePrefs.set({ kitchenStationId: 'all' })}
            >
              Semua Stasiun
            </button>
            {stations.map((st) => (
              <button
                key={st.id}
                type="button"
                className="cg-chip shrink-0"
                aria-pressed={stationId === st.id}
                onClick={() => devicePrefs.set({ kitchenStationId: st.id })}
              >
                {st.name}
              </button>
            ))}
          </div>

          {/* Pencarian & Toggle Disajikan */}
          <div className="flex flex-wrap items-center gap-8 min-w-0">
            <div className="cg-search flex-1 tablet:flex-none min-w-[200px]">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <input
                type="search"
                className="cg-input w-full"
                placeholder="Cari nomor, meja, menu, catatan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="cg-chip shrink-0"
              aria-pressed={showServed}
              onClick={() => setShowServed((v) => !v)}
            >
              <span>Disajikan 60 mnt ({counts.served})</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-8 min-w-0">
          <div className="cg-tabs" role="tablist" aria-label="Lajur status pesanan dapur">
            {LANE_TABS.map((t) => {
              const count =
                t.id === 'all'
                  ? counts.all
                  : t.id === 'new'
                    ? counts.new
                    : t.id === 'preparing'
                      ? counts.preparing
                      : counts.ready;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="cg-tab"
                  aria-selected={lane === t.id}
                  onClick={() => setLane(t.id)}
                >
                  {t.label} ({count})
                </button>
              );
            })}
            {showServed && (
              <button
                type="button"
                role="tab"
                className="cg-tab"
                aria-selected={lane === 'served'}
                onClick={() => setLane('served')}
              >
                Disajikan ({counts.served})
              </button>
            )}
          </div>

          {lateCount > 0 && (
            <span className="cg-badge cg-badge--danger">
              <Clock className="cg-icon cg-icon--xs" aria-hidden />
              {lateCount} pesanan melewati 20 menit
            </span>
          )}
        </div>
      </div>

      {/* Area Papan Tiket */}
      <main className="flex-1 overflow-y-auto p-12 min-w-0">
        {status === 'error' && (
          <div className="cg-banner cg-banner--danger mb-12" role="alert">
            <div className="flex-1 min-w-0">
              <strong>Antrean dapur gagal dimuat</strong>
              <p className="mt-2">{errorMsg}</p>
            </div>
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm"
              onClick={() => void loadBoard(false)}
            >
              Muat ulang
            </button>
          </div>
        )}

        {actionErr && (
          <div className="cg-banner cg-banner--danger mb-12" role="alert">
            <div className="flex-1 min-w-0">
              <strong>Perubahan status gagal</strong>
              <p className="mt-2">{actionErr}</p>
            </div>
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm"
              onClick={() => setActionErr('')}
            >
              Tutup
            </button>
          </div>
        )}

        {status === 'loading' ? (
          <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-3 gap-12" aria-label="Memuat papan dapur">
            <div className="cg-skeleton h-36 w-full" />
            <div className="cg-skeleton h-36 w-full" />
            <div className="cg-skeleton h-36 w-full" />
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="cg-empty bg-surface-raised border border-border rounded-lg">
            <ChefHat className="cg-icon" aria-hidden />
            <h3>
              {query.trim() || lane !== 'all'
                ? 'Tidak ada tiket dapur yang cocok'
                : 'Belum ada pesanan di antrean dapur'}
            </h3>
            <p>
              {query.trim() || lane !== 'all'
                ? 'Ubah filter lajur atau kata kunci pencarian untuk melihat tiket lain.'
                : 'Pesanan yang disimpan atau dibayar dari kasir akan otomatis muncul di stasiun terkait.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-3 desktop:grid-cols-4 gap-12 items-start">
            {visibleTickets.map((t) => {
              const mins = waitMinutes(t.sentAt, now);
              const alert = t.lane === 'served' ? 'ok' : kitchenAlert(mins);
              const plan = ticketAdvancePlan(t);
              const ticketBusy = t.items.some((it) => busyIds[it.itemId]);

              return (
                <article
                  key={t.orderId}
                  className="bg-surface-raised border border-border rounded-lg flex flex-col overflow-hidden min-w-0"
                  data-testid="kds-ticket"
                >
                  {/* Kepala Tiket */}
                  <div className="p-12 border-b border-border bg-surface space-y-6">
                    <div className="flex items-start justify-between gap-8">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-6">
                          <h2 className="text-sm font-bold text-text truncate">{t.orderNumber}</h2>
                          {t.queueNo !== undefined && (
                            <span className="cg-badge">Antrean #{t.queueNo}</span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-2">
                          {orderTypeLabel(t.orderType)}
                          {t.tableName ? ` · Meja ${t.tableName}` : ''}
                          {t.guestCount ? ` · ${t.guestCount} tamu` : ''}
                        </p>
                      </div>
                      <span className={ALERT_BADGE[alert]}>
                        <Clock className="cg-icon cg-icon--xs" aria-hidden />
                        {mins} mnt
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-6">
                      <span className={LANE_BADGE[t.lane]}>{KITCHEN_STATUS_LABEL[t.lane]}</span>
                      {t.label && <span className="text-xs font-medium text-text truncate">{t.label}</span>}
                    </div>
                  </div>

                  {/* Daftar Item Tiket */}
                  <ul className="divide-y divide-border px-12 flex-1">
                    {t.items.map((it) => {
                      const next = KITCHEN_NEXT[it.status];
                      const nextLabel = KITCHEN_NEXT_LABEL[it.status];
                      const prev = KITCHEN_PREV[it.status];
                      const rowBusy = !!busyIds[it.itemId];

                      return (
                        <li key={it.itemId} className="py-8 space-y-6 text-xs">
                          <div className="flex items-start justify-between gap-8">
                            <div className="min-w-0">
                              <p className="font-semibold text-text text-sm">
                                {it.qty}× {it.name}
                              </p>
                              {it.extras.length > 0 && (
                                <p className="text-text-muted mt-2">
                                  + {it.extras.map((ex) => `${ex.name}${ex.qty > 1 ? ` ×${ex.qty}` : ''}`).join(', ')}
                                </p>
                              )}
                              {it.note && (
                                <p className="mt-4 px-8 py-4 rounded bg-warning-soft text-warning-strong font-medium">
                                  Catatan: {it.note}
                                </p>
                              )}
                            </div>
                            <span className={LANE_BADGE[it.status]}>{KITCHEN_STATUS_LABEL[it.status]}</span>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-6">
                            {prev && (
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                disabled={rowBusy}
                                onClick={() => void changeStatus([it.itemId], prev)}
                                aria-label={`Mundurkan status ${it.name}`}
                              >
                                <RotateCcw className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Mundur</span>
                              </button>
                            )}
                            {next && nextLabel && (
                              <button
                                type="button"
                                className="cg-btn cg-btn--secondary cg-btn--sm"
                                disabled={rowBusy}
                                onClick={() => void changeStatus([it.itemId], next)}
                              >
                                {nextLabel}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Tombol Aksi Utama Tiket */}
                  {plan && (
                    <div className="p-12 border-t border-border bg-surface">
                      <button
                        type="button"
                        className="cg-btn cg-btn--primary cg-btn--block"
                        disabled={ticketBusy}
                        onClick={() => void changeStatus(plan.itemIds, plan.nextStatus)}
                      >
                        {plan.label} ({plan.itemIds.length} item)
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      {settingsOpen && <DeviceSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

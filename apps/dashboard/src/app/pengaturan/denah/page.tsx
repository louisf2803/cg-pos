'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LayoutGrid,
  ListFilter,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { formatRp, type DiningTable, type Floor, type TableStatus } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg =
  | { kind: 'floor'; item?: Floor }
  | { kind: 'table'; floorId: string; item?: DiningTable }
  | { kind: 'del-floor'; item: Floor; count: number }
  | { kind: 'del-table'; item: DiningTable };

const INACTIVE_STORAGE_KEY = 'cgpos_inactive_tables';

function loadInactiveTableIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(INACTIVE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveInactiveTableIds(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INACTIVE_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage quota error
  }
}

function fmtOrderTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(d) + ' WIB';
  } catch {
    return isoString;
  }
}

export default function DenahDanMeja() {
  const data = useData();

  const [viewTab, setViewTab] = useState<'denah' | 'daftar'>('denah');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<TableStatus | null>(null);
  const [inactiveTableIds, setInactiveTableIds] = useState<Set<string>>(() =>
    loadInactiveTableIds()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const lastFocusedElRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const st = useAsync(async () => {
    const [floors, tables, statuses] = await Promise.all([
      data.listFloors(),
      data.listTables(),
      data.listTableStatus(),
    ]);
    return { floors, tables, statuses };
  }, [data]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await st.reload();
    setIsRefreshing(false);
  };

  // Auto-refresh every 30 seconds, pause when tab hidden
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        st.reload();
      }
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        st.reload();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [st]);

  // Handle drawer Escape key and focus return
  useEffect(() => {
    if (!selectedTable) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Focus close button on mount
    const timer = setTimeout(() => {
      const closeBtn = drawerRef.current?.querySelector<HTMLButtonElement>('button[data-close]');
      closeBtn?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [selectedTable]);

  const openDrawer = (table: TableStatus, triggerEl: HTMLElement) => {
    lastFocusedElRef.current = triggerEl;
    setSelectedTable(table);
  };

  const closeDrawer = () => {
    setSelectedTable(null);
    if (lastFocusedElRef.current) {
      lastFocusedElRef.current.focus();
    }
  };

  const toggleTableActiveStatus = (tableId: string) => {
    setInactiveTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      saveInactiveTableIds(next);
      return next;
    });
  };

  const done = () => {
    setDlg(null);
    closeDrawer();
    st.reload();
  };

  const floors = st.status === 'ready' ? st.data.floors : [];
  const allTables = st.status === 'ready' ? st.data.statuses : [];

  const getTableEffectiveStatus = (t: TableStatus): 'kosong' | 'terisi' | 'nonaktif' => {
    if (t.order) return 'terisi';
    if (inactiveTableIds.has(t.id)) return 'nonaktif';
    return 'kosong';
  };

  // Filtered tables based on floor
  const displayedTables = useMemo(() => {
    if (selectedFloorId === 'all') return allTables;
    return allTables.filter((t) => t.floorId === selectedFloorId);
  }, [allTables, selectedFloorId]);

  // Summary counts
  const totalKosong = useMemo(
    () => allTables.filter((t) => getTableEffectiveStatus(t) === 'kosong').length,
    [allTables, inactiveTableIds]
  );
  const totalTerisi = useMemo(
    () => allTables.filter((t) => getTableEffectiveStatus(t) === 'terisi').length,
    [allTables, inactiveTableIds]
  );
  const totalNonaktif = useMemo(
    () => allTables.filter((t) => getTableEffectiveStatus(t) === 'nonaktif').length,
    [allTables, inactiveTableIds]
  );

  const displayedKosong = useMemo(
    () => displayedTables.filter((t) => getTableEffectiveStatus(t) === 'kosong').length,
    [displayedTables, inactiveTableIds]
  );
  const displayedTerisi = useMemo(
    () => displayedTables.filter((t) => getTableEffectiveStatus(t) === 'terisi').length,
    [displayedTables, inactiveTableIds]
  );
  const displayedNonaktif = useMemo(
    () => displayedTables.filter((t) => getTableEffectiveStatus(t) === 'nonaktif').length,
    [displayedTables, inactiveTableIds]
  );

  return (
    <>
      <PageHeader
        title="Denah dan meja"
        subtitle="Lantai dan meja yang dipilih kasir untuk pesanan makan di tempat"
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setDlg({ kind: 'floor' })}
          >
            <Plus className="cg-icon" aria-hidden /> Tambah lantai
          </button>
        }
      />

      {/* Tabs and Controls */}
      <div className="flex items-center justify-between gap-12 mb-16 flex-wrap min-w-0">
        <div className="cg-tabs" role="tablist" aria-label="Mode Tampilan">
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'denah'}
            className={`cg-tab ${viewTab === 'denah' ? 'cg-tab--active' : ''}`}
            onClick={() => setViewTab('denah')}
          >
            <LayoutGrid className="w-16 h-16 inline mr-6 shrink-0" aria-hidden /> Denah
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'daftar'}
            className={`cg-tab ${viewTab === 'daftar' ? 'cg-tab--active' : ''}`}
            onClick={() => setViewTab('daftar')}
          >
            <ListFilter className="w-16 h-16 inline mr-6 shrink-0" aria-hidden /> Daftar
          </button>
        </div>

        <div className="flex items-center gap-8">
          {viewTab === 'denah' && (
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm flex items-center gap-6"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Segarkan status meja (otomatis tiap 30 detik)"
            >
              <RotateCw className={`w-14 h-14 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
              Muat ulang
            </button>
          )}
        </div>
      </div>

      {st.status === 'error' && (
        <ErrorBox message={st.message} onRetry={st.reload} />
      )}

      {st.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat denah">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[72px]" />
            ))}
          </div>
          <div className="grid grid-cols-2 tablet:grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-10 tablet:gap-12">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="cg-skeleton h-[120px] rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {st.status === 'ready' && (
        <>
          {floors.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada lantai.</strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                Tambahkan lantai pertama Anda untuk mulai mengatur tata letak meja.
              </p>
              <button
                type="button"
                className="cg-btn cg-btn--primary mt-8"
                onClick={() => setDlg({ kind: 'floor' })}
              >
                Tambah lantai pertama
              </button>
            </div>
          ) : viewTab === 'denah' ? (
            /* =================== DENAH VISUAL VIEW =================== */
            <div className="space-y-16 min-w-0">
              {/* Floor Chips Bar */}
              <div
                className="flex items-center gap-8 overflow-x-auto pb-4 no-scrollbar min-w-0"
                role="tablist"
                aria-label="Filter Lantai"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedFloorId === 'all'}
                  className={`px-12 py-6 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedFloorId === 'all'
                      ? 'bg-accent text-accent-contrast shadow-xs font-bold'
                      : 'bg-surface-raised border border-border text-text hover:bg-surface-muted'
                  }`}
                  onClick={() => setSelectedFloorId('all')}
                >
                  Semua lantai ({allTables.length})
                </button>
                {floors.map((f) => {
                  const count = allTables.filter((t) => t.floorId === f.id).length;
                  const isSel = selectedFloorId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={isSel}
                      className={`px-12 py-6 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                        isSel
                          ? 'bg-accent text-accent-contrast shadow-xs font-bold'
                          : 'bg-surface-raised border border-border text-text hover:bg-surface-muted'
                      }`}
                      onClick={() => setSelectedFloorId(f.id)}
                    >
                      {f.name} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 min-w-0">
                <div className="p-10 rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium">Total Meja</span>
                  <strong className="text-lg font-bold cg-num text-text mt-2">
                    {displayedTables.length}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-2 truncate">
                      Keseluruhan: {allTables.length} meja
                    </span>
                  )}
                </div>

                <div className="p-10 rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-accent inline-block shrink-0" />
                    Kosong
                  </span>
                  <strong className="text-lg font-bold cg-num text-accent-strong mt-2">
                    {displayedKosong}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-2 truncate">
                      Keseluruhan: {totalKosong}
                    </span>
                  )}
                </div>

                <div className="p-10 rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-warning-strong inline-block shrink-0" />
                    Terisi
                  </span>
                  <strong className="text-lg font-bold cg-num text-warning-strong mt-2">
                    {displayedTerisi}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-2 truncate">
                      Keseluruhan: {totalTerisi}
                    </span>
                  )}
                </div>

                <div className="p-10 rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-border inline-block shrink-0" />
                    Nonaktif
                  </span>
                  <strong className="text-lg font-bold cg-num text-text-muted mt-2">
                    {displayedNonaktif}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-2 truncate">
                      Keseluruhan: {totalNonaktif}
                    </span>
                  )}
                </div>
              </div>

              {/* Table Grid */}
              {displayedTables.length === 0 ? (
                <div className="cg-empty py-24">
                  <p>
                    <strong>Belum ada meja di lantai ini.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Tambahkan meja baru untuk mulai menyusun denah.
                  </p>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm mt-8"
                    onClick={() =>
                      setDlg({
                        kind: 'table',
                        floorId:
                          selectedFloorId === 'all'
                            ? floors[0]?.id ?? ''
                            : selectedFloorId,
                      })
                    }
                  >
                    <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah meja
                  </button>
                </div>
              ) : (
                <div
                  className="grid grid-cols-2 tablet:grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-10 tablet:gap-12 min-w-0"
                  aria-label="Grid Meja Denah"
                >
                  {displayedTables.map((t) => {
                    const status = getTableEffectiveStatus(t);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => openDrawer(t, e.currentTarget)}
                        className={`p-12 rounded-xl border text-left flex flex-col justify-between min-h-[110px] sm:min-h-[120px] transition-all hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                          status === 'terisi'
                            ? 'bg-warning/5 border-warning/40 hover:border-warning'
                            : status === 'nonaktif'
                            ? 'bg-surface-muted/40 border-border opacity-70 hover:opacity-100'
                            : 'bg-surface-raised border-border hover:border-accent'
                        }`}
                        aria-label={`Meja ${t.name}, status ${status}${
                          status === 'terisi' ? `, pesanan ${t.order?.number}` : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <strong
                            className="text-sm sm:text-base font-bold text-text block truncate mb-4"
                            title={t.name}
                          >
                            {t.name}
                          </strong>
                          <div className="flex items-center gap-4 text-xs text-text-muted mb-8">
                            <Users className="w-14 h-14 shrink-0" aria-hidden />
                            <span className="cg-num">
                              {(t as unknown as { capacity?: number }).capacity ?? 4} kursi
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          {status === 'kosong' && (
                            <span className="cg-badge cg-badge--success text-[11px] font-semibold">
                              Kosong
                            </span>
                          )}
                          {status === 'terisi' && (
                            <div className="min-w-0">
                              <span className="cg-badge cg-badge--warning text-[11px] font-semibold mb-2 block w-fit">
                                Terisi
                              </span>
                              <div
                                className="text-xs font-bold text-text cg-num truncate"
                                title={`${t.order?.number} (${formatRp(t.order?.total ?? 0)})`}
                              >
                                {t.order?.number}
                              </div>
                              <div className="text-[11px] font-semibold text-text-muted cg-num truncate">
                                {formatRp(t.order?.total ?? 0)}
                              </div>
                            </div>
                          )}
                          {status === 'nonaktif' && (
                            <span className="cg-badge text-[11px] text-text-muted border border-border font-semibold">
                              Nonaktif
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* =================== DAFTAR LIST VIEW =================== */
            <div className="grid gap-24 grid-cols-1 min-w-0">
              {floors.map((f) => {
                const mine = st.data.tables.filter((t) => t.floorId === f.id);
                return (
                  <section
                    key={f.id}
                    className="min-w-0 border border-border rounded-lg bg-surface-raised p-16"
                    aria-labelledby={`f-${f.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-8 mb-12">
                      <h2 id={`f-${f.id}`} className="text-lg font-bold break-words">
                        {f.name}
                      </h2>
                      <span className="text-text-muted text-sm">{mine.length} meja</span>
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        aria-label={`Ubah lantai ${f.name}`}
                        onClick={() => setDlg({ kind: 'floor', item: f })}
                      >
                        <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        aria-label={`Hapus lantai ${f.name}`}
                        onClick={() =>
                          setDlg({ kind: 'del-floor', item: f, count: mine.length })
                        }
                      >
                        <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm ml-auto"
                        onClick={() => setDlg({ kind: 'table', floorId: f.id })}
                      >
                        <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah meja
                      </button>
                    </div>
                    {mine.length === 0 ? (
                      <p className="text-text-muted text-sm">Belum ada meja di lantai ini.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-8">
                        {mine.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center border border-border rounded-md bg-surface pl-12"
                          >
                            <span className="break-words max-w-[160px] text-sm font-medium">
                              {t.name}
                            </span>
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              aria-label={`Ubah meja ${t.name} (${f.name})`}
                              onClick={() =>
                                setDlg({ kind: 'table', floorId: f.id, item: t })
                              }
                            >
                              <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              aria-label={`Hapus meja ${t.name} (${f.name})`}
                              onClick={() => setDlg({ kind: 'del-table', item: t })}
                            >
                              <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* =================== DETAIL DRAWER (SIDE PANEL) =================== */}
      {selectedTable && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 transition-opacity backdrop-blur-xs"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Detail Meja ${selectedTable.name}`}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm sm:max-w-md bg-surface-raised border-l border-border z-50 p-20 shadow-xl overflow-y-auto flex flex-col justify-between"
            tabIndex={-1}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border pb-12 mb-16">
                <div>
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                    Detail Meja
                  </span>
                  <h2 className="text-xl font-bold text-text truncate max-w-[240px]">
                    {selectedTable.name}
                  </h2>
                </div>
                <button
                  type="button"
                  data-close
                  onClick={closeDrawer}
                  className="cg-btn cg-btn--ghost cg-btn--sm p-6"
                  aria-label="Tutup detail meja"
                >
                  <X className="w-18 h-18 text-text-muted" aria-hidden />
                </button>
              </div>

              {/* Status and Floor */}
              <div className="grid gap-12 mb-20">
                <div className="flex items-center justify-between text-sm py-4 border-b border-border/60">
                  <span className="text-text-muted">Lantai</span>
                  <span className="font-semibold text-text">
                    {floors.find((f) => f.id === selectedTable.floorId)?.name ?? '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm py-4 border-b border-border/60">
                  <span className="text-text-muted">Kapasitas</span>
                  <span className="font-semibold text-text flex items-center gap-4 cg-num">
                    <Users className="w-14 h-14 text-text-muted" aria-hidden />
                    {(selectedTable as unknown as { capacity?: number }).capacity ?? 4} kursi
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm py-4 border-b border-border/60">
                  <span className="text-text-muted">Status Saat Ini</span>
                  <div>
                    {getTableEffectiveStatus(selectedTable) === 'kosong' && (
                      <span className="cg-badge cg-badge--success text-xs font-semibold flex items-center gap-4">
                        <CheckCircle2 className="w-12 h-12" aria-hidden /> Kosong
                      </span>
                    )}
                    {getTableEffectiveStatus(selectedTable) === 'terisi' && (
                      <span className="cg-badge cg-badge--warning text-xs font-semibold flex items-center gap-4">
                        <AlertCircle className="w-12 h-12" aria-hidden /> Terisi
                      </span>
                    )}
                    {getTableEffectiveStatus(selectedTable) === 'nonaktif' && (
                      <span className="cg-badge text-xs text-text-muted border border-border font-semibold flex items-center gap-4">
                        Nonaktif
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Order Details (if occupied) */}
              {selectedTable.order ? (
                <div className="p-16 rounded-xl border border-warning/40 bg-warning/5 space-y-10 mb-20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-warning-strong flex items-center gap-6">
                      <Clock className="w-14 h-14" aria-hidden /> Pesanan Aktif
                    </span>
                    <span className="text-xs font-semibold cg-num text-text-muted">
                      {fmtOrderTime(selectedTable.order.openedAt)}
                    </span>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-warning/20">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Nomor Pesanan:</span>
                      <strong className="font-bold text-text cg-num">
                        {selectedTable.order.number}
                      </strong>
                    </div>

                    {selectedTable.order.label && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Nama / Label:</span>
                        <span className="font-medium text-text">
                          {selectedTable.order.label}
                        </span>
                      </div>
                    )}

                    {selectedTable.order.guestCount !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Jumlah Tamu:</span>
                        <span className="font-medium text-text cg-num">
                          {selectedTable.order.guestCount} orang
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm pt-4 border-t border-warning/20">
                      <span className="text-text font-medium">Total Sementara:</span>
                      <strong className="text-base font-bold text-accent-strong cg-num">
                        {formatRp(selectedTable.order.total)}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-14 rounded-xl border border-border bg-surface text-sm text-text-muted mb-20">
                  {getTableEffectiveStatus(selectedTable) === 'nonaktif' ? (
                    <p>Meja ini sedang dinonaktifkan sehingga tidak dapat dipilih kasir.</p>
                  ) : (
                    <p>Meja siap digunakan untuk pesanan makan di tempat baru di kasir.</p>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="pt-16 border-t border-border flex flex-col gap-8">
              <button
                type="button"
                className="cg-btn cg-btn--primary w-full flex items-center justify-center gap-6"
                onClick={() => {
                  setDlg({
                    kind: 'table',
                    floorId: selectedTable.floorId ?? '',
                    item: selectedTable,
                  });
                }}
              >
                <Pencil className="w-16 h-16" aria-hidden /> Ubah meja
              </button>

              <button
                type="button"
                className="cg-btn cg-btn--secondary w-full"
                onClick={() => toggleTableActiveStatus(selectedTable.id)}
              >
                {inactiveTableIds.has(selectedTable.id)
                  ? 'Aktifkan Meja'
                  : 'Nonaktifkan Meja'}
              </button>

              <button
                type="button"
                className="cg-btn cg-btn--ghost w-full"
                onClick={closeDrawer}
              >
                Tutup
              </button>
            </div>
          </div>
        </>
      )}

      {/* Existing Modals */}
      {dlg && (dlg.kind === 'floor' || dlg.kind === 'table') && (
        <NameDialog
          dlg={dlg}
          floors={st.status === 'ready' ? st.data.floors : []}
          onClose={() => setDlg(null)}
          onSaved={done}
        />
      )}
      {dlg && (dlg.kind === 'del-floor' || dlg.kind === 'del-table') && (
        <DeleteDialog dlg={dlg} onClose={() => setDlg(null)} onDeleted={done} />
      )}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

function NameDialog({
  dlg,
  floors,
  onClose,
  onSaved,
}: {
  dlg: Extract<Dlg, { kind: 'floor' | 'table' }>;
  floors: Floor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const ref = useModal();
  const isTable = dlg.kind === 'table';
  const [name, setName] = useState(dlg.item?.name ?? '');
  const [floorId, setFloorId] = useState(dlg.kind === 'table' ? dlg.floorId : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = isTable ? 'meja' : 'lantai';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError(`Nama ${noun} wajib diisi.`);
    setBusy(true);
    setError(null);
    try {
      if (isTable) await data.saveTable({ id: dlg.item?.id, floorId, name });
      else await data.saveFloor({ id: dlg.item?.id, name });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-denah"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <form onSubmit={submit} className="grid gap-16" noValidate>
        <h2 id="judul-denah" className="cg-modal__title">
          {dlg.item ? 'Ubah' : 'Tambah'} {noun}
        </h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama-denah">
            Nama {noun}
          </label>
          <input
            id="nama-denah"
            className="cg-input"
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {isTable && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="lantai-denah">
              Lantai
            </label>
            <select
              id="lantai-denah"
              className="cg-input"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">
          {error}
        </p>
        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({
  dlg,
  onClose,
  onDeleted,
}: {
  dlg: Extract<Dlg, { kind: 'del-floor' | 'del-table' }>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const data = useData();
  const ref = useModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isFloor = dlg.kind === 'del-floor';

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (isFloor) await data.deleteFloor(dlg.item.id);
      else await data.deleteTable(dlg.item.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-hapus-denah"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <div className="grid gap-16">
        <h2 id="judul-hapus-denah" className="cg-modal__title">
          Hapus {isFloor ? 'lantai' : 'meja'} “{dlg.item.name}”?
        </h2>
        <p className="cg-modal__body">
          {isFloor
            ? dlg.count > 0
              ? `${dlg.count} meja di lantai ini ikut terhapus.`
              : 'Lantai ini kosong.'
            : 'Pesanan lama yang memakai meja ini tetap tersimpan di laporan.'}
        </p>
        <p role="alert" className="min-h-[24px] text-danger-strong">
          {error}
        </p>
        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

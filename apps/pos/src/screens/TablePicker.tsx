
import { useEffect, useMemo, useState } from 'react';
import {
  findGroupForTable,
  formatRp,
  resolveTableColorStatus,
  TABLE_COLOR_CONFIG,
  type TableGroup,
  type TableSettings,
  type TableStatus,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

const SEATED_STORAGE_KEY = 'cgpos_pos_seated_tables';
const BILL_PRINTED_STORAGE_KEY = 'cgpos_pos_bill_printed_tables';
const TABLE_SETTINGS_STORAGE_KEY = 'cgpos_table_settings';

function loadStoredSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveStoredSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage errors
  }
}

function loadTableSettings(): Record<string, TableSettings> {
  try {
    const raw = localStorage.getItem(TABLE_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

/** Pilih meja dengan status 6-warna Majoo: Kosong, Tamu Duduk, Terisi, Tagihan Dicetak, Waktu Menipis, Waktu Habis. */
export function TablePicker({
  currentTableId,
  canResume,
  onPick,
  onResume,
  onClose,
}: {
  currentTableId?: string;
  canResume: boolean;
  onPick: (t: TableStatus) => void;
  onResume: (t: TableStatus) => void;
  onClose: () => void;
}) {
  const data = useData();
  const st = useAsync(
    async () => ({
      floors: await data.listFloors(),
      tables: await data.listTableStatus(),
    }),
    [data],
  );
  const [floor, setFloor] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [groups] = useState<TableGroup[]>(() => {
    try {
      const raw = localStorage.getItem('cgpos_pos_table_groups');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [seatedIds, setSeatedIds] = useState<Set<string>>(() => loadStoredSet(SEATED_STORAGE_KEY));
  const [billPrintedIds, setBillPrintedIds] = useState<Set<string>>(() =>
    loadStoredSet(BILL_PRINTED_STORAGE_KEY),
  );
  const [settingsMap] = useState<Record<string, TableSettings>>(() => loadTableSettings());

  useEffect(() => {
    saveStoredSet(SEATED_STORAGE_KEY, seatedIds);
  }, [seatedIds]);

  useEffect(() => {
    saveStoredSet(BILL_PRINTED_STORAGE_KEY, billPrintedIds);
  }, [billPrintedIds]);

  const toggleSeated = (tableId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSeatedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const toggleBillPrinted = (tableId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBillPrintedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const floors = st.status === 'ready' ? st.data.floors : [];
  const active = floor ?? floors[0]?.id ?? null;
  const shown = useMemo(
    () =>
      st.status === 'ready'
        ? st.data.tables.filter((t) => (active ? t.floorId === active : true))
        : [],
    [st, active],
  );

  return (
    <Modal title="Pilih Meja" onClose={onClose}>
      {st.status === 'loading' && (
        <div className="grid gap-8" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}
      {st.status === 'error' && (
        <div className="cg-banner cg-banner--danger" role="alert">
          <span>Meja gagal dimuat. {st.message}</span>
          <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={st.reload}>
            Coba lagi
          </button>
        </div>
      )}
      {st.status === 'ready' && floors.length === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Belum ada meja.</strong>
          </p>
          <p className="text-text-muted">
            Tambahkan lantai dan meja di dashboard, menu Denah dan meja.
          </p>
        </div>
      )}
      {st.status === 'ready' && floors.length > 0 && (
        <>
          <div className="cg-tabs mb-12" role="tablist" aria-label="Lantai">
            {floors.map((f) => (
              <button
                key={f.id}
                role="tab"
                className="cg-tab"
                aria-selected={active === f.id}
                onClick={() => {
                  setFloor(f.id);
                  setHint('');
                }}
              >
                {f.name}
              </button>
            ))}
          </div>

          {/* Legenda 6 Status Warna Meja Majoo */}
          <div
            className="flex flex-wrap items-center gap-8 p-8 rounded-lg bg-surface-muted border border-border mb-12 text-xs"
            aria-label="Legenda status meja"
          >
            <span className="font-semibold text-text-muted">Status:</span>
            {Object.values(TABLE_COLOR_CONFIG).map((cfg) => (
              <span key={cfg.status} className="flex items-center gap-4">
                <span
                  className="w-8 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.hexColor }}
                  aria-hidden
                />
                <span className="text-text-muted">{cfg.label}</span>
              </span>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-text-muted">Belum ada meja di lantai ini.</p>
          ) : (
            <ul
              className="grid gap-8"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
              aria-label="Meja"
            >
              {shown.map((t) => {
                const busy = !!t.order;
                const mine = t.id === currentTableId;
                const isSeated = !busy && seatedIds.has(t.id);
                const isBillPrinted = busy && billPrintedIds.has(t.id);
                const colorInfo = resolveTableColorStatus({
                  table: t,
                  settings: settingsMap[t.id],
                  isSeated,
                  isBillPrinted,
                });

                return (
                  <li key={t.id} className="relative">
                    <button
                      className={`cg-btn cg-btn--block p-8 ${
                        mine ? 'cg-btn--primary' : 'cg-btn--secondary'
                      }`}
                      style={{
                        minHeight: 88,
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        borderLeft: `4px solid ${colorInfo.hexColor}`,
                      }}
                      aria-pressed={mine}
                      aria-label={
                        busy
                          ? `Meja ${t.name}, ${colorInfo.label}, pesanan ${t.order!.number}, ${formatRp(
                              t.order!.total,
                            )}`
                          : `Meja ${t.name}, ${colorInfo.label}${mine ? ', dipilih' : ''}`
                      }
                      onClick={() => {
                        if (!busy || (mine && t.order)) {
                          if (!busy) onPick(t);
                          else onClose();
                          return;
                        }
                        if (canResume) onResume(t);
                        else
                          setHint(
                            `Meja ${t.name} sedang dipakai. Simpan atau kosongkan pesanan yang sedang dibuat dulu untuk membukanya.`,
                          );
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <strong className="text-sm">{t.name}</strong>
                        {mine && (
                          <span className="text-xs font-semibold text-accent">Dipilih</span>
                        )}
                      </div>
                      {findGroupForTable(t.id, groups) && (
                        <span className="text-[10px] text-accent font-semibold truncate block">
                          Grup: {findGroupForTable(t.id, groups)!.name}
                        </span>
                      )}

                      <div className="my-4 flex items-center justify-between w-full">
                        <span
                          className="px-6 py-[2px] rounded text-xs font-semibold"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${colorInfo.hexColor} 18%, transparent)`,
                            color: colorInfo.hexColor,
                          }}
                        >
                          {colorInfo.label}
                        </span>
                        {busy && (
                          <span className="text-xs cg-num font-medium">
                            {formatRp(t.order!.total)}
                          </span>
                        )}
                      </div>

                      {/* Tombol Aksi Cepat Tamu Duduk / Struk Sementara */}
                      <div className="mt-auto pt-4 border-t border-border/40 flex items-center justify-between text-xs">
                        {!busy ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className="text-xs text-text-muted hover:text-accent cursor-pointer"
                            onClick={(e) => toggleSeated(t.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSeated(t.id, e as unknown as React.MouseEvent);
                              }
                            }}
                          >
                            {isSeated ? 'Tamu Duduk \u2713' : '+ Tamu Duduk'}
                          </span>
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            className="text-xs text-text-muted hover:text-accent cursor-pointer"
                            onClick={(e) => toggleBillPrinted(t.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleBillPrinted(t.id, e as unknown as React.MouseEvent);
                              }
                            }}
                          >
                            {isBillPrinted ? 'Struk Dicetak \u2713' : 'Cetak Struk'}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hint && (
            <p role="alert" className="text-danger-strong mt-12">
              {hint}
            </p>
          )}
        </>
      )}
      <div className="cg-modal__actions">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Modal>
  );
}

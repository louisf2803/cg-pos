'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LayoutGrid,
  ListFilter,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  MAX_TABLE_LABEL_LENGTH,
  TABLE_COLOR_CONFIG,
  clampTablePosition,
  createDecorElement,
  defaultGridPositions,
  formatRp,
  newId,
  resolveTableColorStatus,
  sanitizeDecorElements,
  sanitizeTableSettings,
  summarizeTableSettings,
  tableSettingsProblem,
  type CustomTableShape,
  type DecorElement,
  type DecorElementType,
  type DiningTable,
  type Floor,
  type FloorLayoutMode,
  type MinBillBehavior,
  type TableColorInfo,
  type TableColorStatus,
  type TablePosition,
  type TableSettings,
  type TableStatus,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useShell } from '@/components/shell-context';

type Dlg =
  | { kind: 'floor'; item?: Floor }
  | { kind: 'table'; floorId: string; item?: DiningTable; defaultShape?: CustomTableShape }
  | { kind: 'del-floor'; item: Floor; count: number }
  | { kind: 'del-table'; item: DiningTable };

const INACTIVE_STORAGE_KEY = 'cgpos_inactive_tables';
const LAYOUT_MODE_STORAGE_KEY = 'cgpos_floor_layout_mode';
const TABLE_POSITIONS_STORAGE_KEY = 'cgpos_custom_table_positions';
const TABLE_SETTINGS_STORAGE_KEY = 'cgpos_table_settings';
const TABLE_SHAPES_STORAGE_KEY = 'cgpos_custom_table_shapes';
const DECOR_ELEMENTS_STORAGE_KEY = 'cgpos_custom_decor_elements';
const FLOOR_BG_STORAGE_KEY = 'cgpos_floor_backgrounds';

const MIN_BILL_MODES: readonly { value: MinBillBehavior; label: string; desc: string }[] = [
  {
    value: 'wajib',
    label: 'Wajib dipenuhi',
    desc: 'Pembayaran di kasir belum dapat diselesaikan sebelum total tagihan mencapai nominal minimum.',
  },
  {
    value: 'izinkan',
    label: 'Izinkan di bawah minimum',
    desc: 'Kasir tetap dapat memproses pembayaran di bawah batas minimum dengan catatan informasi saja.',
  },
  {
    value: 'tambah_selisih',
    label: 'Tambahkan selisih otomatis',
    desc: 'Selisih antara nominal minimum dan total tagihan otomatis ditambahkan sebagai biaya tambahan.',
  },
];

const DECOR_LABEL_MAP: Record<DecorElementType, string> = {
  tanaman: 'Tanaman',
  dinding: 'Dinding',
  pintu: 'Pintu',
};

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota error
  }
}

function loadLayoutModes(): Record<string, FloorLayoutMode> {
  const parsed = readJsonStorage<Record<string, unknown>>(LAYOUT_MODE_STORAGE_KEY, {});
  const out: Record<string, FloorLayoutMode> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === 'grid' || v === 'custom') out[k] = v;
  }
  return out;
}

function loadTablePositions(): Record<string, TablePosition> {
  const parsed = readJsonStorage<Record<string, unknown>>(TABLE_POSITIONS_STORAGE_KEY, {});
  const out: Record<string, TablePosition> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as TablePosition).xPct === 'number' &&
      typeof (v as TablePosition).yPct === 'number'
    ) {
      out[k] = clampTablePosition(v as TablePosition);
    }
  }
  return out;
}

function loadAllTableSettings(): Record<string, TableSettings> {
  const parsed = readJsonStorage<Record<string, unknown>>(TABLE_SETTINGS_STORAGE_KEY, {});
  const out: Record<string, TableSettings> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === 'object') {
      out[k] = sanitizeTableSettings(v as Partial<TableSettings>);
    }
  }
  return out;
}

function loadTableShapes(): Record<string, CustomTableShape> {
  const parsed = readJsonStorage<Record<string, unknown>>(TABLE_SHAPES_STORAGE_KEY, {});
  const out: Record<string, CustomTableShape> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === 'persegi' || v === 'persegi_panjang' || v === 'bulat') {
      out[k] = v;
    }
  }
  return out;
}

function loadDecorElements(): DecorElement[] {
  const parsed = readJsonStorage<unknown>(DECOR_ELEMENTS_STORAGE_KEY, []);
  return sanitizeDecorElements(parsed);
}

function loadFloorBackgrounds(): Record<string, string> {
  return readJsonStorage<Record<string, string>>(FLOOR_BG_STORAGE_KEY, {});
}

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
  const { selectedOutlet } = useShell();
  const outletKey = selectedOutlet || 'semua';

  const [viewTab, setViewTab] = useState<'denah' | 'daftar'>('denah');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<TableStatus | null>(null);
  const [inactiveTableIds, setInactiveTableIds] = useState<Set<string>>(() =>
    loadInactiveTableIds()
  );
  const [layoutModes, setLayoutModes] = useState<Record<string, FloorLayoutMode>>(() =>
    loadLayoutModes()
  );
  const [draftPositions, setDraftPositions] = useState<Record<string, TablePosition>>(() =>
    loadTablePositions()
  );
  const [hasUnsavedPositions, setHasUnsavedPositions] = useState(false);
  const [positionStatusMsg, setPositionStatusMsg] = useState<string | null>(null);

  const [tableSettingsMap, setTableSettingsMap] = useState<Record<string, TableSettings>>(() =>
    loadAllTableSettings()
  );
  const [tableShapes, setTableShapes] = useState<Record<string, CustomTableShape>>(() =>
    loadTableShapes()
  );
  const [decorElements, setDecorElements] = useState<DecorElement[]>(() =>
    loadDecorElements()
  );
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [draggingDecorId, setDraggingDecorId] = useState<string | null>(null);
  const [draftSettings, setDraftSettings] = useState<TableSettings>(() =>
    sanitizeTableSettings()
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [floorBackgrounds, setFloorBackgrounds] = useState<Record<string, string>>(() =>
    loadFloorBackgrounds()
  );
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  const lastFocusedElRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const layoutMode: FloorLayoutMode = layoutModes[outletKey] ?? 'grid';

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
    setDraftSettings(sanitizeTableSettings(tableSettingsMap[table.id]));
    setSettingsError(null);
    setSettingsSavedMsg(null);
  };

  const closeDrawer = () => {
    setSelectedTable(null);
    setSettingsError(null);
    setSettingsSavedMsg(null);
    if (lastFocusedElRef.current) {
      lastFocusedElRef.current.focus();
    }
  };

  const handleLayoutModeChange = (nextMode: FloorLayoutMode) => {
    setLayoutModes((prev) => {
      const updated = { ...prev, [outletKey]: nextMode };
      writeJsonStorage(LAYOUT_MODE_STORAGE_KEY, updated);
      return updated;
    });
    setViewTab('denah');
    setPositionStatusMsg(null);
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

  const activeFloorId =
    selectedFloorId !== 'all' ? selectedFloorId : floors[0]?.id ?? 'default';
  const currentFloorBg = floorBackgrounds[activeFloorId];

  const handleUploadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFloorBackgrounds((prev) => {
        const next = { ...prev, [activeFloorId]: dataUrl };
        writeJsonStorage(FLOOR_BG_STORAGE_KEY, next);
        return next;
      });
      setPositionStatusMsg('Gambar denah latar berhasil diunggah.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveBg = () => {
    setFloorBackgrounds((prev) => {
      const next = { ...prev };
      delete next[activeFloorId];
      writeJsonStorage(FLOOR_BG_STORAGE_KEY, next);
      return next;
    });
    setPositionStatusMsg('Gambar denah latar dihapus.');
  };

  const renderStatusLegend = () => (
    <div
      className="flex flex-wrap items-center gap-8 p-8 rounded-xl border border-border bg-surface-raised text-xs"
      aria-label="Legenda status meja"
    >
      <span className="font-semibold text-text-muted">Status Meja:</span>
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
      <span className="flex items-center gap-4">
        <span className="w-8 h-8 rounded-full shrink-0 bg-border" aria-hidden />
        <span className="text-text-muted">Nonaktif</span>
      </span>
    </div>
  );

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

  const resolvedPositions = useMemo(() => {
    const defaults = defaultGridPositions(
      displayedTables.map((t) => t.id),
      4
    );
    const merged: Record<string, TablePosition> = {};
    for (const t of displayedTables) {
      merged[t.id] = clampTablePosition(
        draftPositions[t.id] ?? defaults[t.id] ?? { xPct: 10, yPct: 10 }
      );
    }
    return merged;
  }, [displayedTables, draftPositions]);

  const handleSavePositions = () => {
    const nextPositions = { ...draftPositions, ...resolvedPositions };
    setDraftPositions(nextPositions);
    writeJsonStorage(TABLE_POSITIONS_STORAGE_KEY, nextPositions);
    writeJsonStorage(DECOR_ELEMENTS_STORAGE_KEY, decorElements);
    setHasUnsavedPositions(false);
    setPositionStatusMsg('Posisi meja dan elemen dekoratif tersimpan secara lokal (Pratinjau).');
  };

  const displayedDecor = useMemo(() => {
    if (selectedFloorId === 'all') return decorElements;
    return decorElements.filter((d) => !d.floorId || d.floorId === selectedFloorId);
  }, [decorElements, selectedFloorId]);

  const handleAddDecor = (type: DecorElementType) => {
    const idx = displayedDecor.length;
    const xPct = 14 + (idx % 5) * 18;
    const yPct = 76 - Math.floor(idx / 5) * 18;
    const el = createDecorElement(
      newId(),
      type,
      xPct,
      yPct,
      selectedFloorId !== 'all' ? selectedFloorId : undefined,
    );
    const next = [...decorElements, el];
    setDecorElements(next);
    writeJsonStorage(DECOR_ELEMENTS_STORAGE_KEY, next);
    setSelectedDecorId(el.id);
    setPositionStatusMsg(`Elemen dekoratif "${DECOR_LABEL_MAP[type]}" ditambahkan (Pratinjau lokal).`);
  };

  const handleDeleteDecor = (id: string) => {
    const next = decorElements.filter((d) => d.id !== id);
    setDecorElements(next);
    writeJsonStorage(DECOR_ELEMENTS_STORAGE_KEY, next);
    if (selectedDecorId === id) setSelectedDecorId(null);
    setPositionStatusMsg('Elemen dekoratif dihapus dari kanvas.');
  };

  const startDecorDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    decor: DecorElement,
  ) => {
    if (e.button !== 0 || !canvasRef.current) return;
    if ((e.target as HTMLElement).closest('button[data-decor-delete]')) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedDecorId(decor.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const usableW = Math.max(1, rect.width - 108);
    const usableH = Math.max(1, rect.height - 84);
    const orig = { xPct: decor.xPct, yPct: decor.yPct };
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let latestDecorList = decorElements;
    setDraggingDecorId(decor.id);
    setPositionStatusMsg(null);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (!moved) return;
      const nextPos = clampTablePosition({
        xPct: orig.xPct + (dx / usableW) * 100,
        yPct: orig.yPct + (dy / usableH) * 100,
      });
      setDecorElements((prev) => {
        const updated = prev.map((item) =>
          item.id === decor.id ? { ...item, xPct: nextPos.xPct, yPct: nextPos.yPct } : item,
        );
        latestDecorList = updated;
        return updated;
      });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDraggingDecorId(null);
    };

    const onUp = () => {
      cleanup();
      if (moved) {
        writeJsonStorage(DECOR_ELEMENTS_STORAGE_KEY, latestDecorList);
        setPositionStatusMsg('Posisi elemen dekoratif tersimpan secara lokal (Pratinjau).');
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleResetPositionsToGrid = () => {
    const defaults = defaultGridPositions(
      displayedTables.map((t) => t.id),
      4
    );
    const nextPositions = { ...draftPositions, ...defaults };
    setDraftPositions(nextPositions);
    writeJsonStorage(TABLE_POSITIONS_STORAGE_KEY, nextPositions);
    setHasUnsavedPositions(false);
    setPositionStatusMsg('Posisi meja dikembalikan ke susunan grid.');
  };

  const startCardDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    table: TableStatus
  ) => {
    if (e.button !== 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const usableW = Math.max(1, rect.width - 148);
    const usableH = Math.max(1, rect.height - 116);
    const orig = resolvedPositions[table.id] ?? { xPct: 10, yPct: 10 };
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    suppressClickRef.current = false;
    setDraggingTableId(table.id);
    setPositionStatusMsg(null);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        suppressClickRef.current = true;
      }
      if (!moved) return;
      const nextPos = clampTablePosition({
        xPct: orig.xPct + (dx / usableW) * 100,
        yPct: orig.yPct + (dy / usableH) * 100,
      });
      setDraftPositions((prev) => ({ ...prev, [table.id]: nextPos }));
      setHasUnsavedPositions(true);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDraggingTableId(null);
    };

    const onUp = () => {
      cleanup();
      if (moved) {
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleSaveTableSettings = () => {
    if (!selectedTable) return;
    const cleaned = sanitizeTableSettings(draftSettings);
    const problem = tableSettingsProblem(cleaned);
    if (problem) {
      setSettingsError(problem);
      setSettingsSavedMsg(null);
      return;
    }
    setSettingsError(null);
    const updated = { ...tableSettingsMap, [selectedTable.id]: cleaned };
    setTableSettingsMap(updated);
    setDraftSettings(cleaned);
    writeJsonStorage(TABLE_SETTINGS_STORAGE_KEY, updated);
    setSettingsSavedMsg('Pengaturan meja tersimpan (Pratinjau lokal).');
  };

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

      {/* Mode Tampilan Outlet + Pratinjau */}
      <div className="mb-16 p-12 rounded-xl border border-border bg-surface-raised flex flex-wrap items-center justify-between gap-12 min-w-0">
        <div className="flex flex-wrap items-center gap-8 min-w-0">
          <span className="text-xs font-semibold text-text-muted">Mode Tampilan Meja:</span>
          <div className="inline-flex rounded-lg border border-border bg-surface p-[2px]" role="group" aria-label="Pemilih Mode Denah">
            <button
              type="button"
              aria-pressed={layoutMode === 'grid'}
              onClick={() => handleLayoutModeChange('grid')}
              className={`px-12 py-[6px] rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-[6px] ${
                layoutMode === 'grid'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <LayoutGrid className="w-[14px] h-[14px] shrink-0" aria-hidden /> Grid Meja
            </button>
            <button
              type="button"
              aria-pressed={layoutMode === 'custom'}
              onClick={() => handleLayoutModeChange('custom')}
              className={`px-12 py-[6px] rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-[6px] ${
                layoutMode === 'custom'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <Move className="w-[14px] h-[14px] shrink-0" aria-hidden /> Denah Kustom
            </button>
          </div>
        </div>
        <span className="cg-badge text-[11px] font-semibold">
          Pratinjau — mode &amp; posisi disimpan lokal per perangkat
        </span>
      </div>

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
            <LayoutGrid className="w-16 h-16 inline mr-[6px] shrink-0" aria-hidden /> Denah
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'daftar'}
            className={`cg-tab ${viewTab === 'daftar' ? 'cg-tab--active' : ''}`}
            onClick={() => setViewTab('daftar')}
          >
            <ListFilter className="w-16 h-16 inline mr-[6px] shrink-0" aria-hidden /> Daftar
          </button>
        </div>

        <div className="flex items-center gap-8">
          {viewTab === 'denah' && (
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm flex items-center gap-[6px]"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Segarkan status meja (otomatis tiap 30 detik)"
            >
              <RotateCw className={`w-[14px] h-[14px] shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
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
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[72px]" />
            ))}
          </div>
          <div className="grid grid-cols-2 tablet:grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-[10px] tablet:gap-12">
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
                  className={`px-12 py-[6px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedFloorId === 'all'
                      ? 'bg-accent text-on-accent shadow-xs font-bold'
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
                      className={`px-12 py-[6px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                        isSel
                          ? 'bg-accent text-on-accent shadow-xs font-bold'
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
              <div className="grid grid-cols-2 tablet:grid-cols-4 gap-8 min-w-0">
                <div className="p-[10px] rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium">Total Meja</span>
                  <strong className="text-lg font-bold cg-num text-text mt-[2px]">
                    {displayedTables.length}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-[2px] truncate">
                      Keseluruhan: {allTables.length} meja
                    </span>
                  )}
                </div>

                <div className="p-[10px] rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-accent inline-block shrink-0" />
                    Kosong
                  </span>
                  <strong className="text-lg font-bold cg-num text-accent-strong mt-[2px]">
                    {displayedKosong}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-[2px] truncate">
                      Keseluruhan: {totalKosong}
                    </span>
                  )}
                </div>

                <div className="p-[10px] rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-warning-strong inline-block shrink-0" />
                    Terisi
                  </span>
                  <strong className="text-lg font-bold cg-num text-warning-strong mt-[2px]">
                    {displayedTerisi}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-[2px] truncate">
                      Keseluruhan: {totalTerisi}
                    </span>
                  )}
                </div>

                <div className="p-[10px] rounded-lg border border-border bg-surface-raised flex flex-col justify-between">
                  <span className="text-xs text-text-muted font-medium flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-border inline-block shrink-0" />
                    Nonaktif
                  </span>
                  <strong className="text-lg font-bold cg-num text-text-muted mt-[2px]">
                    {displayedNonaktif}{' '}
                    <span className="text-xs font-normal text-text-muted">meja</span>
                  </strong>
                  {selectedFloorId !== 'all' && (
                    <span className="text-[11px] text-text-muted mt-[2px] truncate">
                      Keseluruhan: {totalNonaktif}
                    </span>
                  )}
                </div>
              </div>

              {/* Table Grid or Custom Drag Canvas */}
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
              ) : layoutMode === 'custom' ? (
                <div className="space-y-12 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-8 p-12 rounded-xl border border-border bg-surface-raised">
                    <p className="text-xs text-text-muted min-w-0">
                      Seret kartu meja untuk mengatur letak bebas di denah, atau klik meja untuk membuka detail &amp; pengaturan.
                    </p>
                    <div className="flex flex-wrap items-center gap-8 shrink-0">
                      <input
                        ref={bgInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadBg}
                        aria-label="Unggah berkas gambar denah"
                      />
                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm flex items-center gap-[6px]"
                        onClick={() => bgInputRef.current?.click()}
                      >
                        <Upload className="w-[14px] h-[14px] shrink-0" aria-hidden />
                        {currentFloorBg ? 'Ganti Gambar Denah' : 'Unggah Gambar Denah'}
                      </button>
                      {currentFloorBg && (
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger flex items-center gap-[6px]"
                          onClick={handleRemoveBg}
                        >
                          <Trash2 className="w-[14px] h-[14px] shrink-0" aria-hidden />
                          Hapus Gambar
                        </button>
                      )}
                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm flex items-center gap-[6px]"
                        onClick={handleResetPositionsToGrid}
                      >
                        <RotateCcw className="w-[14px] h-[14px] shrink-0" aria-hidden /> Reset ke Grid
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn--primary cg-btn--sm flex items-center gap-[6px]"
                        onClick={handleSavePositions}
                      >
                        <Save className="w-[14px] h-[14px] shrink-0" aria-hidden />
                        {hasUnsavedPositions ? 'Simpan Posisi *' : 'Simpan Posisi'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-12 p-12 rounded-xl border border-border bg-surface-raised">
                    <div className="grid gap-8 min-w-0">
                      <p className="text-xs font-semibold text-text">
                        Palet Denah Kustom (Pratinjau lokal)
                      </p>
                      <div className="flex flex-wrap items-center gap-8">
                        <span className="text-[11px] font-medium text-text-muted uppercase">
                          Bentuk Meja:
                        </span>
                        {(
                          [
                            ['persegi', '+ Meja Persegi'],
                            ['persegi_panjang', '+ Meja Panjang'],
                            ['bulat', '+ Meja Bulat'],
                          ] as const
                        ).map(([shape, label]) => (
                          <button
                            key={shape}
                            type="button"
                            className="cg-btn cg-btn--secondary cg-btn--sm"
                            onClick={() =>
                              setDlg({
                                kind: 'table',
                                floorId:
                                  selectedFloorId !== 'all'
                                    ? selectedFloorId
                                    : floors[0]?.id ?? '',
                                defaultShape: shape,
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-8">
                        <span className="text-[11px] font-medium text-text-muted uppercase">
                          Elemen Dekoratif:
                        </span>
                        {(
                          [
                            ['tanaman', '+ Tanaman'],
                            ['dinding', '+ Dinding'],
                            ['pintu', '+ Pintu'],
                          ] as const
                        ).map(([kind, label]) => (
                          <button
                            key={kind}
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm border border-border"
                            onClick={() => handleAddDecor(kind)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {positionStatusMsg && (
                    <div className="cg-banner cg-banner--info text-xs" role="status">
                      {positionStatusMsg}
                    </div>
                  )}

                  {renderStatusLegend()}

                  <div className="w-full max-w-full overflow-x-auto rounded-xl border border-border bg-surface-raised min-w-0">
                    <div
                      ref={canvasRef}
                      aria-label="Kanvas Denah Kustom"
                      onClick={() => setSelectedDecorId(null)}
                      className="relative w-full min-w-[600px] tablet:min-w-full min-h-[460px] tablet:min-h-[540px] overflow-hidden select-none touch-none"
                      style={{
                        backgroundImage: currentFloorBg
                          ? `url(${currentFloorBg})`
                          : 'radial-gradient(color-mix(in srgb, var(--color-border) 85%, transparent) 1px, transparent 1px)',
                        backgroundSize: currentFloorBg ? 'contain' : '24px 24px',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundColor: currentFloorBg ? 'var(--color-surface-muted)' : undefined,
                      }}
                    >
                    {displayedTables.map((t) => {
                      const isInactive = inactiveTableIds.has(t.id);
                      const colorInfo = isInactive
                        ? null
                        : resolveTableColorStatus({
                            table: t,
                            settings: tableSettingsMap[t.id],
                          });
                      const pos = resolvedPositions[t.id] ?? { xPct: 8, yPct: 8 };
                      const tags = summarizeTableSettings(tableSettingsMap[t.id]);
                      const isDragging = draggingTableId === t.id;
                      const shape = tableShapes[t.id] ?? 'persegi';
                      const shapeSizeClass =
                        shape === 'bulat'
                          ? 'w-[112px] h-[112px] rounded-full text-center items-center justify-center'
                          : shape === 'persegi_panjang'
                            ? 'w-[156px] h-[92px] rounded-xl text-left justify-between'
                            : 'w-[124px] h-[108px] rounded-xl text-left justify-between';
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-table-id={t.id}
                          data-pos-x={pos.xPct}
                          data-pos-y={pos.yPct}
                          data-table-shape={shape}
                          onPointerDown={(e) => startCardDrag(e, t)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDecorId(null);
                            if (suppressClickRef.current) return;
                            openDrawer(t, e.currentTarget);
                          }}
                          style={{
                            left: `calc(8px + (${pos.xPct} / 100) * (100% - 164px))`,
                            top: `calc(8px + (${pos.yPct} / 100) * (100% - 120px))`,
                            borderLeft: colorInfo ? `4px solid ${colorInfo.hexColor}` : undefined,
                          }}
                          className={`absolute p-8 border flex flex-col transition-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent cursor-grab active:cursor-grabbing ${shapeSizeClass} ${
                            isDragging ? 'z-20 shadow-lg ring-2 ring-accent' : 'z-10 hover:shadow-sm'
                          } ${
                            isInactive
                              ? 'bg-surface-muted border-border opacity-75'
                              : 'bg-surface border-border hover:border-accent'
                          }`}
                          aria-label={`Meja ${t.name} pada koordinat ${pos.xPct}% x ${pos.yPct}%, status ${
                            isInactive ? 'nonaktif' : colorInfo?.label
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4 min-w-0">
                            <strong
                              className="text-xs font-bold text-text truncate block min-w-0"
                              title={t.name}
                            >
                              {t.name}
                            </strong>
                            <Move className="w-12 h-12 text-text-muted shrink-0 mt-[2px]" aria-hidden />
                          </div>

                          {tags.length > 0 && (
                            <span
                              className="text-[11px] font-medium text-accent-strong truncate block max-w-full"
                              title={tags.join(' • ')}
                            >
                              {tags[0]}
                            </span>
                          )}

                          <div className="flex items-center justify-between gap-4 min-w-0">
                            {isInactive ? (
                              <span className="cg-badge text-[10px] text-text-muted border border-border font-semibold">
                                Nonaktif
                              </span>
                            ) : colorInfo ? (
                              <span
                                className="px-[6px] py-[2px] rounded text-[10px] font-semibold truncate"
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${colorInfo.hexColor} 18%, transparent)`,
                                  color: colorInfo.hexColor,
                                }}
                              >
                                {colorInfo.label}
                              </span>
                            ) : null}
                            <span className="text-[10px] text-text-muted cg-num whitespace-nowrap">
                              {Math.round(pos.xPct)}%,{Math.round(pos.yPct)}%
                            </span>
                          </div>
                        </button>
                      );
                    })}

                    {displayedDecor.map((el) => {
                      const isSelected = selectedDecorId === el.id;
                      const isDraggingEl = draggingDecorId === el.id;
                      const decorBoxClass =
                        el.type === 'dinding'
                          ? 'w-[120px] h-[44px] rounded-md bg-border/60 border-text-muted/50'
                          : el.type === 'pintu'
                            ? 'w-[84px] h-[56px] rounded-t-full border-dashed border-accent bg-surface'
                            : 'w-[84px] h-[68px] rounded-full border-success/60 bg-success-soft';

                      return (
                        <div
                          key={el.id}
                          role="group"
                          data-decor-id={el.id}
                          data-decor-type={el.type}
                          data-pos-x={el.xPct}
                          data-pos-y={el.yPct}
                          aria-label={`Elemen dekoratif ${DECOR_LABEL_MAP[el.type]}`}
                          onPointerDown={(e) => startDecorDrag(e, el)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDecorId(el.id);
                          }}
                          style={{
                            left: `calc(8px + (${el.xPct} / 100) * (100% - 132px))`,
                            top: `calc(8px + (${el.yPct} / 100) * (100% - 88px))`,
                          }}
                          className={`absolute border flex flex-col items-center justify-center gap-[2px] p-4 select-none touch-none cursor-grab active:cursor-grabbing ${decorBoxClass} ${
                            isDraggingEl || isSelected
                              ? 'z-20 ring-2 ring-accent shadow-sm'
                              : 'z-[12] hover:border-accent'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {el.type === 'tanaman' && (
                              <span
                                className="inline-block w-8 h-8 rounded-full bg-success"
                                aria-hidden
                              />
                            )}
                            {el.type === 'dinding' && (
                              <span
                                className="inline-block w-16 h-[4px] rounded-sm bg-text-muted"
                                aria-hidden
                              />
                            )}
                            {el.type === 'pintu' && (
                              <span
                                className="inline-block w-8 h-8 rounded-t-full border border-accent-strong"
                                aria-hidden
                              />
                            )}
                            <span className="text-[11px] font-semibold text-text whitespace-nowrap">
                              {DECOR_LABEL_MAP[el.type]}
                            </span>
                          </div>
                          {isSelected && (
                            <button
                              type="button"
                              data-decor-delete="true"
                              aria-label={`Hapus elemen ${DECOR_LABEL_MAP[el.type]}`}
                              className="cg-btn cg-btn--ghost cg-btn--sm text-danger text-[10px] min-h-[22px] px-[6px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDecor(el.id);
                              }}
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-12 min-w-0">
                  {renderStatusLegend()}
                  <div
                    className="grid grid-cols-2 tablet:grid-cols-[repeat(auto-fill,minmax(144px,1fr))] gap-[10px] tablet:gap-12 min-w-0"
                    aria-label="Grid Meja Denah"
                  >
                  {displayedTables.map((t) => {
                    const isInactive = inactiveTableIds.has(t.id);
                    const colorInfo = isInactive
                      ? null
                      : resolveTableColorStatus({
                          table: t,
                          settings: tableSettingsMap[t.id],
                        });
                    const tags = summarizeTableSettings(tableSettingsMap[t.id]);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => openDrawer(t, e.currentTarget)}
                        style={{
                          borderLeft: colorInfo ? `4px solid ${colorInfo.hexColor}` : undefined,
                        }}
                        className={`p-12 rounded-xl border text-left flex flex-col justify-between min-h-[118px] tablet:min-h-[128px] transition-all hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent min-w-0 ${
                          isInactive
                            ? 'bg-surface-muted/40 border-border opacity-70 hover:opacity-100'
                            : 'bg-surface-raised border-border hover:border-accent'
                        }`}
                        aria-label={`Meja ${t.name}, status ${isInactive ? 'nonaktif' : colorInfo?.label}${
                          t.order ? `, pesanan ${t.order?.number}` : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <strong
                            className="text-sm tablet:text-base font-bold text-text block truncate mb-4"
                            title={t.name}
                          >
                            {t.name}
                          </strong>
                          <div className="flex items-center gap-4 text-xs text-text-muted mb-8">
                            <Users className="w-[14px] h-[14px] shrink-0" aria-hidden />
                            <span className="cg-num">
                              {(t as unknown as { capacity?: number }).capacity ?? 4} kursi
                            </span>
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-4 mb-8 min-w-0">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[11px] font-medium px-[6px] py-[2px] rounded bg-accent-soft text-accent-strong truncate max-w-full"
                                  title={tag}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          {isInactive && (
                            <span className="cg-badge text-[11px] text-text-muted border border-border font-semibold">
                              Nonaktif
                            </span>
                          )}
                          {!isInactive && colorInfo && (
                            <div className="min-w-0">
                              <span
                                className="px-[6px] py-[2px] rounded text-[11px] font-semibold mb-[2px] block w-fit"
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${colorInfo.hexColor} 18%, transparent)`,
                                  color: colorInfo.hexColor,
                                }}
                              >
                                {colorInfo.label}
                              </span>
                              {t.order && (
                                <>
                                  <div
                                    className="text-xs font-bold text-text cg-num truncate"
                                    title={`${t.order?.number} (${formatRp(t.order?.total ?? 0)})`}
                                  >
                                    {t.order?.number}
                                  </div>
                                  <div className="text-[11px] font-semibold text-text-muted cg-num truncate">
                                    {formatRp(t.order?.total ?? 0)}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
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
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm tablet:max-w-md bg-surface-raised border-l border-border z-50 p-20 shadow-xl overflow-y-auto flex flex-col justify-between"
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
                  className="cg-btn cg-btn--ghost cg-btn--sm p-[6px]"
                  aria-label="Tutup detail meja"
                >
                  <X className="w-[18px] h-[18px] text-text-muted" aria-hidden />
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
                    <Users className="w-[14px] h-[14px] text-text-muted" aria-hidden />
                    {(selectedTable as unknown as { capacity?: number }).capacity ?? 4} kursi
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm py-4 border-b border-border/60">
                  <span className="text-text-muted">Status Saat Ini</span>
                  <div>
                    {inactiveTableIds.has(selectedTable.id) ? (
                      <span className="cg-badge text-xs text-text-muted border border-border font-semibold flex items-center gap-4">
                        Nonaktif
                      </span>
                    ) : (() => {
                      const c = resolveTableColorStatus({
                        table: selectedTable,
                        settings: tableSettingsMap[selectedTable.id],
                      });
                      return (
                        <span
                          className="px-8 py-[3px] rounded text-xs font-semibold flex items-center gap-[6px]"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${c.hexColor} 18%, transparent)`,
                            color: c.hexColor,
                          }}
                        >
                          <span
                            className="w-8 h-8 rounded-full shrink-0"
                            style={{ backgroundColor: c.hexColor }}
                            aria-hidden
                          />
                          {c.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Active Order Details (if occupied) */}
              {selectedTable.order ? (
                <div className="p-16 rounded-xl border border-warning/40 bg-warning/5 space-y-[10px] mb-20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-warning-strong flex items-center gap-[6px]">
                      <Clock className="w-[14px] h-[14px]" aria-hidden /> Pesanan Aktif
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
                <div className="p-[14px] rounded-xl border border-border bg-surface text-sm text-text-muted mb-20">
                  {getTableEffectiveStatus(selectedTable) === 'nonaktif' ? (
                    <p>Meja ini sedang dinonaktifkan sehingga tidak dapat dipilih kasir.</p>
                  ) : (
                    <p>Meja siap digunakan untuk pesanan makan di tempat baru di kasir.</p>
                  )}
                </div>
              )}

              {/* Panel Pengaturan Per Meja (4 Toggle) */}
              <section
                aria-label="Pengaturan Meja"
                className="p-16 rounded-xl border border-border bg-surface space-y-12 mb-20"
              >
                <div className="flex items-center justify-between gap-8">
                  <h3 className="text-sm font-bold text-text">Pengaturan Meja</h3>
                  <span className="cg-badge text-[10px] font-semibold">Pratinjau</span>
                </div>

                {/* 1. Batas Waktu */}
                <div className="space-y-8 border-b border-border/60 pb-12">
                  <label className="flex items-center justify-between gap-8 cursor-pointer">
                    <span className="text-sm font-medium text-text">Batas Waktu</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Aktifkan Batas Waktu"
                      checked={draftSettings.timeLimitEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSettingsError(null);
                        setSettingsSavedMsg(null);
                        setDraftSettings((prev) => ({
                          ...prev,
                          timeLimitEnabled: checked,
                          reminderEnabled: checked ? prev.reminderEnabled : false,
                        }));
                      }}
                      className="w-16 h-16 accent-accent cursor-pointer"
                    />
                  </label>
                  {draftSettings.timeLimitEnabled && (
                    <label className="grid gap-4">
                      <span className="text-xs text-text-muted">Durasi maksimum duduk (menit)</span>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        className="cg-input cg-num"
                        aria-label="Durasi Batas Waktu (menit)"
                        value={draftSettings.timeLimitMinutes}
                        onChange={(e) => {
                          setSettingsError(null);
                          setSettingsSavedMsg(null);
                          setDraftSettings((prev) => ({
                            ...prev,
                            timeLimitMinutes: Number.parseInt(e.target.value || '0', 10),
                          }));
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* 2. Pengingat Waktu */}
                <div className="space-y-8 border-b border-border/60 pb-12">
                  <label
                    className={`flex items-center justify-between gap-8 ${
                      draftSettings.timeLimitEnabled ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-sm font-medium text-text">Pengingat Waktu</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Aktifkan Pengingat Waktu"
                      disabled={!draftSettings.timeLimitEnabled}
                      checked={draftSettings.timeLimitEnabled && draftSettings.reminderEnabled}
                      onChange={(e) => {
                        setSettingsError(null);
                        setSettingsSavedMsg(null);
                        setDraftSettings((prev) => ({
                          ...prev,
                          reminderEnabled: e.target.checked,
                        }));
                      }}
                      className="w-16 h-16 accent-accent cursor-pointer disabled:cursor-not-allowed"
                    />
                  </label>
                  {!draftSettings.timeLimitEnabled ? (
                    <p className="text-xs text-text-muted">
                      Aktifkan Batas Waktu terlebih dahulu untuk mengatur pengingat.
                    </p>
                  ) : (
                    draftSettings.reminderEnabled && (
                      <label className="grid gap-4">
                        <span className="text-xs text-text-muted">
                          Ingatkan sebelum waktu habis (menit)
                        </span>
                        <input
                          type="number"
                          min={1}
                          className="cg-input cg-num"
                          aria-label="Menit Pengingat Waktu"
                          value={draftSettings.reminderBeforeMinutes}
                          onChange={(e) => {
                            setSettingsError(null);
                            setSettingsSavedMsg(null);
                            setDraftSettings((prev) => ({
                              ...prev,
                              reminderBeforeMinutes: Number.parseInt(e.target.value || '0', 10),
                            }));
                          }}
                        />
                      </label>
                    )
                  )}
                </div>

                {/* 3. Minimum Tagihan */}
                <div className="space-y-8 border-b border-border/60 pb-12">
                  <label className="flex items-center justify-between gap-8 cursor-pointer">
                    <span className="text-sm font-medium text-text">Minimum Tagihan</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Aktifkan Minimum Tagihan"
                      checked={draftSettings.minBillEnabled}
                      onChange={(e) => {
                        setSettingsError(null);
                        setSettingsSavedMsg(null);
                        setDraftSettings((prev) => ({
                          ...prev,
                          minBillEnabled: e.target.checked,
                        }));
                      }}
                      className="w-16 h-16 accent-accent cursor-pointer"
                    />
                  </label>
                  {draftSettings.minBillEnabled && (
                    <div className="grid gap-12">
                      <label className="grid gap-4">
                        <span className="text-xs text-text-muted">Nominal minimum (Rp)</span>
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          className="cg-input cg-num"
                          aria-label="Nominal Minimum Tagihan"
                          value={draftSettings.minBill}
                          onChange={(e) => {
                            setSettingsError(null);
                            setSettingsSavedMsg(null);
                            setDraftSettings((prev) => ({
                              ...prev,
                              minBill: Number.parseInt(e.target.value || '0', 10),
                            }));
                          }}
                        />
                      </label>

                      <fieldset className="grid gap-8">
                        <legend className="text-xs font-medium text-text-muted mb-4">
                          Perilaku jika tagihan di bawah minimum (Pratinjau lokal)
                        </legend>
                        {MIN_BILL_MODES.map((opt) => {
                          const currentMode = draftSettings.minBillMode ?? 'izinkan';
                          const selected = currentMode === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`flex items-start gap-8 p-8 rounded-lg border cursor-pointer transition-colors ${
                                selected
                                  ? 'border-accent bg-accent-soft'
                                  : 'border-border bg-surface hover:border-accent'
                              }`}
                            >
                              <input
                                type="radio"
                                name="min-bill-mode"
                                value={opt.value}
                                checked={selected}
                                onChange={() => {
                                  setSettingsError(null);
                                  setSettingsSavedMsg(null);
                                  setDraftSettings((prev) => ({
                                    ...prev,
                                    minBillMode: opt.value,
                                  }));
                                }}
                                className="mt-[2px] accent-accent cursor-pointer shrink-0"
                              />
                              <span className="grid gap-[2px] min-w-0">
                                <span className="text-xs font-semibold text-text">
                                  {opt.label}
                                </span>
                                <span className="text-[11px] text-text-muted">
                                  {opt.desc}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
                    </div>
                  )}
                </div>

                {/* 4. Label */}
                <div className="space-y-8">
                  <label className="flex items-center justify-between gap-8 cursor-pointer">
                    <span className="text-sm font-medium text-text">Label</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Aktifkan Label Meja"
                      checked={draftSettings.labelEnabled}
                      onChange={(e) => {
                        setSettingsError(null);
                        setSettingsSavedMsg(null);
                        setDraftSettings((prev) => ({
                          ...prev,
                          labelEnabled: e.target.checked,
                        }));
                      }}
                      className="w-16 h-16 accent-accent cursor-pointer"
                    />
                  </label>
                  {draftSettings.labelEnabled && (
                    <label className="grid gap-4">
                      <div className="flex items-center justify-between gap-8">
                        <span className="text-xs text-text-muted">Teks label bebas</span>
                        <span className="text-[11px] text-text-muted cg-num">
                          {draftSettings.label.length}/{MAX_TABLE_LABEL_LENGTH}
                        </span>
                      </div>
                      <input
                        type="text"
                        maxLength={MAX_TABLE_LABEL_LENGTH}
                        placeholder="Mis. VIP Pojok"
                        className="cg-input"
                        aria-label="Teks Label Meja"
                        value={draftSettings.label}
                        onChange={(e) => {
                          setSettingsError(null);
                          setSettingsSavedMsg(null);
                          setDraftSettings((prev) => ({
                            ...prev,
                            label: e.target.value.slice(0, MAX_TABLE_LABEL_LENGTH),
                          }));
                        }}
                      />
                    </label>
                  )}
                </div>

                {settingsError && (
                  <p role="alert" className="text-xs font-medium text-danger-strong">
                    {settingsError}
                  </p>
                )}

                {settingsSavedMsg && (
                  <p role="status" className="text-xs font-medium text-success-strong">
                    {settingsSavedMsg}
                  </p>
                )}

                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm w-full"
                  onClick={handleSaveTableSettings}
                >
                  Simpan Pengaturan Meja
                </button>
              </section>
            </div>

            {/* Drawer Actions */}
            <div className="pt-16 border-t border-border flex flex-col gap-8">
              <button
                type="button"
                className="cg-btn cg-btn--primary w-full flex items-center justify-center gap-[6px]"
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
          initialShape={
            dlg.kind === 'table'
              ? dlg.defaultShape ?? (dlg.item ? tableShapes[dlg.item.id] : undefined) ?? 'persegi'
              : 'persegi'
          }
          onClose={() => setDlg(null)}
          onSaved={(savedTableId, shape) => {
            if (savedTableId && shape) {
              const next = { ...tableShapes, [savedTableId]: shape };
              setTableShapes(next);
              writeJsonStorage(TABLE_SHAPES_STORAGE_KEY, next);
            }
            done();
          }}
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
  initialShape,
  onClose,
  onSaved,
}: {
  dlg: Extract<Dlg, { kind: 'floor' | 'table' }>;
  floors: Floor[];
  initialShape: CustomTableShape;
  onClose: () => void;
  onSaved: (savedTableId?: string, shape?: CustomTableShape) => void;
}) {
  const data = useData();
  const ref = useModal();
  const isTable = dlg.kind === 'table';
  const [name, setName] = useState(dlg.item?.name ?? '');
  const [floorId, setFloorId] = useState(dlg.kind === 'table' ? dlg.floorId : '');
  const [shape, setShape] = useState<CustomTableShape>(initialShape);
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
      if (isTable) {
        const saved = await data.saveTable({ id: dlg.item?.id, floorId, name });
        onSaved(saved.id, shape);
      } else {
        await data.saveFloor({ id: dlg.item?.id, name });
        onSaved();
      }
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
          <>
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
            <div className="cg-field">
              <label className="cg-label" htmlFor="bentuk-meja-denah">
                Bentuk di Denah Kustom (Pratinjau)
              </label>
              <select
                id="bentuk-meja-denah"
                className="cg-input"
                value={shape}
                onChange={(e) => setShape(e.target.value as CustomTableShape)}
              >
                <option value="persegi">Persegi</option>
                <option value="persegi_panjang">Persegi panjang</option>
                <option value="bulat">Bulat</option>
              </select>
            </div>
          </>
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

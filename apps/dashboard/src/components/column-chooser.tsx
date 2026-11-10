'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  getActiveColumns,
  hasVisibleColumns,
  initColumnPrefs,
  mergeColumnPrefs,
  moveColumn,
  toggleColumnVisibility,
  type ColumnDef,
  type ColumnPref,
} from '@cgpos/shared';

const STORAGE_PREFIX = 'cgpos_cols_';

/**
 * Hook untuk menyimpan preferensi kolom (urutan & visibilitas) di localStorage.
 * Aman menangani SSR dan kegagalan storage.
 */
export function useColumnPrefs<TKey extends string>(
  storageKey: string,
  columns: readonly ColumnDef<TKey>[]
) {
  // Selalu inisialisasi dengan defaults saat render pertama untuk mencegah React hydration mismatch (#418)
  const [prefs, setPrefs] = useState<ColumnPref<TKey>>(() => initColumnPrefs(columns));
  const [hydrated, setHydrated] = useState(false);

  // Muat dari localStorage setelah client mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
      if (raw) {
        setPrefs(mergeColumnPrefs(columns, JSON.parse(raw)));
      }
    } catch {
      // Abaikan galat localStorage
    }
    setHydrated(true);
  }, [storageKey, columns]);

  // Simpan ke localStorage saat preferensi diubah setelah hydration
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(prefs));
    } catch {
      // Abaikan galat quota atau privacy mode
    }
  }, [storageKey, prefs, hydrated]);

  const toggle = (key: TKey) => {
    setPrefs((prev) => toggleColumnVisibility(prev, key));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setPrefs((prev) => ({
      ...prev,
      order: moveColumn(prev.order, index, index - 1),
    }));
  };

  const moveDown = (index: number) => {
    setPrefs((prev) => {
      if (index >= prev.order.length - 1) return prev;
      return {
        ...prev,
        order: moveColumn(prev.order, index, index + 1),
      };
    });
  };

  const reset = () => {
    const defaults = initColumnPrefs(columns);
    setPrefs(defaults);
    try {
      localStorage.removeItem(STORAGE_PREFIX + storageKey);
    } catch {
      // Abaikan
    }
  };

  const activeColumns = useMemo(
    () => getActiveColumns(columns, prefs),
    [columns, prefs]
  );

  const activeKeys = useMemo(
    () => activeColumns.map((c) => c.key),
    [activeColumns]
  );

  const hasVisible = useMemo(
    () => hasVisibleColumns(prefs),
    [prefs]
  );

  return {
    prefs,
    setPrefs,
    toggle,
    moveUp,
    moveDown,
    reset,
    activeColumns,
    activeKeys,
    hasVisible,
  };
}

export interface ColumnChooserProps<TKey extends string> {
  columns: readonly ColumnDef<TKey>[];
  prefs: ColumnPref<TKey>;
  onToggle: (key: TKey) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReset: () => void;
  className?: string;
}

export function ColumnChooser<TKey extends string>({
  columns,
  prefs,
  onToggle,
  onMoveUp,
  onMoveDown,
  onReset,
  className = '',
}: ColumnChooserProps<TKey>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Map definisi kolom untuk akses cepat
  const colMap = useMemo(() => {
    const map = new Map<TKey, ColumnDef<TKey>>();
    for (const c of columns) map.set(c.key, c);
    return map;
  }, [columns]);

  // Tutup bila klik di luar popover atau tekan Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const visibleCount = useMemo(() => {
    let count = 0;
    for (const k of prefs.order) {
      if (prefs.visible[k] !== false) count++;
    }
    return count;
  }, [prefs]);

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="cg-btn cg-btn--secondary"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Atur kolom tabel"
        title="Atur kolom yang ditampilkan dan urutan kolom"
      >
        <SlidersHorizontal className="cg-icon" aria-hidden />
        <span>Atur kolom</span>
        {visibleCount < columns.length && (
          <span className="ml-4 px-[6px] py-[2px] text-xs rounded-full bg-accent/15 text-accent-strong font-medium">
            {visibleCount}/{columns.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Latar belakang redup khusus tampilan layar kecil (< 600px) */}
          <div
            className="fixed inset-0 bg-black/40 z-40 tablet:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            role="dialog"
            aria-label="Atur kolom tabel"
            className="fixed tablet:absolute top-1/2 tablet:top-full left-1/2 tablet:left-auto tablet:right-0 -translate-x-1/2 tablet:translate-x-0 -translate-y-1/2 tablet:translate-y-0 tablet:mt-[6px] z-50 w-[calc(100vw-32px)] tablet:w-[320px] max-w-[384px] max-h-[85vh] flex flex-col bg-surface border border-border rounded-xl shadow-xl p-16 text-text"
          >
            {/* Header Popover */}
            <div className="flex items-start justify-between gap-8 pb-12 border-b border-border shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-text">Atur kolom tabel</h3>
                <p className="text-xs text-text-muted mt-[2px]">
                  Pilih kolom dan atur urutan posisi dengan tombol naik/turun.
                </p>
              </div>
              <button
                type="button"
                className="p-4 text-text-muted hover:text-text rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Tutup pengaturan kolom"
              >
                <X className="w-16 h-16" />
              </button>
            </div>

            {/* Daftar Kolom Sesuai Urutan */}
            <div className="py-8 overflow-y-auto space-y-4 flex-1 min-h-0">
              {prefs.order.map((key, idx) => {
                const col = colMap.get(key);
                if (!col) return null;
                const isChecked = prefs.visible[key] !== false;
                const isFirst = idx === 0;
                const isLast = idx === prefs.order.length - 1;

                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-8 p-[6px] rounded-lg transition-colors ${
                      isChecked ? 'bg-surface hover:bg-surface-raised' : 'opacity-60 bg-surface'
                    }`}
                  >
                    <label className="flex items-center gap-8 min-w-0 flex-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(key)}
                        className="rounded border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-text truncate" title={col.label}>
                        {col.label}
                      </span>
                    </label>

                    {/* Tombol Reorder Naik & Turun */}
                    <div className="flex items-center gap-[2px] shrink-0">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => onMoveUp(idx)}
                        aria-label={`Pindahkan kolom ${col.label} ke atas`}
                        className="p-4 text-text-muted hover:text-text hover:bg-surface-raised rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Naik"
                      >
                        <ChevronUp className="w-[14px] h-[14px]" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => onMoveDown(idx)}
                        aria-label={`Pindahkan kolom ${col.label} ke bawah`}
                        className="p-4 text-text-muted hover:text-text hover:bg-surface-raised rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Turun"
                      >
                        <ChevronDown className="w-[14px] h-[14px]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Popover */}
            <div className="pt-12 mt-4 border-t border-border flex items-center justify-between gap-8 shrink-0">
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm flex items-center gap-4 text-xs"
                onClick={onReset}
                title="Kembalikan urutan dan pilihan kolom ke setelan awal"
              >
                <RotateCcw className="w-[12px] h-[12px]" aria-hidden />
                <span>Reset</span>
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--primary cg-btn--sm text-xs"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                Selesai
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

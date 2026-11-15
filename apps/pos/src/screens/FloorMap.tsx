import { clampTablePosition, defaultGridPositions, sanitizeDecorElements, formatRp, type CustomTableShape, type DecorElement, type TablePosition, type TableStatus } from '@cgpos/shared';

/** Denah kustom yang diatur pengelola di dashboard (posisi, bentuk, dekorasi, gambar latar), dibaca dari salinan lokal yang sudah disegarkan dari server. */
export interface FloorLayout {
  mode: 'grid' | 'custom';
  positions: Record<string, TablePosition>;
  shapes: Record<string, CustomTableShape>;
  decor: DecorElement[];
  backgrounds: Record<string, string>;
}

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

export function loadFloorLayout(outletId: string): FloorLayout {
  const modes = readJson<Record<string, unknown>>('cgpos_floor_layout_mode', {});
  const m = modes[outletId] ?? modes.semua;
  return {
    mode: m === 'custom' ? 'custom' : 'grid',
    positions: readJson<Record<string, TablePosition>>('cgpos_custom_table_positions', {}),
    shapes: readJson<Record<string, CustomTableShape>>('cgpos_custom_table_shapes', {}),
    decor: sanitizeDecorElements(readJson<unknown>('cgpos_custom_decor_elements', [])),
    backgrounds: readJson<Record<string, string>>('cgpos_floor_backgrounds', {}),
  };
}

const DECOR_GLYPH: Record<string, string> = { tanaman: '🌿', dinding: '▬', pintu: '🚪' };

/** Peta lantai: meja diletakkan menurut persen posisi yang disimpan dashboard; gambar denah menjadi latar. */
export function FloorMap({ floorId, tables, layout, color, onTable, mineId, label }: {
  floorId: string;
  tables: TableStatus[];
  layout: FloorLayout;
  color: (t: TableStatus) => { hexColor: string; label: string };
  onTable: (t: TableStatus) => void;
  mineId?: string;
  label: (t: TableStatus) => string;
}) {
  const bg = layout.backgrounds[floorId];
  const defaults = defaultGridPositions(tables.map((t) => t.id), 4);
  return (
    <div
      className="relative w-full rounded-lg border border-border overflow-hidden"
      style={{ height: 'min(60vh, 440px)', minHeight: 300, backgroundColor: 'var(--color-surface-muted)', ...(bg ? { backgroundImage: `url(${bg})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}) }}
      role="group"
      aria-label="Denah meja"
    >
      {layout.decor.filter((d) => !d.floorId || d.floorId === floorId).map((d) => (
        <span key={d.id} className="absolute text-lg select-none pointer-events-none" style={{ left: `calc(4px + ${d.xPct / 100} * (100% - 40px))`, top: `calc(4px + ${d.yPct / 100} * (100% - 40px))` }} aria-hidden>{DECOR_GLYPH[d.type] ?? '•'}</span>
      ))}
      {tables.map((t) => {
        const pos = clampTablePosition(layout.positions[t.id] ?? defaults[t.id] ?? { xPct: 10, yPct: 10 });
        const info = color(t);
        const shape = layout.shapes[t.id] ?? 'persegi';
        const size = shape === 'bulat' ? 'w-[68px] h-[68px] sm:w-[84px] sm:h-[84px] rounded-full items-center text-center justify-center' : shape === 'persegi_panjang' ? 'w-[80px] h-[56px] sm:w-[112px] sm:h-[68px] rounded-lg' : 'w-[68px] h-[60px] sm:w-[92px] sm:h-[76px] rounded-lg';
        return (
          <button
            key={t.id}
            type="button"
            className={`absolute p-6 border flex flex-col bg-surface hover:border-accent focus-visible:ring-2 focus-visible:ring-accent ${size} ${t.id === mineId ? 'border-accent ring-2 ring-accent' : 'border-border'}`}
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transform: `translate(-${pos.xPct}%, -${pos.yPct}%)`, borderLeft: `4px solid ${info.hexColor}` }}
            aria-label={label(t)}
            data-table-id={t.id}
            onClick={() => onTable(t)}
          >
            <strong className="text-xs truncate max-w-full">{t.name}</strong>
            <span className="text-[10px] font-semibold truncate max-w-full" style={{ color: info.hexColor }}>{info.label}</span>
            {t.order && <span className="text-[10px] cg-num">{formatRp(t.order.total)}</span>}
          </button>
        );
      })}
    </div>
  );
}

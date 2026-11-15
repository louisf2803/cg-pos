import { describe, expect, it, vi } from 'vitest';
import { applyTableLayout, collectTableLayout, createFakeData, createTableLayoutSync, hydrateTableLayout, sameLayout, TABLE_LAYOUT_KEYS, type StorageLike } from '../src';

function memStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; } };
}
const pos = JSON.stringify({ t1: { xPct: 10, yPct: 20 } });

describe('sinkronisasi denah meja', () => {
  it('mengumpulkan hanya kunci denah yang berisi, dan mengabaikan isi rusak', () => {
    const st = memStorage({ cgpos_custom_table_positions: pos, cgpos_table_settings: '{}', cgpos_inactive_tables: '[]', cgpos_custom_table_shapes: '{rusak', lain: '1' });
    expect(collectTableLayout(st)).toEqual({ cgpos_custom_table_positions: { t1: { xPct: 10, yPct: 20 } } });
  });

  it('menerapkan dokumen: server menang dan kunci yang tidak ada dikosongkan', () => {
    const st = memStorage({ cgpos_custom_table_positions: pos, cgpos_inactive_tables: '["t9"]' });
    applyTableLayout({ cgpos_custom_table_positions: { t2: { xPct: 1, yPct: 2 } } }, st);
    expect(JSON.parse(st.data.cgpos_custom_table_positions!)).toEqual({ t2: { xPct: 1, yPct: 2 } });
    expect(JSON.parse(st.data.cgpos_inactive_tables!)).toEqual([]);
    for (const k of TABLE_LAYOUT_KEYS) expect(st.data[k]).toBeDefined();
  });

  it('hydrate: dokumen server dipakai; server kosong + data lokal + pengelola = dikirim; kasir tidak mengirim', async () => {
    const d = createFakeData();
    const local = memStorage({ cgpos_custom_table_positions: pos });
    expect(await hydrateTableLayout(d, local, false)).toBe('empty');
    expect(await d.getTableLayout()).toBeNull();
    expect(await hydrateTableLayout(d, local, true)).toBe('pushed');
    expect(await d.getTableLayout()).toEqual({ cgpos_custom_table_positions: { t1: { xPct: 10, yPct: 20 } } });
    const other = memStorage();
    expect(await hydrateTableLayout(d, other, false)).toBe('server');
    expect(JSON.parse(other.data.cgpos_custom_table_positions!)).toEqual({ t1: { xPct: 10, yPct: 20 } });
  });

  it('server tidak terjangkau: isi lokal dibiarkan', async () => {
    const st = memStorage({ cgpos_custom_table_positions: pos });
    const broken = { getTableLayout: async () => { throw new Error('putus'); }, saveTableLayout: async () => undefined };
    expect(await hydrateTableLayout(broken, st, true)).toBe('offline');
    expect(st.data.cgpos_custom_table_positions).toBe(pos);
  });

  it('push digabung setelah jeda, dan tidak dikirim bila isi tidak berubah', async () => {
    vi.useFakeTimers();
    const st = memStorage({ cgpos_custom_table_positions: pos });
    const saved: unknown[] = [];
    const states: string[] = [];
    const sync = createTableLayoutSync({ getTableLayout: async () => null, saveTableLayout: async (doc) => { saved.push(doc); } }, st, { delayMs: 500, onState: (s) => states.push(s) });
    sync.push(); sync.push(); sync.push();
    await vi.advanceTimersByTimeAsync(600);
    expect(saved).toHaveLength(1);
    expect(states).toEqual(['saving', 'saved']);
    sync.push();
    await vi.advanceTimersByTimeAsync(600);
    expect(saved).toHaveLength(1); // tidak berubah
    st.setItem('cgpos_custom_table_positions', JSON.stringify({ t1: { xPct: 50, yPct: 50 } }));
    await sync.flush();
    expect(saved).toHaveLength(2);
    vi.useRealTimers();
  });

  it('sameLayout mengabaikan urutan kunci', () => {
    expect(sameLayout({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toBe(true);
    expect(sameLayout({ a: 1 }, { a: 2 })).toBe(false);
  });
});

// Denah meja tersimpan di server (A114, migrasi 0143). Dashboard dan kasir sudah menyimpan posisi, bentuk, dekor, dan pengaturan meja di localStorage
// dengan kunci tetap; modul ini menyinkronkan kunci-kunci itu ke server supaya dibagi ke semua perangkat, tanpa mengubah kode penyimpanan yang ada.
// Server menang bila sudah ada dokumen; bila server kosong dan perangkat ini punya data lama, data itu dikirim sebagai dokumen pertama.

/** Kunci localStorage yang ikut disinkronkan. Gambar latar lantai sengaja tidak ikut (ukurannya besar). */
export const TABLE_LAYOUT_KEYS = [
  'cgpos_inactive_tables',
  'cgpos_floor_layout_mode',
  'cgpos_custom_table_positions',
  'cgpos_table_settings',
  'cgpos_custom_table_shapes',
  'cgpos_custom_decor_elements',
  'cgpos_floor_backgrounds',
] as const;

/** Preferensi bisnis dashboard yang sebelumnya hanya di localStorage satu peramban (grup komisi, metadata fasilitas, tingkat loyalti, aturan ulang tahun, kolom kustom pelanggan, dll.). Disimpan sebagai dokumen organisasi 'dashboard-prefs' (migrasi 0144). */
export const DASHBOARD_PREF_KEYS = [
  'cgpos_commission_groups',
  'cg-a58-facility-meta-v1', 'cg-a58-loyalty-tiers-v1', 'cg-a58-birthday-rule-v1', 'cg-a58-birthday-grants-v1',
  'cg-a59-payment-overrides-v1', 'cg-a59-payment-custom-v1', 'cg-a59-online-channels-v1',
  'cg-a60-customer-fields-v1', 'cg-a60-customer-policy-v1', 'cg-a60-satisfaction-followup-v1', 'cg-a60-warehouse-prepared-v1',
] as const;
export const DASHBOARD_PREFS_DOC = 'dashboard-prefs';

export type TableLayoutDoc = Record<string, unknown>;
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface TableLayoutStore {
  getTableLayout(): Promise<TableLayoutDoc | null>;
  saveTableLayout(doc: TableLayoutDoc): Promise<void>;
}

declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && typeof v === 'object' ? Object.keys(v as object).length > 0 : v !== undefined && v !== null);

/** Isi localStorage untuk kunci denah sebagai dokumen (kunci kosong dilewati). */
export function collectTableLayout(storage: StorageLike, keys: readonly string[] = TABLE_LAYOUT_KEYS): TableLayoutDoc {
  const doc: TableLayoutDoc = {};
  for (const k of keys) {
    try {
      const raw = storage.getItem(k);
      if (!raw) continue;
      const v = JSON.parse(raw) as unknown;
      if (hasValue(v)) doc[k] = v;
    } catch { /* isi rusak: abaikan kunci ini */ }
  }
  return doc;
}

/** Tulis dokumen ke localStorage; kunci yang tidak ada di dokumen dikosongkan (server menang). */
export function applyTableLayout(doc: TableLayoutDoc, storage: StorageLike, keys: readonly string[] = TABLE_LAYOUT_KEYS): void {
  for (const k of keys) {
    // kunci yang tidak ada di dokumen dikosongkan: kunci denah ke nilai kosong sesuai jenisnya, kunci lain ke teks kosong (pembacanya memakai nilai bawaan)
    const empty = k === 'cgpos_custom_decor_elements' || k === 'cgpos_inactive_tables' ? '[]' : (TABLE_LAYOUT_KEYS as readonly string[]).includes(k) ? '{}' : '';
    try { storage.setItem(k, k in doc ? JSON.stringify(doc[k]) : empty); } catch { /* penyimpanan boleh gagal */ }
  }
}

/** Sama persis (urutan kunci diabaikan)? */
export function sameLayout(a: TableLayoutDoc, b: TableLayoutDoc): boolean {
  const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export type HydrateResult = 'server' | 'pushed' | 'empty' | 'offline';

/**
 * Ambil denah dari server dan tulis ke localStorage. Dipanggil SEBELUM layar membaca localStorage.
 * Gagal terhubung = pakai isi lokal apa adanya ('offline'), tidak pernah menghapus data lokal.
 * `canPush`: hanya pengelola boleh mengirim data lokal lama sebagai dokumen pertama.
 */
export async function hydrateTableLayout(store: TableLayoutStore, storage: StorageLike, canPush = false, keys: readonly string[] = TABLE_LAYOUT_KEYS): Promise<HydrateResult> {
  let server: TableLayoutDoc | null;
  try { server = await store.getTableLayout(); } catch { return 'offline'; }
  if (server && Object.keys(server).length > 0) { applyTableLayout(server, storage, keys); return 'server'; }
  const local = collectTableLayout(storage, keys);
  if (Object.keys(local).length === 0) return 'empty';
  if (!canPush) return 'empty';
  try { await store.saveTableLayout(local); return 'pushed'; } catch { return 'offline'; }
}

/** Kirim isi localStorage ke server setelah jeda (digabung bila banyak perubahan beruntun). Mengembalikan fungsi `push` dan `flush`. */
export function createTableLayoutSync(store: TableLayoutStore, storage: StorageLike, opts: { delayMs?: number; keys?: readonly string[]; onState?: (s: 'saving' | 'saved' | 'error') => void } = {}) {
  const delay = opts.delayMs ?? 800;
  let timer: unknown = null;
  let last: TableLayoutDoc | null = null;
  async function run() {
    timer = null;
    const doc = collectTableLayout(storage, opts.keys ?? TABLE_LAYOUT_KEYS);
    if (last && sameLayout(last, doc)) return;
    opts.onState?.('saving');
    try { await store.saveTableLayout(doc); last = doc; opts.onState?.('saved'); } catch { opts.onState?.('error'); }
  }
  return {
    push() { if (timer) clearTimeout(timer); timer = setTimeout(() => { void run(); }, delay); },
    async flush() { if (timer) { clearTimeout(timer); timer = null; } await run(); },
  };
}

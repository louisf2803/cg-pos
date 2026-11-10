/** Catatan siap pakai untuk kasir ("Level pedas: Sedang", "Gula: Kurang manis"): pemilik/manajer menyusun, kasir tinggal ketuk. */
export const NOTE_CATEGORY_MAX = 40;
export const NOTE_TEXT_MAX = 60;
/** Batas panjang catatan satu baris pesanan (sama dengan kolom catatan di kasir). */
export const LINE_NOTE_MAX = 120;

export interface NotePreset { id: string; category: string; text: string; sort: number; isActive: boolean }
export interface NotePresetInput { id?: string; category: string; text: string; sort?: number; isActive?: boolean }

/** Pesan galat bila isian tidak sah, atau null. */
export function notePresetProblem(input: Pick<NotePresetInput, 'category' | 'text'>): string | null {
  const c = input.category.trim(), t = input.text.trim();
  if (!c) return 'Kategori catatan wajib diisi.';
  if (c.length > NOTE_CATEGORY_MAX) return `Kategori maksimal ${NOTE_CATEGORY_MAX} huruf.`;
  if (!t) return 'Isi catatan wajib diisi.';
  if (t.length > NOTE_TEXT_MAX) return `Isi catatan maksimal ${NOTE_TEXT_MAX} huruf.`;
  return null;
}

export interface NoteGroup { category: string; items: NotePreset[] }

/** Kelompokkan per kategori (urutan kemunculan menurut sort lalu nama), hanya yang aktif. */
export function groupNotePresets(presets: NotePreset[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  const sorted = presets.filter((p) => p.isActive).sort((a, b) => a.sort - b.sort || a.category.localeCompare(b.category) || a.text.localeCompare(b.text));
  for (const p of sorted) {
    const key = p.category.trim().toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { category: p.category.trim(), items: [] }; groups.set(key, g); }
    g.items.push(p);
  }
  return [...groups.values()];
}

/** Tambahkan teks siap pakai ke catatan yang ada (dipisah koma); ketuk lagi pada teks yang sama = melepasnya. Hasil dipotong ke LINE_NOTE_MAX. */
export function toggleNoteText(current: string | undefined, text: string): string {
  const parts = (current ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const t = text.trim();
  const at = parts.findIndex((p) => p.toLowerCase() === t.toLowerCase());
  if (at >= 0) parts.splice(at, 1); else parts.push(t);
  const out = parts.join(', ');
  if (out.length <= LINE_NOTE_MAX) return out;
  // tidak muat: jangan memotong di tengah kata, kembalikan catatan semula
  return current ?? '';
}

export function noteHasText(current: string | undefined, text: string): boolean {
  const t = text.trim().toLowerCase();
  return (current ?? '').split(',').some((p) => p.trim().toLowerCase() === t);
}

/** Outlet yang sedang dikelola di dashboard (disimpan di peramban per perangkat). Kosong: outlet aktif pertama. */
const KEY = 'cgpos_active_outlet';
export function readActiveOutlet(): string | undefined {
  try { return localStorage.getItem(KEY) || undefined; } catch { return undefined; }
}
export function writeActiveOutlet(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* boleh gagal (mode privat) */ }
}

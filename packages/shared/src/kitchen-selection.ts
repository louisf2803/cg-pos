import type { KitchenRow, KitchenStatus } from './kitchen';

/**
 * Toggle satu ID item pada tiket tertentu di daftar pilihan.
 */
export function toggleTicketItemSelection(
  selected: Record<string, string[]>,
  orderId: string,
  itemId: string,
): Record<string, string[]> {
  const current = selected[orderId] ?? [];
  const exists = current.includes(itemId);
  const next = exists ? current.filter((id) => id !== itemId) : [...current, itemId];
  if (next.length === 0) {
    const copy = { ...selected };
    delete copy[orderId];
    return copy;
  }
  return { ...selected, [orderId]: next };
}

/**
 * Pilih semua atau kosongkan semua item pada satu tiket dapur.
 */
export function toggleAllTicketItems(
  selected: Record<string, string[]>,
  orderId: string,
  itemIds: string[],
): Record<string, string[]> {
  const current = selected[orderId] ?? [];
  const allSelected = itemIds.length > 0 && itemIds.every((id) => current.includes(id));
  if (allSelected) {
    const copy = { ...selected };
    delete copy[orderId];
    return copy;
  }
  return { ...selected, [orderId]: [...itemIds] };
}

/**
 * Cek apakah semua item pada tiket dapur sedang terpilih.
 */
export function isAllTicketItemsSelected(
  selected: Record<string, string[]>,
  orderId: string,
  itemIds: string[],
): boolean {
  if (itemIds.length === 0) return false;
  const current = selected[orderId] ?? [];
  return itemIds.every((id) => current.includes(id));
}

/**
 * Dapatkan daftar ID item terpilih untuk satu tiket dapur.
 */
export function getSelectedTicketItemIds(
  selected: Record<string, string[]>,
  orderId: string,
): string[] {
  return selected[orderId] ?? [];
}

/**
 * Kosongkan pilihan item untuk satu tiket dapur.
 */
export function clearTicketSelection(
  selected: Record<string, string[]>,
  orderId: string,
): Record<string, string[]> {
  if (!selected[orderId]) return selected;
  const copy = { ...selected };
  delete copy[orderId];
  return copy;
}

/**
 * Tentukan status berikutnya untuk sekumpulan item yang dipilih berdasarkan status saat ini:
 * - Jika ada 'new': maju ke 'preparing' (Mulai olah)
 * - Jika ada 'preparing': maju ke 'ready' (Tandai siap)
 * - Jika semua 'ready': maju ke 'served' (Sajikan)
 * - Lainnya: 'ready' sebagai default penyelesaian cepat
 */
export function resolveBulkNextStatus(
  items: KitchenRow[],
  selectedIds: string[],
): { nextStatus: KitchenStatus; label: string } {
  const selectedItems = items.filter((it) => selectedIds.includes(it.itemId));
  if (selectedItems.some((it) => it.status === 'new')) {
    return { nextStatus: 'preparing', label: 'Mulai olah' };
  }
  if (selectedItems.some((it) => it.status === 'preparing')) {
    return { nextStatus: 'ready', label: 'Tandai siap' };
  }
  if (selectedItems.length > 0 && selectedItems.every((it) => it.status === 'ready')) {
    return { nextStatus: 'served', label: 'Sajikan' };
  }
  return { nextStatus: 'ready', label: 'Tandai siap' };
}


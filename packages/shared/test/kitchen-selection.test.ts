import { describe, expect, it } from 'vitest';
import {
  clearTicketSelection,
  getSelectedTicketItemIds,
  isAllTicketItemsSelected,
  resolveBulkNextStatus,
  toggleAllTicketItems,
  toggleTicketItemSelection,
} from '../src/kitchen-selection';
import type { KitchenRow } from '../src/kitchen';

describe('kitchen-selection', () => {
  it('toggleTicketItemSelection toggles item IDs correctly', () => {
    let sel: Record<string, string[]> = {};
    sel = toggleTicketItemSelection(sel, 'ord-1', 'item-1');
    expect(sel['ord-1']).toEqual(['item-1']);

    sel = toggleTicketItemSelection(sel, 'ord-1', 'item-2');
    expect(sel['ord-1']).toEqual(['item-1', 'item-2']);

    sel = toggleTicketItemSelection(sel, 'ord-1', 'item-1');
    expect(sel['ord-1']).toEqual(['item-2']);

    sel = toggleTicketItemSelection(sel, 'ord-1', 'item-2');
    expect(sel['ord-1']).toBeUndefined();
  });

  it('toggleAllTicketItems selects all or deselects all', () => {
    let sel: Record<string, string[]> = {};
    const items = ['it-1', 'it-2', 'it-3'];

    sel = toggleAllTicketItems(sel, 'ord-1', items);
    expect(sel['ord-1']).toEqual(items);
    expect(isAllTicketItemsSelected(sel, 'ord-1', items)).toBe(true);

    sel = toggleAllTicketItems(sel, 'ord-1', items);
    expect(sel['ord-1']).toBeUndefined();
    expect(isAllTicketItemsSelected(sel, 'ord-1', items)).toBe(false);
  });

  it('clearTicketSelection and getSelectedTicketItemIds behave properly', () => {
    let sel: Record<string, string[]> = { 'ord-1': ['it-1', 'it-2'] };
    expect(getSelectedTicketItemIds(sel, 'ord-1')).toEqual(['it-1', 'it-2']);
    expect(getSelectedTicketItemIds(sel, 'ord-2')).toEqual([]);

    sel = clearTicketSelection(sel, 'ord-1');
    expect(getSelectedTicketItemIds(sel, 'ord-1')).toEqual([]);
  });

  it('resolveBulkNextStatus determines proper next step', () => {
    const rows: KitchenRow[] = [
      { itemId: '1', orderId: 'o1', orderNumber: 'A1', orderType: 'dine_in', name: 'Nasi Goreng', qty: 1, extras: [], status: 'new', sentAt: '', statusAt: '' },
      { itemId: '2', orderId: 'o1', orderNumber: 'A1', orderType: 'dine_in', name: 'Es Teh', qty: 2, extras: [], status: 'preparing', sentAt: '', statusAt: '' },
      { itemId: '3', orderId: 'o1', orderNumber: 'A1', orderType: 'dine_in', name: 'Kopi', qty: 1, extras: [], status: 'ready', sentAt: '', statusAt: '' },
    ];

    // Mix containing 'new' -> next is preparing
    expect(resolveBulkNextStatus(rows, ['1', '2'])).toEqual({ nextStatus: 'preparing', label: 'Mulai olah' });

    // Only 'preparing' -> next is ready
    expect(resolveBulkNextStatus(rows, ['2'])).toEqual({ nextStatus: 'ready', label: 'Tandai siap' });

    // Only 'ready' -> next is served
    expect(resolveBulkNextStatus(rows, ['3'])).toEqual({ nextStatus: 'served', label: 'Sajikan' });
  });
});


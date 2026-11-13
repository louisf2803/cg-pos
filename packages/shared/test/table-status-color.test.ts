import { describe, expect, it } from 'vitest';
import { resolveTableColorStatus, TABLE_COLOR_CONFIG } from '../src/table-status-color';
import type { TableSettings } from '../src/table-layout';
import type { TableStatus } from '../src/types';

describe('resolveTableColorStatus', () => {
  const emptyTable: TableStatus = {
    id: 't-1',
    floorId: 'f-1',
    name: 'Meja 01',
    sort: 1,
  };

  it('mengembalikan status empty (putih/abu) untuk meja tanpa pesanan', () => {
    const res = resolveTableColorStatus({ table: emptyTable });
    expect(res.status).toBe('empty');
    expect(res.label).toBe('Kosong');
  });

  it('mengembalikan status seated (biru) untuk tamu duduk tanpa pesanan', () => {
    const res = resolveTableColorStatus({ table: emptyTable, isSeated: true });
    expect(res.status).toBe('seated');
    expect(res.label).toBe('Tamu Duduk');
  });

  it('mengembalikan status occupied (hijau) untuk meja dengan pesanan normal', () => {
    const tableWithOrder: TableStatus = {
      ...emptyTable,
      order: {
        id: 'o-1',
        number: 'ORD-001',
        total: 50000,
        openedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    };
    const res = resolveTableColorStatus({ table: tableWithOrder });
    expect(res.status).toBe('occupied');
    expect(res.label).toBe('Terisi');
  });

  it('mengembalikan status bill_printed (ungu) jika struk sementara sudah dicetak', () => {
    const tableWithOrder: TableStatus = {
      ...emptyTable,
      order: {
        id: 'o-1',
        number: 'ORD-001',
        total: 50000,
        openedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    };
    const res = resolveTableColorStatus({ table: tableWithOrder, isBillPrinted: true });
    expect(res.status).toBe('bill_printed');
    expect(res.label).toBe('Tagihan Dicetak');
  });

  it('mengembalikan status warning (kuning) jika batas waktu mendekati habis', () => {
    const openedAt = new Date('2026-11-13T10:00:00Z');
    const now = new Date('2026-11-13T11:20:00Z'); // 80 menit kemudian
    const tableWithOrder: TableStatus = {
      ...emptyTable,
      order: {
        id: 'o-1',
        number: 'ORD-001',
        total: 50000,
        openedAt: openedAt.toISOString(),
      },
    };
    const settings: TableSettings = {
      timeLimitEnabled: true,
      timeLimitMinutes: 90,
      reminderEnabled: true,
      reminderBeforeMinutes: 15, // threshold: 75 menit
      minBillEnabled: false,
      minBill: 0,
      labelEnabled: false,
      label: '',
    };
    const res = resolveTableColorStatus({ table: tableWithOrder, now, settings });
    expect(res.status).toBe('warning');
    expect(res.label).toBe('Waktu Menipis');
  });

  it('mengembalikan status overdue (merah) jika batas waktu telah terlewati', () => {
    const openedAt = new Date('2026-11-13T10:00:00Z');
    const now = new Date('2026-11-13T11:35:00Z'); // 95 menit kemudian (> 90m)
    const tableWithOrder: TableStatus = {
      ...emptyTable,
      order: {
        id: 'o-1',
        number: 'ORD-001',
        total: 50000,
        openedAt: openedAt.toISOString(),
      },
    };
    const settings: TableSettings = {
      timeLimitEnabled: true,
      timeLimitMinutes: 90,
      reminderEnabled: true,
      reminderBeforeMinutes: 15,
      minBillEnabled: false,
      minBill: 0,
      labelEnabled: false,
      label: '',
    };
    const res = resolveTableColorStatus({ table: tableWithOrder, now, settings });
    expect(res.status).toBe('overdue');
    expect(res.label).toBe('Waktu Habis');
  });
});

import { describe, expect, it } from 'vitest';
import { buildKitchenReport } from '../src/kitchen-report';
import type { KitchenTicket } from '../src/kitchen';
import type { Order } from '../src/types';

describe('buildKitchenReport', () => {
  const products = [
    { id: 'p1', name: 'Nasi Goreng Spesial', categoryId: 'cat-makanan' },
    { id: 'p2', name: 'Es Teh Manis', categoryId: 'cat-minuman' },
    { id: 'p3', name: 'Kopi Susu Gula Aren', categoryId: 'cat-minuman' },
  ];

  const categories = [
    { id: 'cat-makanan', name: 'Makanan' },
    { id: 'cat-minuman', name: 'Minuman' },
  ];

  it('menghitung tiket, waktu rata-rata per stasiun, per jam, dan status tiket', () => {
    const tickets: KitchenTicket[] = [
      {
        orderId: 'ord-1',
        orderNumber: 'ORD-001',
        orderType: 'dine_in',
        lane: 'ready',
        sentAt: '2026-11-10T11:00:00Z',
        items: [
          // Nasi Goreng: dikirim jam 11:00, siap jam 11:15 (15 menit)
          {
            itemId: 'it-1',
            orderId: 'ord-1',
            orderNumber: 'ORD-001',
            orderType: 'dine_in',
            name: 'Nasi Goreng Spesial',
            qty: 2,
            extras: [],
            status: 'ready',
            sentAt: '2026-11-10T11:00:00Z',
            statusAt: '2026-11-10T11:15:00Z',
          },
          // Es Teh Manis: dikirim jam 11:00, siap jam 11:05 (5 menit)
          {
            itemId: 'it-2',
            orderId: 'ord-1',
            orderNumber: 'ORD-001',
            orderType: 'dine_in',
            name: 'Es Teh Manis',
            qty: 2,
            extras: [],
            status: 'ready',
            sentAt: '2026-11-10T11:00:00Z',
            statusAt: '2026-11-10T11:05:00Z',
          },
        ],
      },
      {
        orderId: 'ord-2',
        orderNumber: 'ORD-002',
        orderType: 'takeaway',
        lane: 'preparing',
        sentAt: '2026-11-10T11:20:00Z',
        items: [
          // Kopi Susu: sedang diproses (belum siap)
          {
            itemId: 'it-3',
            orderId: 'ord-2',
            orderNumber: 'ORD-002',
            orderType: 'takeaway',
            name: 'Kopi Susu Gula Aren',
            qty: 1,
            extras: [],
            status: 'preparing',
            sentAt: '2026-11-10T11:20:00Z',
            statusAt: '2026-11-10T11:20:00Z',
          },
        ],
      },
    ];

    const voidedOrders: Order[] = [
      {
        id: 'ord-void-1',
        number: 'ORD-VOID-01',
        type: 'dine_in',
        status: 'void',
        items: [],
        subtotal: 25000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 25000,
        paidTotal: 0,
        payments: [],
        openedAt: '2026-11-10T11:10:00Z',
        closedAt: '2026-11-10T11:12:00Z',
        cashierId: 'emp-1',
      },
    ];

    const report = buildKitchenReport({
      tickets,
      voidedOrders,
      products,
      categories,
      timezone: 'Asia/Jakarta',
    });

    // Totals
    expect(report.totals.totalTickets).toBe(2);
    expect(report.totals.completedTickets).toBe(1);
    expect(report.totals.inProgressTickets).toBe(1);
    expect(report.totals.cancelledTickets).toBe(1);
    expect(report.totals.totalItems).toBe(5); // 2 + 2 + 1
    expect(report.totals.readyItems).toBe(4); // 2 + 2
    // Rata-rata menit: (2 qty * 15 mnt + 2 qty * 5 mnt) / 4 = (30 + 10) / 4 = 10 menit
    expect(report.totals.avgReadyMinutes).toBe(10);

    // Stasiun Makanan
    const makanan = report.byStation.find((s) => s.stationName === 'Makanan');
    expect(makanan).toBeDefined();
    expect(makanan?.ticketCount).toBe(1);
    expect(makanan?.itemCount).toBe(2);
    expect(makanan?.readyItemCount).toBe(2);
    expect(makanan?.avgReadyMinutes).toBe(15);

    // Stasiun Minuman
    const minuman = report.byStation.find((s) => s.stationName === 'Minuman');
    expect(minuman).toBeDefined();
    expect(minuman?.ticketCount).toBe(2);
    expect(minuman?.itemCount).toBe(3); // 2 es teh + 1 kopi
    expect(minuman?.readyItemCount).toBe(2); // 2 es teh
    expect(minuman?.avgReadyMinutes).toBe(5);

    // Status Breakdown
    const readyStatus = report.byStatus.find((s) => s.status === 'ready');
    expect(readyStatus?.ticketCount).toBe(1);
    expect(readyStatus?.itemCount).toBe(4);

    const preparingStatus = report.byStatus.find((s) => s.status === 'preparing');
    expect(preparingStatus?.ticketCount).toBe(1);
    expect(preparingStatus?.itemCount).toBe(1);
  });

  it('menangani daftar tiket kosong dengan aman', () => {
    const report = buildKitchenReport({ tickets: [] });
    expect(report.totals.totalTickets).toBe(0);
    expect(report.totals.completedTickets).toBe(0);
    expect(report.totals.inProgressTickets).toBe(0);
    expect(report.totals.cancelledTickets).toBe(0);
    expect(report.totals.totalItems).toBe(0);
    expect(report.totals.avgReadyMinutes).toBeNull();
    expect(report.byStation.length).toBe(0);
    expect(report.byHour.length).toBe(0);
  });
});

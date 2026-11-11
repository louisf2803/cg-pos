import { describe, expect, it } from 'vitest';
import {
  formatStockAlertSeenValue,
  getStockAlertSeenKey,
  groupStockAlerts,
  isStockAlertSeen,
} from '../src/stock-alerts';
import type { StockItem } from '../src/stock';

describe('Stock Alerts Notification Helper', () => {
  it('mengelompokkan item stok berdasarkan status minus, habis, dan menipis dengan benar', () => {
    const items: StockItem[] = [
      { productId: '1', name: 'Kopi Arabika', kind: 'ingredient', unit: 'g', qty: -50, avgCost: 200, value: 0, minQty: 100, status: 'negative' },
      { productId: '2', name: 'Susu UHT', kind: 'ingredient', unit: 'ml', qty: 0, avgCost: 18, value: 0, minQty: 1000, status: 'out' },
      { productId: '3', name: 'Gula Pasir', kind: 'ingredient', unit: 'g', qty: 300, avgCost: 15, value: 4500, minQty: 500, status: 'low' },
      { productId: '4', name: 'Cup 12oz', kind: 'goods', unit: 'pcs', qty: 500, avgCost: 400, value: 200000, minQty: 100, status: 'ok' },
      { productId: '5', name: 'Sirup Karamel', kind: 'ingredient', unit: 'ml', qty: 0, avgCost: 90, value: 0, minQty: 200, status: 'out' },
    ];

    const alerts = groupStockAlerts(items);

    expect(alerts.hasAlerts).toBe(true);
    expect(alerts.totalCount).toBe(4); // 1 minus + 2 out + 1 low

    expect(alerts.negative.count).toBe(1);
    expect(alerts.negative.items[0]?.name).toBe('Kopi Arabika');
    expect(alerts.negative.href).toBe('/inventori/stok?status=negative');

    expect(alerts.out.count).toBe(2);
    expect(alerts.out.items.map((i) => i.name)).toEqual(['Susu UHT', 'Sirup Karamel']);
    expect(alerts.out.href).toBe('/inventori/stok?status=out');

    expect(alerts.low.count).toBe(1);
    expect(alerts.low.items[0]?.name).toBe('Gula Pasir');
    expect(alerts.low.href).toBe('/inventori/stok?status=low');

    expect(alerts.groups).toHaveLength(3);
  });

  it('mengembalikan hasAlerts = false dan groups kosong bila semua stok aman', () => {
    const items: StockItem[] = [
      { productId: '1', name: 'Kopi Arabika', kind: 'ingredient', unit: 'g', qty: 5000, avgCost: 200, value: 1000000, minQty: 100, status: 'ok' },
      { productId: '2', name: 'Susu UHT', kind: 'ingredient', unit: 'ml', qty: 10000, avgCost: 18, value: 180000, minQty: 1000, status: 'ok' },
    ];

    const alerts = groupStockAlerts(items);

    expect(alerts.hasAlerts).toBe(false);
    expect(alerts.totalCount).toBe(0);
    expect(alerts.groups).toHaveLength(0);
  });

  it('menghasilkan kunci penyimpanan lokal harian yang konsisten', () => {
    const key = getStockAlertSeenKey('2026-11-11');
    expect(key).toBe('cgpos:stock-notif-seen:2026-11-11');
  });

  it('menangani logika penyimpanan status sudah dilihat dengan benar', () => {
    // Belum pernah dilihat
    expect(isStockAlertSeen(null, 5)).toBe(false);
    expect(isStockAlertSeen(undefined, 5)).toBe(false);
    expect(isStockAlertSeen('', 5)).toBe(false);

    // Format string dilihat
    const stored = formatStockAlertSeenValue(3);
    expect(isStockAlertSeen(stored, 3)).toBe(true);
    expect(isStockAlertSeen(stored, 2)).toBe(true);

    // Jumlah notifikasi baru bertambah (misal dari 3 menjadi 4 item perlu perhatian) -> aktifkan kembali
    expect(isStockAlertSeen(stored, 4)).toBe(false);
  });
});


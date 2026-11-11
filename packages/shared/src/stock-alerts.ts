import type { StockItem } from './stock';

export interface StockAlertGroup {
  status: 'negative' | 'out' | 'low';
  label: string;
  count: number;
  items: StockItem[];
  href: string;
  badgeClass: string;
}

export interface StockAlertsSummary {
  totalCount: number;
  negative: StockAlertGroup;
  out: StockAlertGroup;
  low: StockAlertGroup;
  groups: StockAlertGroup[];
  hasAlerts: boolean;
}

/**
 * Mengelompokkan item stok yang membutuhkan perhatian (minus, habis, di bawah minimum).
 */
export function groupStockAlerts(items: StockItem[]): StockAlertsSummary {
  const negativeItems: StockItem[] = [];
  const outItems: StockItem[] = [];
  const lowItems: StockItem[] = [];

  for (const item of items) {
    if (item.status === 'negative') {
      negativeItems.push(item);
    } else if (item.status === 'out') {
      outItems.push(item);
    } else if (item.status === 'low') {
      lowItems.push(item);
    }
  }

  const negativeGroup: StockAlertGroup = {
    status: 'negative',
    label: 'Stok minus',
    count: negativeItems.length,
    items: negativeItems,
    href: '/inventori/stok?status=negative',
    badgeClass: 'cg-badge--danger',
  };

  const outGroup: StockAlertGroup = {
    status: 'out',
    label: 'Stok habis',
    count: outItems.length,
    items: outItems,
    href: '/inventori/stok?status=out',
    badgeClass: 'cg-badge--danger',
  };

  const lowGroup: StockAlertGroup = {
    status: 'low',
    label: 'Stok menipis (di bawah batas minimum)',
    count: lowItems.length,
    items: lowItems,
    href: '/inventori/stok?status=low',
    badgeClass: 'cg-badge--warning',
  };

  const groups = [negativeGroup, outGroup, lowGroup].filter((g) => g.count > 0);
  const totalCount = negativeItems.length + outItems.length + lowItems.length;

  return {
    totalCount,
    negative: negativeGroup,
    out: outGroup,
    low: lowGroup,
    groups,
    hasAlerts: totalCount > 0,
  };
}

/**
 * Kunci penyimpanan lokal untuk status 'sudah dilihat' per tanggal hari ini (WIB/lokal).
 */
export function getStockAlertSeenKey(todayDateKey: string): string {
  return `cgpos:stock-notif-seen:${todayDateKey}`;
}

/**
 * Memeriksa apakah notifikasi untuk hari ini sudah ditandai dilihat di storage.
 */
export function isStockAlertSeen(
  storageVal: string | null | undefined,
  currentCount: number
): boolean {
  if (!storageVal) return false;
  try {
    const parsed = JSON.parse(storageVal);
    // Jika jumlah notifikasi bertambah dibanding saat terakhir dilihat, tampilkan kembali lencana
    if (typeof parsed.count === 'number' && currentCount > parsed.count) {
      return false;
    }
    return Boolean(parsed.seen);
  } catch {
    return false;
  }
}

/**
 * Format string penyimpanan saat pengguna menandai notifikasi telah dilihat.
 */
export function formatStockAlertSeenValue(currentCount: number): string {
  return JSON.stringify({ seen: true, count: currentCount, at: new Date().toISOString() });
}


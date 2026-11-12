import type { TableSettings } from './table-layout';
import type { TableStatus } from './types';

/**
 * 6 Status Warna Meja Majoo:
 * 1. Putih/Abu   = Kosong / Tersedia
 * 2. Hijau       = Terisi (pesanan aktif)
 * 3. Biru        = Tamu duduk tapi belum memesan
 * 4. Ungu        = Pesanan dibuat & struk sementara dicetak
 * 5. Kuning      = Batas waktu meja hampir habis
 * 6. Merah       = Batas waktu meja habis (overstay)
 */
export type TableColorStatus =
  | 'empty'
  | 'seated'
  | 'occupied'
  | 'bill_printed'
  | 'warning'
  | 'overdue';

export interface TableColorInfo {
  status: TableColorStatus;
  label: string;
  badgeClass: string;
  cardClass: string;
  hexColor: string;
  desc: string;
}

export const TABLE_COLOR_CONFIG: Record<TableColorStatus, TableColorInfo> = {
  empty: {
    status: 'empty',
    label: 'Kosong',
    badgeClass: 'cg-badge--secondary',
    cardClass: 'bg-surface text-text border border-border hover:border-accent/40',
    hexColor: '#94a3b8',
    desc: 'Meja kosong dan siap digunakan tamu baru.',
  },
  seated: {
    status: 'seated',
    label: 'Tamu Duduk',
    badgeClass: 'cg-badge--info',
    cardClass: 'bg-info/10 text-text border border-info/40 hover:border-info',
    hexColor: '#3b82f6',
    desc: 'Tamu sudah menempati meja namun belum memilih pesanan.',
  },
  occupied: {
    status: 'occupied',
    label: 'Terisi',
    badgeClass: 'cg-badge--success',
    cardClass: 'bg-success/10 text-text border border-success/40 hover:border-success',
    hexColor: '#10b981',
    desc: 'Pesanan sudah masuk dan sedang dilayani.',
  },
  bill_printed: {
    status: 'bill_printed',
    label: 'Tagihan Dicetak',
    badgeClass: 'cg-badge',
    cardClass: 'bg-accent/15 text-text border border-accent/40 hover:border-accent',
    hexColor: '#a855f7',
    desc: 'Struk sementara/tagihan sudah dicetak untuk pelanggan.',
  },
  warning: {
    status: 'warning',
    label: 'Waktu Menipis',
    badgeClass: 'cg-badge--warning',
    cardClass: 'bg-warning/15 text-text border border-warning/50 hover:border-warning',
    hexColor: '#f59e0b',
    desc: 'Batas waktu duduk meja hampir habis (periode peringatan).',
  },
  overdue: {
    status: 'overdue',
    label: 'Waktu Habis',
    badgeClass: 'cg-badge--danger',
    cardClass: 'bg-danger/15 text-text border border-danger/50 hover:border-danger',
    hexColor: '#ef4444',
    desc: 'Batas waktu duduk meja telah terlampaui.',
  },
};

export interface ResolveTableColorInput {
  table: TableStatus;
  now?: Date;
  settings?: TableSettings | null;
  isSeated?: boolean;
  isBillPrinted?: boolean;
}

/**
 * Menghitung status warna 6-warna meja secara murni.
 */
export function resolveTableColorStatus(input: ResolveTableColorInput): TableColorInfo {
  const { table, now = new Date(), settings, isSeated, isBillPrinted } = input;

  if (table.order) {
    if (settings?.timeLimitEnabled && settings.timeLimitMinutes > 0) {
      const openedAt = new Date(table.order.openedAt).getTime();
      const current = now.getTime();
      const elapsedMin = Math.max(0, (current - openedAt) / (60 * 1000));

      if (elapsedMin >= settings.timeLimitMinutes) {
        return TABLE_COLOR_CONFIG.overdue;
      }

      const reminderBefore = settings.reminderEnabled && settings.reminderBeforeMinutes > 0
        ? settings.reminderBeforeMinutes
        : 15;
      const warningThreshold = Math.max(0, settings.timeLimitMinutes - reminderBefore);

      if (elapsedMin >= warningThreshold) {
        return TABLE_COLOR_CONFIG.warning;
      }
    }

    if (isBillPrinted) {
      return TABLE_COLOR_CONFIG.bill_printed;
    }

    return TABLE_COLOR_CONFIG.occupied;
  }

  if (isSeated) {
    return TABLE_COLOR_CONFIG.seated;
  }

  return TABLE_COLOR_CONFIG.empty;
}

'use client';

import type {
  CustomerGroup,
  CustomerGroupMember,
  GroupProductTieredPricing,
  PriceSchedule,
} from '@cgpos/shared';

const GROUPS_KEY = 'cg-a57-customer-groups';
const MEMBERS_KEY = 'cg-a57-customer-group-members';
const TIERED_KEY = 'cg-a57-tiered-prices';
const SCHEDULES_KEY = 'cg-a57-price-schedules';

const DEFAULT_GROUPS: CustomerGroup[] = [
  {
    id: 'grp-member',
    name: 'Member',
    description: 'Pelanggan terdaftar yang mengumpulkan poin dan promo anggota.',
    createdAt: '2026-11-01T02:00:00Z',
  },
  {
    id: 'grp-reseller',
    name: 'Reseller',
    description: 'Mitra pembelian grosir dengan harga bertingkat sesuai jumlah.',
    createdAt: '2026-11-01T02:05:00Z',
  },
  {
    id: 'grp-karyawan',
    name: 'Karyawan',
    description: 'Tarif khusus staf internal outlet saat bertransaksi.',
    createdAt: '2026-11-01T02:10:00Z',
  },
];

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Abaikan kuota penuh atau mode privat peramban
  }
}

export function loadCustomerGroups(): CustomerGroup[] {
  const data = safeRead<CustomerGroup[] | null>(GROUPS_KEY, null);
  if (data === null) return DEFAULT_GROUPS.map((g) => ({ ...g }));
  return Array.isArray(data) ? data : [];
}

export function saveCustomerGroups(groups: CustomerGroup[]): void {
  safeWrite(GROUPS_KEY, groups);
}

export function loadGroupMembers(): CustomerGroupMember[] {
  const data = safeRead<CustomerGroupMember[]>(MEMBERS_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function saveGroupMembers(members: CustomerGroupMember[]): void {
  safeWrite(MEMBERS_KEY, members);
}

export function loadTieredPricings(): GroupProductTieredPricing[] {
  const data = safeRead<GroupProductTieredPricing[]>(TIERED_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function saveTieredPricings(items: GroupProductTieredPricing[]): void {
  safeWrite(TIERED_KEY, items);
}

export function loadPriceSchedules(): PriceSchedule[] {
  const data = safeRead<PriceSchedule[]>(SCHEDULES_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function savePriceSchedules(schedules: PriceSchedule[]): void {
  safeWrite(SCHEDULES_KEY, schedules);
}

export function formatJakartaDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function toJakartaLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

export function parseJakartaLocalInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('+') || trimmed.endsWith('Z')) return trimmed;
  return trimmed.length === 16 ? `${trimmed}:00+07:00` : `${trimmed}+07:00`;
}


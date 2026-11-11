import type { PaymentMethod } from './types';

export type PaymentChannelKind =
  | 'cash'
  | 'qris'
  | 'ewallet'
  | 'edc'
  | 'va'
  | 'complimentary';

export const CHANNEL_LABELS: Record<PaymentChannelKind, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  ewallet: 'Dompet digital',
  edc: 'Kartu / EDC',
  va: 'Transfer / VA',
  complimentary: 'Komplimen / Gratis',
};

export interface PaymentMethodConfig {
  id: string;
  code: string;
  name: string;
  channel: PaymentChannelKind;
  baseKind: PaymentMethod['kind'];
  isActive: boolean;
  feePct: number;
  feeFixed: number;
  accountName?: string;
  accountNumber?: string;
  settlementNote?: string;
  requiresOnline: boolean;
  isBuiltIn: boolean;
}

export interface PaymentMethodOverride {
  isActive?: boolean;
  name?: string;
  channel?: PaymentChannelKind;
  feePct?: number;
  feeFixed?: number;
  accountName?: string;
  accountNumber?: string;
  settlementNote?: string;
}

/** Petakan metode bayar bawaan server ke klasifikasi kanal POS. */
export function inferPaymentChannel(
  m: Pick<PaymentMethod, 'code' | 'name' | 'kind'>
): PaymentChannelKind {
  if (m.kind === 'cash') return 'cash';
  if (m.kind === 'complimentary') return 'complimentary';
  const hay = `${m.code} ${m.name}`.toUpperCase();
  if (m.kind === 'gateway' || hay.includes('QRIS')) return 'qris';
  if (/(EWALLET|OVO|GOPAY|DANA|SHOPEE|LINKAJA|DOMPET)/.test(hay)) return 'ewallet';
  if (/(TRANSFER|TRF|\bVA\b|BANK)/.test(hay)) return 'va';
  return 'edc';
}

/** Gabungkan daftar metode bayar bawaan server dengan penyesuaian dan metode tambahan lokal. */
export function mergePaymentMethodConfigs(
  serverMethods: PaymentMethod[],
  overrides: Record<string, PaymentMethodOverride>,
  customMethods: PaymentMethodConfig[]
): PaymentMethodConfig[] {
  const builtIn: PaymentMethodConfig[] = serverMethods.map((m) => {
    const ov = overrides[m.id] ?? {};
    const inferredChannel = inferPaymentChannel(m);
    // Metode gateway QRIS bawaan dijaga nonaktif di pratinjau sampai integrasi server aktif.
    const defaultActive = m.kind === 'gateway' ? false : true;
    const isGateway = m.kind === 'gateway';
    return {
      id: m.id,
      code: m.code,
      name: (ov.name ?? m.name).trim() || m.name,
      channel: ov.channel ?? inferredChannel,
      baseKind: m.kind,
      isActive: isGateway ? false : (ov.isActive ?? defaultActive),
      feePct: typeof ov.feePct === 'number' && Number.isFinite(ov.feePct) ? ov.feePct : 0,
      feeFixed: typeof ov.feeFixed === 'number' && Number.isFinite(ov.feeFixed) ? ov.feeFixed : 0,
      accountName: ov.accountName,
      accountNumber: ov.accountNumber,
      settlementNote:
        ov.settlementNote ??
        (isGateway
          ? 'Gateway QRIS/pembayaran otomatis memerlukan aktivasi di server (nonaktif pada pratinjau).'
          : undefined),
      requiresOnline: m.requiresOnline,
      isBuiltIn: true,
    };
  });

  const extra = customMethods.map((c) => ({
    ...c,
    isBuiltIn: false,
  }));

  return [...builtIn, ...extra];
}

/** Validasi aturan metode pembayaran baru maupun yang diubah. */
export function paymentMethodProblem(
  input: {
    name: string;
    code: string;
    channel: PaymentChannelKind;
    feePct: number;
    feeFixed: number;
    accountNumber?: string;
    settlementNote?: string;
  },
  existing: PaymentMethodConfig[] = [],
  editingId?: string
): string | null {
  const cleanName = input.name.trim();
  const cleanCode = input.code.trim().toUpperCase();
  if (!cleanName) return 'Nama metode pembayaran wajib diisi.';
  if (cleanName.length > 50) return 'Nama metode pembayaran maksimal 50 karakter.';
  if (!cleanCode) return 'Kode metode wajib diisi.';
  if (!/^[A-Z0-9_-]{2,20}$/.test(cleanCode)) {
    return 'Kode metode hanya boleh huruf kapital, angka, garis bawah, atau tanda hubung (2-20 karakter).';
  }
  const dupCode = existing.some(
    (m) => m.id !== editingId && m.code.trim().toUpperCase() === cleanCode
  );
  if (dupCode) return `Kode "${cleanCode}" sudah dipakai metode lain.`;

  if (!Number.isFinite(input.feePct) || input.feePct < 0 || input.feePct > 25) {
    return 'Persentase biaya (MDR) harus antara 0% sampai 25%.';
  }
  if (!Number.isFinite(input.feeFixed) || !Number.isInteger(input.feeFixed) || input.feeFixed < 0 || input.feeFixed > 500_000) {
    return 'Biaya tetap harus bilangan bulat rupiah 0 sampai 500.000.';
  }
  if ((input.accountNumber ?? '').trim().length > 40) {
    return 'Nomor rekening / terminal maksimal 40 karakter.';
  }
  if ((input.settlementNote ?? '').trim().length > 160) {
    return 'Catatan pencairan maksimal 160 karakter.';
  }
  return null;
}

/** Hitung potongan MDR / biaya layanan dan nilai bersih diterima dalam rupiah bulat. */
export function computePaymentFee(
  grossAmount: number,
  cfg: Pick<PaymentMethodConfig, 'feePct' | 'feeFixed'>
): { fee: number; net: number } {
  const safeGross = Math.max(0, Math.round(grossAmount));
  const pctFee = Math.round((safeGross * Math.max(0, cfg.feePct)) / 100);
  const fixedFee = safeGross > 0 ? Math.max(0, Math.round(cfg.feeFixed)) : 0;
  const totalFee = Math.min(safeGross, pctFee + fixedFee);
  return {
    fee: totalFee,
    net: safeGross - totalFee,
  };
}

export type OnlineChannelId =
  | 'mandiri'
  | 'delivery'
  | 'marketplace'
  | 'kios'
  | 'aplikasi';

export type OnlineChannelStatus = 'active' | 'paused' | 'setup';

export const ONLINE_STATUS_LABELS: Record<OnlineChannelStatus, string> = {
  active: 'Aktif menerima pesanan',
  paused: 'Dijeda sementara',
  setup: 'Perlu dihubungkan',
};

export interface OnlineChannelConfig {
  id: OnlineChannelId;
  name: string;
  href: string;
  categoryLabel: string;
  description: string;
  status: OnlineChannelStatus;
  autoAccept: boolean;
  prepMinutes: number;
  priceMarkupPct: number;
  openHours: string;
  storefrontSlug?: string;
}

export const DEFAULT_ONLINE_CHANNELS: OnlineChannelConfig[] = [
  {
    id: 'mandiri',
    name: 'CG Order QR Meja',
    href: '/order-online/mandiri',
    categoryLabel: 'Pemesanan Mandiri',
    description: 'Pelanggan memindai kode QR meja untuk melihat menu dan mengirim pesanan langsung ke dapur.',
    status: 'active',
    autoAccept: true,
    prepMinutes: 10,
    priceMarkupPct: 0,
    openHours: '08:00 - 22:00',
    storefrontSlug: 'qr-meja-outlet',
  },
  {
    id: 'delivery',
    name: 'CG Order Pesan-Antar',
    href: '/order-online/delivery',
    categoryLabel: 'Pesan-Antar Makanan',
    description: 'Penerimaan pesanan dari mitra pesan-antar makanan dan kurir lokal dalam satu antrean.',
    status: 'paused',
    autoAccept: false,
    prepMinutes: 20,
    priceMarkupPct: 15,
    openHours: '09:00 - 21:00',
  },
  {
    id: 'marketplace',
    name: 'Integrasi Marketplace CG',
    href: '/order-online/marketplace',
    categoryLabel: 'Toko Daring',
    description: 'Sinkronisasi stok produk kemasan dan status pemenuhan pesanan dari etalase daring.',
    status: 'setup',
    autoAccept: false,
    prepMinutes: 30,
    priceMarkupPct: 0,
    openHours: '09:00 - 17:00',
  },
  {
    id: 'kios',
    name: 'CG Kios Mandiri',
    href: '/order-online/kios',
    categoryLabel: 'Layar Konter',
    description: 'Kios layar sentuh di area kasir agar pelanggan dapat memilih menu dan membayar lebih cepat.',
    status: 'setup',
    autoAccept: true,
    prepMinutes: 10,
    priceMarkupPct: 0,
    openHours: '08:00 - 22:00',
  },
  {
    id: 'aplikasi',
    name: 'CG Order Aplikasi Konsumen',
    href: '/order-online/aplikasi',
    categoryLabel: 'Web & Aplikasi Sendiri',
    description: 'Halaman web pemesanan CG Order bermerek outlet sendiri untuk ambil sendiri atau antar.',
    status: 'active',
    autoAccept: false,
    prepMinutes: 15,
    priceMarkupPct: 0,
    openHours: '08:00 - 22:00',
    storefrontSlug: 'pesan-cg-order',
  },
];

/** Gabungkan konfigurasi bawaan kanal CG Order dengan perubahan tersimpan lokal. */
export function mergeOnlineChannels(
  stored: Partial<OnlineChannelConfig>[] = []
): OnlineChannelConfig[] {
  const map = new Map<OnlineChannelId, Partial<OnlineChannelConfig>>();
  for (const item of stored) {
    if (item && item.id) map.set(item.id, item);
  }
  return DEFAULT_ONLINE_CHANNELS.map((base) => {
    const patch = map.get(base.id);
    if (!patch) return { ...base };
    return {
      ...base,
      status: patch.status === 'active' || patch.status === 'paused' || patch.status === 'setup' ? patch.status : base.status,
      autoAccept: typeof patch.autoAccept === 'boolean' ? patch.autoAccept : base.autoAccept,
      prepMinutes:
        typeof patch.prepMinutes === 'number' && Number.isFinite(patch.prepMinutes)
          ? patch.prepMinutes
          : base.prepMinutes,
      priceMarkupPct:
        typeof patch.priceMarkupPct === 'number' && Number.isFinite(patch.priceMarkupPct)
          ? patch.priceMarkupPct
          : base.priceMarkupPct,
      openHours: typeof patch.openHours === 'string' && patch.openHours.trim() ? patch.openHours.trim() : base.openHours,
      storefrontSlug:
        typeof patch.storefrontSlug === 'string' && patch.storefrontSlug.trim()
          ? patch.storefrontSlug.trim()
          : base.storefrontSlug,
    };
  });
}

/** Validasi setelan operasional satu kanal order online. */
export function onlineChannelProblem(
  input: Pick<OnlineChannelConfig, 'name' | 'prepMinutes' | 'priceMarkupPct' | 'openHours'>
): string | null {
  if (!input.name.trim()) return 'Nama kanal wajib diisi.';
  if (!Number.isInteger(input.prepMinutes) || input.prepMinutes < 1 || input.prepMinutes > 240) {
    return 'Estimasi waktu persiapan harus antara 1 sampai 240 menit.';
  }
  if (!Number.isFinite(input.priceMarkupPct) || input.priceMarkupPct < 0 || input.priceMarkupPct > 100) {
    return 'Penyesuaian harga kanal harus antara 0% sampai 100%.';
  }
  if (!input.openHours.trim() || input.openHours.trim().length > 40) {
    return 'Jam operasional wajib diisi (maksimal 40 karakter).';
  }
  return null;
}

/** Hitung ringkasan kesiapan kanal CG Order. */
export function summarizeOnlineChannels(channels: OnlineChannelConfig[]): {
  total: number;
  activeCount: number;
  pausedCount: number;
  setupCount: number;
} {
  let activeCount = 0;
  let pausedCount = 0;
  let setupCount = 0;
  for (const ch of channels) {
    if (ch.status === 'active') activeCount++;
    else if (ch.status === 'paused') pausedCount++;
    else setupCount++;
  }
  return {
    total: channels.length,
    activeCount,
    pausedCount,
    setupCount,
  };
}


import { ROLE_ACCESS, type Access, type Permission, type Role } from './permissions';

export type DashboardAccessLevel = 'none' | 'read' | 'write';
export type PosAccessLevel = Access; // 'allow' | 'approve' | 'deny'
export type PosPermissionId = Permission | 'open_cash_drawer' | 'price_override';

export type PermissionActionKey = 'lihat' | 'buat' | 'ubah' | 'hapus' | 'void';

export interface ActionPermissionSet {
  lihat: boolean | null;
  buat: boolean | null;
  ubah: boolean | null;
  hapus: boolean | null;
  void: boolean | null;
}

export interface SubFeatureDef {
  id: string;
  label: string;
  supportedActions: readonly PermissionActionKey[];
}

export interface FeaturePermissionDef {
  id: string;
  label: string;
  description: string;
  /** Rute halaman bila fitur ini dapat dijadikan halaman awal */
  pageId?: string;
  subFeatures: readonly SubFeatureDef[];
}

export interface AccessModuleDef {
  id: string;
  label: string;
  /** Tab Pengaturan POS default aktif & terkunci abu-abu mengikuti perilaku Majoo */
  masterLocked?: boolean;
  features: readonly FeaturePermissionDef[];
}

export interface PosGranularPermission {
  id: PosPermissionId;
  label: string;
  description: string;
  requiresApprovalOption?: boolean;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  baseRole: Role;
  ownerAppAccess?: boolean;
  /** Kompatibilitas tingkat modul Dashboard */
  dashboardPerms: Record<string, DashboardAccessLevel>;
  /** Kompatibilitas aksi kasir POS */
  posPerms: Record<string, PosAccessLevel>;
  /** Master ON/OFF per modul Dashboard (Langkah 2 wizard) */
  dashboardModuleEnabled?: Record<string, boolean>;
  /** Toggle ON/OFF per fitur Dashboard */
  dashboardFeatureEnabled?: Record<string, boolean>;
  /** Izin granular sub-fitur Dashboard: kunci `${featureId}:${subFeatureId}` */
  dashboardSubFeaturePerms?: Record<string, ActionPermissionSet>;
  /** Toggle master Akses Aplikasi Kasir (POS) (Langkah 3 wizard) */
  posAppEnabled?: boolean;
  /** Master ON/OFF per modul POS */
  posModuleEnabled?: Record<string, boolean>;
  /** Toggle ON/OFF per fitur POS */
  posFeatureEnabled?: Record<string, boolean>;
  /** Izin granular sub-fitur POS: kunci `${featureId}:${subFeatureId}` */
  posSubFeaturePerms?: Record<string, ActionPermissionSet>;
  /** Pengaturan otorisasi atasan di POS (Langkah 4 — "Otorisasi Oleh") */
  canAuthorizeRefund?: boolean;
  canAuthorizeVoid?: boolean;
  canAuthorizeComplimentary?: boolean;
  /** Halaman awal begitu pengguna login */
  defaultDashboardPage?: string;
  defaultPosPage?: string;
}

export const BUILT_IN_ROLE_IDS: readonly Role[] = ['owner', 'manager', 'cashier'] as const;

export const PERMISSION_ACTION_KEYS: readonly PermissionActionKey[] = [
  'lihat',
  'buat',
  'ubah',
  'hapus',
  'void',
] as const;

export const PERMISSION_ACTION_LABEL: Record<PermissionActionKey, string> = {
  lihat: 'LIHAT',
  buat: 'BUAT',
  ubah: 'UBAH',
  hapus: 'HAPUS',
  void: 'VOID',
};

export const DASHBOARD_ACCESS_MODULES: readonly AccessModuleDef[] = [
  {
    id: 'penjualan',
    label: 'Penjualan',
    features: [
      {
        id: 'dash-overview',
        label: 'Dashboard Penjualan',
        description: 'Ringkasan omzet harian, grafik tren, dan status outlet',
        pageId: '/',
        subFeatures: [
          { id: 'ringkasan', label: 'Kartu ringkasan & grafik penjualan', supportedActions: ['lihat'] },
        ],
      },
      {
        id: 'dash-laporan',
        label: 'Laporan',
        description: 'Laporan transaksi, pajak, kasir, dan ekspor laporan',
        pageId: '/laporan',
        subFeatures: [
          { id: 'lap-penjualan', label: 'Laporan penjualan & jenis bayar', supportedActions: ['lihat'] },
          { id: 'lap-ekspor', label: 'Ekspor CSV & unduh laporan', supportedActions: ['lihat', 'buat'] },
        ],
      },
      {
        id: 'dash-analisa',
        label: 'Analisa Laporan',
        description: 'Waktu teramai, perputaran stok, dan performa produk',
        pageId: '/analisa/produk',
        subFeatures: [
          { id: 'analisa-data', label: 'Analisa produk & jam teramai', supportedActions: ['lihat'] },
        ],
      },
      {
        id: 'dash-produk',
        label: 'Produk & Harga',
        description: 'Katalog menu, kategori, ekstra, dan harga produk',
        pageId: '/produk',
        subFeatures: [
          { id: 'produk-katalog', label: 'Daftar produk & varian', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
          { id: 'produk-kategori', label: 'Kategori, ekstra & resep', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
      {
        id: 'dash-inventori',
        label: 'Inventori & Pembelian',
        description: 'Stok bahan, opname, pemesanan, faktur pembelian, dan retur',
        pageId: '/inventori/stok',
        subFeatures: [
          { id: 'inv-stok', label: 'Kartu stok, opname & transfer', supportedActions: ['lihat', 'buat', 'ubah'] },
          { id: 'inv-pembelian', label: 'Pesanan, faktur & bayar pembelian', supportedActions: ['lihat', 'buat', 'ubah', 'void'] },
          { id: 'inv-retur', label: 'Retur pembelian ke pemasok', supportedActions: ['lihat', 'buat', 'hapus'] },
        ],
      },
      {
        id: 'dash-pelanggan',
        label: 'Pelanggan & Promosi',
        description: 'Database pelanggan, kupon, program promo, dan poin',
        pageId: '/pelanggan',
        subFeatures: [
          { id: 'pel-daftar', label: 'Daftar & profil pelanggan', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
          { id: 'promo-program', label: 'Promo, kupon & loyalti', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
      {
        id: 'dash-komisi',
        label: 'Komisi & Dapur',
        description: 'Aturan grup komisi staf dan monitor layar dapur',
        pageId: '/komisi',
        subFeatures: [
          { id: 'komisi-grup', label: 'Grup & tarif komisi karyawan', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
          { id: 'dapur-layar', label: 'Tampilan monitor dapur (KDS)', supportedActions: ['lihat', 'ubah'] },
        ],
      },
    ],
  },
  {
    id: 'order-online',
    label: 'Order Online',
    features: [
      {
        id: 'oo-pesanan',
        label: 'Pesanan Order Online',
        description: 'Pantau dan terima pesanan dari kanal pemesanan daring',
        pageId: '/order-online',
        subFeatures: [
          { id: 'oo-daftar', label: 'Daftar & konfirmasi pesanan masuk', supportedActions: ['lihat', 'ubah', 'void'] },
        ],
      },
    ],
  },
  {
    id: 'appointment',
    label: 'Appointment',
    features: [
      {
        id: 'apt-jadwal',
        label: 'Jadwal Appointment',
        description: 'Kelola reservasi jasa, fasilitas ruang, dan meja',
        pageId: '/appointment',
        subFeatures: [
          { id: 'apt-kelola', label: 'Daftar & kalender reservasi', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
    ],
  },
  {
    id: 'karyawan',
    label: 'Karyawan',
    features: [
      {
        id: 'kar-daftar',
        label: 'Data Karyawan',
        description: 'Tambah staf, ubah peran dasar, dan kelola status aktif',
        pageId: '/pengaturan/karyawan',
        subFeatures: [
          { id: 'kar-staf', label: 'Daftar akun karyawan & PIN', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
      {
        id: 'kar-hak-akses',
        label: 'Pengaturan Hak Akses',
        description: 'Buat dan kelola matriks hak akses peran kustom',
        pageId: '/karyawan/hak-akses',
        subFeatures: [
          { id: 'kar-peran', label: 'Wizard peran & hak akses khusus', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
    ],
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    features: [
      {
        id: 'keu-kas',
        label: 'Kas, Bank & Biaya',
        description: 'Penerimaan, pengeluaran kas, biaya operasional, dan transfer',
        pageId: '/keuangan/kas',
        subFeatures: [
          { id: 'keu-kas-transaksi', label: 'Catat kas masuk, keluar & biaya', supportedActions: ['lihat', 'buat', 'ubah', 'void'] },
        ],
      },
      {
        id: 'keu-akuntansi',
        label: 'Jurnal, Buku Besar & Rekonsiliasi',
        description: 'Daftar akun COA, jurnal umum, saldo awal, dan laporan keuangan',
        pageId: '/keuangan/laporan',
        subFeatures: [
          { id: 'keu-jurnal', label: 'Jurnal manual & saldo awal', supportedActions: ['lihat', 'buat', 'ubah', 'void'] },
          { id: 'keu-laporan', label: 'Laba rugi, neraca & arus kas', supportedActions: ['lihat'] },
        ],
      },
    ],
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan',
    features: [
      {
        id: 'set-outlet',
        label: 'Pengaturan Outlet, Struk & Pajak',
        description: 'Profil outlet, editor templat struk, pajak, dan pembulatan',
        pageId: '/pengaturan/struk',
        subFeatures: [
          { id: 'set-struk', label: 'Tampilan & isi struk pelanggan', supportedActions: ['lihat', 'ubah'] },
          { id: 'set-pajak', label: 'Aturan pajak & biaya layanan', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
        ],
      },
      {
        id: 'set-denah',
        label: 'Denah Meja & Stasiun Cetak',
        description: 'Pengaturan lantai, posisi meja kustom, dan stasiun printer',
        pageId: '/pengaturan/denah',
        subFeatures: [
          { id: 'set-meja', label: 'Lantai, meja & pengaturan meja', supportedActions: ['lihat', 'buat', 'ubah', 'hapus'] },
          { id: 'set-kode', label: 'Kode otorisasi kasir', supportedActions: ['lihat', 'buat', 'void'] },
        ],
      },
    ],
  },
  {
    id: 'bantuan',
    label: 'Bantuan',
    features: [
      {
        id: 'ban-pusat',
        label: 'Pusat Bantuan',
        description: 'Panduan operasional kasir dan dokumentasi fitur',
        pageId: '/bantuan',
        subFeatures: [
          { id: 'ban-artikel', label: 'Panduan penggunaan sistem', supportedActions: ['lihat'] },
        ],
      },
    ],
  },
  {
    id: 'layanan',
    label: 'Layanan & Whatsapp',
    features: [
      {
        id: 'lay-info',
        label: 'Layanan Tambahan',
        description: 'Status modul lanjutan yang tersedia di paket langganan',
        subFeatures: [
          { id: 'lay-lihat', label: 'Lihat paket & status aktivasi', supportedActions: ['lihat'] },
        ],
      },
    ],
  },
];

export const POS_ACCESS_MODULES: readonly AccessModuleDef[] = [
  {
    id: 'pos-kasir',
    label: 'Kasir',
    features: [
      {
        id: 'pos-transaksi',
        label: 'Transaksi Kasir Utama',
        description: 'Catat pesanan pelanggan, terima pembayaran, dan kelola laci kas',
        pageId: '/pos',
        subFeatures: [
          { id: 'pos-jual', label: 'Buat pesanan & proses bayar', supportedActions: ['lihat', 'buat', 'ubah'] },
          { id: 'pos-diskon', label: 'Diskon manual & ubah harga satuan', supportedActions: ['lihat', 'ubah'] },
          { id: 'pos-laci', label: 'Buka laci kasir manual', supportedActions: ['lihat', 'buat'] },
        ],
      },
      {
        id: 'pos-meja',
        label: 'Kelola Meja & Tagihan',
        description: 'Pilih meja, pindah meja, gabung pesanan, dan pisah nota',
        pageId: '/pos/meja',
        subFeatures: [
          { id: 'pos-pindah-gabung', label: 'Pindah meja, gabung & pisah bill', supportedActions: ['lihat', 'ubah'] },
        ],
      },
    ],
  },
  {
    id: 'pos-penjualan',
    label: 'Penjualan',
    features: [
      {
        id: 'pos-riwayat',
        label: 'Riwayat Transaksi & Pembatalan',
        description: 'Lihat riwayat struk di kasir, void pesanan, refund, atau komplimen',
        pageId: '/pos/riwayat',
        subFeatures: [
          { id: 'pos-void-refund', label: 'Void pesanan & refund transaksi lunas', supportedActions: ['lihat', 'buat', 'void'] },
          { id: 'pos-komplimen', label: 'Selesaikan pesanan gratis (komplimen)', supportedActions: ['lihat', 'buat'] },
          { id: 'pos-pending', label: 'Hapus pesanan tertunda lokal', supportedActions: ['lihat', 'hapus'] },
        ],
      },
      {
        id: 'pos-shift',
        label: 'Buka & Tutup Kasir (Shift)',
        description: 'Mulai shift kasir, catat kas masuk/keluar, dan tutup kasir',
        pageId: '/pos/shift',
        subFeatures: [
          { id: 'pos-tutup-shift', label: 'Rekap & hitung fisik uang tutup shift', supportedActions: ['lihat', 'buat', 'ubah'] },
        ],
      },
    ],
  },
  {
    id: 'pos-laporan',
    label: 'Laporan',
    features: [
      {
        id: 'pos-lap-harian',
        label: 'Ringkasan Laporan di Perangkat',
        description: 'Pantau omzet shift berjalan dan rincian metode pembayaran di POS',
        pageId: '/pos/laporan',
        subFeatures: [
          { id: 'pos-lap-lihat', label: 'Lihat omzet shift & saldo kas sistem', supportedActions: ['lihat'] },
        ],
      },
    ],
  },
  {
    id: 'pos-absensi',
    label: 'Absensi',
    features: [
      {
        id: 'pos-absen-harian',
        label: 'Absensi Masuk & Keluar Staf',
        description: 'Pencatatan jam masuk dan pulang karyawan langsung di perangkat POS',
        pageId: '/pos/absensi',
        subFeatures: [
          { id: 'pos-absen-catat', label: 'Catat absensi shift di terminal', supportedActions: ['lihat', 'buat'] },
        ],
      },
    ],
  },
  {
    id: 'pos-inventori',
    label: 'Inventori',
    features: [
      {
        id: 'pos-cek-stok',
        label: 'Cek Ketersediaan Stok POS',
        description: 'Pantau sisa stok item langsung dari layar kasir',
        pageId: '/pos/stok',
        subFeatures: [
          { id: 'pos-stok-lihat', label: 'Lihat sisa stok produk di kasir', supportedActions: ['lihat'] },
        ],
      },
    ],
  },
  {
    id: 'pos-pengaturan',
    label: 'Pengaturan',
    masterLocked: true,
    features: [
      {
        id: 'pos-perangkat',
        label: 'Pengaturan Perangkat & Printer',
        description: 'Koneksi printer thermal, mode laci kas, dan status sinkronisasi wajib tersedia di kasir',
        pageId: '/pos/pengaturan',
        subFeatures: [
          { id: 'pos-device-cfg', label: 'Lihat & atur koneksi perangkat kasir', supportedActions: ['lihat', 'ubah'] },
        ],
      },
    ],
  },
];

export const POS_GRANULAR_PERMISSIONS: PosGranularPermission[] = [
  {
    id: 'void_order',
    label: 'Void pesanan',
    description: 'Membatalkan pesanan yang belum dibayar di kasir',
    requiresApprovalOption: true,
  },
  {
    id: 'refund',
    label: 'Refund pesanan lunas',
    description: 'Mengembalikan pembayaran dan stok untuk pesanan yang sudah lunas',
    requiresApprovalOption: true,
  },
  {
    id: 'merge_tables',
    label: 'Gabung meja',
    description: 'Menggabungkan dua pesanan meja menjadi satu tagihan',
    requiresApprovalOption: true,
  },
  {
    id: 'discard_pending',
    label: 'Hapus pesanan tertunda',
    description: 'Menghapus transaksi tersimpan yang belum disinkronkan dari perangkat',
    requiresApprovalOption: true,
  },
  {
    id: 'open_cash_drawer',
    label: 'Buka laci kas',
    description: 'Membuka laci kasir secara manual di luar transaksi pembayaran',
    requiresApprovalOption: true,
  },
  {
    id: 'price_override',
    label: 'Ubah harga barang',
    description: 'Mengubah harga satuan produk saat melayani pesanan di kasir',
    requiresApprovalOption: true,
  },
  {
    id: 'manual_discount',
    label: 'Diskon manual',
    description: 'Memberikan potongan harga manual di luar promo otomatis',
    requiresApprovalOption: true,
  },
  {
    id: 'device_settings',
    label: 'Buka pengaturan perangkat',
    description: 'Mengakses pengaturan perangkat kasir, cetak, dan kunci layar otomatis',
  },
  {
    id: 'sell',
    label: 'Membuat pesanan & terima bayar',
    description: 'Mencatat pesanan baru dan memproses pembayaran pelanggan',
  },
  {
    id: 'move_table',
    label: 'Pindah meja',
    description: 'Memindahkan pesanan meja aktif ke meja kosong lainnya',
  },
  {
    id: 'close_shift',
    label: 'Buka & tutup kasir (shift)',
    description: 'Memulai shift kasir dan melakukan hitung uang tutup kasir',
  },
  {
    id: 'complimentary',
    label: 'Pembayaran gratis (komplimen)',
    description: 'Menyelesaikan pesanan sebagai komplimen tanpa pembayaran uang',
    requiresApprovalOption: true,
  },
  {
    id: 'see_expected_cash',
    label: 'Lihat kas sistem sebelum hitung',
    description: 'Melihat saldo uang yang seharusnya ada di laci saat tutup shift',
  },
];

export function buildSubFeatureActionSet(
  sub: SubFeatureDef,
  fill: boolean | ((a: PermissionActionKey) => boolean),
): ActionPermissionSet {
  const supported = new Set(sub.supportedActions);
  const val = (a: PermissionActionKey): boolean | null => {
    if (!supported.has(a)) return null;
    return typeof fill === 'function' ? fill(a) : fill;
  };
  return {
    lihat: val('lihat'),
    buat: val('buat'),
    ubah: val('ubah'),
    hapus: val('hapus'),
    void: val('void'),
  };
}

export function subFeatureKey(featureId: string, subFeatureId: string): string {
  return `${featureId}:${subFeatureId}`;
}

export function buildDefaultWizardDashboardState(baseRole: Role, legacyDashPerms?: Record<string, DashboardAccessLevel>) {
  const moduleEnabled: Record<string, boolean> = {};
  const featureEnabled: Record<string, boolean> = {};
  const subFeaturePerms: Record<string, ActionPermissionSet> = {};

  for (const mod of DASHBOARD_ACCESS_MODULES) {
    const legacy = legacyDashPerms?.[mod.id];
    const modOn =
      legacy !== undefined
        ? legacy !== 'none'
        : baseRole === 'owner'
        ? true
        : baseRole === 'manager'
        ? mod.id !== 'layanan'
        : false;
    moduleEnabled[mod.id] = modOn;

    const writeAllowed =
      legacy !== undefined
        ? legacy === 'write'
        : baseRole === 'owner'
        ? true
        : baseRole === 'manager'
        ? !['keuangan', 'pengaturan', 'karyawan'].includes(mod.id)
        : false;

    for (const feat of mod.features) {
      featureEnabled[feat.id] = modOn;
      for (const sub of feat.subFeatures) {
        subFeaturePerms[subFeatureKey(feat.id, sub.id)] = buildSubFeatureActionSet(
          sub,
          (a) => modOn && (a === 'lihat' || writeAllowed),
        );
      }
    }
  }

  return {
    dashboardModuleEnabled: moduleEnabled,
    dashboardFeatureEnabled: featureEnabled,
    dashboardSubFeaturePerms: subFeaturePerms,
  };
}

export function buildDefaultWizardPosState(baseRole: Role) {
  const posAppEnabled = true;
  const moduleEnabled: Record<string, boolean> = {};
  const featureEnabled: Record<string, boolean> = {};
  const subFeaturePerms: Record<string, ActionPermissionSet> = {};

  for (const mod of POS_ACCESS_MODULES) {
    const modOn =
      mod.masterLocked ||
      baseRole === 'owner' ||
      baseRole === 'manager' ||
      ['pos-kasir', 'pos-penjualan', 'pos-absensi'].includes(mod.id);
    moduleEnabled[mod.id] = modOn;

    for (const feat of mod.features) {
      featureEnabled[feat.id] = modOn;
      for (const sub of feat.subFeatures) {
        const allowSensitives = baseRole === 'owner' || baseRole === 'manager';
        subFeaturePerms[subFeatureKey(feat.id, sub.id)] = buildSubFeatureActionSet(sub, (a) => {
          if (!modOn) return false;
          if (sub.id === 'pos-void-refund' || sub.id === 'pos-komplimen') {
            return allowSensitives || a === 'lihat';
          }
          if (sub.id === 'pos-diskon' && baseRole === 'cashier') {
            return a === 'lihat';
          }
          return true;
        });
      }
    }
  }

  return {
    posAppEnabled,
    posModuleEnabled: moduleEnabled,
    posFeatureEnabled: featureEnabled,
    posSubFeaturePerms: subFeaturePerms,
  };
}

/** Bentuk halaman kosong baru saat membuka wizard "Tambah Hak Akses" sebelum pengguna mengaktifkan fitur. */
export function createBlankCustomRole(dashboardModuleIds: string[], id = ''): RoleDefinition {
  const dashboardPerms: Record<string, DashboardAccessLevel> = {};
  for (const modId of dashboardModuleIds) {
    dashboardPerms[modId] = 'none';
  }
  const dashboardModuleEnabled: Record<string, boolean> = {};
  const dashboardFeatureEnabled: Record<string, boolean> = {};
  const dashboardSubFeaturePerms: Record<string, ActionPermissionSet> = {};
  for (const mod of DASHBOARD_ACCESS_MODULES) {
    dashboardModuleEnabled[mod.id] = false;
    for (const feat of mod.features) {
      dashboardFeatureEnabled[feat.id] = false;
      for (const sub of feat.subFeatures) {
        dashboardSubFeaturePerms[subFeatureKey(feat.id, sub.id)] = buildSubFeatureActionSet(sub, false);
      }
    }
  }

  const posModuleEnabled: Record<string, boolean> = {};
  const posFeatureEnabled: Record<string, boolean> = {};
  const posSubFeaturePerms: Record<string, ActionPermissionSet> = {};
  for (const mod of POS_ACCESS_MODULES) {
    const lockedOn = Boolean(mod.masterLocked);
    posModuleEnabled[mod.id] = lockedOn;
    for (const feat of mod.features) {
      posFeatureEnabled[feat.id] = lockedOn;
      for (const sub of feat.subFeatures) {
        posSubFeaturePerms[subFeatureKey(feat.id, sub.id)] = buildSubFeatureActionSet(
          sub,
          lockedOn,
        );
      }
    }
  }

  return {
    id,
    name: '',
    description: '',
    isBuiltIn: false,
    baseRole: 'cashier',
    ownerAppAccess: false,
    dashboardPerms,
    posPerms: buildDefaultPosPerms('cashier'),
    dashboardModuleEnabled,
    dashboardFeatureEnabled,
    dashboardSubFeaturePerms,
    posAppEnabled: false,
    posModuleEnabled,
    posFeatureEnabled,
    posSubFeaturePerms,
    canAuthorizeRefund: false,
    canAuthorizeVoid: false,
    canAuthorizeComplimentary: false,
    defaultDashboardPage: undefined,
    defaultPosPage: undefined,
  };
}

/** Cek apakah ID peran atau definisi peran merupakan peran bawaan sistem. */
export function isBuiltInRole(roleOrId: string | Pick<RoleDefinition, 'id' | 'isBuiltIn'>): boolean {
  if (typeof roleOrId === 'string') {
    const clean = roleOrId.toLowerCase().trim();
    return (BUILT_IN_ROLE_IDS as readonly string[]).includes(clean);
  }
  if (roleOrId.isBuiltIn) return true;
  return (BUILT_IN_ROLE_IDS as readonly string[]).includes(roleOrId.id.toLowerCase().trim());
}

/** Validasi nama peran: tidak kosong, maks 50 karakter, unik, dan peran bawaan tidak mengubah nama inti. */
export function validateRoleName(
  name: string,
  existingRoles: Pick<RoleDefinition, 'id' | 'name'>[],
  editingId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Nama peran wajib diisi.';
  if (trimmed.length > 50) return 'Nama peran maksimal 50 karakter.';

  if (editingId && isBuiltInRole(editingId)) {
    const existingBuiltIn = existingRoles.find((r) => r.id === editingId);
    if (existingBuiltIn && existingBuiltIn.name.toLowerCase() !== trimmed.toLowerCase()) {
      return `Nama peran bawaan "${existingBuiltIn.name}" tidak dapat diubah.`;
    }
  }

  const lower = trimmed.toLowerCase();
  const duplicate = existingRoles.some(
    (r) => r.id !== editingId && r.name.trim().toLowerCase() === lower,
  );
  if (duplicate) return `Nama peran "${trimmed}" sudah digunakan. Gunakan nama lain.`;

  return null;
}

/** Hasilkan nama unik saat menduplikasi peran. */
export function duplicateRoleName(
  sourceName: string,
  existingRoles: Pick<RoleDefinition, 'name'>[],
): string {
  const names = new Set(existingRoles.map((r) => r.name.trim().toLowerCase()));
  const base = `${sourceName.trim()} (Salinan)`;
  if (!names.has(base.toLowerCase())) return base;
  let counter = 2;
  while (counter < 100) {
    const candidate = `${sourceName.trim()} (Salinan ${counter})`;
    if (!names.has(candidate.toLowerCase())) return candidate;
    counter += 1;
  }
  return `${sourceName.trim()} (${Date.now()})`;
}

/** Hak akses dashboard bawaan per peran dasar. */
export function buildDefaultDashboardPerms(
  baseRole: Role,
  moduleIds: string[],
): Record<string, DashboardAccessLevel> {
  const perms: Record<string, DashboardAccessLevel> = {};
  for (const id of moduleIds) {
    if (baseRole === 'owner') {
      perms[id] = 'write';
    } else if (baseRole === 'manager') {
      const lower = id.toLowerCase();
      if (lower.includes('keuangan') || lower.includes('pengaturan') || lower.includes('karyawan')) {
        perms[id] = 'read';
      } else {
        perms[id] = 'write';
      }
    } else {
      perms[id] = 'none';
    }
  }
  return perms;
}

/** Hak akses POS bawaan per peran dasar, menggabungkan ROLE_ACCESS dan aksi tambahan. */
export function buildDefaultPosPerms(baseRole: Role): Record<string, PosAccessLevel> {
  const base = ROLE_ACCESS[baseRole] || ROLE_ACCESS.cashier;
  const perms: Record<string, PosAccessLevel> = {};
  for (const item of POS_GRANULAR_PERMISSIONS) {
    if (item.id === 'open_cash_drawer' || item.id === 'price_override') {
      perms[item.id] = baseRole === 'cashier' ? 'approve' : 'allow';
    } else {
      perms[item.id] = base[item.id as Permission] ?? 'deny';
    }
  }
  return perms;
}

/** Gabungkan hak akses bawaan + override agar seluruh modul dashboard dan aksi POS memiliki nilai. */
export function resolveRolePermissions(
  role: Pick<RoleDefinition, 'baseRole' | 'dashboardPerms' | 'posPerms'>,
  dashboardModuleIds: string[],
): {
  dashboard: Record<string, DashboardAccessLevel>;
  pos: Record<string, PosAccessLevel>;
} {
  const defaultDash = buildDefaultDashboardPerms(role.baseRole, dashboardModuleIds);
  const defaultPos = buildDefaultPosPerms(role.baseRole);

  const dashboard: Record<string, DashboardAccessLevel> = { ...defaultDash };
  for (const id of dashboardModuleIds) {
    const override = role.dashboardPerms?.[id];
    if (override === 'none' || override === 'read' || override === 'write') {
      dashboard[id] = override;
    }
  }

  const pos: Record<string, PosAccessLevel> = { ...defaultPos };
  for (const item of POS_GRANULAR_PERMISSIONS) {
    const override = role.posPerms?.[item.id];
    if (override === 'allow' || override === 'approve' || override === 'deny') {
      pos[item.id] = override;
    }
  }

  return { dashboard, pos };
}

/** Daftar halaman awal yang sah dipilih: HANYA fitur dengan modul aktif, fitur aktif, dan minimal satu sub-fitur bertanda LIHAT. */
export function availableDefaultPages(
  role: Pick<
    RoleDefinition,
    | 'dashboardModuleEnabled'
    | 'dashboardFeatureEnabled'
    | 'dashboardSubFeaturePerms'
    | 'posAppEnabled'
    | 'posModuleEnabled'
    | 'posFeatureEnabled'
    | 'posSubFeaturePerms'
  >,
  area: 'dashboard' | 'pos',
): { pageId: string; label: string; moduleLabel: string }[] {
  if (area === 'pos' && !role.posAppEnabled) {
    return [];
  }

  const modules = area === 'dashboard' ? DASHBOARD_ACCESS_MODULES : POS_ACCESS_MODULES;
  const modMap = area === 'dashboard' ? role.dashboardModuleEnabled : role.posModuleEnabled;
  const featMap = area === 'dashboard' ? role.dashboardFeatureEnabled : role.posFeatureEnabled;
  const subMap = area === 'dashboard' ? role.dashboardSubFeaturePerms : role.posSubFeaturePerms;

  const out: { pageId: string; label: string; moduleLabel: string }[] = [];
  for (const mod of modules) {
    const modOn = mod.masterLocked ? true : Boolean(modMap?.[mod.id]);
    if (!modOn) continue;

    for (const feat of mod.features) {
      if (!feat.pageId) continue;
      if (!featMap?.[feat.id]) continue;
      const hasView = feat.subFeatures.some(
        (sub) => subMap?.[subFeatureKey(feat.id, sub.id)]?.lihat === true,
      );
      if (hasView) {
        out.push({
          pageId: feat.pageId,
          label: feat.label,
          moduleLabel: mod.label,
        });
      }
    }
  }
  return out;
}

/** Bersihkan pilihan halaman awal bila halaman tersebut tak lagi memiliki akses LIHAT. */
export function sanitizeDefaultPages<T extends RoleDefinition>(role: T): T {
  const dashAllowed = new Set(availableDefaultPages(role, 'dashboard').map((p) => p.pageId));
  const posAllowed = new Set(availableDefaultPages(role, 'pos').map((p) => p.pageId));

  const nextDash =
    role.defaultDashboardPage && dashAllowed.has(role.defaultDashboardPage)
      ? role.defaultDashboardPage
      : undefined;
  const nextPos =
    role.defaultPosPage && posAllowed.has(role.defaultPosPage) ? role.defaultPosPage : undefined;

  return {
    ...role,
    defaultDashboardPage: nextDash,
    defaultPosPage: nextPos,
  };
}

/** Migrasikan bentuk data peran lama (A51) atau parsial agar seluruh field granular A61 terisi aman. */
export function migrateRoleDefinition(
  saved: Partial<RoleDefinition> & { id: string; name: string },
  dashboardModuleIds: string[],
  builtInDefaults?: RoleDefinition,
): RoleDefinition {
  const baseRole: Role =
    builtInDefaults?.baseRole ??
    (saved.baseRole === 'owner' || saved.baseRole === 'manager' || saved.baseRole === 'cashier'
      ? saved.baseRole
      : 'cashier');

  const resolvedLegacy = resolveRolePermissions(
    {
      baseRole,
      dashboardPerms: saved.dashboardPerms || {},
      posPerms: saved.posPerms || {},
    },
    dashboardModuleIds,
  );

  // Petakan dashboardPerms lama (kunci penjualan:laporan, produk, dll.) ke modul induk A61 bila struktur baru belum ada
  const legacyDashByModule: Record<string, DashboardAccessLevel> = {};
  for (const mod of DASHBOARD_ACCESS_MODULES) {
    let best: DashboardAccessLevel = 'none';
    for (const [k, v] of Object.entries(resolvedLegacy.dashboard)) {
      const match =
        k === mod.id ||
        k.startsWith(`${mod.id}:`) ||
        (mod.id === 'penjualan' &&
          (k.includes('produk') || k.includes('inventori') || k.includes('pelanggan') || k.includes('promosi') || k.includes('laporan') || k.includes('analisa')));
      if (match) {
        if (v === 'write') best = 'write';
        else if (v === 'read' && best === 'none') best = 'read';
      }
    }
    legacyDashByModule[mod.id] = best;
  }

  const defaultDashWizard = buildDefaultWizardDashboardState(
    baseRole,
    saved.dashboardModuleEnabled ? undefined : legacyDashByModule,
  );
  const defaultPosWizard = buildDefaultWizardPosState(baseRole);

  const dashboardModuleEnabled: Record<string, boolean> = {
    ...defaultDashWizard.dashboardModuleEnabled,
    ...(saved.dashboardModuleEnabled ?? {}),
  };
  const dashboardFeatureEnabled: Record<string, boolean> = {
    ...defaultDashWizard.dashboardFeatureEnabled,
    ...(saved.dashboardFeatureEnabled ?? {}),
  };
  const dashboardSubFeaturePerms: Record<string, ActionPermissionSet> = {
    ...defaultDashWizard.dashboardSubFeaturePerms,
  };
  for (const mod of DASHBOARD_ACCESS_MODULES) {
    for (const feat of mod.features) {
      for (const sub of feat.subFeatures) {
        const key = subFeatureKey(feat.id, sub.id);
        const existingSet = saved.dashboardSubFeaturePerms?.[key];
        if (existingSet) {
          dashboardSubFeaturePerms[key] = buildSubFeatureActionSet(
            sub,
            (a) => Boolean(existingSet[a]),
          );
        }
      }
    }
  }

  const posModuleEnabled: Record<string, boolean> = {
    ...defaultPosWizard.posModuleEnabled,
    ...(saved.posModuleEnabled ?? {}),
  };
  // Pengaturan POS selalu terkunci aktif sesuai Majoo asli
  for (const mod of POS_ACCESS_MODULES) {
    if (mod.masterLocked) posModuleEnabled[mod.id] = true;
  }

  const posFeatureEnabled: Record<string, boolean> = {
    ...defaultPosWizard.posFeatureEnabled,
    ...(saved.posFeatureEnabled ?? {}),
  };
  const posSubFeaturePerms: Record<string, ActionPermissionSet> = {
    ...defaultPosWizard.posSubFeaturePerms,
  };
  for (const mod of POS_ACCESS_MODULES) {
    for (const feat of mod.features) {
      for (const sub of feat.subFeatures) {
        const key = subFeatureKey(feat.id, sub.id);
        const existingSet = saved.posSubFeaturePerms?.[key];
        if (existingSet) {
          posSubFeaturePerms[key] = buildSubFeatureActionSet(
            sub,
            (a) => Boolean(existingSet[a]),
          );
        }
      }
    }
  }

  const canAuthorizeDefault = baseRole === 'owner' || baseRole === 'manager';

  const hydrated: RoleDefinition = {
    id: saved.id,
    name: builtInDefaults ? builtInDefaults.name : saved.name.trim(),
    description:
      typeof saved.description === 'string'
        ? saved.description
        : builtInDefaults?.description ?? '',
    isBuiltIn: Boolean(builtInDefaults?.isBuiltIn),
    baseRole,
    ownerAppAccess:
      typeof saved.ownerAppAccess === 'boolean'
        ? saved.ownerAppAccess
        : builtInDefaults?.ownerAppAccess ?? false,
    dashboardPerms: resolvedLegacy.dashboard,
    posPerms: resolvedLegacy.pos,
    dashboardModuleEnabled,
    dashboardFeatureEnabled,
    dashboardSubFeaturePerms,
    posAppEnabled:
      typeof saved.posAppEnabled === 'boolean' ? saved.posAppEnabled : true,
    posModuleEnabled,
    posFeatureEnabled,
    posSubFeaturePerms,
    canAuthorizeRefund:
      typeof saved.canAuthorizeRefund === 'boolean'
        ? saved.canAuthorizeRefund
        : canAuthorizeDefault,
    canAuthorizeVoid:
      typeof saved.canAuthorizeVoid === 'boolean'
        ? saved.canAuthorizeVoid
        : canAuthorizeDefault,
    canAuthorizeComplimentary:
      typeof saved.canAuthorizeComplimentary === 'boolean'
        ? saved.canAuthorizeComplimentary
        : canAuthorizeDefault,
    defaultDashboardPage:
      saved.defaultDashboardPage ?? builtInDefaults?.defaultDashboardPage,
    defaultPosPage: saved.defaultPosPage ?? builtInDefaults?.defaultPosPage,
  };

  return sanitizeDefaultPages(hydrated);
}

/** Buat daftar peran bawaan awal. */
export function createDefaultRoleDefinitions(dashboardModuleIds: string[]): RoleDefinition[] {
  const ownerDash = buildDefaultWizardDashboardState('owner');
  const ownerPos = buildDefaultWizardPosState('owner');
  const mgrDash = buildDefaultWizardDashboardState('manager');
  const mgrPos = buildDefaultWizardPosState('manager');
  const cashDash = buildDefaultWizardDashboardState('cashier');
  const cashPos = buildDefaultWizardPosState('cashier');

  return [
    {
      id: 'owner',
      name: 'Pemilik',
      description: 'Akses penuh ke seluruh fitur dashboard web, laporan keuangan, dan operasional kasir.',
      isBuiltIn: true,
      baseRole: 'owner',
      ownerAppAccess: true,
      dashboardPerms: buildDefaultDashboardPerms('owner', dashboardModuleIds),
      posPerms: buildDefaultPosPerms('owner'),
      ...ownerDash,
      ...ownerPos,
      canAuthorizeRefund: true,
      canAuthorizeVoid: true,
      canAuthorizeComplimentary: true,
      defaultDashboardPage: '/',
      defaultPosPage: '/pos',
    },
    {
      id: 'manager',
      name: 'Manajer',
      description: 'Mengelola operasional outlet, katalog, stok, laporan penjualan, serta memberi otorisasi kasir.',
      isBuiltIn: true,
      baseRole: 'manager',
      ownerAppAccess: false,
      dashboardPerms: buildDefaultDashboardPerms('manager', dashboardModuleIds),
      posPerms: buildDefaultPosPerms('manager'),
      ...mgrDash,
      ...mgrPos,
      canAuthorizeRefund: true,
      canAuthorizeVoid: true,
      canAuthorizeComplimentary: true,
      defaultDashboardPage: '/',
      defaultPosPage: '/pos',
    },
    {
      id: 'cashier',
      name: 'Kasir',
      description: 'Menangani transaksi harian di aplikasi kasir dengan pembatasan aksi sensitif.',
      isBuiltIn: true,
      baseRole: 'cashier',
      ownerAppAccess: false,
      dashboardPerms: buildDefaultDashboardPerms('cashier', dashboardModuleIds),
      posPerms: buildDefaultPosPerms('cashier'),
      ...cashDash,
      ...cashPos,
      canAuthorizeRefund: false,
      canAuthorizeVoid: false,
      canAuthorizeComplimentary: false,
      defaultDashboardPage: undefined,
      defaultPosPage: '/pos',
    },
  ];
}

/** Gabungkan peran bawaan dengan peran dan override tersimpan di penyimpanan lokal (aman untuk struktur lama & baru). */
export function mergeRoleOverrides(
  savedRoles: RoleDefinition[] | null | undefined,
  dashboardModuleIds: string[],
): RoleDefinition[] {
  const defaults = createDefaultRoleDefinitions(dashboardModuleIds);
  if (!Array.isArray(savedRoles) || savedRoles.length === 0) {
    return defaults;
  }

  const savedById = new Map<string, RoleDefinition>();
  for (const r of savedRoles) {
    if (r && typeof r.id === 'string' && typeof r.name === 'string') {
      savedById.set(r.id, r);
    }
  }

  const result: RoleDefinition[] = defaults.map((def) => {
    const saved = savedById.get(def.id);
    if (!saved) return def;
    return migrateRoleDefinition(saved, dashboardModuleIds, def);
  });

  for (const saved of savedRoles) {
    if (!saved || typeof saved.id !== 'string' || typeof saved.name !== 'string') continue;
    if (isBuiltInRole(saved.id)) continue;
    result.push(migrateRoleDefinition(saved, dashboardModuleIds));
  }

  return result;
}

import { ROLE_ACCESS, type Access, type Permission, type Role } from './permissions';

export type DashboardAccessLevel = 'none' | 'read' | 'write';
export type PosAccessLevel = Access; // 'allow' | 'approve' | 'deny'
export type PosPermissionId = Permission | 'open_cash_drawer' | 'price_override';

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
  dashboardPerms: Record<string, DashboardAccessLevel>;
  posPerms: Record<string, PosAccessLevel>;
}

export const BUILT_IN_ROLE_IDS: readonly Role[] = ['owner', 'manager', 'cashier'] as const;

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
  editingId?: string
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
    (r) => r.id !== editingId && r.name.trim().toLowerCase() === lower
  );
  if (duplicate) return `Nama peran "${trimmed}" sudah digunakan. Gunakan nama lain.`;

  return null;
}

/** Hasilkan nama unik saat menduplikasi peran. */
export function duplicateRoleName(
  sourceName: string,
  existingRoles: Pick<RoleDefinition, 'name'>[]
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
  moduleIds: string[]
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
  dashboardModuleIds: string[]
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

/** Buat daftar peran bawaan awal. */
export function createDefaultRoleDefinitions(dashboardModuleIds: string[]): RoleDefinition[] {
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
    },
  ];
}

/** Gabungkan peran bawaan dengan peran dan override tersimpan di penyimpanan lokal. */
export function mergeRoleOverrides(
  savedRoles: RoleDefinition[] | null | undefined,
  dashboardModuleIds: string[]
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

  // Pastikan peran bawaan selalu ada & nama intinya terjaga
  const result: RoleDefinition[] = defaults.map((def) => {
    const saved = savedById.get(def.id);
    if (!saved) return def;
    const resolved = resolveRolePermissions(
      {
        baseRole: def.baseRole,
        dashboardPerms: saved.dashboardPerms || {},
        posPerms: saved.posPerms || {},
      },
      dashboardModuleIds
    );
    return {
      ...def,
      description: typeof saved.description === 'string' ? saved.description : def.description,
      ownerAppAccess: typeof saved.ownerAppAccess === 'boolean' ? saved.ownerAppAccess : def.ownerAppAccess,
      dashboardPerms: resolved.dashboard,
      posPerms: resolved.pos,
    };
  });

  // Tambahkan peran kustom yang bukan ID bawaan
  for (const saved of savedRoles) {
    if (!saved || typeof saved.id !== 'string' || typeof saved.name !== 'string') continue;
    if (isBuiltInRole(saved.id)) continue;
    const baseRole: Role =
      saved.baseRole === 'owner' || saved.baseRole === 'manager' || saved.baseRole === 'cashier'
        ? saved.baseRole
        : 'cashier';
    const resolved = resolveRolePermissions(
      {
        baseRole,
        dashboardPerms: saved.dashboardPerms || {},
        posPerms: saved.posPerms || {},
      },
      dashboardModuleIds
    );
    result.push({
      id: saved.id,
      name: saved.name.trim(),
      description: typeof saved.description === 'string' ? saved.description : '',
      isBuiltIn: false,
      baseRole,
      ownerAppAccess: Boolean(saved.ownerAppAccess),
      dashboardPerms: resolved.dashboard,
      posPerms: resolved.pos,
    });
  }

  return result;
}


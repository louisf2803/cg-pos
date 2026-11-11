'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Copy,
  Edit2,
  Info,
  Monitor,
  Plus,
  Search,
  Shield,
  Smartphone,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  buildDefaultDashboardPerms,
  buildDefaultPosPerms,
  createDefaultRoleDefinitions,
  duplicateRoleName,
  isBuiltInRole,
  mergeRoleOverrides,
  newId,
  POS_GRANULAR_PERMISSIONS,
  resolveRolePermissions,
  validateRoleName,
  type DashboardAccessLevel,
  type ManagedEmployee,
  type PosAccessLevel,
  type Role,
  type RoleDefinition,
} from '@cgpos/shared';
import { MODUL } from '@/lib/nav';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const STORAGE_KEY = 'cg-role-permissions';

type DashboardModuleInfo = {
  id: string;
  label: string;
  parentLabel: string;
  itemCount: number;
  sampleItems: string;
};

/** Bangun daftar modul dashboard langsung dari MODUL di nav.ts (sumber tunggal). */
function buildDashboardModuleList(): DashboardModuleInfo[] {
  return MODUL.flatMap((m) => {
    if (m.id === 'penjualan') {
      return m.groups.map((g) => ({
        id: `penjualan:${g.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: g.label === 'Dashboard' ? 'Penjualan' : g.label,
        parentLabel: m.label,
        itemCount: g.items.length,
        sampleItems: g.items
          .slice(0, 3)
          .map((i) => i.label)
          .join(', '),
      }));
    }
    return [
      {
        id: m.id,
        label: m.label,
        parentLabel: m.label,
        itemCount: m.groups.reduce((sum, g) => sum + g.items.length, 0),
        sampleItems: m.groups
          .flatMap((g) => g.items)
          .slice(0, 3)
          .map((i) => i.label)
          .join(', '),
      },
    ];
  });
}

const DASHBOARD_MODULES = buildDashboardModuleList();
const DASHBOARD_MODULE_IDS = DASHBOARD_MODULES.map((m) => m.id);

const DASH_LEVELS: { value: DashboardAccessLevel; label: string }[] = [
  { value: 'none', label: 'Tidak ada' },
  { value: 'read', label: 'Lihat saja' },
  { value: 'write', label: 'Lihat & ubah' },
];

const POS_LEVELS: { value: PosAccessLevel; label: string }[] = [
  { value: 'allow', label: 'Boleh sendiri' },
  { value: 'approve', label: 'Butuh PIN atasan' },
  { value: 'deny', label: 'Tidak boleh' },
];

function loadSavedRoles(): RoleDefinition[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultRoleDefinitions(DASHBOARD_MODULE_IDS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createDefaultRoleDefinitions(DASHBOARD_MODULE_IDS);
    return mergeRoleOverrides(parsed, DASHBOARD_MODULE_IDS);
  } catch {
    return createDefaultRoleDefinitions(DASHBOARD_MODULE_IDS);
  }
}

function saveRolesToStorage(roles: RoleDefinition[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  } catch {
    /* abaikan bila penyimpanan lokal tidak tersedia */
  }
}

function summarizeRoleAccess(role: RoleDefinition): { dashActive: number; posAllow: number } {
  const resolved = resolveRolePermissions(role, DASHBOARD_MODULE_IDS);
  const dashActive = Object.values(resolved.dashboard).filter((v) => v !== 'none').length;
  const posAllow = Object.values(resolved.pos).filter((v) => v === 'allow').length;
  return { dashActive, posAllow };
}

export default function HakAksesPage() {
  const data = useData();
  const empAsync = useAsync(() => data.listManagedEmployees(), [data]);

  const [roles, setRoles] = useState<RoleDefinition[]>(() =>
    createDefaultRoleDefinitions(DASHBOARD_MODULE_IDS)
  );
  const [hydrated, setHydrated] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'builtin' | 'custom'>('all');

  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [isNewRole, setIsNewRole] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setRoles(loadSavedRoles());
    setHydrated(true);
  }, []);

  const persistRoles = (next: RoleDefinition[]) => {
    setRoles(next);
    saveRolesToStorage(next);
  };

  const employees: ManagedEmployee[] = useMemo(
    () => (empAsync.status === 'ready' ? empAsync.data : []),
    [empAsync]
  );

  // Hitung karyawan terpasang per peran bawaan berdasarkan role server
  const employeeCountForRole = (role: RoleDefinition): number => {
    if (!role.isBuiltIn) return 0;
    return employees.filter((e) => e.role === role.baseRole && e.isActive).length;
  };

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roles.filter((r) => {
      if (typeFilter === 'builtin' && !r.isBuiltIn) return false;
      if (typeFilter === 'custom' && r.isBuiltIn) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [roles, searchQuery, typeFilter]);

  const stats = useMemo(() => {
    const customCount = roles.filter((r) => !r.isBuiltIn).length;
    const activeEmpCount = employees.filter((e) => e.isActive).length;
    return {
      totalRoles: roles.length,
      builtInCount: roles.length - customCount,
      customCount,
      activeEmpCount,
    };
  }, [roles, employees]);

  const handleOpenCreate = () => {
    const blank: RoleDefinition = {
      id: newId(),
      name: '',
      description: '',
      isBuiltIn: false,
      baseRole: 'cashier',
      ownerAppAccess: false,
      dashboardPerms: buildDefaultDashboardPerms('cashier', DASHBOARD_MODULE_IDS),
      posPerms: buildDefaultPosPerms('cashier'),
    };
    setIsNewRole(true);
    setEditingRole(blank);
  };

  const handleOpenEdit = (role: RoleDefinition) => {
    const resolved = resolveRolePermissions(role, DASHBOARD_MODULE_IDS);
    setIsNewRole(false);
    setEditingRole({
      ...role,
      dashboardPerms: resolved.dashboard,
      posPerms: resolved.pos,
    });
  };

  const handleDuplicate = (source: RoleDefinition) => {
    const resolved = resolveRolePermissions(source, DASHBOARD_MODULE_IDS);
    const copyName = duplicateRoleName(source.name, roles);
    const duplicated: RoleDefinition = {
      id: newId(),
      name: copyName,
      description: source.description ? `Salinan dari ${source.name}. ${source.description}` : '',
      isBuiltIn: false,
      baseRole: source.baseRole,
      ownerAppAccess: Boolean(source.ownerAppAccess),
      dashboardPerms: resolved.dashboard,
      posPerms: resolved.pos,
    };
    const next = [...roles, duplicated];
    persistRoles(next);
    setToastMsg(`Peran "${duplicated.name}" dibuat sebagai salinan.`);
  };

  const handleSaveRole = (saved: RoleDefinition) => {
    if (isNewRole) {
      persistRoles([...roles, saved]);
      setToastMsg(`Peran baru "${saved.name}" berhasil ditambahkan.`);
    } else {
      persistRoles(roles.map((r) => (r.id === saved.id ? saved : r)));
      setToastMsg(`Perubahan hak akses untuk "${saved.name}" tersimpan.`);
    }
    setEditingRole(null);
  };

  const handleConfirmDelete = (target: RoleDefinition) => {
    if (isBuiltInRole(target)) return;
    persistRoles(roles.filter((r) => r.id !== target.id));
    setToastMsg(`Peran kustom "${target.name}" telah dihapus.`);
    setDeleteTarget(null);
  };

  const isLoading = empAsync.status === 'loading' || !hydrated;

  return (
    <>
      <PageHeader
        title="Pengaturan peran & hak akses"
        subtitle="Atur izin akses modul dashboard web dan aksi sensitif di aplikasi kasir secara terpisah untuk setiap peran."
        helpText="Peran bawaan tidak dapat dihapus atau diganti nama intinya, namun Anda dapat menduplikasi atau membuat peran kustom."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={handleOpenCreate}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            Tambah peran
          </button>
        }
      />

      {/* Lencana pratinjau penyimpanan lokal */}
      <div className="cg-banner cg-banner--warning mb-16">
        <Info className="cg-icon cg-icon--sm mt-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-8 mb-4">
            <span className="cg-badge cg-badge--warning">Pratinjau — belum tersambung server</span>
          </div>
          <p className="text-sm leading-relaxed">
            Pengaturan matriks izin per peran saat ini disimpan sementara di peramban ini (penyimpanan lokal) sambil menunggu dukungan tabel peran &amp; hak akses di server. Jumlah karyawan aktif dibaca langsung dari data karyawan outlet.
          </p>
        </div>
      </div>

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--info mb-16 flex items-center justify-between gap-12">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            aria-label="Tutup pemberitahuan"
            onClick={() => setToastMsg('')}
          >
            <X className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>
      )}

      {empAsync.status === 'error' && (
        <div className="mb-16">
          <ErrorBox message={empAsync.message} onRetry={empAsync.reload} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat daftar peran">
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[84px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[260px] rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-16 min-w-0">
          {/* Kartu ringkasan */}
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12">
            <div className="p-16 bg-surface-raised border border-border rounded-xl shadow-card min-w-0">
              <div className="text-xs text-text-muted mb-4">Total peran</div>
              <div className="text-xl font-bold text-text cg-num text-left">{stats.totalRoles}</div>
            </div>
            <div className="p-16 bg-surface-raised border border-border rounded-xl shadow-card min-w-0">
              <div className="text-xs text-text-muted mb-4">Peran bawaan</div>
              <div className="text-xl font-bold text-text cg-num text-left">{stats.builtInCount}</div>
            </div>
            <div className="p-16 bg-surface-raised border border-border rounded-xl shadow-card min-w-0">
              <div className="text-xs text-text-muted mb-4">Peran kustom</div>
              <div className="text-xl font-bold text-accent-strong cg-num text-left">{stats.customCount}</div>
            </div>
            <div className="p-16 bg-surface-raised border border-border rounded-xl shadow-card min-w-0">
              <div className="text-xs text-text-muted mb-4">Karyawan aktif</div>
              <div className="text-xl font-bold text-text cg-num text-left">{stats.activeEmpCount}</div>
            </div>
          </div>

          {/* Bar pencarian dan filter */}
          <div className="flex flex-wrap items-center justify-between gap-12">
            <div className="cg-search w-full tablet:w-[300px]">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <input
                type="search"
                className="cg-input"
                placeholder="Cari nama atau deskripsi peran..."
                aria-label="Cari peran"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-8" role="group" aria-label="Saring jenis peran">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'builtin', label: 'Bawaan' },
                  { id: 'custom', label: 'Kustom' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="cg-chip"
                  aria-pressed={typeFilter === chip.id}
                  onClick={() => setTypeFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Keadaan kosong */}
          {filteredRoles.length === 0 ? (
            <div className="cg-empty">
              <Shield className="cg-icon cg-icon--lg mx-auto mb-8 text-text-muted" aria-hidden />
              <p>
                <strong>
                  {searchQuery.trim()
                    ? `Tidak ada peran yang cocok dengan "${searchQuery.trim()}".`
                    : 'Belum ada peran kustom.'}
                </strong>
              </p>
              <p className="text-text-muted text-sm mb-12">
                {searchQuery.trim() || typeFilter !== 'all'
                  ? 'Coba ubah kata kunci pencarian atau pilih filter Semua.'
                  : 'Buat peran baru atau duplikat dari peran bawaan untuk menyesuaikan izin tim Anda.'}
              </p>
              <div className="flex flex-wrap justify-center gap-8">
                {(searchQuery.trim() || typeFilter !== 'all') && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => {
                      setSearchQuery('');
                      setTypeFilter('all');
                    }}
                  >
                    Tampilkan semua peran
                  </button>
                )}
                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm"
                  onClick={handleOpenCreate}
                >
                  <Plus className="cg-icon cg-icon--sm" aria-hidden />
                  Tambah peran
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tampilan Tabel (Tablet & Desktop) */}
              <div className="hidden tablet:block rounded-xl bg-surface-raised border border-border shadow-card overflow-hidden min-w-0">
                <div className="cg-data-wrap min-w-0">
                  <table className="cg-data w-full" style={{ minWidth: 0 }} aria-label="Daftar peran dan hak akses">
                    <thead>
                      <tr>
                        <th>Nama peran</th>
                        <th className="cg-num whitespace-nowrap">Karyawan terpasang</th>
                        <th className="cg-num whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoles.map((role) => {
                        const empCount = employeeCountForRole(role);
                        const summary = summarizeRoleAccess(role);
                        const builtIn = isBuiltInRole(role);
                        return (
                          <tr key={role.id} data-testid={`role-row-${role.id}`}>
                            <td className="min-w-0">
                              <div className="flex flex-wrap items-center gap-8 mb-4">
                                <strong className="break-words text-text">{role.name}</strong>
                                <span
                                  className={`cg-badge ${
                                    builtIn ? 'cg-badge--info' : 'cg-badge--accent'
                                  }`}
                                >
                                  {builtIn ? 'Bawaan' : 'Kustom'}
                                </span>
                                {role.ownerAppAccess && (
                                  <span className="cg-badge cg-badge--success">Aplikasi Pemilik</span>
                                )}
                              </div>
                              {role.description && (
                                <p className="text-xs text-text-muted break-words mb-4">
                                  {role.description}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-8 text-xs text-text-muted">
                                <span>{summary.dashActive} modul dashboard aktif</span>
                                <span>·</span>
                                <span>{summary.posAllow} izin langsung di kasir</span>
                              </div>
                            </td>
                            <td className="text-right cg-num whitespace-nowrap align-top">
                              <span className="inline-flex items-center gap-4 font-semibold">
                                <Users className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                                {empCount}
                              </span>
                              {!builtIn && (
                                <span className="block text-xs text-text-muted font-normal mt-4">
                                  Menunggu sinkron peran
                                </span>
                              )}
                            </td>
                            <td className="text-right whitespace-nowrap align-top">
                              <div className="inline-flex items-center justify-end gap-8">
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--secondary cg-btn--sm"
                                  onClick={() => handleOpenEdit(role)}
                                  aria-label={`Ubah hak akses ${role.name}`}
                                >
                                  <Edit2 className="cg-icon cg-icon--sm" aria-hidden />
                                  Ubah
                                </button>
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--ghost cg-btn--sm"
                                  onClick={() => handleDuplicate(role)}
                                  aria-label={`Duplikat peran ${role.name}`}
                                >
                                  <Copy className="cg-icon cg-icon--sm" aria-hidden />
                                  Duplikat
                                </button>
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                                  disabled={builtIn}
                                  title={
                                    builtIn
                                      ? 'Peran bawaan sistem tidak dapat dihapus'
                                      : `Hapus peran ${role.name}`
                                  }
                                  aria-label={
                                    builtIn
                                      ? `Hapus ${role.name} dinonaktifkan karena peran bawaan`
                                      : `Hapus peran ${role.name}`
                                  }
                                  onClick={() => setDeleteTarget(role)}
                                >
                                  <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tampilan Kartu (Mobile 390 px) */}
              <div className="grid gap-12 tablet:hidden">
                {filteredRoles.map((role) => {
                  const empCount = employeeCountForRole(role);
                  const summary = summarizeRoleAccess(role);
                  const builtIn = isBuiltInRole(role);
                  return (
                    <article
                      key={role.id}
                      className="p-16 bg-surface-raised border border-border rounded-xl shadow-card min-w-0 grid gap-12"
                      data-testid={`role-card-${role.id}`}
                    >
                      <div className="flex items-start justify-between gap-8 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-8 mb-4">
                            <strong className="break-words text-text text-base">{role.name}</strong>
                            <span
                              className={`cg-badge ${
                                builtIn ? 'cg-badge--info' : 'cg-badge--accent'
                              }`}
                            >
                              {builtIn ? 'Bawaan' : 'Kustom'}
                            </span>
                          </div>
                          {role.description && (
                            <p className="text-xs text-text-muted break-words">{role.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-text-muted">Karyawan</div>
                          <div className="font-semibold cg-num">{empCount}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-8 text-xs text-text-muted">
                        <span className="cg-badge">{summary.dashActive} modul dashboard</span>
                        <span className="cg-badge">{summary.posAllow} aksi kasir langsung</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-8 pt-8 border-t border-border">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm flex-1"
                          onClick={() => handleOpenEdit(role)}
                        >
                          <Edit2 className="cg-icon cg-icon--sm" aria-hidden />
                          Ubah
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm flex-1"
                          onClick={() => handleDuplicate(role)}
                        >
                          <Copy className="cg-icon cg-icon--sm" aria-hidden />
                          Duplikat
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          disabled={builtIn}
                          aria-label={`Hapus peran ${role.name}`}
                          onClick={() => setDeleteTarget(role)}
                        >
                          <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {editingRole && (
        <RoleEditorDialog
          initialRole={editingRole}
          isNew={isNewRole}
          allRoles={roles}
          onClose={() => setEditingRole(null)}
          onSave={handleSaveRole}
        />
      )}

      {deleteTarget && (
        <DeleteRoleDialog
          role={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleConfirmDelete(deleteTarget)}
        />
      )}
    </>
  );
}

function RoleEditorDialog({
  initialRole,
  isNew,
  allRoles,
  onClose,
  onSave,
}: {
  initialRole: RoleDefinition;
  isNew: boolean;
  allRoles: RoleDefinition[];
  onClose: () => void;
  onSave: (role: RoleDefinition) => void;
}) {
  const dlg = useDialog(onClose);
  const [activeTab, setActiveTab] = useState<'info' | 'dashboard' | 'pos'>('info');
  const [name, setName] = useState(initialRole.name);
  const [description, setDescription] = useState(initialRole.description);
  const [baseRole, setBaseRole] = useState<Role>(initialRole.baseRole);
  const [ownerAppAccess, setOwnerAppAccess] = useState(Boolean(initialRole.ownerAppAccess));
  const [dashPerms, setDashPerms] = useState<Record<string, DashboardAccessLevel>>(
    () => ({ ...initialRole.dashboardPerms })
  );
  const [posPerms, setPosPerms] = useState<Record<string, PosAccessLevel>>(
    () => ({ ...initialRole.posPerms })
  );
  const [formErr, setFormErr] = useState('');

  const builtIn = !isNew && isBuiltInRole(initialRole);

  const handleSetAllDash = (level: DashboardAccessLevel) => {
    const next: Record<string, DashboardAccessLevel> = {};
    for (const m of DASHBOARD_MODULES) {
      next[m.id] = level;
    }
    setDashPerms(next);
  };

  const handleApplyBaseDefaults = (targetBase: Role) => {
    setBaseRole(targetBase);
    setDashPerms(buildDefaultDashboardPerms(targetBase, DASHBOARD_MODULE_IDS));
    setPosPerms(buildDefaultPosPerms(targetBase));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validateRoleName(name, allRoles, isNew ? undefined : initialRole.id);
    if (err) {
      setFormErr(err);
      setActiveTab('info');
      return;
    }
    const updated: RoleDefinition = {
      ...initialRole,
      name: builtIn ? initialRole.name : name.trim(),
      description: description.trim(),
      baseRole,
      ownerAppAccess,
      dashboardPerms: dashPerms,
      posPerms,
    };
    onSave(updated);
  };

  return (
    <dialog
      {...dlg.props}
      style={{ ...dlg.props.style, width: 'min(760px, calc(100vw - 16px))' }}
      aria-labelledby="role-dlg-title"
    >
      <div className="flex items-start justify-between gap-12">
        <div className="min-w-0">
          <h2 id="role-dlg-title" className="cg-modal__title break-words">
            {isNew ? 'Tambah peran baru' : `Atur hak akses: ${initialRole.name}`}
          </h2>
          <p className="text-xs text-text-muted mt-4">
            Sesuaikan informasi dasar, akses modul dashboard web, dan batasan aksi kasir.
          </p>
        </div>
        <button
          type="button"
          className="cg-btn cg-btn--ghost cg-btn--sm"
          aria-label="Tutup dialog"
          onClick={onClose}
        >
          <X className="cg-icon cg-icon--sm" aria-hidden />
        </button>
      </div>

      {/* Tab datar 3 bagian */}
      <div className="cg-tabs flex-wrap" role="tablist" aria-label="Bagian pengaturan peran">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'info'}
          className="cg-tab inline-flex items-center gap-8"
          onClick={() => setActiveTab('info')}
        >
          <Info className="cg-icon cg-icon--sm" aria-hidden />
          Informasi
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          className="cg-tab inline-flex items-center gap-8"
          onClick={() => setActiveTab('dashboard')}
        >
          <Monitor className="cg-icon cg-icon--sm" aria-hidden />
          Hak Akses Dashboard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pos'}
          className="cg-tab inline-flex items-center gap-8"
          onClick={() => setActiveTab('pos')}
        >
          <Smartphone className="cg-icon cg-icon--sm" aria-hidden />
          Hak Akses POS
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-16">
        {formErr && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{formErr}</span>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="grid gap-16">
            <div className="cg-field">
              <label className="cg-label" htmlFor="role-name">
                Nama peran
              </label>
              <input
                id="role-name"
                type="text"
                className="cg-input"
                value={name}
                maxLength={50}
                disabled={builtIn}
                aria-invalid={Boolean(formErr)}
                placeholder="Contoh: Kepala Bar, Shift Supervisor, Gudang"
                onChange={(e) => {
                  setName(e.target.value);
                  if (formErr) setFormErr('');
                }}
              />
              {builtIn && (
                <span className="cg-hint">
                  Nama peran bawaan sistem tidak dapat diubah agar sinkronisasi karyawan tetap konsisten.
                </span>
              )}
            </div>

            <div className="cg-field">
              <label className="cg-label" htmlFor="role-desc">
                Deskripsi tugas
              </label>
              <textarea
                id="role-desc"
                className="cg-input py-8 min-h-[80px]"
                value={description}
                maxLength={200}
                placeholder="Ringkasan tanggung jawab peran ini..."
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {!builtIn && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="role-base">
                  Standar bawaan acuan
                </label>
                <div className="flex flex-wrap gap-8 items-center">
                  <select
                    id="role-base"
                    className="cg-input flex-1 min-w-[160px]"
                    value={baseRole}
                    onChange={(e) => setBaseRole(e.target.value as Role)}
                  >
                    <option value="cashier">Kasir (terbatas)</option>
                    <option value="manager">Manajer (operasional penuh)</option>
                    <option value="owner">Pemilik (akses menyeluruh)</option>
                  </select>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => handleApplyBaseDefaults(baseRole)}
                  >
                    Terapkan standar acuan
                  </button>
                </div>
                <span className="cg-hint">
                  Izin modul atau aksi yang belum diatur manual akan mengikuti standar acuan ini.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Akses Aplikasi Pemilik</div>
                <div className="text-xs text-text-muted">
                  Izinkan peran ini melihat ringkasan omzet lintas waktu di tampilan pemilik.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={ownerAppAccess}
                aria-label="Akses Aplikasi Pemilik"
                className="cg-toggle shrink-0"
                onClick={() => setOwnerAppAccess((v) => !v)}
              />
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="grid gap-12">
            <div className="flex flex-wrap items-center justify-between gap-8 pb-8 border-b border-border">
              <span className="text-xs text-text-muted">
                {DASHBOARD_MODULES.length} bagian modul dashboard web (sumber: nav.ts)
              </span>
              <div className="flex flex-wrap gap-8">
                <button
                  type="button"
                  className="cg-chip"
                  onClick={() => handleSetAllDash('write')}
                >
                  Semua: Lihat &amp; ubah
                </button>
                <button
                  type="button"
                  className="cg-chip"
                  onClick={() => handleSetAllDash('read')}
                >
                  Semua: Lihat saja
                </button>
                <button
                  type="button"
                  className="cg-chip"
                  onClick={() => handleSetAllDash('none')}
                >
                  Semua: Tidak ada
                </button>
              </div>
            </div>

            <div className="grid gap-8 max-h-[380px] overflow-y-auto pr-4">
              {DASHBOARD_MODULES.map((mod) => {
                const current = dashPerms[mod.id] ?? 'none';
                return (
                  <div
                    key={mod.id}
                    className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised"
                    data-testid={`dash-perm-${mod.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-text break-words">
                        {mod.label}
                      </div>
                      <div className="text-xs text-text-muted break-words">
                        {mod.sampleItems} ({mod.itemCount} layar)
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap gap-4 shrink-0"
                      role="group"
                      aria-label={`Izin modul ${mod.label}`}
                    >
                      {DASH_LEVELS.map((lvl) => (
                        <button
                          key={lvl.value}
                          type="button"
                          className="cg-chip text-xs"
                          aria-pressed={current === lvl.value}
                          onClick={() =>
                            setDashPerms((prev) => ({ ...prev, [mod.id]: lvl.value }))
                          }
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'pos' && (
          <div className="grid gap-12">
            <p className="text-xs text-text-muted pb-8 border-b border-border">
              Tentukan aksi kasir yang boleh dilakukan langsung, wajib persetujuan PIN atasan/kode otorisasi, atau dilarang sama sekali.
            </p>
            <div className="grid gap-8 max-h-[380px] overflow-y-auto pr-4">
              {POS_GRANULAR_PERMISSIONS.map((perm) => {
                const current = posPerms[perm.id] ?? 'deny';
                return (
                  <div
                    key={perm.id}
                    className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised"
                    data-testid={`pos-perm-${perm.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-text break-words">
                        {perm.label}
                      </div>
                      <div className="text-xs text-text-muted break-words">
                        {perm.description}
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap gap-4 shrink-0"
                      role="group"
                      aria-label={`Izin aksi kasir ${perm.label}`}
                    >
                      {POS_LEVELS.map((lvl) => (
                        <button
                          key={lvl.value}
                          type="button"
                          className="cg-chip text-xs"
                          aria-pressed={current === lvl.value}
                          onClick={() =>
                            setPosPerms((prev) => ({ ...prev, [perm.id]: lvl.value }))
                          }
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="cg-modal__actions pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan peran
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteRoleDialog({
  role,
  onClose,
  onConfirm,
}: {
  role: RoleDefinition;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dlg = useDialog(onClose);
  return (
    <dialog {...dlg.props} aria-labelledby="del-role-title">
      <h2 id="del-role-title" className="cg-modal__title">
        Hapus peran kustom?
      </h2>
      <p className="cg-modal__body">
        Anda yakin ingin menghapus peran <strong>{role.name}</strong>? Pengaturan izin untuk peran ini akan dihapus dari penyimpanan lokal.
      </p>
      <div className="cg-modal__actions">
        <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
          Batal
        </button>
        <button type="button" className="cg-btn cg-btn--danger" onClick={onConfirm}>
          Ya, hapus
        </button>
      </div>
    </dialog>
  );
}


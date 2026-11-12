'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  AlertCircle,
  Network,
  CornerDownRight,
} from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import type { OrgUnit, EmployeeHr } from '@cgpos/shared/src/hr';
import {
  hrNameProblem,
  hrNameTaken,
  orgUnitProblem,
} from '@cgpos/shared/src/hr';
import {
  flattenOrgTree,
  getEligibleParentUnits,
  countEmployeesWithHr,
  hrEntityDeleteWarning,
} from '@cgpos/shared/src/hr-ui';

export default function OrganisasiPage() {
  const data = useData();

  // Dialog state
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null | 'new'>(null);
  const [deletingUnit, setDeletingUnit] = useState<OrgUnit | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load data
  const contextAsync = useAsync(async () => {
    const [ctx, orgUnits, employeeHr] = await Promise.all([
      data.getContext(),
      data.listOrgUnits(),
      data.listEmployeeHr(),
    ]);
    return { ctx, orgUnits, employeeHr };
  }, [data]);

  const rawUnits: OrgUnit[] = contextAsync.status === 'ready' ? contextAsync.data.orgUnits : [];
  const rawEmployeeHr: EmployeeHr[] = contextAsync.status === 'ready' ? contextAsync.data.employeeHr : [];

  // Flattened hierarchical tree
  const treeNodes = useMemo(() => {
    return flattenOrgTree(rawUnits);
  }, [rawUnits]);

  // Filtered nodes based on search
  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return treeNodes;
    return treeNodes.filter((node) => node.unit.name.toLowerCase().includes(q));
  }, [treeNodes, searchQuery]);

  // Lookup map for parent names
  const unitMap = useMemo(() => {
    return new Map(rawUnits.map((u) => [u.id, u]));
  }, [rawUnits]);

  // Total employees with assigned org unit
  const assignedCount = useMemo(() => {
    return rawEmployeeHr.filter((h: EmployeeHr) => h.orgUnitId).length;
  }, [rawEmployeeHr]);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Organisasi karyawan"
        subtitle="Struktur departemen dan unit kerja berjenjang (induk > anak) untuk memetakan penempatan staf."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingUnit('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah unit organisasi</span>
          </button>
        }
      />

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setToastMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
            <Network className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Total Unit Organisasi</p>
            <p className="text-24 font-bold text-text cg-num">{rawUnits.length}</p>
          </div>
        </div>

        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-info/10 flex items-center justify-center text-info shrink-0">
            <Users className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Karyawan Terdaftar di Unit</p>
            <p className="text-24 font-bold text-text cg-num">{assignedCount}</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-12">
        <div className="relative flex-1 max-w-sm">
          <Search className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="text"
            className="cg-input pl-[36px] text-sm w-full"
            placeholder="Cari nama unit organisasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Loading state */}
      {contextAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/3" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {/* Empty state */}
      {contextAsync.status === 'ready' && rawUnits.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Building2 className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada unit organisasi</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Buat bagan departemen atau divisi (misalnya Operasional, Dapur, Kasir / Bar, Keuangan).
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingUnit('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah unit pertama</span>
          </button>
        </div>
      )}

      {/* Data View */}
      {contextAsync.status === 'ready' && rawUnits.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredNodes.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada unit yang cocok dengan pencarian &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <>
              {/* Desktop Table (>= 768px) */}
              <div className="hidden tablet:block overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-text-muted">
                      <th className="py-12 px-16 w-1/2">Unit Organisasi (Hirarki)</th>
                      <th className="py-12 px-16 w-1/4">Unit Induk</th>
                      <th className="py-12 px-16 w-1/8">Karyawan Terkait</th>
                      <th className="py-12 px-16 w-1/8 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map(({ unit, depth }) => {
                      const parent = unit.parentId ? unitMap.get(unit.parentId) : null;
                      const empCount = countEmployeesWithHr('orgUnitId', unit.id, rawEmployeeHr);
                      return (
                        <tr key={unit.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                          <td className="py-12 px-16">
                            <div className="flex items-center gap-8" style={{ paddingLeft: `${depth * 20}px` }}>
                              {depth > 0 && (
                                <CornerDownRight className="cg-icon cg-icon--xs text-text-muted shrink-0" aria-hidden />
                              )}
                              <span className={`text-sm ${depth === 0 ? 'font-bold text-text' : 'font-medium text-text'}`}>
                                {unit.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-12 px-16 text-xs text-text-muted">
                            {parent ? (
                              <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded bg-surface border border-border">
                                {parent.name}
                              </span>
                            ) : (
                              <span className="text-text-muted italic">Unit Utama (Induk Tertinggi)</span>
                            )}
                          </td>
                          <td className="py-12 px-16">
                            <span className="inline-flex items-center gap-8 text-xs text-text-muted">
                              <Users className="cg-icon cg-icon--xs" aria-hidden />
                              <span className="cg-num font-medium text-text">{empCount}</span> orang
                            </span>
                          </td>
                          <td className="py-12 px-16 text-right">
                            <div className="inline-flex items-center justify-end gap-8">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Ubah unit ${unit.name}`}
                                onClick={() => setEditingUnit(unit)}
                              >
                                <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Ubah</span>
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                                aria-label={`Hapus unit ${unit.name}`}
                                onClick={() => setDeletingUnit(unit)}
                              >
                                <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (< 768px) */}
              <div className="block tablet:hidden divide-y divide-border">
                {filteredNodes.map(({ unit, depth }) => {
                  const parent = unit.parentId ? unitMap.get(unit.parentId) : null;
                  const empCount = countEmployeesWithHr('orgUnitId', unit.id, rawEmployeeHr);
                  return (
                    <div key={unit.id} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-start justify-between gap-12">
                        <div className="min-w-0 flex-1">
                          {parent && (
                            <span className="text-[11px] text-text-muted block mb-4">
                              Induk: {parent.name}
                            </span>
                          )}
                          <h4 className="font-semibold text-sm text-text truncate">
                            {depth > 0 && <span className="text-text-muted mr-4">{'— '.repeat(depth)}</span>}
                            {unit.name}
                          </h4>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          <span className="font-bold text-text cg-num">{empCount}</span> staf
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-8 pt-4">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          onClick={() => setEditingUnit(unit)}
                        >
                          <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                          <span>Ubah</span>
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          onClick={() => setDeletingUnit(unit)}
                        >
                          <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Tambah / Ubah Unit */}
      {editingUnit && (
        <OrgUnitDialog
          unit={editingUnit === 'new' ? null : editingUnit}
          existingUnits={rawUnits}
          onClose={() => setEditingUnit(null)}
          onSaved={(saved) => {
            setEditingUnit(null);
            setToastMsg(`Unit organisasi "${saved.name}" berhasil disimpan.`);
            contextAsync.reload();
          }}
        />
      )}

      {/* Modal Hapus Unit */}
      {deletingUnit && (
        <DeleteOrgUnitDialog
          unit={deletingUnit}
          employeeCount={countEmployeesWithHr('orgUnitId', deletingUnit.id, rawEmployeeHr)}
          onClose={() => setDeletingUnit(null)}
          onDeleted={(name) => {
            setDeletingUnit(null);
            setToastMsg(`Unit organisasi "${name}" berhasil dihapus.`);
            contextAsync.reload();
          }}
        />
      )}
    </div>
  );
}

function OrgUnitDialog({
  unit,
  existingUnits,
  onClose,
  onSaved,
}: {
  unit: OrgUnit | null;
  existingUnits: readonly OrgUnit[];
  onClose: () => void;
  onSaved: (unit: OrgUnit) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);

  const [name, setName] = useState(unit?.name ?? '');
  const [parentId, setParentId] = useState<string>(unit?.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter eligible parent options: cannot be self or any descendant
  const eligibleParents = useMemo(() => {
    return getEligibleParentUnits(unit?.id, existingUnits);
  }, [unit, existingUnits]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameProb = hrNameProblem(name);
    if (nameProb) {
      setError(nameProb);
      return;
    }

    if (hrNameTaken(name, existingUnits as unknown as { id: string; name: string }[], unit?.id)) {
      setError('Nama unit organisasi ini sudah digunakan.');
      return;
    }

    const payload = {
      id: unit?.id,
      name: name.trim(),
      parentId: parentId ? parentId : null,
    };

    const unitProb = orgUnitProblem(payload, existingUnits as OrgUnit[]);
    if (unitProb) {
      setError(unitProb);
      return;
    }

    setSaving(true);
    try {
      const saved = await data.saveOrgUnit(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan unit organisasi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="org-dialog-title" className="cg-modal max-w-md w-full">
      <form onSubmit={handleSubmit} className="space-y-16">
        <h2 id="org-dialog-title" className="cg-modal__title">
          {unit ? 'Ubah Unit Organisasi' : 'Tambah Unit Organisasi'}
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <label className="text-xs font-semibold text-text-muted block" htmlFor="org-name">
            Nama Unit Organisasi <span className="text-danger">*</span>
          </label>
          <input
            id="org-name"
            type="text"
            required
            maxLength={60}
            className="cg-input w-full"
            placeholder="Misal: Divisi Dapur, Staf Bar, Akuntansi"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          <label className="text-xs font-semibold text-text-muted block" htmlFor="org-parent">
            Unit Induk (Atasan)
          </label>
          <select
            id="org-parent"
            className="cg-input w-full"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— Tidak ada induk (Unit Utama / Tertinggi) —</option>
            {eligibleParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted block">
            Pilih unit induk untuk membuat struktur bertingkat (misal Bar berada di bawah Operasional).
          </span>
        </div>

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Unit'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteOrgUnitDialog({
  unit,
  employeeCount,
  onClose,
  onDeleted,
}: {
  unit: OrgUnit;
  employeeCount: number;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warningMsg = hrEntityDeleteWarning('unit organisasi', unit.name, employeeCount);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await data.deleteOrgUnit(unit.id);
      onDeleted(unit.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus unit organisasi.');
      setDeleting(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="del-org-title" className="cg-modal max-w-md w-full">
      <div className="space-y-16">
        <h2 id="del-org-title" className="cg-modal__title">
          Hapus Unit Organisasi?
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <p className="text-sm text-text-muted leading-relaxed" data-testid="del-org-warning">
          {warningMsg}
        </p>

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={deleting}>
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger"
            disabled={deleting}
            onClick={handleConfirm}
          >
            {deleting ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

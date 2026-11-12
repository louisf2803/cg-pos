'use client';

import { useMemo, useState } from 'react';
import {
  Users2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import type { EmployeeType, EmployeeHr } from '@cgpos/shared/src/hr';
import {
  hrNameProblem,
  hrNameTaken,
} from '@cgpos/shared/src/hr';
import {
  countEmployeesWithHr,
  hrEntityDeleteWarning,
} from '@cgpos/shared/src/hr-ui';

export default function TipeKaryawanPage() {
  const data = useData();

  // Dialog state
  const [editingType, setEditingType] = useState<EmployeeType | null | 'new'>(null);
  const [deletingType, setDeletingType] = useState<EmployeeType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load data
  const contextAsync = useAsync(async () => {
    const [ctx, employeeTypes, employeeHr] = await Promise.all([
      data.getContext(),
      data.listEmployeeTypes(),
      data.listEmployeeHr(),
    ]);
    return { ctx, employeeTypes, employeeHr };
  }, [data]);

  const rawTypes: EmployeeType[] = contextAsync.status === 'ready' ? contextAsync.data.employeeTypes : [];
  const rawEmployeeHr: EmployeeHr[] = contextAsync.status === 'ready' ? contextAsync.data.employeeHr : [];

  // Filtered types based on search
  const filteredTypes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rawTypes.filter((t: EmployeeType) => (q ? t.name.toLowerCase().includes(q) : true));
  }, [rawTypes, searchQuery]);

  // Total employees with assigned employee type
  const assignedCount = useMemo(() => {
    return rawEmployeeHr.filter((h: EmployeeHr) => h.employeeTypeId).length;
  }, [rawEmployeeHr]);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Tipe karyawan"
        subtitle="Klasifikasi hubungan kerja staf (misalnya Karyawan Tetap, Kontrak, Paruh Waktu / Part-time, atau Magang)."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingType('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah tipe karyawan</span>
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
            <Tag className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Total Tipe Karyawan</p>
            <p className="text-24 font-bold text-text cg-num">{rawTypes.length}</p>
          </div>
        </div>

        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-info/10 flex items-center justify-center text-info shrink-0">
            <Users className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Karyawan Terklasifikasi</p>
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
            className="cg-input pl-36 text-sm w-full"
            placeholder="Cari nama tipe karyawan..."
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
      {contextAsync.status === 'ready' && rawTypes.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Users2 className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada tipe karyawan</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Tambahkan jenis hubungan kerja staf (misalnya Karyawan Tetap, Kontrak, Paruh Waktu, atau Magang).
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingType('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah tipe pertama</span>
          </button>
        </div>
      )}

      {/* Data View */}
      {contextAsync.status === 'ready' && rawTypes.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredTypes.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada tipe karyawan yang cocok dengan pencarian &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <>
              {/* Desktop Table (>= 768px) */}
              <div className="hidden tablet:block overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-text-muted">
                      <th className="py-12 px-16 w-3/5">Nama Tipe Karyawan</th>
                      <th className="py-12 px-16 w-1/5">Karyawan Terkait</th>
                      <th className="py-12 px-16 w-1/5 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTypes.map((type: EmployeeType) => {
                      const empCount = countEmployeesWithHr('employeeTypeId', type.id, rawEmployeeHr);
                      return (
                        <tr key={type.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                          <td className="py-12 px-16 font-medium text-text">
                            <span className="inline-flex items-center gap-8">
                              <span className="w-8 h-8 rounded-full bg-accent" />
                              {type.name}
                            </span>
                          </td>
                          <td className="py-12 px-16">
                            <span className="inline-flex items-center gap-6 text-xs text-text-muted">
                              <Users className="cg-icon cg-icon--xs" aria-hidden />
                              <span className="cg-num font-medium text-text">{empCount}</span> orang
                            </span>
                          </td>
                          <td className="py-12 px-16 text-right">
                            <div className="inline-flex items-center justify-end gap-8">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Ubah tipe ${type.name}`}
                                onClick={() => setEditingType(type)}
                              >
                                <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Ubah</span>
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                                aria-label={`Hapus tipe ${type.name}`}
                                onClick={() => setDeletingType(type)}
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
                {filteredTypes.map((type: EmployeeType) => {
                  const empCount = countEmployeesWithHr('employeeTypeId', type.id, rawEmployeeHr);
                  return (
                    <div key={type.id} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-start justify-between gap-12">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-sm text-text truncate">{type.name}</h4>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          <span className="font-bold text-text cg-num">{empCount}</span> staf
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-8 pt-4">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          onClick={() => setEditingType(type)}
                        >
                          <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                          <span>Ubah</span>
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          onClick={() => setDeletingType(type)}
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

      {/* Modal Tambah / Ubah Tipe */}
      {editingType && (
        <EmployeeTypeDialog
          type={editingType === 'new' ? null : editingType}
          existingTypes={rawTypes}
          onClose={() => setEditingType(null)}
          onSaved={(saved) => {
            setEditingType(null);
            setToastMsg(`Tipe karyawan "${saved.name}" berhasil disimpan.`);
            contextAsync.reload();
          }}
        />
      )}

      {/* Modal Hapus Tipe */}
      {deletingType && (
        <DeleteEmployeeTypeDialog
          type={deletingType}
          employeeCount={countEmployeesWithHr('employeeTypeId', deletingType.id, rawEmployeeHr)}
          onClose={() => setDeletingType(null)}
          onDeleted={(name) => {
            setDeletingType(null);
            setToastMsg(`Tipe karyawan "${name}" berhasil dihapus.`);
            contextAsync.reload();
          }}
        />
      )}
    </div>
  );
}

function EmployeeTypeDialog({
  type,
  existingTypes,
  onClose,
  onSaved,
}: {
  type: EmployeeType | null;
  existingTypes: readonly EmployeeType[];
  onClose: () => void;
  onSaved: (type: EmployeeType) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);

  const [name, setName] = useState(type?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameProb = hrNameProblem(name);
    if (nameProb) {
      setError(nameProb);
      return;
    }

    if (hrNameTaken(name, existingTypes as unknown as { id: string; name: string }[], type?.id)) {
      setError('Nama tipe karyawan ini sudah digunakan.');
      return;
    }

    setSaving(true);
    try {
      const saved = await data.saveEmployeeType({
        id: type?.id,
        name: name.trim(),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan tipe karyawan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="type-dialog-title" className="cg-modal max-w-md w-full">
      <form onSubmit={handleSubmit} className="space-y-16">
        <h2 id="type-dialog-title" className="cg-modal__title">
          {type ? 'Ubah Tipe Karyawan' : 'Tambah Tipe Karyawan'}
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <label className="text-xs font-semibold text-text-muted block" htmlFor="type-name">
            Nama Tipe Karyawan <span className="text-danger">*</span>
          </label>
          <input
            id="type-name"
            type="text"
            required
            maxLength={60}
            className="cg-input w-full"
            placeholder="Misal: Karyawan Tetap, PKWT, Paruh Waktu, Magang"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Tipe'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteEmployeeTypeDialog({
  type,
  employeeCount,
  onClose,
  onDeleted,
}: {
  type: EmployeeType;
  employeeCount: number;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warningMsg = hrEntityDeleteWarning('tipe karyawan', type.name, employeeCount);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await data.deleteEmployeeType(type.id);
      onDeleted(type.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus tipe karyawan.');
      setDeleting(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="del-type-title" className="cg-modal max-w-md w-full">
      <div className="space-y-16">
        <h2 id="del-type-title" className="cg-modal__title">
          Hapus Tipe Karyawan?
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <p className="text-sm text-text-muted leading-relaxed" data-testid="del-type-warning">
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

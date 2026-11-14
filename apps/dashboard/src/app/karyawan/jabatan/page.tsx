'use client';

import { useMemo, useState } from 'react';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  AlertCircle,
  Award,
} from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import type { JobLevel, EmployeeHr } from '@cgpos/shared/src/hr';
import {
  hrNameProblem,
  hrNameTaken,
  jobLevelProblem,
} from '@cgpos/shared/src/hr';
import {
  countEmployeesWithHr,
  hrEntityDeleteWarning,
} from '@cgpos/shared/src/hr-ui';

export default function JabatanPage() {
  const data = useData();

  // Dialog state
  const [editingJob, setEditingJob] = useState<JobLevel | null | 'new'>(null);
  const [deletingJob, setDeletingJob] = useState<JobLevel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load data
  const contextAsync = useAsync(async () => {
    const [ctx, jobLevels, employeeHr] = await Promise.all([
      data.getContext(),
      data.listJobLevels(),
      data.listEmployeeHr(),
    ]);
    return { ctx, jobLevels, employeeHr };
  }, [data]);

  const rawJobs = contextAsync.status === 'ready' ? contextAsync.data.jobLevels : [];
  const rawEmployeeHr = contextAsync.status === 'ready' ? contextAsync.data.employeeHr : [];

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rawJobs.filter((j: JobLevel) => (q ? j.name.toLowerCase().includes(q) : true));
  }, [rawJobs, searchQuery]);

  // Total employees with assigned job level
  const assignedCount = useMemo(() => {
    return rawEmployeeHr.filter((h: EmployeeHr) => h.jobLevelId).length;
  }, [rawEmployeeHr]);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Tingkat jabatan"
        subtitle="Kelola jenjang dan tingkatan jabatan karyawan (rank 0..99, diurutkan dari jabatan tertinggi)."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingJob('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah jabatan</span>
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
            <Award className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Total Tingkat Jabatan</p>
            <p className="text-24 font-bold text-text cg-num">{rawJobs.length}</p>
          </div>
        </div>

        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-info/10 flex items-center justify-center text-info shrink-0">
            <Users className="cg-icon cg-icon--md" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Karyawan Terpasang Jabatan</p>
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
            placeholder="Cari nama jabatan..."
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
      {contextAsync.status === 'ready' && rawJobs.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Briefcase className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada tingkat jabatan</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Tambahkan jabatan dan jenjang kepangkatan (misalnya Direktur, Manajer, Staf Senior, Staf Pelaksana).
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingJob('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah jabatan pertama</span>
          </button>
        </div>
      )}

      {/* Data View */}
      {contextAsync.status === 'ready' && rawJobs.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredJobs.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada jabatan yang cocok dengan pencarian &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <>
              {/* Desktop Table (>= 768px) */}
              <div className="hidden tablet:block overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-text-muted">
                      <th className="py-12 px-16 w-1/6">Tingkat (Rank)</th>
                      <th className="py-12 px-16 w-1/2">Nama Jabatan</th>
                      <th className="py-12 px-16 w-1/6">Karyawan Terkait</th>
                      <th className="py-12 px-16 w-1/6 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job: JobLevel) => {
                      const empCount = countEmployeesWithHr('jobLevelId', job.id, rawEmployeeHr);
                      return (
                        <tr key={job.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                          <td className="py-12 px-16">
                            <span className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg bg-surface font-bold text-xs text-text border border-border cg-num">
                              {job.rank}
                            </span>
                          </td>
                          <td className="py-12 px-16 font-medium text-text">
                            {job.name}
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
                                aria-label={`Ubah jabatan ${job.name}`}
                                onClick={() => setEditingJob(job)}
                              >
                                <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Ubah</span>
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                                aria-label={`Hapus jabatan ${job.name}`}
                                onClick={() => setDeletingJob(job)}
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
                {filteredJobs.map((job: JobLevel) => {
                  const empCount = countEmployeesWithHr('jobLevelId', job.id, rawEmployeeHr);
                  return (
                    <div key={job.id} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-start justify-between gap-12">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-8 mb-4">
                            <span className="px-8 py-[2px] rounded text-[11px] font-bold bg-surface border border-border cg-num">
                              Tingkat {job.rank}
                            </span>
                          </div>
                          <h4 className="font-semibold text-sm text-text truncate">{job.name}</h4>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          <span className="font-bold text-text cg-num">{empCount}</span> staf
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-8 pt-4">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          onClick={() => setEditingJob(job)}
                        >
                          <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                          <span>Ubah</span>
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          onClick={() => setDeletingJob(job)}
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

      {/* Modal Tambah / Ubah Jabatan */}
      {editingJob && (
        <JobDialog
          job={editingJob === 'new' ? null : editingJob}
          existingJobs={rawJobs}
          onClose={() => setEditingJob(null)}
          onSaved={(saved) => {
            setEditingJob(null);
            setToastMsg(`Jabatan "${saved.name}" berhasil disimpan.`);
            contextAsync.reload();
          }}
        />
      )}

      {/* Modal Hapus Jabatan */}
      {deletingJob && (
        <DeleteJobDialog
          job={deletingJob}
          employeeCount={countEmployeesWithHr('jobLevelId', deletingJob.id, rawEmployeeHr)}
          onClose={() => setDeletingJob(null)}
          onDeleted={(name) => {
            setDeletingJob(null);
            setToastMsg(`Jabatan "${name}" berhasil dihapus.`);
            contextAsync.reload();
          }}
        />
      )}
    </div>
  );
}

function JobDialog({
  job,
  existingJobs,
  onClose,
  onSaved,
}: {
  job: JobLevel | null;
  existingJobs: readonly JobLevel[];
  onClose: () => void;
  onSaved: (job: JobLevel) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);

  const [name, setName] = useState(job?.name ?? '');
  const [rank, setRank] = useState<number>(job?.rank ?? 0);
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

    if (hrNameTaken(name, existingJobs as unknown as { id: string; name: string }[], job?.id)) {
      setError('Nama jabatan ini sudah digunakan.');
      return;
    }

    const jobProb = jobLevelProblem({ id: job?.id, name, rank });
    if (jobProb) {
      setError(jobProb);
      return;
    }

    setSaving(true);
    try {
      const saved = await data.saveJobLevel({
        id: job?.id,
        name: name.trim(),
        rank: Number(rank),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan tingkat jabatan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="job-dialog-title" className="cg-modal max-w-md w-full">
      <form onSubmit={handleSubmit} className="space-y-16">
        <h2 id="job-dialog-title" className="cg-modal__title">
          {job ? 'Ubah Tingkat Jabatan' : 'Tambah Tingkat Jabatan'}
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <label className="text-xs font-semibold text-text-muted block" htmlFor="job-name">
            Nama Jabatan <span className="text-danger">*</span>
          </label>
          <input
            id="job-name"
            type="text"
            required
            maxLength={60}
            className="cg-input w-full"
            placeholder="Misal: Manajer Operasional, Kasir Senior"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          <label className="text-xs font-semibold text-text-muted block" htmlFor="job-rank">
            Tingkat Jabatan (Rank 0..99)
          </label>
          <input
            id="job-rank"
            type="number"
            min={0}
            max={99}
            step={1}
            required
            className="cg-input w-full"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
          />
          <span className="text-[11px] text-text-muted block">
            Urutkan dari angka tertinggi untuk jenjang yang lebih tinggi (mis. 90 = Direktur, 50 = Manajer, 10 = Staf).
          </span>
        </div>

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Jabatan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteJobDialog({
  job,
  employeeCount,
  onClose,
  onDeleted,
}: {
  job: JobLevel;
  employeeCount: number;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warningMsg = hrEntityDeleteWarning('jabatan', job.name, employeeCount);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await data.deleteJobLevel(job.id);
      onDeleted(job.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus tingkat jabatan.');
      setDeleting(false);
    }
  };

  return (
    <dialog {...dlg.props} aria-labelledby="del-job-title" className="cg-modal max-w-md w-full">
      <div className="space-y-16">
        <h2 id="del-job-title" className="cg-modal__title">
          Hapus Tingkat Jabatan?
        </h2>

        {error && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <span>{error}</span>
          </div>
        )}

        <p className="text-sm text-text-muted leading-relaxed" data-testid="del-job-warning">
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

'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  AlertCircle,
  FileText,
  DollarSign,
  ShoppingCart,
  User,
  Info,
} from 'lucide-react';
import {
  formatRp,
  approvalProblem,
  type ApprovalRequest,
  type ApprovalInput,
  type ApprovalStatus,
  type ApprovalKind,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog } from '@/components/fin-common';

function kindBadge(kind: ApprovalKind) {
  if (kind === 'purchase') {
    return (
      <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
        <ShoppingCart className="cg-icon cg-icon--xs" aria-hidden />
        Pembelian
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-info/10 text-info border border-info/20">
      <DollarSign className="cg-icon cg-icon--xs" aria-hidden />
      Keuangan
    </span>
  );
}

function statusBadge(status: ApprovalStatus) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
          <Clock className="cg-icon cg-icon--xs" aria-hidden />
          Menunggu
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
          <CheckCircle2 className="cg-icon cg-icon--xs" aria-hidden />
          Disetujui
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-danger/10 text-danger border border-danger/20">
          <XCircle className="cg-icon cg-icon--xs" aria-hidden />
          Ditolak
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-surface text-text-muted border border-border">
          <Ban className="cg-icon cg-icon--xs" aria-hidden />
          Dibatalkan
        </span>
      );
  }
}

// Modal Form Pengajuan Persetujuan Baru
function RequestApprovalDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [kind, setKind] = useState<ApprovalKind>('purchase');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numAmount = Math.max(0, Math.round(Number(amount) || 0));

    const payload: ApprovalInput = {
      kind,
      title: title.trim(),
      amount: numAmount,
      note: note.trim() || null,
    };

    const problem = approvalProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSubmitting(true);
    try {
      await data.requestApproval(payload);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleSubmit} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text">Buat Pengajuan Persetujuan Baru</h3>
            <p className="text-xs text-text-muted mt-4">
              Kirim permohonan persetujuan pembelian barang atau pengeluaran dana ke pemilik atau pengelola.
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={submitting}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <div className="space-y-8">
          <label className="text-xs font-semibold text-text-muted block">Jenis Persetujuan</label>
          <div className="grid grid-cols-2 gap-12">
            <label
              className={`flex items-center gap-8 p-12 rounded-lg border cursor-pointer ${
                kind === 'purchase'
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-surface hover:bg-surface-raised'
              }`}
            >
              <input
                type="radio"
                name="app-kind"
                value="purchase"
                checked={kind === 'purchase'}
                onChange={() => setKind('purchase')}
                className="text-accent"
              />
              <ShoppingCart className="cg-icon cg-icon--sm text-accent" aria-hidden />
              <div>
                <span className="font-bold text-sm text-text block">Pembelian</span>
                <span className="text-[11px] text-text-muted block">Pengadaan barang & bahan baku</span>
              </div>
            </label>

            <label
              className={`flex items-center gap-8 p-12 rounded-lg border cursor-pointer ${
                kind === 'finance'
                  ? 'border-info bg-info/5'
                  : 'border-border bg-surface hover:bg-surface-raised'
              }`}
            >
              <input
                type="radio"
                name="app-kind"
                value="finance"
                checked={kind === 'finance'}
                onChange={() => setKind('finance')}
                className="text-info"
              />
              <DollarSign className="cg-icon cg-icon--sm text-info" aria-hidden />
              <div>
                <span className="font-bold text-sm text-text block">Keuangan</span>
                <span className="text-[11px] text-text-muted block">Biaya non-rutin & kas keluar</span>
              </div>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <label htmlFor="app-title" className="text-xs font-semibold text-text-muted block">
            Judul Pengajuan <span className="text-danger">*</span>
          </label>
          <input
            id="app-title"
            type="text"
            required
            maxLength={120}
            placeholder="Misal: Pembelian 10 Sak Biji Kopi Arabika House Blend"
            className="cg-input text-sm w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-4">
          <label htmlFor="app-amount" className="text-xs font-semibold text-text-muted block">
            Perkiraan Dana (Rp) <span className="text-danger">*</span>
          </label>
          <input
            id="app-amount"
            type="number"
            min={0}
            step={1}
            required
            placeholder="0"
            className="cg-input text-sm w-full cg-num"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-4">
          <label htmlFor="app-note" className="text-xs font-semibold text-text-muted block">
            Catatan / Alasan Kebutuhan (Opsional)
          </label>
          <textarea
            id="app-note"
            rows={3}
            maxLength={300}
            placeholder="Jelaskan kebutuhan pengajuan ini untuk mempermudah peninjauan..."
            className="cg-input text-sm w-full resize-none leading-relaxed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={submitting}>
            {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Modal Keputusan Persetujuan (Setuju / Tolak)
function DecideDialog({
  request,
  decision,
  onClose,
  onDecided,
}: {
  request: ApprovalRequest;
  decision: 'approved' | 'rejected';
  onClose: () => void;
  onDecided: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isApprove = decision === 'approved';

  const handleDecide = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await data.decideApproval(request.id, decision === 'approved', note.trim() || undefined);
      onDecided();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memutuskan persetujuan.';
      // Provide clear guidance on self-approval forbidden
      if (msg.includes('forbidden') || msg.toLowerCase().includes('sendiri')) {
        setFormError('Anda tidak memiliki izin atau tidak diperbolehkan memutuskan ajuan Anda sendiri.');
      } else {
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleDecide} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div className="flex items-center gap-8">
            {isApprove ? (
              <CheckCircle2 className="cg-icon cg-icon--md text-success" aria-hidden />
            ) : (
              <XCircle className="cg-icon cg-icon--md text-danger" aria-hidden />
            )}
            <div>
              <h3 className="font-bold text-base text-text">
                {isApprove ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}
              </h3>
              <p className="text-xs text-text-muted mt-4">{request.title}</p>
            </div>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={submitting}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <div className="bg-surface p-16 rounded-xl border border-border space-y-8 text-xs text-text">
          <div className="flex justify-between">
            <span className="text-text-muted">Jenis:</span>
            <span>{request.kind === 'purchase' ? 'Pembelian' : 'Keuangan'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Nominal:</span>
            <span className="font-bold text-sm cg-num text-accent">{formatRp(request.amount)}</span>
          </div>
          {request.note && (
            <div className="pt-8 border-t border-border">
              <span className="text-text-muted block mb-4">Catatan Pemohon:</span>
              <p className="italic bg-surface-raised p-8 rounded border border-border">{request.note}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <label htmlFor="decide-note" className="text-xs font-semibold text-text-muted block">
            Catatan Keputusan (Opsional)
          </label>
          <textarea
            id="decide-note"
            rows={3}
            maxLength={300}
            placeholder={
              isApprove
                ? 'Catatan persetujuan, instruksi eksekusi...'
                : 'Alasan penolakan pengajuan...'
            }
            className="cg-input text-sm w-full resize-none leading-relaxed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Batal
          </button>
          <button
            type="submit"
            className={`cg-btn ${isApprove ? 'cg-btn--primary' : 'cg-btn--danger'}`}
            disabled={submitting}
          >
            {submitting ? 'Memproses...' : isApprove ? 'Setujui Sekarang' : 'Tolak Pengajuan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function ApprovalsPage() {
  const data = useData();

  const [activeTab, setActiveTab] = useState<ApprovalStatus>('pending');
  const [filterKind, setFilterKind] = useState<'all' | ApprovalKind>('all');

  const [showNewModal, setShowNewModal] = useState(false);
  const [deciding, setDeciding] = useState<{
    request: ApprovalRequest;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<ApprovalRequest | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingCancel, setProcessingCancel] = useState(false);

  const approvalsAsync = useAsync(() => data.listApprovals(), [data]);
  const allApprovals: readonly ApprovalRequest[] =
    approvalsAsync.status === 'ready' ? approvalsAsync.data : [];

  // Counts by status
  const counts = useMemo(() => {
    const res = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const a of allApprovals) {
      if (a.status in res) res[a.status]++;
    }
    return res;
  }, [allApprovals]);

  // Filtered by status and kind
  const displayedApprovals = useMemo(() => {
    return allApprovals
      .filter((a) => a.status === activeTab)
      .filter((a) => (filterKind === 'all' ? true : a.kind === filterKind))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [allApprovals, activeTab, filterKind]);

  const reloadData = () => {
    approvalsAsync.reload();
  };

  const handleCancelApproval = async () => {
    if (!cancellingRequest) return;
    setProcessingCancel(true);
    setActionError(null);

    try {
      await data.cancelApproval(cancellingRequest.id);
      setCancellingRequest(null);
      setToastMsg(`Pengajuan "${cancellingRequest.title}" berhasil dibatalkan.`);
      reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membatalkan pengajuan.';
      if (msg.includes('forbidden')) {
        setActionError('Anda tidak memiliki izin untuk membatalkan pengajuan ini.');
      } else {
        setActionError(msg);
      }
      setCancellingRequest(null);
    } finally {
      setProcessingCancel(false);
    }
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Alur Persetujuan"
        subtitle="Kelola otorisasi pengadaan barang pembelian dan pengeluaran dana operasional sebelum dieksekusi."
        actions={
          <div className="flex items-center gap-8">
            <Link href="/keuangan/tagihan-rutin" className="cg-btn cg-btn--secondary">
              <Clock className="cg-icon cg-icon--sm" aria-hidden />
              <span>Tagihan Rutin</span>
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              <span>Ajukan persetujuan</span>
            </button>
          </div>
        }
      />

      {/* Honest Info Banner */}
      <div className="cg-card p-16 bg-surface border-border flex items-start gap-12 text-sm leading-relaxed text-text">
        <Info className="cg-icon cg-icon--sm text-accent mt-4 shrink-0" aria-hidden />
        <div className="space-y-4">
          <p className="font-semibold text-text">Keterangan penting alur persetujuan:</p>
          <p className="text-text-muted text-xs">
            Alur persetujuan saat ini berfungsi sebagai pencatatan dan verifikasi otorisasi internal. Penegakan otomatis yang menahan penerbitan Purchase Order atau transaksi kas keluar di kasir POS masih dalam tahap integrasi bertahap.
          </p>
        </div>
      </div>

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

      {actionError && (
        <div role="alert" className="cg-banner cg-banner--danger flex items-center justify-between">
          <div className="flex items-center gap-8">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setActionError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Status Tabs Navigation */}
      <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 border-b border-border pb-8">
        <div className="flex items-center gap-8 overflow-x-auto min-w-0">
          {(
            [
              { id: 'pending', label: 'Menunggu', count: counts.pending },
              { id: 'approved', label: 'Disetujui', count: counts.approved },
              { id: 'rejected', label: 'Ditolak', count: counts.rejected },
              { id: 'cancelled', label: 'Dibatalkan', count: counts.cancelled },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`flex items-center gap-8 px-12 py-8 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-8 py-[1px] rounded-full text-[11px] cg-num ${
                    active ? 'bg-accent text-white' : 'bg-surface border border-border text-text-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Kind Filter */}
        <div className="flex items-center gap-8">
          <label htmlFor="filter-kind" className="text-xs font-semibold text-text-muted whitespace-nowrap">
            Jenis:
          </label>
          <select
            id="filter-kind"
            className="cg-input text-xs"
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as 'all' | ApprovalKind)}
          >
            <option value="all">Semua Jenis</option>
            <option value="purchase">Pembelian</option>
            <option value="finance">Keuangan</option>
          </select>
        </div>
      </div>

      {approvalsAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {approvalsAsync.status === 'error' && (
        <ErrorBox message={approvalsAsync.message} onRetry={reloadData} />
      )}

      {approvalsAsync.status === 'ready' && displayedApprovals.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <FileText className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">
            Tidak ada pengajuan pada status &quot;{activeTab}&quot;
          </h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Gunakan tombol &quot;Ajukan persetujuan&quot; untuk mengajukan pembelian barang atau anggaran biaya baru.
          </p>
          {activeTab === 'pending' && (
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              <span>Buat pengajuan pertama</span>
            </button>
          )}
        </div>
      )}

      {approvalsAsync.status === 'ready' && displayedApprovals.length > 0 && (
        <div className="space-y-12">
          {displayedApprovals.map((req) => (
            <div
              key={req.id}
              className="cg-card p-20 space-y-12 hover:border-accent/40 transition-colors"
            >
              <div className="flex flex-col tablet:flex-row tablet:items-start justify-between gap-12">
                <div className="min-w-0 flex-1 space-y-8">
                  <div className="flex flex-wrap items-center gap-8">
                    {kindBadge(req.kind)}
                    {statusBadge(req.status)}
                    <span className="text-xs text-text-muted flex items-center gap-4">
                      <Clock className="cg-icon cg-icon--xs" aria-hidden />
                      <span>{new Date(req.createdAt).toLocaleString('id-ID')}</span>
                    </span>
                    {req.requestedBy && (
                      <span className="text-xs text-text-muted flex items-center gap-4">
                        <User className="cg-icon cg-icon--xs" aria-hidden />
                        <span>Diajukan oleh: {req.requestedBy}</span>
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-base text-text">{req.title}</h4>

                  {req.note && (
                    <p className="text-xs text-text-muted leading-relaxed bg-surface p-8 rounded-lg border border-border">
                      {req.note}
                    </p>
                  )}

                  {req.decidedAt && (
                    <div className="text-xs text-text-muted pt-4 border-t border-border flex flex-wrap items-center gap-8">
                      <span>
                        Diputuskan pada: {new Date(req.decidedAt).toLocaleString('id-ID')}
                        {req.decidedBy ? ` oleh ${req.decidedBy}` : ''}
                      </span>
                      {req.decisionNote && (
                        <span className="italic font-medium text-text">
                          &quot;{req.decisionNote}&quot;
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-row tablet:flex-col items-center tablet:items-end justify-between tablet:justify-start gap-12 shrink-0">
                  <span className="font-bold text-lg text-accent cg-num">
                    {formatRp(req.amount)}
                  </span>

                  {req.status === 'pending' && (
                    <div className="flex items-center gap-8">
                      <button
                        type="button"
                        className="cg-btn cg-btn--primary cg-btn--sm"
                        onClick={() => setDeciding({ request: req, decision: 'approved' })}
                      >
                        <CheckCircle2 className="cg-icon cg-icon--xs" aria-hidden />
                        <span>Setujui</span>
                      </button>

                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm text-danger"
                        onClick={() => setDeciding({ request: req, decision: 'rejected' })}
                      >
                        <XCircle className="cg-icon cg-icon--xs" aria-hidden />
                        <span>Tolak</span>
                      </button>

                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm text-text-muted hover:text-danger"
                        title="Batalkan Pengajuan"
                        onClick={() => setCancellingRequest(req)}
                      >
                        <Ban className="cg-icon cg-icon--xs" aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Ajukan Baru */}
      {showNewModal && (
        <RequestApprovalDialog
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            reloadData();
            setToastMsg('Pengajuan persetujuan berhasil dikirim.');
          }}
        />
      )}

      {/* Modal Keputusan (Setuju / Tolak) */}
      {deciding && (
        <DecideDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDecided={() => {
            reloadData();
            setToastMsg(
              deciding.decision === 'approved'
                ? `Pengajuan "${deciding.request.title}" disetujui.`
                : `Pengajuan "${deciding.request.title}" ditolak.`,
            );
          }}
        />
      )}

      {/* Dialog Konfirmasi Batalkan */}
      {cancellingRequest && (
        <dialog
          open
          className="cg-modal"
          style={{ margin: 'auto', maxWidth: 'min(480px, calc(100vw - 16px))' }}
          onClose={() => !processingCancel && setCancellingRequest(null)}
        >
          <div className="p-24 space-y-16">
            <h3 className="font-bold text-base text-text flex items-center gap-8 text-warning">
              <Ban className="cg-icon cg-icon--sm" aria-hidden />
              Batalkan Pengajuan Persetujuan
            </h3>
            <p className="text-sm text-text-muted">
              Apakah Anda yakin ingin membatalkan pengajuan <strong>{cancellingRequest.title}</strong>?
            </p>
            <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                disabled={processingCancel}
                onClick={() => setCancellingRequest(null)}
              >
                Kembali
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--danger"
                disabled={processingCancel}
                onClick={handleCancelApproval}
              >
                {processingCancel ? 'Membatalkan...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

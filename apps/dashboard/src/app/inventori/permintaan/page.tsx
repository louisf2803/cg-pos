'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Package,
  AlertCircle,
  Truck,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  STOCK_REQUEST_STATUS_LABEL,
  stockRequestProblem,
  stockRequestActions,
  type StockRequest,
  type StockRequestInput,
  type StockRequestStatus,
  type StockLocation,
  type StockItem,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog } from '@/components/fin-common';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: StockRequestStatus) {
  const label = STOCK_REQUEST_STATUS_LABEL[status] || status;
  switch (status) {
    case 'requested':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
          <Clock className="cg-icon cg-icon--xs" aria-hidden />
          {label}
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-info/10 text-info border border-info/20">
          <CheckCircle2 className="cg-icon cg-icon--xs" aria-hidden />
          {label}
        </span>
      );
    case 'fulfilled':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
          <Truck className="cg-icon cg-icon--xs" aria-hidden />
          {label}
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-danger/10 text-danger border border-danger/20">
          <XCircle className="cg-icon cg-icon--xs" aria-hidden />
          {label}
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-xs font-semibold bg-surface text-text-muted border border-border">
          <Ban className="cg-icon cg-icon--xs" aria-hidden />
          {label}
        </span>
      );
  }
}

// Modal Buat Permintaan Barang Baru
function CreateRequestDialog({
  locations,
  stockItems,
  onClose,
  onCreated,
}: {
  locations: readonly StockLocation[];
  stockItems: readonly StockItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [requesterId, setRequesterId] = useState(locations[0]?.id || '');
  const [sourceId, setSourceId] = useState(locations[1]?.id || '');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ productId: string; qty: number }[]>([
    { productId: stockItems[0]?.productId || '', qty: 1 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const addLine = () => {
    // Pick first product not already in lines
    const used = new Set(lines.map((l) => l.productId));
    const nextProd = stockItems.find((s) => !used.has(s.productId))?.productId || stockItems[0]?.productId || '';
    setLines([...lines, { productId: nextProd, qty: 1 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLineProduct = (idx: number, productId: string) => {
    const next = [...lines];
    const item = next[idx];
    if (item) {
      item.productId = productId;
      setLines(next);
    }
  };

  const updateLineQty = (idx: number, qty: number) => {
    const next = [...lines];
    const item = next[idx];
    if (item) {
      item.qty = qty;
      setLines(next);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: StockRequestInput = {
      requesterId,
      sourceId,
      note: note.trim() || undefined,
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty) || 0,
      })),
    };

    const problem = stockRequestProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSubmitting(true);
    try {
      await data.createStockRequest(payload);
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat permintaan barang.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleSubmit} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text">Buat Permintaan Barang Antar Lokasi</h3>
            <p className="text-xs text-text-muted mt-2">
              Minta stok produk dari gudang utama atau outlet lain untuk memenuhi persediaan.
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

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="space-y-4">
            <label htmlFor="req-requester" className="text-xs font-semibold text-text-muted block">
              Lokasi Peminta (Tujuan Stok) <span className="text-danger">*</span>
            </label>
            <select
              id="req-requester"
              required
              className="cg-input text-sm w-full"
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
              disabled={submitting}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <label htmlFor="req-source" className="text-xs font-semibold text-text-muted block">
              Lokasi Sumber (Penyedia Stok) <span className="text-danger">*</span>
            </label>
            <select
              id="req-source"
              required
              className="cg-input text-sm w-full"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={submitting}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id} disabled={loc.id === requesterId}>
                  {loc.name} {loc.id === requesterId ? '(Sama dengan peminta)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lines Section */}
        <div className="space-y-8 pt-8 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted">
              Daftar Barang yang Diminta <span className="text-danger">*</span>
            </span>
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm text-accent"
              onClick={addLine}
              disabled={submitting || lines.length >= stockItems.length}
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Tambah Baris Barang</span>
            </button>
          </div>

          <div className="space-y-8 max-h-64 overflow-y-auto">
            {lines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-8">
                <select
                  aria-label="Pilih barang"
                  className="cg-input text-sm flex-1 min-w-0"
                  value={line.productId}
                  onChange={(e) => updateLineProduct(idx, e.target.value)}
                  disabled={submitting}
                >
                  {stockItems.map((s) => (
                    <option key={s.productId} value={s.productId}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-4 w-32 shrink-0">
                  <input
                    aria-label="Jumlah kuantitas"
                    type="number"
                    min={0.0001}
                    step="any"
                    required
                    placeholder="Qty"
                    className="cg-input text-sm w-full cg-num text-right"
                    value={line.qty}
                    onChange={(e) => updateLineQty(idx, Number(e.target.value))}
                    disabled={submitting}
                  />
                </div>

                <button
                  type="button"
                  className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10 shrink-0"
                  disabled={submitting || lines.length <= 1}
                  onClick={() => removeLine(idx)}
                  title="Hapus baris"
                >
                  <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label htmlFor="req-note" className="text-xs font-semibold text-text-muted block">
            Catatan Keperluan (Opsional)
          </label>
          <textarea
            id="req-note"
            rows={2}
            maxLength={300}
            placeholder="Alasan permintaan barang mendesak atau perkiraan kebutuhan..."
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
            {submitting ? 'Mengirim...' : 'Kirim Permintaan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Modal Putuskan (Setuju / Tolak)
function DecideDialog({
  request,
  decision,
  onClose,
  onDecided,
}: {
  request: StockRequest;
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
      await data.decideStockRequest(request.id, isApprove, note.trim() || undefined);
      onDecided();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memutuskan permintaan barang.');
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
                {isApprove ? 'Setujui Permintaan Barang' : 'Tolak Permintaan Barang'}
              </h3>
              <p className="text-xs text-text-muted mt-2">{request.number}</p>
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
            <span className="text-text-muted">Rute:</span>
            <span className="font-semibold">
              {request.sourceName} <ArrowRight className="inline cg-icon cg-icon--xs" /> {request.requesterName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Jumlah Item:</span>
            <span className="font-bold">{request.lines.length} jenis barang</span>
          </div>
        </div>

        <div className="space-y-4">
          <label htmlFor="decide-stock-note" className="text-xs font-semibold text-text-muted block">
            Catatan Keputusan (Opsional)
          </label>
          <textarea
            id="decide-stock-note"
            rows={3}
            maxLength={300}
            placeholder={
              isApprove
                ? 'Catatan untuk tim gudang sumber pengirim...'
                : 'Alasan penolakan permintaan...'
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
            {submitting ? 'Memproses...' : isApprove ? 'Setujui Permintaan' : 'Tolak Permintaan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Modal Konfirmasi Penuhi Permintaan
function FulfillDialog({
  request,
  onClose,
  onFulfilled,
}: {
  request: StockRequest;
  onClose: () => void;
  onFulfilled: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFulfill = async () => {
    setFormError(null);
    setSubmitting(true);

    try {
      await data.fulfillStockRequest(request.id);
      onFulfilled();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memenuhi permintaan barang.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog {...props}>
      <div className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div className="flex items-center gap-8 text-accent">
            <Truck className="cg-icon cg-icon--md" aria-hidden />
            <div>
              <h3 className="font-bold text-base text-text">Penuhi Permintaan Barang</h3>
              <p className="text-xs text-text-muted mt-2">{request.number}</p>
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

        <div className="p-16 rounded-xl bg-info/10 border border-info/20 text-xs text-text space-y-4">
          <p className="font-bold text-info text-sm">Konfirmasi Pengurangan Stok & Pengiriman:</p>
          <p>
            Dengan memenuhi permintaan ini, sistem akan <strong>langsung memotong stok fisik</strong> pada lokasi sumber ({request.sourceName}) dan membuat dokumen <strong>Transfer Stok</strong> baru berstatus dalam perjalanan (in_transit) menuju lokasi peminta ({request.requesterName}).
          </p>
        </div>

        <div className="bg-surface p-16 rounded-xl border border-border space-y-8 text-xs text-text">
          <p className="font-semibold text-text mb-4">Daftar Barang yang Dikirim:</p>
          <ul className="divide-y divide-border">
            {request.lines.map((line, idx) => (
              <li key={idx} className="py-6 flex justify-between">
                <span>{line.name}</span>
                <span className="font-bold cg-num">{line.qty} unit</span>
              </li>
            ))}
          </ul>
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
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={handleFulfill}
            disabled={submitting}
          >
            {submitting ? 'Memproses...' : 'Ya, Penuhi & Kirim Stok'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function StockRequestsPage() {
  const data = useData();

  const [activeTab, setActiveTab] = useState<StockRequestStatus | 'all'>('requested');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [decidingRequest, setDecidingRequest] = useState<{
    request: StockRequest;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [fulfillingRequest, setFulfillingRequest] = useState<StockRequest | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<StockRequest | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingCancel, setProcessingCancel] = useState(false);

  const stateAsync = useAsync(async () => {
    const [requests, locations, stockItems] = await Promise.all([
      data.listStockRequests(),
      data.listStockLocations(),
      data.listStock(),
    ]);
    return { requests, locations, stockItems };
  }, [data]);

  const requests: readonly StockRequest[] =
    stateAsync.status === 'ready' ? stateAsync.data.requests : [];
  const locations: readonly StockLocation[] =
    stateAsync.status === 'ready' ? stateAsync.data.locations : [];
  const stockItems: readonly StockItem[] =
    stateAsync.status === 'ready' ? stateAsync.data.stockItems : [];

  // Status Counts
  const counts = useMemo(() => {
    const res: Record<StockRequestStatus, number> = {
      requested: 0,
      approved: 0,
      fulfilled: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of requests) {
      res[r.status] = (res[r.status] ?? 0) + 1;
    }
    return res;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => (activeTab === 'all' ? true : r.status === activeTab))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [requests, activeTab]);

  const reloadData = () => {
    stateAsync.reload();
  };

  const handleCancel = async () => {
    if (!cancellingRequest) return;
    setProcessingCancel(true);
    setActionError(null);

    try {
      await data.cancelStockRequest(cancellingRequest.id);
      setCancellingRequest(null);
      setToastMsg(`Permintaan "${cancellingRequest.number}" berhasil dibatalkan.`);
      reloadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal membatalkan permintaan.');
      setCancellingRequest(null);
    } finally {
      setProcessingCancel(false);
    }
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Permintaan Barang"
        subtitle="Alur permintaan pengiriman stok barang antar lokasi dan outlet untuk persediaan toko."
        actions={
          <div className="flex items-center gap-8">
            <Link href="/inventori/transfer" className="cg-btn cg-btn--secondary">
              <Truck className="cg-icon cg-icon--sm" aria-hidden />
              <span>Transfer Stok</span>
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              disabled={locations.length < 2 || stockItems.length === 0}
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              <span>Buat permintaan</span>
            </button>
          </div>
        }
      />

      {/* Honest Note on PO / Advance Link */}
      <div className="cg-card p-16 bg-surface border-border flex items-start gap-12 text-sm leading-relaxed text-text">
        <Info className="cg-icon cg-icon--sm text-accent mt-4 shrink-0" aria-hidden />
        <div className="space-y-4">
          <p className="font-semibold text-text">Ketentuan alur permintaan barang:</p>
          <p className="text-text-muted text-xs">
            Alur ini mengelola pemenuhan stok antar lokasi atau gudang internal. Belum ada tautan otomatis ke pemesanan stok vendor eksternal (PO) maupun pembayaran uang muka pembelian.
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
      <div className="flex items-center gap-8 overflow-x-auto min-w-0 border-b border-border pb-8">
        {(
          [
            { id: 'requested', label: 'Menunggu', count: counts.requested },
            { id: 'approved', label: 'Disetujui', count: counts.approved },
            { id: 'fulfilled', label: 'Dipenuhi', count: counts.fulfilled },
            { id: 'rejected', label: 'Ditolak', count: counts.rejected },
            { id: 'cancelled', label: 'Dibatalkan', count: counts.cancelled },
            { id: 'all', label: 'Semua', count: requests.length },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`flex items-center gap-6 px-12 py-8 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text hover:bg-surface'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <span
                className={`px-6 py-[1px] rounded-full text-[11px] cg-num ${
                  active ? 'bg-accent text-white' : 'bg-surface border border-border text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {stateAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {stateAsync.status === 'error' && (
        <ErrorBox message={stateAsync.message} onRetry={reloadData} />
      )}

      {stateAsync.status === 'ready' && locations.length < 2 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Package className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Butuh minimal dua lokasi stok</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Permintaan barang membutuhkan minimal dua lokasi (misalnya toko utama dan gudang persediaan).
          </p>
        </div>
      )}

      {stateAsync.status === 'ready' && locations.length >= 2 && filteredRequests.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Package className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">
            Tidak ada permintaan pada status ini
          </h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Buat permintaan baru untuk meminta pasokan barang dari gudang atau outlet penyedia.
          </p>
          {activeTab === 'requested' && (
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              <span>Buat permintaan pertama</span>
            </button>
          )}
        </div>
      )}

      {stateAsync.status === 'ready' && locations.length >= 2 && filteredRequests.length > 0 && (
        <div className="cg-card overflow-hidden">
          <div className="cg-data-wrap min-w-0">
            <table className="cg-data w-full text-left">
              <thead>
                <tr>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nomor</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted">Rute Permintaan</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Barang</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted">Tanggal</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Status</th>
                  <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRequests.map((req) => {
                  const actions = stockRequestActions(req.status);
                  const isExpanded = expandedId === req.id;

                  return (
                    <tr key={req.id} className="hover:bg-surface/50 group">
                      <td className="py-12 px-16">
                        <button
                          type="button"
                          className="font-bold text-sm text-accent hover:underline flex items-center gap-4 text-left"
                          onClick={() => setExpandedId(isExpanded ? null : req.id)}
                        >
                          <span>{req.number}</span>
                          {isExpanded ? (
                            <ChevronUp className="cg-icon cg-icon--xs" aria-hidden />
                          ) : (
                            <ChevronDown className="cg-icon cg-icon--xs" aria-hidden />
                          )}
                        </button>
                      </td>
                      <td className="py-12 px-16 text-sm text-text">
                        <span className="font-medium text-text">{req.sourceName}</span>
                        <ArrowRight className="inline mx-4 cg-icon cg-icon--xs text-text-muted" aria-hidden />
                        <span className="font-semibold text-text">{req.requesterName}</span>
                      </td>
                      <td className="py-12 px-16 text-center text-xs text-text-muted whitespace-nowrap">
                        <span className="font-bold text-text cg-num">{req.lines.length}</span> jenis barang
                      </td>
                      <td className="py-12 px-16 text-xs text-text-muted whitespace-nowrap">
                        {fmtTime(req.createdAt)}
                      </td>
                      <td className="py-12 px-16 text-center">
                        {statusBadge(req.status)}
                      </td>
                      <td className="py-12 px-16 text-right">
                        <div className="inline-flex items-center justify-end gap-6">
                          {actions.decide && (
                            <>
                              <button
                                type="button"
                                className="cg-btn cg-btn--primary cg-btn--sm"
                                onClick={() => setDecidingRequest({ request: req, decision: 'approved' })}
                              >
                                <CheckCircle2 className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Setujui</span>
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--secondary cg-btn--sm text-danger"
                                onClick={() => setDecidingRequest({ request: req, decision: 'rejected' })}
                              >
                                <XCircle className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Tolak</span>
                              </button>
                            </>
                          )}

                          {actions.fulfill && (
                            <button
                              type="button"
                              className="cg-btn cg-btn--primary cg-btn--sm"
                              onClick={() => setFulfillingRequest(req)}
                            >
                              <Truck className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Penuhi</span>
                            </button>
                          )}

                          {actions.cancel && (
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm text-text-muted hover:text-danger"
                              title="Batalkan Permintaan"
                              onClick={() => setCancellingRequest(req)}
                            >
                              <Ban className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Batal</span>
                            </button>
                          )}

                          {req.transferId && (
                            <Link
                              href="/inventori/transfer"
                              className="cg-btn cg-btn--ghost cg-btn--sm text-accent hover:underline flex items-center gap-4"
                              title="Lihat Dokumen Transfer Stok"
                            >
                              <Truck className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Transfer</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Drawer / Expanded Section for detail item */}
          {expandedId && (
            (() => {
              const req = requests.find((r) => r.id === expandedId);
              if (!req) return null;

              return (
                <div className="p-20 bg-surface border-t border-border space-y-12">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-text flex items-center gap-8">
                      <Package className="cg-icon cg-icon--sm text-accent" aria-hidden />
                      Rincian Barang Permintaan {req.number}
                    </h4>
                    <button
                      type="button"
                      className="text-xs text-text-muted hover:underline"
                      onClick={() => setExpandedId(null)}
                    >
                      Tutup Rincian
                    </button>
                  </div>

                  <div className="cg-data-wrap min-w-0 border border-border rounded-lg overflow-hidden">
                    <table className="cg-data w-full text-left">
                      <thead>
                        <tr>
                          <th className="py-8 px-16 text-xs font-semibold text-text-muted">Nama Barang</th>
                          <th className="py-8 px-16 text-xs font-semibold text-text-muted text-right">Kuantitas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {req.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-surface-raised">
                            <td className="py-8 px-16 text-sm font-medium text-text">{line.name}</td>
                            <td className="py-8 px-16 text-sm text-right font-bold text-accent cg-num">
                              {line.qty}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {req.note && (
                    <div className="text-xs text-text-muted bg-surface-raised p-8 rounded-lg border border-border">
                      <strong>Catatan Permintaan:</strong> {req.note}
                    </div>
                  )}

                  {req.decisionNote && (
                    <div className="text-xs text-text-muted bg-surface-raised p-8 rounded-lg border border-border">
                      <strong>Catatan Keputusan:</strong> {req.decisionNote}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Modal Buat Permintaan */}
      {showNewModal && (
        <CreateRequestDialog
          locations={locations}
          stockItems={stockItems}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            reloadData();
            setToastMsg('Permintaan barang berhasil dibuat dan menunggu persetujuan.');
          }}
        />
      )}

      {/* Modal Keputusan */}
      {decidingRequest && (
        <DecideDialog
          request={decidingRequest.request}
          decision={decidingRequest.decision}
          onClose={() => setDecidingRequest(null)}
          onDecided={() => {
            reloadData();
            setToastMsg(
              decidingRequest.decision === 'approved'
                ? `Permintaan ${decidingRequest.request.number} disetujui.`
                : `Permintaan ${decidingRequest.request.number} ditolak.`,
            );
          }}
        />
      )}

      {/* Modal Penuhi Permintaan */}
      {fulfillingRequest && (
        <FulfillDialog
          request={fulfillingRequest}
          onClose={() => setFulfillingRequest(null)}
          onFulfilled={() => {
            reloadData();
            setToastMsg(
              `Permintaan ${fulfillingRequest.number} berhasil dipenuhi! Dokumen transfer stok telah dibuat.`,
            );
          }}
        />
      )}

      {/* Dialog Konfirmasi Pembatalan */}
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
              Batalkan Permintaan Barang
            </h3>
            <p className="text-sm text-text-muted">
              Apakah Anda yakin ingin membatalkan permintaan <strong>{cancellingRequest.number}</strong>?
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
                onClick={handleCancel}
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

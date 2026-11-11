'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PackageMinus, Plus, Search } from 'lucide-react';
import {
  RETURN_RESOLUTION_LABEL,
  formatRp,
  maxReturnableQty,
  purchaseReturnProblem,
  purchaseReturnTotal,
  returnedQtyByLine,
  type PurchaseInvoice,
  type PurchaseInvoiceSummary,
  type PurchaseReturn,
  type PurchaseReturnResolution,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${d}T00:00:00Z`));

const fmtQty = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

export default function ReturPembelianPage() {
  const data = useData();
  const invState = useAsync(() => data.listPurchaseInvoices(), [data]);

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [search, setSearch] = useState('');
  const [resFilter, setResFilter] = useState<'all' | PurchaseReturnResolution>('all');
  const [dlgOpen, setDlgOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibleInvoices = useMemo(
    () => (invState.status === 'ready' ? invState.data.filter((i) => i.status !== 'void') : []),
    [invState],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return returns.filter((r) => {
      if (resFilter !== 'all' && r.resolution !== resFilter) return false;
      if (!q) return true;
      return (
        r.number.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [returns, search, resFilter]);

  const totalReturnValue = useMemo(
    () => returns.reduce((sum, r) => sum + r.totalAmount, 0),
    [returns],
  );

  const handleCreated = (created: PurchaseReturn) => {
    setReturns((prev) => [created, ...prev]);
    setDlgOpen(false);
    setNotice(
      `Retur ${created.number} (${RETURN_RESOLUTION_LABEL[created.resolution]}) senilai ${formatRp(created.totalAmount)} dicatat pada pratinjau lokal.`,
    );
  };

  return (
    <>
      <PageHeader
        title="Retur pembelian"
        subtitle="Catat pengembalian barang ke pemasok dari faktur yang sudah diterima"
        helpText="Jumlah retur divalidasi agar tidak melebihi jumlah barang diterima dikurangi retur sebelumnya."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/inventori/bayar-faktur" className="cg-btn cg-btn--secondary cg-btn--sm">
              Pembayaran Faktur
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={invState.status !== 'ready' || eligibleInvoices.length === 0}
              onClick={() => setDlgOpen(true)}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden /> Buat retur pembelian
            </button>
          </div>
        }
      />

      <div
        className="cg-banner cg-banner--info mb-16 flex flex-wrap items-center justify-between gap-8"
        role="status"
      >
        <span>
          <strong>Pratinjau — menunggu dukungan server.</strong> Pemilihan faktur &amp; barang memakai data faktur pembelian nyata, sedangkan pemotongan stok &amp; utang di database menunggu endpoint server retur pembelian.
        </span>
        <span className="cg-badge text-[11px] font-semibold">Pratinjau</span>
      </div>

      {notice && (
        <p role="status" className="cg-banner cg-banner--success mb-16">
          {notice}
        </p>
      )}

      {invState.status === 'error' && (
        <ErrorBox message={invState.message} onRetry={invState.reload} />
      )}

      {invState.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat retur pembelian">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px]" />
        </div>
      )}

      {invState.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Dokumen retur tercatat</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">{returns.length} dokumen</dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Total nilai retur</dt>
              <dd className="text-xl font-bold cg-num text-accent-strong mt-4">
                {formatRp(totalReturnValue)}
              </dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Faktur asal tersedia</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">
                {eligibleInvoices.length} faktur
              </dd>
            </div>
          </dl>

          {returns.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
              <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                <input
                  type="search"
                  className="cg-input pl-32"
                  placeholder="Cari no. retur, faktur, atau pemasok..."
                  aria-label="Cari retur pembelian"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-8" role="group" aria-label="Filter penyelesaian retur">
                {(
                  [
                    { id: 'all', label: 'Semua' },
                    { id: 'reduce_payable', label: 'Potong utang' },
                    { id: 'cash_refund', label: 'Kembali tunai' },
                    { id: 'replace_item', label: 'Tukar barang' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cg-chip"
                    aria-pressed={resFilter === c.id}
                    onClick={() => setResFilter(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {returns.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada retur pembelian.</strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                {eligibleInvoices.length === 0
                  ? 'Belum ada faktur pembelian yang diterima. Buat faktur terlebih dahulu sebelum mencatat retur.'
                  : 'Pilih faktur pembelian yang barangnya sudah diterima untuk membuat pengajuan retur ke pemasok.'}
              </p>
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                {eligibleInvoices.length === 0 ? (
                  <Link href="/inventori/faktur" className="cg-btn cg-btn--primary cg-btn--sm">
                    Buat Faktur Pembelian
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="cg-btn cg-btn--primary cg-btn--sm"
                    onClick={() => setDlgOpen(true)}
                  >
                    <Plus className="cg-icon cg-icon--sm" aria-hidden /> Buat retur pertama
                  </button>
                )}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada dokumen retur yang cocok.</strong>
              </p>
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--sm mt-8"
                onClick={() => {
                  setSearch('');
                  setResFilter('all');
                }}
              >
                Tampilkan semua
              </button>
            </div>
          ) : (
            <>
              <ul className="grid gap-12 tablet:hidden min-w-0">
                {filtered.map((r) => (
                  <li
                    key={r.id}
                    className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-8 min-w-0">
                      <div className="min-w-0">
                        <strong className="text-sm font-bold text-text block break-words">
                          {r.number}
                        </strong>
                        <span className="text-xs text-text-muted block break-words">
                          {r.invoiceNumber} · {r.supplierName}
                        </span>
                      </div>
                      <span className="cg-badge text-xs shrink-0">
                        {RETURN_RESOLUTION_LABEL[r.resolution]}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted">{fmtDate(r.returnDate)}</div>
                    <p className="text-sm text-text break-words">{r.reason}</p>
                    <ul className="text-xs text-text-muted space-y-4 bg-surface p-8 rounded-lg">
                      {r.lines.map((l) => (
                        <li key={l.lineId} className="flex justify-between gap-8">
                          <span className="truncate">{l.name} ({fmtQty(l.qty)} {l.unit})</span>
                          <span className="cg-num shrink-0">{formatRp(l.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between pt-4 border-t border-border/60 text-sm">
                      <span className="text-text-muted">Total retur</span>
                      <strong className="cg-num text-accent-strong">{formatRp(r.totalAmount)}</strong>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr>
                      <th>No. Retur &amp; Tanggal</th>
                      <th>Faktur &amp; Pemasok</th>
                      <th>Penyelesaian</th>
                      <th>Alasan &amp; Barang</th>
                      <th className="cg-num">Nilai Retur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-8">
                            <PackageMinus className="w-16 h-16 text-accent shrink-0" aria-hidden />
                            <div>
                              <strong>{r.number}</strong>
                              <span className="block text-xs text-text-muted">{fmtDate(r.returnDate)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="min-w-[140px] max-w-[200px]">
                          <strong className="text-sm font-semibold block">{r.invoiceNumber}</strong>
                          <span className="text-xs text-text-muted break-words">{r.supplierName}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="cg-badge text-xs">
                            {RETURN_RESOLUTION_LABEL[r.resolution]}
                          </span>
                        </td>
                        <td className="break-words max-w-[280px]">
                          <div className="text-sm text-text">{r.reason}</div>
                          <div className="text-xs text-text-muted mt-4">
                            {r.lines.map((l) => `${l.name} (${fmtQty(l.qty)} ${l.unit})`).join(', ')}
                          </div>
                        </td>
                        <td className="cg-num font-bold text-accent-strong whitespace-nowrap">
                          {formatRp(r.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {dlgOpen && (
        <CreatePurchaseReturnDialog
          invoices={eligibleInvoices}
          existingReturns={returns}
          nextSeq={returns.length + 1}
          onClose={() => setDlgOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

function CreatePurchaseReturnDialog({
  invoices,
  existingReturns,
  nextSeq,
  onClose,
  onCreated,
}: {
  invoices: PurchaseInvoiceSummary[];
  existingReturns: PurchaseReturn[];
  nextSeq: number;
  onClose: () => void;
  onCreated: (created: PurchaseReturn) => void;
}) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id ?? '');
  const [returnDate, setReturnDate] = useState(todayKey());
  const [resolution, setResolution] = useState<PurchaseReturnResolution>('reduce_payable');
  const [reason, setReason] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const detailState = useAsync(async (): Promise<PurchaseInvoice | null> => {
    if (!selectedInvoiceId) return null;
    return data.getPurchaseInvoice(selectedInvoiceId);
  }, [data, selectedInvoiceId]);

  const invoice = detailState.status === 'ready' ? detailState.data : null;

  const priorByLine = useMemo(
    () => returnedQtyByLine(existingReturns, selectedInvoiceId),
    [existingReturns, selectedInvoiceId],
  );

  const parsedLines = useMemo(() => {
    if (!invoice) return [];
    return invoice.lines.map((l) => {
      const raw = (qtyMap[l.id] ?? '').replace(',', '.').trim();
      const val = raw === '' ? 0 : Number.parseFloat(raw);
      return {
        lineId: l.id,
        qty: Number.isFinite(val) ? val : -1,
      };
    });
  }, [invoice, qtyMap]);

  const estimatedTotal = useMemo(
    () => (invoice ? purchaseReturnTotal(parsedLines, invoice.lines) : 0),
    [invoice, parsedLines],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    const problem = purchaseReturnProblem(
      {
        invoiceId: invoice.id,
        returnDate,
        resolution,
        reason,
        lines: parsedLines,
      },
      invoice.lines,
      priorByLine,
    );
    if (problem) {
      setError(problem);
      return;
    }

    const returnedLines = parsedLines
      .filter((p) => p.qty > 0)
      .map((p) => {
        const invLine = invoice.lines.find((l) => l.id === p.lineId)!;
        return {
          lineId: p.lineId,
          productId: invLine.productId,
          name: invLine.name,
          unit: invLine.unit,
          unitPrice: invLine.unitPrice,
          qty: p.qty,
          lineTotal: Math.round(p.qty * invLine.unitPrice),
        };
      });

    onCreated({
      id: `pr-${Date.now()}`,
      number: `RT/${returnDate.slice(2, 7).replace('-', '')}/${String(nextSeq).padStart(3, '0')}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      supplierName: invoice.supplierName,
      returnDate,
      resolution,
      reason: reason.trim(),
      totalAmount: estimatedTotal,
      lines: returnedLines,
    });
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-buat-retur"
      onClose={onClose}
      style={{ margin: 'auto', width: 'min(640px, calc(100vw - 16px))' }}
    >
      <form onSubmit={handleSubmit} className="grid gap-16" noValidate>
        <h2 id="judul-buat-retur" className="cg-modal__title">
          Buat retur pembelian
        </h2>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="ret-faktur">
              Faktur pembelian asal
            </label>
            <select
              id="ret-faktur"
              className="cg-input"
              value={selectedInvoiceId}
              onChange={(e) => {
                setSelectedInvoiceId(e.target.value);
                setQtyMap({});
                setError(null);
              }}
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} — {inv.supplierName}
                </option>
              ))}
            </select>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="ret-tgl">
              Tanggal retur
            </label>
            <input
              id="ret-tgl"
              type="date"
              className="cg-input"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>
        </div>

        <div className="cg-field">
          <span className="cg-label">Penyelesaian retur</span>
          <div className="flex flex-wrap gap-8 mt-4" role="group" aria-label="Penyelesaian retur">
            {(
              [
                { id: 'reduce_payable', label: 'Potong utang pemasok' },
                { id: 'cash_refund', label: 'Kembali tunai' },
                { id: 'replace_item', label: 'Tukar barang' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="cg-chip"
                aria-pressed={resolution === opt.id}
                onClick={() => setResolution(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <span className="cg-label block">Pilih barang &amp; jumlah yang diretur</span>
          {detailState.status === 'loading' && (
            <div className="cg-skeleton h-[100px]" aria-busy="true" />
          )}
          {detailState.status === 'error' && (
            <ErrorBox message={detailState.message} onRetry={detailState.reload} />
          )}
          {invoice && (
            <div className="rounded-xl border border-border bg-surface divide-y divide-border max-h-[220px] overflow-y-auto">
              {invoice.lines.map((line) => {
                const alreadyReturned = priorByLine.get(line.id) ?? 0;
                const maxQty = maxReturnableQty(line.receivedQty, alreadyReturned);
                return (
                  <div
                    key={line.id}
                    className="p-12 flex flex-wrap items-center justify-between gap-8"
                  >
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm text-text block break-words">
                        {line.name}
                      </strong>
                      <span className="text-xs text-text-muted cg-num">
                        Diterima {fmtQty(line.receivedQty)} {line.unit} · Maks retur {fmtQty(maxQty)}{' '}
                        · {formatRp(line.unitPrice)}/{line.unit}
                      </span>
                    </div>
                    <div className="w-[110px] shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Jumlah retur ${line.name}`}
                        disabled={maxQty <= 0}
                        placeholder="0"
                        className="cg-input cg-num text-right"
                        value={qtyMap[line.id] ?? ''}
                        onChange={(e) => {
                          setError(null);
                          setQtyMap((prev) => ({ ...prev, [line.id]: e.target.value }));
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="ret-alasan">
            Alasan retur
          </label>
          <input
            id="ret-alasan"
            className="cg-input"
            maxLength={200}
            placeholder="Mis. Kemasan rusak saat pengiriman / mendekati kadaluwarsa"
            value={reason}
            onChange={(e) => {
              setError(null);
              setReason(e.target.value);
            }}
          />
        </div>

        <div className="p-12 rounded-lg border border-border bg-surface flex items-center justify-between gap-8 text-sm">
          <span className="text-text-muted">Estimasi nilai retur ({RETURN_RESOLUTION_LABEL[resolution]})</span>
          <strong className="cg-num text-accent-strong">{formatRp(estimatedTotal)}</strong>
        </div>

        {error && (
          <p role="alert" className="text-danger-strong text-sm">
            {error}
          </p>
        )}

        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={!invoice}
          >
            Simpan retur
          </button>
        </div>
      </form>
    </dialog>
  );
}


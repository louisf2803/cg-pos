'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Banknote, ChevronDown, ChevronUp, History, Search } from 'lucide-react';
import {
  INVOICE_STATUS_LABEL,
  formatRp,
  invoiceOverdue,
  newId,
  purchasePayProblem,
  type PurchaseInvoice,
  type PurchaseInvoiceSummary,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { rpDigits, numOf } from '@/components/purchase-lines';

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${d}T00:00:00Z`));

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

type PayFilter = 'unpaid' | 'all';

export default function BayarFakturPage() {
  const data = useData();
  const list = useAsync(() => data.listPurchaseInvoices(), [data]);

  const [filterMode, setFilterMode] = useState<PayFilter>('unpaid');
  const [search, setSearch] = useState('');
  const [payTarget, setPayTarget] = useState<PurchaseInvoiceSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, PurchaseInvoice>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const today = todayKey();
  const allInvoices = list.status === 'ready' ? list.data : [];

  const unpaidInvoices = useMemo(
    () => allInvoices.filter((i) => i.status === 'open' || i.status === 'partially_paid'),
    [allInvoices],
  );

  const filtered = useMemo(() => {
    const base = filterMode === 'unpaid' ? unpaidInvoices : allInvoices;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (i) =>
        i.number.toLowerCase().includes(q) ||
        i.supplierName.toLowerCase().includes(q) ||
        (i.supplierInvoiceNo ?? '').toLowerCase().includes(q),
    );
  }, [filterMode, unpaidInvoices, allInvoices, search]);

  const totalOwed = useMemo(
    () => unpaidInvoices.reduce((sum, i) => sum + i.outstanding, 0),
    [unpaidInvoices],
  );
  const overdueCount = useMemo(
    () => unpaidInvoices.filter((i) => invoiceOverdue(i, today)).length,
    [unpaidInvoices, today],
  );

  const loadDetail = async (id: string, force = false) => {
    if (!force && detailCache[id]) return;
    setDetailLoadingId(id);
    setDetailError(null);
    try {
      const inv = await data.getPurchaseInvoice(id);
      if (inv) {
        setDetailCache((prev) => ({ ...prev, [id]: inv }));
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Gagal memuat riwayat pembayaran.');
    } finally {
      setDetailLoadingId(null);
    }
  };

  const toggleHistory = async (row: PurchaseInvoiceSummary) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    await loadDetail(row.id);
  };

  const handlePaymentSuccess = async (updated: PurchaseInvoice) => {
    setPayTarget(null);
    setDetailCache((prev) => ({ ...prev, [updated.id]: updated }));
    setExpandedId(updated.id);
    setNotice(
      updated.status === 'paid'
        ? `Faktur ${updated.number} berhasil dilunasi.`
        : `Pembayaran faktur ${updated.number} dicatat. Sisa tagihan ${formatRp(updated.outstanding)}.`,
    );
    await list.reload();
  };

  return (
    <>
      <PageHeader
        title="Pembayaran faktur"
        subtitle="Pantau hutang faktur pembelian, catat cicilan atau pelunasan, dan tinjau riwayat pembayaran"
        helpText="Menampilkan faktur pembelian yang belum lunas atau dibayar sebagian langsung dari data faktur Anda."
        actions={
          <Link href="/inventori/faktur" className="cg-btn cg-btn--secondary cg-btn--sm">
            Lihat Semua Faktur
          </Link>
        }
      />

      {notice && (
        <p role="status" className="cg-banner cg-banner--success mb-16">
          {notice}
        </p>
      )}

      {list.status === 'error' && (
        <ErrorBox message={list.message} onRetry={list.reload} />
      )}

      {list.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat pembayaran faktur">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[260px]" />
        </div>
      )}

      {list.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Faktur perlu dibayar</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">
                {unpaidInvoices.length} faktur
              </dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Total sisa tagihan</dt>
              <dd className="text-xl font-bold cg-num text-accent-strong mt-4">
                {formatRp(totalOwed)}
              </dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Lewat jatuh tempo</dt>
              <dd
                className={`text-xl font-bold cg-num mt-4 ${
                  overdueCount > 0 ? 'text-danger-strong' : 'text-text'
                }`}
              >
                {overdueCount} faktur
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                type="search"
                className="cg-input pl-32"
                placeholder="Cari nomor faktur atau pemasok..."
                aria-label="Cari faktur pembayaran"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-8" role="group" aria-label="Filter status faktur">
              <button
                type="button"
                className="cg-chip"
                aria-pressed={filterMode === 'unpaid'}
                onClick={() => setFilterMode('unpaid')}
              >
                Belum Lunas &amp; Sebagian ({unpaidInvoices.length})
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={filterMode === 'all'}
                onClick={() => setFilterMode('all')}
              >
                Semua Faktur ({allInvoices.length})
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>
                  {allInvoices.length === 0
                    ? 'Belum ada faktur pembelian.'
                    : unpaidInvoices.length === 0 && filterMode === 'unpaid'
                    ? 'Semua faktur pembelian sudah lunas.'
                    : 'Tidak ada faktur yang cocok.'}
                </strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                {allInvoices.length === 0
                  ? 'Buat faktur pembelian terlebih dahulu agar tagihan pemasok dapat dibayar.'
                  : unpaidInvoices.length === 0 && filterMode === 'unpaid'
                  ? 'Semua faktur tercatat sudah lunas, atau buka Semua Faktur untuk melihat riwayat.'
                  : 'Ubah kata kunci pencarian atau filter status.'}
              </p>
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                {allInvoices.length === 0 && (
                  <Link href="/inventori/faktur" className="cg-btn cg-btn--primary cg-btn--sm">
                    Buat Faktur Pembelian
                  </Link>
                )}
                {filterMode === 'unpaid' && allInvoices.length > 0 && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => setFilterMode('all')}
                  >
                    Tampilkan semua faktur
                  </button>
                )}
                {search && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={() => setSearch('')}
                  >
                    Bersihkan pencarian
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="grid gap-12 tablet:hidden min-w-0">
                {filtered.map((inv) => {
                  const overdue = invoiceOverdue(inv, today);
                  const isOpen = expandedId === inv.id;
                  const detail = detailCache[inv.id];
                  const canPay = inv.status === 'open' || inv.status === 'partially_paid';

                  return (
                    <li
                      key={inv.id}
                      className="p-16 rounded-xl border border-border bg-surface-raised grid gap-12 min-w-0"
                    >
                      <div className="flex items-start justify-between gap-8 min-w-0">
                        <div className="min-w-0">
                          <strong className="text-sm font-bold text-text block break-words">
                            {inv.number}
                          </strong>
                          <span className="text-xs text-text-muted block break-words">
                            {inv.supplierName}
                          </span>
                        </div>
                        <span
                          className={`cg-badge text-xs shrink-0 ${
                            inv.status === 'paid'
                              ? 'cg-badge--success'
                              : overdue
                              ? 'cg-badge--danger'
                              : ''
                          }`}
                        >
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-8 text-sm">
                        <div>
                          <dt className="text-xs text-text-muted">Jatuh tempo</dt>
                          <dd className={overdue ? 'text-danger-strong font-semibold' : ''}>
                            {inv.dueDate ? fmtDate(inv.dueDate) : 'Tunai'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Total faktur</dt>
                          <dd className="cg-num font-medium">{formatRp(inv.total)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Sudah dibayar</dt>
                          <dd className="cg-num">{formatRp(inv.paidTotal)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Sisa tagihan</dt>
                          <dd className="cg-num font-bold text-accent-strong">
                            {formatRp(inv.outstanding)}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-8 pt-8 border-t border-border/60">
                        {canPay && (
                          <button
                            type="button"
                            className="cg-btn cg-btn--primary cg-btn--sm"
                            onClick={() => setPayTarget(inv)}
                          >
                            <Banknote className="cg-icon cg-icon--sm" aria-hidden /> Catat Pembayaran
                          </button>
                        )}
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          aria-expanded={isOpen}
                          onClick={() => void toggleHistory(inv)}
                        >
                          <History className="cg-icon cg-icon--sm" aria-hidden />
                          Riwayat bayar
                          {isOpen ? (
                            <ChevronUp className="cg-icon cg-icon--sm" aria-hidden />
                          ) : (
                            <ChevronDown className="cg-icon cg-icon--sm" aria-hidden />
                          )}
                        </button>
                      </div>

                      {isOpen && (
                        <PaymentHistoryPanel
                          loading={detailLoadingId === inv.id}
                          error={detailError}
                          invoice={detail}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table */}
              <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr>
                      <th>Nomor Faktur</th>
                      <th>Pemasok</th>
                      <th>Jatuh Tempo</th>
                      <th>Status</th>
                      <th className="cg-num">Total / Terbayar</th>
                      <th className="cg-num">Sisa</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((inv) => {
                      const overdue = invoiceOverdue(inv, today);
                      const isOpen = expandedId === inv.id;
                      const detail = detailCache[inv.id];
                      const canPay = inv.status === 'open' || inv.status === 'partially_paid';

                      return (
                        <FragmentRow
                          key={inv.id}
                          inv={inv}
                          overdue={overdue}
                          isOpen={isOpen}
                          canPay={canPay}
                          detail={detail}
                          loading={detailLoadingId === inv.id}
                          error={detailError}
                          onToggleHistory={() => void toggleHistory(inv)}
                          onPay={() => setPayTarget(inv)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {payTarget && (
        <PayInvoiceModal
          invoice={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={(updated) => void handlePaymentSuccess(updated)}
        />
      )}
    </>
  );
}

function FragmentRow({
  inv,
  overdue,
  isOpen,
  canPay,
  detail,
  loading,
  error,
  onToggleHistory,
  onPay,
}: {
  inv: PurchaseInvoiceSummary;
  overdue: boolean;
  isOpen: boolean;
  canPay: boolean;
  detail?: PurchaseInvoice;
  loading: boolean;
  error: string | null;
  onToggleHistory: () => void;
  onPay: () => void;
}) {
  return (
    <>
      <tr>
        <td className="whitespace-nowrap">
          <strong>{inv.number}</strong>
          {inv.supplierInvoiceNo && (
            <span className="block text-xs text-text-muted">{inv.supplierInvoiceNo}</span>
          )}
        </td>
        <td className="break-words min-w-[140px] max-w-[210px]">{inv.supplierName}</td>
        <td className={`whitespace-nowrap text-sm ${overdue ? 'text-danger-strong font-medium' : ''}`}>
          {inv.dueDate ? fmtDate(inv.dueDate) : 'Tunai'}
          {overdue && <span className="block text-xs">Lewat jatuh tempo</span>}
        </td>
        <td className="whitespace-nowrap">
          <span
            className={`cg-badge text-xs ${
              inv.status === 'paid' ? 'cg-badge--success' : ''
            }`}
          >
            {INVOICE_STATUS_LABEL[inv.status]}
          </span>
        </td>
        <td className="cg-num whitespace-nowrap">
          <span>{formatRp(inv.total)}</span>
          <span className="block text-xs text-text-muted">Bayar {formatRp(inv.paidTotal)}</span>
        </td>
        <td className="cg-num font-bold text-accent-strong whitespace-nowrap">
          {inv.outstanding > 0 ? formatRp(inv.outstanding) : '—'}
        </td>
        <td className="text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-4">
            <button
              type="button"
              className="cg-btn cg-btn--ghost cg-btn--sm"
              aria-expanded={isOpen}
              onClick={onToggleHistory}
            >
              <History className="cg-icon cg-icon--sm" aria-hidden /> Riwayat
              {isOpen ? (
                <ChevronUp className="cg-icon cg-icon--sm" aria-hidden />
              ) : (
                <ChevronDown className="cg-icon cg-icon--sm" aria-hidden />
              )}
            </button>
            {canPay && (
              <button
                type="button"
                className="cg-btn cg-btn--primary cg-btn--sm"
                aria-label={`Catat pembayaran ${inv.number}`}
                onClick={onPay}
              >
                Bayar
              </button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={7} className="bg-surface p-16">
            <PaymentHistoryPanel loading={loading} error={error} invoice={detail} />
          </td>
        </tr>
      )}
    </>
  );
}

function PaymentHistoryPanel({
  loading,
  error,
  invoice,
}: {
  loading: boolean;
  error: string | null;
  invoice?: PurchaseInvoice;
}) {
  if (loading) {
    return (
      <div className="cg-skeleton h-[48px]" aria-busy="true" aria-label="Memuat riwayat pembayaran" />
    );
  }
  if (error) {
    return <p className="text-xs text-danger-strong">{error}</p>;
  }
  if (!invoice || invoice.payments.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Belum ada pembayaran tercatat untuk faktur ini.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      <strong className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
        Riwayat Pembayaran ({invoice.payments.length}x)
      </strong>
      <ul className="grid gap-8">
        {invoice.payments.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-8 text-xs p-8 rounded-lg border border-border bg-surface-raised"
          >
            <div className="min-w-0">
              <strong className="text-text">{p.number}</strong>
              <span className="text-text-muted ml-8">
                {fmtDate(p.paidAt)} · {p.accountName}
              </span>
              {p.note && <span className="block text-text-muted">{p.note}</span>}
            </div>
            <strong className="cg-num text-text">{formatRp(p.amount)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PayInvoiceModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: PurchaseInvoiceSummary;
  onClose: () => void;
  onDone: (updated: PurchaseInvoice) => void;
}) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const accounts = useAsync(() => data.listPayAccounts(), [data]);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(String(invoice.outstanding));
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newId());

  const accountList = accounts.status === 'ready' ? accounts.data : [];
  const chosenAccount = accountId || accountList[0]?.id || '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id: key.current,
      invoiceId: invoice.id,
      accountId: chosenAccount,
      amount: numOf(amount),
      paidAt: date || undefined,
      note: note.trim() || undefined,
    };
    const problem = purchasePayProblem(input, invoice.outstanding);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const updated = await data.payPurchase(input);
      onDone(updated);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal mencatat pembayaran.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-bayar-faktur"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-bayar-faktur" className="cg-modal__title">
          Catat Pembayaran · {invoice.number}
        </h2>
        <p className="text-sm text-text-muted">
          Pemasok: <strong>{invoice.supplierName}</strong> · Sisa tagihan:{' '}
          <strong className="cg-num text-text">{formatRp(invoice.outstanding)}</strong>
        </p>

        {accounts.status === 'error' && (
          <ErrorBox message={accounts.message} onRetry={accounts.reload} />
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="pay-akun">
            Metode / Akun kas-bank
          </label>
          <select
            id="pay-akun"
            className="cg-input"
            value={chosenAccount}
            onChange={(e) => {
              setErr('');
              setAccountId(e.target.value);
            }}
          >
            {accountList.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="pay-nominal">
              Nominal bayar (Rp)
            </label>
            <input
              id="pay-nominal"
              className="cg-input cg-num"
              inputMode="numeric"
              maxLength={13}
              value={amount}
              onChange={(e) => {
                setErr('');
                setAmount(rpDigits(e.target.value));
              }}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="pay-tgl">
              Tanggal bayar
            </label>
            <input
              id="pay-tgl"
              type="date"
              className="cg-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="pay-catatan">
            Catatan
          </label>
          <input
            id="pay-catatan"
            className="cg-input"
            maxLength={200}
            placeholder="Mis. Transfer termin ke-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {err && (
          <p role="alert" className="text-danger-strong text-sm">
            {err}
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
            disabled={busy || accountList.length === 0}
            aria-busy={busy}
          >
            {busy ? 'Menyimpan…' : 'Simpan pembayaran'}
          </button>
        </div>
      </form>
    </dialog>
  );
}


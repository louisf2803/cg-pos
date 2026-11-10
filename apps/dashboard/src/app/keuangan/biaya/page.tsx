'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Plus,
  Receipt,
  Search,
} from 'lucide-react';
import {
  buildCashEntryJournal,
  categorizeCashEntries,
  formatRp,
  localDateKey,
  newId,
  toCsv,
  validateCashEntry,
  type Account,
  type CashEntryKind,
  type CashEntryView,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { fmtDate, todayKey, useDialog } from '@/components/fin-common';

function formatLocalPeriod(fromKey: string, toKey: string): string {
  const f = (d: string) =>
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${d}T00:00:00Z`));

  if (fromKey === toKey) return f(fromKey);
  return `${f(fromKey)} – ${f(toKey)}`;
}

interface CashModalProps {
  kind: CashEntryKind;
  accounts: Account[];
  onClose: () => void;
  onDone: (msg: string) => void;
}

function CashEntryModal({ kind, accounts, onClose, onDone }: CashModalProps) {
  const data = useData();
  const d = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const detailAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'detail' && a.isActive),
    [accounts]
  );

  const cashAccounts = useMemo(
    () => detailAccounts.filter((a) => a.category === 'cash_bank'),
    [detailAccounts]
  );

  const counterpartAccounts = useMemo(() => {
    if (kind === 'in') {
      const preferred = detailAccounts.filter(
        (a) => a.category === 'revenue' || a.category === 'other_income'
      );
      return preferred.length > 0
        ? preferred
        : detailAccounts.filter((a) => a.category !== 'cash_bank');
    } else {
      const preferred = detailAccounts.filter(
        (a) =>
          a.category === 'expense' ||
          a.category === 'other_expense' ||
          a.category === 'cogs'
      );
      return preferred.length > 0
        ? preferred
        : detailAccounts.filter((a) => a.category !== 'cash_bank');
    }
  }, [detailAccounts, kind]);

  const [form, setForm] = useState({
    date: todayKey(),
    amount: '',
    cashAccountId: cashAccounts[0]?.id || '',
    counterpartAccountId: counterpartAccounts[0]?.id || '',
    note: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const numAmount = Number(form.amount.replace(/[^\d.,]/g, '').replace(',', '.'));
    const validationError = validateCashEntry({
      kind,
      date: form.date,
      amount: numAmount,
      cashAccountId: form.cashAccountId,
      counterpartAccountId: form.counterpartAccountId,
      note: form.note,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const journalInput = buildCashEntryJournal({
        id: newId(),
        kind,
        date: form.date,
        amount: numAmount,
        cashAccountId: form.cashAccountId,
        counterpartAccountId: form.counterpartAccountId,
        note: form.note,
      });

      const res = await data.postJournal(journalInput);
      onDone(
        `${kind === 'in' ? 'Penerimaan' : 'Pengeluaran'} sebesar ${formatRp(
          numAmount
        )} berhasil dicatat (${res.number}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat transaksi.');
      setBusy(false);
    }
  };

  const title = kind === 'in' ? 'Catat penerimaan kas' : 'Catat pengeluaran kas';

  return (
    <dialog {...d.props} aria-labelledby="dialog-title">
      <form onSubmit={handleSubmit} className="grid gap-16" noValidate>
        <div className="flex justify-between items-center pb-8 border-b border-[var(--color-border)]">
          <h2 id="dialog-title" className="cg-modal__title text-lg font-bold">
            {title}
          </h2>
        </div>

        {error && (
          <p role="alert" className="cg-banner cg-banner--danger text-sm">
            {error}
          </p>
        )}

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="entry-date">
              Tanggal transaksi
            </label>
            <input
              id="entry-date"
              type="date"
              className="cg-input"
              value={form.date}
              max={todayKey()}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="entry-amount">
              Jumlah nominal (Rp)
            </label>
            <input
              id="entry-amount"
              type="text"
              inputMode="numeric"
              placeholder="0"
              className="cg-input cg-num"
              value={form.amount}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  amount: e.target.value.replace(/[^\d.,]/g, ''),
                }))
              }
              autoFocus
            />
          </div>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="entry-cash-acc">
              {kind === 'in' ? 'Masuk ke kas / bank' : 'Diambil dari kas / bank'}
            </label>
            <select
              id="entry-cash-acc"
              className="cg-input"
              value={form.cashAccountId}
              onChange={(e) =>
                setForm((s) => ({ ...s, cashAccountId: e.target.value }))
              }
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="entry-other-acc">
              {kind === 'in' ? 'Akun sumber penerimaan' : 'Akun kategori beban / biaya'}
            </label>
            <select
              id="entry-other-acc"
              className="cg-input"
              value={form.counterpartAccountId}
              onChange={(e) =>
                setForm((s) => ({ ...s, counterpartAccountId: e.target.value }))
              }
            >
              {counterpartAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="entry-note">
            Keterangan / Catatan
          </label>
          <input
            id="entry-note"
            type="text"
            className="cg-input"
            maxLength={200}
            placeholder={
              kind === 'in'
                ? 'Contoh: Penerimaan komisi mitra, Pendapatan bunga bank'
                : 'Contoh: Beli pulsa listrik outlet, Operasional kebersihan'
            }
            value={form.note}
            onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
          />
        </div>

        <div className="cg-modal__actions flex justify-end gap-8 pt-8 border-t border-[var(--color-border)]">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => d.ref.current?.close()}
            disabled={busy}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Menyimpan…' : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function ExpensesAndReceiptsPage() {
  const data = useData();
  const { ctx, value, setValue, range, today } = useReport();
  const [activeTab, setActiveTab] = useState<CashEntryKind>('out');
  const [search, setSearch] = useState('');
  const [dialogKind, setDialogKind] = useState<CashEntryKind | null>(null);
  const [notice, setNotice] = useState('');

  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const localFrom = localDateKey(new Date(range.from), tz);
  const localTo = localDateKey(new Date(new Date(range.to).getTime() - 1), tz);

  const accountsAsync = useAsync(async () => {
    return data.listAccounts();
  }, [data]);

  const journalsAsync = useAsync(async () => {
    const summaries = await data.listJournal({
      from: localFrom,
      to: localTo,
      sourceType: 'manual',
    });
    const details = await Promise.all(summaries.map((s) => data.getJournal(s.id)));
    return details.filter((j): j is NonNullable<typeof j> => j !== null);
  }, [data, localFrom, localTo]);

  const categorized = useMemo(() => {
    if (
      accountsAsync.status !== 'ready' ||
      !accountsAsync.data ||
      journalsAsync.status !== 'ready' ||
      !journalsAsync.data
    ) {
      return { inEntries: [], outEntries: [], totalIn: 0, totalOut: 0 };
    }
    return categorizeCashEntries(journalsAsync.data, accountsAsync.data);
  }, [accountsAsync, journalsAsync]);

  const currentEntries = activeTab === 'in' ? categorized.inEntries : categorized.outEntries;
  const currentTotal = activeTab === 'in' ? categorized.totalIn : categorized.totalOut;

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return currentEntries;
    const q = search.toLowerCase().trim();
    return currentEntries.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.number.toLowerCase().includes(q) ||
        e.cashAccountName.toLowerCase().includes(q) ||
        e.counterpartAccountName.toLowerCase().includes(q)
    );
  }, [currentEntries, search]);

  const handleDownloadCsv = () => {
    const head = [
      'Tanggal',
      'Nomor Jurnal',
      'Keterangan',
      'Kas/Bank',
      'Akun Lawan',
      'Jumlah',
      'Status',
    ];
    const lines = filteredEntries.map((e) => [
      e.date,
      e.number,
      e.description,
      e.cashAccountName,
      e.counterpartAccountName,
      e.amount,
      e.status,
    ]);
    const csvContent = toCsv([head, ...lines]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arus-kas-${activeTab === 'in' ? 'penerimaan' : 'pengeluaran'}-${localFrom}-${localTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    journalsAsync.reload();
  };

  const isInitialLoading =
    accountsAsync.status === 'loading' || journalsAsync.status === 'loading';
  const hasError =
    accountsAsync.status === 'error' || journalsAsync.status === 'error';
  const errorMessage =
    accountsAsync.status === 'error'
      ? accountsAsync.message
      : journalsAsync.status === 'error'
      ? journalsAsync.message
      : '';

  return (
    <>
      <PageHeader
        title="Penerimaan dan Pengeluaran"
        subtitle="Kelola pencatatan uang masuk dan uang keluar operasional kas/bank. Setiap transaksi otomatis tercatat rapi ke buku besar."
        actions={
          <div className="flex flex-wrap gap-8 items-center">
            <button
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadCsv}
              disabled={filteredEntries.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
            <button
              className="cg-btn cg-btn--primary"
              onClick={() => {
                setNotice('');
                setDialogKind(activeTab);
              }}
            >
              <Plus className="cg-icon" aria-hidden />
              {activeTab === 'in' ? 'Catat penerimaan' : 'Catat pengeluaran'}
            </button>
          </div>
        }
      />

      {notice && (
        <div
          role="status"
          className="cg-banner cg-banner--success mb-16 flex justify-between items-center"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="text-xs underline hover:opacity-75"
            onClick={() => setNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border mb-16 gap-8">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'out'}
          onClick={() => setActiveTab('out')}
          className={`px-16 py-8 text-sm font-semibold border-b-2 transition-colors flex items-center gap-8 ${
            activeTab === 'out'
              ? 'border-accent text-accent-strong font-bold'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <ArrowUpFromLine className="w-16 h-16 text-danger shrink-0" aria-hidden />
          Pengeluaran (Kas Keluar)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'in'}
          onClick={() => setActiveTab('in')}
          className={`px-16 py-8 text-sm font-semibold border-b-2 transition-colors flex items-center gap-8 ${
            activeTab === 'in'
              ? 'border-accent text-accent-strong font-bold'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <ArrowDownToLine className="w-16 h-16 text-accent shrink-0" aria-hidden />
          Penerimaan (Kas Masuk)
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 mb-16 min-w-0">
        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Total {activeTab === 'in' ? 'Penerimaan' : 'Pengeluaran'}
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-accent-strong cg-num">
              {formatRp(currentTotal)}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            Periode: {formatLocalPeriod(localFrom, localTo)}
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Banyak Transaksi
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-text cg-num">
              {currentEntries.length}{' '}
              <span className="text-sm font-normal text-text-muted">transaksi</span>
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            Tercatat di pembukuan
          </span>
        </div>

        <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
          <div>
            <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left uppercase tracking-wider">
              Rata-rata per Transaksi
            </span>
            <strong className="text-xl tablet:text-2xl font-bold block truncate text-left text-text cg-num">
              {formatRp(
                currentEntries.length > 0
                  ? Math.round(currentTotal / currentEntries.length)
                  : 0
              )}
            </strong>
          </div>
          <span className="text-xs text-text-muted block mt-[6px] truncate text-left">
            Estimasi per transaksi kas
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col tablet:flex-row gap-12 mb-16 justify-between items-stretch tablet:items-center">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search
              className="w-16 h-16 text-text-muted absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              className="cg-input pl-[34px] w-full text-sm"
              placeholder="Cari transaksi, nomor jurnal, keterangan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-8 items-center">
          <RangePicker value={value} onChange={setValue} today={today} />
        </div>
      </div>

      {/* Main Content Area */}
      {hasError ? (
        <ErrorBox
          message={errorMessage || 'Terjadi kesalahan memuat data.'}
          onRetry={handleRefresh}
        />
      ) : isInitialLoading ? (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat data">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 48 }} />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="cg-empty">
          <Receipt className="w-12 h-12 text-text-muted mb-8" aria-hidden />
          <p>
            <strong>
              Belum ada transaksi {activeTab === 'in' ? 'penerimaan' : 'pengeluaran'} pada rentang tanggal ini.
            </strong>
          </p>
          <p className="text-text-muted text-sm mt-4">
            Klik tombol &quot;Catat {activeTab === 'in' ? 'penerimaan' : 'pengeluaran'}&quot; di atas untuk menambahkan transaksi baru.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden tablet:block cg-data-wrap min-w-0">
            <table
              className="cg-data min-w-0"
              aria-label={`Daftar ${activeTab === 'in' ? 'Penerimaan' : 'Pengeluaran'}`}
            >
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nomor Jurnal</th>
                  <th>Keterangan</th>
                  <th>Akun Kas / Bank</th>
                  <th>
                    {activeTab === 'in' ? 'Sumber Penerimaan' : 'Kategori Beban / Biaya'}
                  </th>
                  <th className="text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-sm">
                      {fmtDate(row.date)}
                    </td>
                    <td className="whitespace-nowrap font-medium text-sm">
                      {row.number}
                    </td>
                    <td className="break-words max-w-[280px]">
                      <span>{row.description || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      <span className="cg-badge cg-badge--info">
                        {row.cashAccountName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      <span className="text-text-muted">
                        {row.counterpartAccountName}
                      </span>
                    </td>
                    <td className="text-right font-bold cg-num whitespace-nowrap">
                      {formatRp(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="grid gap-12 tablet:hidden min-w-0" aria-label="Daftar transaksi mobile">
            {filteredEntries.map((row) => (
              <div key={row.id} className="cg-card p-12 min-w-0">
                <div className="flex justify-between items-start gap-8 mb-[6px]">
                  <div>
                    <span className="text-xs text-text-muted block">
                      {fmtDate(row.date)} · {row.number}
                    </span>
                    <strong className="text-sm font-semibold block mt-[2px]">
                      {row.description || '—'}
                    </strong>
                  </div>
                  <strong className="cg-num text-sm font-bold text-[var(--color-accent)] whitespace-nowrap">
                    {formatRp(row.amount)}
                  </strong>
                </div>

                <div className="flex flex-wrap items-center gap-[6px] pt-[6px] border-t border-[var(--color-border)] text-xs text-text-muted">
                  <span className="cg-badge">{row.cashAccountName}</span>
                  <span>➜</span>
                  <span>{row.counterpartAccountName}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Entry Modal */}
      {dialogKind && accountsAsync.status === 'ready' && accountsAsync.data && (
        <CashEntryModal
          kind={dialogKind}
          accounts={accountsAsync.data}
          onClose={() => setDialogKind(null)}
          onDone={(msg) => {
            setDialogKind(null);
            setNotice(msg);
            handleRefresh();
          }}
        />
      )}
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Download, Search, X } from 'lucide-react';
import {
  ACCOUNT_CATEGORIES,
  buildMultiLedgerCsvRows,
  computeMultiLedgerSummary,
  filterAccountsForLedger,
  formatRp,
  isDebitNormal,
  sortLedgersByAccount,
  sourceLabel,
  toCsvWithBom,
  type Account,
  type Ledger,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';

export default function LedgerPage() {
  const data = useData();
  const accounts = useAsync(() => data.listAccounts(), [data]);

  // Daftar akun detail yang dapat diposting
  const postableAccounts = useMemo(() => {
    if (accounts.status !== 'ready') return [];
    return accounts.data.filter((a) => a.kind === 'detail');
  }, [accounts]);

  // Akun terpilih (multi-select)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [searchAccount, setSearchAccount] = useState('');
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });

  // Inisialisasi dari parameter URL (?akun=<id>)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const a = new URLSearchParams(window.location.search).get('akun');
    if (a) {
      setSelectedIds([a]);
    } else if (postableAccounts.length > 0 && selectedIds.length === 0) {
      // Bawaan pilih akun kas pertama bila belum ada pilihan
      const firstCash = postableAccounts.find((acc) => acc.category === 'cash_bank') ?? postableAccounts[0];
      if (firstCash) {
        setSelectedIds([firstCash.id]);
      }
    }
  }, [postableAccounts]);

  // Ambil buku besar untuk semua akun terpilih secara paralel
  const ledgersAsync = useAsync(async () => {
    if (selectedIds.length === 0) return [];
    const results = await Promise.all(
      selectedIds.map((id) => data.ledger(id, span))
    );
    return results;
  }, [data, selectedIds, span.from, span.to]);

  const ledgers = useMemo(() => {
    if (ledgersAsync.status !== 'ready' || !ledgersAsync.data) return [];
    return sortLedgersByAccount(ledgersAsync.data);
  }, [ledgersAsync]);

  const summary = useMemo(() => {
    return computeMultiLedgerSummary(ledgers);
  }, [ledgers]);

  // Filter akun pada pemilih berdasarkan pencarian
  const filteredAccounts = useMemo(() => {
    return filterAccountsForLedger(postableAccounts, searchAccount);
  }, [postableAccounts, searchAccount]);

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllAccounts = () => {
    setSelectedIds(postableAccounts.map((a) => a.id));
  };

  const clearSelectedAccounts = () => {
    setSelectedIds([]);
  };

  const downloadCsv = () => {
    if (ledgers.length === 0) return;
    const rangeLabel = `${fmtDate(span.from)} – ${fmtDate(span.to)}`;
    const rows = buildMultiLedgerCsvRows(ledgers, rangeLabel);
    const csvContent = toCsvWithBom(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buku-besar-${span.from}_${span.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-20 min-w-0">
      <PageHeader
        title="Buku besar"
        subtitle="Rincian gerakan dan saldo berjalan per akun"
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={selectedIds.length === 0 || ledgersAsync.status !== 'ready' || ledgers.length === 0}
          >
            <Download className="cg-icon" aria-hidden />
            <span>Unduh CSV</span>
          </button>
        }
      />

      {/* Baris Filter: Multi-Select Akun dan Rentang Tanggal */}
      <div className="border border-border rounded-xl bg-surface p-16 space-y-16 min-w-0">
        <div className="flex flex-col tablet:flex-row tablet:items-end justify-between gap-16 min-w-0">
          {/* Pemilih Banyak Akun */}
          <div className="flex-1 min-w-0">
            <label className="cg-label block mb-6 font-medium text-xs text-text-muted">
              Pilih Akun ({selectedIds.length} terpilih)
            </label>
            <div className="relative">
              <button
                type="button"
                data-testid="account-selector-btn"
                className="cg-input w-full flex items-center justify-between text-left h-[44px] cursor-pointer"
                onClick={() => setSelectorOpen((v) => !v)}
                aria-expanded={selectorOpen}
                aria-haspopup="dialog"
                aria-label="Buka pemilih akun"
              >
                <span className="truncate text-sm font-normal">
                  {selectedIds.length === 0
                    ? 'Pilih satu atau banyak akun…'
                    : selectedIds.length === postableAccounts.length
                    ? 'Semua akun terpilih'
                    : `${selectedIds.length} akun terpilih`}
                </span>
                <ChevronDown className="w-16 h-16 text-text-muted shrink-0 ml-8" />
              </button>

              {/* Dropdown Popover Akun */}
              {selectorOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setSelectorOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="dialog"
                    aria-label="Pilih akun buku besar"
                    className="absolute left-0 top-full mt-6 z-40 w-full tablet:w-[380px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-xl shadow-xl p-12 text-text flex flex-col max-h-[420px]"
                  >
                    {/* Header Pencarian Akun */}
                    <div className="relative mb-8 shrink-0">
                      <Search className="w-16 h-16 absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Cari kode atau nama akun…"
                        className="cg-input pl-[36px] text-xs w-full h-[36px]"
                        value={searchAccount}
                        onChange={(e) => setSearchAccount(e.target.value)}
                        autoFocus
                      />
                    </div>

                    {/* Tombol Aksi Cepat */}
                    <div className="flex items-center justify-between gap-8 pb-8 mb-8 border-b border-border text-xs shrink-0">
                      <button
                        type="button"
                        className="text-accent hover:underline font-medium"
                        onClick={selectAllAccounts}
                      >
                        Pilih semua ({postableAccounts.length})
                      </button>
                      <button
                        type="button"
                        className="text-text-muted hover:underline"
                        onClick={clearSelectedAccounts}
                      >
                        Kosongkan pilihan
                      </button>
                    </div>

                    {/* Daftar Akun per Kategori */}
                    <div className="overflow-y-auto space-y-8 flex-1 min-h-0 pr-4">
                      {ACCOUNT_CATEGORIES.map((cat) => {
                        const groupAccounts = filteredAccounts.filter(
                          (a) => a.category === cat.value
                        );
                        if (groupAccounts.length === 0) return null;

                        return (
                          <div key={cat.value} className="space-y-4">
                            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block px-4 pt-4">
                              {cat.label}
                            </span>
                            {groupAccounts.map((a) => {
                              const isChecked = selectedIds.includes(a.id);
                              return (
                                <label
                                  key={a.id}
                                  className={`flex items-center gap-8 p-[6px] rounded-lg cursor-pointer text-xs select-none transition-colors ${
                                    isChecked
                                      ? 'bg-accent/10 font-medium text-accent-strong'
                                      : 'hover:bg-surface-raised text-text'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleAccount(a.id)}
                                    className="rounded border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer shrink-0"
                                  />
                                  <span className="font-mono text-text-muted shrink-0">
                                    {a.code}
                                  </span>
                                  <span className="truncate flex-1" title={a.name}>
                                    {a.name}
                                  </span>
                                  {!a.isActive && (
                                    <span className="text-[10px] text-text-muted shrink-0">
                                      (nonaktif)
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                      {filteredAccounts.length === 0 && (
                        <p className="text-center text-xs text-text-muted py-16">
                          Tidak ada akun yang cocok dengan pencarian.
                        </p>
                      )}
                    </div>

                    {/* Tombol Tutup */}
                    <div className="pt-8 mt-8 border-t border-border shrink-0 flex justify-end">
                      <button
                        type="button"
                        className="cg-btn cg-btn--primary cg-btn--sm text-xs"
                        onClick={() => setSelectorOpen(false)}
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filter Tanggal */}
          <div className="shrink-0 min-w-0">
            <label className="cg-label block mb-6 font-medium text-xs text-text-muted">
              Periode Pembukuan
            </label>
            <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="bb" />
          </div>
        </div>

        {/* Chips Akun Terpilih */}
        {selectedIds.length > 0 && selectedIds.length < postableAccounts.length && (
          <div className="flex flex-wrap gap-6 pt-8 border-t border-border">
            {selectedIds.map((id) => {
              const acc = postableAccounts.find((a) => a.id === id);
              if (!acc) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-4 px-8 py-[2px] rounded-full bg-surface-raised border border-border text-xs text-text font-medium"
                >
                  <span className="font-mono text-text-muted">{acc.code}</span>
                  <span className="truncate max-w-[160px]">{acc.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleAccount(id)}
                    className="p-[2px] hover:text-danger rounded-full"
                    title={`Hapus ${acc.name}`}
                    aria-label={`Hapus ${acc.name}`}
                  >
                    <X className="w-[12px] h-[12px]" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Penanganan Galat Akun */}
      {accounts.status === 'error' && (
        <ErrorBox message={accounts.message} onRetry={accounts.reload} />
      )}

      {/* Keadaan Kosong: Tidak Ada Akun Terpilih */}
      {selectedIds.length === 0 && accounts.status !== 'error' && (
        <div className="cg-empty">
          <p>
            <strong>Pilih setidaknya satu akun.</strong>
          </p>
          <p className="text-text-muted mt-4">
            Buku besar menampilkan saldo awal, mutasi debit/kredit, dan saldo berjalan untuk setiap akun yang Anda pilih.
          </p>
        </div>
      )}

      {/* Penanganan Galat Buku Besar */}
      {selectedIds.length > 0 && ledgersAsync.status === 'error' && (
        <ErrorBox message={ledgersAsync.message} onRetry={ledgersAsync.reload} />
      )}

      {/* Indikator Memuat */}
      {selectedIds.length > 0 && ledgersAsync.status === 'loading' && (
        <div className="space-y-16" aria-busy="true" aria-label="Memuat buku besar">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-240 rounded-lg" />
        </div>
      )}

      {/* Tampilan Data Buku Besar */}
      {selectedIds.length > 0 &&
        ledgersAsync.status === 'ready' &&
        ledgers.length > 0 && (
          <div className="space-y-24 min-w-0">
            {/* Kartu Ringkasan KPI Total Keseluruhan */}
            <div
              className="grid grid-cols-2 tablet:grid-cols-4 gap-12"
              aria-label="Ringkasan total buku besar"
            >
              <StatCard
                label="Total Debit"
                value={formatRp(summary.totalDebit)}
                testId="total-debit"
              />
              <StatCard
                label="Total Kredit"
                value={formatRp(summary.totalCredit)}
                testId="total-kredit"
              />
              <StatCard
                label="Total Saldo Akhir"
                value={formatRp(summary.totalClosing)}
                primary
                testId="total-saldo-akhir"
              />
              <StatCard
                label="Akun Terpilih"
                value={`${summary.accountCount} akun`}
                subtext={`${summary.movementCount} gerakan transaksi`}
                testId="jumlah-akun"
              />
            </div>

            {/* Daftar Kartu per Akun */}
            <div className="space-y-24 min-w-0">
              {ledgers.map((l) => (
                <div
                  key={l.account.id}
                  className="border border-border rounded-xl bg-surface overflow-hidden shadow-xs min-w-0"
                >
                  {/* Header Akun */}
                  <div className="p-16 border-b border-border bg-surface-raised/40 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 min-w-0">
                    <div className="flex items-center gap-12 min-w-0">
                      <span className="font-mono text-xs px-8 py-[2px] bg-accent/15 text-accent-strong rounded-md font-semibold shrink-0">
                        {l.account.code}
                      </span>
                      <div className="truncate">
                        <h2 className="text-base font-semibold text-text truncate">
                          {l.account.name}
                        </h2>
                        <span className="text-xs text-text-muted block">
                          Saldo normal: {isDebitNormal(l.account.category) ? 'Debit' : 'Kredit'}
                          {!l.account.isActive ? ' · Nonaktif' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Ringkasan Cepat Akun */}
                    <div className="flex flex-wrap items-center gap-x-16 gap-y-4 text-xs text-text-muted shrink-0">
                      <div>
                        <span>Awal: </span>
                        <strong className="cg-num text-text">{formatRp(l.opening)}</strong>
                      </div>
                      <div>
                        <span>Debit: </span>
                        <strong className="cg-num text-text">{formatRp(l.debit)}</strong>
                      </div>
                      <div>
                        <span>Kredit: </span>
                        <strong className="cg-num text-text">{formatRp(l.credit)}</strong>
                      </div>
                      <div className="tablet:pl-8 tablet:border-l tablet:border-border">
                        <span className="font-semibold text-text">Akhir: </span>
                        <strong className="cg-num text-accent-strong font-bold text-sm">
                          {formatRp(l.closing)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Tabel Gerakan Transaksi */}
                  <div className="cg-data-wrap">
                    <table className="cg-data" aria-label={`Buku besar ${l.account.name}`}>
                      <thead>
                        <tr>
                          <th className="w-[120px]">Tanggal</th>
                          <th>Nomor Jurnal & Keterangan</th>
                          <th className="text-right w-[140px]">Debit</th>
                          <th className="text-right w-[140px]">Kredit</th>
                          <th className="text-right w-[150px]">Saldo Berjalan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Baris Saldo Awal */}
                        <tr className="bg-surface-raised/30 font-medium">
                          <td className="text-sm whitespace-nowrap text-text-muted">—</td>
                          <td className="text-text-muted">
                            <strong>Saldo Awal Periode</strong>
                          </td>
                          <td className="text-right cg-num text-text-muted">—</td>
                          <td className="text-right cg-num text-text-muted">—</td>
                          <td className="text-right cg-num font-semibold text-text">
                            {formatRp(l.opening)}
                          </td>
                        </tr>

                        {/* Baris Transaksi */}
                        {l.rows.map((r, i) => (
                          <tr key={`${r.entryId}-${i}`}>
                            <td className="text-sm whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="break-words max-w-[340px]">
                              <div className="flex items-center gap-6 flex-wrap">
                                <strong>{r.number}</strong>
                                <span className="cg-badge">{sourceLabel(r.sourceType)}</span>
                              </div>
                              <span className="block text-xs text-text-muted mt-2">
                                {r.description}
                                {r.memo ? ` · ${r.memo}` : ''}
                              </span>
                            </td>
                            <td className="text-right cg-num">
                              {r.debit > 0 ? formatRp(r.debit) : '—'}
                            </td>
                            <td className="text-right cg-num">
                              {r.credit > 0 ? formatRp(r.credit) : '—'}
                            </td>
                            <td className="text-right cg-num font-medium text-text">
                              {formatRp(r.balance)}
                            </td>
                          </tr>
                        ))}

                        {/* Jika Tidak Ada Gerakan */}
                        {l.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="py-16 text-center text-xs text-text-muted"
                            >
                              Tidak ada gerakan transaksi pada rentang tanggal ini (saldo tetap{' '}
                              <strong>{formatRp(l.closing)}</strong>).
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold bg-surface-raised/50">
                          <td colSpan={2} className="text-text">
                            Subtotal {l.account.name}
                          </td>
                          <td className="text-right cg-num">{formatRp(l.debit)}</td>
                          <td className="text-right cg-num">{formatRp(l.credit)}</td>
                          <td className="text-right cg-num font-bold text-accent-strong">
                            {formatRp(l.closing)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  primary = false,
  testId,
}: {
  label: string;
  value: string;
  subtext?: string;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
      <div>
        <span className="text-xs text-text-muted font-medium block mb-4 leading-tight break-words">
          {label}
        </span>
        <strong
          className={`text-xl tablet:text-2xl font-bold block text-left leading-tight tracking-tight ${
            primary ? 'text-primary' : 'text-text'
          }`}
          data-testid={testId}
        >
          {value}
        </strong>
      </div>
      {subtext && (
        <span className="text-xs text-text-muted block mt-4 leading-tight break-words">
          {subtext}
        </span>
      )}
    </div>
  );
}

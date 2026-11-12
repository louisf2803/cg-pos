'use client';
import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import {
  combineShiftReports,
  filterShiftRows,
  formatRp,
  groupShiftsByCashier,
  toCsv,
  type ShiftReportRow,
  type StoreCloseSummary,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { dateRange } from '@/lib/range';
import { downloadCsvWithHistory } from '@/lib/export';
import { ErrorBox } from '@/components/page';
import { DateSpan, todayKey, useDialog } from '@/components/fin-common';

const money = (n: number) => (n < 0 ? `-${formatRp(-n)}` : formatRp(n));
const when = (iso?: string, tz = 'Asia/Jakarta') =>
  iso
    ? new Intl.DateTimeFormat('id-ID', {
        timeZone: tz,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
    : '—';

/** Ambil laporan semua shift pada rentang tanggal lokal outlet. */
export function useShiftRows(span: { from: string; to: string }) {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : undefined;
  const rows = useAsync(() => (tz ? data.listShiftReports(dateRange(tz, span.from, span.to)) : new Promise<ShiftReportRow[]>(() => {})), [data, tz, span.from, span.to]);
  return { ctx, rows };
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)' }}>
      <span className="block text-sm text-text-muted">{label}</span>
      <strong className={`cg-num${tone === 'warn' ? ' text-danger' : ''}`}>{value}</strong>
    </div>
  );
}
const Stats = ({ children }: { children: React.ReactNode }) => <div className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>{children}</div>;
const Loading = () => <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}</div>;

function varianceBadge(r: ShiftReportRow) {
  if (r.shift.status === 'open') return <span className="cg-badge cg-badge--info">Berjalan</span>;
  if (r.variance === 0) return <span className="cg-badge cg-badge--success">Cocok</span>;
  return <span className={`cg-badge ${r.variance < 0 ? 'cg-badge--danger' : 'cg-badge--warning'}`}>{r.variance < 0 ? 'Kurang' : 'Lebih'} {formatRp(Math.abs(r.variance))}</span>;
}

/** Laporan kasir: satu baris per shift, rincian pembayaran dan produk di dialog. */
export function CashierReport() {
  const [span, setSpan] = useState({ from: todayKey(), to: todayKey() });
  const [tab, setTab] = useState<'shifts' | 'summary'>('shifts');
  const [cashierFilter, setCashierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [search, setSearch] = useState('');

  const { ctx, rows } = useShiftRows(span);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const [pick, setPick] = useState<ShiftReportRow | null>(null);

  const rawRows = rows.status === 'ready' ? rows.data : [];
  const filteredRows = useMemo(
    () => filterShiftRows(rawRows, { cashierId: cashierFilter, status: statusFilter, search }),
    [rawRows, cashierFilter, statusFilter, search],
  );

  const cashierSummaries = useMemo(() => groupShiftsByCashier(filteredRows), [filteredRows]);
  const total = useMemo(() => combineShiftReports(filteredRows), [filteredRows]);

  const cashierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rawRows) {
      if (!map.has(r.shift.cashierId)) map.set(r.shift.cashierId, r.cashierName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [rawRows]);

  function downloadCsv() {
    if (filteredRows.length === 0) return;

    if (tab === 'shifts') {
      const csvRows: (string | number)[][] = [
        ['Kasir', 'Terminal', 'Waktu buka', 'Waktu tutup', 'Status', 'Modal awal', 'Penjualan tunai', 'Penjualan non-tunai', 'Kas masuk', 'Kas keluar', 'Refund tunai', 'Uang seharusnya', 'Uang dihitung', 'Selisih kas'],
        ...filteredRows.map((r) => [
          r.cashierName,
          'Terminal Kasir 1',
          when(r.shift.openedAt, tz),
          when(r.shift.closedAt, tz),
          r.shift.status === 'open' ? 'Berjalan' : 'Tutup',
          r.shift.openingCash,
          r.cashSales,
          r.otherSales,
          r.cashIn,
          r.cashOut,
          r.cashRefunds,
          r.expectedCash,
          r.shift.status === 'closed' ? r.counted : '',
          r.shift.status === 'closed' ? r.variance : '',
        ]),
      ];
      downloadCsvWithHistory({
        fileName: `laporan-kasir-${span.from}_${span.to}.csv`,
        csvContent: toCsv(csvRows),
        reportName: 'Laporan Kasir (Shift)',
        period: `${span.from} s.d. ${span.to}`,
        rowCount: filteredRows.length,
        sourceUrl: '/laporan/kasir',
        params: { from: span.from, to: span.to },
      });
    } else {
      const csvRows: (string | number)[][] = [
        ['Kasir', 'Terminal', 'Jumlah Shift', 'Shift Berjalan', 'Shift Tutup', 'Total Transaksi', 'Total Modal Awal', 'Total Penjualan Tunai', 'Total Penjualan Non-tunai', 'Kas Masuk', 'Kas Keluar', 'Refund Tunai', 'Total Seharusnya di Laci', 'Total Dihitung', 'Total Selisih Kas'],
        ...cashierSummaries.map((s) => [
          s.cashierName,
          s.terminalName,
          s.shiftCount,
          s.openShiftCount,
          s.closedShiftCount,
          s.orderCount,
          s.totalOpeningCash,
          s.totalCashSales,
          s.totalOtherSales,
          s.totalCashIn,
          s.totalCashOut,
          s.totalCashRefunds,
          s.totalExpectedCash,
          s.totalCountedCash,
          s.totalVariance,
        ]),
      ];
      downloadCsvWithHistory({
        fileName: `laporan-kasir-terminal-rekap-${span.from}_${span.to}.csv`,
        csvContent: toCsv(csvRows),
        reportName: 'Laporan Kasir dan Terminal (Rekap)',
        period: `${span.from} s.d. ${span.to}`,
        rowCount: cashierSummaries.length,
        sourceUrl: '/laporan/kasir',
        params: { from: span.from, to: span.to },
      });
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-12 mb-12 items-end justify-between">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="kasir" />
        <button
          type="button"
          className="cg-btn cg-btn--secondary"
          onClick={downloadCsv}
          disabled={rows.status !== 'ready' || filteredRows.length === 0}
        >
          <Download className="cg-icon" aria-hidden /> Unduh CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-12 mb-16 min-w-0">
        <div className="cg-tabs" role="tablist" aria-label="Tampilan Laporan Kasir">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shifts'}
            className={`cg-tab ${tab === 'shifts' ? 'cg-tab--active' : ''}`}
            onClick={() => setTab('shifts')}
          >
            Daftar Shift ({filteredRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'summary'}
            className={`cg-tab ${tab === 'summary' ? 'cg-tab--active' : ''}`}
            onClick={() => setTab('summary')}
          >
            Rekap Kasir &amp; Terminal ({cashierSummaries.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-8 min-w-0">
          <select
            className="cg-input text-xs h-[36px]"
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            aria-label="Filter kasir"
          >
            <option value="all">Semua Kasir / Terminal</option>
            {cashierOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="cg-input text-xs h-[36px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
            aria-label="Filter status shift"
          >
            <option value="all">Semua Status</option>
            <option value="open">Shift Berjalan</option>
            <option value="closed">Shift Tutup</option>
          </select>

          <div className="relative min-w-[160px]">
            <Search className="w-16 h-16 text-text-muted absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input
              type="search"
              className="cg-input pl-[34px] text-xs h-[36px]"
              placeholder="Cari kasir…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cari nama kasir"
            />
          </div>
        </div>
      </div>

      {rows.status === 'error' && <ErrorBox message={rows.message} onRetry={rows.reload} />}
      {rows.status === 'loading' && <Loading />}
      {rows.status === 'ready' && total && (rawRows.length === 0 ? (
        <div className="cg-empty">
          <p><strong>Tidak ada shift pada rentang tanggal ini.</strong></p>
          <p className="text-text-muted">Shift muncul setelah kasir membuka kasir di outlet.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="cg-empty">
          <p><strong>Tidak ada shift yang cocok dengan filter.</strong></p>
          <p className="text-text-muted">Ubah penyaring kasir, status, atau kata pencarian di atas.</p>
        </div>
      ) : (
        <>
          <Stats>
            <Stat label="Jumlah shift" value={String(total.shiftCount)} />
            <Stat label="Transaksi lunas" value={String(total.orderCount)} />
            <Stat label="Penjualan tunai" value={money(total.cashSales)} />
            <Stat label="Penjualan non-tunai" value={money(total.otherSales)} />
            <Stat label="Selisih kas (shift tertutup)" value={money(total.variance)} tone={total.variance < 0 ? 'warn' : undefined} />
          </Stats>

          {tab === 'shifts' ? (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Laporan kasir per shift">
                <thead>
                  <tr>
                    <th>Kasir</th>
                    <th>Terminal</th>
                    <th>Buka</th>
                    <th>Tutup</th>
                    <th className="text-right">Modal</th>
                    <th className="text-right">Tunai</th>
                    <th className="text-right">Non-tunai</th>
                    <th className="text-right">Seharusnya</th>
                    <th className="text-right">Dihitung</th>
                    <th>Kas</th>
                    <th><span className="sr-only">Rincian</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.shift.id}>
                      <td><strong>{r.cashierName}</strong></td>
                      <td className="text-xs text-text-muted">Terminal 1 (Kasir)</td>
                      <td className="text-sm whitespace-nowrap">{when(r.shift.openedAt, tz)}</td>
                      <td className="text-sm whitespace-nowrap">{when(r.shift.closedAt, tz)}</td>
                      <td className="text-right cg-num">{formatRp(r.shift.openingCash)}</td>
                      <td className="text-right cg-num">{formatRp(r.cashSales)}</td>
                      <td className="text-right cg-num">{formatRp(r.otherSales)}</td>
                      <td className="text-right cg-num">{formatRp(r.expectedCash)}</td>
                      <td className="text-right cg-num">{r.shift.status === 'closed' ? formatRp(r.counted) : '—'}</td>
                      <td>{varianceBadge(r)}</td>
                      <td>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => setPick(r)}
                          aria-label={`Rincian shift ${r.cashierName} ${when(r.shift.openedAt, tz)}`}
                        >
                          Rincian
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Rekap shift per kasir dan terminal">
                <thead>
                  <tr>
                    <th>Kasir</th>
                    <th>Terminal</th>
                    <th className="text-right">Shift (Buka / Tutup)</th>
                    <th className="text-right">Transaksi</th>
                    <th className="text-right">Total Modal</th>
                    <th className="text-right">Total Tunai</th>
                    <th className="text-right">Total Non-tunai</th>
                    <th className="text-right">Total Seharusnya</th>
                    <th className="text-right">Total Dihitung</th>
                    <th className="text-right">Total Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {cashierSummaries.map((s) => (
                    <tr key={s.cashierId}>
                      <td><strong>{s.cashierName}</strong></td>
                      <td className="text-xs text-text-muted">{s.terminalName}</td>
                      <td className="text-right cg-num">
                        {s.shiftCount} ({s.openShiftCount} / {s.closedShiftCount})
                      </td>
                      <td className="text-right cg-num">{s.orderCount}</td>
                      <td className="text-right cg-num">{formatRp(s.totalOpeningCash)}</td>
                      <td className="text-right cg-num">{formatRp(s.totalCashSales)}</td>
                      <td className="text-right cg-num">{formatRp(s.totalOtherSales)}</td>
                      <td className="text-right cg-num">{formatRp(s.totalExpectedCash)}</td>
                      <td className="text-right cg-num">{formatRp(s.totalCountedCash)}</td>
                      <td className={`text-right cg-num font-semibold ${s.totalVariance < 0 ? 'text-danger' : s.totalVariance > 0 ? 'text-accent-strong' : ''}`}>
                        {s.totalVariance === 0 ? 'Cocok (Rp 0)' : `${s.totalVariance < 0 ? 'Kurang ' : 'Lebih '}${formatRp(Math.abs(s.totalVariance))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ))}
      {pick && <ShiftDialog row={pick} tz={tz} onClose={() => setPick(null)} />}
    </div>
  );
}

function ShiftDialog({ row, tz, onClose }: { row: ShiftReportRow; tz: string; onClose: () => void }) {
  const d = useDialog(onClose);
  return (
    <dialog {...d.props} aria-labelledby="shift-judul">
      <div className="grid gap-4">
        <h2 id="shift-judul" className="cg-modal__title">Shift {row.cashierName} · {when(row.shift.openedAt, tz)}</h2>
        <dl className="grid gap-4 my-12">
          {([['Modal awal', row.shift.openingCash], ['Penjualan tunai', row.cashSales], ['Kas masuk', row.cashIn], ['Kas keluar', -row.cashOut], ['Refund tunai', -row.cashRefunds], ['Seharusnya di laci', row.expectedCash]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-12"><dt>{k}</dt><dd className="cg-num">{money(v)}</dd></div>))}
          {row.shift.status === 'closed' && <div className="flex justify-between gap-12"><dt><strong>Dihitung kasir</strong></dt><dd className="cg-num"><strong>{formatRp(row.counted)}</strong></dd></div>}
          <div className="flex justify-between gap-12"><dt>Status kas</dt><dd>{varianceBadge(row)}</dd></div>
        </dl>
        <h3 className="text-base mb-8">Per metode bayar</h3>
        {row.byMethod.length === 0 ? <p className="text-text-muted">Belum ada pembayaran.</p> : (
          <ul className="grid gap-4 mb-12">{row.byMethod.map((m) => <li key={m.methodName} className="flex justify-between gap-12"><span>{m.methodName} · {m.count}x</span><span className="cg-num">{formatRp(m.amount)}</span></li>)}</ul>)}
        <h3 className="text-base mb-8">Produk terjual</h3>
        {row.productsSold.length === 0 ? <p className="text-text-muted">Belum ada penjualan.</p> : (
          <ul className="grid gap-4 mb-12" style={{ maxHeight: 220, overflowY: 'auto' }}>{row.productsSold.map((p) => <li key={p.productId} className="flex justify-between gap-12"><span className="break-words min-w-0">{p.qty}x {p.name}</span><span className="cg-num">{formatRp(p.amount)}</span></li>)}</ul>)}
        <div className="flex justify-end"><button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>Tutup</button></div>
      </div>
    </dialog>
  );
}

/** Tutup toko: laporan gabungan semua shift satu hari. Siap ditutup hanya bila semua kasir sudah tutup kasir. */
export function StoreCloseReport() {
  const [day, setDay] = useState(todayKey());
  const { ctx, rows } = useShiftRows({ from: day, to: day });
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const sum: StoreCloseSummary | null = useMemo(() => (rows.status === 'ready' ? combineShiftReports(rows.data) : null), [rows]);

  function downloadCsv() {
    if (rows.status !== 'ready' || !sum || sum.shiftCount === 0) return;
    const csvRows: (string | number)[][] = [
      ['Tanggal', 'Status toko', 'Total transaksi', 'Total tunai', 'Total non-tunai', 'Kas masuk', 'Kas keluar', 'Seharusnya di laci', 'Selisih kas total'],
      [day, sum.canClose ? 'Siap ditutup' : `Belum siap (${sum.openCount} shift terbuka)`, sum.orderCount, sum.cashSales, sum.otherSales, sum.cashIn, sum.cashOut, sum.expectedCash, sum.variance],
      [],
      ['Shift kasir', 'Buka', 'Tutup', 'Status', 'Tunai', 'Non-tunai', 'Selisih'],
      ...rows.data.map((r) => [
        r.cashierName,
        when(r.shift.openedAt, tz),
        when(r.shift.closedAt, tz),
        r.shift.status === 'open' ? 'Berjalan' : 'Tutup',
        r.cashSales,
        r.otherSales,
        r.shift.status === 'closed' ? r.variance : '',
      ]),
    ];
    downloadCsvWithHistory({
      fileName: `tutup-toko-${day}.csv`,
      csvContent: toCsv(csvRows),
      reportName: 'Laporan Tutup Toko',
      period: day,
      rowCount: rows.data.length,
      sourceUrl: '/laporan/tutup-toko',
      params: { date: day },
    });
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-12 mb-12 items-end justify-between">
        <div className="cg-field"><label className="cg-label" htmlFor="tt-hari">Tanggal</label><input id="tt-hari" type="date" className="cg-input" max={todayKey()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></div>
        <button
          type="button"
          className="cg-btn cg-btn--secondary"
          onClick={downloadCsv}
          disabled={rows.status !== 'ready' || !sum || sum.shiftCount === 0}
        >
          <Download className="cg-icon" aria-hidden /> Unduh CSV
        </button>
      </div>
      {rows.status === 'error' && <ErrorBox message={rows.message} onRetry={rows.reload} />}
      {rows.status === 'loading' && <Loading />}
      {rows.status === 'ready' && sum && (sum.shiftCount === 0 ? (
        <div className="cg-empty"><p><strong>Tidak ada shift pada tanggal ini.</strong></p><p className="text-text-muted">Tidak ada yang bisa ditutup.</p></div>
      ) : (
        <>
          {sum.canClose
            ? <p role="status" className="cg-banner cg-banner--success mb-16">Semua {sum.closedCount} kasir sudah tutup kasir. Toko siap ditutup.</p>
            : <p role="status" className="cg-banner cg-banner--warning mb-16">Belum bisa tutup toko: masih ada {sum.openCount} kasir yang belum tutup kasir ({rows.data.filter((r) => r.shift.status === 'open').map((r) => r.cashierName).join(', ')}).</p>}
          <Stats>
            <Stat label="Transaksi lunas" value={String(sum.orderCount)} />
            <Stat label="Penjualan tunai" value={money(sum.cashSales)} />
            <Stat label="Penjualan non-tunai" value={money(sum.otherSales)} />
            <Stat label="Kas masuk / keluar" value={`${formatRp(sum.cashIn)} / ${formatRp(sum.cashOut)}`} />
            <Stat label="Seharusnya di laci" value={money(sum.expectedCash)} />
            <Stat label="Selisih kas total" value={money(sum.variance)} tone={sum.variance < 0 ? 'warn' : undefined} />
          </Stats>
          <div className="grid gap-16 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <section className="min-w-0"><h2 className="text-base mb-8">Per metode bayar</h2>
              <ul className="grid gap-4">{sum.byMethod.map((m) => <li key={m.methodName} className="flex justify-between gap-12"><span>{m.methodName} · {m.count}x</span><span className="cg-num">{formatRp(m.amount)}</span></li>)}</ul></section>
            <section className="min-w-0"><h2 className="text-base mb-8">Produk terlaris</h2>
              <ul className="grid gap-4">{sum.productsSold.slice(0, 8).map((p) => <li key={p.productId} className="flex justify-between gap-12"><span className="break-words min-w-0">{p.qty}x {p.name}</span><span className="cg-num">{formatRp(p.amount)}</span></li>)}</ul></section>
          </div>
          <h2 className="text-base mb-8">Shift hari ini</h2>
          <div className="cg-data-wrap"><table className="cg-data" aria-label="Shift pada tanggal ini">
            <thead><tr><th>Kasir</th><th>Buka</th><th>Tutup</th><th className="text-right">Tunai</th><th className="text-right">Non-tunai</th><th>Kas</th></tr></thead>
            <tbody>{rows.data.map((r) => <tr key={r.shift.id}><td>{r.cashierName}</td><td className="text-sm whitespace-nowrap">{when(r.shift.openedAt, tz)}</td><td className="text-sm whitespace-nowrap">{when(r.shift.closedAt, tz)}</td><td className="text-right cg-num">{formatRp(r.cashSales)}</td><td className="text-right cg-num">{formatRp(r.otherSales)}</td><td>{varianceBadge(r)}</td></tr>)}</tbody></table></div>
        </>
      ))}
    </div>
  );
}

'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  agingBucket,
  AGING_BUCKETS,
  computeIndirectCashFlow,
  formatRp,
  payablesBySupplier,
  sourceLabel,
  type IndirectCashFlow,
  type StatementRow,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync, type AsyncState } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';

type Tab = 'laba-rugi' | 'neraca' | 'neraca-saldo' | 'arus-kas' | 'hutang';
const TABS: { id: Tab; label: string }[] = [
  { id: 'laba-rugi', label: 'Laba rugi' }, { id: 'neraca', label: 'Neraca' }, { id: 'neraca-saldo', label: 'Neraca saldo' }, { id: 'arus-kas', label: 'Arus kas' }, { id: 'hutang', label: 'Hutang' },
];

const money = (n: number) => (n < 0 ? `(${formatRp(-n)})` : formatRp(n));

function Wait<T>({ state, children }: { state: AsyncState<T> & { reload: () => void }; children: (d: T) => ReactNode }) {
  if (state.status === 'error') return <ErrorBox message={state.message} onRetry={state.reload} />;
  if (state.status === 'loading') return <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 40 }} />)}</div>;
  return <>{children(state.data)}</>;
}

export default function FinanceReportsPage() {
  const [tab, setTab] = useState<Tab>('laba-rugi');
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (TABS.some((x) => x.id === t)) setTab(t as Tab); }, []);
  const pick = (t: Tab) => { setTab(t); try { window.history.replaceState(null, '', `?tab=${t}`); } catch { /* abaikan */ } };
  return (
    <>
      <PageHeader title="Laporan keuangan" subtitle="Semua angka dibaca dari jurnal. Jurnal yang sudah dibalik dan pembaliknya saling meniadakan." />
      <div className="flex flex-wrap gap-8 mb-16" role="group" aria-label="Jenis laporan">
        {TABS.map((t) => <button key={t.id} className="cg-chip" aria-pressed={tab === t.id} onClick={() => pick(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'laba-rugi' && <IncomeStatement />}
      {tab === 'neraca' && <BalanceSheet />}
      {tab === 'neraca-saldo' && <TrialBalance />}
      {tab === 'arus-kas' && <CashFlow />}
      {tab === 'hutang' && <Payables />}
    </>
  );
}

function useSpan() { const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() }); return { span, setSpan }; }

const PL_SECTIONS: { id: string; title: string; total?: string }[] = [
  { id: 'revenue', title: 'Pendapatan (setelah diskon dan retur)' }, { id: 'cogs', title: 'Harga pokok penjualan' }, { id: 'gross_profit', title: '', total: 'Laba kotor' },
  { id: 'expense', title: 'Beban operasional' }, { id: 'operating_profit', title: '', total: 'Laba operasional' },
  { id: 'other_income', title: 'Pendapatan lain' }, { id: 'other_expense', title: 'Beban lain' }, { id: 'net_profit', title: '', total: 'Laba bersih' },
];

function IncomeStatement() {
  const data = useData();
  const { span, setSpan } = useSpan();
  const state = useAsync(() => data.incomeStatement(span), [data, span.from, span.to]);
  return (
    <>
      <div className="flex flex-wrap gap-12 mb-16 items-end"><DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="lr" /></div>
      <Wait state={state}>{(rows) => (rows.filter((r) => r.code).length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada pendapatan atau beban di rentang ini.</strong></p><p className="text-text-muted">Laporan terisi dari penjualan lunas, pembelian, dan jurnal manual.</p></div>
      ) : (
        <div className="cg-data-wrap"><table className="cg-data" aria-label="Laba rugi">
          <thead><tr><th>Akun</th><th className="text-right">Jumlah</th></tr></thead>
          <tbody>
            {PL_SECTIONS.map((s) => {
              const items = rows.filter((r) => r.section === s.id);
              if (s.total) return items.map((r) => <tr key={s.id} data-testid={`lr-${s.id}`}><td><strong>{s.total}</strong></td><td className="text-right cg-num"><strong>{money(r.amount)}</strong></td></tr>);
              if (items.length === 0) return null;
              return [<tr key={`${s.id}-h`}><td colSpan={2} className="text-text-muted text-sm">{s.title}</td></tr>, ...items.map((r) => <tr key={`${s.id}-${r.code}`}><td className="break-words max-w-[360px]"><span className="cg-num">{r.code}</span> {r.name}</td><td className="text-right cg-num">{money(r.amount)}</td></tr>)];
            })}
          </tbody></table></div>
      ))}</Wait>
    </>
  );
}

function BalanceSheet() {
  const data = useData();
  const [asOf, setAsOf] = useState(todayKey());
  const state = useAsync(() => data.balanceSheet(asOf), [data, asOf]);
  return (
    <>
      <div className="flex flex-wrap gap-12 mb-16 items-end"><div className="cg-field"><label className="cg-label" htmlFor="nr-tgl">Per tanggal</label>
        <input id="nr-tgl" type="date" className="cg-input" value={asOf} max={todayKey()} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></div></div>
      <Wait state={state}>{({ rows, totals }) => {
        const part = (section: string, title: string, total: number, rs: StatementRow[]) => (
          <>
            <tr><td colSpan={2} className="text-text-muted text-sm">{title}</td></tr>
            {rs.map((r) => <tr key={`${section}-${r.code}`}><td className="break-words max-w-[360px]"><span className="cg-num">{r.code}</span> {r.name}</td><td className="text-right cg-num">{money(r.amount)}</td></tr>)}
            <tr data-testid={`nr-${section}`}><td><strong>Total {title.toLowerCase()}</strong></td><td className="text-right cg-num"><strong>{money(total)}</strong></td></tr>
          </>
        );
        const assets = rows.filter((r) => r.section === 'asset'), liab = rows.filter((r) => r.section === 'liability'), eq = rows.filter((r) => r.section === 'equity');
        if (assets.length + liab.length === 0 && eq.every((r) => r.amount === 0)) return <div className="cg-empty"><p><strong>Belum ada saldo per tanggal ini.</strong></p><p className="text-text-muted">Catat saldo awal di Keuangan &gt; Jurnal, atau mulai dari penjualan dan pembelian.</p></div>;
        return (
          <>
            {!totals.balanced && <p role="alert" className="cg-banner cg-banner--danger mb-12">Neraca tidak seimbang (aset {formatRp(totals.assets)}, kewajiban + ekuitas {formatRp(totals.liabilities + totals.equity)}). Periksa jurnal terbaru.</p>}
            <div className="cg-data-wrap"><table className="cg-data" aria-label="Neraca"><thead><tr><th>Akun</th><th className="text-right">Saldo</th></tr></thead>
              <tbody>{part('asset', 'Aset', totals.assets, assets)}{part('liability', 'Kewajiban', totals.liabilities, liab)}{part('equity', 'Ekuitas', totals.equity, eq)}</tbody></table></div>
            <p className="mt-12" data-testid="nr-status">{totals.balanced ? <span className="cg-badge cg-badge--success">Seimbang</span> : <span className="cg-badge cg-badge--danger">Tidak seimbang</span>} Aset = Kewajiban + Ekuitas. Laba berjalan dihitung kumulatif sampai tanggal ini.</p>
          </>
        );
      }}</Wait>
    </>
  );
}

function TrialBalance() {
  const data = useData();
  const { span, setSpan } = useSpan();
  const state = useAsync(() => data.trialBalance(span), [data, span.from, span.to]);
  return (
    <>
      <div className="flex flex-wrap gap-12 mb-16 items-end"><DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="ns" /></div>
      <Wait state={state}>{(rows) => {
        if (rows.length === 0) return <div className="cg-empty"><p><strong>Belum ada gerakan akun sampai tanggal ini.</strong></p></div>;
        const d = rows.reduce((n, r) => n + r.debit, 0), c = rows.reduce((n, r) => n + r.credit, 0);
        return (
          <div className="cg-data-wrap"><table className="cg-data" aria-label="Neraca saldo">
            <thead><tr><th>Akun</th><th className="text-right">Saldo awal</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Saldo akhir</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.accountId}><td className="break-words max-w-[300px]"><a href={`/keuangan/buku-besar?akun=${r.accountId}`}><span className="cg-num">{r.code}</span> {r.name}</a></td>
                <td className="text-right cg-num">{money(r.opening)}</td><td className="text-right cg-num">{r.debit ? formatRp(r.debit) : '—'}</td><td className="text-right cg-num">{r.credit ? formatRp(r.credit) : '—'}</td><td className="text-right cg-num">{money(r.closing)}</td></tr>)}
              <tr data-testid="ns-total"><td colSpan={2}><strong>Total mutasi</strong></td><td className="text-right cg-num"><strong>{formatRp(d)}</strong></td><td className="text-right cg-num"><strong>{formatRp(c)}</strong></td><td>{Math.round(d * 100) === Math.round(c * 100) ? <span className="cg-badge cg-badge--success">Seimbang</span> : <span className="cg-badge cg-badge--danger">Selisih</span>}</td></tr>
            </tbody></table></div>
        );
      }}</Wait>
    </>
  );
}

function CashFlow() {
  const data = useData();
  const { span, setSpan } = useSpan();
  const [method, setMethod] = useState<'direct' | 'indirect'>('direct');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = new URLSearchParams(window.location.search).get('metode');
    if (m === 'tidak-langsung' || m === 'indirect') {
      setMethod('indirect');
    } else if (m === 'langsung' || m === 'direct') {
      setMethod('direct');
    }
  }, []);

  const changeMethod = (m: 'direct' | 'indirect') => {
    setMethod(m);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'arus-kas');
      url.searchParams.set('metode', m === 'indirect' ? 'tidak-langsung' : 'langsung');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Abaikan bila di lingkungan non-browser
    }
  };

  const directState = useAsync(() => data.cashFlow(span), [data, span.from, span.to]);
  const indirectState = useAsync(async () => {
    const [trial, income] = await Promise.all([
      data.trialBalance(span),
      data.incomeStatement(span),
    ]);
    const netProfitRow = income.find((r) => r.section === 'net_profit');
    return computeIndirectCashFlow(trial, netProfitRow?.amount);
  }, [data, span.from, span.to]);

  return (
    <>
      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="ak" />
      </div>

      {/* Tab Pemilih Metode Langsung | Tidak Langsung */}
      <div className="flex items-center gap-8 mb-16" role="tablist" aria-label="Metode arus kas">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'direct'}
          className="cg-chip"
          aria-pressed={method === 'direct'}
          onClick={() => changeMethod('direct')}
        >
          Langsung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'indirect'}
          className="cg-chip"
          aria-pressed={method === 'indirect'}
          onClick={() => changeMethod('indirect')}
        >
          Tidak langsung
        </button>
      </div>

      {method === 'direct' ? (
        <Wait state={directState}>
          {(cf) => (
            <>
              <p className="mb-12" data-testid="ak-ringkas">
                Saldo awal kas dan bank <strong className="cg-num">{money(cf.opening)}</strong> · masuk{' '}
                <strong className="cg-num">{formatRp(cf.inflow)}</strong> · keluar{' '}
                <strong className="cg-num">{formatRp(cf.outflow)}</strong> · saldo akhir{' '}
                <strong className="cg-num">{money(cf.closing)}</strong>
              </p>
              {cf.groups.length === 0 ? (
                <div className="cg-empty">
                  <p><strong>Tidak ada gerakan kas atau bank di rentang ini.</strong></p>
                </div>
              ) : (
                <div className="cg-data-wrap">
                  <table className="cg-data" aria-label="Arus kas langsung">
                    <thead>
                      <tr>
                        <th>Sumber</th>
                        <th className="text-right">Masuk</th>
                        <th className="text-right">Keluar</th>
                        <th className="text-right">Bersih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cf.groups.map((g) => (
                        <tr key={g.source}>
                          <td>{g.label || sourceLabel(g.source)}</td>
                          <td className="text-right cg-num">{g.inflow ? formatRp(g.inflow) : '—'}</td>
                          <td className="text-right cg-num">{g.outflow ? formatRp(g.outflow) : '—'}</td>
                          <td className="text-right cg-num">{money(g.net)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Kenaikan (penurunan) kas</strong></td>
                        <td className="text-right cg-num"><strong>{formatRp(cf.inflow)}</strong></td>
                        <td className="text-right cg-num"><strong>{formatRp(cf.outflow)}</strong></td>
                        <td className="text-right cg-num"><strong>{money(cf.net)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Wait>
      ) : (
        <Wait state={indirectState}>
          {(icf) => <CashFlowIndirectView cf={icf} />}
        </Wait>
      )}
    </>
  );
}

function CashFlowIndirectView({ cf }: { cf: IndirectCashFlow }) {
  return (
    <div className="grid gap-16 min-w-0">
      <p className="text-sm" data-testid="ak-indirect-ringkas">
        Saldo awal kas dan bank <strong className="cg-num">{money(cf.cashSummary.opening)}</strong> ·
        Kenaikan (penurunan) bersih kas <strong className="cg-num">{money(cf.totalCashFlow)}</strong> ·
        Saldo akhir kas dan bank <strong className="cg-num">{money(cf.cashSummary.closing)}</strong>
      </p>

      {cf.reconciled ? (
        <p className="text-xs text-text-muted flex items-center gap-8">
          <span className="cg-badge cg-badge--success">Terbukti seimbang</span>
          <span>
            Total arus kas operasi, investasi, dan pendanaan cocok persis dengan perubahan kas dan bank ({money(cf.cashSummary.netChange)}).
          </span>
        </p>
      ) : (
        <p role="alert" className="cg-banner cg-banner--warning text-xs">
          Terdapat penyesuaian khusus sebesar {formatRp(Math.abs(cf.discrepancy))} dari transaksi non-kas atau penyesuaian antar-akun yang belum dapat direkonsiliasi langsung ke kas.
        </p>
      )}

      <div className="cg-data-wrap min-w-0">
        <table className="cg-data w-full" aria-label="Arus kas metode tidak langsung">
          <thead>
            <tr>
              <th className="text-left">Keterangan / Akun</th>
              <th className="text-right whitespace-nowrap">Arus Kas</th>
            </tr>
          </thead>
          <tbody>
            {/* Bagian Operasi */}
            <tr className="bg-surface-muted/40 font-semibold text-text">
              <td colSpan={2}>Arus Kas dari Aktivitas Operasi</td>
            </tr>
            <tr data-testid="ak-indirect-net-income">
              <td className="pl-16">
                <strong>Laba bersih periode</strong>
                <span className="block text-xs text-text-muted">Dari laporan laba rugi</span>
              </td>
              <td className="text-right cg-num font-semibold">{money(cf.netIncome)}</td>
            </tr>

            {/* Penyesuaian Non-Kas */}
            {cf.operating.nonCash.length > 0 && (
              <>
                <tr>
                  <td colSpan={2} className="pl-16 text-xs text-text-muted font-medium pt-8 pb-4">
                    Penyesuaian Beban Non-Kas:
                  </td>
                </tr>
                {cf.operating.nonCash.map((item) => (
                  <tr key={item.id}>
                    <td className="pl-24 break-words max-w-[360px]">
                      <span>{item.label}</span>
                      <span className="text-xs text-text-muted block">
                        {item.code} {item.name}
                      </span>
                    </td>
                    <td className="text-right cg-num">{money(item.cashImpact)}</td>
                  </tr>
                ))}
              </>
            )}

            {/* Perubahan Modal Kerja */}
            <tr>
              <td colSpan={2} className="pl-16 text-xs text-text-muted font-medium pt-8 pb-4">
                Perubahan Modal Kerja Operasional:
              </td>
            </tr>
            {cf.operating.workingCapital.length === 0 ? (
              <tr>
                <td className="pl-24 text-text-muted text-xs">
                  Tidak ada perubahan piutang, persediaan, atau utang di periode ini
                </td>
                <td className="text-right cg-num text-text-muted">—</td>
              </tr>
            ) : (
              cf.operating.workingCapital.map((item) => (
                <tr key={item.id}>
                  <td className="pl-24 break-words max-w-[360px]">
                    <span>{item.label}</span>
                    <span className="text-xs text-text-muted block">
                      Saldo awal: {money(item.opening)} → Saldo akhir: {money(item.closing)}
                    </span>
                  </td>
                  <td className="text-right cg-num">{money(item.cashImpact)}</td>
                </tr>
              ))
            )}

            <tr
              className="bg-surface-muted/60 font-semibold border-t border-border"
              data-testid="ak-indirect-operating-subtotal"
            >
              <td>Arus Kas Bersih dari Aktivitas Operasi</td>
              <td className="text-right cg-num font-bold">{money(cf.operating.subtotal)}</td>
            </tr>

            {/* Bagian Investasi */}
            <tr className="bg-surface-muted/40 font-semibold text-text">
              <td colSpan={2}>Arus Kas dari Aktivitas Investasi</td>
            </tr>
            {cf.investing.lines.map((item) => (
              <tr key={item.id}>
                <td className="pl-16 break-words max-w-[360px]">
                  <span>{item.label}</span>
                  {item.code !== '-' && (
                    <span className="text-xs text-text-muted block">
                      {item.code} {item.name}
                    </span>
                  )}
                </td>
                <td className="text-right cg-num">
                  {item.cashImpact === 0 ? '—' : money(item.cashImpact)}
                </td>
              </tr>
            ))}
            <tr
              className="bg-surface-muted/60 font-semibold border-t border-border"
              data-testid="ak-indirect-investing-subtotal"
            >
              <td>Arus Kas Bersih dari Aktivitas Investasi</td>
              <td className="text-right cg-num font-bold">{money(cf.investing.subtotal)}</td>
            </tr>

            {/* Bagian Pendanaan */}
            <tr className="bg-surface-muted/40 font-semibold text-text">
              <td colSpan={2}>Arus Kas dari Aktivitas Pendanaan</td>
            </tr>
            {cf.financing.lines.map((item) => (
              <tr key={item.id}>
                <td className="pl-16 break-words max-w-[360px]">
                  <span>{item.label}</span>
                  {item.code !== '-' && (
                    <span className="text-xs text-text-muted block">
                      {item.code} {item.name}
                    </span>
                  )}
                </td>
                <td className="text-right cg-num">
                  {item.cashImpact === 0 ? '—' : money(item.cashImpact)}
                </td>
              </tr>
            ))}
            <tr
              className="bg-surface-muted/60 font-semibold border-t border-border"
              data-testid="ak-indirect-financing-subtotal"
            >
              <td>Arus Kas Bersih dari Aktivitas Pendanaan</td>
              <td className="text-right cg-num font-bold">{money(cf.financing.subtotal)}</td>
            </tr>

            {/* Rekonsiliasi Perubahan Kas */}
            <tr
              className="border-t-2 border-border font-bold text-base"
              data-testid="ak-indirect-total"
            >
              <td>Kenaikan (Penurunan) Bersih Kas dan Bank</td>
              <td className="text-right cg-num font-bold">{money(cf.totalCashFlow)}</td>
            </tr>
            <tr className="text-sm">
              <td className="text-text-muted">Saldo awal kas dan bank</td>
              <td className="text-right cg-num text-text-muted">
                {money(cf.cashSummary.opening)}
              </td>
            </tr>
            <tr className="bg-surface-muted/30 font-semibold text-sm">
              <td>Saldo akhir kas dan bank</td>
              <td className="text-right cg-num font-bold">
                {money(cf.cashSummary.closing)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Payables() {
  const data = useData();
  const [asOf, setAsOf] = useState(todayKey());
  const state = useAsync(() => data.payablesAging(asOf), [data, asOf]);
  const buckets = useMemo(() => (state.status === 'ready' ? AGING_BUCKETS.map((_, i) => state.data.filter((r) => agingBucket(r.daysOverdue) === i).reduce((n, r) => n + r.outstanding, 0)) : []), [state]);
  return (
    <>
      <div className="flex flex-wrap gap-12 mb-16 items-end"><div className="cg-field"><label className="cg-label" htmlFor="ht-tgl">Per tanggal</label>
        <input id="ht-tgl" type="date" className="cg-input" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></div></div>
      <Wait state={state}>{(rows) => {
        if (rows.length === 0) return <div className="cg-empty"><p><strong>Tidak ada hutang yang belum lunas.</strong></p><p className="text-text-muted">Hutang muncul dari faktur pembelian yang belum dibayar penuh.</p></div>;
        const total = rows.reduce((n, r) => n + r.outstanding, 0), by = payablesBySupplier(rows);
        return (
          <div className="grid gap-16">
            <p data-testid="ht-total">Total hutang <strong className="cg-num">{formatRp(total)}</strong> dari {rows.length} faktur</p>
            <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Umur hutang">
              {AGING_BUCKETS.map((l, i) => <div key={l} className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><div className="text-sm text-text-muted">{l}</div><div className="cg-num"><strong>{formatRp(buckets[i] ?? 0)}</strong></div></div>)}
            </div>
            <section className="min-w-0"><h2 className="text-base mb-8">Per pemasok</h2><div className="cg-data-wrap"><table className="cg-data" aria-label="Hutang per pemasok">
              <thead><tr><th>Pemasok</th><th className="text-right">Faktur</th><th className="text-right">Sisa hutang</th><th className="text-right">Lewat tempo</th></tr></thead>
              <tbody>{by.map((s) => <tr key={s.supplierName}><td className="break-words max-w-[260px]"><strong>{s.supplierName}</strong></td><td className="text-right cg-num">{s.count}</td><td className="text-right cg-num">{formatRp(s.outstanding)}</td><td className="text-right cg-num">{s.overdue ? formatRp(s.overdue) : '—'}</td></tr>)}</tbody></table></div></section>
            <section className="min-w-0"><h2 className="text-base mb-8">Per faktur</h2><div className="cg-data-wrap"><table className="cg-data" aria-label="Hutang per faktur">
              <thead><tr><th>Faktur</th><th>Jatuh tempo</th><th className="text-right">Sisa</th><th className="text-right">Terlambat</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.invoiceId}><td className="break-words max-w-[240px]"><strong>{r.number}</strong><span className="block text-sm text-text-muted">{r.supplierName}</span></td><td className="text-sm whitespace-nowrap">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                <td className="text-right cg-num">{formatRp(r.outstanding)}</td><td className="text-right">{r.daysOverdue > 0 ? <span className="cg-badge cg-badge--danger">{r.daysOverdue} hari</span> : '—'}</td></tr>)}</tbody></table></div></section>
            <p className="text-sm text-text-muted">Piutang pelanggan belum ada: semua penjualan di CG POS dibayar saat transaksi, jadi tidak ada tagihan ke pelanggan.</p>
          </div>
        );
      }}</Wait>
    </>
  );
}

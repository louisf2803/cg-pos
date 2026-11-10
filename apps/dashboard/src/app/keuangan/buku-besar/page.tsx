'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatRp, sourceLabel, ACCOUNT_CATEGORIES } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';

export default function LedgerPage() {
  const data = useData();
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [accountId, setAccountId] = useState('');
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  useEffect(() => { const a = new URLSearchParams(window.location.search).get('akun'); if (a) setAccountId(a); }, []);
  const postable = useMemo(() => (accounts.status === 'ready' ? accounts.data.filter((a) => a.kind === 'detail') : []), [accounts]);
  const ledger = useAsync(() => (accountId ? data.ledger(accountId, span) : Promise.resolve(null)), [data, accountId, span.from, span.to]);
  return (
    <>
      <PageHeader title="Buku besar" subtitle="Semua gerakan satu akun beserta saldo berjalannya" />
      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <div className="cg-field grow" style={{ minWidth: 220 }}><label className="cg-label" htmlFor="bb-akun">Akun</label>
          <select id="bb-akun" className="cg-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Pilih akun…</option>
            {ACCOUNT_CATEGORIES.map((c) => { const xs = postable.filter((a) => a.category === c.value); return xs.length === 0 ? null : (
              <optgroup key={c.value} label={c.label}>{xs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.isActive ? '' : ' (nonaktif)'}</option>)}</optgroup>); })}
          </select></div>
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="bb" />
      </div>
      {accounts.status === 'error' && <ErrorBox message={accounts.message} onRetry={accounts.reload} />}
      {!accountId && accounts.status !== 'error' && <div className="cg-empty"><p><strong>Pilih akun dulu.</strong></p><p className="text-text-muted">Buku besar menampilkan saldo awal, setiap gerakan, dan saldo akhir untuk satu akun.</p></div>}
      {accountId && ledger.status === 'error' && <ErrorBox message={ledger.message} onRetry={ledger.reload} />}
      {accountId && ledger.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {accountId && ledger.status === 'ready' && ledger.data && (
        <>
          <p className="mb-12" data-testid="ringkasan-bb">Saldo awal <strong className="cg-num">{formatRp(ledger.data.opening)}</strong> · debit <strong className="cg-num">{formatRp(ledger.data.debit)}</strong> · kredit <strong className="cg-num">{formatRp(ledger.data.credit)}</strong> · saldo akhir <strong className="cg-num">{formatRp(ledger.data.closing)}</strong></p>
          {ledger.data.rows.length === 0 ? <div className="cg-empty"><p><strong>Tidak ada gerakan di rentang ini.</strong></p></div> : (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Buku besar">
                <thead><tr><th>Tanggal</th><th>Jurnal</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Saldo</th></tr></thead>
                <tbody>
                  <tr><td colSpan={4} className="text-text-muted">Saldo awal</td><td className="text-right cg-num">{formatRp(ledger.data.opening)}</td></tr>
                  {ledger.data.rows.map((r, i) => (
                    <tr key={`${r.entryId}-${i}`}>
                      <td className="text-sm whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="break-words max-w-[320px]"><strong>{r.number}</strong> <span className="cg-badge">{sourceLabel(r.sourceType)}</span><span className="block text-sm text-text-muted">{r.description}{r.memo ? ` · ${r.memo}` : ''}</span></td>
                      <td className="text-right cg-num">{r.debit > 0 ? formatRp(r.debit) : '—'}</td><td className="text-right cg-num">{r.credit > 0 ? formatRp(r.credit) : '—'}</td><td className="text-right cg-num">{formatRp(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

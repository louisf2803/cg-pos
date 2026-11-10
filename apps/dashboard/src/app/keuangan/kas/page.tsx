'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine } from 'lucide-react';
import { formatRp, newId, sourceLabel, type Account } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';
import { MoveDialog, MOVE_TITLE, type MoveKind } from '@/components/move-dialog';

const money = (n: number) => (n < 0 ? `(${formatRp(-n)})` : formatRp(n));

export default function CashBookPage() {
  const data = useData();
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  const [pick, setPick] = useState('');
  const [dlg, setDlg] = useState<MoveKind | null>(null);
  const [notice, setNotice] = useState('');
  const cash = useMemo(() => (accounts.status === 'ready' ? accounts.data.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive) : []), [accounts]);
  const accountId = pick || cash[0]?.id || '';
  const balances = useAsync(() => data.trialBalance(span), [data, span.from, span.to]);
  const ledger = useAsync(() => (accountId ? data.ledger(accountId, span) : Promise.resolve(null)), [data, accountId, span.from, span.to]);
  const refresh = () => { balances.reload(); ledger.reload(); };
  const closing = (id: string) => (balances.status === 'ready' ? balances.data.find((r) => r.accountId === id)?.closing ?? 0 : null);
  return (
    <>
      <PageHeader title="Buku kas dan bank" subtitle="Catat uang masuk, uang keluar, dan pindah saldo antara kas dan bank. Semuanya langsung menjadi jurnal."
        actions={<>
          <button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg('in'); }}><ArrowDownToLine className="cg-icon" aria-hidden /> Kas masuk</button>
          <button className="cg-btn cg-btn--secondary" onClick={() => { setNotice(''); setDlg('out'); }}><ArrowUpFromLine className="cg-icon" aria-hidden /> Kas keluar</button>
          <button className="cg-btn cg-btn--secondary" onClick={() => { setNotice(''); setDlg('move'); }}><ArrowRightLeft className="cg-icon" aria-hidden /> Pindah saldo</button>
        </>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {accounts.status === 'error' && <ErrorBox message={accounts.message} onRetry={accounts.reload} />}
      {accounts.status === 'ready' && cash.length === 0 && <div className="cg-empty"><p><strong>Belum ada akun kas atau bank.</strong></p><p className="text-text-muted">Tambahkan akun berkelompok Kas dan bank di Daftar akun.</p></div>}
      {cash.length > 0 && (
        <>
          <div className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }} aria-label="Saldo kas dan bank">
            {cash.map((a) => (
              <button key={a.id} className="p-8 text-left" aria-pressed={a.id === accountId} onClick={() => setPick(a.id)}
                style={{ border: `1px solid ${a.id === accountId ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)' }}>
                <span className="block text-sm text-text-muted">{a.code} · {a.name}</span>
                <strong className="cg-num" data-testid={`saldo-${a.code}`}>{closing(a.id) === null ? '…' : money(closing(a.id)!)}</strong>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-12 mb-12 items-end"><DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="kb" /></div>
          {ledger.status === 'error' && <ErrorBox message={ledger.message} onRetry={ledger.reload} />}
          {ledger.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}</div>}
          {ledger.status === 'ready' && ledger.data && (ledger.data.rows.length === 0 ? (
            <div className="cg-empty"><p><strong>Tidak ada gerakan di akun ini pada rentang tanggal.</strong></p><p className="text-text-muted">Saldo awal {money(ledger.data.opening)}.</p></div>
          ) : (
            <div className="cg-data-wrap"><table className="cg-data" aria-label="Gerakan kas dan bank">
              <thead><tr><th>Tanggal</th><th>Keterangan</th><th className="text-right">Masuk</th><th className="text-right">Keluar</th><th className="text-right">Saldo</th></tr></thead>
              <tbody>
                <tr><td colSpan={4} className="text-text-muted">Saldo awal</td><td className="text-right cg-num">{money(ledger.data.opening)}</td></tr>
                {ledger.data.rows.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`}><td className="text-sm whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="break-words max-w-[320px]"><strong>{r.number}</strong> <span className="cg-badge">{sourceLabel(r.sourceType)}</span><span className="block text-sm text-text-muted">{r.description}</span></td>
                    <td className="text-right cg-num">{r.debit > 0 ? formatRp(r.debit) : '—'}</td><td className="text-right cg-num">{r.credit > 0 ? formatRp(r.credit) : '—'}</td><td className="text-right cg-num">{money(r.balance)}</td></tr>
                ))}
              </tbody></table></div>
          ))}
        </>
      )}
      {dlg && accounts.status === 'ready' && <MoveDialog kind={dlg} accounts={accounts.data} defaultAccount={accountId} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); setNotice(m); refresh(); }} />}
    </>
  );
}

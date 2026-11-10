'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine } from 'lucide-react';
import { formatRp, newId, sourceLabel, type Account } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey, useDialog } from '@/components/fin-common';

type Kind = 'in' | 'out' | 'move';
const TITLE: Record<Kind, string> = { in: 'Kas masuk', out: 'Kas keluar', move: 'Pindah saldo kas dan bank' };
const money = (n: number) => (n < 0 ? `(${formatRp(-n)})` : formatRp(n));

export default function CashBookPage() {
  const data = useData();
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  const [pick, setPick] = useState('');
  const [dlg, setDlg] = useState<Kind | null>(null);
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

function MoveDialog({ kind, accounts, defaultAccount, onClose, onDone }: { kind: Kind; accounts: Account[]; defaultAccount: string; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const postable = accounts.filter((a) => a.kind === 'detail' && a.isActive);
  const cash = postable.filter((a) => a.category === 'cash_bank');
  const other = postable.filter((a) => a.category !== 'cash_bank');
  const sys = (k: string) => postable.find((a) => a.systemKey === k)?.id ?? '';
  const [f, setF] = useState({
    date: todayKey(), account: defaultAccount || cash[0]?.id || '', other: kind === 'in' ? sys('cash_in_other') : kind === 'out' ? sys('cash_out_expense') : (cash.find((a) => a.id !== defaultAccount)?.id ?? ''),
    amount: '', note: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };
  const counterparts = kind === 'move' ? cash.filter((a) => a.id !== f.account) : other;
  const label = { in: 'Sumber uang', out: 'Dipakai untuk', move: 'Pindah ke' }[kind];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = Number(f.amount.replace(',', '.'));
    if (!f.account || !f.other) return setErr(kind === 'move' ? 'Pilih akun asal dan tujuan.' : 'Pilih akun kas atau bank dan akun lawannya.');
    if (f.account === f.other) return setErr('Akun asal dan tujuan tidak boleh sama.');
    if (!Number.isFinite(amount) || amount <= 0) return setErr('Isi jumlah lebih dari 0.');
    if (Math.round(amount * 100) / 100 !== amount) return setErr('Jumlah paling banyak 2 angka di belakang koma.');
    const desc = f.note.trim() || TITLE[kind];
    // masuk: debit kas/bank; keluar: kredit kas/bank; pindah: kredit akun asal, debit akun tujuan
    const lines = kind === 'in' ? [{ accountId: f.account, debit: amount, credit: 0 }, { accountId: f.other, debit: 0, credit: amount }]
      : kind === 'out' ? [{ accountId: f.other, debit: amount, credit: 0 }, { accountId: f.account, debit: 0, credit: amount }]
        : [{ accountId: f.other, debit: amount, credit: 0 }, { accountId: f.account, debit: 0, credit: amount }];
    setBusy(true); setErr('');
    try { const j = await data.postJournal({ id, date: f.date, description: desc, kind: 'manual', lines }); onDone(`${TITLE[kind]} ${formatRp(amount)} tercatat (${j.number}).`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mencatat.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-kas">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-kas" className="cg-modal__title">{TITLE[kind]}</h2>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="ks-tgl">Tanggal</label><input id="ks-tgl" type="date" className="cg-input" value={f.date} max={todayKey()} onChange={(e) => set({ date: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="ks-jumlah">Jumlah (Rp)</label><input id="ks-jumlah" className="cg-input cg-num" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, '') })} autoFocus /></div>
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="ks-akun">{kind === 'move' ? 'Pindah dari' : 'Kas atau bank'}</label>
          <select id="ks-akun" className="cg-input" value={f.account} onChange={(e) => set({ account: e.target.value })}>{cash.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
        <div className="cg-field"><label className="cg-label" htmlFor="ks-lawan">{label}</label>
          <select id="ks-lawan" className="cg-input" value={f.other} onChange={(e) => set({ other: e.target.value })}><option value="">Pilih akun…</option>{counterparts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
        <div className="cg-field"><label className="cg-label" htmlFor="ks-ket">Keterangan (opsional)</label><input id="ks-ket" className="cg-input" maxLength={200} value={f.note} onChange={(e) => set({ note: e.target.value })} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Menyimpan…' : 'Catat'}</button></div>
      </form>
    </dialog>
  );
}

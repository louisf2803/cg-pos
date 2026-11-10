'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Eye, Plus, Trash2, Undo2 } from 'lucide-react';
import {
  formatRp,
  journalProblem,
  newId,
  sourceLabel,
  type Account,
  type Journal,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox } from '@/components/page';
import { fmtDate, todayKey, useDialog } from '@/components/fin-common';

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
const digits = (v: string) => v.replace(/[^\d.,]/g, '');

export function ShowDialog({
  id,
  onClose,
  onReversed,
}: {
  id: string;
  onClose: () => void;
  onReversed: (j: Journal) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const state = useAsync(() => data.getJournal(id), [data, id]);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const j = state.status === 'ready' ? state.data : null;
  const canReverse =
    !!j &&
    j.status === 'posted' &&
    (j.sourceType === 'manual' || j.sourceType === 'opening') &&
    !j.reversesId;

  async function reverse(e: FormEvent) {
    e.preventDefault();
    if (busy || !j) return;
    setBusy(true);
    setErr('');
    try {
      onReversed(await data.reverseJournal(j.id, reason.trim() || undefined));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Jurnal gagal dibalik.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-jurnal">
      <div className="grid gap-12">
        <h2 id="judul-jurnal" className="cg-modal__title break-words">
          {j ? `Jurnal ${j.number}` : 'Jurnal'}
        </h2>
        {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
        {state.status === 'loading' && (
          <div className="cg-skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Memuat" />
        )}
        {state.status === 'ready' && !j && <p>Jurnal tidak ditemukan.</p>}
        {j && (
          <>
            <p className="text-sm text-text-muted">
              {fmtDate(j.date)} · {sourceLabel(j.sourceType)} ·{' '}
              {j.status === 'voided' ? 'sudah dibalik' : 'terposting'}
            </p>
            <p className="break-words">{j.description}</p>
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Baris jurnal">
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="break-words max-w-[300px]">
                        <span className="cg-num">{l.code}</span> {l.name}
                        {l.memo && (
                          <span className="block text-sm text-text-muted">{l.memo}</span>
                        )}
                      </td>
                      <td className="text-right cg-num">
                        {l.debit > 0 ? formatRp(l.debit) : '—'}
                      </td>
                      <td className="text-right cg-num">
                        {l.credit > 0 ? formatRp(l.credit) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="text-right cg-num">
                      <strong>{formatRp(j.total)}</strong>
                    </td>
                    <td className="text-right cg-num">
                      <strong>{formatRp(j.total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {j.status === 'voided' && (
              <p className="cg-banner cg-banner--info">
                Jurnal ini sudah dibalik. Jurnal pembaliknya meniadakan pengaruhnya di semua laporan.
              </p>
            )}
            {canReverse && !asking && (
              <div>
                <button className="cg-btn cg-btn--secondary" onClick={() => setAsking(true)}>
                  <Undo2 className="cg-icon" aria-hidden /> Balikkan jurnal
                </button>
              </div>
            )}
            {canReverse && asking && (
              <form onSubmit={reverse} className="grid gap-8">
                <div className="cg-field">
                  <label className="cg-label" htmlFor="jr-alasan">
                    Alasan (opsional)
                  </label>
                  <input
                    id="jr-alasan"
                    className="cg-input"
                    maxLength={120}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <p className="text-sm text-text-muted">
                  Jurnal tidak dihapus. Sistem membuat jurnal pembalik hari ini dan menandai jurnal ini sudah dibalik.
                </p>
                <div>
                  <button
                    type="submit"
                    className="cg-btn cg-btn--danger"
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy ? 'Membalik…' : 'Ya, balikkan'}
                  </button>
                </div>
              </form>
            )}
            {err && (
              <p role="alert" className="text-danger-strong">
                {err}
              </p>
            )}
          </>
        )}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={() => d.ref.current?.close()}>
            Tutup
          </button>
        </div>
      </div>
    </dialog>
  );
}

interface Draft {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}
const blank = (): Draft => ({ key: newId(), accountId: '', debit: '', credit: '', memo: '' });

export function NewDialog({
  onClose,
  onDone,
  initialKind = 'manual',
  title,
}: {
  onClose: () => void;
  onDone: (j: Journal) => void;
  initialKind?: 'manual' | 'opening';
  title?: string;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [id] = useState(() => newId());
  const [kind, setKind] = useState<'manual' | 'opening'>(initialKind);
  const [date, setDate] = useState(todayKey());
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState<Draft[]>([blank(), blank()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const postable: Account[] = useMemo(
    () =>
      accounts.status === 'ready'
        ? accounts.data.filter((a) => a.kind === 'detail' && a.isActive)
        : [],
    [accounts]
  );

  const patch = (key: string, p: Partial<Draft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
    setErr('');
  };

  const debit = lines.reduce((n, l) => n + num(l.debit), 0);
  const credit = lines.reduce((n, l) => n + num(l.credit), 0);
  const gap = Math.round((debit - credit) * 100) / 100;
  const equity = postable.find((a) => a.systemKey === 'opening_balance_equity');

  function balanceToEquity() {
    if (!equity || gap === 0) return;
    const existing = lines.find((l) => l.accountId === equity.id && !l.debit && !l.credit);
    const fill: Partial<Draft> =
      gap > 0
        ? { accountId: equity.id, credit: String(gap), debit: '' }
        : { accountId: equity.id, debit: String(-gap), credit: '' };
    if (existing) patch(existing.key, fill);
    else
      setLines((ls) => [
        ...ls.filter((l) => l.accountId || l.debit || l.credit),
        { ...blank(), ...fill },
      ]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id,
      date,
      description: desc,
      kind,
      lines: lines
        .filter((l) => l.accountId || l.debit || l.credit)
        .map((l) => ({
          accountId: l.accountId,
          debit: num(l.debit),
          credit: num(l.credit),
          ...(l.memo.trim() ? { memo: l.memo.trim() } : {}),
        })),
    };
    if (input.lines.some((l) => !l.accountId))
      return setErr('Pilih akun untuk setiap baris yang berisi jumlah.');
    const problem = journalProblem(input);
    if (problem) return setErr(problem);
    setBusy(true);
    setErr('');
    try {
      onDone(await data.postJournal(input));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Jurnal gagal disimpan.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-jurnal-baru">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-jurnal-baru" className="cg-modal__title">
          {title || (kind === 'opening' ? 'Saldo awal baru' : 'Jurnal baru')}
        </h2>
        {initialKind === 'manual' && (
          <div className="flex flex-wrap gap-8" role="group" aria-label="Jenis jurnal">
            <button
              type="button"
              className="cg-chip"
              aria-pressed={kind === 'manual'}
              onClick={() => setKind('manual')}
            >
              Jurnal umum
            </button>
            <button
              type="button"
              className="cg-chip"
              aria-pressed={kind === 'opening'}
              onClick={() => setKind('opening')}
            >
              Saldo awal
            </button>
          </div>
        )}
        <p className="text-sm text-text-muted">
          {kind === 'opening'
            ? 'Saldo awal mencatat posisi akun saat mulai memakai CG POS. Masukkan saldo kas, bank, persediaan, hutang, dan lainnya; selisihnya bisa dimasukkan ke Saldo Awal Ekuitas.'
            : 'Jurnal umum untuk transaksi yang tidak dicatat otomatis, misalnya biaya sewa atau gaji. Total debit harus sama dengan total kredit.'}
        </p>
        <div
          className="grid gap-12"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
        >
          <div className="cg-field">
            <label className="cg-label" htmlFor="jb-tanggal">
              Tanggal
            </label>
            <input
              id="jb-tanggal"
              type="date"
              className="cg-input"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setErr('');
              }}
            />
          </div>
          <div className="cg-field" style={{ gridColumn: 'span 2' }}>
            <label className="cg-label" htmlFor="jb-ket">
              Keterangan
            </label>
            <input
              id="jb-ket"
              className="cg-input"
              maxLength={200}
              value={desc}
              onChange={(e) => {
                setDesc(e.target.value);
                setErr('');
              }}
              placeholder={kind === 'opening' ? 'Saldo awal per 1 Nov' : 'Bayar sewa November'}
            />
          </div>
        </div>
        {accounts.status === 'error' && (
          <ErrorBox message={accounts.message} onRetry={accounts.reload} />
        )}
        <div className="grid gap-8">
          {lines.map((l, i) => (
            <fieldset
              key={l.key}
              className="grid gap-8 p-8"
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              }}
            >
              <legend className="text-sm text-text-muted">Baris {i + 1}</legend>
              <div className="cg-field" style={{ gridColumn: '1 / -1' }}>
                <label className="cg-label" htmlFor={`jb-akun-${i}`}>
                  Akun baris {i + 1}
                </label>
                <select
                  id={`jb-akun-${i}`}
                  className="cg-input"
                  value={l.accountId}
                  onChange={(e) => patch(l.key, { accountId: e.target.value })}
                >
                  <option value="">Pilih akun…</option>
                  {postable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cg-field">
                <label className="cg-label" htmlFor={`jb-d-${i}`}>
                  Debit baris {i + 1}
                </label>
                <input
                  id={`jb-d-${i}`}
                  className="cg-input cg-num"
                  inputMode="decimal"
                  value={l.debit}
                  onChange={(e) =>
                    patch(l.key, {
                      debit: digits(e.target.value),
                      ...(e.target.value ? { credit: '' } : {}),
                    })
                  }
                />
              </div>
              <div className="cg-field">
                <label className="cg-label" htmlFor={`jb-k-${i}`}>
                  Kredit baris {i + 1}
                </label>
                <input
                  id={`jb-k-${i}`}
                  className="cg-input cg-num"
                  inputMode="decimal"
                  value={l.credit}
                  onChange={(e) =>
                    patch(l.key, {
                      credit: digits(e.target.value),
                      ...(e.target.value ? { debit: '' } : {}),
                    })
                  }
                />
              </div>
              <div className="cg-field" style={{ gridColumn: '1 / -1' }}>
                <label className="cg-label" htmlFor={`jb-m-${i}`}>
                  Catatan baris {i + 1} (opsional)
                </label>
                <input
                  id={`jb-m-${i}`}
                  className="cg-input"
                  maxLength={200}
                  value={l.memo}
                  onChange={(e) => patch(l.key, { memo: e.target.value })}
                />
              </div>
              {lines.length > 2 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label={`Hapus baris ${i + 1}`}
                  >
                    <Trash2 className="cg-icon" aria-hidden /> Hapus baris
                  </button>
                </div>
              )}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap gap-8">
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={() => setLines((ls) => [...ls, blank()])}
          >
            <Plus className="cg-icon" aria-hidden /> Tambah baris
          </button>
          {equity && gap !== 0 && (
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={balanceToEquity}
            >
              Seimbangkan ke {equity.name}
            </button>
          )}
        </div>
        <p
          data-testid="total-jurnal"
          className={gap === 0 && debit > 0 ? '' : 'text-text-muted'}
        >
          Debit <strong className="cg-num">{formatRp(debit)}</strong> · Kredit{' '}
          <strong className="cg-num">{formatRp(credit)}</strong> ·{' '}
          {gap === 0
            ? debit > 0
              ? 'seimbang'
              : 'belum diisi'
            : `selisih ${formatRp(Math.abs(gap))}`}
        </p>
        {err && (
          <p role="alert" className="text-danger-strong">
            {err}
          </p>
        )}
        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => d.ref.current?.close()}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Menyimpan…' : 'Catat jurnal'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

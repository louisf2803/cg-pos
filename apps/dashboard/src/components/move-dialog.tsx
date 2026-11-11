'use client';

import { useState, type FormEvent } from 'react';
import { formatRp, newId, type Account } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { todayKey, useDialog } from '@/components/fin-common';

export type MoveKind = 'in' | 'out' | 'move';
export const MOVE_TITLE: Record<MoveKind, string> = {
  in: 'Kas masuk',
  out: 'Kas keluar',
  move: 'Pindah saldo kas dan bank',
};

export function MoveDialog({
  kind,
  accounts,
  defaultAccount,
  onClose,
  onDone,
}: {
  kind: MoveKind;
  accounts: Account[];
  defaultAccount: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const postable = accounts.filter((a) => a.kind === 'detail' && a.isActive);
  const cash = postable.filter((a) => a.category === 'cash_bank');
  const other = postable.filter((a) => a.category !== 'cash_bank');
  const sys = (k: string) => postable.find((a) => a.systemKey === k)?.id ?? '';

  const [f, setF] = useState({
    date: todayKey(),
    account: defaultAccount || cash[0]?.id || '',
    other:
      kind === 'in'
        ? sys('cash_in_other')
        : kind === 'out'
          ? sys('cash_out_expense')
          : (cash.find((a) => a.id !== defaultAccount)?.id ?? ''),
    amount: '',
    note: '',
  });

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => {
    setF((s) => ({ ...s, ...p }));
    setErr('');
  };

  const counterparts = kind === 'move' ? cash.filter((a) => a.id !== f.account) : other;
  const label = { in: 'Sumber uang', out: 'Dipakai untuk', move: 'Pindah ke' }[kind];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = Number(f.amount.replace(',', '.'));
    if (!f.account || !f.other)
      return setErr(
        kind === 'move'
          ? 'Pilih akun asal dan tujuan.'
          : 'Pilih akun kas atau bank dan akun lawannya.'
      );
    if (f.account === f.other) return setErr('Akun asal dan tujuan tidak boleh sama.');
    if (!Number.isFinite(amount) || amount <= 0) return setErr('Isi jumlah lebih dari 0.');
    if (Math.round(amount * 100) / 100 !== amount)
      return setErr('Jumlah paling banyak 2 angka di belakang koma.');

    const desc = f.note.trim() || MOVE_TITLE[kind];
    const lines =
      kind === 'in'
        ? [
            { accountId: f.account, debit: amount, credit: 0 },
            { accountId: f.other, debit: 0, credit: amount },
          ]
        : kind === 'out'
          ? [
              { accountId: f.other, debit: amount, credit: 0 },
              { accountId: f.account, debit: 0, credit: amount },
            ]
          : [
              { accountId: f.other, debit: amount, credit: 0 },
              { accountId: f.account, debit: 0, credit: amount },
            ];

    setBusy(true);
    setErr('');
    try {
      const j = await data.postJournal({
        id,
        date: f.date,
        description: desc,
        kind: kind === 'move' ? 'transfer' : 'manual',
        lines,
      });
      onDone(`${MOVE_TITLE[kind]} ${formatRp(amount)} tercatat (${j.number}).`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal mencatat.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-kas">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-kas" className="cg-modal__title">
          {MOVE_TITLE[kind]}
        </h2>
        <div
          className="grid gap-12"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
        >
          <div className="cg-field">
            <label className="cg-label" htmlFor="ks-tgl">
              Tanggal
            </label>
            <input
              id="ks-tgl"
              type="date"
              className="cg-input"
              value={f.date}
              max={todayKey()}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="ks-jumlah">
              Jumlah (Rp)
            </label>
            <input
              id="ks-jumlah"
              className="cg-input cg-num"
              inputMode="decimal"
              value={f.amount}
              onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
              autoFocus
            />
          </div>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="ks-akun">
            {kind === 'move' ? 'Pindah dari' : 'Kas atau bank'}
          </label>
          <select
            id="ks-akun"
            className="cg-input"
            value={f.account}
            onChange={(e) => set({ account: e.target.value })}
          >
            {cash.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="ks-lawan">
            {label}
          </label>
          <select
            id="ks-lawan"
            className="cg-input"
            value={f.other}
            onChange={(e) => set({ other: e.target.value })}
          >
            <option value="">Pilih akun…</option>
            {counterparts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="ks-ket">
            Keterangan (opsional)
          </label>
          <input
            id="ks-ket"
            className="cg-input"
            maxLength={200}
            value={f.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>
        {err && (
          <p role="alert" className="text-danger-strong">
            {err}
          </p>
        )}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Menyimpan…' : 'Catat'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

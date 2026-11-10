'use client';

import { useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { formatRp, sourceLabel, type Journal } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';
import { NewDialog, ShowDialog } from '@/components/journal-dialogs';

export default function OpeningBalancesPage() {
  const data = useData();
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  const [search, setSearch] = useState('');
  const [dlg, setDlg] = useState<{ kind: 'new' } | { kind: 'show'; id: string } | null>(null);
  const [notice, setNotice] = useState('');

  const list = useAsync(
    () =>
      data.listJournal({
        ...span,
        sourceType: 'opening',
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    [data, span.from, span.to, search]
  );

  const rows = list.status === 'ready' ? list.data : [];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Saldo awal"
        subtitle="Catatan posisi akun saat mulai menggunakan CG POS, seperti kas awal, saldo rekening bank, persediaan awal, dan hutang lama."
        actions={
          <button
            className="cg-btn cg-btn--primary"
            onClick={() => {
              setNotice('');
              setDlg({ kind: 'new' });
            }}
          >
            <Plus className="cg-icon" aria-hidden /> Saldo awal baru
          </button>
        }
      />

      {notice && (
        <p role="status" className="cg-banner cg-banner--info mb-16">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="sa" />
        <div className="cg-field grow" style={{ minWidth: 180 }}>
          <label className="cg-label" htmlFor="sa-cari">
            Cari
          </label>
          <input
            id="sa-cari"
            className="cg-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomor jurnal atau keterangan..."
          />
        </div>
      </div>

      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}

      {list.status === 'loading' && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat saldo awal">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {list.status === 'ready' &&
        (rows.length === 0 ? (
          <div className="cg-empty">
            <p>
              <strong>Belum ada jurnal saldo awal pada rentang ini.</strong>
            </p>
            <p className="text-text-muted">
              Saldo awal mencatat posisi akun saat mulai pembukuan. Selisih debit dan kredit dapat
              dialokasikan ke akun Saldo Awal Ekuitas.
            </p>
            <button
              className="cg-btn cg-btn--primary"
              onClick={() => {
                setNotice('');
                setDlg({ kind: 'new' });
              }}
            >
              <Plus className="cg-icon" aria-hidden /> Catat saldo awal
            </button>
          </div>
        ) : (
          <div className="cg-data-wrap">
            <table className="cg-data" aria-label="Daftar saldo awal">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nomor & Keterangan</th>
                  <th className="cg-num">Total</th>
                  <th>Status</th>
                  <th>
                    <span className="cg-sr">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.id}>
                    <td className="text-sm whitespace-nowrap">{fmtDate(j.date)}</td>
                    <td className="break-words max-w-[340px]">
                      <strong>{j.number}</strong>{' '}
                      <span className="cg-badge cg-badge--accent">
                        {sourceLabel(j.sourceType)}
                      </span>
                      <span className="block text-sm text-text-muted">{j.description}</span>
                    </td>
                    <td className="text-right cg-num font-semibold">{formatRp(j.total)}</td>
                    <td>
                      {j.status === 'voided' ? (
                        <span className="cg-badge cg-badge--warning">Sudah dibalik</span>
                      ) : (
                        <span className="cg-badge cg-badge--success">Terposting</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        onClick={() => {
                          setNotice('');
                          setDlg({ kind: 'show', id: j.id });
                        }}
                        aria-label={`Lihat ${j.number}`}
                      >
                        <Eye className="cg-icon" aria-hidden /> Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {dlg?.kind === 'new' && (
        <NewDialog
          initialKind="opening"
          title="Saldo awal baru"
          onClose={() => setDlg(null)}
          onDone={(j: Journal) => {
            setDlg(null);
            setNotice(`Jurnal saldo awal ${j.number} berhasil dicatat.`);
            list.reload();
          }}
        />
      )}

      {dlg?.kind === 'show' && (
        <ShowDialog
          id={dlg.id}
          onClose={() => setDlg(null)}
          onReversed={(j: Journal) => {
            setDlg(null);
            setNotice(`Jurnal pembalik ${j.number} dibuat.`);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

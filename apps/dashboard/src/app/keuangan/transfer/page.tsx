'use client';

import { useMemo, useState } from 'react';
import { ArrowRightLeft, Eye, Plus } from 'lucide-react';
import { formatRp, type Account, type Journal, type JournalSummary } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';
import { ShowDialog } from '@/components/journal-dialogs';
import { MoveDialog } from '@/components/move-dialog';

export default function CashTransfersPage() {
  const data = useData();
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  const [search, setSearch] = useState('');
  const [showMove, setShowMove] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const list = useAsync(
    () =>
      data.listJournal({
        ...span,
        sourceType: 'transfer',
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    [data, span.from, span.to, search]
  );

  // Saring langsung berdasarkan jenis sumber 'transfer' (nomor dokumen PS-)
  const transfers = useMemo(() => {
    if (list.status !== 'ready') return [];
    const needle = search.trim().toLowerCase();

    return list.data.filter((j: JournalSummary) => {
      if (j.sourceType !== 'transfer') return false;
      if (!needle) return true;
      return (
        j.number.toLowerCase().includes(needle) ||
        j.description.toLowerCase().includes(needle)
      );
    });
  }, [list, search]);

  const totalTransferred = useMemo(
    () => transfers.filter((t) => t.status !== 'voided').reduce((acc, t) => acc + t.total, 0),
    [transfers]
  );

  return (
    <div className="min-w-0">
      <PageHeader
        title="Daftar transfer kas dan bank"
        subtitle="Riwayat pemindahan saldo antar rekening kas dan bank. Tercatat otomatis sebagai jurnal pemindahan saldo."
        actions={
          <button
            className="cg-btn cg-btn--primary"
            onClick={() => {
              setNotice('');
              setShowMove(true);
            }}
          >
            <Plus className="cg-icon" aria-hidden /> Pindah saldo baru
          </button>
        }
      />

      {notice && (
        <p role="status" className="cg-banner cg-banner--info mb-16">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="tf" />
        <div className="cg-field grow" style={{ minWidth: 180 }}>
          <label className="cg-label" htmlFor="tf-cari">
            Cari
          </label>
          <input
            id="tf-cari"
            className="cg-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomor jurnal atau keterangan..."
          />
        </div>
      </div>

      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}

      {list.status === 'loading' && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat daftar transfer">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {list.status === 'ready' && (
        <>
          <div className="grid gap-16 tablet:grid-cols-2 mb-24">
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <div className="text-sm text-text-muted">Total Frekuensi Transfer</div>
              <div className="text-xl font-bold mt-4 cg-num">{transfers.length} kali</div>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <div className="text-sm text-text-muted">Total Dana Dipindahkan</div>
              <div className="text-xl font-bold mt-4 cg-num text-accent">
                {formatRp(totalTransferred)}
              </div>
            </div>
          </div>

          {transfers.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada riwayat pindah saldo pada rentang ini.</strong>
              </p>
              <p className="text-text-muted">
                Pindah saldo mencatat perpindahan uang antar akun kas dan bank (misalnya setor tunai kasir ke rekening bank).
              </p>
              <button
                className="cg-btn cg-btn--primary"
                onClick={() => {
                  setNotice('');
                  setShowMove(true);
                }}
              >
                <ArrowRightLeft className="cg-icon" aria-hidden /> Pindah saldo sekarang
              </button>
            </div>
          ) : (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Daftar transfer kas dan bank">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nomor & Keterangan</th>
                    <th className="cg-num">Jumlah Pindah</th>
                    <th>Status</th>
                    <th>
                      <span className="cg-sr">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((j) => (
                    <tr key={j.id}>
                      <td className="text-sm whitespace-nowrap">{fmtDate(j.date)}</td>
                      <td className="break-words max-w-[340px]">
                        <strong>{j.number}</strong>{' '}
                        <span className="cg-badge cg-badge--info">Pindah Saldo</span>
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
                            setViewId(j.id);
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
          )}
        </>
      )}

      {showMove && accounts.status === 'ready' && (
        <MoveDialog
          kind="move"
          accounts={accounts.data}
          defaultAccount=""
          onClose={() => setShowMove(false)}
          onDone={(msg: string) => {
            setShowMove(false);
            setNotice(msg);
            list.reload();
          }}
        />
      )}

      {viewId && (
        <ShowDialog
          id={viewId}
          onClose={() => setViewId(null)}
          onReversed={(j: Journal) => {
            setViewId(null);
            setNotice(`Jurnal pembalik ${j.number} dibuat.`);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

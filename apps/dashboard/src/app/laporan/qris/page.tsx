'use client';

import { useMemo, useState } from 'react';
import { QRIS_TABS, QRIS_TAB_LABEL, formatRp, qrisCounts, qrisTab, qrisTotals, type QrisTab } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { fmtDate } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

const SETTLEMENT_LABEL = { processing: 'Diproses', pending: 'Tertunda', settled: 'Sudah cair' } as const;
const when = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function QrisSettlementPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [tab, setTab] = useState<QrisTab>('success');
  const state = useAsync(() => data.listGatewayTransactions(range), [data, range.from, range.to]);
  const all = useMemo(() => (state.status === 'ready' ? state.data : []), [state]);
  const counts = qrisCounts(all);
  const rows = all.filter((r) => qrisTab(r.status) === tab);
  const totals = qrisTotals(rows);

  return (
    <div className="min-w-0">
      <PageHeader title="Settlement QRIS" subtitle={`Transaksi QRIS dan pencairannya · ${range.label}`} />
      <div className="mb-16"><RangePicker value={value} today={today} onChange={setValue} /></div>
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat data">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && (
        <>
          {all.length === 0 && <p role="status" className="cg-banner cg-banner--info mb-16">Payment belum tersambung. Transaksi QRIS dan settlement akan tampil di sini setelah penyedia pembayaran tersambung.</p>}
          <div role="tablist" aria-label="Status transaksi" className="flex flex-wrap gap-8 mb-12">
            {QRIS_TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`cg-btn ${tab === t ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setTab(t)}>{QRIS_TAB_LABEL[t]} ({counts[t]})</button>
            ))}
          </div>
          <dl className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Jumlah transaksi</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{totals.count}</strong></dd></div>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Nilai transaksi</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{formatRp(totals.amount)}</strong></dd></div>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Biaya transaksi</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{formatRp(totals.fee)}</strong></dd></div>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Diterima bersih</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{formatRp(totals.net)}</strong></dd></div>
          </dl>
          {rows.length === 0 ? (
            <div className="cg-empty"><p><strong>Tidak ada transaksi {QRIS_TAB_LABEL[tab].toLowerCase()}.</strong></p><p className="text-text-muted">Ubah rentang tanggal atau pilih tab lain.</p></div>
          ) : (
            <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label={`Transaksi QRIS ${QRIS_TAB_LABEL[tab].toLowerCase()}`}>
              <thead><tr><th>Waktu</th><th>Referensi</th><th>Outlet</th><th className="text-right">Nilai</th><th className="text-right">Biaya</th><th>Tanggal settlement</th><th>Status settlement</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.paidAt ?? r.createdAt)}</td><td>{r.reference}</td><td>{r.outletName}</td>
                  <td className="text-right cg-num">{formatRp(r.amount)}</td><td className="text-right cg-num">{formatRp(r.fee)}</td>
                  <td>{r.settlementDate ? fmtDate(r.settlementDate) : '—'}</td><td>{r.settlementStatus ? SETTLEMENT_LABEL[r.settlementStatus] : 'Belum masuk settlement'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}

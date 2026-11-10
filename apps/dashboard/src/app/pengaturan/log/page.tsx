'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ACTIVITY_FILTERS, columnLabel, describeActivity, formatActivityValue, type ActivityRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const RANGES = [
  { id: '1', label: '24 jam terakhir', days: 1 },
  { id: '7', label: '7 hari terakhir', days: 7 },
  { id: '30', label: '30 hari terakhir', days: 30 },
  { id: '90', label: '90 hari terakhir', days: 90 },
] as const;
const LIMIT = 200;

const when = (iso: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export default function ActivityLogPage() {
  const data = useData();
  const [range, setRange] = useState<string>('7');
  const [entity, setEntity] = useState('');
  const days = RANGES.find((r) => r.id === range)?.days ?? 7;
  const list = useAsync(() => data.listActivity({ from: new Date(Date.now() - days * 86400000).toISOString(), entity: entity || undefined, limit: LIMIT }), [data, days, entity]);
  return (
    <>
      <PageHeader title="Log aktivitas" subtitle="Riwayat perubahan pengaturan: siapa mengubah apa dan kapan. Hash PIN dan data rahasia tidak pernah dicatat; ganti PIN hanya tercatat sebagai kejadian." />
      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <div className="cg-field"><label className="cg-label" htmlFor="log-rentang">Rentang waktu</label>
          <select id="log-rentang" className="cg-input" value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
        <div className="cg-field"><label className="cg-label" htmlFor="log-benda">Jenis data</label>
          <select id="log-benda" className="cg-input" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Semua</option>{ACTIVITY_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
      </div>
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 64 }} />)}</div>}
      {list.status === 'ready' && list.data.length === 0 && (
        <div className="cg-empty"><p><strong>Tidak ada aktivitas pada rentang ini.</strong></p><p className="text-text-muted">Perubahan produk, pajak, karyawan, dan pengaturan lain akan muncul di sini begitu ada yang menyimpan.</p></div>
      )}
      {list.status === 'ready' && list.data.length > 0 && (
        <>
          <p className="text-sm text-text-muted mb-8" role="status">{list.data.length >= LIMIT ? `Menampilkan ${LIMIT} aktivitas terbaru. Persempit rentang waktu atau jenis data untuk melihat yang lebih lama.` : `${list.data.length} aktivitas`}</p>
          <ul className="grid gap-12" aria-label="Riwayat aktivitas">{list.data.map((r) => <Entry key={r.id} row={r} />)}</ul>
        </>
      )}
    </>
  );
}

function Entry({ row }: { row: ActivityRow }) {
  const line = describeActivity(row);
  return (
    <li className="border border-border rounded-lg bg-surface-raised p-16 grid gap-8 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-8">
        <strong className="break-words min-w-0">{line.headline}</strong>
        {line.kind === 'system' && <span className="cg-badge">Kejadian sistem</span>}
      </div>
      <p className="text-sm text-text-muted break-words">{when(row.at)} · {row.actorEmail ?? (row.actorUserId ? 'Pengguna tidak dikenal' : 'Sistem')}</p>
      {row.changes.length > 0 && (
        <ul className="grid gap-4 text-sm" aria-label="Rincian perubahan">
          {row.changes.map((c) => (
            <li key={c.column} className="min-w-0 break-words">
              <span className="text-text-muted">{columnLabel(c.column)}:</span>{' '}
              <span>{formatActivityValue(c.from)}</span> <ArrowRight className="cg-icon inline" aria-label="menjadi" /> <strong>{formatActivityValue(c.to)}</strong>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

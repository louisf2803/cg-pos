'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Eye, Plus, Trash2, Undo2 } from 'lucide-react';
import { formatRp, journalProblem, newId, sourceLabel, SOURCE_LABEL, type Account, type Journal, type JournalSummary } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { DateSpan, firstOfMonth, fmtDate, todayKey } from '@/components/fin-common';
import { NewDialog, ShowDialog } from '@/components/journal-dialogs';

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
const digits = (v: string) => v.replace(/[^\d.,]/g, '');

export default function JournalPage() {
  const data = useData();
  const [span, setSpan] = useState({ from: firstOfMonth(), to: todayKey() });
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const list = useAsync(() => data.listJournal({ ...span, ...(source ? { sourceType: source } : {}), ...(search.trim() ? { search } : {}) }), [data, span.from, span.to, source, search]);
  const [dlg, setDlg] = useState<{ kind: 'new' } | { kind: 'show'; id: string } | null>(null);
  const [notice, setNotice] = useState('');
  const rows = list.status === 'ready' ? list.data : [];
  return (
    <>
      <PageHeader title="Jurnal" subtitle="Catatan semua pembukuan. Jurnal otomatis datang dari penjualan dan pembelian; jurnal manual dan saldo awal kamu buat sendiri."
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg({ kind: 'new' }); }}><Plus className="cg-icon" aria-hidden /> Jurnal baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      <div className="flex flex-wrap gap-12 mb-12 items-end">
        <DateSpan from={span.from} to={span.to} onChange={setSpan} idPrefix="jr" />
        <div className="cg-field"><label className="cg-label" htmlFor="jr-sumber">Sumber</label>
          <select id="jr-sumber" className="cg-input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Semua</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="cg-field grow" style={{ minWidth: 160 }}><label className="cg-label" htmlFor="jr-cari">Cari</label>
          <input id="jr-cari" className="cg-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nomor atau keterangan" /></div>
      </div>
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {list.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada jurnal di rentang ini.</strong></p><p className="text-text-muted">Jurnal muncul otomatis saat ada penjualan lunas atau faktur pembelian. Kamu juga bisa mencatat saldo awal.</p>
          <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'new' })}>Buat jurnal</button></div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data" aria-label="Daftar jurnal">
            <thead><tr><th>Tanggal</th><th>Jurnal</th><th className="text-right">Total</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td className="text-sm whitespace-nowrap">{fmtDate(j.date)}</td>
                  <td className="break-words max-w-[340px]"><strong>{j.number}</strong> <span className="cg-badge">{sourceLabel(j.sourceType)}</span><span className="block text-sm text-text-muted">{j.description}</span></td>
                  <td className="text-right cg-num">{formatRp(j.total)}</td>
                  <td>{j.status === 'voided' ? <span className="cg-badge cg-badge--warning">Sudah dibalik</span> : <span className="cg-badge cg-badge--accent">Terposting</span>}</td>
                  <td className="text-right whitespace-nowrap"><button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => { setNotice(''); setDlg({ kind: 'show', id: j.id }); }} aria-label={`Lihat ${j.number}`}><Eye className="cg-icon" aria-hidden /> Lihat</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= 500 && <p className="text-sm text-text-muted p-8">Menampilkan 500 jurnal terbaru. Persempit rentang tanggal untuk melihat yang lain.</p>}
        </div>
      ))}
      {dlg?.kind === 'new' && <NewDialog onClose={() => setDlg(null)} onDone={(j) => { setDlg(null); setNotice(`Jurnal ${j.number} tercatat.`); list.reload(); }} />}
      {dlg?.kind === 'show' && <ShowDialog id={dlg.id} onClose={() => setDlg(null)} onReversed={(j) => { setDlg(null); setNotice(`Jurnal pembalik ${j.number} dibuat.`); list.reload(); }} />}
    </>
  );
}

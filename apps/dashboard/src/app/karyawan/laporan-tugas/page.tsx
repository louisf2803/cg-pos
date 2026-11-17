'use client';

import { useState } from 'react';
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock, MinusCircle } from 'lucide-react';
import { TASK_PHASE_LABEL, shiftDateDays, taskProgress, type TaskItem, type TaskRun } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { fmtDate, todayKey } from '@/components/fin-common';

const fmtTime = (iso?: string) => (iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '');

export default function LaporanTugasPage() {
  const data = useData();
  const [date, setDate] = useState(() => todayKey());
  const [outletId, setOutletId] = useState('');
  const [photo, setPhoto] = useState<{ title: string; url: string | null; by?: string; at?: string } | null>(null);
  const [err, setErr] = useState('');

  const outlets = useAsync(async () => {
    const [list, ctx] = await Promise.all([data.listOutlets(), data.getContext()]);
    return { list, ctxId: ctx.outletId };
  }, [data]);
  const activeOutlet = outletId || (outlets.status === 'ready' ? outlets.data.ctxId : '');
  const state = useAsync(async () => (activeOutlet ? data.listTaskRuns({ from: date, to: date, outletId: activeOutlet }) : []), [data, activeOutlet, date]);

  async function openPhoto(it: TaskItem) {
    setErr('');
    try { setPhoto({ title: it.title, url: it.photoPath ? await data.taskPhotoUrl(it.photoPath) : null, by: it.doneByName, at: it.doneAt }); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Foto tidak bisa dibuka.'); }
  }
  async function reopen(it: TaskItem) {
    setErr('');
    try { await data.reopenTaskItem(it.id); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal membuka lagi.'); }
  }

  const runs: TaskRun[] = state.status === 'ready' ? state.data : [];
  return (
    <div className="space-y-24 max-w-full">
      <PageHeader title="Laporan tugas" subtitle="Siapa mengerjakan tugas Opening dan Closing hari itu, jam berapa, beserta foto buktinya dan tugas yang ditandai tidak bisa." />
      {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
      <div className="flex flex-wrap items-end gap-12">
        <div className="cg-field">
          <label className="cg-label" htmlFor="lt-outlet">Outlet</label>
          <select id="lt-outlet" className="cg-input" value={activeOutlet} onChange={(e) => setOutletId(e.target.value)}>
            {outlets.status === 'ready' && outlets.data.list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="inline-flex items-stretch h-[36px] rounded-md border border-border overflow-hidden">
          <button type="button" className="w-[36px] flex items-center justify-center bg-surface-raised text-text-muted hover:text-text hover:bg-surface" aria-label="Hari sebelumnya" onClick={() => setDate((d) => shiftDateDays(d, -1))}><ChevronLeft className="cg-icon cg-icon--sm" aria-hidden /></button>
          <span className="px-16 flex items-center text-sm border-x border-border bg-surface-raised" aria-live="polite">{fmtDate(date)}</span>
          <button type="button" className="w-[36px] flex items-center justify-center bg-surface-raised text-text-muted hover:text-text hover:bg-surface disabled:opacity-40" aria-label="Hari berikutnya" disabled={date >= todayKey()} onClick={() => setDate((d) => shiftDateDays(d, 1))}><ChevronRight className="cg-icon cg-icon--sm" aria-hidden /></button>
        </div>
      </div>

      {state.status === 'loading' && <div className="cg-card p-24 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}
      {state.status === 'ready' && runs.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border"><p className="font-bold m-0">Belum ada tugas tercatat pada {fmtDate(date)}</p><p className="text-sm text-text-muted m-0">Baris tugas terbentuk saat tim membuka tugas atau saat kasir menutup kasir.</p></div>
      )}

      {runs.map((r) => {
        const pr = taskProgress(r.items);
        return (
          <section key={r.id} className="cg-card overflow-hidden" aria-label={`Tugas ${TASK_PHASE_LABEL[r.phase]}`}>
            <div className="p-16 border-b border-border flex items-center justify-between gap-12">
              <h2 className="text-base font-bold m-0">{TASK_PHASE_LABEL[r.phase]}</h2>
              <span className={`cg-badge ${pr.done === pr.total ? 'cg-badge--accent' : 'cg-badge--warning'} cg-num`}>{pr.done} dari {pr.total} selesai</span>
            </div>
            <ul className="m-0 p-0 list-none">
              {r.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-12 px-16 py-12 border-b border-border last:border-0">
                  <div className="flex items-start gap-12 min-w-0">
                    {it.status === 'done' ? <CheckCircle2 className="cg-icon text-success shrink-0" aria-label="Selesai" /> : it.status === 'skipped' ? <MinusCircle className="cg-icon text-warning shrink-0" aria-label="Tidak bisa" /> : <Clock className="cg-icon text-text-muted shrink-0" aria-label="Belum" />}
                    <div className="min-w-0">
                      <p className="m-0 font-medium break-words">{it.title} {it.kind === 'photo' && <span className="cg-badge cg-badge--info ml-4">Foto</span>}{!it.required && <span className="cg-badge ml-4">Opsional</span>}</p>
                      {it.status === 'done' && <p className="m-0 text-xs text-text-muted">Oleh {it.doneByName ?? 'tidak tercatat'} · {fmtTime(it.doneAt)}</p>}
                      {it.status === 'skipped' && <p className="m-0 text-xs text-text-muted">Tidak bisa oleh {it.doneByName ?? 'tidak tercatat'} · {fmtTime(it.doneAt)}: {it.skipReason}</p>}
                      {it.status === 'pending' && <p className="m-0 text-xs text-text-muted">Belum dikerjakan</p>}
                    </div>
                  </div>
                  <div className="flex gap-8">
                    {it.kind === 'photo' && it.status === 'done' && <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => void openPhoto(it)}><Camera className="cg-icon cg-icon--sm" aria-hidden /> Lihat foto</button>}
                    {it.status !== 'pending' && <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => void reopen(it)} title="Buka lagi tugas yang salah ditandai">Buka lagi</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {photo && (
        <dialog ref={(el) => { if (el && !el.open) el.showModal(); }} className="cg-modal" style={{ margin: 'auto', maxWidth: 'min(640px, calc(100vw - 16px))' }} onClose={() => setPhoto(null)} aria-labelledby="foto-title">
          <h2 id="foto-title" className="cg-modal__title">{photo.title}</h2>
          {photo.url
            ? <img src={photo.url} alt={`Foto bukti: ${photo.title}`} style={{ maxWidth: '100%', borderRadius: 12 }} />
            : <p className="cg-modal__body">Foto tidak tersedia di mode demo atau sudah tidak bisa dimuat.</p>}
          <p className="text-xs text-text-muted m-0">{photo.by ? `Diunggah oleh ${photo.by}` : ''} {photo.at ? `· ${fmtTime(photo.at)}` : ''}</p>
          <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--primary" onClick={() => setPhoto(null)}>Tutup</button></div>
        </dialog>
      )}
    </div>
  );
}

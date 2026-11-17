'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Camera, CheckSquare, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  TASK_KIND_LABEL, TASK_PHASES, TASK_PHASE_LABEL, taskTemplateProblem,
  type TaskKind, type TaskPhase, type TaskTemplate,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

export default function TugasHarianPage() {
  const data = useData();
  const [outletId, setOutletId] = useState('');
  const [phase, setPhase] = useState<TaskPhase>('opening');
  const [editing, setEditing] = useState<TaskTemplate | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');

  const outlets = useAsync(async () => {
    const [list, ctx] = await Promise.all([data.listOutlets(), data.getContext()]);
    return { list, ctxId: ctx.outletId };
  }, [data]);
  const activeOutlet = outletId || (outlets.status === 'ready' ? outlets.data.ctxId : '');
  const state = useAsync(async () => (activeOutlet ? data.listTaskTemplates(activeOutlet) : []), [data, activeOutlet]);

  const rows = useMemo(() => (state.status === 'ready' ? state.data.filter((t) => t.phase === phase).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'id')) : []), [state, phase]);
  const counts = useMemo(() => Object.fromEntries(TASK_PHASES.map((p) => [p, state.status === 'ready' ? state.data.filter((t) => t.phase === p && t.isActive).length : 0])) as Record<TaskPhase, number>, [state]);

  async function move(t: TaskTemplate, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.id === t.id); const other = rows[i + dir];
    if (!other) return;
    setErr('');
    try {
      // urutan dinormalkan supaya dua tugas yang sama-sama bernilai 0 tetap bisa bertukar
      const order = rows.map((r) => r.id); order.splice(i, 1); order.splice(i + dir, 0, t.id);
      await Promise.all(order.map((id, k) => { const r = rows.find((x) => x.id === id)!; return r.sort === k + 1 ? Promise.resolve() : data.saveTaskTemplate({ ...r, sort: k + 1 }); }));
      state.reload();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mengubah urutan.'); }
  }
  async function toggleActive(t: TaskTemplate) {
    setErr('');
    try { await data.saveTaskTemplate({ ...t, isActive: !t.isActive }); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
  }
  async function remove(t: TaskTemplate) {
    setErr('');
    try { await data.deleteTaskTemplate(t.id); setNotice(`Tugas "${t.title}" dihapus. Baris hari ini yang sudah terbentuk tidak berubah.`); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menghapus.'); }
  }

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Tugas harian"
        subtitle="Daftar tugas Opening dan Closing untuk tiap outlet. Dikerjakan bersama oleh tim lewat aplikasi karyawan; Tutup kasir di POS terkunci sampai semua tugas wajib selesai."
        actions={<button type="button" className="cg-btn cg-btn--primary" onClick={() => setEditing('new')} disabled={!activeOutlet}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah tugas</button>}
      />
      {notice && <div role="status" className="cg-banner cg-banner--success flex items-center justify-between"><span>{notice}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNotice('')}>Tutup</button></div>}
      {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}

      <div className="flex flex-wrap items-end gap-12">
        <div className="cg-field">
          <label className="cg-label" htmlFor="tugas-outlet">Outlet</label>
          <select id="tugas-outlet" className="cg-input" value={activeOutlet} onChange={(e) => setOutletId(e.target.value)}>
            {outlets.status === 'ready' && outlets.data.list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div role="tablist" aria-label="Fase tugas" className="inline-flex items-stretch h-[36px] rounded-md border border-border overflow-hidden">
          {TASK_PHASES.map((p, idx) => (
            <button key={p} type="button" role="tab" aria-selected={phase === p} className={`px-16 text-sm font-medium ${idx > 0 ? 'border-l border-border' : ''} ${phase === p ? 'bg-accent text-on-accent' : 'bg-surface-raised text-text hover:bg-surface'}`} onClick={() => setPhase(p)}>
              {TASK_PHASE_LABEL[p]} <span className="cg-num opacity-80">({counts[p]})</span>
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <div className="cg-card p-24 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>}

      {state.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <ListChecks className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <p className="font-bold m-0">Belum ada tugas {TASK_PHASE_LABEL[phase]} di outlet ini</p>
          <p className="text-sm text-text-muted m-0 mb-16">Tanpa tugas, Tutup kasir tidak dikunci. Tambahkan tugas yang harus dikerjakan tim setiap hari.</p>
          <button type="button" className="cg-btn cg-btn--primary" onClick={() => setEditing('new')}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah tugas pertama</button>
        </div>
      ) : (
        <div className="cg-card overflow-hidden">
          <div className="overflow-x-auto min-w-0">
            <table className="cg-data w-full">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-semibold text-text-muted">
                  <th className="py-12 px-16 text-left">#</th>
                  <th className="py-12 px-16 text-left">Nama tugas</th>
                  <th className="py-12 px-16 text-left">Jenis</th>
                  <th className="py-12 px-16 text-left">Wajib</th>
                  <th className="py-12 px-16 text-left">Aktif</th>
                  <th className="py-12 px-16 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={t.id} className={`border-b border-border last:border-0 ${t.isActive ? '' : 'opacity-60'}`}>
                    <td className="py-12 px-16 text-text-muted cg-num">{i + 1}</td>
                    <td className="py-12 px-16 font-medium break-words max-w-[320px]">{t.title}{!t.allowSkip && <span className="block text-xs text-text-muted">Tidak boleh ditandai tidak bisa</span>}</td>
                    <td className="py-12 px-16"><span className={`cg-badge ${t.kind === 'photo' ? 'cg-badge--info' : ''}`}>{t.kind === 'photo' ? <Camera className="cg-icon cg-icon--xs" aria-hidden /> : <CheckSquare className="cg-icon cg-icon--xs" aria-hidden />} {TASK_KIND_LABEL[t.kind]}</span></td>
                    <td className="py-12 px-16 text-sm">{t.required ? 'Wajib' : 'Opsional'}</td>
                    <td className="py-12 px-16"><button type="button" role="switch" aria-checked={t.isActive} aria-label={`Aktifkan ${t.title}`} className="cg-toggle" onClick={() => void toggleActive(t)} /></td>
                    <td className="py-12 px-16 text-right whitespace-nowrap">
                      <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Naikkan ${t.title}`} disabled={i === 0} onClick={() => void move(t, -1)}><ArrowUp className="cg-icon cg-icon--sm" aria-hidden /></button>
                      <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Turunkan ${t.title}`} disabled={i === rows.length - 1} onClick={() => void move(t, 1)}><ArrowDown className="cg-icon cg-icon--sm" aria-hidden /></button>
                      <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah ${t.title}`} onClick={() => setEditing(t)}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                      <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus ${t.title}`} onClick={() => void remove(t)}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-text-muted m-0">Daftar tugas berbeda per outlet. Perubahan berlaku mulai gerbang Tutup kasir berikutnya dan tugas baru ikut di baris hari ini. Tugas yang tidak mungkin dikerjakan boleh ditandai &quot;tidak bisa&quot; dengan alasan oleh karyawan (bila diizinkan) dan dianggap selesai.</p>

      {editing && activeOutlet && (
        <TaskDialog
          outletId={activeOutlet}
          phase={phase}
          task={editing === 'new' ? null : editing}
          nextSort={(rows[rows.length - 1]?.sort ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={(name) => { setEditing(null); setNotice(`Tugas "${name}" tersimpan.`); state.reload(); }}
        />
      )}
    </div>
  );
}

function TaskDialog({ outletId, phase, task, nextSort, onClose, onSaved }: { outletId: string; phase: TaskPhase; task: TaskTemplate | null; nextSort: number; onClose: () => void; onSaved: (name: string) => void }) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [title, setTitle] = useState(task?.title ?? '');
  const [ph, setPh] = useState<TaskPhase>(task?.phase ?? phase);
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? 'check');
  const [required, setRequired] = useState(task?.required ?? true);
  const [allowSkip, setAllowSkip] = useState(task?.allowSkip ?? true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const problem = taskTemplateProblem({ title, phase: ph, kind });
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr('');
    try {
      await data.saveTaskTemplate({ id: task?.id, outletId, phase: ph, title: title.trim(), kind, required, allowSkip, sort: task && task.phase === ph ? task.sort : nextSort, isActive: task?.isActive ?? true });
      onSaved(title.trim());
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan tugas.'); setSaving(false); }
  }

  return (
    <dialog {...dlg.props} aria-labelledby="tugas-title" className="cg-modal w-full">
      <form onSubmit={(e) => void submit(e)} className="space-y-16">
        <h2 id="tugas-title" className="cg-modal__title">{task ? 'Ubah tugas' : 'Tambah tugas'}</h2>
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
        <div className="cg-field">
          <label className="cg-label" htmlFor="tg-nama">Nama tugas</label>
          <input id="tg-nama" className="cg-input" required maxLength={120} autoFocus placeholder="Misal: Foto mesin espresso bersih" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} />
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="cg-field">
            <label className="cg-label" htmlFor="tg-fase">Fase</label>
            <select id="tg-fase" className="cg-input" value={ph} onChange={(e) => setPh(e.target.value as TaskPhase)}>{TASK_PHASES.map((p) => <option key={p} value={p}>{TASK_PHASE_LABEL[p]}</option>)}</select>
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="tg-jenis">Jenis penyelesaian</label>
            <select id="tg-jenis" className="cg-input" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
              <option value="check">{TASK_KIND_LABEL.check}</option><option value="photo">{TASK_KIND_LABEL.photo}</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-8 text-sm"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Wajib selesai sebelum Tutup kasir</label>
        <label className="flex items-center gap-8 text-sm"><input type="checkbox" checked={allowSkip} onChange={(e) => setAllowSkip(e.target.checked)} /> Boleh ditandai &quot;tidak bisa&quot; dengan alasan</label>
        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan tugas'}</button>
        </div>
      </form>
    </dialog>
  );
}

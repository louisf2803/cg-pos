'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, Plus, Trash2, Users } from 'lucide-react';
import { collectiveLeaveProblem, leaveQuotaRows, type CollectiveLeave } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { fmtDate, todayKey } from '@/components/fin-common';

export default function CutiBersamaPage() {
  const data = useData();
  const [year, setYear] = useState(() => Number(todayKey().slice(0, 4)));
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = useAsync(async () => {
    const [leaves, employees, rules, payroll] = await Promise.all([
      data.listCollectiveLeaves(), data.listCompensation(), data.getPayrollRules(), data.listPayrollYear(year),
    ]);
    return { leaves, employees, rules, payroll };
  }, [data, year]);

  const yearLeaves: CollectiveLeave[] = useMemo(
    () => (state.status === 'ready' ? state.data.leaves.filter((l) => l.date.startsWith(`${year}-`)) : []),
    [state, year],
  );
  const quotaRows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const abs: Record<string, number> = {};
    for (const r of state.data.payroll) abs[r.employeeId] = (abs[r.employeeId] ?? 0) + r.absenceCount;
    return leaveQuotaRows(state.data.employees, abs, yearLeaves.length, state.data.rules.absenceYearlyQuota);
  }, [state, yearLeaves.length]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = collectiveLeaveProblem({ date, description: desc });
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null); setNotice(null);
    try {
      await data.saveCollectiveLeave({ date, description: desc });
      setDate(''); setDesc(''); setNotice('Cuti bersama ditambahkan.');
      if (Number(date.slice(0, 4)) !== year) setYear(Number(date.slice(0, 4))); else state.reload();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menambah cuti bersama.'); }
    finally { setBusy(false); }
  }

  async function remove(l: CollectiveLeave) {
    setErr(null); setNotice(null);
    try { await data.deleteCollectiveLeave(l.id); setNotice('Cuti bersama dihapus.'); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menghapus.'); }
  }

  const quota = state.status === 'ready' ? state.data.rules.absenceYearlyQuota : 0;

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Cuti bersama"
        subtitle="Tanggal libur untuk seluruh karyawan. Setiap cuti bersama dipotongkan dari jatah absen tahunan dan tidak dihitung sebagai absen di payroll."
      />

      <div className="flex flex-wrap items-center gap-12">
        <div className="inline-flex items-stretch h-[36px] rounded-md border border-border overflow-hidden">
          <button type="button" className="w-[36px] flex items-center justify-center bg-surface-raised text-text-muted hover:text-text hover:bg-surface" aria-label="Tahun sebelumnya" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="cg-icon cg-icon--sm" aria-hidden /></button>
          <span className="px-16 flex items-center text-sm border-x border-border bg-surface-raised cg-num" aria-live="polite">{year}</span>
          <button type="button" className="w-[36px] flex items-center justify-center bg-surface-raised text-text-muted hover:text-text hover:bg-surface" aria-label="Tahun berikutnya" onClick={() => setYear((y) => y + 1)}><ChevronRight className="cg-icon cg-icon--sm" aria-hidden /></button>
        </div>
        <p className="text-sm text-text-muted m-0">Jatah absen tahunan per karyawan: <strong className="text-text cg-num">{quota}</strong> hari (aturan payroll)</p>
      </div>

      {notice && <div role="status" className="cg-banner cg-banner--success"><span>{notice}</span></div>}
      {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}

      <div className="grid grid-cols-1 laptop:grid-cols-3 gap-24 items-start">
        <form onSubmit={(e) => void add(e)} className="cg-card p-20 space-y-16 min-w-0" aria-labelledby="cuti-form-title">
          <h2 id="cuti-form-title" className="text-base font-bold m-0">Tambah cuti bersama</h2>
          <div className="cg-field">
            <label className="cg-label" htmlFor="cuti-tgl">Tanggal</label>
            <input id="cuti-tgl" type="date" className="cg-input" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="cuti-ket">Keterangan</label>
            <input id="cuti-ket" className="cg-input" required maxLength={120} placeholder="Misal: Cuti bersama Natal" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <button type="submit" className="cg-btn cg-btn--primary cg-btn--block" disabled={busy || !date || !desc.trim()}>
            <Plus className="cg-icon cg-icon--sm" aria-hidden /> {busy ? 'Menyimpan…' : 'Tambah'}
          </button>
        </form>

        <section className="cg-card laptop:col-span-2 overflow-hidden min-w-0" aria-labelledby="cuti-daftar-title">
          <div className="p-20 border-b border-border flex items-center justify-between gap-12">
            <h2 id="cuti-daftar-title" className="text-base font-bold m-0">Cuti bersama {year}</h2>
            <span className="cg-badge cg-badge--accent">{yearLeaves.length} hari</span>
          </div>
          {state.status === 'loading' ? (
            <div className="p-20 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>
          ) : yearLeaves.length === 0 ? (
            <div className="cg-empty p-32 text-center">
              <CalendarOff className="cg-icon cg-icon--lg mx-auto text-text-muted mb-8" aria-hidden />
              <p className="font-semibold m-0">Belum ada cuti bersama di {year}</p>
              <p className="text-sm text-text-muted m-0">Tambahkan tanggal libur nasional atau libur bersama usaha Anda.</p>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none" aria-label={`Daftar cuti bersama ${year}`}>
              {yearLeaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-12 px-20 py-12 border-b border-border last:border-0">
                  <span className="min-w-0">
                    <strong className="block text-sm">{fmtDate(l.date)}</strong>
                    <span className="block text-xs text-text-muted truncate">{l.description}</span>
                  </span>
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus cuti bersama ${fmtDate(l.date)}`} onClick={() => void remove(l)}>
                    <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="cg-card overflow-hidden" aria-labelledby="cuti-jatah-title">
        <div className="p-20 border-b border-border flex items-center gap-8">
          <Users className="cg-icon cg-icon--sm text-accent" aria-hidden />
          <h2 id="cuti-jatah-title" className="text-base font-bold m-0">Jatah absen tahunan per karyawan ({year})</h2>
        </div>
        {state.status === 'ready' && quotaRows.length === 0 ? (
          <p className="p-20 text-sm text-text-muted m-0">Belum ada karyawan dengan data kompensasi. Atur di Jadwal kerja dan kompensasi.</p>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className="cg-data w-full">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-semibold text-text-muted">
                  <th className="py-12 px-16 text-left">Karyawan</th>
                  <th className="py-12 px-16 text-right">Absen tercatat</th>
                  <th className="py-12 px-16 text-right">Cuti bersama</th>
                  <th className="py-12 px-16 text-right">Terpakai</th>
                  <th className="py-12 px-16 text-right">Sisa jatah</th>
                </tr>
              </thead>
              <tbody>
                {quotaRows.map((r) => (
                  <tr key={r.employeeId} className="border-b border-border last:border-0">
                    <td className="py-12 px-16 font-medium">{r.employeeName}</td>
                    <td className="py-12 px-16 text-right cg-num">{r.absences}</td>
                    <td className="py-12 px-16 text-right cg-num">{r.collective}</td>
                    <td className="py-12 px-16 text-right cg-num">{r.used} / {r.quota}</td>
                    <td className="py-12 px-16 text-right">
                      {r.over > 0 ? <span className="cg-badge cg-badge--danger">Lewat {r.over} hari</span> : <span className="cg-badge cg-badge--accent cg-num">{r.remaining} hari</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-20 py-12 text-xs text-text-muted m-0 border-t border-border">Absen tercatat diambil dari payroll yang sudah disimpan (draf atau terkunci) pada tahun ini. Hari lewat jatah dikenai denda absen di payroll.</p>
      </section>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { DataError, formatRp, groupGateByPhase, parseRp, TASK_KIND_LABEL, TASK_PHASE_LABEL, type ShiftReport } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useSession } from '../lib/session';
import { useAsync } from '../lib/use-async';
import { ApproverFields, useApprover } from '../lib/approver';
import { Modal } from '../ui';

export function CloseShift({ onCancel, onClosed }: { onCancel: () => void; onClosed: () => void }) {
  const data = useData();
  const { session, setShift } = useSession();
  // disimpan saat layar dibuka: setelah ditutup, sesi tidak lagi punya shift aktif tetapi laporan masih memakainya
  const [shift] = useState(() => session.shift!);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  // Gerbang tugas harian (opening/closing): tugas wajib yang belum selesai mengunci Tutup kasir; manajer boleh membuka paksa dengan PIN dan alasan.
  const gate = useAsync(() => data.taskGate(), [data]);
  const [forced, setForced] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [reason, setReason] = useState('');
  const [forceErr, setForceErr] = useState('');
  const [forceBusy, setForceBusy] = useState(false);
  const ap = useApprover('force_close_tasks');
  const pending = gate.status === 'ready' ? gate.data : [];
  const locked = pending.length > 0 && !forced;

  async function forceClose() {
    if (forceBusy) return;
    if (!reason.trim()) { setForceErr('Tulis alasan menutup kasir walau tugas belum selesai.'); return; }
    setForceBusy(true); setForceErr('');
    try {
      const by = await ap.authorize();
      if (!by) { setForceErr('PIN manajer salah atau tidak diizinkan.'); setForceBusy(false); return; }
      await data.logTaskGateOverride({ authorizedBy: by, reason: reason.trim(), pending: pending.length });
      setForced(true);
    } catch (x) { setForceErr(x instanceof Error ? x.message : 'Gagal mencatat buka paksa.'); }
    finally { setForceBusy(false); }
  }

  function ask(e: FormEvent) {
    e.preventDefault();
    if (!/\d/.test(raw)) { setErr('Hitung uang di laci lalu isi jumlahnya. Kalau kosong, isi 0.'); return; }
    setErr(''); setConfirming(true);
  }
  async function close() {
    setBusy(true); setPinErr('');
    try {
      // PIN karyawan yang sedang bertugas menyetujui penutupan
      if (!(await data.verifyPin(session.employee.id, pin))) { setPin(''); setPinErr('PIN salah.'); setBusy(false); return; }
      setReport(await data.closeShift({ shiftId: shift.id, counted: parseRp(raw), closedBy: session.employee.id })); setShift(null); setConfirming(false); }
    catch (x) { setConfirming(false); setErr(x instanceof DataError || x instanceof Error ? x.message : 'Gagal menutup kasir.'); }
    finally { setBusy(false); }
  }

  if (report) {
    const v = report.variance;
    return (
      <main className="min-h-full p-16 grid place-items-start justify-center">
        <div className="w-full max-w-[560px] grid gap-16">
          <header><h1 className="text-xl">Kasir ditutup</h1><p className="text-text-muted">{report.orderCount} pesanan lunas selama shift ini.</p></header>
          <div className={`cg-banner ${v === 0 ? 'cg-banner--info' : 'cg-banner--warning'}`} role="status">
            <span><strong>{v === 0 ? 'Uang laci pas' : v < 0 ? `Uang laci kurang ${formatRp(-v)}` : `Uang laci lebih ${formatRp(v)}`}</strong>
              Seharusnya {formatRp(report.expectedCash)}, dihitung {formatRp(report.counted)}.</span>
          </div>
          <div className="cg-totals border border-border rounded-lg bg-surface-raised">
            <div className="cg-totals__row"><span>Modal awal</span><span className="cg-num">{formatRp(shift.openingCash)}</span></div>
            <div className="cg-totals__row"><span>Penjualan tunai</span><span className="cg-num">{formatRp(report.cashSales)}</span></div>
            <div className="cg-totals__row"><span>Penjualan non-tunai</span><span className="cg-num">{formatRp(report.otherSales)}</span></div>
            {report.cashRefunds > 0 && <div className="cg-totals__row"><span>Refund tunai</span><span className="cg-num">-{formatRp(report.cashRefunds)}</span></div>}
            <div className="cg-totals__row cg-totals__row--grand"><span>Uang seharusnya di laci</span><span className="cg-num">{formatRp(report.expectedCash)}</span></div>
          </div>
          <section aria-labelledby="h-metode">
            <h2 id="h-metode" className="text-lg mb-8">Penerimaan per metode</h2>
            {report.byMethod.length === 0 ? <p className="text-text-muted">Belum ada pembayaran di shift ini.</p> : (
              <ul className="grid gap-4">{report.byMethod.map((m) => <li key={m.methodName} className="flex justify-between gap-12"><span>{m.methodName} <span className="text-text-muted">· {m.count}x</span></span><span className="cg-num">{formatRp(m.amount)}</span></li>)}</ul>
            )}
          </section>
          <section aria-labelledby="h-terjual">
            <h2 id="h-terjual" className="text-lg mb-8">Produk terjual</h2>
            {report.productsSold.length === 0 ? <p className="text-text-muted">Belum ada produk terjual di shift ini.</p> : (
              <ul className="grid gap-4">{report.productsSold.map((p) => <li key={p.productId} className="flex justify-between gap-12"><span className="break-words min-w-0">{p.name} <span className="text-text-muted">× {p.qty}</span></span><span className="cg-num">{formatRp(p.amount)}</span></li>)}</ul>
            )}
          </section>
          <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" autoFocus onClick={onClosed}>Selesai</button>
        </div>
      </main>
    );
  }

  if (gate.status === 'loading') return <main className="min-h-full grid place-items-center p-16" aria-busy="true"><div className="cg-skeleton" style={{ width: 260, height: 24 }} /></main>;

  if (locked) {
    const groups = groupGateByPhase(pending);
    return (
      <main className="min-h-full grid place-items-center p-16">
        <div className="w-full max-w-[560px] grid gap-16" data-testid="gerbang-tugas">
          <header>
            <h1 className="text-xl">Tutup kasir belum bisa</h1>
            <p className="text-text-muted">Tugas harian di aplikasi karyawan belum selesai: <strong>{pending.length}</strong> tugas wajib tersisa. Minta rekan satu tim menyelesaikannya; daftar ini ikut berubah setelah diperiksa ulang.</p>
          </header>
          {groups.map((g) => (
            <section key={g.phase} aria-label={`Tugas ${TASK_PHASE_LABEL[g.phase]}`} className="border border-border rounded-lg bg-surface-raised">
              <h2 className="text-base m-0 p-12 border-b border-border">{TASK_PHASE_LABEL[g.phase]}</h2>
              <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
                {g.items.map((i) => (
                  <li key={i.itemId} className="flex items-center justify-between gap-12 px-12 py-8 border-b border-border last:border-0">
                    <span className="break-words min-w-0">{i.title}</span>
                    <span className={`cg-badge ${i.kind === 'photo' ? 'cg-badge--info' : ''}`}>{i.kind === 'photo' ? 'Foto' : TASK_KIND_LABEL.check}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-text-muted text-sm">Tugas yang tidak mungkin dikerjakan boleh ditandai &quot;tidak bisa&quot; dengan alasan di aplikasi; itu dianggap selesai.</p>
          <div className="flex flex-wrap gap-8">
            <button type="button" className="cg-btn cg-btn--secondary" onClick={gate.reload}>Periksa lagi</button>
            <button type="button" className="cg-btn cg-btn--ghost" onClick={onCancel}>Kembali ke kasir</button>
            {!forcing && <button type="button" className="cg-btn cg-btn--ghost" onClick={() => setForcing(true)}>Buka paksa (PIN manajer)</button>}
          </div>
          {forcing && (
            <section aria-label="Buka paksa" className="grid gap-12 border border-border rounded-lg p-12 bg-surface">
              <div className="cg-field">
                <label className="cg-label" htmlFor="alasan-paksa">Alasan menutup kasir walau tugas belum selesai</label>
                <input id="alasan-paksa" className="cg-input" value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setForceErr(''); }} />
              </div>
              <ApproverFields a={ap} idPrefix="paksa" what="penutupan kasir dengan tugas belum selesai" />
              {forceErr && <p role="alert" className="cg-error">{forceErr}</p>}
              <div className="flex gap-8">
                <button type="button" className="cg-btn cg-btn--primary" disabled={forceBusy || ap.staffLoading || !ap.credentialReady} onClick={() => void forceClose()}>{forceBusy ? 'Memeriksa…' : 'Buka paksa'}</button>
                <button type="button" className="cg-btn cg-btn--ghost" onClick={() => { setForcing(false); setForceErr(''); }} disabled={forceBusy}>Batal</button>
              </div>
              <p className="text-text-muted text-xs">Kejadian ini dicatat di log aktivitas beserta nama manajer dan alasannya.</p>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full grid place-items-center p-16">
      <form onSubmit={ask} noValidate className="w-full max-w-[440px] grid gap-16">
        <header><h1 className="text-xl">Tutup kasir</h1><p className="text-text-muted">Hitung semua uang tunai di laci. Selisihnya baru ditampilkan setelah kamu menutup.</p></header>
        {gate.status === 'error' && <p className="cg-banner cg-banner--warning" role="status">Tugas harian belum bisa diperiksa (koneksi?). Tutup kasir tetap bisa; manajer melihat tugas yang belum selesai di laporan tugas.</p>}
        {forced && <p className="cg-banner cg-banner--info" role="status">Dibuka paksa oleh manajer dengan alasan: {reason}</p>}
        <div className="cg-field">
          <label className="cg-label" htmlFor="hitung">Uang tunai yang dihitung (Rp)</label>
          <input id="hitung" className="cg-input" inputMode="numeric" autoFocus value={raw} onChange={(e) => { setRaw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'e-hitung' : undefined} />
          {err && <p id="e-hitung" className="cg-error" role="alert">{err}</p>}
        </div>
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block">Tutup kasir</button>
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--block" onClick={onCancel}>Batal, kembali ke kasir</button>
      </form>
      {confirming && (
        <Modal title="Tutup kasir sekarang?" onClose={() => { setConfirming(false); setPin(''); setPinErr(''); }}>
          <p className="cg-modal__body">Setelah ditutup, shift ini tidak bisa dibuka lagi dan angkanya dikunci. Uang dihitung: {formatRp(parseRp(raw))}.</p>
          <div className="cg-field">
            <label className="cg-label" htmlFor="pin-tutup">PIN {session.employee.name}</label>
            <input id="pin-tutup" className="cg-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinErr(''); }} />
            <p role="alert" className="cg-error min-h-[20px]">{pinErr}</p>
          </div>
          <div className="cg-modal__actions">
            <button className="cg-btn cg-btn--ghost" data-autofocus onClick={() => setConfirming(false)} disabled={busy}>Batal</button>
            <button className="cg-btn cg-btn--primary" onClick={() => void close()} disabled={busy || pin.length !== 6}>{busy ? 'Menutup…' : 'Ya, tutup'}</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

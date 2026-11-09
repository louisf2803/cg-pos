import { useState, type FormEvent } from 'react';
import { DataError, formatRp, parseRp, type ShiftReport } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useSession } from '../lib/session';
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

  function ask(e: FormEvent) {
    e.preventDefault();
    if (!/\d/.test(raw)) { setErr('Hitung uang di laci lalu isi jumlahnya. Kalau kosong, isi 0.'); return; }
    setErr(''); setConfirming(true);
  }
  async function close() {
    setBusy(true);
    try { setReport(await data.closeShift({ shiftId: shift.id, counted: parseRp(raw), closedBy: session.employee.id })); setShift(null); setConfirming(false); }
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
            <div className="cg-totals__row cg-totals__row--grand"><span>Uang seharusnya di laci</span><span className="cg-num">{formatRp(report.expectedCash)}</span></div>
          </div>
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

  return (
    <main className="min-h-full grid place-items-center p-16">
      <form onSubmit={ask} noValidate className="w-full max-w-[440px] grid gap-16">
        <header><h1 className="text-xl">Tutup kasir</h1><p className="text-text-muted">Hitung semua uang tunai di laci. Selisihnya baru ditampilkan setelah kamu menutup.</p></header>
        <div className="cg-field">
          <label className="cg-label" htmlFor="hitung">Uang tunai yang dihitung (Rp)</label>
          <input id="hitung" className="cg-input" inputMode="numeric" autoFocus value={raw} onChange={(e) => { setRaw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'e-hitung' : undefined} />
          {err && <p id="e-hitung" className="cg-error" role="alert">{err}</p>}
        </div>
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block">Tutup kasir</button>
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--block" onClick={onCancel}>Batal, kembali ke kasir</button>
      </form>
      {confirming && (
        <Modal title="Tutup kasir sekarang?" onClose={() => setConfirming(false)}>
          <p className="cg-modal__body">Setelah ditutup, shift ini tidak bisa dibuka lagi dan angkanya dikunci. Uang dihitung: {formatRp(parseRp(raw))}.</p>
          <div className="cg-modal__actions">
            <button className="cg-btn cg-btn--ghost" data-autofocus onClick={() => setConfirming(false)} disabled={busy}>Batal</button>
            <button className="cg-btn cg-btn--primary" onClick={() => void close()} disabled={busy}>{busy ? 'Menutup…' : 'Ya, tutup'}</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

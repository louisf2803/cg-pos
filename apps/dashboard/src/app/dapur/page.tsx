'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChefHat, Settings2 } from 'lucide-react';
import {
  DEFAULT_KITCHEN_THRESHOLDS, kitchenAlert, KITCHEN_NEXT, KITCHEN_NEXT_LABEL, KITCHEN_STATUS_LABEL, orderTypeLabel, thresholdsProblem, waitMinutes,
  type KitchenRow, type KitchenStatus, type KitchenThresholds, type KitchenTicket,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const LANES: KitchenStatus[] = ['new', 'preparing', 'ready'];
const KEY = 'cgpos.kds.thresholds';
function loadThresholds(): KitchenThresholds {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) { const t = JSON.parse(raw) as KitchenThresholds; if (!thresholdsProblem(t)) return t; }
  } catch { /* abaikan */ }
  return DEFAULT_KITCHEN_THRESHOLDS;
}

export default function KitchenPage() {
  const data = useData();
  const [history, setHistory] = useState(false);
  const board = useAsync(() => data.kitchenBoard(history ? 60 : 0), [data, history]);
  const [now, setNow] = useState(() => new Date());
  const [th, setTh] = useState<KitchenThresholds>(DEFAULT_KITCHEN_THRESHOLDS);
  const [settings, setSettings] = useState(false);
  const [lane, setLane] = useState<KitchenStatus>('new');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reloadRef = useRef(board.reload);
  reloadRef.current = board.reload;
  useEffect(() => setTh(loadThresholds()), []);
  useEffect(() => {
    const t = window.setInterval(() => { setNow(new Date()); reloadRef.current(); }, 10000);
    return () => window.clearInterval(t);
  }, []);
  const tickets = board.status === 'ready' ? board.data : [];
  const inLane = (l: KitchenStatus) => tickets.filter((t) => t.lane === l);
  const served = tickets.filter((t) => t.lane === 'served');

  const advance = useCallback(async (ids: string[], to: KitchenStatus) => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await data.kitchenSetStatus(ids, to); reloadRef.current(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Status gagal diubah.'); }
    finally { setBusy(false); }
  }, [data, busy]);

  return (
    <>
      <PageHeader title="Layar dapur" subtitle="Pesanan yang dikirim kasir muncul di sini. Layar menyegarkan diri tiap 10 detik."
        actions={<button className="cg-btn cg-btn--secondary" onClick={() => setSettings(true)}><Settings2 className="cg-icon" aria-hidden /> Batas waktu</button>} />
      {err && <p role="alert" className="cg-banner cg-banner--danger mb-12">{err}</p>}
      {board.status === 'error' && <ErrorBox message={board.message} onRetry={board.reload} />}
      {board.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 120 }} />)}</div>}
      {board.status === 'ready' && (
        <>
          <div className="flex flex-wrap gap-8 mb-12 items-center">
            <div className="flex flex-wrap gap-8 kds-lanes" role="group" aria-label="Tahap">
              {LANES.map((l) => <button key={l} className="cg-chip" aria-pressed={lane === l} onClick={() => setLane(l)}>{KITCHEN_STATUS_LABEL[l]} ({inLane(l).length})</button>)}
            </div>
            <label className="flex items-center gap-8 ml-auto"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Tampilkan yang disajikan (60 menit)</label>
          </div>
          {tickets.filter((t) => t.lane !== 'served').length === 0 && !history ? (
            <div className="cg-empty"><ChefHat className="cg-icon" aria-hidden /><p><strong>Belum ada pesanan di dapur.</strong></p><p className="text-text-muted">Kasir mengirim pesanan lewat tombol Kirim ke dapur.</p></div>
          ) : (
            <div className="kds-board">
              {LANES.map((l) => (
                <section key={l} className={`kds-col ${lane === l ? 'kds-col--on' : ''}`} aria-label={KITCHEN_STATUS_LABEL[l]}>
                  <h2 className="text-base mb-8">{KITCHEN_STATUS_LABEL[l]} <span className="text-text-muted">({inLane(l).length})</span></h2>
                  <div className="grid gap-8">
                    {inLane(l).length === 0 && <p className="text-text-muted text-sm">Kosong.</p>}
                    {inLane(l).map((t) => <Ticket key={t.orderId} t={t} now={now} th={th} busy={busy} onAdvance={advance} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
          {history && served.length > 0 && (
            <section className="mt-16" aria-label="Disajikan"><h2 className="text-base mb-8">Disajikan <span className="text-text-muted">({served.length})</span></h2>
              <div className="grid gap-8 kds-served">{served.map((t) => <Ticket key={t.orderId} t={t} now={now} th={th} busy={busy} onAdvance={advance} />)}</div></section>
          )}
        </>
      )}
      {settings && <ThresholdDialog value={th} onClose={() => setSettings(false)} onSave={(v) => { setTh(v); try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* abaikan */ } setSettings(false); }} />}
    </>
  );
}

const ALERT_CLASS = { ok: '', warn: 'cg-badge--warning', late: 'cg-badge--danger' } as const;

function Ticket({ t, now, th, busy, onAdvance }: { t: KitchenTicket; now: Date; th: KitchenThresholds; busy: boolean; onAdvance: (ids: string[], to: KitchenStatus) => void }) {
  const mins = waitMinutes(t.sentAt, now);
  const alert = t.lane === 'served' ? 'ok' : kitchenAlert(mins, th);
  const where = t.tableName ? `Meja ${t.tableName}` : t.label || orderTypeLabel(t.orderType);
  const next = KITCHEN_NEXT[t.lane];
  const current = t.items.filter((i) => i.status === t.lane);
  return (
    <article className={`kds-ticket kds-ticket--${alert}`} aria-label={`Pesanan ${t.orderNumber}`}>
      <header className="flex flex-wrap items-center gap-8">
        <strong className="break-words">{where}</strong>
        <span className="text-sm text-text-muted break-all">{t.orderNumber}</span>
        <span className={`cg-badge ml-auto ${ALERT_CLASS[alert]}`} data-testid={`wait-${t.orderNumber}`}>{mins} menit{alert === 'late' ? ' · terlambat' : ''}</span>
      </header>
      <p className="text-sm text-text-muted">{orderTypeLabel(t.orderType)}{t.guestCount ? ` · ${t.guestCount} tamu` : ''}{t.queueNo ? ` · antrean ${t.queueNo}` : ''}</p>
      <ul className="grid gap-4 mt-8">
        {t.items.map((i) => <ItemRow key={i.itemId} i={i} busy={busy} onAdvance={onAdvance} />)}
      </ul>
      {next && <button className="cg-btn cg-btn--primary mt-8" disabled={busy} onClick={() => onAdvance(current.map((i) => i.itemId), next)}>{KITCHEN_NEXT_LABEL[t.lane]} ({current.length})</button>}
      {t.lane === 'served' && <button className="cg-btn cg-btn--ghost mt-8" disabled={busy} onClick={() => onAdvance(t.items.map((i) => i.itemId), 'ready')}>Kembalikan ke Siap</button>}
    </article>
  );
}

function ItemRow({ i, busy, onAdvance }: { i: KitchenRow; busy: boolean; onAdvance: (ids: string[], to: KitchenStatus) => void }) {
  const next = KITCHEN_NEXT[i.status];
  return (
    <li className="flex items-start gap-8">
      <span className="cg-num"><strong>{i.qty}×</strong></span>
      <span className="grow min-w-0 break-words">{i.name}
        {i.extras.map((e) => <span key={e.name} className="block text-sm text-text-muted">+ {e.name}</span>)}
        {i.note && <span className="block text-sm"><strong>Catatan:</strong> {i.note}</span>}
      </span>
      <span className="cg-badge">{KITCHEN_STATUS_LABEL[i.status]}</span>
      {next && <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={busy} onClick={() => onAdvance([i.itemId], next)} aria-label={`${KITCHEN_NEXT_LABEL[i.status]}: ${i.name}`}><Check className="cg-icon" aria-hidden /></button>}
    </li>
  );
}

function ThresholdDialog({ value, onClose, onSave }: { value: KitchenThresholds; onClose: () => void; onSave: (v: KitchenThresholds) => void }) {
  const d = useDialog(onClose);
  const [warn, setWarn] = useState(String(value.warnMin));
  const [late, setLate] = useState(String(value.lateMin));
  const [err, setErr] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = { warnMin: Number(warn), lateMin: Number(late) };
    const p = thresholdsProblem(v);
    if (p) return setErr(p);
    onSave(v);
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-batas" style={{ margin: 'auto', maxWidth: 'min(420px, calc(100vw - 16px))' }}>
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-batas" className="cg-modal__title">Batas waktu tiket</h2>
        <p className="text-sm text-text-muted">Tiket berubah kuning setelah menunggu sekian menit, dan merah (terlambat) setelah batas kedua. Tersimpan di peramban layar ini.</p>
        <div className="cg-field"><label className="cg-label" htmlFor="kd-warn">Peringatan (menit)</label><input id="kd-warn" className="cg-input cg-num" inputMode="numeric" value={warn} onChange={(e) => { setWarn(e.target.value.replace(/\D/g, '')); setErr(''); }} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="kd-late">Terlambat (menit)</label><input id="kd-late" className="cg-input cg-num" inputMode="numeric" value={late} onChange={(e) => { setLate(e.target.value.replace(/\D/g, '')); setErr(''); }} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button><button type="submit" className="cg-btn cg-btn--primary">Simpan</button></div>
      </form>
    </dialog>
  );
}

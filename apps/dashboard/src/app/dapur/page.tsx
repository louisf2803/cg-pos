'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ChefHat, Maximize, Minimize, Printer, Settings2, Volume2, VolumeX, Warehouse } from 'lucide-react';
import {
  DEFAULT_KITCHEN_THRESHOLDS, filterRowsByStation, groupTickets, kitchenAlert, KITCHEN_NEXT, KITCHEN_NEXT_LABEL, KITCHEN_STATUS_LABEL, orderTypeLabel, thresholdsProblem, waitMinutes,
  type KitchenRow, type KitchenStatus, type KitchenThresholds, type KitchenTicket, type PrintStation,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { WarehouseScreen } from '@/components/warehouse-screen';

const LANES: KitchenStatus[] = ['new', 'preparing', 'ready'];
const THRESHOLDS_KEY = 'cgpos.kds.thresholds';
const SOUND_KEY = 'cgpos.kds.sound';
const STATION_KEY = 'cgpos.kds.station';

function loadThresholds(): KitchenThresholds {
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_KEY);
    if (raw) { const t = JSON.parse(raw) as KitchenThresholds; if (!thresholdsProblem(t)) return t; }
  } catch { /* abaikan */ }
  return DEFAULT_KITCHEN_THRESHOLDS;
}

function loadSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadStationPref(): string {
  try {
    return window.localStorage.getItem(STATION_KEY) || 'all';
  } catch {
    return 'all';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m));
}

/** Nada bip sopan 2 ketukan menggunakan Web Audio API tanpa berkas audio eksternal */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Ketukan 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.14);

    // Ketukan 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.16, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.32);
  } catch {
    // Abaikan jika autoplay dicegah oleh peramban
  }
}

function printKitchenTicket(t: KitchenTicket, paper: '58' | '80' = '80') {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const widthMm = paper === '58' ? '48mm' : '72mm';
  const fontSize = paper === '58' ? '11px' : '12px';
  const where = t.tableName ? `Meja ${t.tableName}` : (t.label || orderTypeLabel(t.orderType));

  const itemsHtml = t.items.map((i) => `
    <div style="margin-bottom: 6px;">
      <div style="font-weight: bold;">${i.qty}× ${escapeHtml(i.name)}</div>
      ${i.extras.map((e) => `<div style="padding-left: 8px; color: #555;">+ ${escapeHtml(e.name)}</div>`).join('')}
      ${i.note ? `<div style="padding-left: 8px; font-style: italic;"><strong>Catatan:</strong> ${escapeHtml(i.note)}</div>` : ''}
    </div>
  `).join('');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Struk Dapur ${escapeHtml(t.orderNumber)}</title>
        <style>
          @page { margin: 0; }
          body {
            font-family: ui-monospace, 'Courier New', monospace;
            font-size: ${fontSize};
            line-height: 1.35;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 8px;
            width: ${widthMm};
            box-sizing: border-box;
          }
          hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 1.15em;">TIKET DAPUR</div>
        <div class="center">${escapeHtml(t.orderNumber)}</div>
        <hr />
        <div><strong style="font-size: 1.1em;">${escapeHtml(where)}</strong></div>
        <div>${escapeHtml(orderTypeLabel(t.orderType))}${t.queueNo ? ` · Antrean ${t.queueNo}` : ''}${t.guestCount ? ` · ${t.guestCount} tamu` : ''}</div>
        <div style="color: #444;">Waktu: ${new Date(t.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
        <hr />
        ${itemsHtml}
        <hr />
        <div class="center" style="font-size: 0.9em; color: #666;">*** CG POS DAPUR ***</div>
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
}

export default function KitchenPage() {
  const data = useData();
  const [screenTab, setScreenTab] = useState<'dapur' | 'gudang'>('dapur');
  const [history, setHistory] = useState(false);
  const board = useAsync(() => data.kitchenBoard(history ? 60 : 0), [data, history]);
  const stationsState = useAsync(() => data.listPrintStations(), [data]);
  const [now, setNow] = useState(() => new Date());
  const [th, setTh] = useState<KitchenThresholds>(DEFAULT_KITCHEN_THRESHOLDS);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [printTicket, setPrintTicket] = useState<KitchenTicket | null>(null);
  const [lane, setLane] = useState<KitchenStatus>('new');
  const [selectedStationId, setSelectedStationId] = useState<string>(loadStationPref);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reloadRef = useRef(board.reload);
  reloadRef.current = board.reload;
  const prevTicketIdsRef = useRef<Set<string> | null>(null);

  const stations: PrintStation[] = stationsState.status === 'ready' ? stationsState.data : [];
  const activeStations = useMemo(() => stations.filter((s) => s.isActive), [stations]);
  const stationMap = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  const handleSelectStation = (id: string) => {
    setSelectedStationId(id);
    try {
      window.localStorage.setItem(STATION_KEY, id);
    } catch {
      /* abaikan */
    }
  };

  // Jika stasiun yang diingat tidak ada dalam stasiun aktif, gunakan 'all'
  const effectiveStationId = useMemo(() => {
    if (selectedStationId === 'all') return 'all';
    if (activeStations.length > 0 && !activeStations.some((s) => s.id === selectedStationId)) {
      return 'all';
    }
    return selectedStationId;
  }, [selectedStationId, activeStations]);

  useEffect(() => {
    setTh(loadThresholds());
    setSoundEnabled(loadSoundPref());
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Polling data dapur tiap 10 detik
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(new Date());
      reloadRef.current();
    }, 10000);
    return () => window.clearInterval(t);
  }, []);

  // Bunyikan nada bila ada pesanan baru tiba saat polling
  const boardData = board.status === 'ready' ? board.data : null;
  useEffect(() => {
    if (!boardData) return;
    const currentNewTicketIds = new Set(
      boardData.filter((t) => t.lane === 'new').map((t) => t.orderId)
    );

    if (prevTicketIdsRef.current !== null && soundEnabled) {
      let hasNew = false;
      for (const id of currentNewTicketIds) {
        if (!prevTicketIdsRef.current.has(id)) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) {
        playChime();
      }
    }

    prevTicketIdsRef.current = currentNewTicketIds;
  }, [boardData, soundEnabled]);

  const rawTickets = board.status === 'ready' ? board.data : [];
  const allRows = useMemo(() => rawTickets.flatMap((t) => t.items), [rawTickets]);

  // Hitung jumlah tiket belum selesai untuk tiap chip stasiun
  const allUnfinishedCount = useMemo(
    () => rawTickets.filter((t) => t.lane !== 'served').length,
    [rawTickets]
  );

  const unfinishedStationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of activeStations) {
      const stRows = filterRowsByStation(allRows, st.id);
      const stTickets = groupTickets(stRows);
      counts.set(st.id, stTickets.filter((t) => t.lane !== 'served').length);
    }
    return counts;
  }, [allRows, activeStations]);

  // Tiket yang tampil sesuai filter stasiun (menyaring baris, tiket tanpa baris disembunyikan)
  const tickets = useMemo(() => {
    if (effectiveStationId === 'all' || activeStations.length === 0) {
      return rawTickets;
    }
    const filteredRows = filterRowsByStation(allRows, effectiveStationId);
    return groupTickets(filteredRows);
  }, [rawTickets, allRows, effectiveStationId, activeStations]);

  const inLane = (l: KitchenStatus) => tickets.filter((t) => t.lane === l);
  const served = tickets.filter((t) => t.lane === 'served');

  const advance = useCallback(async (ids: string[], to: KitchenStatus) => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await data.kitchenSetStatus(ids, to); reloadRef.current(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Status gagal diubah.'); }
    finally { setBusy(false); }
  }, [data, busy]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setErr('Peramban membatasi layar penuh otomatis. Tekan tombol F11 pada keyboard untuk layar penuh.');
    }
  };

  return (
    <>
      <PageHeader
        title={screenTab === 'gudang' ? 'Layar gudang & dapur' : 'Layar dapur'}
        subtitle={
          screenTab === 'gudang'
            ? 'Pantau bahan baku dan stok barang yang menipis atau habis agar restok segera dilakukan.'
            : 'Pesanan yang dikirim kasir muncul di sini. Layar menyegarkan diri tiap 10 detik.'
        }
        actions={
          screenTab === 'dapur' ? (
            <div className="flex flex-wrap items-center gap-8">
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
              >
                {isFullscreen ? <Minimize className="cg-icon" aria-hidden /> : <Maximize className="cg-icon" aria-hidden />}
                <span>{isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}</span>
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                onClick={() => setSettings(true)}
              >
                <Settings2 className="cg-icon" aria-hidden /> Batas waktu
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="cg-tabs w-fit mb-16" role="tablist" aria-label="Mode layar operasional">
        <button
          type="button"
          role="tab"
          aria-selected={screenTab === 'dapur'}
          className={screenTab === 'dapur' ? 'cg-tab cg-tab--active' : 'cg-tab'}
          onClick={() => setScreenTab('dapur')}
        >
          <ChefHat className="cg-icon" aria-hidden /> Layar Dapur
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={screenTab === 'gudang'}
          className={screenTab === 'gudang' ? 'cg-tab cg-tab--active' : 'cg-tab'}
          onClick={() => setScreenTab('gudang')}
        >
          <Warehouse className="cg-icon" aria-hidden /> Layar Gudang
        </button>
      </div>

      {screenTab === 'gudang' ? <WarehouseScreen /> : (
        <>
      {err && <p role="alert" className="cg-banner cg-banner--danger mb-12">{err}</p>}
      {board.status === 'error' && <ErrorBox message={board.message} onRetry={board.reload} />}
      {board.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 120 }} />)}</div>}

      {board.status === 'ready' && (
        <>
          {activeStations.length > 0 && (
            <div className="flex flex-wrap items-center gap-8 mb-12" role="group" aria-label="Filter Stasiun">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide mr-4">Stasiun:</span>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={effectiveStationId === 'all'}
                onClick={() => handleSelectStation('all')}
              >
                Semua ({allUnfinishedCount})
              </button>
              {activeStations.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className="cg-chip"
                  aria-pressed={effectiveStationId === st.id}
                  onClick={() => handleSelectStation(st.id)}
                >
                  {st.name} ({unfinishedStationCounts.get(st.id) ?? 0})
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-12 mb-12 items-center">
            <div className="flex flex-wrap gap-8 kds-lanes" role="group" aria-label="Tahap">
              {LANES.map((l) => (
                <button
                  key={l}
                  className="cg-chip"
                  aria-pressed={lane === l}
                  onClick={() => setLane(l)}
                >
                  {KITCHEN_STATUS_LABEL[l]} ({inLane(l).length})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-16 ml-auto">
              <label className="flex items-center gap-8 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setSoundEnabled(enabled);
                    try {
                      window.localStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false');
                    } catch { /* abaikan */ }
                    if (enabled) playChime();
                  }}
                />
                <span className="flex items-center gap-4">
                  {soundEnabled ? <Volume2 className="w-16 h-16 text-accent" aria-hidden /> : <VolumeX className="w-16 h-16 text-text-muted" aria-hidden />}
                  <span>Bunyi pesanan baru</span>
                </span>
              </label>

              <label className="flex items-center gap-8 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={history}
                  onChange={(e) => setHistory(e.target.checked)}
                />
                <span>Tampilkan yang disajikan (60 mnt)</span>
              </label>
            </div>
          </div>

          {tickets.filter((t) => t.lane !== 'served').length === 0 && !history ? (
            <div className="cg-empty">
              <ChefHat className="cg-icon" aria-hidden />
              <p>
                <strong>
                  {effectiveStationId !== 'all'
                    ? `Belum ada pesanan di stasiun ${stationMap.get(effectiveStationId) || ''}.`
                    : 'Belum ada pesanan di dapur.'}
                </strong>
              </p>
              <p className="text-text-muted">Kasir mengirim pesanan lewat tombol Kirim ke dapur.</p>
            </div>
          ) : (
            <div className="kds-board">
              {LANES.map((l) => (
                <section key={l} className={`kds-col ${lane === l ? 'kds-col--on' : ''}`} aria-label={KITCHEN_STATUS_LABEL[l]}>
                  <h2 className="text-base mb-8">{KITCHEN_STATUS_LABEL[l]} <span className="text-text-muted">({inLane(l).length})</span></h2>
                  <div className="grid gap-8">
                    {inLane(l).length === 0 && <p className="text-text-muted text-sm">Kosong.</p>}
                    {inLane(l).map((t) => (
                      <Ticket
                        key={t.orderId}
                        t={t}
                        now={now}
                        th={th}
                        busy={busy}
                        onAdvance={advance}
                        onPrint={(ticket) => setPrintTicket(ticket)}
                        showStationBadge={effectiveStationId === 'all' && activeStations.length > 0}
                        stationMap={stationMap}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {history && served.length > 0 && (
            <section className="mt-16" aria-label="Disajikan">
              <h2 className="text-base mb-8">Disajikan <span className="text-text-muted">({served.length})</span></h2>
              <div className="grid gap-8 kds-served">
                {served.map((t) => (
                  <Ticket
                    key={t.orderId}
                    t={t}
                    now={now}
                    th={th}
                    busy={busy}
                    onAdvance={advance}
                    onPrint={(ticket) => setPrintTicket(ticket)}
                    showStationBadge={effectiveStationId === 'all' && activeStations.length > 0}
                    stationMap={stationMap}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {settings && (
        <ThresholdDialog
          value={th}
          onClose={() => setSettings(false)}
          onSave={(v) => {
            setTh(v);
            try { window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(v)); } catch { /* abaikan */ }
            setSettings(false);
          }}
        />
      )}

      {printTicket && (
        <KitchenPrintDialog
          ticket={printTicket}
          onClose={() => setPrintTicket(null)}
        />
      )}
        </>
      )}
    </>
  );
}

const ALERT_CLASS = { ok: '', warn: 'cg-badge--warning', late: 'cg-badge--danger' } as const;

function Ticket({
  t,
  now,
  th,
  busy,
  onAdvance,
  onPrint,
  showStationBadge,
  stationMap,
}: {
  t: KitchenTicket;
  now: Date;
  th: KitchenThresholds;
  busy: boolean;
  onAdvance: (ids: string[], to: KitchenStatus) => void;
  onPrint: (ticket: KitchenTicket) => void;
  showStationBadge?: boolean;
  stationMap?: Map<string, string>;
}) {
  const mins = waitMinutes(t.sentAt, now);
  const alert = t.lane === 'served' ? 'ok' : kitchenAlert(mins, th);
  const where = t.tableName ? `Meja ${t.tableName}` : t.label || orderTypeLabel(t.orderType);
  const next = KITCHEN_NEXT[t.lane];
  const current = t.items.filter((i) => i.status === t.lane);

  const stationNames = useMemo(() => {
    if (!showStationBadge || !stationMap) return [];
    const names = new Set<string>();
    for (const item of t.items) {
      if (item.stationId) {
        const name = stationMap.get(item.stationId);
        if (name) names.add(name);
      }
    }
    return Array.from(names);
  }, [t.items, showStationBadge, stationMap]);

  return (
    <article className={`kds-ticket kds-ticket--${alert}`} aria-label={`Pesanan ${t.orderNumber}`}>
      <header className="flex flex-wrap items-center gap-8">
        <strong className="break-words">{where}</strong>
        <span className="text-sm text-text-muted break-all">{t.orderNumber}</span>
        {showStationBadge && (
          <div className="flex flex-wrap items-center gap-4">
            {stationNames.length > 0 ? (
              stationNames.map((name) => (
                <span key={name} className="cg-badge cg-badge--info text-xs" data-testid={`station-badge-${name}`}>
                  {name}
                </span>
              ))
            ) : (
              <span className="cg-badge text-text-muted text-xs">Tanpa stasiun</span>
            )}
          </div>
        )}
        <span className={`cg-badge ml-auto ${ALERT_CLASS[alert]}`} data-testid={`wait-${t.orderNumber}`}>
          {mins} menit{alert === 'late' ? ' · terlambat' : ''}
        </span>
      </header>
      <p className="text-sm text-text-muted">
        {orderTypeLabel(t.orderType)}{t.guestCount ? ` · ${t.guestCount} tamu` : ''}{t.queueNo ? ` · antrean ${t.queueNo}` : ''}
      </p>
      {t.label && (
        <p className="text-xs text-accent font-semibold mt-4">
          Catatan pesanan: {t.label}
        </p>
      )}
      <ul className="grid gap-4 mt-8">
        {t.items.map((i) => (
          <ItemRow
            key={i.itemId}
            i={i}
            busy={busy}
            onAdvance={onAdvance}
            stationName={showStationBadge && i.stationId ? stationMap?.get(i.stationId) : undefined}
          />
        ))}
      </ul>
      <div className="flex items-center gap-8 mt-8 flex-wrap">
        {next && (
          <button
            className="cg-btn cg-btn--primary"
            disabled={busy}
            onClick={() => onAdvance(current.map((i) => i.itemId), next)}
          >
            {KITCHEN_NEXT_LABEL[t.lane]} ({current.length})
          </button>
        )}
        {t.lane === 'served' && (
          <button
            className="cg-btn cg-btn--ghost"
            disabled={busy}
            onClick={() => onAdvance(t.items.map((i) => i.itemId), 'ready')}
          >
            Kembalikan ke Siap
          </button>
        )}
        <button
          type="button"
          className="cg-btn cg-btn--secondary cg-btn--sm flex items-center gap-4 ml-auto"
          onClick={() => onPrint(t)}
          aria-label={`Cetak struk dapur pesanan ${t.orderNumber}`}
        >
          <Printer className="cg-icon cg-icon--sm" aria-hidden />
          <span>Cetak struk</span>
        </button>
      </div>
    </article>
  );
}

function ItemRow({
  i,
  busy,
  onAdvance,
  stationName,
}: {
  i: KitchenRow;
  busy: boolean;
  onAdvance: (ids: string[], to: KitchenStatus) => void;
  stationName?: string;
}) {
  const next = KITCHEN_NEXT[i.status];
  return (
    <li className="flex items-start gap-8">
      <span className="cg-num"><strong>{i.qty}×</strong></span>
      <span className="grow min-w-0 break-words">{i.name}
        {stationName && <span className="text-xs text-text-muted ml-[6px]">({stationName})</span>}
        {i.extras.map((e) => <span key={e.name} className="block text-sm text-text-muted">+ {e.name}</span>)}
        {i.note && (
          <span className="block text-xs font-semibold text-accent mt-4 bg-accent/10 px-8 py-4 rounded">
            Catatan: {i.note}
          </span>
        )}
      </span>
      <span className="cg-badge">{KITCHEN_STATUS_LABEL[i.status]}</span>
      {next && (
        <button
          className="cg-btn cg-btn--ghost cg-btn--sm"
          disabled={busy}
          onClick={() => onAdvance([i.itemId], next)}
          aria-label={`${KITCHEN_NEXT_LABEL[i.status]}: ${i.name}`}
        >
          <Check className="cg-icon" aria-hidden />
        </button>
      )}
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

function KitchenPrintDialog({
  ticket,
  onClose,
}: {
  ticket: KitchenTicket;
  onClose: () => void;
}) {
  const d = useDialog(onClose);
  const [paper, setPaper] = useState<'58' | '80'>('80');
  const where = ticket.tableName ? `Meja ${ticket.tableName}` : ticket.label || orderTypeLabel(ticket.orderType);

  const handlePrint = () => {
    printKitchenTicket(ticket, paper);
  };

  return (
    <dialog {...d.props} aria-labelledby="judul-cetak-dapur" style={{ margin: 'auto', maxWidth: 'min(440px, calc(100vw - 16px))' }}>
      <div className="grid gap-16">
        <div className="flex items-center justify-between">
          <h2 id="judul-cetak-dapur" className="cg-modal__title">Cetak struk dapur</h2>
          <div className="flex gap-4">
            <button
              type="button"
              className="cg-chip"
              aria-pressed={paper === '58'}
              onClick={() => setPaper('58')}
            >
              58 mm
            </button>
            <button
              type="button"
              className="cg-chip"
              aria-pressed={paper === '80'}
              onClick={() => setPaper('80')}
            >
              80 mm
            </button>
          </div>
        </div>

        {/* Preview tiket dapur (tanpa harga / info pembayaran) */}
        <div
          className="p-12 border border-border rounded-md bg-surface"
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: paper === '58' ? 12 : 13,
            lineHeight: 1.4,
            maxWidth: paper === '58' ? '240px' : '320px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div className="text-center font-bold pb-4 border-b border-dashed border-border">
            <div>STRUK DAPUR</div>
            <div className="text-xs text-text-muted">{ticket.orderNumber}</div>
          </div>
          <div className="py-8 border-b border-dashed border-border text-xs">
            <div><strong>{where}</strong></div>
            <div>{orderTypeLabel(ticket.orderType)}{ticket.queueNo ? ` · Antrean ${ticket.queueNo}` : ''}{ticket.guestCount ? ` · ${ticket.guestCount} tamu` : ''}</div>
            <div className="text-text-muted">Kirim: {new Date(ticket.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <ul className="py-8 border-b border-dashed border-border grid gap-6 text-xs">
            {ticket.items.map((i) => (
              <li key={i.itemId}>
                <div><strong>{i.qty}× {i.name}</strong></div>
                {i.extras.map((e) => <div key={e.name} className="pl-8 text-text-muted">+ {e.name}</div>)}
                {i.note && <div className="pl-8 italic"><strong>Catatan:</strong> {i.note}</div>}
              </li>
            ))}
          </ul>
          <div className="text-center text-[10px] text-text-muted pt-4">*** TIKET DAPUR ***</div>
        </div>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--primary flex items-center gap-6" onClick={handlePrint}>
            <Printer className="cg-icon cg-icon--sm" aria-hidden /> Cetak ({paper} mm)
          </button>
        </div>
      </div>
    </dialog>
  );
}

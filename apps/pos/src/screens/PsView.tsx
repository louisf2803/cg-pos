import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PS_WEEKDAY_LABEL, blockHours, bookingWhatsAppLink, dayRangeUtc, fillBookingMessage, formatPsDuration, formatRp, freeUntil, localClock, overlapsBlocks, packageApplies, priceForChoice, psGroupPricing, stationForGroup, NO_PS_GROUP_PRICING, type PsGroupPricing,
  priceForDuration, psBlocks, sessionSchedule, timelineHours, zonedTime, type OutletContext, type PsBlock, type PsChoice, type PsPackage, type PsSettings, type PsStation,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';
import {
  addBooking, boardInfo, cancelBooking, extendSession, finishSession, markBookingPaid, pruneState, sortedPackages, startSession, useNow, usePsState, usePsSync,
  type PsBoardInfo, type PsBoardState, type PsBooking, type PsState,
} from '../lib/ps-store';

const QUICK_MINUTES = [30, 60, 90, 120, 180] as const;
const STATE_LABEL: Record<PsBoardState, string> = { kosong: 'Kosong', aktif: 'Aktif', 'menit-terakhir': 'Hampir habis', lewat: 'Lewat waktu', booking: 'Booking', perawatan: 'Perawatan' };
const durText = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : m > 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`);
const hm = (d: Date | string, tz: string) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)).replace(':', '.');
const todayKey = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const addDays = (key: string, n: number) => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const longDay = (key: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${key}T00:00:00Z`));
const HOUR_W = 52;

/** Kotak kecil: label huruf kapital kecil di atas nilai tebal. */
function Tile({ label, value, empty }: { label: string; value: string; empty?: boolean }) {
  return <span className={`ps-tile ${empty ? 'ps-tile--empty' : ''}`}><small>{label}</small><b>{value}</b></span>;
}

/** Teks besar di kartu station: sisa waktu (mundur), lewat waktu, atau jam booking. */
function cardHeadline(info: PsBoardInfo, tz: string): string {
  if (info.state === 'perawatan') return 'PERAWATAN';
  if (info.state === 'booking') return `BOOKING ${hm(info.booking!.startAt, tz)}`;
  if (info.state === 'kosong') return 'KOSONG';
  if (info.state === 'lewat') return `+${formatPsDuration(info.seconds ?? 0)}`;
  return info.waiting ? 'PERSIAPAN' : formatPsDuration(info.seconds ?? 0);
}

function StationCard({ station, info, tz, selected, inOrder, onOpen, nightRate }: { station: PsStation; info: PsBoardInfo; tz: string; selected: boolean; inOrder: boolean; onOpen: () => void; nightRate?: number }) {
  const s = info.session, b = info.booking;
  const total = s ? Math.max(1, new Date(s.endsAt).getTime() - new Date(s.billableStart).getTime()) : 1;
  const pct = s ? Math.min(100, Math.max(0, ((Date.now() - new Date(s.billableStart).getTime()) / total) * 100)) : 0;
  return (
    <button type="button" className="ps-card" data-state={info.state} aria-pressed={selected} data-table-id={station.tableId} onClick={onOpen}
      aria-label={`${station.name}, ${STATE_LABEL[info.state]}, ${cardHeadline(info, tz)}${inOrder ? ', ada di pesanan ini' : ''}`}>
      <span className="flex items-center justify-between gap-6">
        <span className="ps-card__name">{station.name}</span>
        <span className="flex gap-4">{inOrder && <span className="ps-card__chip" style={{ background: 'var(--neon-magenta)', color: '#1A0620' }}>DI PESANAN</span>}<span className="ps-card__chip">{station.consoleLabel}</span></span>
      </span>
      <span className="ps-card__time">{cardHeadline(info, tz)}</span>
      {s ? (
        <span className="ps-tiles"><Tile label="Penyewa" value={s.customerName ?? '—'} /><Tile label="Paket" value={s.parts[0]?.label ?? '—'} /><Tile label="Selesai" value={hm(s.endsAt, tz)} /></span>
      ) : b ? (
        <span className="ps-tiles"><Tile label="Pemesan" value={b.name} /><Tile label="Paket" value={b.label || durText(b.durationMinutes)} /><Tile label="Selesai" value={hm(new Date(new Date(b.startAt).getTime() + b.durationMinutes * 60000), tz)} /></span>
      ) : info.state === 'perawatan' ? (
        <span className="ps-tile ps-tile--empty"><small>Status</small><b>Tidak bisa disewa</b></span>
      ) : (
        <span className="ps-tiles"><Tile empty label="Tarif/jam" value={formatRp(station.ratePerHour)} /><Tile empty label={nightRate ? 'Malam' : 'Pita'} value={nightRate ? formatRp(nightRate) : `${station.bands.length}`} /><Tile empty label="Game" value={`${station.games.length} judul`} /></span>
      )}
      {s ? <span className="ps-bar"><i style={{ width: `${pct}%` }} /></span> : null}
      {s && <span className="flex justify-between text-xs"><b style={{ color: s.paid ? 'var(--color-success-strong)' : 'var(--color-warning-strong)' }}>{s.paid ? 'Lunas' : 'Belum bayar'}</b><span style={{ color: 'var(--color-text-muted)' }}>{STATE_LABEL[info.state]}</span></span>}
      {b && !s && <span className="text-xs font-bold" style={{ color: b.paid ? 'var(--color-success-strong)' : 'var(--color-warning-strong)' }}>{b.paid ? 'Lunas' : `Menunggu transfer sampai ${hm(b.expiresAt, tz)}`}</span>}
      {info.state === 'kosong' && <span className="text-xs font-semibold mt-auto" style={{ color: 'var(--neon-cyan)' }}>Ketuk untuk menyewakan</span>}
    </button>
  );
}

/** Tampilan PS di kasir: konsol (kartu neon) dan jadwal (blok waktu). Pesanan tetap di panel kanan; sewa masuk ke pesanan sebagai satu baris. */
export function PsView({ ctx, customerName, groupId, orderConsoles, onAddToOrder }: {
  ctx: OutletContext; customerName?: string; groupId?: string | null; orderConsoles: string[]; onAddToOrder: (line: { name: string; price: number; note: string }) => void;
}) {
  const data = useData();
  const tz = ctx.timezone;
  const base = useAsync(async () => {
    const [stations, packages, settings, floors, groupPrices] = await Promise.all([data.listPsStations(), data.listPsPackages(), data.getPsSettings(), data.listFloors(), data.listPsGroupPrices().catch(() => ({ rates: [], packages: [] }))]);
    return { stations, packages, settings, groupPrices, floors: floors.filter((f) => f.kind === 'ps') };
  }, [data]);
  const [ps, update] = usePsState(ctx.outletId);
  const now = useNow(1000);
  const [note, setNote] = useState('');
  const sync = usePsSync(data, ps, update, setNote);
  const [tab, setTab] = useState<'konsol' | 'jadwal'>('konsol');
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | { kind: 'detail' | 'start' | 'extend' | 'finish' } | { kind: 'book'; startAt?: string } | { kind: 'booking'; id: string }>(null);
  const [day, setDay] = useState(() => todayKey(tz));
  const isToday = day === todayKey(tz);

  useEffect(() => { update((s) => pruneState(s, new Date())); const t = setInterval(() => update((s) => pruneState(s, new Date())), 30000); return () => clearInterval(t); }, [update]);

  const range = useMemo(() => dayRangeUtc(day, tz), [day, tz]);
  const otherDay = useAsync(async () => (isToday ? null : data.psBoard({ from: range.from.toISOString(), to: range.to.toISOString() })), [data, day, isToday]);

  if (base.status === 'loading') return <div className="reg__ps p-16" aria-busy="true"><div className="cg-skeleton" style={{ height: 120 }} /></div>;
  if (base.status === 'error') return <div className="reg__ps p-16"><div role="alert" className="cg-banner cg-banner--danger"><span>Data PS belum bisa dimuat. {base.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={base.reload}>Coba lagi</button></div></div>;

  const { stations, packages, settings, floors } = base.data;
  const groupPricing = psGroupPricing(base.data.groupPrices, groupId);
  if (stations.length === 0) {
    return <div className="reg__ps p-16"><div className="cg-empty"><p><strong>Belum ada station PS.</strong></p><p className="text-text-muted">Buat lantai berjenis PS dan tambahkan mejanya di dashboard (Denah dan meja), lalu atur tarifnya di Station PS.</p></div></div>;
  }
  const activeFloor = floorId ?? floors[0]?.id ?? null;
  const shown = stations.filter((s) => (activeFloor ? s.floorId === activeFloor : true));
  const station = stations.find((s) => s.tableId === selected) ?? null;
  const infoOf = (s: PsStation) => boardInfo(s.tableId, s.isMaintenance, ps, now);
  const info = station ? infoOf(station) : null;
  const counts = stations.reduce((c, s) => { const k = infoOf(s).state; c[k] = (c[k] ?? 0) + 1; return c; }, {} as Partial<Record<PsBoardState, number>>);
  const busy = (counts.aktif ?? 0) + (counts['menit-terakhir'] ?? 0) + (counts.lewat ?? 0);
  const closeDlg = () => setDlg(null);
  const nightRate = (s: PsStation) => s.bands.find((b) => b.endMin >= 1440 && b.startMin >= 960)?.ratePerHour;
  const pending = ps.dirty.sessions.length + ps.dirty.bookings.length;
  const bookingLinkFor = (b: PsBooking, st: PsStation) => waLink(b, st, settings, tz);

  const sessionsForDay = isToday ? ps.sessions : otherDay.status === 'ready' && otherDay.data ? otherDay.data.sessions : [];
  const bookingsForDay = isToday ? ps.bookings : otherDay.status === 'ready' && otherDay.data ? otherDay.data.bookings : [];
  const blocks = psBlocks(sessionsForDay, bookingsForDay, now);
  const addLine = (name: string, price: number, noteText: string) => onAddToOrder({ name, price, note: noteText });

  return (
    <div className="reg__ps p-12 tablet:p-16 space-y-12">
      {note && <div role="status" className="cg-banner cg-banner--info flex items-center justify-between"><span>{note}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNote('')}>Tutup</button></div>}

      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="cg-modeswitch" role="tablist" aria-label="Konsol atau jadwal">
          <button type="button" role="tab" aria-selected={tab === 'konsol'} onClick={() => setTab('konsol')}>Konsol</button>
          <button type="button" role="tab" aria-selected={tab === 'jadwal'} onClick={() => setTab('jadwal')}>Jadwal</button>
        </div>
        <p className="m-0 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {stations.length} konsol · <b style={{ color: 'var(--neon-green)' }}>{busy} aktif</b>{counts.booking ? ` · ${counts.booking} booking` : ''}{counts.perawatan ? ` · ${counts.perawatan} perawatan` : ''}
          <span className="ml-8 text-xs">{sync.error ? '· offline' : sync.lastSync ? `· tersinkron ${hm(sync.lastSync, tz)}` : ''}{pending > 0 ? ` · ${pending} menunggu kirim` : ''}</span>
        </p>
      </div>

      {tab === 'konsol' && (
        <>
          {floors.length > 1 && <div className="flex gap-6 flex-wrap" role="tablist" aria-label="Lantai PS">{floors.map((f) => <button key={f.id} type="button" role="tab" className="ps-pill" aria-selected={activeFloor === f.id} onClick={() => setFloorId(f.id)}>{f.name}</button>)}</div>}
          <div className="ps-legend" aria-label="Keterangan warna">
            <span><i style={{ background: 'var(--neon-green)', boxShadow: '0 0 8px var(--neon-green)' }} />Aktif</span>
            <span><i style={{ background: 'var(--neon-amber)', boxShadow: '0 0 8px var(--neon-amber)' }} />Hampir habis</span>
            <span><i style={{ background: 'var(--neon-red)', boxShadow: '0 0 8px var(--neon-red)' }} />Lewat waktu</span>
            <span><i style={{ background: 'var(--neon-cyan)', boxShadow: '0 0 8px var(--neon-cyan)' }} />Booking</span>
            <span><i style={{ background: '#6A66A8' }} />Kosong</span>
          </div>
          <div className="ps-grid">
            {shown.map((s) => {
              const i = infoOf(s);
              return <StationCard key={s.tableId} station={s} info={i} tz={tz} selected={selected === s.tableId} inOrder={orderConsoles.includes(s.name)} nightRate={nightRate(s)} onOpen={() => { setSelected(s.tableId); setDlg({ kind: 'detail' }); }} />;
            })}
          </div>
        </>
      )}

      {tab === 'jadwal' && (
        <Timeline stations={shown.length ? shown : stations} blocks={blocks} day={day} isToday={isToday} range={range} now={now} tz={tz} loading={!isToday && otherDay.status === 'loading'}
          onDay={(d) => setDay(d)} onToday={() => setDay(todayKey(tz))}
          onBlock={(b) => { if (b.source === 'booking') setDlg({ kind: 'booking', id: b.id }); else { setSelected(b.tableId); setDlg({ kind: 'detail' }); } }}
          onEmpty={(tableId, startAt) => { setSelected(tableId); setDlg({ kind: 'book', startAt }); }} />
      )}

      {dlg?.kind === 'detail' && station && info && (
        <DetailDialog station={station} info={info} tz={tz} onClose={closeDlg}
          onStart={() => setDlg({ kind: 'start' })} onExtend={() => setDlg({ kind: 'extend' })} onFinish={() => setDlg({ kind: 'finish' })} onBook={() => setDlg({ kind: 'book' })}
          onStartBooking={(b) => { try { update((s) => startSession(s, { tableId: b.tableId, customerName: b.name, choice: { kind: 'duration', minutes: b.durationMinutes }, label: b.label || durText(b.durationMinutes), price: b.price, graceMinutes: settings.graceMinutes, tz, now: new Date(), paid: b.paid })); addLine(`Sewa ${station.name} · ${b.label || durText(b.durationMinutes)}`, b.paid ? 0 : b.price, b.paid ? 'Sudah lunas lewat booking' : `Booking ${b.name}`); setNote(`Sewa ${station.name} dimulai dari booking ${b.name}.`); } catch (e) { setNote(e instanceof Error ? e.message : 'Gagal memulai.'); } closeDlg(); }}
          onPaid={(b) => update((s) => markBookingPaid(s, b.id))}
          onCancel={(b) => { update((s) => cancelBooking(s, b.id)); setNote(`Booking ${b.name} dibatalkan.`); closeDlg(); }}
          bookingLink={(b) => bookingLinkFor(b, station)} />
      )}
      {dlg?.kind === 'start' && station && <ChoiceDialog title={`Sewa ${station.name}`} action="Mulai dan tambah ke pesanan" station={station} packages={packages} settings={settings} tz={tz} group={groupPricing} defaultName={customerName} withName onClose={closeDlg}
        onConfirm={({ choice, label, price, name, endsAt, billableStart }) => { try { update((s) => startSession(s, { tableId: station.tableId, customerName: name, choice, label, price, graceMinutes: settings.graceMinutes, tz, now: new Date() })); addLine(`Sewa ${station.name} · ${label}`, price, `${station.name} ${hm(billableStart, tz)}–${hm(endsAt, tz)}`); setNote(`Sewa ${station.name} dimulai dan masuk ke pesanan.`); } catch (e) { setNote(e instanceof Error ? e.message : 'Gagal memulai.'); } closeDlg(); }} />}
      {dlg?.kind === 'extend' && station && info?.session && <ChoiceDialog title={`Tambah waktu ${station.name}`} action="Tambah waktu ke pesanan" station={station} packages={packages} settings={settings} tz={tz} group={groupPricing} extendFrom={new Date(Math.max(new Date(info.session.endsAt).getTime(), now.getTime()))} onClose={closeDlg}
        onConfirm={({ choice, label, price }) => { const mins = choice.kind === 'duration' ? choice.minutes : (choice.pkg.durationMinutes ?? 0); update((s) => extendSession(s, info.session!.id, { minutes: mins, label, price, now: new Date() })); addLine(`Tambah waktu ${station.name} · ${label}`, price, station.name); setNote(`Waktu ${station.name} ditambah ${durText(mins)} dan masuk ke pesanan.`); closeDlg(); }} />}
      {dlg?.kind === 'book' && station && <BookingDialog station={station} packages={packages} settings={settings} tz={tz} group={groupPricing} blocks={blocks} startAt={dlg.startAt} onClose={closeDlg}
        onSave={(i) => update((s) => addBooking(s, { ...i, now: new Date(), expiryMinutes: settings.bookingExpiryMinutes }))} />}
      {dlg?.kind === 'booking' && (() => {
        const b = ps.bookings.find((x) => x.id === dlg.id) ?? (otherDay.status === 'ready' ? otherDay.data?.bookings.find((x) => x.id === dlg.id) : undefined);
        const st = b ? stations.find((s) => s.tableId === b.tableId) : undefined;
        if (!b || !st) return null;
        return (
          <Modal title={`Booking ${st.name}`} onClose={closeDlg}>
            <div className="grid grid-cols-2 gap-8"><div className="ps-box"><small>Pemesan</small><b>{b.name}</b></div><div className="ps-box"><small>Waktu</small><b>{hm(b.startAt, tz)} – {hm(new Date(new Date(b.startAt).getTime() + b.durationMinutes * 60000), tz)}</b></div><div className="ps-box"><small>Total</small><b>{formatRp(b.price)}</b></div><div className="ps-box"><small>Status</small><b>{b.paid ? 'Lunas' : 'Menunggu transfer'}</b></div></div>
            <div className="cg-modal__actions">
              <button className="cg-btn cg-btn--ghost" onClick={closeDlg}>Tutup</button>
              {!b.paid && <button className="cg-btn cg-btn--secondary" onClick={() => { update((s) => markBookingPaid(s, b.id)); closeDlg(); }}>Tandai lunas</button>}
              {!b.paid && bookingLinkFor(b, st) && <a className="cg-btn cg-btn--secondary" href={bookingLinkFor(b, st)!} target="_blank" rel="noreferrer">Kirim WhatsApp</a>}
              <button className="cg-btn cg-btn--danger" onClick={() => { update((s) => cancelBooking(s, b.id)); setNote(`Booking ${b.name} dibatalkan.`); closeDlg(); }}>Batalkan</button>
            </div>
          </Modal>
        );
      })()}
      {dlg?.kind === 'finish' && station && info?.session && (
        <Modal title={`Selesai ${station.name}`} onClose={closeDlg}>
          <ul className="m-0 p-0 list-none space-y-4">{info.session.parts.map((p, i) => <li key={i} className="flex justify-between gap-12 text-sm"><span>{p.label}</span><span className="cg-num">{formatRp(p.price)}</span></li>)}</ul>
          <p className="flex justify-between font-bold m-0 mt-8 pt-8 border-t border-border"><span>Total sewa</span><span className="cg-num">{formatRp(info.session.total)}</span></p>
          <p className="text-sm text-text-muted">Sewa sudah ada di pesanan; bayar lewat tombol Bayar di pesanan. Menyelesaikan sesi menghentikan timer dan membuat konsol kosong lagi.</p>
          <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={closeDlg}>Batal</button><button className="cg-btn cg-btn--primary" onClick={() => { update((s) => finishSession(s, info.session!.id)); setNote(`Sesi ${station.name} selesai.`); closeDlg(); }}>Selesai sewa</button></div>
        </Modal>
      )}
    </div>
  );
}

function waLink(b: PsBooking, station: PsStation, settings: PsSettings, tz: string, bank = ''): string | null {
  const d = new Date(b.startAt);
  const msg = fillBookingMessage(settings.bookingMessage, {
    nama: b.name, station: station.name, tanggal: new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: 'numeric', month: 'long' }).format(d), jam: hm(d, tz), durasi: durText(b.durationMinutes),
    total: formatRp(b.price), batas: hm(b.expiresAt, tz), rekening: bank || 'rekening outlet',
  });
  return b.phone ? bookingWhatsAppLink(b.phone, msg) : null;
}

/** Jadwal: baris per station, jam di atas; blok hijau (dipakai), kuning (hampir habis), merah (lewat), cyan (booking), abu (selesai). */
function Timeline({ stations, blocks, day, isToday, range, now, tz, loading, onDay, onToday, onBlock, onEmpty }: {
  stations: PsStation[]; blocks: PsBlock[]; day: string; isToday: boolean; range: { from: Date; to: Date }; now: Date; tz: string; loading: boolean;
  onDay: (d: string) => void; onToday: () => void; onBlock: (b: PsBlock) => void; onEmpty: (tableId: string, startAtIso: string) => void;
}) {
  const hours = timelineHours(blocks, range.from, tz);
  const width = (hours.end - hours.start) * HOUR_W;
  const nowH = (now.getTime() - range.from.getTime()) / 3600000;
  const showNow = isToday && nowH >= hours.start && nowH <= hours.end;
  const nextBlock = blocks.filter((b) => b.kind.startsWith('booking') && b.start.getTime() > now.getTime())[0];
  const warn = blocks.filter((b) => b.kind === 'warning' || b.kind === 'overtime')[0];
  const free = stations.filter((s) => !s.isMaintenance && freeUntil(s.tableId, blocks, now).free)[0];
  const nameOf = (id: string) => stations.find((s) => s.tableId === id)?.name ?? '';
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label="Hari sebelumnya" onClick={() => onDay(addDays(day, -1))}>‹</button>
          <b className="ps-time text-base" style={{ minWidth: 190, textAlign: 'center' }}>{longDay(day).toUpperCase()}</b>
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label="Hari berikutnya" onClick={() => onDay(addDays(day, 1))}>›</button>
          {!isToday && <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={onToday}>Hari ini</button>}
        </div>
        <div className="ps-legend" aria-label="Keterangan blok">
          <span><i style={{ background: 'color-mix(in srgb, var(--neon-green) 30%, transparent)', border: '1.5px solid var(--neon-green)' }} />Dipakai</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--neon-cyan) 30%, transparent)', border: '1.5px solid var(--neon-cyan)' }} />Booking lunas</span>
          <span><i style={{ background: 'transparent', border: '1.5px dashed var(--neon-cyan)' }} />Belum lunas</span>
          <span><i style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.3)' }} />Selesai</span>
        </div>
      </div>
      <div className="ps-tl" aria-busy={loading} aria-label="Jadwal konsol">
        <div className="ps-tl__inner" style={{ ['--hour-w' as string]: `${HOUR_W}px`, width: 84 + width, minWidth: 84 + width }}>
          <div className="ps-tl__head" style={{ width }}>{Array.from({ length: hours.end - hours.start }, (_, i) => <span key={i} style={{ left: i * HOUR_W }}>{String((hours.start + i) % 24).padStart(2, '0')}.00</span>)}</div>
          {showNow && <div className="ps-tl__now" style={{ left: 84 + (nowH - hours.start) * HOUR_W }}><small>{hm(now, tz)}</small></div>}
          {stations.map((s) => {
            const mine = blocks.filter((b) => b.tableId === s.tableId);
            return (
              <div key={s.tableId} className="ps-tl__row">
                <b className="ps-tl__name">{s.name}<small>{s.consoleLabel}</small></b>
                <div className="ps-tl__track" style={{ width }}
                  onClick={(e) => {
                    if (s.isMaintenance || e.target !== e.currentTarget) return;
                    const x = e.nativeEvent.offsetX; const h = Math.round(((x / HOUR_W) + hours.start) * 2) / 2;
                    const hh = Math.floor(h) % 24, mm = (h % 1) * 60;
                    const startAt = zonedTime(day, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, tz);
                    if (startAt && startAt.getTime() > Date.now() - 5 * 60000 && !overlapsBlocks(s.tableId, startAt, new Date(startAt.getTime() + 3600000), blocks)) onEmpty(s.tableId, startAt.toISOString());
                  }}>
                  {s.isMaintenance && <div className="ps-block" data-kind="finished" style={{ left: 0, width, cursor: 'default', borderStyle: 'dashed' }}><b style={{ textAlign: 'center', letterSpacing: '.08em' }}>PERAWATAN · TIDAK BISA DISEWA</b></div>}
                  {!s.isMaintenance && mine.map((b) => {
                    const h = blockHours(b, range.from);
                    const left = (Math.max(h.start, hours.start) - hours.start) * HOUR_W, right = (Math.min(h.end, hours.end) - hours.start) * HOUR_W;
                    if (right <= left) return null;
                    const w = right - left - 2;
                    const label = `${hm(b.start, tz)}–${hm(b.end, tz)}`;
                    return (
                      <span key={b.id}>
                        <button type="button" className="ps-block" data-kind={b.kind} style={{ left: left + 1, width: w }} onClick={() => onBlock(b)} aria-label={`${s.name}, ${b.title}, ${label}`}>
                          <b>{b.title}</b>{w > 70 && <span>{label}{b.source === 'booking' ? (b.paid ? ' · lunas' : ' · belum lunas') : ''}</span>}
                        </button>
                        {b.overtimeEnd && <span className="ps-block" data-kind="overtime" style={{ left: right, width: Math.max(8, (blockHours({ start: b.end, end: b.overtimeEnd }, range.from).end - blockHours({ start: b.end, end: b.overtimeEnd }, range.from).start) * HOUR_W), padding: 0, background: 'repeating-linear-gradient(135deg, var(--neon-red) 0 3px, #4A1020 3px 6px)', pointerEvents: 'none' }} aria-hidden />}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isToday && (
        <div className="grid gap-8 grid-cols-1 tablet:grid-cols-3">
          <div className="ps-box"><small>Kosong sekarang</small><b>{free ? `${free.name}${freeUntil(free.tableId, blocks, now).until ? ` · sampai ${hm(freeUntil(free.tableId, blocks, now).until!, tz)}` : ''}` : 'Semua terpakai'}</b></div>
          <div className="ps-box" style={{ borderColor: 'color-mix(in srgb, var(--neon-cyan) 50%, transparent)' }}><small style={{ color: 'var(--neon-cyan)' }}>Booking berikutnya</small><b>{nextBlock ? `${hm(nextBlock.start, tz)} · ${nameOf(nextBlock.tableId)} · ${nextBlock.title}` : 'Belum ada'}</b></div>
          <div className="ps-box" style={{ borderColor: 'color-mix(in srgb, var(--neon-amber) 50%, transparent)' }}><small style={{ color: 'var(--color-warning-strong)' }}>Hampir habis atau lewat</small><b>{warn ? `${nameOf(warn.tableId)} · ${warn.kind === 'overtime' ? 'lewat waktu' : `${Math.max(1, Math.ceil((warn.end.getTime() - now.getTime()) / 60000))} menit lagi`}` : 'Tidak ada'}</b></div>
        </div>
      )}
      <p className="m-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>Ketuk area kosong di baris konsol untuk membuat booking pada jam itu.</p>
    </div>
  );
}

function DetailDialog({ station, info, tz, onClose, onStart, onExtend, onFinish, onBook, onStartBooking, onPaid, onCancel, bookingLink }: {
  station: PsStation; info: PsBoardInfo; tz: string; onClose: () => void; onStart: () => void; onExtend: () => void; onFinish: () => void; onBook: () => void;
  onStartBooking: (b: PsBooking) => void; onPaid: (b: PsBooking) => void; onCancel: (b: PsBooking) => void; bookingLink: (b: PsBooking) => string | null;
}) {
  const s = info.session, b = info.booking;
  return (
    <Modal title={station.name} onClose={onClose}>
      <div className="flex items-center gap-8 flex-wrap">
        <span className="cg-badge">{station.consoleLabel} · {formatRp(station.ratePerHour)} per jam</span>
        <span className="cg-badge cg-badge--accent">{STATE_LABEL[info.state]}</span>
      </div>
      {s && (
        <div className="ps-box mt-8" style={{ borderColor: 'color-mix(in srgb, var(--neon-green) 45%, transparent)' }}>
          <p className="ps-time m-0" style={{ fontSize: 56, lineHeight: 1, fontWeight: 700, color: info.state === 'lewat' ? 'var(--neon-red)' : info.state === 'menit-terakhir' ? 'var(--neon-amber)' : 'var(--neon-green)' }}>{info.state === 'lewat' ? '+' : ''}{info.waiting ? 'PERSIAPAN' : formatPsDuration(info.seconds ?? 0)}</p>
          <p className="m-0 text-sm" style={{ color: 'var(--color-text-muted)' }}>{info.state === 'lewat' ? 'Lewat waktu: tegur pelanggan atau tambah waktu' : info.waiting ? `Waktu dihitung mulai ${hm(s.billableStart, tz)}` : 'sisa waktu'} · dihitung {hm(s.billableStart, tz)} – {hm(s.endsAt, tz)}</p>
        </div>
      )}
      {s && <div className="grid grid-cols-2 gap-8 mt-8"><div className="ps-box"><small>Penyewa</small><b>{s.customerName ?? '—'}</b></div><div className="ps-box"><small>Paket</small><b>{s.parts.map((p) => p.label).join(' + ')}</b></div><div className="ps-box"><small>Selesai</small><b>{hm(s.endsAt, tz)}</b></div><div className="ps-box"><small>Sewa</small><b>{formatRp(s.total)}</b></div></div>}
      {b && !s && <div className="grid grid-cols-2 gap-8 mt-8"><div className="ps-box"><small>Pemesan</small><b>{b.name}</b></div><div className="ps-box"><small>Waktu</small><b>{hm(b.startAt, tz)} · {durText(b.durationMinutes)}</b></div><div className="ps-box"><small>Total</small><b>{formatRp(b.price)}</b></div><div className="ps-box"><small>Pembayaran</small><b>{b.paid ? 'Lunas' : `Sampai ${hm(b.expiresAt, tz)}`}</b></div></div>}
      <div className="mt-8">
        <p className="m-0 mb-4 text-xs" style={{ color: 'var(--color-text-muted)', letterSpacing: '.09em' }}>GAME DI KONSOL INI · {station.games.length} JUDUL</p>
        {station.games.length === 0 ? <p className="m-0 text-sm text-text-muted">Belum ada daftar game.</p> : <div className="flex flex-wrap gap-6">{station.games.map((g) => <span key={g} className="ps-chip">{g}</span>)}</div>}
      </div>
      <div className="cg-modal__actions flex-wrap">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button>
        {info.state === 'perawatan' && <span className="text-sm text-text-muted">Konsol sedang perawatan dan tidak bisa disewa.</span>}
        {(info.state === 'kosong' || info.state === 'booking') && <button className="cg-btn cg-btn--primary" onClick={onStart}>Mulai sewa</button>}
        {info.state !== 'perawatan' && !s && <button className="cg-btn cg-btn--secondary" onClick={onBook}>Booking</button>}
        {b && !s && <button className="cg-btn cg-btn--secondary" onClick={() => onStartBooking(b)}>Mulai dari booking</button>}
        {b && !s && !b.paid && <button className="cg-btn cg-btn--secondary" onClick={() => onPaid(b)}>Tandai lunas</button>}
        {b && !s && !b.paid && bookingLink(b) && <a className="cg-btn cg-btn--secondary" href={bookingLink(b)!} target="_blank" rel="noreferrer">Kirim WhatsApp</a>}
        {b && !s && <button className="cg-btn cg-btn--ghost" onClick={() => onCancel(b)}>Batalkan booking</button>}
        {s && <button className="cg-btn cg-btn--primary" onClick={onExtend}>Tambah waktu</button>}
        {s && <button className="cg-btn cg-btn--secondary" onClick={onFinish}>Selesai sewa</button>}
      </div>
    </Modal>
  );
}

interface ChoiceResult { choice: PsChoice; label: string; price: number; name?: string; endsAt: Date; billableStart: Date }
interface Option { id: string; choice: PsChoice; label: string; sub: string; price: number; endsAt: Date; billableStart: Date }

/** Pilih paket atau durasi (harga dari tarif per jam dan pita jam) untuk mulai sewa atau tambah waktu. */
function ChoiceDialog({ title, action, station, packages, settings, tz, group = NO_PS_GROUP_PRICING, withName, defaultName, extendFrom, onClose, onConfirm }: {
  title: string; action: string; station: PsStation; packages: PsPackage[]; settings: PsSettings; tz: string; group?: PsGroupPricing; withName?: boolean; defaultName?: string; extendFrom?: Date;
  onClose: () => void; onConfirm: (r: ChoiceResult) => void;
}) {
  const [now] = useState(() => new Date());
  const [name, setName] = useState(defaultName ?? '');
  const options = useMemo<Option[]>(() => {
    const at = extendFrom ?? now;
    const grace = extendFrom ? 0 : settings.graceMinutes;
    const list: Option[] = [];
    for (const p of sortedPackages(packages)) {
      if (!packageApplies(p, station.tableId, at, tz)) continue;
      if (extendFrom && p.windowStartMin !== undefined) continue;
      const choice: PsChoice = { kind: 'package', pkg: p };
      const sch = sessionSchedule(at, grace, choice, tz);
      list.push({ id: `p-${p.id}`, choice, label: p.name, sub: p.windowStartMin !== undefined ? `selesai tepat ${hm(sch.endsAt, tz)}` : `${durText(p.durationMinutes ?? 0)} · selesai ${hm(sch.endsAt, tz)}`, price: priceForChoice(station, choice, sch, tz, group), endsAt: sch.endsAt, billableStart: sch.billableStart });
    }
    for (const m of QUICK_MINUTES) {
      const choice: PsChoice = { kind: 'duration', minutes: m };
      const sch = sessionSchedule(at, grace, choice, tz);
      list.push({ id: `d-${m}`, choice, label: durText(m), sub: `${hm(sch.billableStart, tz)} sampai ${hm(sch.endsAt, tz)}`, price: priceForDuration(stationForGroup(station, group), sch.billableStart, m, tz), endsAt: sch.endsAt, billableStart: sch.billableStart });
    }
    return list;
  }, [packages, station, tz, settings.graceMinutes, extendFrom, now, group]);
  const [pick, setPick] = useState(options[0]?.id ?? '');
  const opt = options.find((o) => o.id === pick);
  return (
    <Modal title={title} onClose={onClose}>
      {!extendFrom && (
        <div className="grid grid-cols-3 gap-8">
          <div className="ps-box"><small>Sekarang</small><b>{hm(now, tz)}</b></div>
          <div className="ps-box"><small>Tenggang</small><b>{settings.graceMinutes} menit</b></div>
          <div className="ps-box" style={{ borderColor: 'color-mix(in srgb, var(--neon-cyan) 50%, transparent)' }}><small style={{ color: 'var(--neon-cyan)' }}>Dihitung mulai</small><b>{hm(new Date(now.getTime() + settings.graceMinutes * 60000), tz)}</b></div>
        </div>
      )}
      <div role="radiogroup" aria-label="Pilihan sewa" className="grid gap-8 mt-8">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} onClick={() => setPick(o.id)}
            className="flex items-center justify-between gap-12 text-left p-12 rounded-lg cursor-pointer"
            style={{ border: pick === o.id ? '2px solid var(--neon-green)' : '1px solid var(--color-border)', background: pick === o.id ? 'color-mix(in srgb, var(--neon-green) 10%, transparent)' : 'transparent', color: 'inherit', boxShadow: pick === o.id ? '0 0 16px color-mix(in srgb, var(--neon-green) 30%, transparent)' : 'none' }}>
            <span className="min-w-0"><strong className="block">{o.label}</strong><span className="text-xs text-text-muted">{o.sub}</span></span>
            <span className="ps-time font-bold shrink-0" style={{ fontSize: 18 }}>{formatRp(o.price)}</span>
          </button>
        ))}
      </div>
      {withName && <div className="cg-field mt-12"><label className="cg-label" htmlFor="ps-name">Penyewa</label><input id="ps-name" className="cg-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /><p className="text-xs text-text-muted m-0">Sewa masuk ke pesanan di kanan, satu nota dengan makanan. Pilih pelanggan di pesanan agar tercatat.</p></div>}
      <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button className="cg-btn cg-btn--primary" disabled={!opt} onClick={() => opt && onConfirm({ choice: opt.choice, label: opt.label, price: opt.price, endsAt: opt.endsAt, billableStart: opt.billableStart, ...(name.trim() ? { name } : {}) })}>{action}{opt ? ` · ${formatRp(opt.price)}` : ''}</button></div>
    </Modal>
  );
}

/** Booking dibayar penuh lewat transfer: simpan, lalu kirim pesan lewat tautan wa.me yang tinggal diklik. */
function BookingDialog({ station, packages, settings, tz, group = NO_PS_GROUP_PRICING, blocks, startAt: presetStart, onClose, onSave }: {
  station: PsStation; packages: PsPackage[]; settings: PsSettings; tz: string; group?: PsGroupPricing; blocks: PsBlock[]; startAt?: string; onClose: () => void;
  onSave: (b: { tableId: string; name: string; phone: string; startAt: string; durationMinutes: number; label: string; price: number }) => void;
}) {
  const data = useData();
  const bank = useAsync(async () => { try { const i = (await data.getOutletSettings()).info; return i.bankName && i.bankAccountNumber ? `${i.bankName} ${i.bankAccountNumber}${i.bankAccountName ? ` a.n. ${i.bankAccountName}` : ''}` : ''; } catch { return ''; } }, [data]);
  const preset = presetStart ? new Date(presetStart) : null;
  const today = todayKey(tz);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(preset ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(preset) : today);
  const [time, setTime] = useState(preset ? (() => { const c = localClock(preset, tz); return `${String(Math.floor(c.minuteOfDay / 60)).padStart(2, '0')}:${String(c.minuteOfDay % 60).padStart(2, '0')}`; })() : '19:00');
  const [minutes, setMinutes] = useState(120);
  const [pkgId, setPkgId] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<PsBooking | null>(null);

  const startAt = zonedTime(date, time, tz) ?? new Date(NaN);
  const startOk = !Number.isNaN(startAt.getTime());
  const pkg = packages.find((p) => p.id === pkgId);
  const choice: PsChoice = pkg ? { kind: 'package', pkg } : { kind: 'duration', minutes };
  const sch = startOk ? sessionSchedule(startAt, 0, choice, tz) : null;
  const applies = !pkg || (startOk && packageApplies(pkg, station.tableId, startAt, tz));
  const price = sch ? priceForChoice(station, choice, sch, tz, group) : 0;
  const dur = sch?.durationMinutes ?? 0;
  const clash = sch ? overlapsBlocks(station.tableId, startAt, sch.endsAt, blocks) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Nama pemesan wajib diisi.');
    if (!startOk || !sch) return setErr('Tanggal atau jam tidak valid.');
    if (startAt.getTime() < Date.now() - 5 * 60000) return setErr('Waktu booking sudah lewat.');
    if (!applies) return setErr('Paket itu tidak berlaku pada hari atau jam yang dipilih.');
    if (dur <= 0) return setErr('Durasi tidak valid.');
    if (clash) return setErr(`Bentrok dengan ${clash.title} (${hm(clash.start, tz)}–${hm(clash.end, tz)}).`);
    const rec = { tableId: station.tableId, name: name.trim(), phone: phone.trim(), startAt: startAt.toISOString(), durationMinutes: dur, label: pkg ? pkg.name : durText(dur), price };
    try {
      onSave(rec);
      setSaved({ ...rec, id: 'x', paid: false, status: 'active', rev: 1, expiresAt: new Date(Date.now() + settings.bookingExpiryMinutes * 60000).toISOString() });
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan booking.'); }
  }
  if (saved) {
    const link = waLink(saved, station, settings, tz, bank.status === 'ready' ? bank.data : '');
    return (
      <Modal title="Booking tersimpan" onClose={onClose}>
        <p className="m-0">{saved.name} · {station.name} · {formatRp(saved.price)}</p>
        <p className="text-sm text-text-muted">Booking dibayar penuh lewat transfer dan hangus bila belum lunas dalam {durText(settings.bookingExpiryMinutes)}. Kirim pesan pembayaran ke pelanggan, lalu tandai lunas setelah mutasi dicek.</p>
        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--ghost" onClick={onClose}>Selesai</button>
          {link ? <a className="cg-btn cg-btn--primary" href={link} target="_blank" rel="noreferrer">Buka WhatsApp</a> : <span className="text-sm text-warning-strong">Nomor WhatsApp kosong atau tidak valid.</span>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={`Booking ${station.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-12">
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
        <div className="grid gap-12 grid-cols-1 tablet:grid-cols-2">
          <div className="cg-field"><label className="cg-label" htmlFor="bk-name">Nama pemesan</label><input id="bk-name" className="cg-input" data-autofocus maxLength={40} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="bk-phone">Nomor WhatsApp</label><input id="bk-phone" className="cg-input" inputMode="tel" placeholder="0812..." value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="bk-date">Tanggal</label><input id="bk-date" className="cg-input" type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setErr(''); }} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="bk-time">Jam mulai</label><input id="bk-time" className="cg-input" type="time" value={time} onChange={(e) => { setTime(e.target.value); setErr(''); }} /></div>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="bk-pick">Paket atau durasi</label>
          <select id="bk-pick" className="cg-input" value={pkgId || `d${minutes}`} onChange={(e) => { const v = e.target.value; if (v.startsWith('d')) { setPkgId(''); setMinutes(Number(v.slice(1))); } else setPkgId(v); setErr(''); }}>
            {QUICK_MINUTES.map((m) => <option key={m} value={`d${m}`}>{durText(m)} (tarif per jam)</option>)}
            {sortedPackages(packages).filter((p) => p.isActive && (p.tableIds.length === 0 || p.tableIds.includes(station.tableId))).map((p) => <option key={p.id} value={p.id}>{p.name}{p.weekdays ? ` (${p.weekdays.map((d) => PS_WEEKDAY_LABEL[d]).join(', ')})` : ''}</option>)}
          </select>
          {!applies && <p className="text-xs text-danger-strong m-0">Paket itu tidak berlaku pada hari atau jam yang dipilih.</p>}
          {clash && <p className="text-xs text-danger-strong m-0">Bentrok dengan {clash.title} ({hm(clash.start, tz)}–{hm(clash.end, tz)}).</p>}
        </div>
        <p className="m-0 flex justify-between font-bold"><span>Total yang harus ditransfer</span><span className="ps-time" style={{ fontSize: 22, color: 'var(--neon-cyan)' }}>{formatRp(price)}</span></p>
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button type="submit" className="cg-btn cg-btn--primary">Simpan booking</button></div>
      </form>
    </Modal>
  );
}

export type { PsState };

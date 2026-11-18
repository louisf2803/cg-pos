import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PS_WEEKDAY_LABEL, TABLE_COLOR_CONFIG, bookingWhatsAppLink, fillBookingMessage, formatPsDuration, formatRp, hydrateTableLayout, packageApplies, priceForChoice,
  priceForDuration, sessionSchedule, zonedTime, type OutletContext, type PsChoice, type PsPackage, type PsSettings, type PsStation, type TableColorStatus, type TableStatus,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';
import { FloorMap, loadFloorLayout } from './FloorMap';
import {
  addBooking, boardInfo, cancelBooking, extendSession, finishSession, markBookingPaid, pruneBookings, sortedPackages, startSession, useNow, usePsState,
  type PsBoardInfo, type PsBoardState, type PsBooking,
} from '../lib/ps-store';

const QUICK_MINUTES = [30, 60, 90, 120, 180] as const;
const STATE_COLOR: Record<PsBoardState, TableColorStatus> = { kosong: 'empty', aktif: 'occupied', 'menit-terakhir': 'warning', lewat: 'overdue', booking: 'seated', perawatan: 'empty' };
const STATE_LABEL: Record<PsBoardState, string> = { kosong: 'Kosong', aktif: 'Aktif', 'menit-terakhir': 'Hampir habis', lewat: 'Lewat waktu', booking: 'Booking', perawatan: 'Perawatan' };
const durText = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : m > 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`);
const hm = (d: Date | string, tz: string) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)).replace(':', '.');

/** Teks di kartu station: sisa waktu (mundur), lewat waktu, atau jam booking. */
function cardLabel(info: PsBoardInfo, tz: string): string {
  if (info.state === 'perawatan') return 'Perawatan';
  if (info.state === 'booking') return `Booking ${hm(info.booking!.startAt, tz)}`;
  if (info.state === 'kosong') return 'Kosong';
  if (info.state === 'lewat') return `Lewat ${formatPsDuration(info.seconds ?? 0)}`;
  return info.waiting ? 'Persiapan' : formatPsDuration(info.seconds ?? 0);
}

/** Tampilan PS di kasir: peta station dengan status dan sisa waktu, detail station (game, penyewa), mulai/tambah waktu/booking. Sesi disimpan di tablet ini. */
export function PsView({ ctx }: { ctx: OutletContext }) {
  const data = useData();
  const tz = ctx.timezone;
  const base = useAsync(async () => {
    try { await hydrateTableLayout(data, localStorage, false); } catch { /* pakai salinan perangkat */ }
    const [stations, packages, settings, floors] = await Promise.all([data.listPsStations(), data.listPsPackages(), data.getPsSettings(), data.listFloors()]);
    return { stations, packages, settings, floors: floors.filter((f) => f.kind === 'ps') };
  }, [data]);
  const [ps, update] = usePsState(ctx.outletId);
  const now = useNow(1000);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | 'start' | 'extend' | 'book' | 'finish'>(null);
  const [note, setNote] = useState('');
  const layout = useMemo(() => loadFloorLayout(ctx.outletId), [ctx.outletId, base.status]);

  useEffect(() => { update((s) => pruneBookings(s, new Date())); const t = setInterval(() => update((s) => pruneBookings(s, new Date())), 30000); return () => clearInterval(t); }, [update]);

  if (base.status === 'loading') return <div className="reg__ps p-16" aria-busy="true"><div className="cg-skeleton" style={{ height: 120 }} /></div>;
  if (base.status === 'error') return <div className="reg__ps p-16"><div role="alert" className="cg-banner cg-banner--danger"><span>Data PS belum bisa dimuat. {base.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={base.reload}>Coba lagi</button></div></div>;

  const { stations, packages, settings, floors } = base.data;
  if (stations.length === 0) {
    return <div className="reg__ps p-16"><div className="cg-empty"><p><strong>Belum ada station PS.</strong></p><p className="text-text-muted">Buat lantai berjenis PS dan tambahkan mejanya di dashboard (Denah dan meja), lalu atur tarifnya di Station PS.</p></div></div>;
  }
  const activeFloor = floorId ?? floors[0]?.id ?? null;
  const shown = stations.filter((s) => (activeFloor ? s.floorId === activeFloor : true));
  const mapTables: TableStatus[] = shown.map((s, i) => ({ id: s.tableId, floorId: s.floorId, name: s.name, sort: i }));
  const station = stations.find((s) => s.tableId === selected) ?? null;
  const info = station ? boardInfo(station.tableId, station.isMaintenance, ps, now) : null;
  const counts = stations.reduce((c, s) => { const k = boardInfo(s.tableId, s.isMaintenance, ps, now).state; c[k] = (c[k] ?? 0) + 1; return c; }, {} as Partial<Record<PsBoardState, number>>);
  const busy = (counts.aktif ?? 0) + (counts['menit-terakhir'] ?? 0) + (counts.lewat ?? 0);
  const closeDlg = () => { setDlg(null); };

  return (
    <div className="reg__ps overflow-auto p-12 tablet:p-16 space-y-12">
      <div className="cg-banner cg-banner--info" role="note"><span>Tampilan PS tahap awal: sesi dan booking tersimpan di tablet ini dan memakai jam tablet. Nota dengan makanan, pelanggan, dan laporan menyusul.</span></div>
      {note && <div role="status" className="cg-banner cg-banner--success flex items-center justify-between"><span>{note}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNote('')}>Tutup</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-8">
        <p className="m-0 text-sm text-text-muted">{stations.length} station · {busy} aktif{counts.booking ? ` · ${counts.booking} booking` : ''}</p>
        <div className="flex flex-wrap gap-8 text-xs text-text-muted" aria-label="Keterangan warna">
          {(['aktif', 'menit-terakhir', 'lewat', 'booking', 'kosong'] as PsBoardState[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-4"><i aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: TABLE_COLOR_CONFIG[STATE_COLOR[k]].hexColor, display: 'inline-block' }} />{STATE_LABEL[k]}</span>
          ))}
        </div>
      </div>
      {floors.length > 1 && (
        <div className="cg-tabs" role="tablist" aria-label="Lantai PS">{floors.map((f) => <button key={f.id} role="tab" className="cg-tab" aria-selected={activeFloor === f.id} onClick={() => setFloorId(f.id)}>{f.name}</button>)}</div>
      )}
      <div className="grid gap-12 grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0">
          <FloorMap
            floorId={activeFloor ?? ''}
            tables={mapTables}
            layout={layout}
            mineId={selected ?? undefined}
            color={(t) => { const st = stations.find((s) => s.tableId === t.id)!; const i = boardInfo(st.tableId, st.isMaintenance, ps, now); return { hexColor: TABLE_COLOR_CONFIG[STATE_COLOR[i.state]].hexColor, label: cardLabel(i, tz) }; }}
            onTable={(t) => setSelected(t.id)}
            label={(t) => { const st = stations.find((s) => s.tableId === t.id)!; const i = boardInfo(st.tableId, st.isMaintenance, ps, now); return `${t.name}, ${STATE_LABEL[i.state]}, ${cardLabel(i, tz)}`; }}
          />
        </div>
        <aside className="cg-card p-16 space-y-12 min-w-0" aria-label="Detail station">
          {!station || !info ? <p className="m-0 text-sm text-text-muted">Ketuk station di denah untuk melihat detail, game, dan menyewakan.</p> : (
            <StationPanel station={station} info={info} tz={tz}
              onStart={() => setDlg('start')} onExtend={() => setDlg('extend')} onBook={() => setDlg('book')} onFinish={() => setDlg('finish')}
              onStartBooking={(b) => { try { update((s) => startSession(s, { tableId: b.tableId, customerName: b.name, choice: { kind: 'duration', minutes: b.durationMinutes }, label: b.label, price: b.price, graceMinutes: settings.graceMinutes, tz, now: new Date(), paid: b.paid })); setNote(`Sewa ${station.name} dimulai dari booking ${b.name}.`); } catch (e) { setNote(e instanceof Error ? e.message : 'Gagal memulai.'); } }}
              onPaid={(b) => update((s) => markBookingPaid(s, b.id))}
              onCancel={(b) => { update((s) => cancelBooking(s, b.id)); setNote(`Booking ${b.name} dibatalkan.`); }}
              bookingLink={(b) => waLink(b, station, settings, tz)}
            />
          )}
        </aside>
      </div>

      {dlg === 'start' && station && <ChoiceDialog title={`Sewa ${station.name}`} action="Mulai sewa" station={station} packages={packages} settings={settings} tz={tz} withName onClose={closeDlg}
        onConfirm={({ choice, label, price, name }) => { try { update((s) => startSession(s, { tableId: station.tableId, customerName: name, choice, label, price, graceMinutes: settings.graceMinutes, tz, now: new Date() })); setNote(`Sewa ${station.name} dimulai.`); closeDlg(); } catch (e) { setNote(e instanceof Error ? e.message : 'Gagal memulai.'); closeDlg(); } }} />}
      {dlg === 'extend' && station && info?.session && <ChoiceDialog title={`Tambah waktu ${station.name}`} action="Tambah waktu" station={station} packages={packages} settings={settings} tz={tz} extendFrom={new Date(Math.max(new Date(info.session.endsAt).getTime(), now.getTime()))} onClose={closeDlg}
        onConfirm={({ choice, label, price }) => { const mins = choice.kind === 'duration' ? choice.minutes : (choice.pkg.durationMinutes ?? 0); update((s) => extendSession(s, info.session!.id, { minutes: mins, label, price, now: new Date() })); setNote(`Waktu ${station.name} ditambah ${durText(mins)}.`); closeDlg(); }} />}
      {dlg === 'book' && station && <BookingDialog station={station} packages={packages} settings={settings} tz={tz} ctx={ctx} onClose={closeDlg}
        onSave={(i) => { update((s) => addBooking(s, { ...i, now: new Date(), expiryMinutes: settings.bookingExpiryMinutes })); }} />}
      {dlg === 'finish' && station && info?.session && (
        <Modal title={`Selesai ${station.name}`} onClose={closeDlg}>
          <ul className="m-0 p-0 list-none space-y-4">{info.session.parts.map((p, i) => <li key={i} className="flex justify-between gap-12 text-sm"><span>{p.label}</span><span className="cg-num">{formatRp(p.price)}</span></li>)}</ul>
          <p className="flex justify-between font-bold m-0 mt-8 pt-8 border-t border-border"><span>Total sewa</span><span className="cg-num">{formatRp(info.session.total)}</span></p>
          <p className="text-sm text-text-muted">{info.session.paid ? 'Sudah dibayar lewat booking.' : 'Pembayaran dan nota PS menyusul di tahap berikutnya. Untuk sekarang sesi hanya ditutup di tablet ini.'}</p>
          <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={closeDlg}>Batal</button><button className="cg-btn cg-btn--primary" onClick={() => { update((s) => finishSession(s, info.session!.id)); setNote(`Sesi ${station.name} ditutup.`); closeDlg(); }}>Tutup sesi</button></div>
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
  return bookingWhatsAppLink(b.phone, msg);
}

function StationPanel({ station, info, tz, onStart, onExtend, onBook, onFinish, onStartBooking, onPaid, onCancel, bookingLink }: {
  station: PsStation; info: PsBoardInfo; tz: string; onStart: () => void; onExtend: () => void; onBook: () => void; onFinish: () => void;
  onStartBooking: (b: PsBooking) => void; onPaid: (b: PsBooking) => void; onCancel: (b: PsBooking) => void; bookingLink: (b: PsBooking) => string | null;
}) {
  const s = info.session, b = info.booking;
  return (
    <>
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0"><h3 className="m-0 text-base font-bold break-words">{station.name}</h3><p className="m-0 text-xs text-text-muted">{station.consoleLabel} · {formatRp(station.ratePerHour)} per jam</p></div>
        <span className="cg-badge shrink-0" style={{ borderColor: TABLE_COLOR_CONFIG[STATE_COLOR[info.state]].hexColor }}>{STATE_LABEL[info.state]}</span>
      </div>
      {s && (
        <div className="space-y-4">
          <p className="m-0 text-3xl font-bold cg-num" aria-live="off">{info.waiting ? 'Persiapan' : formatPsDuration(info.seconds ?? 0)}</p>
          <p className="m-0 text-xs text-text-muted">{info.state === 'lewat' ? 'Lewat waktu, tegur pelanggan atau tambah waktu' : info.waiting ? `Waktu dihitung mulai ${hm(s.billableStart, tz)}` : 'sisa waktu'} · selesai {hm(s.endsAt, tz)}</p>
          <p className="m-0 text-sm">{s.customerName ? `Penyewa ${s.customerName} · ` : ''}{s.parts.map((p) => p.label).join(' + ')}</p>
          <p className="m-0 text-sm cg-num">Sewa {formatRp(s.total)} · {s.paid ? 'Lunas' : 'Belum bayar'}</p>
        </div>
      )}
      {b && !s && (
        <div className="space-y-4">
          <p className="m-0 font-semibold">{b.name}</p>
          <p className="m-0 text-sm">{new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(b.startAt))}, {hm(b.startAt, tz)} · {durText(b.durationMinutes)} · {formatRp(b.price)}</p>
          <p className="m-0 text-sm">{b.paid ? <span className="text-success-strong">Lunas</span> : <span className="text-warning-strong">Menunggu transfer sampai {hm(b.expiresAt, tz)}</span>}</p>
        </div>
      )}
      <div>
        <p className="m-0 mb-4 text-xs text-text-muted flex items-center gap-4">Game di station ini</p>
        {station.games.length === 0 ? <p className="m-0 text-sm text-text-muted">Belum ada daftar game.</p> : <div className="flex flex-wrap gap-4">{station.games.map((g) => <span key={g} className="cg-badge">{g}</span>)}</div>}
      </div>
      <div className="flex flex-wrap gap-8">
        {info.state === 'perawatan' && <p className="m-0 text-sm text-text-muted">Station sedang perawatan dan tidak bisa disewa.</p>}
        {(info.state === 'kosong' || info.state === 'booking') && !s && <button className="cg-btn cg-btn--primary" onClick={onStart}>Mulai sewa</button>}
        {info.state !== 'perawatan' && !s && <button className="cg-btn cg-btn--secondary" onClick={onBook}>Booking</button>}
        {b && !s && <button className="cg-btn cg-btn--secondary" onClick={() => onStartBooking(b)}>Mulai dari booking</button>}
        {b && !s && !b.paid && <button className="cg-btn cg-btn--secondary" onClick={() => onPaid(b)}>Tandai lunas</button>}
        {b && !s && !b.paid && bookingLink(b) && <a className="cg-btn cg-btn--secondary" href={bookingLink(b)!} target="_blank" rel="noreferrer">Kirim WhatsApp</a>}
        {b && !s && <button className="cg-btn cg-btn--ghost" onClick={() => onCancel(b)}>Batalkan booking</button>}
        {s && <button className="cg-btn cg-btn--primary" onClick={onExtend}>Tambah waktu</button>}
        {s && <button className="cg-btn cg-btn--secondary" disabled title="Menempel ke nota pelanggan di tahap berikutnya">Tambah makanan</button>}
        {s && <button className="cg-btn cg-btn--secondary" onClick={onFinish}>Selesai</button>}
      </div>
    </>
  );
}

interface ChoiceResult { choice: PsChoice; label: string; price: number; name?: string }
interface Option { id: string; choice: PsChoice; label: string; sub: string; price: number }

/** Pilih paket atau durasi (harga dari tarif per jam dan pita jam) untuk mulai sewa atau tambah waktu. */
function ChoiceDialog({ title, action, station, packages, settings, tz, withName, extendFrom, onClose, onConfirm }: {
  title: string; action: string; station: PsStation; packages: PsPackage[]; settings: PsSettings; tz: string; withName?: boolean; extendFrom?: Date;
  onClose: () => void; onConfirm: (r: ChoiceResult) => void;
}) {
  const [now] = useState(() => new Date());
  const [name, setName] = useState('');
  const options = useMemo<Option[]>(() => {
    const at = extendFrom ?? now;
    const list: Option[] = [];
    for (const p of sortedPackages(packages)) {
      if (!packageApplies(p, station.tableId, at, tz)) continue;
      if (extendFrom && p.windowStartMin !== undefined) continue;
      const choice: PsChoice = { kind: 'package', pkg: p };
      const sch = sessionSchedule(at, extendFrom ? 0 : settings.graceMinutes, choice, tz);
      list.push({ id: `p-${p.id}`, choice, label: p.name, sub: p.windowStartMin !== undefined ? `selesai tepat ${hm(sch.endsAt, tz)}` : `${durText(p.durationMinutes ?? 0)} · selesai ${hm(sch.endsAt, tz)}`, price: priceForChoice(station, choice, sch, tz) });
    }
    for (const m of QUICK_MINUTES) {
      const choice: PsChoice = { kind: 'duration', minutes: m };
      const sch = sessionSchedule(at, extendFrom ? 0 : settings.graceMinutes, choice, tz);
      list.push({ id: `d-${m}`, choice, label: durText(m), sub: `${hm(sch.billableStart, tz)} sampai ${hm(sch.endsAt, tz)}`, price: priceForDuration(station, sch.billableStart, m, tz) });
    }
    return list;
  }, [packages, station, tz, settings.graceMinutes, extendFrom, now]);
  const [pick, setPick] = useState(options[0]?.id ?? '');
  const opt = options.find((o) => o.id === pick);
  return (
    <Modal title={title} onClose={onClose}>
      {!extendFrom && <p className="text-sm text-text-muted m-0">Ada tenggang {settings.graceMinutes} menit untuk persiapan: sewa baru dihitung {hm(new Date(now.getTime() + settings.graceMinutes * 60000), tz)}.</p>}
      <div role="radiogroup" aria-label="Pilihan sewa" className="grid gap-8 mt-8">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} onClick={() => setPick(o.id)}
            className={`flex items-center justify-between gap-12 text-left p-12 rounded-lg border cursor-pointer ${pick === o.id ? 'border-accent ring-2 ring-accent' : 'border-border'}`}>
            <span className="min-w-0"><strong className="block">{o.label}</strong><span className="text-xs text-text-muted">{o.sub}</span></span>
            <span className="cg-num font-bold shrink-0">{formatRp(o.price)}</span>
          </button>
        ))}
      </div>
      {withName && <div className="cg-field mt-12"><label className="cg-label" htmlFor="ps-name">Nama penyewa (boleh kosong)</label><input id="ps-name" className="cg-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>}
      <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button className="cg-btn cg-btn--primary" disabled={!opt} onClick={() => opt && onConfirm({ choice: opt.choice, label: opt.label, price: opt.price, ...(name.trim() ? { name } : {}) })}>{action}{opt ? ` · ${formatRp(opt.price)}` : ''}</button></div>
    </Modal>
  );
}

/** Booking dibayar penuh lewat transfer: simpan, lalu kirim pesan lewat tautan wa.me yang tinggal diklik. */
function BookingDialog({ station, packages, settings, tz, ctx, onClose, onSave }: {
  station: PsStation; packages: PsPackage[]; settings: PsSettings; tz: string; ctx: OutletContext; onClose: () => void;
  onSave: (b: Omit<PsBooking, 'id' | 'paid' | 'createdAt' | 'expiresAt'>) => void;
}) {
  const data = useData();
  const bank = useAsync(async () => { try { const i = (await data.getOutletSettings()).info; return i.bankName && i.bankAccountNumber ? `${i.bankName} ${i.bankAccountNumber}${i.bankAccountName ? ` a.n. ${i.bankAccountName}` : ''}` : ''; } catch { return ''; } }, [data]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('19:00');
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
  const price = sch ? priceForChoice(station, choice, sch, tz) : 0;
  const dur = sch?.durationMinutes ?? 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Nama pemesan wajib diisi.');
    if (!startOk || !sch) return setErr('Tanggal atau jam tidak valid.');
    if (startAt.getTime() < Date.now() - 5 * 60000) return setErr('Waktu booking sudah lewat.');
    if (!applies) return setErr('Paket itu tidak berlaku pada hari atau jam yang dipilih.');
    if (dur <= 0) return setErr('Durasi tidak valid.');
    const rec = { tableId: station.tableId, name: name.trim(), phone: phone.trim(), startAt: startAt.toISOString(), durationMinutes: dur, label: pkg ? pkg.name : durText(dur), price };
    try { onSave(rec); setSaved({ ...rec, id: 'x', paid: false, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + settings.bookingExpiryMinutes * 60000).toISOString() }); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan booking.'); }
  }
  void ctx;
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
        </div>
        <p className="m-0 flex justify-between font-bold"><span>Total yang harus ditransfer</span><span className="cg-num">{formatRp(price)}</span></p>
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button type="submit" className="cg-btn cg-btn--primary">Simpan booking</button></div>
      </form>
    </Modal>
  );
}

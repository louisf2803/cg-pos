'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Clock, Gamepad2, Plus, Trash2 } from 'lucide-react';
import {
  PS_DEFAULT_BOOKING_MESSAGE, PS_WEEKDAY_LABEL, formatClock, formatRp, parseClock, psPackageProblem, psSettingsProblem, psStationProblem,
  type PsPackage, type PsRateBand, type PsSettings, type PsStation,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

type Tab = 'station' | 'paket' | 'umum';
type DayKey = 'all' | 'weekday' | 'weekend';
const DAY_SETS: Record<DayKey, { label: string; days?: number[] }> = {
  all: { label: 'Setiap hari' },
  weekday: { label: 'Senin sampai Jumat', days: [1, 2, 3, 4, 5] },
  weekend: { label: 'Sabtu dan Minggu', days: [6, 0] },
};
const dayKeyOf = (days?: number[]): DayKey => {
  if (!days || days.length === 0 || days.length === 7) return 'all';
  const s = [...days].sort().join();
  return s === '1,2,3,4,5' ? 'weekday' : s === '0,6' ? 'weekend' : 'all';
};
const dayText = (days?: number[]) => (!days || days.length === 0 ? 'Setiap hari' : DAY_SETS[dayKeyOf(days)].label === 'Setiap hari' ? days.map((d) => PS_WEEKDAY_LABEL[d]).join(', ') : DAY_SETS[dayKeyOf(days)].label);
const durText = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : m > 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`);

export default function PsPage() {
  const data = useData();
  const [tab, setTab] = useState<Tab>('station');
  const [notice, setNotice] = useState('');
  const [editStation, setEditStation] = useState<PsStation | null>(null);
  const [editPackage, setEditPackage] = useState<PsPackage | 'new' | null>(null);

  const state = useAsync(async () => {
    const [stations, packages, settings, floors] = await Promise.all([data.listPsStations(), data.listPsPackages(), data.getPsSettings(), data.listFloors()]);
    return { stations, packages, settings, hasPsFloor: floors.some((f) => f.kind === 'ps') };
  }, [data]);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Station PS"
        subtitle="Atur tarif per jam, pita jam, paket, daftar game, dan aturan booking untuk rental PS di kafe. Denah station diatur di Denah dan meja (lantai berjenis PS)."
        actions={tab === 'paket' ? <button type="button" className="cg-btn cg-btn--primary" onClick={() => setEditPackage('new')}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah paket</button> : undefined}
      />
      {notice && <div role="status" className="cg-banner cg-banner--success flex items-center justify-between"><span>{notice}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNotice('')}>Tutup</button></div>}
      <div className="cg-tabs" role="tablist" aria-label="Pengaturan PS">
        {([['station', 'Station'], ['paket', 'Paket'], ['umum', 'Aturan umum']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="cg-tab" onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {state.status === 'loading' && <div className="cg-card p-24 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}

      {state.status === 'ready' && tab === 'station' && (
        state.data.stations.length === 0 ? (
          <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
            <Gamepad2 className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
            <p className="font-bold m-0">{state.data.hasPsFloor ? 'Lantai PS belum punya meja' : 'Belum ada lantai PS'}</p>
            <p className="text-sm text-text-muted mx-auto max-w-[460px]">{state.data.hasPsFloor ? 'Tambahkan meja di lantai PS; tiap meja menjadi satu station.' : 'Buat lantai berjenis PS di Denah dan meja, lalu tambahkan satu meja untuk tiap station PS.'}</p>
            <Link href="/pengaturan/denah" className="cg-btn cg-btn--secondary mt-12 inline-flex">Buka Denah dan meja</Link>
          </div>
        ) : (
          <div className="grid gap-12 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {state.data.stations.map((s) => (
              <section key={s.tableId} className="cg-card p-16 space-y-8 min-w-0" aria-label={`Station ${s.name}`}>
                <div className="flex items-start justify-between gap-8">
                  <div className="min-w-0"><h2 className="text-base font-bold m-0 break-words">{s.name}</h2><p className="text-xs text-text-muted m-0">{s.consoleLabel}</p></div>
                  {!s.configured ? <span className="cg-badge cg-badge--warning">Belum diatur</span> : s.isMaintenance ? <span className="cg-badge">Perawatan</span> : <span className="cg-badge cg-badge--accent">Aktif</span>}
                </div>
                <p className="m-0 text-sm cg-num">{formatRp(s.ratePerHour)} per jam{s.bands.length > 0 ? ` · ${s.bands.length} pita jam` : ''}</p>
                <p className="m-0 text-xs text-text-muted">{s.games.length > 0 ? `${s.games.length} game: ${s.games.slice(0, 3).join(', ')}${s.games.length > 3 ? '…' : ''}` : 'Belum ada daftar game'}</p>
                <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setEditStation(s)} aria-label={`Atur ${s.name}`}>Atur</button>
              </section>
            ))}
          </div>
        )
      )}

      {state.status === 'ready' && tab === 'paket' && (
        state.data.packages.length === 0 ? (
          <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border"><Clock className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden /><p className="font-bold m-0">Belum ada paket</p><p className="text-sm text-text-muted m-0">Tanpa paket, kasir memilih durasi dan harga mengikuti tarif per jam station.</p></div>
        ) : (
          <div className="cg-card overflow-hidden"><div className="overflow-x-auto min-w-0"><table className="cg-data w-full">
            <thead><tr className="border-b border-border bg-surface text-xs font-semibold text-text-muted"><th className="py-12 px-16 text-left">Paket</th><th className="py-12 px-16 text-left">Aturan</th><th className="py-12 px-16 text-right">Harga</th><th className="py-12 px-16 text-left">Station</th><th className="py-12 px-16 text-right">Tindakan</th></tr></thead>
            <tbody>{state.data.packages.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="py-12 px-16 font-medium">{p.name}{!p.isActive && <span className="cg-badge ml-8">Nonaktif</span>}</td>
                <td className="py-12 px-16 text-sm">{p.windowStartMin !== undefined ? `Jam ${formatClock(p.windowStartMin)} sampai ${formatClock(p.windowEndMin!)}, selesai tepat di akhir jendela` : durText(p.durationMinutes ?? 0)} · {dayText(p.weekdays)}</td>
                <td className="py-12 px-16 text-right cg-num">{formatRp(p.price)}</td>
                <td className="py-12 px-16 text-sm">{p.tableIds.length === 0 ? 'Semua station' : `${p.tableIds.length} station`}</td>
                <td className="py-12 px-16 text-right"><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setEditPackage(p)} aria-label={`Ubah ${p.name}`}>Ubah</button></td>
              </tr>))}</tbody>
          </table></div></div>
        )
      )}

      {state.status === 'ready' && tab === 'umum' && <SettingsForm initial={state.data.settings} onSaved={() => { setNotice('Aturan umum PS disimpan.'); state.reload(); }} />}

      {editStation && <StationDialog station={editStation} onClose={() => setEditStation(null)} onSaved={() => { setEditStation(null); setNotice(`Station ${editStation.name} disimpan.`); state.reload(); }} />}
      {editPackage && state.status === 'ready' && (
        <PackageDialog pkg={editPackage === 'new' ? undefined : editPackage} stations={state.data.stations} onClose={() => setEditPackage(null)} onSaved={(m) => { setEditPackage(null); setNotice(m); state.reload(); }} />
      )}
    </div>
  );
}

function StationDialog({ station, onClose, onSaved }: { station: PsStation; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [label, setLabel] = useState(station.consoleLabel);
  const [rate, setRate] = useState(String(station.ratePerHour || ''));
  const [maint, setMaint] = useState(station.isMaintenance);
  const [games, setGames] = useState(station.games.join('\n'));
  const [bands, setBands] = useState(() => station.bands.map((b) => ({ start: formatClock(b.startMin), end: formatClock(b.endMin), rate: String(b.ratePerHour), day: dayKeyOf(b.weekdays) })));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed: PsRateBand[] = [];
    for (const b of bands) {
      const s = parseClock(b.start), en = parseClock(b.end);
      if (s === null || en === null) return setErr('Isi jam pita dengan format JJ:MM, mis. 17:00 (24:00 untuk tengah malam).');
      parsed.push({ startMin: s, endMin: en, ratePerHour: Number(b.rate.replace(/\D/g, '')), ...(DAY_SETS[b.day].days ? { weekdays: DAY_SETS[b.day].days } : {}) });
    }
    const input = { tableId: station.tableId, consoleLabel: label, ratePerHour: Number(rate.replace(/\D/g, '')) || 0, isMaintenance: maint, games: games.split('\n').map((g) => g.trim()).filter(Boolean), bands: parsed };
    const bad = psStationProblem(input);
    if (bad) return setErr(bad);
    setBusy(true); setErr('');
    try { await data.savePsStation(input); onSaved(); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }
  const upd = (i: number, patch: Partial<(typeof bands)[number]>) => { setBands((p) => p.map((b, k) => (k === i ? { ...b, ...patch } : b))); setErr(''); };

  return (
    <dialog {...dlg.props} aria-labelledby="ps-st-title" className="cg-modal w-full">
      <form onSubmit={(e) => void submit(e)} className="space-y-16">
        <h2 id="ps-st-title" className="cg-modal__title">Atur {station.name}</h2>
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
        <div className="grid gap-12 grid-cols-1 tablet:grid-cols-2">
          <div className="cg-field"><label className="cg-label" htmlFor="ps-label">Tipe konsol</label><input id="ps-label" className="cg-input" maxLength={30} value={label} onChange={(e) => { setLabel(e.target.value); setErr(''); }} placeholder="mis. PS5" /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="ps-rate">Tarif per jam (Rp)</label><input id="ps-rate" className="cg-input" inputMode="numeric" value={rate} onChange={(e) => { setRate(e.target.value); setErr(''); }} placeholder="10000" /></div>
        </div>
        <fieldset className="space-y-8 border-0 p-0 m-0">
          <legend className="text-sm font-semibold mb-4">Pita jam dengan tarif berbeda</legend>
          <p className="text-xs text-text-muted m-0">Di luar pita memakai tarif per jam di atas. Sesi yang melewati batas pita dihitung per menit sesuai pita. Pita yang melewati tengah malam dibuat dua (mis. 22:00 sampai 24:00 dan 00:00 sampai 02:00).</p>
          {bands.map((b, i) => (
            <div key={i} className="grid gap-8 grid-cols-2 tablet:grid-cols-[90px_90px_1fr_1fr_auto] items-end">
              <div className="cg-field"><label className="cg-label" htmlFor={`b-s-${i}`}>Mulai</label><input id={`b-s-${i}`} className="cg-input" value={b.start} onChange={(e) => upd(i, { start: e.target.value })} placeholder="17:00" /></div>
              <div className="cg-field"><label className="cg-label" htmlFor={`b-e-${i}`}>Selesai</label><input id={`b-e-${i}`} className="cg-input" value={b.end} onChange={(e) => upd(i, { end: e.target.value })} placeholder="24:00" /></div>
              <div className="cg-field"><label className="cg-label" htmlFor={`b-r-${i}`}>Tarif per jam</label><input id={`b-r-${i}`} className="cg-input" inputMode="numeric" value={b.rate} onChange={(e) => upd(i, { rate: e.target.value })} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor={`b-d-${i}`}>Hari</label><select id={`b-d-${i}`} className="cg-input" value={b.day} onChange={(e) => upd(i, { day: e.target.value as DayKey })}>{(Object.keys(DAY_SETS) as DayKey[]).map((k) => <option key={k} value={k}>{DAY_SETS[k].label}</option>)}</select></div>
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setBands((p) => p.filter((_, k) => k !== i))} aria-label={`Hapus pita ${i + 1}`}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
            </div>
          ))}
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setBands((p) => [...p, { start: '17:00', end: '24:00', rate: '', day: 'all' }])}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah pita</button>
        </fieldset>
        <div className="cg-field"><label className="cg-label" htmlFor="ps-games">Daftar game di station ini</label><textarea id="ps-games" className="cg-input" rows={5} value={games} onChange={(e) => setGames(e.target.value)} placeholder={'Satu game per baris\nEA FC 25\nTekken 8'} /><p className="text-xs text-text-muted m-0">Tampil di kasir saat station diketuk.</p></div>
        <label className="flex items-center gap-8 text-sm cursor-pointer"><input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> Sedang perawatan (tidak bisa disewa atau dibooking)</label>
        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function PackageDialog({ pkg, stations, onClose, onSaved }: { pkg?: PsPackage; stations: PsStation[]; onClose: () => void; onSaved: (m: string) => void }) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [name, setName] = useState(pkg?.name ?? '');
  const [kind, setKind] = useState<'duration' | 'window'>(pkg?.windowStartMin !== undefined ? 'window' : 'duration');
  const [minutes, setMinutes] = useState(String(pkg?.durationMinutes ?? 120));
  const [from, setFrom] = useState(pkg?.windowStartMin !== undefined ? formatClock(pkg.windowStartMin) : '18:00');
  const [to, setTo] = useState(pkg?.windowEndMin !== undefined ? formatClock(pkg.windowEndMin) : '21:00');
  const [price, setPrice] = useState(String(pkg?.price ?? ''));
  const [tableIds, setTableIds] = useState<string[]>(pkg?.tableIds ?? []);
  const [day, setDay] = useState<DayKey>(dayKeyOf(pkg?.weekdays));
  const [active, setActive] = useState(pkg?.isActive ?? true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ws = parseClock(from), we = parseClock(to);
    if (kind === 'window' && (ws === null || we === null)) return setErr('Isi jam dengan format JJ:MM, mis. 18:00.');
    const input = {
      id: pkg?.id, name, price: Number(price.replace(/\D/g, '')) || 0, tableIds, isActive: active, sort: pkg?.sort ?? 0,
      ...(kind === 'duration' ? { durationMinutes: Number(minutes) } : { windowStartMin: ws!, windowEndMin: we! }),
      ...(DAY_SETS[day].days ? { weekdays: DAY_SETS[day].days } : {}),
    };
    const bad = psPackageProblem(input);
    if (bad) return setErr(bad);
    setBusy(true); setErr('');
    try { await data.savePsPackage(input); onSaved(`Paket ${name.trim()} disimpan.`); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }
  async function remove() {
    if (!pkg || busy) return;
    setBusy(true); setErr('');
    try { await data.deletePsPackage(pkg.id); onSaved(`Paket ${pkg.name} dihapus.`); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menghapus.'); setBusy(false); }
  }

  return (
    <dialog {...dlg.props} aria-labelledby="ps-pk-title" className="cg-modal w-full">
      <form onSubmit={(e) => void submit(e)} className="space-y-16">
        <h2 id="ps-pk-title" className="cg-modal__title">{pkg ? 'Ubah paket' : 'Tambah paket'}</h2>
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
        <div className="cg-field"><label className="cg-label" htmlFor="pk-name">Nama paket</label><input id="pk-name" className="cg-input" autoFocus maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="mis. Paket 3 jam atau Malam 18.00-21.00" /></div>
        <div className="flex gap-8" role="radiogroup" aria-label="Jenis paket">
          <button type="button" role="radio" aria-checked={kind === 'duration'} className={`cg-btn cg-btn--sm ${kind === 'duration' ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setKind('duration')}>Durasi tetap</button>
          <button type="button" role="radio" aria-checked={kind === 'window'} className={`cg-btn cg-btn--sm ${kind === 'window' ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setKind('window')}>Jendela jam</button>
        </div>
        {kind === 'duration' ? (
          <div className="cg-field"><label className="cg-label" htmlFor="pk-min">Durasi (menit)</label><input id="pk-min" className="cg-input" inputMode="numeric" value={minutes} onChange={(e) => { setMinutes(e.target.value); setErr(''); }} /><p className="text-xs text-text-muted m-0">Waktu mulai dihitung setelah tenggang awal; mis. 120 untuk 2 jam.</p></div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-12 grid-cols-2">
              <div className="cg-field"><label className="cg-label" htmlFor="pk-from">Jendela mulai</label><input id="pk-from" className="cg-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor="pk-to">Jendela selesai</label><input id="pk-to" className="cg-input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <p className="text-xs text-text-muted m-0">Berlaku hanya bila mulai di dalam jendela, dan selalu selesai tepat di jam selesai walau pelanggan datang terlambat. Harganya tetap.</p>
          </div>
        )}
        <div className="grid gap-12 grid-cols-1 tablet:grid-cols-2">
          <div className="cg-field"><label className="cg-label" htmlFor="pk-price">Harga paket (Rp)</label><input id="pk-price" className="cg-input" inputMode="numeric" value={price} onChange={(e) => { setPrice(e.target.value); setErr(''); }} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="pk-day">Hari berlaku</label><select id="pk-day" className="cg-input" value={day} onChange={(e) => setDay(e.target.value as DayKey)}>{(Object.keys(DAY_SETS) as DayKey[]).map((k) => <option key={k} value={k}>{DAY_SETS[k].label}</option>)}</select></div>
        </div>
        <fieldset className="space-y-4 border-0 p-0 m-0">
          <legend className="text-sm font-semibold mb-4">Station yang boleh memakai</legend>
          <p className="text-xs text-text-muted m-0">Tanpa centang = semua station.</p>
          <div className="flex flex-wrap gap-x-16 gap-y-4">{stations.map((s) => (
            <label key={s.tableId} className="flex items-center gap-6 text-sm cursor-pointer"><input type="checkbox" checked={tableIds.includes(s.tableId)} onChange={() => setTableIds((p) => (p.includes(s.tableId) ? p.filter((x) => x !== s.tableId) : [...p, s.tableId]))} /> {s.name}</label>
          ))}</div>
        </fieldset>
        <label className="flex items-center gap-8 text-sm cursor-pointer"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Paket aktif (muncul di kasir)</label>
        <div className="cg-modal__actions flex items-center justify-between gap-8 pt-8 border-t border-border">
          <div>{pkg && <button type="button" className="cg-btn cg-btn--ghost text-danger" onClick={() => void remove()} disabled={busy}>Hapus</button>}</div>
          <div className="flex gap-8"><button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={busy}>Batal</button><button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
        </div>
      </form>
    </dialog>
  );
}

function SettingsForm({ initial, onSaved }: { initial: PsSettings; onSaved: () => void }) {
  const data = useData();
  const [grace, setGrace] = useState(String(initial.graceMinutes));
  const [expiry, setExpiry] = useState(String(initial.bookingExpiryMinutes));
  const [msg, setMsg] = useState(initial.bookingMessage ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: PsSettings = { graceMinutes: Number(grace), bookingExpiryMinutes: Number(expiry), ...(msg.trim() ? { bookingMessage: msg.trim() } : {}) };
    const bad = psSettingsProblem(input);
    if (bad) return setErr(bad);
    setBusy(true); setErr('');
    try { await data.savePsSettings(input); onSaved(); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
    setBusy(false);
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="cg-card p-24 space-y-16 max-w-[640px]">
      {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
      <div className="grid gap-12 grid-cols-1 tablet:grid-cols-2">
        <div className="cg-field"><label className="cg-label" htmlFor="ps-grace">Tenggang awal (menit)</label><input id="ps-grace" className="cg-input" inputMode="numeric" value={grace} onChange={(e) => { setGrace(e.target.value); setErr(''); }} /><p className="text-xs text-text-muted m-0">Waktu persiapan sebelum sewa mulai dihitung. Mulai 15.21 dengan tenggang 5 menit dihitung dari 15.26.</p></div>
        <div className="cg-field"><label className="cg-label" htmlFor="ps-exp">Booking hangus bila belum lunas (menit)</label><input id="ps-exp" className="cg-input" inputMode="numeric" value={expiry} onChange={(e) => { setExpiry(e.target.value); setErr(''); }} /><p className="text-xs text-text-muted m-0">Dihitung sejak booking dibuat.</p></div>
      </div>
      <div className="cg-field">
        <label className="cg-label" htmlFor="ps-msg">Pesan WhatsApp untuk pembayaran booking</label>
        <textarea id="ps-msg" className="cg-input" rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={PS_DEFAULT_BOOKING_MESSAGE} />
        <p className="text-xs text-text-muted m-0">Bagian yang diisi otomatis: {'{nama}'} {'{station}'} {'{tanggal}'} {'{jam}'} {'{durasi}'} {'{total}'} {'{batas}'} {'{rekening}'}. Kosongkan untuk memakai pesan bawaan.</p>
      </div>
      <div className="flex justify-end"><button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
    </form>
  );
}

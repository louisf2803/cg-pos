import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  PS_WEEKDAY_LABEL, blockHours, bookingWhatsAppLink, dayRangeUtc, fillBookingMessage, formatRp, packageApplies, priceForChoice, psBlocks, sessionSchedule, timelineHours, zonedTime,
  type PsBlock, type PsBoard, type PsBookingRow, type PsChoice, type PsPackage, type PsSettings, type PsStation, type StaffMe,
} from '@cgpos/shared';
import { PS_TZ, loadPsBoard, loadPsPackages, loadPsSettings, loadPsStations, saveBooking } from './ps-api';
import { todayJakarta } from './api';
import { Btn, c, s } from './ui';

const uuid = (): string => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.floor(Math.random() * 16); return (ch === 'x' ? r : (r % 4) + 8).toString(16); });
const HOUR_H = 56;
const COL_W = 112;
const AXIS_W = 46;
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const addDays = (d: string, n: number): string => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const longDay = (d: string) => `${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dow(d)]}, ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const hm = (d: Date | string) => new Intl.DateTimeFormat('id-ID', { timeZone: PS_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)).replace(':', '.');
const durText = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : m > 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`);
const KIND_COLOR: Record<PsBlock['kind'], { bg: string; border: string; ink: string }> = {
  running: { bg: '#DDF5E7', border: '#1E8E5A', ink: '#0F5132' }, warning: { bg: '#FFF1CF', border: '#C98A12', ink: '#6B4408' }, overtime: { bg: '#FDE3E0', border: '#C0392B', ink: '#8F2418' },
  finished: { bg: '#EEE9E0', border: '#CFC7B8', ink: '#6B6256' }, 'booking-paid': { bg: '#DDEFFA', border: '#2F6FB5', ink: '#1F4F86' }, 'booking-unpaid': { bg: '#F2F8FD', border: '#2F6FB5', ink: '#1F4F86' },
};

interface Data { stations: PsStation[]; packages: PsPackage[]; settings: PsSettings }

/** Jadwal PS: kolom per konsol, jam di kiri (seperti kalender). Semua karyawan melihat; manajer dan pemilik membuat, melunasi, dan membatalkan booking. */
export function JadwalPs({ me }: { me: StaffMe }) {
  const manager = me.role === 'owner' || me.role === 'manager';
  const [outletId, setOutletId] = useState(me.outlets[0]?.id ?? '');
  const [base, setBase] = useState<Data | null>(null);
  const [board, setBoard] = useState<PsBoard | null>(null);
  const [err, setErr] = useState('');
  const [day, setDay] = useState(() => todayJakarta());
  const [now, setNow] = useState(() => new Date());
  const [sel, setSel] = useState<PsBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => dayRangeUtc(day, PS_TZ), [day]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let alive = true;
    if (!outletId) return;
    Promise.all([loadPsStations(outletId), loadPsPackages(outletId), loadPsSettings(outletId)]).then(([stations, packages, settings]) => { if (alive) setBase({ stations, packages, settings }); }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat konsol PS.'); });
    return () => { alive = false; };
  }, [outletId]);
  const reload = useCallback(async () => {
    if (!outletId) return;
    try { setBoard(await loadPsBoard(outletId, range.from, range.to)); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal memuat jadwal.'); }
  }, [outletId, range]);
  useEffect(() => { void reload(); const t = setInterval(() => void reload(), 30000); return () => clearInterval(t); }, [reload]);

  const blocks = useMemo(() => (board ? psBlocks(board.sessions, board.bookings, now) : []), [board, now]);
  const hours = useMemo(() => timelineHours(blocks, range.from, PS_TZ), [blocks, range]);
  const isToday = day === todayJakarta();
  const today = todayJakarta();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  if (!base) return err ? <Text style={{ color: c.bad }}>{err}</Text> : <ActivityIndicator color={c.accent} />;
  if (base.stations.length === 0) return <Text style={s.muted}>Belum ada konsol PS di outlet ini.</Text>;
  const nowH = (now.getTime() - range.from.getTime()) / 3600000;
  const colH = (hours.end - hours.start) * HOUR_H;
  const bookingOf = (b: PsBlock): PsBookingRow | undefined => board?.bookings.find((x) => x.id === b.id);
  const stationOf = (id: string) => base.stations.find((x) => x.tableId === id);

  async function act(row: PsBookingRow, patch: Partial<PsBookingRow>) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await saveBooking(outletId, { ...row, ...patch, rev: row.rev + 1 }); setSel(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan.'); }
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View><Text style={s.h1}>Jadwal PS</Text><Text style={s.muted}>{base.stations.length} konsol</Text></View>
        {manager && <Btn small label="+ Booking" onPress={() => setCreating(true)} />}
      </View>
      {me.outlets.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{me.outlets.map((o) => <Pressable key={o.id} onPress={() => setOutletId(o.id)} style={[s.chip, o.id === outletId && { backgroundColor: c.accent }]}><Text style={{ color: o.id === outletId ? '#fff' : c.ink }}>{o.name}</Text></Pressable>)}</ScrollView>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Hari sebelumnya" onPress={() => setDay((d) => addDays(d, -1))} style={[s.chip, { paddingHorizontal: 16 }]}><Text style={{ color: c.ink, fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ fontWeight: '700', color: c.ink }}>{longDay(day)}</Text>
        <Pressable accessibilityLabel="Hari berikutnya" onPress={() => setDay((d) => addDays(d, 1))} style={[s.chip, { paddingHorizontal: 16 }]}><Text style={{ color: c.ink, fontSize: 18 }}>›</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {week.map((d) => <Pressable key={d} onPress={() => setDay(d)} style={[s.chip, d === day && { backgroundColor: c.accent }]}><Text style={{ color: d === day ? '#fff' : c.ink, fontWeight: '600' }}>{DAYS[dow(d)]} {Number(d.slice(8))}</Text></Pressable>)}
      </ScrollView>
      {err ? <Text style={{ color: c.bad }} accessibilityRole="alert">{err}</Text> : null}

      <View style={[s.card, { flex: 1, padding: 0, overflow: 'hidden' }]}>
        <ScrollView>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: AXIS_W, paddingTop: 30 }}>
              {Array.from({ length: hours.end - hours.start }, (_, i) => <View key={i} style={{ height: HOUR_H }}><Text style={{ fontSize: 11, color: c.muted, textAlign: 'right', paddingRight: 6, marginTop: -7 }}>{String((hours.start + i) % 24).padStart(2, '0')}.00</Text></View>)}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={{ flexDirection: 'row', height: 30, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: '#FBF9F5' }}>
                  {base.stations.map((st) => <View key={st.tableId} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '700', color: c.ink, fontSize: 12.5 }}>{st.name}</Text></View>)}
                </View>
                <View style={{ flexDirection: 'row', height: colH }}>
                  {base.stations.map((st) => (
                    <View key={st.tableId} style={{ width: COL_W, borderLeftWidth: 1, borderLeftColor: c.line }}>
                      {Array.from({ length: hours.end - hours.start }, (_, i) => <View key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: 1, backgroundColor: '#EFE9DF' }} />)}
                      {st.isMaintenance ? <View style={{ position: 'absolute', top: 6, bottom: 6, left: 4, right: 4, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9B2A4', backgroundColor: '#F2EEE6', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>PERAWATAN</Text></View> : null}
                      {!st.isMaintenance && blocks.filter((b) => b.tableId === st.tableId).map((b) => {
                        const h = blockHours(b, range.from);
                        const top = (Math.max(h.start, hours.start) - hours.start) * HOUR_H, bottom = (Math.min(h.end, hours.end) - hours.start) * HOUR_H;
                        if (bottom <= top) return null;
                        const col = KIND_COLOR[b.kind];
                        return (
                          <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${st.name}, ${b.title}, ${hm(b.start)} sampai ${hm(b.end)}`} onPress={() => setSel(b)}
                            style={{ position: 'absolute', top: top + 1, height: Math.max(22, bottom - top - 2), left: 3, right: 3, borderRadius: 8, backgroundColor: col.bg, borderWidth: b.kind === 'booking-paid' || b.kind === 'running' ? 1.5 : 1, borderColor: col.border, borderStyle: b.kind === 'booking-unpaid' ? 'dashed' : 'solid', padding: 5, overflow: 'hidden' }}>
                            <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: col.ink }}>{b.title}</Text>
                            {bottom - top > 40 && <Text numberOfLines={1} style={{ fontSize: 10.5, color: col.ink }}>{hm(b.start)}–{hm(b.end)}</Text>}
                            {bottom - top > 56 && b.source === 'booking' && <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '600', color: col.ink }}>{b.paid ? 'Lunas' : 'Belum lunas'}</Text>}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {isToday && nowH >= hours.start && nowH <= hours.end && <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: COL_W * base.stations.length, top: (nowH - hours.start) * HOUR_H, height: 2, backgroundColor: '#D6246E' }} />}
                </View>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setSel(null)} accessibilityLabel="Tutup" />
        {sel && (() => {
          const st = stationOf(sel.tableId); const bk = bookingOf(sel); const col = KIND_COLOR[sel.kind];
          const link = bk && st && bk.phone ? bookingWhatsAppLink(bk.phone, fillBookingMessage(base.settings.bookingMessage, { nama: bk.name, station: st.name, tanggal: `${Number(bk.startAt.slice(8, 10))} ${MONTHS[Number(bk.startAt.slice(5, 7)) - 1]}`, jam: hm(bk.startAt), durasi: durText(bk.durationMinutes), total: formatRp(bk.price), batas: hm(bk.expiresAt), rekening: 'rekening outlet' })) : null;
          return (
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View><Text style={s.h2}>{sel.title} · {st?.name}</Text><Text style={s.muted}>{sel.source === 'booking' ? 'Booking' : 'Sewa berjalan'}{bk?.createdByName ? ` oleh ${bk.createdByName}` : ''}</Text></View>
                <Text style={{ fontWeight: '700', color: col.ink, backgroundColor: col.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>{sel.kind === 'running' ? 'Berjalan' : sel.kind === 'warning' ? 'Hampir habis' : sel.kind === 'overtime' ? 'Lewat waktu' : sel.kind === 'finished' ? 'Selesai' : sel.paid ? 'Lunas' : 'Belum lunas'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[['WAKTU', `${hm(sel.start)} – ${hm(sel.end)}`], ['DURASI', durText(Math.round((sel.end.getTime() - sel.start.getTime()) / 60000))], ...(bk ? [['TOTAL', formatRp(bk.price)], ['WHATSAPP', bk.phone ?? '—']] : [])].map(([l, v]) => (
                  <View key={l} style={{ width: '48%', borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 8, backgroundColor: '#FBF9F5' }}><Text style={{ fontSize: 10.5, color: c.muted, letterSpacing: 0.8 }}>{l}</Text><Text style={{ fontWeight: '700', color: c.ink }}>{v}</Text></View>
                ))}
              </View>
              {bk && manager && (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {link && <View style={{ flex: 1 }}><Btn label="Kirim WhatsApp" onPress={() => void Linking.openURL(link)} /></View>}
                    {!bk.paid && <View style={{ flex: 1 }}><Btn label="Tandai lunas" ghost disabled={busy} onPress={() => void act(bk, { paid: true })} /></View>}
                  </View>
                  <Btn label="Batalkan booking" ghost disabled={busy} onPress={() => void act(bk, { status: 'cancelled' })} />
                </View>
              )}
              {!manager && <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Hanya manajer dan pemilik yang bisa mengubah booking.</Text>}
              <Btn label="Tutup" ghost onPress={() => setSel(null)} />
            </View>
          );
        })()}
      </Modal>

      {creating && <BookingForm outletId={outletId} data={base} blocks={blocks} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await reload(); }} day={day} />}
    </View>
  );
}

function BookingForm({ outletId, data, blocks, day, onClose, onSaved }: { outletId: string; data: Data; blocks: PsBlock[]; day: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const open = data.stations.filter((x) => !x.isMaintenance);
  const [tableId, setTableId] = useState(open[0]?.tableId ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(day < todayJakarta() ? todayJakarta() : day);
  const [time, setTime] = useState('19:00');
  const [minutes, setMinutes] = useState(120);
  const [pkgId, setPkgId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const station = data.stations.find((x) => x.tableId === tableId);
  const startAt = zonedTime(date, time, PS_TZ);
  const pkg = data.packages.find((p) => p.id === pkgId);
  const choice: PsChoice = pkg ? { kind: 'package', pkg } : { kind: 'duration', minutes };
  const sch = startAt ? sessionSchedule(startAt, 0, choice, PS_TZ) : null;
  const applies = !pkg || (!!startAt && !!station && packageApplies(pkg, station.tableId, startAt, PS_TZ));
  const price = station && sch ? priceForChoice(station, choice, sch, PS_TZ) : 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayJakarta(), i));
  const times = Array.from({ length: 28 }, (_, i) => `${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const pkgs = data.packages.filter((p) => p.tableIds.length === 0 || p.tableIds.includes(tableId));

  async function submit() {
    if (busy || !station || !startAt || !sch) return;
    if (!name.trim()) return setErr('Nama pemesan wajib diisi.');
    if (startAt.getTime() < Date.now() - 5 * 60000) return setErr('Waktu booking sudah lewat.');
    if (!applies) return setErr('Paket itu tidak berlaku pada hari atau jam yang dipilih.');
    const clash = blocks.find((b) => b.tableId === tableId && b.kind !== 'finished' && b.occupiedFrom.getTime() < sch.endsAt.getTime() && startAt.getTime() < b.end.getTime());
    if (clash) return setErr(`Bentrok dengan ${clash.title} (${hm(clash.start)}–${hm(clash.end)}).`);
    setBusy(true); setErr('');
    try {
      const id = uuid();
      await saveBooking(outletId, { id, tableId, name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), startAt: startAt.toISOString(), durationMinutes: sch.durationMinutes, label: pkg ? pkg.name : durText(sch.durationMinutes), price, paid: false, status: 'active', expiresAt: new Date(Date.now() + data.settings.bookingExpiryMinutes * 60000).toISOString(), rev: 1 });
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}>
        <ScrollView style={{ maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 18, gap: 10 }}>
          <Text style={s.h2}>Booking baru</Text>
          <Text style={s.muted}>Dibayar penuh lewat transfer; hangus bila belum lunas dalam {durText(data.settings.bookingExpiryMinutes)}.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{open.map((x) => <Pressable key={x.tableId} onPress={() => { setTableId(x.tableId); setPkgId(''); }} style={[s.chip, x.tableId === tableId && { backgroundColor: c.accent }]}><Text style={{ color: x.tableId === tableId ? '#fff' : c.ink }}>{x.name}</Text></Pressable>)}</ScrollView>
          <TextInput style={s.input} placeholder="Nama pemesan" value={name} onChangeText={(v) => { setName(v); setErr(''); }} />
          <TextInput style={s.input} placeholder="Nomor WhatsApp" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Text style={s.muted}>Tanggal: <Text style={{ color: c.ink, fontWeight: '700' }}>{longDay(date)}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{days.map((d) => <Pressable key={d} onPress={() => { setDate(d); setErr(''); }} style={[s.chip, d === date && { backgroundColor: c.accent }]}><Text style={{ color: d === date ? '#fff' : c.ink }}>{DAYS[dow(d)]} {Number(d.slice(8))}</Text></Pressable>)}</ScrollView>
          <Text style={s.muted}>Jam mulai: <Text style={{ color: c.ink, fontWeight: '700' }}>{time.replace(':', '.')}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{times.map((t) => <Pressable key={t} onPress={() => { setTime(t); setErr(''); }} style={[s.chip, t === time && { backgroundColor: c.accent }]}><Text style={{ color: t === time ? '#fff' : c.ink }}>{t.replace(':', '.')}</Text></Pressable>)}</ScrollView>
          <Text style={s.muted}>Durasi atau paket</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[60, 90, 120, 180].map((m) => <Pressable key={m} onPress={() => { setMinutes(m); setPkgId(''); setErr(''); }} style={[s.chip, !pkgId && minutes === m && { backgroundColor: c.accent }]}><Text style={{ color: !pkgId && minutes === m ? '#fff' : c.ink }}>{durText(m)}</Text></Pressable>)}
            {pkgs.map((p) => <Pressable key={p.id} onPress={() => { setPkgId(p.id); setErr(''); }} style={[s.chip, pkgId === p.id && { backgroundColor: c.accent }]}><Text style={{ color: pkgId === p.id ? '#fff' : c.ink }}>{p.name}{p.weekdays ? ` (${p.weekdays.map((d) => PS_WEEKDAY_LABEL[d]).join(', ')})` : ''}</Text></Pressable>)}
          </ScrollView>
          {!applies ? <Text style={{ color: c.bad }}>Paket itu tidak berlaku pada hari atau jam yang dipilih.</Text> : null}
          <Text style={{ fontWeight: '800', fontSize: 18, color: c.ink }}>Total transfer {formatRp(price)}</Text>
          {err ? <Text style={{ color: c.bad }} accessibilityRole="alert">{err}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn ghost label="Batal" onPress={onClose} /></View><View style={{ flex: 1.5 }}><Btn label={busy ? 'Menyimpan…' : 'Simpan booking'} disabled={busy || !name.trim()} onPress={() => void submit()} /></View></View>
        </ScrollView>
      </View>
    </Modal>
  );
}

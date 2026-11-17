import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  LEAVE_KIND_LABEL, REQUEST_STATUS_LABEL, SWAP_STATUS_LABEL, leaveEarliestStart, leaveProblem, staffAppRole,
  type LeaveKind, type StaffMe, type StaffRequests, type StaffScheduleDay,
} from '@cgpos/shared';
import {
  approveAdvance, cancelAdvance, cancelLeave, cancelSwap, createAdvance, createLeave, createSwap, decideLeave, loadNotices, loadOverview, loadPayslips, loadRequests, loadSchedule,
  managerDecide, partnerDecide, rejectAdvance, todayJakarta, type Notice, type Payslip,
} from './api';
import { Btn, c, s } from './ui';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const addDays = (d: string, n: number): string => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const fmtDay = (d: string) => `${DAYS[dow(d)]}, ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const rp = (n: number) => `Rp ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const range = (a: string, b: string) => (a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);
const statusColor = (st: string) => (st === 'approved' ? c.ok : st === 'rejected' || st === 'cancelled' ? c.bad : c.warn);

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={[s.chip, on && { backgroundColor: c.accent }]}><Text style={{ color: on ? '#fff' : c.ink }}>{label}</Text></Pressable>;
}

function DatePick({ label, value, onChange, from, days = 30 }: { label: string; value: string; onChange: (d: string) => void; from: string; days?: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.muted}>{label}: <Text style={{ color: c.ink, fontWeight: '700' }}>{value ? fmtDay(value) : 'pilih tanggal'}</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {Array.from({ length: days }, (_, i) => addDays(from, i)).map((d) => <Chip key={d} label={`${DAYS[dow(d)]} ${Number(d.slice(8))}`} on={d === value} onPress={() => onChange(d)} />)}
      </ScrollView>
    </View>
  );
}

function Badge({ status, label }: { status: string; label: string }) {
  return <Text style={{ color: statusColor(status), fontWeight: '700', fontSize: 12 }}>{label}</Text>;
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; err: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { let live = true; fn().then((d) => { if (live) { setData(d); setErr(''); } }).catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Gagal memuat.'); }); return () => { live = false; }; }, [n, ...deps]);
  return { data, err, reload: () => setN((x) => x + 1) };
}

async function pickProof(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Izin galeri dibutuhkan untuk memilih bukti transfer.');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  return r.canceled || !r.assets[0] ? null : r.assets[0].uri;
}

type Seg = 'cuti' | 'kasbon' | 'tukar' | 'putusan';

export function Pengajuan({ me }: { me: StaffMe }) {
  const role = staffAppRole(me.role);
  const q = useAsync(loadRequests, []);
  const [seg, setSeg] = useState<Seg>('cuti');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const req = q.data;

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); q.reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal.'); }
    setBusy(false);
  }, [busy, q]);

  if (!req) return q.err ? <Text style={{ color: c.bad }}>{q.err}</Text> : <ActivityIndicator color={c.accent} />;
  const myPartner = req.swaps.filter((x) => x.partnerId === me.employeeId && x.status === 'pending_partner');
  const mgrSwaps = role !== 'employee' ? req.swaps.filter((x) => x.status === 'pending_manager' && x.requesterId !== me.employeeId && x.partnerId !== me.employeeId) : [];
  const ownerLeave = role === 'owner' ? req.leave.filter((x) => x.status === 'pending') : [];
  const ownerAdv = role === 'owner' ? req.advances.filter((x) => x.status === 'pending') : [];
  const todo = myPartner.length + mgrSwaps.length + ownerLeave.length + ownerAdv.length;
  const segs: [Seg, string][] = [['cuti', 'Cuti'], ['kasbon', 'Kasbon'], ['tukar', 'Tukar shift'], ['putusan', todo ? `Putusan (${todo})` : 'Putusan']];

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
      <Text style={s.h1}>Pengajuan</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{segs.map(([k, l]) => <Chip key={k} label={l} on={seg === k} onPress={() => setSeg(k)} />)}</ScrollView>
      {err ? <Text style={{ color: c.bad }} accessibilityRole="alert">{err}</Text> : null}
      {seg === 'cuti' && <LeaveSection req={req} me={me} busy={busy} run={run} />}
      {seg === 'kasbon' && <AdvanceSection req={req} me={me} busy={busy} run={run} />}
      {seg === 'tukar' && <SwapSection req={req} me={me} busy={busy} run={run} />}
      {seg === 'putusan' && <Putusan me={me} role={role} myPartner={myPartner} mgrSwaps={mgrSwaps} ownerLeave={ownerLeave} ownerAdv={ownerAdv} busy={busy} run={run} />}
    </ScrollView>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;
interface SecProps { req: StaffRequests; me: StaffMe; busy: boolean; run: Run }

function Card({ children }: { children: ReactNode }) { return <View style={s.card}>{children}</View>; }

function LeaveSection({ req, me, busy, run }: SecProps) {
  const today = todayJakarta();
  const [kind, setKind] = useState<LeaveKind>('leave');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const from = leaveEarliestStart(kind, today);
  const problem = start && end ? leaveProblem({ kind, start, end, reason: reason || '-', today }) : null;
  const mine = req.leave.filter((x) => x.employeeId === me.employeeId);
  return (
    <>
      <Card>
        <Text style={s.h2}>Ajukan cuti, izin, atau sakit</Text>
        <Text style={s.muted}>Cuti dan izin paling lambat 2 hari sebelumnya, maksimal 2 orang per hari. Sakit tanpa surat dokter.</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>{(['leave', 'permit', 'sick'] as LeaveKind[]).map((k) => <Chip key={k} label={LEAVE_KIND_LABEL[k]} on={kind === k} onPress={() => { setKind(k); setStart(''); setEnd(''); }} />)}</View>
        <DatePick label="Mulai" value={start} from={from} onChange={(d) => { setStart(d); if (!end || end < d) setEnd(d); }} />
        {start ? <DatePick label="Selesai" value={end} from={start} days={14} onChange={setEnd} /> : null}
        <TextInput style={s.input} placeholder="Alasan" value={reason} onChangeText={setReason} multiline />
        {problem ? <Text style={{ color: c.bad }}>{problem}</Text> : null}
        <Btn label="Kirim pengajuan" disabled={busy || !start || !end || !reason.trim() || !!problem} onPress={() => void run(async () => { await createLeave(kind, start, end, reason.trim()); setStart(''); setEnd(''); setReason(''); })} />
      </Card>
      <Text style={s.h2}>Pengajuanku</Text>
      {mine.length === 0 && <Text style={s.muted}>Belum ada pengajuan.</Text>}
      {mine.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{LEAVE_KIND_LABEL[x.kind]} · {range(x.startDate, x.endDate)}</Text>
          <Text style={s.muted}>{x.reason}</Text>
          <Badge status={x.status} label={REQUEST_STATUS_LABEL[x.status]} />
          {x.note ? <Text style={s.muted}>Catatan: {x.note}</Text> : null}
          {x.status === 'pending' && <Btn small ghost label="Batalkan" disabled={busy} onPress={() => void run(() => cancelLeave(x.id))} />}
        </Card>
      ))}
    </>
  );
}

function AdvanceSection({ req, me, busy, run }: SecProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const mine = req.advances.filter((x) => x.employeeId === me.employeeId);
  const n = Number(amount.replace(/\D/g, ''));
  return (
    <>
      <Card>
        <Text style={s.h2}>Ajukan kasbon</Text>
        <Text style={s.muted}>Tanpa batas nominal, tetapi hanya satu kasbon aktif. Pemilik menyetujui dan mentransfer; cicilan dipotong dari gaji.</Text>
        <TextInput style={s.input} placeholder="Nominal (Rp)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        {n > 0 ? <Text style={s.muted}>{rp(n)}</Text> : null}
        <TextInput style={s.input} placeholder="Keperluan" value={reason} onChangeText={setReason} multiline />
        <Btn label="Kirim pengajuan" disabled={busy || n <= 0 || !reason.trim()} onPress={() => void run(async () => { await createAdvance(n, reason.trim()); setAmount(''); setReason(''); })} />
      </Card>
      <Text style={s.h2}>Kasbonku</Text>
      {mine.length === 0 && <Text style={s.muted}>Belum ada pengajuan.</Text>}
      {mine.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{rp(x.amount)}</Text>
          <Text style={s.muted}>{x.reason}</Text>
          <Badge status={x.status} label={REQUEST_STATUS_LABEL[x.status]} />
          {x.note ? <Text style={s.muted}>Catatan: {x.note}</Text> : null}
          {x.status === 'pending' && <Btn small ghost label="Batalkan" disabled={busy} onPress={() => void run(() => cancelAdvance(x.id))} />}
        </Card>
      ))}
    </>
  );
}

function SwapSection({ req, me, busy, run }: SecProps) {
  const today = todayJakarta();
  const [partner, setPartner] = useState('');
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [reason, setReason] = useState('');
  const list = req.swaps.filter((x) => x.requesterId === me.employeeId || x.partnerId === me.employeeId);
  return (
    <>
      <Card>
        <Text style={s.h2}>Ajak tukar shift</Text>
        <Text style={s.muted}>Pilih rekan, harimu yang diserahkan, dan hari rekan yang kamu ambil. Rekan setuju dulu, lalu manajer (bila kamu manajer, cukup rekan). Jadwal berubah otomatis setelah disetujui.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{req.teammates.map((t) => <Chip key={t.id} label={t.name} on={partner === t.id} onPress={() => setPartner(t.id)} />)}</ScrollView>
        <DatePick label="Hariku yang diserahkan" value={mine} from={today} onChange={setMine} />
        <DatePick label="Hari rekan yang kuambil" value={theirs} from={today} onChange={setTheirs} />
        <TextInput style={s.input} placeholder="Alasan (boleh kosong)" value={reason} onChangeText={setReason} />
        <Btn label="Kirim ajakan" disabled={busy || !partner || !mine || !theirs || mine === theirs} onPress={() => void run(async () => { await createSwap(partner, mine, theirs, reason.trim() || undefined); setMine(''); setTheirs(''); setReason(''); })} />
      </Card>
      <Text style={s.h2}>Tukar shiftku</Text>
      {list.length === 0 && <Text style={s.muted}>Belum ada tukar shift.</Text>}
      {list.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{x.requesterName} ⇄ {x.partnerName}</Text>
          <Text style={s.muted}>{x.requesterName} menyerahkan {fmtDay(x.requesterDate)}; {x.partnerName} menyerahkan {fmtDay(x.partnerDate)}</Text>
          <Badge status={x.status === 'pending_partner' || x.status === 'pending_manager' ? 'pending' : x.status} label={SWAP_STATUS_LABEL[x.status]} />
          {x.note ? <Text style={s.muted}>Catatan: {x.note}</Text> : null}
          {x.requesterId === me.employeeId && (x.status === 'pending_partner' || x.status === 'pending_manager') && <Btn small ghost label="Batalkan" disabled={busy} onPress={() => void run(() => cancelSwap(x.id))} />}
        </Card>
      ))}
    </>
  );
}

function Putusan({ me, role, myPartner, mgrSwaps, ownerLeave, ownerAdv, busy, run }: { me: StaffMe; role: string; myPartner: StaffRequests['swaps']; mgrSwaps: StaffRequests['swaps']; ownerLeave: StaffRequests['leave']; ownerAdv: StaffRequests['advances']; busy: boolean; run: Run }) {
  const [note, setNote] = useState<{ title: string; onOk: (n: string) => Promise<unknown> } | null>(null);
  const [text, setText] = useState('');
  const nothing = !myPartner.length && !mgrSwaps.length && !ownerLeave.length && !ownerAdv.length;
  return (
    <>
      {nothing && <Text style={s.muted}>Tidak ada yang menunggu keputusanmu.</Text>}
      {myPartner.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{x.requesterName} mengajak tukar shift</Text>
          <Text style={s.muted}>Kamu bekerja {fmtDay(x.requesterDate)}, {x.requesterName} bekerja {fmtDay(x.partnerDate)}.</Text>
          {x.reason ? <Text style={s.muted}>{x.reason}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn small label="Setuju" disabled={busy} onPress={() => void run(() => partnerDecide(x.id, true))} /><Btn small ghost label="Tolak" disabled={busy} onPress={() => void run(() => partnerDecide(x.id, false))} /></View>
        </Card>
      ))}
      {mgrSwaps.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>Tukar shift {x.requesterName} ⇄ {x.partnerName}</Text>
          <Text style={s.muted}>{x.requesterName} menyerahkan {fmtDay(x.requesterDate)}; {x.partnerName} menyerahkan {fmtDay(x.partnerDate)}. Rekan sudah setuju.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn small label="Setujui" disabled={busy} onPress={() => void run(() => managerDecide(x.id, true))} /><Btn small ghost label="Tolak" disabled={busy} onPress={() => { setText(''); setNote({ title: 'Alasan menolak tukar shift', onOk: (n) => managerDecide(x.id, false, n) }); }} /></View>
        </Card>
      ))}
      {ownerLeave.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{x.employeeName} · {LEAVE_KIND_LABEL[x.kind]}</Text>
          <Text style={s.muted}>{range(x.startDate, x.endDate)} · {x.reason}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}><Btn small label="Setujui" disabled={busy} onPress={() => void run(() => decideLeave(x.id, true))} /><Btn small ghost label="Tolak" disabled={busy} onPress={() => { setText(''); setNote({ title: 'Alasan menolak izin', onOk: (n) => decideLeave(x.id, false, n) }); }} /></View>
        </Card>
      ))}
      {ownerAdv.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{x.employeeName} · kasbon {rp(x.amount)}</Text>
          <Text style={s.muted}>{x.reason}</Text>
          <Text style={s.muted}>Transfer dulu, lalu pilih foto bukti transfer untuk menyetujui.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small label="Setujui + bukti" disabled={busy || role !== 'owner'} onPress={() => void run(async () => { const uri = await pickProof(); if (uri) await approveAdvance(me, x, uri); })} />
            <Btn small ghost label="Tolak" disabled={busy} onPress={() => { setText(''); setNote({ title: 'Alasan menolak kasbon', onOk: (n) => rejectAdvance(x.id, n) }); }} />
          </View>
        </Card>
      ))}
      <Modal visible={!!note} transparent animationType="fade" onRequestClose={() => setNote(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { gap: 10 }]}>
            <Text style={s.h2}>{note?.title}</Text>
            <TextInput style={s.input} placeholder="Catatan (boleh kosong)" value={text} onChangeText={setText} multiline />
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <Btn ghost small label="Batal" onPress={() => setNote(null)} />
              <Btn small label="Kirim" onPress={() => { const n = note; setNote(null); if (n) void run(() => n.onOk(text.trim())); }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function Jadwal() {
  const today = todayJakarta();
  const q = useAsync(() => loadSchedule(today, addDays(today, 20)), [today]);
  if (!q.data) return q.err ? <Text style={{ color: c.bad }}>{q.err}</Text> : <ActivityIndicator color={c.accent} />;
  return (
    <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
      <Text style={s.h1}>Jadwalku</Text>
      <Text style={s.muted}>21 hari ke depan. Absen hanya lewat tablet kasir.</Text>
      {q.data.map((d: StaffScheduleDay) => (
        <View key={d.date} style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }]}>
          <Text style={{ color: c.ink, fontWeight: d.date === today ? '800' : '500' }}>{fmtDay(d.date)}{d.date === today ? ' (hari ini)' : ''}</Text>
          <Text style={{ color: d.startTime ? c.ink : c.muted }}>{d.startTime ? `Masuk ${d.startTime}` : 'Libur'}{d.swapped ? ' · tukar' : ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function Slip() {
  const q = useAsync(loadPayslips, []);
  if (!q.data) return q.err ? <Text style={{ color: c.bad }}>{q.err}</Text> : <ActivityIndicator color={c.accent} />;
  return (
    <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      <Text style={s.h1}>Slip gaji</Text>
      {q.data.length === 0 && <Text style={s.muted}>Belum ada slip gaji yang dibayarkan.</Text>}
      {q.data.map((p: Payslip) => (
        <Card key={`${p.year}-${p.month}`}>
          <Text style={s.h2}>{MONTH_FULL[p.month - 1]} {p.year}</Text>
          {([['Gaji pokok', p.basic], ['Uang makan', p.meal], ['BPJS (potongan)', -p.bpjs], ['Bonus dan insentif', p.bonus], ['Komisi', p.commission], ['Denda', -p.penalty], ['Potongan kasbon', -p.advance]] as [string, number][]).filter(([, v]) => v !== 0).map(([l, v]) => (
            <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.muted}>{l}</Text><Text style={{ color: v < 0 ? c.bad : c.ink }}>{v < 0 ? `− ${rp(-v)}` : rp(v)}</Text></View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 }}><Text style={{ fontWeight: '800', color: c.ink }}>Gaji bersih</Text><Text style={{ fontWeight: '800', color: c.ink }}>{rp(p.net)}</Text></View>
        </Card>
      ))}
    </ScrollView>
  );
}

export function Pesan({ me }: { me: StaffMe }) {
  const q = useAsync(() => loadNotices(me.employeeId), [me.employeeId]);
  if (!q.data) return q.err ? <Text style={{ color: c.bad }}>{q.err}</Text> : <ActivityIndicator color={c.accent} />;
  return (
    <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      <Text style={s.h1}>Pesan</Text>
      {q.data.length === 0 && <Text style={s.muted}>Belum ada pesan.</Text>}
      {q.data.map((n: Notice) => <Card key={n.id}><Text style={{ fontWeight: '700', color: c.ink }}>{n.title}</Text><Text style={s.muted}>{n.body}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{n.createdAt.slice(0, 16).replace('T', ' ')}</Text></Card>)}
    </ScrollView>
  );
}

export function Pantau({ goDecide }: { goDecide: () => void }) {
  const q = useAsync(loadOverview, []);
  if (!q.data) return q.err ? <Text style={{ color: c.bad }}>{q.err}</Text> : <ActivityIndicator color={c.accent} />;
  const o = q.data;
  const total = o.outlets.reduce((a, x) => a + x.sales, 0);
  const orders = o.outlets.reduce((a, x) => a + x.orders, 0);
  const max = Math.max(1, ...o.series.map((x) => x.sales));
  const waiting = o.pending.leave + o.pending.advances + o.pending.swaps;
  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
      <Text style={s.h1}>Pantau</Text>
      <Card>
        <Text style={s.muted}>Penjualan hari ini ({fmtDay(o.date)})</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: c.ink }}>{rp(total)}</Text>
        <Text style={s.muted}>{orders} transaksi terbayar</Text>
      </Card>
      {waiting > 0 && (
        <Pressable style={[s.card, { borderColor: c.warn }]} onPress={goDecide} accessibilityRole="button">
          <Text style={s.h2}>{waiting} menunggu keputusan</Text>
          <Text style={s.muted}>{o.pending.leave} izin · {o.pending.advances} kasbon · {o.pending.swaps} tukar shift (manajer)</Text>
        </Pressable>
      )}
      <Card>
        <Text style={s.h2}>7 hari terakhir</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {o.series.map((x) => (
            <View key={x.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <View accessibilityLabel={`${fmtDay(x.day)}: ${rp(x.sales)}`} style={{ width: '100%', height: Math.max(3, (x.sales / max) * 96), backgroundColor: x.day === o.date ? c.accent : c.line, borderRadius: 4 }} />
              <Text style={{ fontSize: 10, color: c.muted, marginTop: 4 }}>{DAYS[dow(x.day)]}</Text>
            </View>
          ))}
        </View>
      </Card>
      {o.outlets.map((x) => (
        <Card key={x.id}>
          <Text style={s.h2}>{x.name}</Text>
          <Text style={{ color: c.ink }}>{rp(x.sales)} · {x.orders} transaksi</Text>
          <Text style={s.muted}>Kasir buka: {x.openShifts.length ? x.openShifts.map((k) => k.cashier).join(', ') : 'tidak ada shift terbuka'}</Text>
          <Text style={s.muted}>Sedang absen masuk: {x.clockedIn.length ? x.clockedIn.join(', ') : 'tidak ada'}</Text>
          {x.tasks.length === 0 ? <Text style={s.muted}>Tugas hari ini: belum dibuka tim</Text> : x.tasks.map((t) => <Text key={t.phase} style={{ color: t.done === t.total ? c.ok : c.warn }}>Tugas {t.phase === 'opening' ? 'Opening' : 'Closing'}: {t.done}/{t.total}</Text>)}
        </Card>
      ))}
    </ScrollView>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { TASK_PHASE_LABEL, staffAppRole, taskProgress, type StaffMe, type TaskItem, type TaskRun } from '@cgpos/shared';
import { completeItem, configured, loadMe, loadToday, signIn, signOut, skipItem, supabase, todayJakarta, uploadTaskPhoto } from './src/api';

const c = { bg: '#faf7f2', card: '#ffffff', ink: '#2b2118', muted: '#7a6a5b', line: '#e6ddd0', accent: '#8a4b1f', ok: '#2f7d4f', warn: '#b7791f', bad: '#b3261e' };
const ROLE_NAME = { owner: 'Pemilik', manager: 'Manajer', employee: 'Karyawan' } as const;

type Tab = 'beranda' | 'tugas' | 'saya';

export default function App() {
  const [phase, setPhase] = useState<'boot' | 'login' | 'unlinked' | 'ready'>('boot');
  const [me, setMe] = useState<StaffMe | null>(null);
  const [tab, setTab] = useState<Tab>('beranda');

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setMe(null); setPhase('login'); return; }
    try {
      const m = await loadMe();
      setMe(m); setPhase(m ? 'ready' : 'unlinked');
    } catch { setPhase('login'); }
  }, []);

  useEffect(() => { if (configured) void refresh(); else setPhase('login'); }, [refresh]);

  if (phase === 'boot') return <Center><ActivityIndicator color={c.accent} /></Center>;
  if (phase === 'login') return <Login onDone={refresh} />;
  if (phase === 'unlinked' || !me) {
    return <Center><Text style={s.h1}>Akun belum ditautkan</Text><Text style={s.muted}>Minta manajer menautkan akun ini ke data karyawan (Dashboard, Karyawan, Akun aplikasi karyawan).</Text><Btn label="Keluar" onPress={async () => { await signOut(); await refresh(); }} /></Center>;
  }
  const role = staffAppRole(me.role);
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.body}>
        {tab === 'beranda' && <Beranda me={me} role={role} go={setTab} />}
        {tab === 'tugas' && <Tugas me={me} />}
        {tab === 'saya' && <Saya me={me} role={role} onOut={async () => { await signOut(); await refresh(); }} />}
      </View>
      <View style={s.tabs}>
        {(['beranda', 'tugas', 'saya'] as Tab[]).map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={s.tab}>
            <Text style={[s.tabText, tab === t && { color: c.accent, fontWeight: '700' }]}>{t === 'beranda' ? 'Beranda' : t === 'tugas' ? 'Tugas tim' : 'Saya'}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true); setErr('');
    try { await signIn(email, pw); await onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal masuk.'); }
    setBusy(false);
  }
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.body, { justifyContent: 'center', gap: 12 }]}>
        <Text style={s.h1}>CG POS Karyawan</Text>
        <Text style={s.muted}>Masuk dengan email dan kata sandi yang diberikan manajer.</Text>
        {!configured && <Text style={{ color: c.bad }}>Aplikasi belum dikonfigurasi (EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY).</Text>}
        <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Kata sandi" secureTextEntry autoComplete="password" value={pw} onChangeText={setPw} onSubmitEditing={() => void go()} />
        {err ? <Text style={{ color: c.bad }} accessibilityRole="alert">{err}</Text> : null}
        <Btn label={busy ? 'Masuk…' : 'Masuk'} onPress={() => void go()} disabled={busy || !email.trim() || !pw || !configured} />
      </View>
    </SafeAreaView>
  );
}

function Beranda({ me, role, go }: { me: StaffMe; role: 'owner' | 'manager' | 'employee'; go: (t: Tab) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.h1}>Halo, {me.name}</Text>
      <Text style={s.muted}>{ROLE_NAME[role]} · {me.outlets.map((o) => o.name).join(', ') || 'belum ada outlet'}</Text>
      <Pressable style={s.card} onPress={() => go('tugas')} accessibilityRole="button">
        <Text style={s.h2}>Tugas tim hari ini</Text>
        <Text style={s.muted}>Centang tugas Opening dan Closing, unggah foto bukti.</Text>
      </Pressable>
      <View style={s.card}>
        <Text style={s.h2}>Segera hadir</Text>
        <Text style={s.muted}>Jadwal, slip gaji, pengajuan cuti, tukar shift dan kasbon{role !== 'employee' ? ', serta persetujuan' : ''}{role === 'owner' ? ' dan pantauan pendapatan' : ''}.</Text>
      </View>
    </View>
  );
}

function Tugas({ me }: { me: StaffMe }) {
  const [outletId, setOutletId] = useState(me.outlets[0]?.id ?? '');
  const [runs, setRuns] = useState<TaskRun[] | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [skipping, setSkipping] = useState<TaskItem | null>(null);
  const [reason, setReason] = useState('');
  const date = todayJakarta();

  const reload = useCallback(async () => {
    if (!outletId) { setRuns([]); return; }
    try { setRuns(await loadToday(outletId, date)); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal memuat tugas.'); }
  }, [outletId, date]);
  useEffect(() => { void reload(); }, [reload]);

  async function act(it: TaskItem) {
    if (busyId) return;
    setBusyId(it.id); setErr('');
    try {
      if (it.kind === 'photo') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error('Izin kamera dibutuhkan untuk foto bukti.');
        const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
        if (shot.canceled || !shot.assets[0]) { setBusyId(''); return; }
        const path = await uploadTaskPhoto(me, outletId, date, it.id, shot.assets[0].uri);
        await completeItem(it.id, me.employeeId, path);
      } else {
        await completeItem(it.id, me.employeeId);
      }
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan.'); }
    setBusyId('');
  }

  async function submitSkip() {
    if (!skipping) return;
    try { await skipItem(skipping.id, me.employeeId, reason.trim()); setSkipping(null); setReason(''); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal.'); setSkipping(null); }
  }
  const skip = (it: TaskItem) => { setReason(''); setSkipping(it); };

  if (!runs) return <ActivityIndicator color={c.accent} />;
  return (
    <>
    <Modal visible={!!skipping} transparent animationType="fade" onRequestClose={() => setSkipping(null)}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
        <View style={[s.card, { gap: 10 }]}>
          <Text style={s.h2}>Tidak bisa dikerjakan</Text>
          <Text style={s.muted}>{skipping?.title}</Text>
          <TextInput style={s.input} placeholder="Alasan (wajib)" value={reason} onChangeText={setReason} multiline />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Btn ghost small label="Batal" onPress={() => setSkipping(null)} />
            <Btn small label="Simpan" disabled={!reason.trim()} onPress={() => void submitSkip()} />
          </View>
        </View>
      </View>
    </Modal>
    <FlatList
      data={runs}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={<View style={{ gap: 8, marginBottom: 8 }}>
        <Text style={s.h1}>Tugas tim</Text>
        {me.outlets.length > 1 && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{me.outlets.map((o) => <Pressable key={o.id} onPress={() => setOutletId(o.id)} style={[s.chip, o.id === outletId && { backgroundColor: c.accent }]}><Text style={{ color: o.id === outletId ? '#fff' : c.ink }}>{o.name}</Text></Pressable>)}</View>}
        {err ? <Text style={{ color: c.bad }} accessibilityRole="alert">{err}</Text> : null}
      </View>}
      ListEmptyComponent={<Text style={s.muted}>Belum ada daftar tugas untuk outlet ini. Manajer mengaturnya di Dashboard.</Text>}
      renderItem={({ item: r }) => {
        const p = taskProgress(r.items);
        return (
          <View style={[s.card, { marginBottom: 12 }]}>
            <Text style={s.h2}>{TASK_PHASE_LABEL[r.phase]} · {p.done}/{p.total}</Text>
            {r.items.map((it) => (
              <View key={it.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink, fontWeight: '600' }}>{it.title}{it.kind === 'photo' ? ' 📷' : ''}</Text>
                  {it.status === 'done' && <Text style={{ color: c.ok, fontSize: 12 }}>Selesai</Text>}
                  {it.status === 'skipped' && <Text style={{ color: c.warn, fontSize: 12 }}>Tidak bisa: {it.skipReason}</Text>}
                </View>
                {it.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Btn small label={busyId === it.id ? '…' : it.kind === 'photo' ? 'Foto' : 'Centang'} onPress={() => void act(it)} />
                    {it.allowSkip && <Btn small ghost label="Tidak bisa" onPress={() => skip(it)} />}
                  </View>
                )}
              </View>
            ))}
          </View>
        );
      }}
    />
    </>
  );
}

function Saya({ me, role, onOut }: { me: StaffMe; role: 'owner' | 'manager' | 'employee'; onOut: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.h1}>Saya</Text>
      <View style={s.card}><Text style={s.h2}>{me.name}</Text><Text style={s.muted}>{ROLE_NAME[role]}</Text></View>
      <Btn label="Keluar" ghost onPress={onOut} />
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={[s.root, { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }]}>{children}</SafeAreaView>;
}

function Btn({ label, onPress, disabled, ghost, small }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.btn, small && { paddingVertical: 8, paddingHorizontal: 12 }, ghost && { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line }, disabled && { opacity: 0.5 }]}>
      <Text style={{ color: ghost ? c.ink : '#fff', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, padding: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: c.ink },
  h2: { fontSize: 16, fontWeight: '700', color: c.ink, marginBottom: 4 },
  muted: { color: c.muted },
  card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 14, gap: 6 },
  input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { color: c.muted },
});

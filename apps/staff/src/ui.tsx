import { Pressable, StyleSheet, Text } from 'react-native';

export const c = { bg: '#faf7f2', card: '#ffffff', ink: '#2b2118', muted: '#7a6a5b', line: '#e6ddd0', accent: '#8a4b1f', ok: '#2f7d4f', warn: '#b7791f', bad: '#b3261e' };

export function Btn({ label, onPress, disabled, ghost, small }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.btn, small && { paddingVertical: 8, paddingHorizontal: 12 }, ghost && { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line }, disabled && { opacity: 0.5 }]}>
      <Text style={{ color: ghost ? c.ink : '#fff', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}


export const s = StyleSheet.create({
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

import { devicePrefs } from './device-prefs';

let ctx: AudioContext | null = null;

/** Bunyi dua nada pendek. Dipakai bila notifikasi suara aktif di perangkat ini; `force` untuk tombol uji. Gagal diam-diam bila peramban menolak audio. */
export function playChime(force = false): void {
  if (!force && !devicePrefs.get().soundEnabled) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    void ctx.resume();
    const t0 = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.15);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + i * 0.16);
      osc.stop(t0 + i * 0.16 + 0.16);
    });
  } catch { /* audio tidak tersedia: abaikan */ }
}

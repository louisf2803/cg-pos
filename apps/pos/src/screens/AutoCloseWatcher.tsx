import { useEffect, useState } from 'react';
import { localDateKey, type Shift } from '@cgpos/shared';
import { useDevicePrefs } from '../lib/device-prefs';
import { Modal } from '../ui';

const SNOOZE_MS = 15 * 60_000;

/** Tanggal lokal dan jam HH:MM pada zona waktu outlet. */
export function tzParts(d: Date, tz: string): { date: string; time: string } {
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return { date: localDateKey(d, tz), time: t };
}

/**
 * Apakah pengingat tutup kasir harus tampil: fitur aktif, jam hari ini sudah lewat, dan shift dibuka SEBELUM jam itu pada hari ini
 * (shift yang baru dibuka setelah jam tutup tidak langsung diganggu).
 */
export function autoCloseDue(opts: { enabled: boolean; time: string; now: Date; shiftOpenedAt: string; tz: string }): boolean {
  if (!opts.enabled) return false;
  const n = tzParts(opts.now, opts.tz);
  if (n.time < opts.time) return false;
  const o = tzParts(new Date(opts.shiftOpenedAt), opts.tz);
  return !(o.date === n.date && o.time >= opts.time);
}

/**
 * Pengingat tutup kasir otomatis: pada jam yang diatur di Pengaturan > Kasir, kasir diminta menghitung uang di laci dan menutup kasir.
 * Nominal kas akhir tetap diisi kasir (tidak ada angka otomatis yang menyembunyikan selisih). "Nanti" menunda 15 menit.
 */
export function AutoCloseWatcher({ shift, timezone, onClose }: { shift: Shift; timezone: string; onClose: () => void }) {
  const prefs = useDevicePrefs();
  const [tick, setTick] = useState(0);
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 20_000); return () => clearInterval(t); }, []);
  void tick;
  const now = new Date();
  if (now.getTime() < snoozeUntil) return null;
  if (!autoCloseDue({ enabled: prefs.autoCloseEnabled, time: prefs.autoCloseTime, now, shiftOpenedAt: shift.openedAt, tz: timezone })) return null;
  return (
    <Modal title="Waktunya tutup kasir" onClose={() => setSnoozeUntil(Date.now() + SNOOZE_MS)}>
      <div className="grid gap-12">
        <p>Jam tutup kasir ({prefs.autoCloseTime}) sudah tiba. Hitung uang di laci, lalu tutup kasir supaya laporan hari ini lengkap.</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => setSnoozeUntil(Date.now() + SNOOZE_MS)}>Nanti (15 menit)</button>
          <button type="button" className="cg-btn cg-btn--primary" data-autofocus onClick={onClose}>Tutup kasir sekarang</button>
        </div>
      </div>
    </Modal>
  );
}

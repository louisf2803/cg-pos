import { useEffect, useRef } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Memanggil `onIdle` setelah `minutes` menit tanpa sentuhan, klik, atau tombol. 0 = mati.
 * Diperiksa tiap 5 detik dengan jam dinding (bukan satu timer panjang) supaya tetap tepat setelah tab sempat tertidur.
 * Selama offline kunci tidak dipasang, supaya kasir tidak terkunci tanpa bisa memeriksa PIN; begitu online lagi
 * dan sudah lewat waktunya, kunci terpasang.
 */
export function useIdleLock({ minutes, enabled, onIdle }: { minutes: number; enabled: boolean; onIdle: () => void }) {
  const last = useRef(Date.now());
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    last.current = Date.now();
    const bump = () => { last.current = Date.now(); };
    for (const e of EVENTS) addEventListener(e, bump, { passive: true, capture: true });
    const t = setInterval(() => {
      if (Date.now() - last.current < minutes * 60_000) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      cb.current();
    }, 5000);
    return () => { clearInterval(t); for (const e of EVENTS) removeEventListener(e, bump, { capture: true } as EventListenerOptions); };
  }, [enabled, minutes]);
}

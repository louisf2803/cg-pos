'use client';
import { useEffect, useRef } from 'react';
import { monthStart } from '@cgpos/shared';

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto', maxWidth: 'min(760px, calc(100vw - 16px))' }, onClose } as const };
}
export const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
export const firstOfMonth = () => monthStart(todayKey());
export const fmtDate = (d: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));

/** Pemilih dua tanggal untuk laporan keuangan. */
export function DateSpan({ from, to, onChange, idPrefix }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void; idPrefix: string }) {
  return (
    <>
      <div className="cg-field"><label className="cg-label" htmlFor={`${idPrefix}-dari`}>Dari tanggal</label>
        <input id={`${idPrefix}-dari`} type="date" className="cg-input" value={from} max={to || undefined} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} /></div>
      <div className="cg-field"><label className="cg-label" htmlFor={`${idPrefix}-sampai`}>Sampai tanggal</label>
        <input id={`${idPrefix}-sampai`} type="date" className="cg-input" value={to} min={from || undefined} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} /></div>
    </>
  );
}

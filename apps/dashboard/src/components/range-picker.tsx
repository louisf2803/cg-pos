'use client';
import { useState } from 'react';
import { PRESETS, type Preset } from '@/lib/range';

export interface RangeValue { preset: Preset; from: string; to: string }

/** Pilihan rentang tanggal: preset cepat atau dua tanggal. Tanggal berbentuk YYYY-MM-DD (lokal outlet). */
export function RangePicker({ value, today, onChange }: { value: RangeValue; today: string; onChange: (v: RangeValue) => void }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const bad = draft.from > draft.to || !draft.from || !draft.to;
  return (
    <div className="grid gap-12 mb-16">
      <div className="flex flex-wrap gap-8" role="group" aria-label="Rentang waktu">
        {PRESETS.map((p) => (
          <button key={p.id} className="cg-chip" aria-pressed={value.preset === p.id} onClick={() => (p.id === 'custom' ? onChange({ ...value, preset: 'custom' }) : onChange({ preset: p.id, from: value.from, to: value.to }))}>{p.label}</button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <form className="flex flex-wrap items-end gap-12" onSubmit={(e) => { e.preventDefault(); if (!bad) onChange({ preset: 'custom', ...draft }); }}>
          <div className="cg-field"><label className="cg-label" htmlFor="tgl-dari">Dari</label><input id="tgl-dari" type="date" className="cg-input" max={today} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="tgl-sampai">Sampai</label><input id="tgl-sampai" type="date" className="cg-input" max={today} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></div>
          <button className="cg-btn cg-btn--secondary" disabled={bad}>Terapkan</button>
          {bad && <p role="alert" className="cg-error">Tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>}
        </form>
      )}
    </div>
  );
}

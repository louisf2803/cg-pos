'use client';
import { useMemo, useState } from 'react';
import { localDateKey } from '@cgpos/shared';
import { dateRange, presetRange, type Preset } from './range';
import type { RangeValue } from '@/components/range-picker';

/** Rentang laporan terpilih (preset atau tanggal bebas) sebagai batas UTC untuk query. */
export function useRange(tz: string | undefined) {
  const [v, setV] = useState<RangeValue>({ preset: '7d', from: '', to: '' });
  const today = useMemo(() => localDateKey(new Date(), tz ?? 'Asia/Jakarta'), [tz]);
  const range = useMemo(() => {
    const zone = tz ?? 'Asia/Jakarta';
    if (v.preset === 'custom') return v.from && v.to ? dateRange(zone, v.from, v.to) : presetRange(zone, '7d');
    return presetRange(zone, v.preset as Exclude<Preset, 'custom'>);
  }, [v, tz]);
  return { value: v.preset === 'custom' ? v : { ...v, from: range.label.slice(0, 10), to: range.label.slice(-10) }, setValue: setV, range, today };
}

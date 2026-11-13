'use client';

import type { ReceiptTemplate } from '@cgpos/shared';

export type LineToggles = Pick<ReceiptTemplate, 'showServiceCharge' | 'showTax' | 'showRounding' | 'showPaymentMethod' | 'showChange'>;
export const LINE_TOGGLE_KEYS: (keyof LineToggles)[] = ['showServiceCharge', 'showTax', 'showRounding', 'showPaymentMethod', 'showChange'];

const ITEMS: { key: keyof LineToggles; label: string; hint: string }[] = [
  { key: 'showServiceCharge', label: 'Tampilkan biaya layanan', hint: 'Baris biaya layanan di bawah subtotal (bila ada).' },
  { key: 'showTax', label: 'Tampilkan pajak', hint: 'Baris pajak, atau "sudah termasuk pajak" bila harga sudah memuat pajak.' },
  { key: 'showRounding', label: 'Tampilkan pembulatan', hint: 'Baris pembulatan bila ada.' },
  { key: 'showPaymentMethod', label: 'Tampilkan metode pembayaran', hint: 'Daftar metode dan jumlah yang dibayar pada struk lunas.' },
  { key: 'showChange', label: 'Tampilkan kembalian', hint: 'Baris kembalian untuk pembayaran tunai.' },
];

/** Pengendali baris rincian tagihan dan pembayaran pada struk (A150). Subtotal, potongan, dan TOTAL selalu tercetak. */
export function LineToggleGroup({ value, onChange }: { value: LineToggles; onChange: (next: LineToggles) => void }) {
  return (
    <fieldset className="space-y-[6px]" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted block mb-4">Rincian tagihan dan pembayaran</legend>
      <div className="space-y-8">
        {ITEMS.map((it) => (
          <label key={it.key} className="flex items-start gap-8 text-sm cursor-pointer select-none">
            <input type="checkbox" className="mt-[3px]" checked={value[it.key]} onChange={(e) => onChange({ ...value, [it.key]: e.target.checked })} />
            <span><span className="block">{it.label}</span><span className="block text-xs text-text-muted">{it.hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

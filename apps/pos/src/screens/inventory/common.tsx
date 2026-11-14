import { useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Modal } from '../../ui';

export type StepId = 'info' | 'produk';

/**
 * Kerangka formulir dua langkah (1 Informasi, 2 Produk) layar penuh: tombol tutup (selalu bertanya dulu bila ada isian),
 * Simpan Draf (bila ada), dan Simpan. Isi tiap langkah dikirim lewat `info` dan `produk`.
 */
export function FormShell({ title, step, setStep, info, produk, onClose, onSave, onSaveDraft, busy, dirty, error, saveLabel = 'Simpan' }: {
  title: string; step: StepId; setStep: (s: StepId) => void; info: ReactNode; produk: ReactNode; onClose: () => void;
  onSave: () => void; onSaveDraft?: () => void; busy: boolean; dirty: boolean; error: string; saveLabel?: string;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = () => (dirty ? setConfirmLeave(true) : onClose());
  return (
    <div className="fixed inset-0 z-40 bg-surface flex flex-col min-w-0">
      <header className="flex items-center justify-between gap-12 px-16 py-12 bg-surface-raised border-b border-border shrink-0">
        <div className="flex items-center gap-12 min-w-0">
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={leave} aria-label="Tutup formulir"><X className="cg-icon cg-icon--sm" aria-hidden /></button>
          <h1 className="text-base font-bold truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-8 shrink-0">
          {onSaveDraft && <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onSaveDraft} disabled={busy}>Simpan Draf</button>}
          <button type="button" className="cg-btn cg-btn--primary cg-btn--sm" onClick={onSave} disabled={busy}>{busy ? 'Menyimpan…' : saveLabel}</button>
        </div>
      </header>
      <div className="cg-tabs mx-16 mt-12" role="tablist" aria-label="Langkah formulir">
        <button type="button" role="tab" className="cg-tab" aria-selected={step === 'info'} onClick={() => setStep('info')}>1. Informasi</button>
        <button type="button" role="tab" className="cg-tab" aria-selected={step === 'produk'} onClick={() => setStep('produk')}>2. Produk</button>
      </div>
      {error && <p className="cg-banner cg-banner--danger mx-16 mt-12" role="alert">{error}</p>}
      <div className="flex-1 min-h-0 overflow-y-auto p-16 space-y-12 min-w-0">{step === 'info' ? info : produk}</div>
      {confirmLeave && (
        <Modal title="Keluar halaman?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-text-muted">Perubahan yang Anda buat tidak akan disimpan.</p>
          <div className="flex justify-end gap-8 mt-16">
            <button type="button" className="cg-btn cg-btn--ghost" onClick={() => setConfirmLeave(false)} data-autofocus>Batal</button>
            <button type="button" className="cg-btn cg-btn--primary" onClick={onClose}>Ya, keluar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export interface LineOption { id: string; label: string; unit: string }
export interface Line { key: string; productId: string; qty: string; price?: string; note?: string }

let seq = 0;
export const newLine = (): Line => ({ key: `l${++seq}`, productId: '', qty: '' });

/** Daftar baris barang: pilih barang, jumlah (dan harga atau alasan bila diminta). */
export function ProductLines({ options, lines, onChange, withPrice, withNote, qtyLabel = 'Jumlah' }: {
  options: LineOption[]; lines: Line[]; onChange: (l: Line[]) => void; withPrice?: boolean; withNote?: boolean; qtyLabel?: string;
}) {
  const set = (key: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-8 min-w-0">
      {lines.length === 0 && <p className="text-sm text-text-muted">Belum ada produk. Tambahkan produk di bawah.</p>}
      {lines.map((l) => {
        const opt = options.find((o) => o.id === l.productId);
        return (
          <div key={l.key} className="border border-border rounded-md p-12 grid gap-8 min-w-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label className="text-xs text-text-muted col-span-full">Barang
              <select className="cg-input w-full mt-4" value={l.productId} onChange={(e) => set(l.key, { productId: e.target.value })}>
                <option value="">Pilih barang</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-text-muted">{qtyLabel}{opt ? ` (${opt.unit})` : ''}
              <input className="cg-input cg-num w-full mt-4" inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} />
            </label>
            {withPrice && <label className="text-xs text-text-muted">Harga satuan (Rp)
              <input className="cg-input cg-num w-full mt-4" inputMode="numeric" value={l.price ?? ''} onChange={(e) => set(l.key, { price: e.target.value.replace(/[^\d]/g, '') })} />
            </label>}
            {withNote && <label className="text-xs text-text-muted">Alasan
              <input className="cg-input w-full mt-4" maxLength={100} value={l.note ?? ''} onChange={(e) => set(l.key, { note: e.target.value })} placeholder="mis. kedaluwarsa, tumpah" />
            </label>}
            <div className="flex items-end justify-end"><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm text-danger" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label="Hapus baris"><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button></div>
          </div>
        );
      })}
      <button type="button" className="cg-btn cg-btn--secondary" onClick={() => onChange([...lines, newLine()])}><Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah produk</button>
    </div>
  );
}

export const num = (s: string | undefined): number => Number((s ?? '').replace(',', '.')) || 0;

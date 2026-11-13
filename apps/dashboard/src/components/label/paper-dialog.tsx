'use client';

import { useState, type FormEvent } from 'react';
import { BUILTIN_LABEL_PAPER, labelPaperProblem, newId, type LabelContent, type LabelPaper } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useDialog } from '@/components/fin-common';

const num = (s: string) => Number(s.replace(',', '.'));
const dec = (s: string) => s.replace(/[^\d.,]/g, '');

type Draft = Record<'name' | 'paperW' | 'paperH' | 'columns' | 'labelW' | 'labelH' | 'rowGap' | 'colGap' | 'marginLeft' | 'marginTop' | 'fontMm' | 'maxChars' | 'barcodeHeightMm' | 'priceMm', string>;
const toDraft = (p: LabelPaper, name: string): Draft => ({
  name, paperW: String(p.paperW), paperH: String(p.paperH), columns: String(p.columns), labelW: String(p.labelW), labelH: String(p.labelH), rowGap: String(p.rowGap), colGap: String(p.colGap),
  marginLeft: String(p.marginLeft), marginTop: String(p.marginTop), fontMm: String(p.content.fontMm), maxChars: String(p.content.maxChars), barcodeHeightMm: String(p.content.barcodeHeightMm), priceMm: String(p.content.priceMm),
});

type Flags = Pick<LabelContent, 'showBarcode' | 'showCode' | 'showName' | 'showUnit' | 'showMerchant' | 'showPrice'>;
const FLAGS: { key: keyof Flags; label: string }[] = [
  { key: 'showBarcode', label: 'Tampilkan barcode' }, { key: 'showCode', label: 'Tampilkan kode produk' }, { key: 'showName', label: 'Tampilkan nama produk' },
  { key: 'showUnit', label: 'Tampilkan satuan' }, { key: 'showMerchant', label: 'Tampilkan nama merchant' }, { key: 'showPrice', label: 'Tampilkan harga' },
];

/** Tambah atau atur kertas label. Kertas bawaan baca-saja: salin lewat Tambah kertas. */
export function PaperDialog({ paper, onClose, onSaved }: { paper: LabelPaper | null; onClose: () => void; onSaved: (p: LabelPaper) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const readOnly = paper?.builtin === true;
  const base = paper ?? BUILTIN_LABEL_PAPER;
  const [id] = useState(() => (paper && !readOnly ? paper.id : newId()));
  const [f, setF] = useState<Draft>(() => toDraft(base, paper && !readOnly ? paper.name : paper ? '' : ''));
  const [flags, setFlags] = useState<Flags>(() => ({ showBarcode: base.content.showBarcode, showCode: base.content.showCode, showName: base.content.showName, showUnit: base.content.showUnit, showMerchant: base.content.showMerchant, showPrice: base.content.showPrice }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr(''); };

  const build = (): LabelPaper => ({
    id, name: f.name, paperW: num(f.paperW), paperH: num(f.paperH), columns: num(f.columns), labelW: num(f.labelW), labelH: num(f.labelH), rowGap: num(f.rowGap), colGap: num(f.colGap),
    marginLeft: num(f.marginLeft), marginTop: num(f.marginTop),
    content: { fontMm: num(f.fontMm), maxChars: num(f.maxChars), barcodeHeightMm: num(f.barcodeHeightMm), priceMm: num(f.priceMm), ...flags },
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || readOnly) return;
    const p = build();
    const problem = labelPaperProblem(p);
    if (problem) return setErr(problem);
    setBusy(true);
    try { await data.saveLabelPaper(p); onSaved(p); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  const field = (k: keyof Draft, label: string, unit = 'mm') => (
    <div className="cg-field" key={k}>
      <label className="cg-label" htmlFor={`kp-${k}`}>{label}{unit ? ` (${unit})` : ''}</label>
      <input id={`kp-${k}`} className="cg-input cg-num" inputMode="decimal" value={f[k]} disabled={readOnly} onChange={(e) => set(k, dec(e.target.value))} />
    </div>
  );
  const GRID = { gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' } as const;

  return (
    <dialog {...d.props} aria-labelledby="judul-kertas">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-kertas" className="cg-modal__title">{readOnly ? 'Kertas bawaan' : paper ? 'Atur ukuran kertas' : 'Tambah kertas'}</h2>
        <p className="text-sm text-text-muted">{readOnly ? 'Kertas bawaan tidak bisa diubah. Pilih Tambah kertas untuk membuat salinan yang bisa diatur.' : 'Ukuran kertas hanya berlaku untuk printer laser atau inkjet (lembar). Semua ukuran dalam milimeter.'}</p>
        <div className="cg-field"><label className="cg-label" htmlFor="kp-name">Nama kertas</label><input id="kp-name" className="cg-input" maxLength={50} value={f.name} disabled={readOnly} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
        <div className="grid gap-12" style={GRID}>{field('paperH', 'Panjang kertas')}{field('paperW', 'Lebar kertas')}{field('columns', 'Jumlah kolom', '')}</div>
        <div className="grid gap-12" style={GRID}>{field('labelH', 'Panjang label')}{field('labelW', 'Lebar label')}{field('rowGap', 'Jarak baris')}{field('colGap', 'Jarak kolom')}{field('marginLeft', 'Jarak kiri')}{field('marginTop', 'Jarak atas')}</div>
        <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Isi label barcode</legend>
          <div className="grid gap-12" style={GRID}>{field('fontMm', 'Ukuran huruf')}{field('maxChars', 'Maksimal karakter nama', '')}{field('barcodeHeightMm', 'Tinggi barcode')}{field('priceMm', 'Ukuran harga')}</div>
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {FLAGS.map((x) => <label key={x.key} className="flex gap-8 items-center"><input type="checkbox" checked={flags[x.key]} disabled={readOnly} onChange={(e) => { setFlags((s) => ({ ...s, [x.key]: e.target.checked })); setErr(''); }} /> {x.label}</label>)}
          </div>
        </fieldset>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>{readOnly ? 'Tutup' : 'Batal'}</button>
          {!readOnly && <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>}
        </div>
      </form>
    </dialog>
  );
}

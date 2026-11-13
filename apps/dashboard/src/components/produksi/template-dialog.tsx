'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { newId, productionTemplateProblem, type ProductionTemplate, type StockItem } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useDialog } from '@/components/fin-common';

interface Row { key: string; productId: string; qty: string }
const dec = (s: string) => s.replace(/[^\d.,]/g, '');
const toNum = (s: string) => Number(s.replace(',', '.')) || 0;

export function TemplateDialog({ items, template, onClose, onDone }: { items: StockItem[]; template: ProductionTemplate | null; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => template?.id ?? newId());
  const [f, setF] = useState({ name: template?.name ?? '', output: template?.outputProductId ?? '', outQty: template ? String(template.outputQty) : '1', note: template?.note ?? '', active: template?.isActive ?? true });
  const [rows, setRows] = useState<Row[]>(() => (template ? template.lines.map((l) => ({ key: newId(), productId: l.productId, qty: String(l.qty) })) : [{ key: newId(), productId: '', qty: '' }]));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = (pid: string) => items.find((i) => i.productId === pid)?.unit ?? '';
  const setRow = (key: string, p: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r))); setErr(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id, name: f.name, outputProductId: f.output, outputQty: toNum(f.outQty), isActive: f.active, ...(f.note.trim() ? { note: f.note } : {}),
      lines: rows.filter((r) => r.productId || r.qty).map((r) => ({ productId: r.productId, qty: toNum(r.qty) })),
    };
    const problem = productionTemplateProblem(input);
    if (problem) return setErr(problem);
    setBusy(true);
    try { await data.saveProductionTemplate(input); onDone(`Acuan ${f.name.trim()} tersimpan.`); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-acuan">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-acuan" className="cg-modal__title">{template ? 'Ubah acuan produksi' : 'Acuan produksi baru'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="ac-nama">Nama acuan</label><input id="ac-nama" className="cg-input" maxLength={80} value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(''); }} autoFocus /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="ac-jadi">Barang jadi</label>
            <select id="ac-jadi" className="cg-input" value={f.output} onChange={(e) => { setF({ ...f, output: e.target.value }); setErr(''); }}>
              <option value="">Pilih barang jadi…</option>{items.map((i) => <option key={i.productId} value={i.productId}>{i.name}</option>)}
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="ac-jumlah">Jumlah jadi {unit(f.output) && `(${unit(f.output)})`}</label><input id="ac-jumlah" className="cg-input cg-num" inputMode="decimal" value={f.outQty} onChange={(e) => { setF({ ...f, outQty: dec(e.target.value) }); setErr(''); }} /></div>
        </div>
        <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Bahan untuk satu kali acuan</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1.2fr) auto' }}>
              <select aria-label={`Bahan ${i + 1}`} className="cg-input" value={r.productId} onChange={(e) => setRow(r.key, { productId: e.target.value })}>
                <option value="">Pilih bahan…</option>{items.filter((x) => x.productId !== f.output).map((x) => <option key={x.productId} value={x.productId}>{x.name}</option>)}
              </select>
              <input aria-label={`Jumlah bahan ${i + 1}${unit(r.productId) ? ` (${unit(r.productId)})` : ''}`} className="cg-input cg-num" inputMode="decimal" placeholder={unit(r.productId) || 'Jumlah'} value={r.qty} onChange={(e) => setRow(r.key, { qty: dec(e.target.value) })} />
              <button type="button" className="cg-btn cg-btn--ghost" aria-label={`Hapus bahan ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="cg-icon" aria-hidden /></button>
            </div>
          ))}
          <div><button type="button" className="cg-btn cg-btn--secondary" onClick={() => setRows((rs) => [...rs, { key: newId(), productId: '', qty: '' }])}><Plus className="cg-icon" aria-hidden /> Tambah bahan</button></div>
        </fieldset>
        <div className="cg-field"><label className="cg-label" htmlFor="ac-catatan">Catatan (opsional)</label><input id="ac-catatan" className="cg-input" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <label className="flex gap-8 items-center"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Acuan aktif</label>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

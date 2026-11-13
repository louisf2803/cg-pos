'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { campaignAudience, campaignProblem, newId, type CampaignCriteria, type Customer } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { todayKey, useDialog } from '@/components/fin-common';

export function CampaignDialog({ customers, onClose, onDone }: { customers: Customer[]; onClose: () => void; onDone: (name: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const [f, setF] = useState({ name: '', message: '', startsOn: todayKey(), endsOn: '', birthdayMonth: false, minPoints: '', city: '', hasPhone: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setErr(''); };

  const criteria: CampaignCriteria = {
    ...(f.birthdayMonth ? { birthdayMonth: true } : {}), ...(f.minPoints ? { minPoints: Number(f.minPoints) } : {}),
    ...(f.city.trim() ? { city: f.city.trim() } : {}), ...(f.hasPhone ? { hasPhone: true } : {}),
  };
  const audience = useMemo(() => campaignAudience(customers, criteria, todayKey()), [customers, f.birthdayMonth, f.minPoints, f.city, f.hasPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent, launch: boolean) {
    e.preventDefault();
    if (busy) return;
    const input = { id, name: f.name, message: f.message, criteria, ...(f.startsOn ? { startsOn: f.startsOn } : {}), ...(f.endsOn ? { endsOn: f.endsOn } : {}) };
    const problem = campaignProblem(input);
    if (problem) return setErr(problem);
    if (launch && audience.length === 0) return setErr('Belum ada pelanggan yang cocok dengan sasaran ini.');
    setBusy(true);
    try {
      await data.saveCampaign(input);
      if (launch) await data.launchCampaign(id, audience.map((c) => c.id));
      onDone(f.name.trim());
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan kampanye.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-kampanye">
      <form onSubmit={(e) => submit(e, false)} className="grid gap-12" noValidate>
        <h2 id="judul-kampanye" className="cg-modal__title">Kampanye baru</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="kp-nama">Nama kampanye</label><input id="kp-nama" className="cg-input" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="kp-pesan">Naskah pesan (catatan untuk tim; tidak dikirim otomatis)</label><textarea id="kp-pesan" className="cg-input" rows={3} maxLength={500} value={f.message} onChange={(e) => set({ message: e.target.value })} /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="kp-mulai">Mulai</label><input id="kp-mulai" type="date" className="cg-input" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="kp-selesai">Selesai (opsional)</label><input id="kp-selesai" type="date" className="cg-input" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></div>
        </div>
        <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Sasaran pelanggan</legend>
          <label className="flex gap-8 items-center"><input type="checkbox" checked={f.birthdayMonth} onChange={(e) => set({ birthdayMonth: e.target.checked })} /> Berulang tahun bulan ini</label>
          <label className="flex gap-8 items-center"><input type="checkbox" checked={f.hasPhone} onChange={(e) => set({ hasPhone: e.target.checked })} /> Punya nomor telepon</label>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="kp-poin">Poin minimal</label><input id="kp-poin" className="cg-input cg-num" inputMode="numeric" value={f.minPoints} onChange={(e) => set({ minPoints: e.target.value.replace(/[^\d]/g, '') })} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="kp-kota">Kota</label><input id="kp-kota" className="cg-input" value={f.city} onChange={(e) => set({ city: e.target.value })} /></div>
          </div>
        </fieldset>
        <p role="status" className="text-text-muted">Pelanggan yang cocok sekarang: <strong className="cg-num">{audience.length}</strong> dari {customers.length}.</p>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--secondary" disabled={busy}>Simpan sebagai draf</button>
          <button type="button" className="cg-btn cg-btn--primary" disabled={busy} onClick={(e) => submit(e, true)}>Simpan dan jalankan</button>
        </div>
      </form>
    </dialog>
  );
}

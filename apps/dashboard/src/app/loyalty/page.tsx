'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { DEFAULT_LOYALTY, earnedPoints, formatRp, loyaltyRulesProblem, redeemAmount, type LoyaltyRules } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const digits = (v: string) => v.replace(/\D/g, '');

export default function LoyaltyPage() {
  const data = useData();
  const state = useAsync(() => data.getLoyaltyRules(), [data]);
  const [f, setF] = useState({ isActive: false, earnAmount: String(DEFAULT_LOYALTY.earnAmount), earnPoints: String(DEFAULT_LOYALTY.earnPoints), redeem: String(DEFAULT_LOYALTY.redeemValuePerPoint) });
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Hanya isi ulang formulir saat data dari server berubah, bukan tiap render (itu menimpa ketikan).
  const loaded = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (loaded) setF({ isActive: loaded.isActive, earnAmount: String(loaded.earnAmount), earnPoints: String(loaded.earnPoints), redeem: String(loaded.redeemValuePerPoint) });
  }, [loaded]);
  const rules: LoyaltyRules = { isActive: f.isActive, earnAmount: Number(f.earnAmount), earnPoints: Number(f.earnPoints), redeemValuePerPoint: Number(f.redeem) };
  const problem = loyaltyRulesProblem(rules);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (problem) return setErr(problem);
    setBusy(true); setErr(''); setNotice('');
    try { await data.saveLoyaltyRules(rules); setNotice(rules.isActive ? 'Aturan poin disimpan dan loyalti aktif.' : 'Aturan poin disimpan. Loyalti masih nonaktif.'); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Aturan poin gagal disimpan.'); }
    finally { setBusy(false); }
  }
  const sample = 55000;
  return (
    <>
      <PageHeader title="Poin dan loyalti" subtitle="Pelanggan mengumpulkan poin dari belanja dan menukarnya jadi potongan di kasir" />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="cg-skeleton" style={{ height: 240 }} aria-busy="true" aria-label="Memuat" />}
      {state.status === 'ready' && (
        <form onSubmit={save} className="grid gap-16" style={{ maxWidth: 560 }} noValidate>
          <label className="flex items-center gap-8"><input type="checkbox" checked={f.isActive} onChange={(e) => { setF((s) => ({ ...s, isActive: e.target.checked })); setNotice(''); }} /> <strong>Aktifkan loyalti</strong></label>
          <fieldset className="grid gap-12" style={{ border: 0, padding: 0 }}>
            <legend className="font-semibold mb-8">Cara mendapat poin</legend>
            <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div className="cg-field"><label className="cg-label" htmlFor="l-belanja">Setiap belanja (Rp)</label>
                <input id="l-belanja" className="cg-input" inputMode="numeric" maxLength={9} value={f.earnAmount} onChange={(e) => { setF((s) => ({ ...s, earnAmount: digits(e.target.value) })); setErr(''); setNotice(''); }} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor="l-poin">Dapat poin</label>
                <input id="l-poin" className="cg-input" inputMode="numeric" maxLength={4} value={f.earnPoints} onChange={(e) => { setF((s) => ({ ...s, earnPoints: digits(e.target.value) })); setErr(''); setNotice(''); }} /></div>
            </div>
          </fieldset>
          <fieldset className="grid gap-12" style={{ border: 0, padding: 0 }}>
            <legend className="font-semibold mb-8">Cara menukar poin</legend>
            <div className="cg-field"><label className="cg-label" htmlFor="l-nilai">Nilai 1 poin (Rp)</label>
              <input id="l-nilai" className="cg-input" inputMode="numeric" maxLength={7} value={f.redeem} onChange={(e) => { setF((s) => ({ ...s, redeem: digits(e.target.value) })); setErr(''); setNotice(''); }} /></div>
          </fieldset>
          <p className="cg-banner cg-banner--info" data-testid="contoh-loyalti">
            {problem ? problem : `Contoh: belanja ${formatRp(sample)} dapat ${earnedPoints(sample, { ...rules, isActive: true })} poin. Menukar 100 poin memotong ${formatRp(redeemAmount(100, rules))}.`}
          </p>
          <p className="text-text-muted text-sm">Poin dihitung dari total tagihan saat pesanan lunas, dan hanya untuk pesanan yang punya pelanggan. Bila ada refund, poin ikut dikoreksi sebanding. Mengubah aturan tidak mengubah poin yang sudah ada.</p>
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          {notice && <p role="status" className="cg-banner cg-banner--info">{notice}</p>}
          <div><button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}><Save className="cg-icon" aria-hidden /> {busy ? 'Menyimpan…' : 'Simpan aturan'}</button></div>
        </form>
      )}
    </>
  );
}

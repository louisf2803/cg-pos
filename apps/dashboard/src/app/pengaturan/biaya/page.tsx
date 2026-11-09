'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ORDER_TYPES, ROUNDING_STEPS, outletOptionsProblem, type OrderType, type OutletOptions } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function BiayaDanPembulatan() {
  const data = useData();
  const st = useAsync(() => data.getOutletSettings(), [data]);
  return (
    <>
      <PageHeader title="Biaya dan pembulatan" subtitle="Biaya layanan, pembulatan tagihan, dan aturan kasir" />
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {st.status === 'ready' && <Form initial={st.data.options} onSaved={st.reload} />}
    </>
  );
}

function Form({ initial, onSaved }: { initial: OutletOptions; onSaved: () => void }) {
  const data = useData();
  const [pct, setPct] = useState(String(initial.serviceChargePct));
  const [taxable, setTaxable] = useState(initial.serviceChargeTaxable);
  const [types, setTypes] = useState<OrderType[]>(initial.serviceChargeOrderTypes);
  const [cash, setCash] = useState(String(initial.roundingCashStep));
  const [noncash, setNoncash] = useState(String(initial.roundingNoncashStep));
  const [needShift, setNeedShift] = useState(initial.requireOpenShift);
  const [negStock, setNegStock] = useState(initial.allowNegativeStock);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ok) { const t = setTimeout(() => setOk(false), 4000); return () => clearTimeout(t); } }, [ok]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: OutletOptions = {
      ...initial, serviceChargePct: Number(pct.replace(',', '.')), serviceChargeTaxable: taxable, serviceChargeOrderTypes: types,
      roundingCashStep: Number(cash), roundingNoncashStep: Number(noncash), requireOpenShift: needShift, allowNegativeStock: negStock,
    };
    const problem = outletOptionsProblem(next);
    if (problem) return setErr(problem);
    setBusy(true); setErr(null); setOk(false);
    try { await data.saveOutletOptions(next); setOk(true); onSaved(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  }

  const stepOptions = (cur: string) => [...new Set([...ROUNDING_STEPS, Number(cur)])].sort((a, b) => a - b);
  const toggleType = (t: OrderType) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <form onSubmit={submit} noValidate className="grid gap-24 max-w-[640px]">
      <fieldset className="grid gap-12 border border-border rounded-lg p-16">
        <legend className="px-8">Biaya layanan</legend>
        <div className="cg-field">
          <label className="cg-label" htmlFor="b-pct">Persentase (0 = tanpa biaya layanan)</label>
          <input id="b-pct" className="cg-input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <fieldset className="grid gap-8">
          <legend className="cg-label">Dikenakan pada</legend>
          {ORDER_TYPES.map((t) => (
            <label key={t.id} className="flex items-center gap-8"><input type="checkbox" checked={types.includes(t.id)} onChange={() => toggleType(t.id)} /> {t.label}</label>
          ))}
        </fieldset>
        <label className="flex items-center gap-8"><input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> Biaya layanan ikut dikenai pajak</label>
      </fieldset>

      <fieldset className="grid gap-12 border border-border rounded-lg p-16">
        <legend className="px-8">Pembulatan</legend>
        <div className="cg-field">
          <label className="cg-label" htmlFor="b-tunai">Pembulatan pembayaran tunai</label>
          <select id="b-tunai" className="cg-input" value={cash} onChange={(e) => setCash(e.target.value)}>
            {stepOptions(cash).map((s) => <option key={s} value={s}>{s === 0 ? 'Tanpa pembulatan' : `Kelipatan Rp ${s.toLocaleString('id-ID')}`}</option>)}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="b-noncash">Pembulatan pembayaran non-tunai</label>
          <select id="b-noncash" className="cg-input" value={noncash} onChange={(e) => setNoncash(e.target.value)}>
            {stepOptions(noncash).map((s) => <option key={s} value={s}>{s === 0 ? 'Tanpa pembulatan' : `Kelipatan Rp ${s.toLocaleString('id-ID')}`}</option>)}
          </select>
        </div>
      </fieldset>

      <fieldset className="grid gap-12 border border-border rounded-lg p-16">
        <legend className="px-8">Aturan kasir</legend>
        <label className="flex items-center gap-8"><input type="checkbox" checked={needShift} onChange={(e) => setNeedShift(e.target.checked)} /> Wajib buka kasir sebelum membuat pesanan</label>
        <label className="flex items-center gap-8"><input type="checkbox" checked={negStock} onChange={(e) => setNegStock(e.target.checked)} /> Boleh menjual walau stok habis (stok jadi minus)</label>
      </fieldset>

      <p className="text-text-muted text-sm">Perubahan berlaku untuk pesanan baru. Kasir yang sedang terbuka memuat pengaturan terbaru saat dibuka ulang. Pajak diatur di layar Pajak.</p>
      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      {ok && <p role="status" className="cg-banner cg-banner--info">Tersimpan.</p>}
      <div><button className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
    </form>
  );
}

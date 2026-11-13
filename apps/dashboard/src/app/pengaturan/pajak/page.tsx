'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ORDER_TYPES, computeOrder, formatRp, taxSettingsProblem, type OrderType, type TaxMode, type TaxSettings } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function Pajak() {
  const data = useData();
  const st = useAsync(() => data.getTaxSettings(), [data]);
  return (
    <>
      <PageHeader title="Pajak" subtitle="PB1 bisa dinyalakan atau dimatikan kapan saja; tarif dan cara hitungnya bisa diatur" />
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {st.status === 'ready' && <Form initial={st.data} onSaved={st.reload} />}
    </>
  );
}

const EXAMPLE_PRICE = 20000;

function Form({ initial, onSaved }: { initial: TaxSettings; onSaved: () => void }) {
  const data = useData();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [name, setName] = useState(initial.name);
  const [rate, setRate] = useState(String(initial.rate));
  const [inclusive, setInclusive] = useState(initial.inclusive);
  const [taxMode, setTaxMode] = useState<TaxMode>(initial.taxMode ?? 'per_order');
  const [orderTypes, setOrderTypes] = useState<OrderType[]>(initial.orderTypes ?? ['dine_in', 'takeaway', 'delivery', 'service']);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ok) { const t = setTimeout(() => setOk(false), 4000); return () => clearTimeout(t); } }, [ok]);

  const next = (): TaxSettings => ({
    enabled,
    name,
    rate: Number(rate.replace(',', '.')),
    inclusive,
    taxMode,
    orderTypes,
  });
  const r = Number(rate.replace(',', '.'));
  const example = enabled && Number.isFinite(r) && r > 0
    ? computeOrder({
        orderType: 'takeaway', items: [{ id: 'x', qty: 1, unitPrice: EXAMPLE_PRICE }], orderTaxes: [{ name: name.trim() || 'Pajak', rate: r, orderTypes }],
        settings: { taxCalc: inclusive ? 'inclusive' : 'after_discount', taxMode, serviceChargePct: 0, serviceChargeTaxable: false, serviceChargeOrderTypes: [] },
      })
    : null;

  function toggleOrderType(type: OrderType) {
    setOrderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const t = next();
    const problem = taxSettingsProblem(t);
    if (problem) return setErr(problem);
    setBusy(true); setErr(null); setOk(false);
    try { await data.saveTaxSettings(t); setOk(true); onSaved(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-24 max-w-[640px]">
      <fieldset className="grid gap-12 border border-border rounded-lg p-16">
        <legend className="px-8 font-semibold">Pajak penjualan</legend>
        <label className="flex items-center gap-8"><input type="checkbox" role="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Kenakan pajak pada setiap pesanan</label>
        <p className="text-text-muted text-sm">{enabled ? 'Pajak ikut dihitung di kasir, struk, dan laporan.' : 'Pajak mati: pesanan dibayar sebesar harga menu, tanpa baris pajak.'}</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="t-name">Nama pajak</label>
          <input id="t-name" className="cg-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={!enabled} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="t-rate">Tarif standar (persen)</label>
          <input id="t-rate" className="cg-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} disabled={!enabled} />
        </div>
      </fieldset>

      <fieldset className="grid gap-12 border border-border rounded-lg p-16" disabled={!enabled}>
        <legend className="px-8 font-semibold">Cakupan perhitungan</legend>
        <label className="flex items-start gap-8">
          <input type="radio" name="t-scope" checked={taxMode === 'per_order'} onChange={() => setTaxMode('per_order')} />
          <span><strong>Per transaksi.</strong> Seluruh transaksi dikenakan tarif pajak outlet yang sama.</span>
        </label>
        <label className="flex items-start gap-8">
          <input type="radio" name="t-scope" checked={taxMode === 'per_product'} onChange={() => setTaxMode('per_product')} />
          <span><strong>Per produk.</strong> Tiap produk dapat ditentukan tarif pajaknya sendiri (atau bebas pajak) di menu Produk. Produk tanpa aturan khusus mengikuti tarif standar outlet.</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-12 border border-border rounded-lg p-16" disabled={!enabled}>
        <legend className="px-8 font-semibold">Jenis order yang dikenakan pajak</legend>
        <p className="text-text-muted text-sm">Pilih jenis order yang membebankan pajak. Jenis order yang tidak dicentang akan bebas pajak.</p>
        <div className="grid grid-cols-2 gap-8">
          {ORDER_TYPES.map((ot) => (
            <label key={ot.id} className="flex items-center gap-8 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={orderTypes.includes(ot.id)}
                onChange={() => toggleOrderType(ot.id)}
              />
              <span>{ot.label}</span>
            </label>
          ))}
        </div>
        {orderTypes.length === 0 && (
          <p className="text-xs text-danger-strong">Peringatan: Tidak ada jenis order yang dicentang. Pesanan tidak akan dikenai pajak.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-12 border border-border rounded-lg p-16" disabled={!enabled}>
        <legend className="px-8 font-semibold">Cara menghitung</legend>
        <label className="flex items-start gap-8"><input type="radio" name="t-mode" checked={!inclusive} onChange={() => setInclusive(false)} /> <span><strong>Ditambahkan di atas harga menu.</strong> Harga menu tanpa pajak; pajak muncul sebagai tambahan di tagihan.</span></label>
        <label className="flex items-start gap-8"><input type="radio" name="t-mode" checked={inclusive} onChange={() => setInclusive(true)} /> <span><strong>Sudah termasuk di harga menu.</strong> Pelanggan membayar sebesar harga menu; pajaknya dipisahkan di struk dan laporan.</span></label>
        {inclusive && <p className="text-text-muted text-sm">Biaya layanan (bila ada) dihitung dari harga bersih dan tidak dikenai pajak lagi pada mode ini.</p>}
      </fieldset>

      <section aria-labelledby="t-contoh" className="border border-border rounded-lg p-16 grid gap-4">
        <h2 id="t-contoh" className="text-base font-semibold">Contoh: produk seharga {formatRp(EXAMPLE_PRICE)} (Bawa pulang)</h2>
        {example ? (
          <dl className="grid gap-4 text-sm">
            <div className="flex justify-between"><dt>Harga bersih</dt><dd className="cg-num">{formatRp(example.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>{name.trim() || 'Pajak'} {example.taxTotal > 0 ? `${r}%` : '0% (bebas pajak)'}</dt><dd className="cg-num">{formatRp(example.taxTotal)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Pelanggan membayar</dt><dd className="cg-num">{formatRp(example.total)}</dd></div>
          </dl>
        ) : <p className="text-text-muted text-sm">Pelanggan membayar {formatRp(EXAMPLE_PRICE)}, tanpa pajak.</p>}
      </section>

      <p className="text-text-muted text-sm">Berlaku untuk pesanan baru. Kasir yang sedang terbuka memuat pengaturan terbaru saat dibuka ulang. Pesanan lama tidak berubah.</p>

      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      {ok && <p role="status" className="cg-banner cg-banner--info">Tersimpan.</p>}
      <div><button className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
    </form>
  );
}

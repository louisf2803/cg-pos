'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { outletInfoProblem, outletOptionsProblem, type OutletInfo, type OutletOptions } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function BisnisDanOutlet() {
  const data = useData();
  const st = useAsync(() => data.getOutletSettings(), [data]);
  return (
    <>
      <PageHeader title="Bisnis dan outlet" subtitle="Informasi yang tampil di struk dan laporan" />
      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {st.status === 'ready' && <Form info={st.data.info} options={st.data.options} onSaved={st.reload} />}
    </>
  );
}

function Form({ info, options, onSaved }: { info: OutletInfo; options: OutletOptions; onSaved: () => void }) {
  const data = useData();
  const [name, setName] = useState(info.name);
  const [address, setAddress] = useState(info.address);
  const [phone, setPhone] = useState(info.phone);
  const [footer, setFooter] = useState(options.receiptFooter);
  const [header, setHeader] = useState(options.receiptHeader ?? '');
  const [showCashier, setShowCashier] = useState(options.receiptShowCashier !== false);
  const [showCustomer, setShowCustomer] = useState(options.receiptShowCustomer !== false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ok) { const t = setTimeout(() => setOk(false), 4000); return () => clearTimeout(t); } }, [ok]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = outletInfoProblem({ name, address, phone });
    if (problem) return setErr(problem);
    const optsProblem = outletOptionsProblem({ ...options, receiptFooter: footer, receiptHeader: header, receiptShowCashier: showCashier, receiptShowCustomer: showCustomer });
    if (optsProblem) return setErr(optsProblem);
    setBusy(true); setErr(null); setOk(false);
    try {
      await data.saveOutletInfo({ name, address, phone });
      const cur = await data.getOutletSettings();
      await data.saveOutletOptions({ ...cur.options, receiptFooter: footer, receiptHeader: header, receiptShowCashier: showCashier, receiptShowCustomer: showCustomer });
      setOk(true); onSaved();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-16 max-w-[640px]">
      <div className="cg-field">
        <label className="cg-label" htmlFor="o-nama">Nama outlet</label>
        <input id="o-nama" className="cg-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="cg-field">
        <label className="cg-label" htmlFor="o-alamat">Alamat</label>
        <textarea id="o-alamat" className="cg-input" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="cg-field">
        <label className="cg-label" htmlFor="o-telp">Telepon</label>
        <input id="o-telp" className="cg-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="cg-field">
        <label className="cg-label" htmlFor="o-footer">Catatan kaki struk</label>
        <textarea id="o-footer" className="cg-input" rows={2} maxLength={300} value={footer} onChange={(e) => setFooter(e.target.value)} aria-describedby="o-footer-h" />
        <p id="o-footer-h" className="text-text-muted text-sm">Mis. ucapan terima kasih atau info Wi-Fi. {footer.length}/300</p>
      </div>
      <fieldset className="grid gap-8 border border-border rounded-md p-16">
        <legend className="cg-label px-4">Tampilan struk</legend>
        <div className="cg-field">
          <label className="cg-label" htmlFor="o-header">Teks di atas struk</label>
          <textarea id="o-header" className="cg-input" rows={3} maxLength={200} value={header} onChange={(e) => setHeader(e.target.value)} aria-describedby="o-header-h" />
          <p id="o-header-h" className="text-text-muted text-sm">Tampil di bawah nama, alamat, dan telepon. Maksimal 4 baris. {header.length}/200</p>
        </div>
        <label className="flex items-center gap-8"><input type="checkbox" checked={showCashier} onChange={(e) => setShowCashier(e.target.checked)} /> Tampilkan nama kasir di struk</label>
        <label className="flex items-center gap-8"><input type="checkbox" checked={showCustomer} onChange={(e) => setShowCustomer(e.target.checked)} /> Tampilkan nama pelanggan di struk</label>
        <p className="text-text-muted text-sm">Pajak, total, dan pembayaran selalu tampil di struk dan tidak bisa disembunyikan.</p>
      </fieldset>
      <dl className="grid gap-4 text-sm text-text-muted">
        <div className="flex gap-8"><dt>Kode outlet:</dt><dd className="cg-num">{info.code}</dd></div>
        <div className="flex gap-8"><dt>Zona waktu:</dt><dd>{info.timezone}</dd></div>
      </dl>
      <p className="text-text-muted text-sm">Kode outlet dipakai di nomor pesanan dan tidak bisa diubah dari sini. Nama, alamat, dan telepon hanya bisa diubah pemilik.</p>
      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      {ok && <p role="status" className="cg-banner cg-banner--info">Tersimpan.</p>}
      <div><button className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
    </form>
  );
}

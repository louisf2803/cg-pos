'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { outletInfoProblem, type OutletInfo } from '@cgpos/shared';
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
      {st.status === 'ready' && <Form info={st.data.info} receiptFooter={st.data.options.receiptFooter} onSaved={st.reload} />}
    </>
  );
}

function Form({ info, receiptFooter, onSaved }: { info: OutletInfo; receiptFooter: string; onSaved: () => void }) {
  const data = useData();
  const [name, setName] = useState(info.name);
  const [address, setAddress] = useState(info.address);
  const [phone, setPhone] = useState(info.phone);
  const [footer, setFooter] = useState(receiptFooter);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ok) { const t = setTimeout(() => setOk(false), 4000); return () => clearTimeout(t); } }, [ok]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = outletInfoProblem({ name, address, phone });
    if (problem) return setErr(problem);
    if (footer.length > 300) return setErr('Catatan kaki struk maksimal 300 karakter.');
    setBusy(true); setErr(null); setOk(false);
    try {
      await data.saveOutletInfo({ name, address, phone });
      const cur = await data.getOutletSettings();
      await data.saveOutletOptions({ ...cur.options, receiptFooter: footer });
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

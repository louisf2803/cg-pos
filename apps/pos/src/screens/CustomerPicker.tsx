import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { customerProblem, type Customer } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

/** Pilih pelanggan untuk pesanan: cari lewat nama, kode, atau nomor telepon; atau tambah pelanggan baru langsung dari kasir. */
export function CustomerPicker({ currentId, onPick, onClose }: { currentId?: string; onPick: (c: Customer) => void; onClose: () => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useAsync(() => data.listCustomers({ search: term, limit: 30 }), [data, term]);

  if (adding) return <QuickAdd initialName={q.trim()} onBack={() => setAdding(false)} onSaved={onPick} onClose={onClose} />;
  return (
    <Modal title="Pilih pelanggan" onClose={onClose} labelledBy="cust-title">
      <label className="cg-search mb-12">
        <Search className="cg-icon cg-icon--sm" aria-hidden />
        <input className="cg-input" type="search" autoFocus placeholder="Cari nama, kode, atau nomor telepon" aria-label="Cari pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {list.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Pelanggan gagal dimuat. {list.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={list.reload}>Coba lagi</button></div>}
      {list.status === 'ready' && list.data.length === 0 && (
        <div className="cg-empty"><p><strong>{term ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan.'}</strong></p><p className="text-text-muted">Tambahkan sekarang, nanti bisa dilengkapi di dashboard.</p></div>
      )}
      {list.status === 'ready' && list.data.length > 0 && (
        <ul className="grid gap-8" aria-label="Pelanggan">
          {list.data.map((c) => (
            <li key={c.id}>
              <button className="cg-btn cg-btn--secondary cg-btn--block flex justify-between text-left" style={{ minHeight: 52 }} aria-pressed={c.id === currentId} onClick={() => onPick(c)}>
                <span className="min-w-0"><strong className="break-words">{c.name}</strong>{c.phone && <span className="block text-sm text-text-muted cg-num">{c.phone}</span>}</span>
                {c.id === currentId && <span className="cg-badge cg-badge--accent">Dipilih</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cg-modal__actions">
        <button className="cg-btn cg-btn--ghost" onClick={onClose}>Tutup</button>
        <button className="cg-btn cg-btn--primary" onClick={() => setAdding(true)}>Pelanggan baru</button>
      </div>
    </Modal>
  );
}

function QuickAdd({ initialName, onBack, onSaved, onClose }: { initialName: string; onBack: () => void; onSaved: (c: Customer) => void; onClose: () => void }) {
  const data = useData();
  const isPhone = /^[\d+\s-]{6,}$/.test(initialName);
  const [name, setName] = useState(isPhone ? '' : initialName);
  const [phone, setPhone] = useState(isPhone ? initialName : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const input = { name, phone: phone || undefined };
    const problem = customerProblem(input);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { onSaved(await data.saveCustomer(input)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Pelanggan gagal disimpan.'); setBusy(false); }
  }
  return (
    <Modal title="Pelanggan baru" onClose={busy ? undefined : onClose} labelledBy="cust-new-title">
      <form className="grid gap-12" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="cg-field"><label className="cg-label" htmlFor="cn-nama">Nama</label>
          <input id="cn-nama" className="cg-input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="cn-tel">Nomor telepon (opsional)</label>
          <input id="cn-tel" className="cg-input" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" disabled={busy} onClick={onBack}>Kembali</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>Simpan dan pilih</button>
        </div>
      </form>
    </Modal>
  );
}

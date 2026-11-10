'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { customerProblem, formatRp, LOYALTY_KIND_LABEL, type Customer, type CustomerInput, type Order } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg = { kind: 'edit'; item?: Customer } | { kind: 'detail'; item: Customer } | { kind: 'delete'; item: Customer };
const GENDER: Record<string, string> = { female: 'Perempuan', male: 'Laki-laki', other: 'Lainnya' };
const fmtDate = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(iso));

export default function PelangganPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useAsync(() => data.listCustomers({ search: term, limit: 200 }), [data, term]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [notice, setNotice] = useState('');
  const done = (msg: string) => { setDlg(null); setNotice(msg); list.reload(); };

  return (
    <>
      <PageHeader title="Pelanggan" subtitle="Simpan data pelanggan dan lihat riwayat belanjanya"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}><Plus className="cg-icon" aria-hidden /> Tambah pelanggan</button>} />
      <div className="mb-16"><label className="cg-search">
        <Search className="cg-icon cg-icon--sm" aria-hidden />
        <input className="cg-input" type="search" placeholder="Cari nama, kode, atau nomor telepon" aria-label="Cari pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
      </label></div>
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {list.status === 'ready' && (list.data.length === 0 ? (
        <div className="cg-empty">
          <p><strong>{term ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan.'}</strong></p>
          {!term && <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Tambah pelanggan pertama</button>}
        </div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nama</th><th>Telepon</th><th>Kota</th><th className="text-right">Poin</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <td className="break-words max-w-[280px]"><button className="text-left font-semibold underline underline-offset-2 min-h-[32px]" onClick={() => setDlg({ kind: 'detail', item: c })}>{c.name}</button>{c.code && <span className="block text-sm text-text-muted">{c.code}</span>}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.city ?? '—'}</td>
                  <td className="text-right cg-num">{c.pointsBalance}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'edit', item: c })} aria-label={`Ubah ${c.name}`}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'delete', item: c })} aria-label={`Hapus ${c.name}`}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {dlg?.kind === 'edit' && <EditDialog item={dlg.item} onClose={() => setDlg(null)} onSaved={(c) => done(`${c.name} disimpan.`)} />}
      {dlg?.kind === 'detail' && <DetailDialog item={dlg.item} onClose={() => setDlg(null)} onEdit={() => setDlg({ kind: 'edit', item: dlg.item })} />}
      {dlg?.kind === 'delete' && <DeleteDialog item={dlg.item} onClose={() => setDlg(null)} onDone={() => done(`${dlg.item.name} dihapus. Riwayat transaksinya tetap tersimpan.`)} />}
    </>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}

function EditDialog({ item, onClose, onSaved }: { item?: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [f, setF] = useState({ name: item?.name ?? '', phone: item?.phone ?? '', email: item?.email ?? '', gender: item?.gender ?? '', birthDate: item?.birthDate ?? '', city: item?.city ?? '', address: item?.address ?? '', note: item?.note ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: CustomerInput = {
      id: item?.id, name: f.name, phone: f.phone || undefined, email: f.email || undefined, gender: (f.gender || undefined) as CustomerInput['gender'],
      birthDate: f.birthDate || undefined, city: f.city || undefined, address: f.address || undefined, note: f.note || undefined,
    };
    const problem = customerProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { onSaved(await data.saveCustomer(input)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Pelanggan gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-pelanggan">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-pelanggan" className="cg-modal__title">{item ? 'Ubah pelanggan' : 'Tambah pelanggan'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="p-nama">Nama</label>
          <input id="p-nama" className="cg-input" autoFocus maxLength={80} value={f.name} onChange={set('name')} /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="p-tel">Telepon</label>
            <input id="p-tel" className="cg-input" inputMode="tel" maxLength={20} value={f.phone} onChange={set('phone')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-email">Email</label>
            <input id="p-email" className="cg-input" type="email" maxLength={120} value={f.email} onChange={set('email')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-gender">Jenis kelamin</label>
            <select id="p-gender" className="cg-input" value={f.gender} onChange={set('gender')}>
              <option value="">Tidak diisi</option><option value="female">Perempuan</option><option value="male">Laki-laki</option><option value="other">Lainnya</option>
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-lahir">Tanggal lahir</label>
            <input id="p-lahir" className="cg-input" type="date" value={f.birthDate} onChange={set('birthDate')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-kota">Kota</label>
            <input id="p-kota" className="cg-input" maxLength={60} value={f.city} onChange={set('city')} /></div>
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="p-alamat">Alamat</label>
          <textarea id="p-alamat" className="cg-input" rows={2} maxLength={300} value={f.address} onChange={set('address')} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="p-catatan">Catatan</label>
          <textarea id="p-catatan" className="cg-input" rows={2} maxLength={300} value={f.note} onChange={set('note')} /></div>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function DetailDialog({ item, onClose, onEdit }: { item: Customer; onClose: () => void; onEdit: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const hist = useAsync(() => data.listOrders({ customerId: item.id, all: true }), [data, item.id]);
  const led = useAsync(() => data.listLoyaltyLedger(item.id, 30), [data, item.id]);
  const [balance, setBalance] = useState(item.pointsBalance);
  const [adj, setAdj] = useState({ delta: '', note: '' });
  const [adjErr, setAdjErr] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  async function adjust(e: FormEvent) {
    e.preventDefault();
    if (adjBusy) return;
    const n = Number(adj.delta.replace(/[^\d-]/g, ''));
    if (!Number.isInteger(n) || n === 0) return setAdjErr('Isi jumlah poin, positif untuk menambah atau negatif untuk mengurangi.');
    setAdjBusy(true); setAdjErr('');
    try { setBalance(await data.adjustPoints(item.id, n, adj.note)); setAdj({ delta: '', note: '' }); led.reload(); }
    catch (err) { setAdjErr(err instanceof Error ? err.message : 'Poin gagal disesuaikan.'); }
    finally { setAdjBusy(false); }
  }
  const paid = hist.status === 'ready' ? hist.data.filter((o: Order) => o.status === 'paid') : [];
  const spend = paid.reduce((n, o) => n + o.total, 0);
  const last = paid.map((o) => o.closedAt ?? o.openedAt).sort().at(-1);
  const rows: [string, string | undefined][] = [
    ['Kode', item.code], ['Telepon', item.phone], ['Email', item.email], ['Jenis kelamin', item.gender ? GENDER[item.gender] : undefined],
    ['Tanggal lahir', item.birthDate ? fmtDate(item.birthDate + 'T12:00:00+07:00') : undefined], ['Kota', item.city], ['Alamat', item.address], ['Catatan', item.note],
  ];
  return (
    <dialog {...d.props} aria-labelledby="judul-detail">
      <div className="grid gap-12">
        <h2 id="judul-detail" className="cg-modal__title break-words">{item.name}</h2>
        <dl className="grid gap-4 text-sm" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 16 }}>
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="text-text-muted">{k}</dt><dd className="break-words">{v}</dd></div>)}
          <dt className="text-text-muted">Poin</dt><dd className="cg-num" data-testid="saldo-poin">{balance}</dd>
        </dl>
        <section aria-labelledby="riwayat-judul">
          <h3 id="riwayat-judul" className="font-semibold mb-8">Riwayat belanja</h3>
          {hist.status === 'loading' && <div className="cg-skeleton" style={{ height: 80 }} aria-busy="true" aria-label="Memuat" />}
          {hist.status === 'error' && <ErrorBox message={hist.message} onRetry={hist.reload} />}
          {hist.status === 'ready' && (hist.data.length === 0 ? <p className="text-text-muted">Belum ada transaksi.</p> : (
            <>
              <p className="text-sm mb-8"><strong className="cg-num">{paid.length}</strong> transaksi lunas · total <strong className="cg-num">{formatRp(spend)}</strong>{last && <> · terakhir {fmtDate(last)}</>}</p>
              <ul className="grid gap-4 max-h-[240px] overflow-auto" aria-label="Transaksi">
                {hist.data.slice(0, 50).map((o) => (
                  <li key={o.id} className="flex justify-between gap-12 text-sm border-b border-border pb-4">
                    <span className="min-w-0 break-all">{o.number}<span className="block text-text-muted">{fmtDate(o.closedAt ?? o.openedAt)}{o.status === 'void' ? ' · dibatalkan' : o.status !== 'paid' ? ' · belum lunas' : ''}</span></span>
                    <span className="cg-num">{formatRp(o.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          ))}
        </section>
        <section aria-labelledby="poin-judul">
          <h3 id="poin-judul" className="font-semibold mb-8">Riwayat poin</h3>
          {led.status === 'loading' && <div className="cg-skeleton" style={{ height: 48 }} aria-busy="true" aria-label="Memuat" />}
          {led.status === 'error' && <ErrorBox message={led.message} onRetry={led.reload} />}
          {led.status === 'ready' && (led.data.length === 0 ? <p className="text-text-muted">Belum ada pergerakan poin.</p> : (
            <ul className="grid gap-4 max-h-[160px] overflow-auto" aria-label="Pergerakan poin">
              {led.data.map((e) => (
                <li key={e.id} className="flex justify-between gap-12 text-sm border-b border-border pb-4">
                  <span className="min-w-0 break-words">{LOYALTY_KIND_LABEL[e.kind]}{e.note ? ` · ${e.note}` : ''}<span className="block text-text-muted">{fmtDate(e.createdAt)}</span></span>
                  <span className="cg-num">{e.points > 0 ? `+${e.points}` : e.points}</span>
                </li>
              ))}
            </ul>
          ))}
          <form onSubmit={adjust} className="grid gap-8 mt-12" noValidate aria-label="Sesuaikan poin">
            <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(96px, 1fr) 2fr' }}>
              <div className="cg-field"><label className="cg-label" htmlFor="poin-delta">Tambah/kurangi poin</label>
                <input id="poin-delta" className="cg-input" inputMode="numeric" maxLength={7} value={adj.delta} onChange={(e) => { setAdj((s) => ({ ...s, delta: e.target.value })); setAdjErr(''); }} /></div>
              <div className="cg-field"><label className="cg-label" htmlFor="poin-catatan">Alasan</label>
                <input id="poin-catatan" className="cg-input" maxLength={200} value={adj.note} onChange={(e) => setAdj((s) => ({ ...s, note: e.target.value }))} /></div>
            </div>
            <p role="alert" className="text-danger-strong min-h-[20px]">{adjErr}</p>
            <div><button type="submit" className="cg-btn cg-btn--secondary cg-btn--sm" disabled={adjBusy}>{adjBusy ? 'Menyimpan…' : 'Sesuaikan poin'}</button></div>
          </form>
        </section>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Tutup</button>
          <button type="button" className="cg-btn cg-btn--primary" onClick={onEdit}>Ubah</button>
        </div>
      </div>
    </dialog>
  );
}

function DeleteDialog({ item, onClose, onDone }: { item: Customer; onClose: () => void; onDone: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try { await data.deleteCustomer(item.id); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal menghapus.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-hapus">
      <div className="grid gap-16">
        <h2 id="judul-hapus" className="cg-modal__title">Hapus {item.name}?</h2>
        <p className="cg-modal__body">Pelanggan hilang dari daftar. Transaksi lamanya tetap tersimpan di laporan.</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void go()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category, Department } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg =
  | { kind: 'cat'; item?: Category }
  | { kind: 'dept'; item?: Department }
  | { kind: 'del-cat'; item: Category; count: number }
  | { kind: 'del-dept'; item: Department; count: number };

export default function KategoriPage() {
  const data = useData();
  const state = useAsync(async () => {
    const [cats, depts, counts] = await Promise.all([data.listCategories(), data.listDepartments(), data.categoryProductCounts()]);
    return { cats, depts, counts };
  }, [data]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const done = () => { setDlg(null); state.reload(); };

  return (
    <>
      <PageHeader
        title="Kategori"
        subtitle="Kategori mengelompokkan produk di kasir. Departemen mengelompokkan kategori untuk laporan."
        actions={
          <div className="flex flex-wrap gap-8">
            <button className="cg-btn cg-btn--secondary" onClick={() => setDlg({ kind: 'dept' })}><Plus className="cg-icon" aria-hidden /> Tambah departemen</button>
            <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'cat' })}><Plus className="cg-icon" aria-hidden /> Tambah kategori</button>
          </div>
        }
      />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && (() => {
        const { cats, depts, counts } = state.data;
        const groups: { dept: Department | null; cats: Category[] }[] = [
          ...depts.map((d) => ({ dept: d, cats: cats.filter((c) => c.departmentId === d.id) })),
          { dept: null, cats: cats.filter((c) => !c.departmentId || !depts.some((d) => d.id === c.departmentId)) },
        ].filter((g) => g.dept || g.cats.length > 0);
        if (groups.length === 0) {
          return <div className="cg-empty"><p><strong>Belum ada kategori.</strong></p><button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'cat' })}>Tambah kategori pertama</button></div>;
        }
        return (
          <div className="grid gap-24 grid-cols-1 min-w-0">
            {groups.map((g) => (
              <section className="min-w-0" key={g.dept?.id ?? 'none'} aria-labelledby={`h-${g.dept?.id ?? 'none'}`}>
                <div className="flex items-center gap-8 mb-8">
                  <h2 id={`h-${g.dept?.id ?? 'none'}`} className="text-lg break-words">{g.dept ? g.dept.name : 'Tanpa departemen'}</h2>
                  {g.dept && (
                    <>
                      <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah departemen ${g.dept.name}`} onClick={() => setDlg({ kind: 'dept', item: g.dept! })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                      <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus departemen ${g.dept.name}`} onClick={() => setDlg({ kind: 'del-dept', item: g.dept!, count: g.cats.length })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                    </>
                  )}
                </div>
                {g.cats.length === 0 ? <p className="text-text-muted">Belum ada kategori di departemen ini.</p> : (
                  <div className="cg-data-wrap">
                    <table className="cg-data">
                      <thead><tr><th>Kategori</th><th className="cg-num">Produk</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
                      <tbody>
                        {g.cats.map((c) => (
                          <tr key={c.id}>
                            <td className="break-words max-w-[320px]">{c.name}</td>
                            <td className="cg-num">{counts[c.id] ?? 0}</td>
                            <td className="whitespace-nowrap">
                              <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah kategori ${c.name}`} onClick={() => setDlg({ kind: 'cat', item: c })}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                              <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus kategori ${c.name}`} onClick={() => setDlg({ kind: 'del-cat', item: c, count: counts[c.id] ?? 0 })}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        );
      })()}
      {dlg && (dlg.kind === 'cat' || dlg.kind === 'dept') && <NameDialog dlg={dlg} depts={state.status === 'ready' ? state.data.depts : []} onClose={() => setDlg(null)} onSaved={done} />}
      {dlg && (dlg.kind === 'del-cat' || dlg.kind === 'del-dept') && <DeleteDialog dlg={dlg} onClose={() => setDlg(null)} onDeleted={done} />}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return ref;
}

function NameDialog({ dlg, depts, onClose, onSaved }: { dlg: Extract<Dlg, { kind: 'cat' | 'dept' }>; depts: Department[]; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useModal();
  const isCat = dlg.kind === 'cat';
  const [name, setName] = useState(dlg.item?.name ?? '');
  const [deptId, setDeptId] = useState((dlg.kind === 'cat' && dlg.item?.departmentId) || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = isCat ? 'kategori' : 'departemen';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError(`Nama ${noun} wajib diisi.`);
    setBusy(true); setError(null);
    try {
      if (isCat) await data.saveCategory({ id: dlg.item?.id, name, departmentId: deptId || null });
      else await data.saveDepartment({ id: dlg.item?.id, name });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-nama" onClose={onClose} style={{ margin: 'auto' }}>
      <form onSubmit={submit} className="grid gap-16" noValidate>
        <h2 id="judul-nama" className="cg-modal__title">{dlg.item ? 'Ubah' : 'Tambah'} {noun}</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama-k">Nama {noun}</label>
          <input id="nama-k" className="cg-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        {isCat && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="dept-k">Departemen</label>
            <select id="dept-k" className="cg-input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">Tanpa departemen</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({ dlg, onClose, onDeleted }: { dlg: Extract<Dlg, { kind: 'del-cat' | 'del-dept' }>; onClose: () => void; onDeleted: () => void }) {
  const data = useData();
  const ref = useModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCat = dlg.kind === 'del-cat';

  async function run() {
    setBusy(true); setError(null);
    try { if (isCat) await data.deleteCategory(dlg.item.id); else await data.deleteDepartment(dlg.item.id); onDeleted(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-hapus" onClose={onClose} style={{ margin: 'auto' }}>
      <div className="grid gap-16">
        <h2 id="judul-hapus" className="cg-modal__title">Hapus {isCat ? 'kategori' : 'departemen'} “{dlg.item.name}”?</h2>
        <p className="cg-modal__body">
          {isCat
            ? (dlg.count > 0 ? `${dlg.count} produk di dalamnya akan menjadi “tanpa kategori”. Produknya tidak dihapus.` : 'Kategori ini kosong.')
            : (dlg.count > 0 ? `${dlg.count} kategori di dalamnya akan menjadi “tanpa departemen”. Kategorinya tidak dihapus.` : 'Departemen ini kosong.')}
        </p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="button" className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void run()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

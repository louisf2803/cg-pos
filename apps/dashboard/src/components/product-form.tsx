'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { DataError, formatRp, newId, parseRp, priceOverridePctProblem, variantsProblem, type CatalogProduct, type ProductPhotoInput } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { prepareProductPhoto } from '@/lib/image';

interface Row { key: string; id?: string; label: string; price: string; sku: string; isActive: boolean }
const newRow = (r: Partial<Row> = {}): Row => ({ key: newId(), label: '', price: '', sku: '', isActive: true, ...r });

class PhotoFailed extends Error {}

function ConfirmServiceDialog({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: () => void }) {
  const d = useDialog(onCancel);
  return (
    <dialog {...d.props} aria-labelledby="confirm-jasa-title">
      <div className="grid gap-12 p-16">
        <h3 id="confirm-jasa-title" className="text-lg font-bold">Ubah jenis menjadi Jasa?</h3>
        <p className="text-sm text-text-muted">
          Produk ini masih memiliki stok tercatat ({count} unit). Jasa tidak memiliki stok dan langsung terjual saat dipesan. Pelacakan stok akan dinonaktifkan.
        </p>
        <div className="flex justify-end gap-8 mt-8">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onCancel}>
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--primary" onClick={onConfirm}>
            Ya, ubah ke Jasa
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Form produk gaya Majoo: satu produk, boleh punya varian (S/M/L, dst.) dengan harga dan SKU masing-masing. */
export function ProductForm({ initial }: { initial?: CatalogProduct }) {
  const data = useData();
  const router = useRouter();
  const cats = useAsync(() => data.listCategories(), [data]);
  const employees = useAsync(() => data.listEmployees(), [data]);
  const [kind, setKind] = useState<'goods' | 'service'>(initial?.kind ?? 'goods');
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [price, setPrice] = useState(initial && initial.variants.length === 0 ? String(initial.price) : '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [hasVariants, setHasVariants] = useState((initial?.variants.length ?? 0) > 0);
  const [rows, setRows] = useState<Row[]>(initial?.variants.map((v) => newRow({ id: v.id, label: v.label, price: String(v.price), sku: v.sku ?? '', isActive: v.isActive })) ?? []);
  const [trackStock, setTrackStock] = useState(initial?.trackStock ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [serviceDurationMin, setServiceDurationMin] = useState(initial?.serviceDurationMin !== undefined ? String(initial.serviceDurationMin) : '');
  const [serviceStaffIds, setServiceStaffIds] = useState<string[]>(initial?.serviceStaffIds ?? []);
  const [overridePct, setOverridePct] = useState(initial?.priceOverridePct ? String(initial.priceOverridePct) : '');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const firstNew = useRef<HTMLInputElement | null>(null);
  // foto: 'keep' = tidak diubah; 'new' = dipasang setelah produk tersimpan; 'remove' = dihapus setelah tersimpan
  const [photo, setPhoto] = useState<{ kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; input: ProductPhotoInput; previewUrl: string }>({ kind: 'keep' });
  const [photoErr, setPhotoErr] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const savedId = useRef<string | undefined>(initial?.id);
  const shownPhoto = photo.kind === 'new' ? photo.previewUrl : photo.kind === 'remove' ? undefined : initial?.photoUrl;

  const productMeta = useAsync(async () => {
    if (!initial?.id) return { hasStock: false, stockQty: 0, hasRecipe: false };
    const [stocks, recipes] = await Promise.all([
      data.listStock({ kind: 'goods' }),
      data.listRecipes(),
    ]);
    const ids = new Set([initial.id, ...(initial.variants?.map((v) => v.id) ?? [])]);
    const matchedStock = stocks.filter((s) => ids.has(s.productId));
    const stockQty = matchedStock.reduce((sum, s) => sum + Math.max(0, s.qty), 0);
    const hasRecipe = recipes.some((r) => ids.has(r.id) && r.lines.length > 0);
    return {
      hasStock: stockQty > 0,
      stockQty,
      hasRecipe,
    };
  }, [data, initial?.id]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoErr(''); setPhotoBusy(true);
    try { const r = await prepareProductPhoto(file); setPhoto({ kind: 'new', input: r.photo, previewUrl: r.previewUrl }); }
    catch (e) { setPhotoErr(e instanceof Error ? e.message : 'Foto gagal diproses.'); }
    finally { setPhotoBusy(false); }
  }

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function toggleVariants(on: boolean) {
    setHasVariants(on);
    if (on && rows.length === 0) setRows([newRow({ label: 'S', price }), newRow({ label: 'M', price }), newRow({ label: 'L', price })]);
  }

  function requestKind(next: 'goods' | 'service') {
    if (next === kind) return;
    setErr(null);
    if (next === 'service') {
      const meta = productMeta.status === 'ready' ? productMeta.data : null;
      if (meta?.hasRecipe) {
        setErr({ msg: 'Produk jasa tidak boleh punya resep. Hapus resep terlebih dahulu di menu Inventori > Resep.' });
        return;
      }
      if (initial && initial.kind !== 'service' && meta?.hasStock) {
        setConfirmOpen(true);
        return;
      }
      setKind('service');
      setTrackStock(false);
    } else {
      setKind('goods');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr({ field: 'name', msg: 'Nama produk wajib diisi.' });
    if (kind === 'service') {
      const meta = productMeta.status === 'ready' ? productMeta.data : null;
      if (meta?.hasRecipe) {
        return setErr({ msg: 'Produk jasa tidak boleh punya resep. Hapus resep terlebih dahulu di menu Inventori > Resep.' });
      }
    }
    const variants = hasVariants ? rows.map((r) => ({ id: r.id, label: r.label, price: parseRp(r.price), sku: r.sku.trim() || undefined, isActive: r.isActive })) : [];
    if (hasVariants) {
      if (variants.length === 0) return setErr({ msg: 'Tambahkan minimal satu varian, atau matikan pilihan varian.' });
      if (rows.some((r) => !/\d/.test(r.price))) return setErr({ field: 'variants', msg: 'Isi harga tiap varian dalam rupiah.' });
      const vp = variantsProblem(variants);
      if (vp) return setErr({ field: 'variants', msg: vp });
    } else if (!/\d/.test(price)) return setErr({ field: 'price', msg: 'Isi harga dalam rupiah, 0 atau lebih.' });
    const pct = overridePct.trim() === '' ? 0 : Number(overridePct.replace(',', '.'));
    const pctProblem = priceOverridePctProblem(pct);
    if (pctProblem) return setErr({ field: 'override', msg: pctProblem });
    setSaving(true);
    try {
      const dur = serviceDurationMin.trim() ? Math.max(0, parseInt(serviceDurationMin, 10)) : undefined;
      const saved = await data.saveCatalogProduct({
        id: savedId.current, name, categoryId: categoryId || null, price: hasVariants ? 0 : parseRp(price), sku: hasVariants ? undefined : sku.trim() || undefined,
        trackStock: kind === 'service' ? false : trackStock, isActive, isFavorite: initial?.isFavorite, kind, variants,
        serviceDurationMin: kind === 'service' ? dur : undefined,
        serviceStaffIds: kind === 'service' ? serviceStaffIds : undefined,
      });
      if (pct > 0 || initial?.priceOverridePct) await data.setPriceOverride(saved.variants.length ? saved.variants.map((v) => v.id) : [saved.id], pct);
      savedId.current = saved.id;      // bila foto gagal, simpan ulang memperbarui produk yang sama, bukan membuat ganda
      if (photo.kind === 'new') await data.setProductPhoto(saved.id, photo.input).catch((e3: unknown) => { throw new PhotoFailed(e3 instanceof Error ? e3.message : 'Foto gagal diunggah.'); });
      else if (photo.kind === 'remove') await data.setProductPhoto(saved.id, null).catch((e3: unknown) => { throw new PhotoFailed(e3 instanceof Error ? e3.message : 'Foto gagal dihapus.'); });
      router.push('/produk');
    } catch (e2) {
      if (e2 instanceof PhotoFailed) setErr({ msg: `Produk sudah tersimpan, tetapi foto belum terpasang: ${e2.message} Coba simpan lagi.` });
      else setErr({ field: e2 instanceof DataError && /sku/i.test(e2.message) ? 'sku' : undefined, msg: e2 instanceof Error ? e2.message : 'Gagal menyimpan.' });
      setSaving(false);
    }
  }

  return (
    <>
      {cats.status === 'error' && <ErrorBox message={cats.message} onRetry={cats.reload} />}
      <form onSubmit={submit} noValidate className="grid gap-16 max-w-[720px]">
        {err && (!err.field || err.field === 'sku') && <div className="cg-banner cg-banner--danger" role="alert">{err.msg}</div>}
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama">Nama produk</label>
          <input id="nama" className="cg-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err?.field === 'name'} aria-describedby={err?.field === 'name' ? 'e-nama' : undefined} autoFocus />
          {err?.field === 'name' && <p id="e-nama" className="cg-error">{err.msg}</p>}
        </div>

        <div className="cg-field">
          <span className="cg-label" id="pf-jenis-label">Jenis produk</span>
          <div className="cg-tabs w-fit" role="radiogroup" aria-labelledby="pf-jenis-label">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'goods'}
              aria-selected={kind === 'goods'}
              className="cg-tab"
              onClick={() => requestKind('goods')}
            >
              Barang
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'service'}
              aria-selected={kind === 'service'}
              className="cg-tab"
              onClick={() => requestKind('service')}
            >
              Jasa
            </button>
          </div>
        </div>

        {kind === 'service' && (
          <fieldset className="grid gap-12 border border-border rounded-lg p-16 bg-surface-raised/30">
            <legend className="px-8 font-semibold text-sm">Pengaturan Jasa / Layanan</legend>
            <div className="cg-field">
              <label className="cg-label" htmlFor="durasi">Durasi layanan (menit, opsional)</label>
              <input
                id="durasi"
                type="number"
                min={0}
                className="cg-input cg-num"
                style={{ maxWidth: 160 }}
                placeholder="Mis. 30, 60"
                value={serviceDurationMin}
                onChange={(e) => setServiceDurationMin(e.target.value)}
              />
              <p className="text-sm text-text-muted">Estimasi durasi pengerjaan untuk antrean reservasi atau pemesanan.</p>
            </div>

            <div className="cg-field">
              <span className="cg-label">Staf pelaksana</span>
              <p className="text-sm text-text-muted mb-8">Pilih staf yang melayani jasa ini (kosong = semua staf):</p>
              {employees.status === 'loading' && <p className="text-sm text-text-muted">Memuat karyawan…</p>}
              {employees.status === 'ready' && employees.data.length === 0 && (
                <p className="text-sm text-text-muted">Belum ada karyawan terdaftar.</p>
              )}
              {employees.status === 'ready' && employees.data.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-h-[160px] overflow-y-auto border border-border rounded p-8 bg-surface">
                  {employees.data.map((emp) => {
                    const checked = serviceStaffIds.includes(emp.id);
                    return (
                      <label key={emp.id} className="flex items-center gap-8 text-sm cursor-pointer hover:bg-surface-raised p-4 rounded">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setServiceStaffIds((prev) => [...prev, emp.id]);
                            else setServiceStaffIds((prev) => prev.filter((id) => id !== emp.id));
                          }}
                        />
                        <span>{emp.name}</span>
                        {emp.role && <span className="cg-badge text-xs">{emp.role}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="kategori">Kategori</label>
          <select id="kategori" className="cg-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {cats.status === 'ready' && cats.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="cg-field">
          <span className="cg-label" id="foto-label">Foto produk (opsional)</span>
          <div className="flex items-center gap-16 flex-wrap" role="group" aria-labelledby="foto-label">
            {shownPhoto
              ? <img className="cg-thumb" src={shownPhoto} alt="Foto produk saat ini" width={96} height={96} style={{ width: 96, height: 96 }} />
              : <div className="cg-thumb grid place-items-center text-text-muted" style={{ width: 96, height: 96 }} aria-hidden><ImagePlus className="cg-icon" /></div>}
            <div className="grid gap-8">
              <label className="cg-btn cg-btn--secondary cg-btn--sm cursor-pointer">
                <ImagePlus className="cg-icon cg-icon--sm" aria-hidden /> {shownPhoto ? 'Ganti foto' : 'Pilih foto'}
                <input type="file" accept="image/*" className="cg-sr" aria-label="Pilih file foto produk" disabled={photoBusy} onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {shownPhoto && <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setPhoto(initial?.photoUrl && photo.kind === 'new' ? { kind: 'keep' } : { kind: 'remove' })}>{photo.kind === 'new' && initial?.photoUrl ? 'Batalkan foto baru' : 'Hapus foto'}</button>}
            </div>
          </div>
          <p className="text-text-muted text-sm mt-4">{photoBusy ? 'Mengolah foto…' : 'Foto dikecilkan otomatis dan baru terpasang setelah produk disimpan. Foto berlaku untuk seluruh varian.'}</p>
          {photoErr && <p className="cg-error" role="alert">{photoErr}</p>}
        </div>

        <label className="flex items-center gap-8">
          <input type="checkbox" checked={hasVariants} onChange={(e) => toggleVariants(e.target.checked)} /> Produk ini punya varian (misalnya ukuran S, M, L)
        </label>

        {!hasVariants && (
          <>
            <div className="cg-field">
              <label className="cg-label" htmlFor="harga">Harga jual (Rp)</label>
              <input id="harga" className="cg-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={err?.field === 'price'} aria-describedby={err?.field === 'price' ? 'e-harga' : undefined} />
              {err?.field === 'price' && <p id="e-harga" className="cg-error">{err.msg}</p>}
            </div>
            <div className="cg-field">
              <label className="cg-label" htmlFor="sku">SKU (opsional)</label>
              <input id="sku" className="cg-input" value={sku} onChange={(e) => setSku(e.target.value)} aria-invalid={err?.field === 'sku'} />
            </div>
          </>
        )}

        {hasVariants && (
          <fieldset className="grid gap-12 border border-border rounded-lg p-16">
            <legend className="px-8">Varian</legend>
            <p className="text-text-muted text-sm">Tiap varian punya harga dan SKU sendiri. Kasir memilih salah satunya saat produk diketuk.</p>
            <div className="cg-data-wrap">
              <table className="cg-data">
                <thead><tr><th>Nama varian</th><th>Harga (Rp)</th><th>SKU</th><th>Aktif</th><th><span className="cg-sr">Hapus</span></th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key}>
                      <td><input className="cg-input" aria-label={`Nama varian ${i + 1}`} value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} ref={i === rows.length - 1 ? firstNew : undefined} style={{ minWidth: 90 }} /></td>
                      <td><input className="cg-input" aria-label={`Harga varian ${r.label || i + 1}`} inputMode="numeric" value={r.price} onChange={(e) => patch(r.key, { price: e.target.value })} style={{ minWidth: 110 }} /></td>
                      <td><input className="cg-input" aria-label={`SKU varian ${r.label || i + 1}`} value={r.sku} onChange={(e) => patch(r.key, { sku: e.target.value })} style={{ minWidth: 110 }} /></td>
                      <td><input type="checkbox" aria-label={`Varian ${r.label || i + 1} aktif`} checked={r.isActive} onChange={(e) => patch(r.key, { isActive: e.target.checked })} /></td>
                      <td><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus varian ${r.label || i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err?.field === 'variants' && <p className="cg-error" role="alert">{err.msg}</p>}
            <div>
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => { setRows((rs) => [...rs, newRow({ price: rs[rs.length - 1]?.price ?? '' })]); setTimeout(() => firstNew.current?.focus(), 0); }}>
                <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah varian
              </button>
            </div>
            {rows.some((r) => /\d/.test(r.price)) && <p className="text-text-muted text-sm">Harga termurah: {formatRp(Math.min(...rows.filter((r) => /\d/.test(r.price)).map((r) => parseRp(r.price))))}</p>}
          </fieldset>
        )}

        <div className="cg-field"><label className="cg-label" htmlFor="pf-override">Kasir boleh ubah harga jual (± persen)</label>
          <input id="pf-override" className="cg-input cg-num" style={{ maxWidth: 160 }} inputMode="decimal" placeholder="0 = tidak boleh" value={overridePct} onChange={(e) => { setOverridePct(e.target.value.replace(/[^\d.,]/g, '')); setErr(null); }} aria-invalid={err?.field === 'override'} />
          <p className="text-sm text-text-muted">Kosong atau 0: harga tetap. Isi 20 bila kasir boleh menaikkan atau menurunkan harga sampai 20% dari harga daftar, misalnya untuk menu yang dihitung per timbangan atau tawar-menawar.</p>
          {err?.field === 'override' && <p className="cg-error" role="alert">{err.msg}</p>}</div>

        {kind === 'service' ? (
          <div className="rounded-lg border border-border bg-surface-raised p-12 text-sm text-text-muted" role="note">
            Jasa tidak punya stok, langsung terjual saat dipesan.
          </div>
        ) : (
          <label className="flex items-center gap-8">
            <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} /> Lacak stok produk ini
          </label>
        )}

        {initial && <label className="flex items-center gap-8"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Produk aktif (tampil di kasir)</label>}

        <div className="p-12 rounded-lg bg-surface-raised border border-border text-xs text-text-muted flex items-start justify-between gap-8" role="note">
          <div>
            <span className="font-semibold text-text block">Aturan Pajak Produk</span>
            <span>Produk ini mengikuti kebijakan pajak outlet aktif. Pemilihan tarif khusus atau pembebasan pajak per produk menunggu dukungan skema server lanjutan.</span>
          </div>
          <span className="cg-badge cg-badge--secondary text-[11px] shrink-0">Otomatis Outlet</span>
        </div>

        <div className="flex gap-8">
          <button className="cg-btn cg-btn--primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan produk'}</button>
          <button type="button" className="cg-btn cg-btn--secondary" onClick={() => router.push('/produk')}>Batal</button>
        </div>
      </form>

      {confirmOpen && (
        <ConfirmServiceDialog
          count={productMeta.status === 'ready' ? productMeta.data.stockQty : 0}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            setKind('service');
            setTrackStock(false);
          }}
        />
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Building2, ImagePlus, Pencil, Plus, Power, Search, Trash2, Users } from 'lucide-react';
import {
  DEFAULT_FACILITY_META,
  facilityDraftProblem,
  formatRp,
  isFacilityProduct,
  normalizeFacilitySku,
  parseRp,
  type CatalogProduct,
  type Category,
  type FacilityMeta,
  type FacilityUnit,
  type ProductPhotoInput,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { loadFacilityMeta, saveFacilityMetaEntry } from '@/lib/a58-preview';
import { useData } from '@/lib/data';
import { prepareProductPhoto } from '@/lib/image';
import { useAsync } from '@/lib/use-async';

interface FacilityRow {
  product: CatalogProduct;
  meta: FacilityMeta;
  categoryName: string;
}

type PhotoState =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'new'; input: ProductPhotoInput; previewUrl: string };

const digits = (v: string) => v.replace(/\D/g, '');

function FacilityModal({
  editing,
  initialMeta,
  categories,
  onClose,
  onSaved,
}: {
  editing?: CatalogProduct;
  initialMeta: FacilityMeta;
  categories: Category[];
  onClose: () => void;
  onSaved: (name: string, savedId: string, meta: FacilityMeta) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [name, setName] = useState(editing?.name ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [unit, setUnit] = useState<FacilityUnit>(initialMeta.unit);
  const [capacity, setCapacity] = useState(String(initialMeta.capacity));
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [note, setNote] = useState(initialMeta.note ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'keep' });
  const [photoErr, setPhotoErr] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const savedIdRef = useRef<string | undefined>(editing?.id);

  const shownPhoto =
    photo.kind === 'new'
      ? photo.previewUrl
      : photo.kind === 'remove'
        ? undefined
        : editing?.photoUrl;

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoErr('');
    setPhotoBusy(true);
    try {
      const processed = await prepareProductPhoto(file);
      setPhoto({ kind: 'new', input: processed.photo, previewUrl: processed.previewUrl });
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : 'Foto fasilitas gagal diproses.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || photoBusy) return;
    setErr('');

    const parsedPrice = price.trim() === '' ? -1 : parseRp(price);
    const parsedCapacity = Number(capacity || '0');
    const cleanSku = normalizeFacilitySku(sku);
    const problem = facilityDraftProblem({
      name,
      price: parsedPrice,
      capacity: parsedCapacity,
      unit,
      sku: cleanSku,
      categoryId: categoryId || null,
      isActive,
      note,
    });
    if (problem) {
      setErr(problem);
      return;
    }

    const nextMeta: FacilityMeta = {
      capacity: parsedCapacity,
      unit,
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    setSaving(true);
    try {
      const saved = await data.saveCatalogProduct({
        id: savedIdRef.current,
        name: name.trim(),
        categoryId: categoryId || null,
        kind: 'service',
        trackStock: false,
        isActive,
        isFavorite: editing?.isFavorite ?? false,
        price: parsedPrice,
        sku: cleanSku,
        variants: [],
      });
      savedIdRef.current = saved.id;
      saveFacilityMetaEntry(saved.id, nextMeta);

      if (photo.kind === 'new') {
        await data.setProductPhoto(saved.id, photo.input);
      } else if (photo.kind === 'remove') {
        await data.setProductPhoto(saved.id, null);
      }

      onSaved(saved.name, saved.id, nextMeta);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan fasilitas.');
      setSaving(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="fas-modal-title">
      <form onSubmit={handleSubmit} noValidate className="grid gap-16 p-20 max-w-[560px]">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="fas-modal-title" className="text-lg font-bold">
              {editing ? 'Ubah fasilitas' : 'Tambah fasilitas'}
            </h2>
            <p className="text-xs text-text-muted">
              Tarif per jam atau per sesi dapat langsung dipilih kasir saat mencatat pesanan.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose} aria-label="Tutup dialog">
            Tutup
          </button>
        </div>

        {err && (
          <div className="cg-banner cg-banner--danger" role="alert">
            {err}
          </div>
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="fas-nama">
            Nama fasilitas
          </label>
          <input
            id="fas-nama"
            className="cg-input"
            placeholder="Contoh: Ruang Rapat Anggrek atau Meja Biliar 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="fas-harga">
              Tarif sewa (Rp)
            </label>
            <input
              id="fas-harga"
              className="cg-input"
              inputMode="numeric"
              placeholder="75000"
              value={price}
              onChange={(e) => setPrice(digits(e.target.value))}
            />
          </div>

          <div className="cg-field">
            <span className="cg-label" id="fas-satuan-label">
              Satuan tarif
            </span>
            <div className="cg-tabs w-full" role="radiogroup" aria-labelledby="fas-satuan-label">
              <button
                type="button"
                role="radio"
                aria-checked={unit === 'jam'}
                aria-selected={unit === 'jam'}
                className="cg-tab flex-1"
                onClick={() => setUnit('jam')}
              >
                Per jam
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={unit === 'sesi'}
                aria-selected={unit === 'sesi'}
                className="cg-tab flex-1"
                onClick={() => setUnit('sesi')}
              >
                Per sesi
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="fas-kapasitas">
              Kapasitas (orang)
            </label>
            <input
              id="fas-kapasitas"
              className="cg-input"
              inputMode="numeric"
              placeholder="6"
              value={capacity}
              onChange={(e) => setCapacity(digits(e.target.value))}
              maxLength={3}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="fas-kategori">
              Kategori
            </label>
            <select
              id="fas-kategori"
              className="cg-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tanpa kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="fas-sku">
              Kode SKU (opsional)
            </label>
            <input
              id="fas-sku"
              className="cg-input"
              placeholder="FAS-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              maxLength={40}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="fas-catatan">
              Perlengkapan / catatan (opsional)
            </label>
            <input
              id="fas-catatan"
              className="cg-input"
              placeholder="Contoh: Proyektor, AC, papan tulis"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>

        <div className="cg-field">
          <span className="cg-label">Foto fasilitas (opsional)</span>
          <div className="flex flex-wrap items-center gap-12">
            {shownPhoto ? (
              <img
                src={shownPhoto}
                alt={`Foto ${name || 'fasilitas'}`}
                className="w-[64px] h-[64px] rounded-lg object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-[64px] h-[64px] rounded-lg border border-border bg-surface flex items-center justify-center text-text-muted shrink-0">
                <Building2 className="cg-icon" aria-hidden />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-8">
              <label className="cg-btn cg-btn--secondary cg-btn--sm cursor-pointer">
                <ImagePlus className="cg-icon cg-icon--sm" aria-hidden />
                {photoBusy ? 'Memproses…' : shownPhoto ? 'Ganti foto' : 'Unggah foto'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="cg-sr"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {shownPhoto && (
                <button
                  type="button"
                  className="cg-btn cg-btn--ghost cg-btn--sm"
                  onClick={() => setPhoto({ kind: 'remove' })}
                >
                  <Trash2 className="cg-icon cg-icon--sm" aria-hidden /> Hapus foto
                </button>
              )}
            </div>
          </div>
          {photoErr && <p className="cg-error">{photoErr}</p>}
        </div>

        <label className="flex items-center gap-8">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Aktif dan dapat dipesan di kasir</span>
        </label>

        <div className="flex flex-wrap justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving || photoBusy} aria-busy={saving}>
            {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan fasilitas'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function FasilitasPage() {
  const data = useData();
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'all' | FacilityUnit>('all');
  const [showInactive, setShowInactive] = useState(true);
  const [metaMap, setMetaMap] = useState<Record<string, FacilityMeta>>(() => loadFacilityMeta());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [actionErr, setActionErr] = useState('');

  const state = useAsync(async () => {
    const [catalog, categories] = await Promise.all([
      data.listCatalog({ includeInactive: true }),
      data.listCategories(),
    ]);
    return { catalog, categories };
  }, [data]);

  const rows: FacilityRow[] = useMemo(() => {
    if (state.status !== 'ready') return [];
    const catMap = new Map(state.data.categories.map((c) => [c.id, c.name]));
    const term = search.trim().toLowerCase();

    return state.data.catalog
      .filter((item) => isFacilityProduct(item, metaMap, catMap))
      .map((product) => ({
        product,
        meta: metaMap[product.id] ?? DEFAULT_FACILITY_META,
        categoryName: (product.categoryId ? catMap.get(product.categoryId) : undefined) ?? 'Tanpa kategori',
      }))
      .filter(({ product, meta }) => {
        if (!showInactive && !product.isActive) return false;
        if (unitFilter !== 'all' && meta.unit !== unitFilter) return false;
        if (term) {
          const hay = `${product.name} ${product.sku ?? ''} ${meta.note ?? ''}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      });
  }, [state, metaMap, showInactive, unitFilter, search]);

  const totalRegistered = useMemo(() => {
    if (state.status !== 'ready') return 0;
    const catMap = new Map(state.data.categories.map((c) => [c.id, c.name]));
    return state.data.catalog.filter((item) => isFacilityProduct(item, metaMap, catMap)).length;
  }, [state, metaMap]);

  async function handleToggleActive(product: CatalogProduct) {
    if (busyId) return;
    setBusyId(product.id);
    setActionErr('');
    setNotice('');
    try {
      await data.setCatalogActive(product.id, !product.isActive);
      setNotice(
        `${product.name} ${!product.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
      state.reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Gagal mengubah status fasilitas.');
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setEditing(undefined);
    setActionErr('');
    setModalOpen(true);
  }

  function openEdit(product: CatalogProduct) {
    setEditing(product);
    setActionErr('');
    setModalOpen(true);
  }

  const activeCount = rows.filter((r) => r.product.isActive).length;
  const maxCapacity = rows.reduce((m, r) => Math.max(m, r.meta.capacity), 0);

  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title="Produk fasilitas"
        subtitle="Kelola ruang rapat, meja khusus, atau unit fasilitas berbayar per jam maupun per sesi."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/laporan/fasilitas" className="cg-btn cg-btn--secondary">
              <BarChart3 className="cg-icon" aria-hidden /> Laporan pemakaian
            </Link>
            <button type="button" className="cg-btn cg-btn--primary" onClick={openCreate}>
              <Plus className="cg-icon" aria-hidden /> Tambah fasilitas
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau:</strong> produk fasilitas disimpan ke katalog server agar dapat ditagih di kasir. Kapasitas orang, satuan sewa, dan catatan sementara tersimpan di peramban.
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Penyimpanan lokal</span>
      </div>

      {notice && (
        <p role="status" className="cg-banner cg-banner--info">
          {notice}
        </p>
      )}
      {actionErr && (
        <p role="alert" className="cg-banner cg-banner--danger">
          {actionErr}
        </p>
      )}

      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat daftar fasilitas">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[76px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[220px] rounded-xl" />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-12">
            <label className="cg-search flex-1 min-w-[220px]">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <span className="cg-sr">Cari fasilitas</span>
              <input
                className="cg-input"
                type="search"
                placeholder="Cari nama, SKU, atau perlengkapan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div className="cg-tabs" role="tablist" aria-label="Filter satuan fasilitas">
              <button
                type="button"
                role="tab"
                aria-selected={unitFilter === 'all'}
                className="cg-tab"
                onClick={() => setUnitFilter('all')}
              >
                Semua
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={unitFilter === 'jam'}
                className="cg-tab"
                onClick={() => setUnitFilter('jam')}
              >
                Per jam
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={unitFilter === 'sesi'}
                className="cg-tab"
                onClick={() => setUnitFilter('sesi')}
              >
                Per sesi
              </button>
            </div>

            <label className="flex items-center gap-8 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span>Tampilkan nonaktif</span>
            </label>
          </div>

          {totalRegistered > 0 && (
            <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
              <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
                <span className="text-xs text-text-muted">Total fasilitas tampil</span>
                <strong className="block text-xl font-bold cg-num">{rows.length} unit</strong>
              </div>
              <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
                <span className="text-xs text-text-muted">Aktif di kasir</span>
                <strong className="block text-xl font-bold cg-num">{activeCount} unit</strong>
              </div>
              <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
                <span className="text-xs text-text-muted">Kapasitas maksimal</span>
                <strong className="block text-xl font-bold cg-num">
                  {maxCapacity > 0 ? `${maxCapacity} orang` : '—'}
                </strong>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="cg-empty">
              <Building2 className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
              <p>
                <strong>
                  {totalRegistered === 0
                    ? 'Belum ada produk fasilitas.'
                    : 'Tidak ada fasilitas yang cocok dengan filter.'}
                </strong>
              </p>
              <p className="text-text-muted text-sm">
                {totalRegistered === 0
                  ? 'Tambahkan ruang meeting, meja biliar, ruang VIP, atau fasilitas lain yang disewakan per jam maupun per sesi.'
                  : 'Coba ubah kata kunci pencarian atau filter satuan tarif.'}
              </p>
              {totalRegistered === 0 && (
                <button type="button" className="cg-btn cg-btn--primary mt-8" onClick={openCreate}>
                  <Plus className="cg-icon" aria-hidden /> Tambah fasilitas pertama
                </button>
              )}
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Fasilitas</th>
                    <th>Kategori</th>
                    <th className="text-right">Tarif sewa</th>
                    <th className="text-right">Kapasitas</th>
                    <th>Status</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ product, meta, categoryName }) => (
                    <tr key={product.id}>
                      <td className="min-w-[200px] max-w-[280px]">
                        <div className="flex items-start gap-12 min-w-0">
                          {product.photoUrl ? (
                            <img
                              src={product.photoUrl}
                              alt={`Foto ${product.name}`}
                              className="w-[40px] h-[40px] rounded-lg object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="w-[40px] h-[40px] rounded-lg border border-border bg-surface flex items-center justify-center text-text-muted shrink-0">
                              <Building2 className="cg-icon cg-icon--sm" aria-hidden />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold break-words">{product.name}</div>
                            <div className="text-xs text-text-muted break-words">
                              {product.sku ? `SKU ${product.sku}` : 'Tanpa SKU'}
                              {meta.note ? ` · ${meta.note}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="break-words">{categoryName}</td>
                      <td className="text-right whitespace-nowrap cg-num">
                        <strong>{formatRp(product.price)}</strong>
                        <span className="text-xs text-text-muted"> / {meta.unit}</span>
                      </td>
                      <td className="text-right whitespace-nowrap cg-num">
                        <span className="inline-flex items-center gap-4">
                          <Users className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                          {meta.capacity} orang
                        </span>
                      </td>
                      <td>
                        <span
                          className={`cg-badge ${product.isActive ? 'cg-badge--success' : ''}`}
                        >
                          {product.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-4">
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => openEdit(product)}
                            aria-label={`Ubah ${product.name}`}
                          >
                            <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => void handleToggleActive(product)}
                            disabled={busyId === product.id}
                            aria-label={`${product.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${product.name}`}
                          >
                            <Power className="cg-icon cg-icon--sm" aria-hidden />
                            {product.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalOpen && state.status === 'ready' && (
        <FacilityModal
          editing={editing}
          initialMeta={editing ? (metaMap[editing.id] ?? DEFAULT_FACILITY_META) : DEFAULT_FACILITY_META}
          categories={state.data.categories}
          onClose={() => setModalOpen(false)}
          onSaved={(savedName, savedId, savedMeta) => {
            setModalOpen(false);
            setMetaMap((prev) => ({ ...prev, [savedId]: savedMeta }));
            setNotice(`${savedName} disimpan ke daftar fasilitas.`);
            state.reload();
          }}
        />
      )}
    </div>
  );
}


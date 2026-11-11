'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Award, Pencil, Plus, Power, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  commissionGroupProblem,
  formatRole,
  formatRp,
  type Category,
  type CommissionGroup,
  type CommissionRateType,
  type ManagedEmployee,
  type Product,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import {
  countGroupProducts,
  loadCommissionGroups,
  saveCommissionGroups,
} from '@/lib/commission-store';
import { ErrorBox, PageHeader } from '@/components/page';

type DialogState =
  | { kind: 'form'; item?: CommissionGroup }
  | { kind: 'delete'; item: CommissionGroup }
  | null;

export default function GrupKomisiPage() {
  const data = useData();
  const st = useAsync(async () => {
    const [employees, categories, products] = await Promise.all([
      data.listManagedEmployees(),
      data.listCategories(),
      data.listProducts({ includeInactive: true }),
    ]);
    return { employees, categories, products };
  }, [data]);

  const [groups, setGroups] = useState<CommissionGroup[]>(() => loadCommissionGroups());
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const employees = st.status === 'ready' ? st.data.employees : [];
  const categories = st.status === 'ready' ? st.data.categories : [];
  const products = st.status === 'ready' ? st.data.products : [];

  const persistGroups = (next: CommissionGroup[], msg?: string) => {
    setGroups(next);
    saveCommissionGroups(next);
    if (msg) setNotice(msg);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const handleLoadSample = () => {
    if (st.status !== 'ready') return;
    const cashiers = employees.filter((e) => e.isActive).slice(0, 2);
    const firstEmp = cashiers.length > 0 ? cashiers.slice(0, 1).map((e) => e.id) : employees.slice(0, 1).map((e) => e.id);
    const allEmp = cashiers.length > 0 ? cashiers.map((e) => e.id) : firstEmp;
    const firstCat = categories[0]?.id ? [categories[0].id] : [];
    const sampleProducts = products.slice(0, 3).map((p) => p.id);

    const seeded: CommissionGroup[] = [
      {
        id: 'komisi-barista',
        name: 'Komisi Barista & Minuman',
        rateType: 'percent',
        rateValue: 5,
        employeeIds: allEmp,
        categoryIds: firstCat,
        productIds: firstCat.length === 0 ? sampleProducts : [],
        isActive: true,
      },
      {
        id: 'komisi-upsell',
        name: 'Insentif Upsell Produk Pilihan',
        rateType: 'fixed',
        rateValue: 1500,
        employeeIds: firstEmp,
        categoryIds: [],
        productIds: sampleProducts.slice(0, 2),
        isActive: true,
      },
    ];
    persistGroups(seeded, '2 contoh grup komisi dimuat dan diterapkan ke Laporan Komisi.');
  };

  const handleToggleActive = (group: CommissionGroup) => {
    const next = groups.map((g) =>
      g.id === group.id ? { ...g, isActive: !g.isActive } : g,
    );
    persistGroups(
      next,
      group.isActive
        ? `Grup "${group.name}" dinonaktifkan.`
        : `Grup "${group.name}" diaktifkan.`,
    );
  };

  const handleSaveGroup = (saved: CommissionGroup) => {
    const exists = groups.some((g) => g.id === saved.id);
    const next = exists
      ? groups.map((g) => (g.id === saved.id ? saved : g))
      : [saved, ...groups];
    persistGroups(next, `Grup komisi "${saved.name}" tersimpan di pratinjau lokal.`);
    setDialog(null);
  };

  const handleDeleteGroup = (group: CommissionGroup) => {
    const next = groups.filter((g) => g.id !== group.id);
    persistGroups(next, `Grup komisi "${group.name}" dihapus.`);
    setDialog(null);
  };

  const activeCount = useMemo(() => groups.filter((g) => g.isActive).length, [groups]);

  return (
    <>
      <PageHeader
        title="Daftar grup komisi"
        subtitle="Atur skema tarif komisi per karyawan dan kategori/produk untuk laporan komisi"
        helpText="Aturan komisi menghitung total komisi karyawan pada halaman Laporan Karyawan > tab Komisi berdasarkan penjualan lunas."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link
              href="/laporan/karyawan?tab=komisi"
              className="cg-btn cg-btn--secondary cg-btn--sm"
            >
              Buka Laporan Komisi
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={st.status !== 'ready'}
              onClick={() => setDialog({ kind: 'form' })}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah grup komisi
            </button>
          </div>
        }
      />

      <div
        className="cg-banner cg-banner--info mb-16 flex flex-wrap items-center justify-between gap-8"
        role="status"
      >
        <span>
          <strong>Pratinjau — aturan belum tersimpan di server.</strong> Grup komisi disimpan di peramban (`localStorage`) dan langsung dipakai menghitung komisi di Laporan Karyawan dari data pesanan nyata.
        </span>
        <span className="cg-badge text-[11px] font-semibold">Pratinjau</span>
      </div>

      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}

      {st.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat daftar grup komisi">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px]" />
        </div>
      )}

      {st.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Total grup komisi</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">{groups.length} grup</dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Grup aktif</dt>
              <dd className="text-xl font-bold cg-num text-success-strong mt-4">{activeCount} grup</dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Karyawan / Produk tersedia</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">
                {employees.length} staf · {products.length} produk
              </dd>
            </div>
          </dl>

          {groups.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
              <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                <input
                  type="search"
                  className="cg-input pl-32"
                  placeholder="Cari nama grup komisi..."
                  aria-label="Cari grup komisi"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          )}

          {notice && (
            <p role="status" className="cg-banner cg-banner--success text-sm">
              {notice}
            </p>
          )}

          {groups.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada grup komisi.</strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                Buat grup komisi dengan tarif persen atau nominal per item agar Laporan Komisi otomatis menghitung perolehan karyawan.
              </p>
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                <button
                  type="button"
                  className="cg-btn cg-btn--secondary cg-btn--sm"
                  onClick={handleLoadSample}
                >
                  <Sparkles className="cg-icon cg-icon--sm" aria-hidden /> Muat contoh grup komisi
                </button>
                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm"
                  onClick={() => setDialog({ kind: 'form' })}
                >
                  <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah grup komisi
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Grup komisi tidak ditemukan.</strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                Tidak ada grup yang cocok dengan kata kunci &quot;{search}&quot;.
              </p>
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--sm mt-8"
                onClick={() => setSearch('')}
              >
                Tampilkan semua
              </button>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="grid gap-12 tablet:hidden min-w-0">
                {filtered.map((g) => {
                  const matchedProdCount = countGroupProducts(g, products);
                  return (
                    <li
                      key={g.id}
                      className="p-16 rounded-xl border border-border bg-surface-raised grid gap-12 min-w-0"
                    >
                      <div className="flex items-start justify-between gap-8 min-w-0">
                        <strong className="font-bold text-text break-words min-w-0">
                          {g.name}
                        </strong>
                        <span
                          className={`cg-badge text-xs font-semibold shrink-0 ${
                            g.isActive ? 'cg-badge--success' : ''
                          }`}
                        >
                          {g.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-8 text-sm">
                        <div>
                          <dt className="text-xs text-text-muted">Jenis tarif</dt>
                          <dd className="font-medium text-text">
                            {g.rateType === 'percent' ? 'Persen penjualan' : 'Nominal per item'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Nilai tarif</dt>
                          <dd className="font-bold cg-num text-accent-strong">
                            {g.rateType === 'percent'
                              ? `${g.rateValue}%`
                              : `${formatRp(g.rateValue)} / item`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Karyawan terpasang</dt>
                          <dd className="cg-num font-medium">{g.employeeIds.length} karyawan</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Produk terpasang</dt>
                          <dd className="cg-num font-medium">{matchedProdCount} produk</dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-8 pt-8 border-t border-border/60">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          onClick={() => setDialog({ kind: 'form', item: g })}
                        >
                          <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => handleToggleActive(g)}
                        >
                          <Power className="cg-icon cg-icon--sm" aria-hidden />
                          {g.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => setDialog({ kind: 'delete', item: g })}
                        >
                          <Trash2 className="cg-icon cg-icon--sm" aria-hidden /> Hapus
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table */}
              <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr>
                      <th>Nama Grup</th>
                      <th>Jenis Tarif</th>
                      <th className="cg-num">Nilai</th>
                      <th className="cg-num">Karyawan Terpasang</th>
                      <th className="cg-num">Produk Terpasang</th>
                      <th>Status</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((g) => {
                      const matchedProdCount = countGroupProducts(g, products);
                      return (
                        <tr key={g.id}>
                          <td>
                            <div className="flex items-center gap-8 min-w-0">
                              <Award className="w-16 h-16 text-accent shrink-0" aria-hidden />
                              <strong className="font-semibold text-text break-words">
                                {g.name}
                              </strong>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            {g.rateType === 'percent' ? 'Persen penjualan' : 'Nominal per item'}
                          </td>
                          <td className="cg-num font-bold text-accent-strong whitespace-nowrap">
                            {g.rateType === 'percent'
                              ? `${g.rateValue}%`
                              : `${formatRp(g.rateValue)}/item`}
                          </td>
                          <td className="cg-num whitespace-nowrap">{g.employeeIds.length} orang</td>
                          <td className="cg-num whitespace-nowrap">
                            {matchedProdCount} produk
                            {g.categoryIds.length > 0 && (
                              <span className="text-xs text-text-muted ml-4">
                                ({g.categoryIds.length} kat.)
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <span
                              className={`cg-badge text-xs font-semibold ${
                                g.isActive ? 'cg-badge--success' : ''
                              }`}
                            >
                              {g.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-4">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Ubah grup ${g.name}`}
                                onClick={() => setDialog({ kind: 'form', item: g })}
                              >
                                <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                onClick={() => handleToggleActive(g)}
                              >
                                {g.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Hapus grup ${g.name}`}
                                onClick={() => setDialog({ kind: 'delete', item: g })}
                              >
                                <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {dialog?.kind === 'form' && (
        <CommissionGroupDialog
          initial={dialog.item}
          employees={employees}
          categories={categories}
          products={products}
          onClose={() => setDialog(null)}
          onSave={handleSaveGroup}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteCommissionDialog
          group={dialog.item}
          onClose={() => setDialog(null)}
          onDelete={() => handleDeleteGroup(dialog.item)}
        />
      )}
    </>
  );
}

function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

function CommissionGroupDialog({
  initial,
  employees,
  categories,
  products,
  onClose,
  onSave,
}: {
  initial?: CommissionGroup;
  employees: ManagedEmployee[];
  categories: Category[];
  products: Product[];
  onClose: () => void;
  onSave: (group: CommissionGroup) => void;
}) {
  const ref = useModalDialog();
  const [name, setName] = useState(initial?.name ?? '');
  const [rateType, setRateType] = useState<CommissionRateType>(initial?.rateType ?? 'percent');
  const [rateValue, setRateValue] = useState<string>(String(initial?.rateValue ?? 5));
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial?.employeeIds ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categoryIds ?? []);
  const [productIds, setProductIds] = useState<string[]>(initial?.productIds ?? []);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [prodFilter, setProdFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    const q = prodFilter.trim().toLowerCase();
    return products
      .filter((p) => p.isSellable !== false)
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, prodFilter]);

  const toggleId = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numeric = Number.parseFloat(rateValue.replace(',', '.'));
    const problem = commissionGroupProblem({
      name,
      rateType,
      rateValue: numeric,
    });
    if (problem) {
      setError(problem);
      return;
    }
    onSave({
      id: initial?.id ?? `kom-${Date.now()}`,
      name: name.trim(),
      rateType,
      rateValue: rateType === 'fixed' ? Math.round(numeric) : numeric,
      employeeIds,
      categoryIds,
      productIds,
      isActive,
    });
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-grup-komisi"
      onClose={onClose}
      style={{ margin: 'auto', width: 'min(640px, calc(100vw - 16px))' }}
    >
      <form className="grid gap-16" onSubmit={handleSubmit}>
        <h2 id="judul-grup-komisi" className="cg-modal__title">
          {initial ? 'Ubah grup komisi' : 'Tambah grup komisi'}
        </h2>

        <div className="cg-field">
          <label className="cg-label" htmlFor="kom-nama">
            Nama grup komisi
          </label>
          <input
            id="kom-nama"
            className="cg-input"
            placeholder="Mis. Komisi Barista"
            value={name}
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <span className="cg-label">Jenis tarif komisi</span>
            <div className="flex flex-wrap gap-8 mt-4" role="group" aria-label="Jenis tarif komisi">
              <button
                type="button"
                className="cg-chip"
                aria-pressed={rateType === 'percent'}
                onClick={() => {
                  setError(null);
                  setRateType('percent');
                  if (Number(rateValue) > 100) setRateValue('5');
                }}
              >
                Persen penjualan (%)
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={rateType === 'fixed'}
                onClick={() => {
                  setError(null);
                  setRateType('fixed');
                  if (Number(rateValue) <= 100) setRateValue('2000');
                }}
              >
                Nominal tetap / item
              </button>
            </div>
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="kom-nilai">
              {rateType === 'percent' ? 'Besaran persen (%)' : 'Nominal per item terjual (Rp)'}
            </label>
            <input
              id="kom-nilai"
              type="number"
              min={rateType === 'percent' ? 0.1 : 1}
              max={rateType === 'percent' ? 100 : undefined}
              step={rateType === 'percent' ? '0.1' : '100'}
              className="cg-input cg-num"
              value={rateValue}
              onChange={(e) => {
                setError(null);
                setRateValue(e.target.value);
              }}
            />
          </div>
        </div>

        {/* Pilih Karyawan */}
        <fieldset className="p-12 rounded-xl border border-border bg-surface space-y-8">
          <div className="flex items-center justify-between gap-8">
            <legend className="text-xs font-bold text-text">
              Tetapkan ke Karyawan ({employeeIds.length} dipilih)
            </legend>
            <div className="flex gap-8">
              <button
                type="button"
                className="text-xs text-accent-strong underline"
                onClick={() => setEmployeeIds(employees.map((e) => e.id))}
              >
                Pilih semua
              </button>
              <button
                type="button"
                className="text-xs text-text-muted underline"
                onClick={() => setEmployeeIds([])}
              >
                Kosongkan
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-8 max-h-[140px] overflow-y-auto">
            {employees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-8 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={employeeIds.includes(emp.id)}
                  onChange={() => toggleId(employeeIds, emp.id, setEmployeeIds)}
                  className="w-16 h-16 accent-accent"
                />
                <span className="truncate">{emp.name}</span>
                <span className="text-xs text-text-muted shrink-0">({formatRole(emp.role)})</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Pilih Kategori & Produk */}
        <fieldset className="p-12 rounded-xl border border-border bg-surface space-y-12">
          <legend className="text-xs font-bold text-text">
            Cakupan Kategori &amp; Produk ({categoryIds.length} kat., {productIds.length} produk langsung)
          </legend>

          {categories.length > 0 && (
            <div className="space-y-4">
              <span className="text-xs text-text-muted block">Kategori produk:</span>
              <div className="flex flex-wrap gap-8">
                {categories.map((cat) => {
                  const selected = categoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="cg-chip"
                      aria-pressed={selected}
                      onClick={() => toggleId(categoryIds, cat.id, setCategoryIds)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-8">
            <input
              type="search"
              className="cg-input text-sm"
              placeholder="Saring produk spesifik..."
              aria-label="Saring produk komisi"
              value={prodFilter}
              onChange={(e) => setProdFilter(e.target.value)}
            />
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-8 max-h-[150px] overflow-y-auto">
              {visibleProducts.map((p) => (
                <label key={p.id} className="flex items-center gap-8 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productIds.includes(p.id)}
                    onChange={() => toggleId(productIds, p.id, setProductIds)}
                    className="w-16 h-16 accent-accent"
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <label className="flex items-center gap-8 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-16 h-16 accent-accent"
          />
          <span>Aktifkan aturan grup komisi ini</span>
        </label>

        {error && (
          <p role="alert" className="text-danger-strong text-sm">
            {error}
          </p>
        )}

        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan grup
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteCommissionDialog({
  group,
  onClose,
  onDelete,
}: {
  group: CommissionGroup;
  onClose: () => void;
  onDelete: () => void;
}) {
  const ref = useModalDialog();
  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-hapus-komisi"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <div className="grid gap-16">
        <h2 id="judul-hapus-komisi" className="cg-modal__title">
          Hapus grup komisi “{group.name}”?
        </h2>
        <p className="cg-modal__body">
          Aturan komisi ini tidak lagi dihitung pada Laporan Komisi karyawan.
        </p>
        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--danger" onClick={onDelete}>
            Hapus
          </button>
        </div>
      </div>
    </dialog>
  );
}


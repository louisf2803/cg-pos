'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Power, Search, Trash2, Wallet } from 'lucide-react';
import {
  canDeleteDepositPackage,
  depositBonusAmount,
  depositBonusPct,
  depositPackageProblem,
  formatRp,
  type DepositPackage,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const INITIAL_DEPOSIT_PACKAGES: DepositPackage[] = [
  {
    id: 'dep-100',
    name: 'Deposit 100rb',
    creditAmount: 100000,
    salePrice: 100000,
    isActive: true,
    soldCount: 14,
    note: 'Saldo reguler tanpa masa hangus',
  },
  {
    id: 'dep-500',
    name: 'Deposit 500rb Bonus 50rb',
    creditAmount: 550000,
    salePrice: 500000,
    isActive: true,
    soldCount: 7,
    note: 'Bonus saldo 10% untuk pelanggan setia',
  },
  {
    id: 'dep-1000',
    name: 'Deposit Member Platinum 1 Juta',
    creditAmount: 1150000,
    salePrice: 1000000,
    isActive: true,
    soldCount: 0,
    note: 'Paket baru belum pernah terjual (bisa dihapus)',
  },
  {
    id: 'dep-promo',
    name: 'Promo Deposit Pembukaan Outlet',
    creditAmount: 250000,
    salePrice: 200000,
    isActive: false,
    soldCount: 5,
    note: 'Diarsipkan setelah periode promo selesai',
  },
];

type StatusFilter = 'all' | 'active' | 'inactive';

type DialogState =
  | { kind: 'form'; item?: DepositPackage }
  | { kind: 'delete'; item: DepositPackage }
  | null;

export default function PaketDepositPage() {
  const data = useData();
  const ctxState = useAsync(() => data.getContext(), [data]);

  const [packages, setPackages] = useState<DepositPackage[]>(INITIAL_DEPOSIT_PACKAGES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [packages, search, statusFilter]);

  const activeCount = useMemo(
    () => packages.filter((p) => p.isActive).length,
    [packages],
  );
  const soldPackagesCount = useMemo(
    () => packages.filter((p) => p.soldCount > 0).length,
    [packages],
  );

  const handleToggleActive = (pkg: DepositPackage) => {
    setPackages((prev) =>
      prev.map((item) =>
        item.id === pkg.id ? { ...item, isActive: !item.isActive } : item,
      ),
    );
    setStatusNotice(
      pkg.isActive
        ? `Paket "${pkg.name}" dinonaktifkan dari kasir.`
        : `Paket "${pkg.name}" diaktifkan kembali.`,
    );
  };

  const handleSavePackage = (saved: DepositPackage) => {
    setPackages((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      if (exists) {
        return prev.map((p) => (p.id === saved.id ? saved : p));
      }
      return [saved, ...prev];
    });
    setDialog(null);
    setStatusNotice(`Paket "${saved.name}" disimpan di pratinjau halaman.`);
  };

  const handleDeletePackage = (pkg: DepositPackage) => {
    if (!canDeleteDepositPackage(pkg)) return;
    setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
    setDialog(null);
    setStatusNotice(`Paket "${pkg.name}" dihapus dari pratinjau katalog.`);
  };

  return (
    <>
      <PageHeader
        title="Paket deposit"
        subtitle="Kelola paket isi saldo prabayar dan bonus nominal untuk pelanggan"
        helpText="Paket deposit dapat dijual kepada pelanggan di kasir untuk menambah saldo deposit yang dipakai pada transaksi berikutnya."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/laporan/deposit" className="cg-btn cg-btn--secondary cg-btn--sm">
              Laporan Deposit
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              onClick={() => setDialog({ kind: 'form' })}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah paket
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--info mb-16 flex flex-wrap items-center justify-between gap-8" role="status">
        <span>
          <strong>Pratinjau tampilan — menunggu dukungan server.</strong> Perubahan daftar paket hanya tersimpan sementara di memori halaman ini dan belum terhubung ke kasir.
        </span>
        <span className="cg-badge text-[11px] font-semibold">Pratinjau</span>
      </div>

      {ctxState.status === 'error' && (
        <ErrorBox message={ctxState.message} onRetry={ctxState.reload} />
      )}

      {ctxState.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat katalog paket deposit">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[260px]" />
        </div>
      )}

      {ctxState.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          {/* Summary KPI */}
          <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Total paket deposit</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">{packages.length} paket</dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Paket aktif</dt>
              <dd className="text-xl font-bold cg-num text-success-strong mt-4">{activeCount} paket</dd>
            </div>
            <div className="p-16 rounded-xl border border-border bg-surface-raised">
              <dt className="text-xs font-medium text-text-muted">Sudah pernah terjual</dt>
              <dd className="text-xl font-bold cg-num text-text mt-4">{soldPackagesCount} paket</dd>
            </div>
          </dl>

          {/* Search and Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
            <div className="relative flex-1 min-w-[220px] max-w-[380px]">
              <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                type="search"
                className="cg-input pl-32"
                placeholder="Cari nama paket atau catatan..."
                aria-label="Cari paket deposit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-8" role="group" aria-label="Filter status paket">
              {(
                [
                  { id: 'all', label: `Semua (${packages.length})` },
                  { id: 'active', label: `Aktif (${activeCount})` },
                  { id: 'inactive', label: `Nonaktif (${packages.length - activeCount})` },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="cg-chip"
                  aria-pressed={statusFilter === chip.id}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {statusNotice && (
            <p role="status" className="cg-banner cg-banner--success text-sm">
              {statusNotice}
            </p>
          )}

          {filtered.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada paket deposit yang cocok.</strong>
              </p>
              <p className="text-text-muted text-sm mt-4">
                Ubah kata kunci pencarian atau tambahkan paket deposit baru.
              </p>
              <div className="flex flex-wrap justify-center gap-8 mt-12">
                {(search || statusFilter !== 'all') && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                    }}
                  >
                    Tampilkan semua
                  </button>
                )}
                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm"
                  onClick={() => setDialog({ kind: 'form' })}
                >
                  <Plus className="cg-icon cg-icon--sm" aria-hidden /> Tambah paket
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< tablet) */}
              <ul className="grid gap-12 tablet:hidden min-w-0">
                {filtered.map((pkg) => {
                  const bonus = depositBonusAmount(pkg);
                  const bonusPct = depositBonusPct(pkg);
                  const deletable = canDeleteDepositPackage(pkg);
                  return (
                    <li
                      key={pkg.id}
                      className="p-16 rounded-xl border border-border bg-surface-raised grid gap-12 min-w-0"
                    >
                      <div className="flex items-start justify-between gap-8 min-w-0">
                        <div className="min-w-0">
                          <h3 className="font-bold text-text break-words">{pkg.name}</h3>
                          {pkg.note && (
                            <p className="text-xs text-text-muted mt-4 break-words">{pkg.note}</p>
                          )}
                        </div>
                        <span
                          className={`cg-badge shrink-0 ${
                            pkg.isActive ? 'cg-badge--success' : ''
                          }`}
                        >
                          {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-8 text-sm">
                        <div>
                          <dt className="text-xs text-text-muted">Nominal didapat</dt>
                          <dd className="font-bold cg-num text-text">{formatRp(pkg.creditAmount)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Harga jual</dt>
                          <dd className="font-semibold cg-num text-text">{formatRp(pkg.salePrice)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Bonus saldo</dt>
                          <dd className="text-xs font-semibold text-accent-strong cg-num">
                            {bonus > 0 ? `+${formatRp(bonus)} (${bonusPct}%)` : 'Tanpa bonus'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Riwayat jual</dt>
                          <dd className="text-xs font-medium cg-num text-text-muted">
                            {pkg.soldCount}x terjual
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-8 pt-8 border-t border-border/60">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm"
                          onClick={() => setDialog({ kind: 'form', item: pkg })}
                        >
                          <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => handleToggleActive(pkg)}
                        >
                          <Power className="cg-icon cg-icon--sm" aria-hidden />
                          {pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm"
                          onClick={() => setDialog({ kind: 'delete', item: pkg })}
                          title={
                            deletable
                              ? 'Hapus paket permanen'
                              : 'Paket sudah terjual; gunakan Nonaktifkan'
                          }
                        >
                          <Trash2 className="cg-icon cg-icon--sm" aria-hidden /> Hapus
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop Table (>= tablet) */}
              <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                <table className="cg-data w-full">
                  <thead>
                    <tr>
                      <th>Paket Deposit</th>
                      <th className="cg-num">Nominal Didapat</th>
                      <th className="cg-num">Harga Jual</th>
                      <th className="cg-num">Bonus Saldo</th>
                      <th className="cg-num">Terjual</th>
                      <th>Status</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((pkg) => {
                      const bonus = depositBonusAmount(pkg);
                      const bonusPct = depositBonusPct(pkg);
                      const deletable = canDeleteDepositPackage(pkg);
                      return (
                        <tr key={pkg.id}>
                          <td>
                            <div className="flex items-start gap-8">
                              <Wallet className="w-16 h-16 text-accent mt-[2px] shrink-0" aria-hidden />
                              <div className="min-w-0">
                                <div className="font-semibold text-text break-words">{pkg.name}</div>
                                {pkg.note && (
                                  <div className="text-xs text-text-muted break-words">{pkg.note}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="cg-num font-bold whitespace-nowrap">
                            {formatRp(pkg.creditAmount)}
                          </td>
                          <td className="cg-num whitespace-nowrap">
                            {formatRp(pkg.salePrice)}
                          </td>
                          <td className="cg-num whitespace-nowrap">
                            {bonus > 0 ? (
                              <span className="cg-badge cg-badge--success text-xs font-semibold">
                                +{formatRp(bonus)} ({bonusPct}%)
                              </span>
                            ) : (
                              <span className="text-text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className="cg-num whitespace-nowrap text-text-muted">
                            {pkg.soldCount}x
                          </td>
                          <td className="whitespace-nowrap">
                            <span
                              className={`cg-badge text-xs font-semibold ${
                                pkg.isActive ? 'cg-badge--success' : ''
                              }`}
                            >
                              {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-4">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Ubah ${pkg.name}`}
                                onClick={() => setDialog({ kind: 'form', item: pkg })}
                              >
                                <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                onClick={() => handleToggleActive(pkg)}
                              >
                                {pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-label={`Hapus ${pkg.name}`}
                                title={
                                  deletable
                                    ? 'Hapus paket'
                                    : 'Sudah pernah terjual; nonaktifkan saja'
                                }
                                onClick={() => setDialog({ kind: 'delete', item: pkg })}
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
        <DepositPackageDialog
          initial={dialog.item}
          onClose={() => setDialog(null)}
          onSave={handleSavePackage}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteDepositDialog
          pkg={dialog.item}
          onClose={() => setDialog(null)}
          onDeactivate={() => {
            if (dialog.item.isActive) {
              handleToggleActive(dialog.item);
            }
            setDialog(null);
          }}
          onDelete={() => handleDeletePackage(dialog.item)}
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

function DepositPackageDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: DepositPackage;
  onClose: () => void;
  onSave: (pkg: DepositPackage) => void;
}) {
  const ref = useModalDialog();
  const [name, setName] = useState(initial?.name ?? '');
  const [creditAmount, setCreditAmount] = useState<number>(initial?.creditAmount ?? 100000);
  const [salePrice, setSalePrice] = useState<number>(initial?.salePrice ?? 100000);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const bonus = depositBonusAmount({ creditAmount, salePrice });
  const bonusPct = depositBonusPct({ creditAmount, salePrice });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = depositPackageProblem({ name, creditAmount, salePrice });
    if (problem) {
      setError(problem);
      return;
    }
    onSave({
      id: initial?.id ?? `dep-${Date.now()}`,
      name: name.trim(),
      creditAmount: Math.round(creditAmount),
      salePrice: Math.round(salePrice),
      isActive,
      soldCount: initial?.soldCount ?? 0,
      note: note.trim() || undefined,
    });
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-form-deposit"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <form className="grid gap-16" onSubmit={handleSubmit}>
        <h2 id="judul-form-deposit" className="cg-modal__title">
          {initial ? 'Ubah paket deposit' : 'Tambah paket deposit'}
        </h2>

        <div className="cg-field">
          <label className="cg-label" htmlFor="dep-nama">
            Nama paket
          </label>
          <input
            id="dep-nama"
            className="cg-input"
            placeholder="Mis. Deposit 500rb Bonus 50rb"
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
            <label className="cg-label" htmlFor="dep-credit">
              Nominal saldo didapat (Rp)
            </label>
            <input
              id="dep-credit"
              type="number"
              min={1000}
              step={1000}
              className="cg-input cg-num"
              value={creditAmount}
              onChange={(e) => {
                setError(null);
                setCreditAmount(Number.parseInt(e.target.value || '0', 10));
              }}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="dep-price">
              Harga jual paket (Rp)
            </label>
            <input
              id="dep-price"
              type="number"
              min={1000}
              step={1000}
              className="cg-input cg-num"
              value={salePrice}
              onChange={(e) => {
                setError(null);
                setSalePrice(Number.parseInt(e.target.value || '0', 10));
              }}
            />
          </div>
        </div>

        <div className="p-12 rounded-lg border border-border bg-surface text-xs flex items-center justify-between gap-8">
          <span className="text-text-muted">Selisih bonus saldo pelanggan</span>
          <strong className="cg-num text-accent-strong">
            {bonus > 0 ? `+${formatRp(bonus)} (${bonusPct}%)` : 'Tidak ada bonus (1:1)'}
          </strong>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="dep-note">
            Catatan (opsional)
          </label>
          <input
            id="dep-note"
            className="cg-input"
            placeholder="Keterangan singkat paket"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-8 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-16 h-16 accent-accent"
          />
          <span>Aktif (paket tampil untuk dijual di kasir)</span>
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
            Simpan paket
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDepositDialog({
  pkg,
  onClose,
  onDeactivate,
  onDelete,
}: {
  pkg: DepositPackage;
  onClose: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const ref = useModalDialog();
  const deletable = canDeleteDepositPackage(pkg);

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      aria-labelledby="judul-hapus-deposit"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <div className="grid gap-16">
        <h2 id="judul-hapus-deposit" className="cg-modal__title">
          {deletable ? `Hapus paket “${pkg.name}”?` : `Paket “${pkg.name}” sudah pernah terjual`}
        </h2>

        {deletable ? (
          <p className="cg-modal__body">
            Paket ini belum pernah terjual sehingga aman dihapus permanen dari katalog pratinjau.
          </p>
        ) : (
          <p className="cg-modal__body">
            Paket ini tercatat sudah terjual <strong>{pkg.soldCount}x</strong> sehingga tidak dapat dihapus permanen agar riwayat laporan tetap utuh. Nonaktifkan saja bila tidak ingin ditawarkan lagi.
          </p>
        )}

        <div className="cg-modal__actions">
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Tutup
          </button>
          {deletable ? (
            <button
              type="button"
              className="cg-btn cg-btn--danger"
              onClick={onDelete}
            >
              Hapus permanen
            </button>
          ) : (
            pkg.isActive && (
              <button
                type="button"
                className="cg-btn cg-btn--primary"
                onClick={onDeactivate}
              >
                Nonaktifkan paket
              </button>
            )
          )}
        </div>
      </div>
    </dialog>
  );
}


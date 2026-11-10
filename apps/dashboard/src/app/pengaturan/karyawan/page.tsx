'use client';

import { useEffect, useRef, useState, useMemo, type FormEvent } from 'react';
import {
  KeyRound,
  Plus,
  Search,
  MoreVertical,
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  X,
  Edit2,
  Power,
} from 'lucide-react';
import {
  accessFor,
  pinProblem,
  PERMISSIONS,
  ROLE_LABEL,
  type Access,
  type Employee,
  type ManagedEmployee,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const ROLE = ROLE_LABEL;
const ACCESS_TEXT: Record<Access, string> = {
  allow: 'Boleh',
  approve: 'Perlu PIN manajer',
  deny: 'Tidak boleh',
};

export default function KaryawanDanAkses() {
  const data = useData();

  // Load context outlet & karyawan
  const contextAsync = useAsync(async () => {
    const ctx = await data.getContext();
    const employees = await data.listManagedEmployees();
    return { ctx, employees };
  }, [data]);

  const [targetPin, setTargetPin] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState<ManagedEmployee | 'new' | null>(null);
  const [showOutletSummary, setShowOutletSummary] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successPinName, setSuccessPinName] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'cashier' | 'manager' | 'owner'>('all');

  // Menu dropdown ID yang sedang terbuka
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  async function toggleStatus(e: ManagedEmployee) {
    setBusyId(e.id);
    setErrorMessage('');
    try {
      await data.saveEmployee({
        id: e.id,
        name: e.name,
        role: e.role === 'manager' ? 'manager' : 'cashier',
        isActive: !e.isActive,
      });
      contextAsync.reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengubah status karyawan.');
    } finally {
      setBusyId(null);
      setActiveMenuId(null);
    }
  }

  // Hitung Kuota Karyawan & Admin
  const employeesList = contextAsync.status === 'ready' ? contextAsync.data.employees : [];
  const ctx = contextAsync.status === 'ready' ? contextAsync.data.ctx : null;

  const quota = useMemo(() => {
    const activeStaff = employeesList.filter((e) => e.role === 'cashier' && e.isActive);
    const activeAdmins = employeesList.filter((e) => (e.role === 'manager' || e.role === 'owner') && e.isActive);

    const maxStaffQuota = Math.max(10, Math.ceil((activeStaff.length + 2) / 5) * 5);
    const maxAdminQuota = Math.max(5, Math.ceil((activeAdmins.length + 1) / 5) * 5);

    return {
      staffTotal: maxStaffQuota,
      staffUsed: activeStaff.length,
      staffRemaining: Math.max(0, maxStaffQuota - activeStaff.length),
      adminTotal: maxAdminQuota,
      adminUsed: activeAdmins.length,
      adminRemaining: Math.max(0, maxAdminQuota - activeAdmins.length),
    };
  }, [employeesList]);

  // Filter list karyawan
  const filteredEmployees = useMemo(() => {
    return employeesList.filter((e, idx) => {
      const code = `KRY-${String(idx + 1).padStart(3, '0')}`;
      const matchesSearch =
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? e.isActive
          : !e.isActive;

      const matchesRole =
        roleFilter === 'all'
          ? true
          : e.role === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [employeesList, searchQuery, statusFilter, roleFilter]);

  return (
    <div className="space-y-24 max-w-full">
      {/* 1. Header: Judul + Subtitle + Tombol Aksi */}
      <PageHeader
        title="Karyawan dan akses"
        subtitle="Kelola data staf, pengaturan peran kasir/manajer, dan otorisasi akses masuk kasir"
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary inline-flex items-center gap-6 text-xs font-semibold"
              onClick={() => setShowOutletSummary(true)}
            >
              <Building2 className="cg-icon cg-icon--xs" aria-hidden />
              <span>Ringkasan outlet</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary inline-flex items-center gap-6 text-xs font-semibold"
              onClick={() => setEditEmployee('new')}
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Tambah karyawan</span>
            </button>
          </div>
        }
      />

      {/* Banner Notifikasi Pesan */}
      {errorMessage && (
        <div role="alert" className="cg-banner cg-banner--danger">
          <p>{errorMessage}</p>
        </div>
      )}

      {successPinName && (
        <div role="status" className="cg-banner cg-banner--info">
          <p>
            PIN untuk <strong>{successPinName}</strong> berhasil diperbarui. Silakan sampaikan PIN baru secara langsung ke yang bersangkutan.
          </p>
        </div>
      )}

      {/* 2. Kartu Kuota di Atas: Total, Terpakai, Tersisa */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
        {/* Kuota Staf / Kasir */}
        <div className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-12">
            <div className="flex items-center gap-8">
              <div className="p-8 rounded-lg bg-accent/10 text-accent">
                <Users className="cg-icon cg-icon--sm" aria-hidden />
              </div>
              <div>
                <span className="text-xs font-bold text-text uppercase tracking-wider block">
                  Kuota Staf Kasir
                </span>
                <span className="text-xs text-text-muted">Akses kasir untuk transaksi outlet</span>
              </div>
            </div>
            <span className="text-xs font-bold px-8 py-2 rounded-full bg-accent/10 text-accent">
              {quota.staffUsed} / {quota.staffTotal}
            </span>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between text-xs text-text-muted">
              <span>Terpakai: <strong className="text-text">{quota.staffUsed} orang</strong></span>
              <span>Tersisa: <strong className="text-accent">{quota.staffRemaining} slot</strong></span>
            </div>
            <div className="w-full h-8 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${Math.min(100, (quota.staffUsed / quota.staffTotal) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Kuota Admin / Manajer */}
        <div className="p-16 rounded-xl bg-surface-raised border border-border cg-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-12">
            <div className="flex items-center gap-8">
              <div className="p-8 rounded-lg bg-warning/10 text-warning">
                <ShieldCheck className="cg-icon cg-icon--sm" aria-hidden />
              </div>
              <div>
                <span className="text-xs font-bold text-text uppercase tracking-wider block">
                  Kuota Admin & Manajer
                </span>
                <span className="text-xs text-text-muted">Akses manajerial dan otorisasi</span>
              </div>
            </div>
            <span className="text-xs font-bold px-8 py-2 rounded-full bg-warning/10 text-warning">
              {quota.adminUsed} / {quota.adminTotal}
            </span>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between text-xs text-text-muted">
              <span>Terpakai: <strong className="text-text">{quota.adminUsed} orang</strong></span>
              <span>Tersisa: <strong className="text-warning">{quota.adminRemaining} slot</strong></span>
            </div>
            <div className="w-full h-8 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full bg-warning rounded-full transition-all"
                style={{ width: `${Math.min(100, (quota.adminUsed / quota.adminTotal) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bar Kontrol: Pencarian + Filter Status + Filter Peran */}
      <div className="flex flex-wrap items-center justify-between gap-12 p-12 rounded-xl bg-surface-raised border border-border cg-card">
        {/* Input Pencarian */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="cg-icon cg-icon--xs absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
          <input
            type="search"
            placeholder="Cari nama atau kode karyawan…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cg-input pl-36 w-full text-xs h-[36px]"
          />
        </div>

        {/* Filter Peran & Status */}
        <div className="flex flex-wrap items-center gap-8">
          <select
            className="cg-input text-xs h-[36px] px-8"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            aria-label="Filter peran karyawan"
          >
            <option value="all">Semua Peran</option>
            <option value="cashier">Kasir</option>
            <option value="manager">Manajer</option>
            <option value="owner">Pemilik</option>
          </select>

          <select
            className="cg-input text-xs h-[36px] px-8"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter status karyawan"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Status Muat Data */}
      {contextAsync.status === 'error' && (
        <ErrorBox message={contextAsync.message} onRetry={contextAsync.reload} />
      )}

      {contextAsync.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat daftar karyawan">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {/* 4. Tampilan Data: Tabel (Desktop/Tablet) & Kartu Responsif (Mobile) */}
      {contextAsync.status === 'ready' && (
        <>
          {filteredEmployees.length === 0 ? (
            <div className="cg-empty p-32 text-center rounded-xl bg-surface-raised border border-border">
              <Users className="w-32 h-32 mx-auto text-text-muted mb-8" aria-hidden />
              <p className="font-semibold text-text text-sm">Tidak ada karyawan yang sesuai filter.</p>
              <p className="text-xs text-text-muted mt-4">
                Coba sesuaikan kata kunci pencarian atau ubah pilihan filter di atas.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP & TABLET VIEW: Tabel Lebar */}
              <div className="hidden tablet:block rounded-xl bg-surface-raised border border-border cg-card overflow-hidden">
                <div className="cg-data-wrap">
                  <table className="cg-data w-full" style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th className="py-12 px-16 text-left">Nama & Kode</th>
                        <th className="py-12 px-16 text-left">Posisi / Peran</th>
                        <th className="py-12 px-16 text-left">Outlet</th>
                        <th className="py-12 px-16 text-left">Status</th>
                        <th className="py-12 px-16 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((e, idx) => {
                        const code = `KRY-${String(idx + 1).padStart(3, '0')}`;
                        const outletDisplay = e.role === 'owner' ? 'Semua Outlet' : (ctx?.outletName || 'Outlet Utama');

                        return (
                          <tr key={e.id} className={`border-b border-border last:border-0 ${e.isActive ? '' : 'opacity-60 bg-surface/30'}`}>
                            {/* Nama + Kode */}
                            <td className="py-12 px-16">
                              <div className="font-semibold text-text text-sm">{e.name}</div>
                              <div className="text-[11px] font-mono text-text-muted">{code}</div>
                            </td>

                            {/* Posisi / Peran */}
                            <td className="py-12 px-16">
                              <span
                                className={`inline-flex items-center px-8 py-2 rounded-full text-xs font-semibold ${
                                  e.role === 'owner'
                                    ? 'bg-purple-500/10 text-purple-700'
                                    : e.role === 'manager'
                                    ? 'bg-warning/10 text-warning'
                                    : 'bg-accent/10 text-accent'
                                }`}
                              >
                                {ROLE[e.role]}
                              </span>
                            </td>

                            {/* Outlet */}
                            <td className="py-12 px-16 text-xs text-text-muted">
                              <span className="inline-flex items-center gap-4">
                                <Building2 className="w-12 h-12" aria-hidden />
                                <span>{outletDisplay}</span>
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-12 px-16">
                              {e.isActive ? (
                                <span className="inline-flex items-center gap-4 text-xs font-semibold text-success">
                                  <CheckCircle2 className="w-12 h-12" aria-hidden />
                                  <span>Aktif</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-4 text-xs font-semibold text-text-muted">
                                  <XCircle className="w-12 h-12" aria-hidden />
                                  <span>Nonaktif</span>
                                </span>
                              )}
                            </td>

                            {/* Tindakan: Tombol Rapi + Menu */}
                            <td className="py-12 px-16 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-6">
                                {e.isActive && (
                                  <button
                                    type="button"
                                    className="cg-btn cg-btn--secondary cg-btn--sm inline-flex items-center gap-4"
                                    onClick={() => {
                                      setSuccessPinName(null);
                                      setTargetPin(e);
                                    }}
                                    title={`Atur PIN kasir untuk ${e.name}`}
                                    aria-label={`Atur PIN ${e.name}`}
                                  >
                                    <KeyRound className="cg-icon cg-icon--xs" aria-hidden />
                                    <span>Atur PIN</span>
                                  </button>
                                )}

                                {e.role !== 'owner' && (
                                  <button
                                    type="button"
                                    className="cg-btn cg-btn--ghost cg-btn--sm"
                                    onClick={() => setEditEmployee(e)}
                                    aria-label={`Ubah ${e.name}`}
                                  >
                                    Ubah
                                  </button>
                                )}

                                {e.role !== 'owner' && (
                                  <button
                                    type="button"
                                    className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                                    disabled={busyId === e.id}
                                    onClick={() => void toggleStatus(e)}
                                    aria-label={`${e.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${e.name}`}
                                  >
                                    {e.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MOBILE VIEW (< 768px): Daftar Kartu Responsif */}
              <div className="block tablet:hidden space-y-12">
                {filteredEmployees.map((e, idx) => {
                  const code = `KRY-${String(idx + 1).padStart(3, '0')}`;
                  const outletDisplay = e.role === 'owner' ? 'Semua Outlet' : (ctx?.outletName || 'Outlet Utama');

                  return (
                    <div
                      key={e.id}
                      className={`p-16 rounded-xl bg-surface-raised border border-border cg-card space-y-12 ${
                        e.isActive ? '' : 'opacity-70 bg-surface/40'
                      }`}
                    >
                      {/* Baris Atas: Nama & Kode + Status */}
                      <div className="flex items-start justify-between gap-8">
                        <div>
                          <h3 className="font-bold text-text text-sm break-words">{e.name}</h3>
                          <span className="text-[11px] font-mono text-text-muted">{code}</span>
                        </div>
                        <div>
                          {e.isActive ? (
                            <span className="inline-flex items-center gap-4 px-8 py-2 rounded-full text-[11px] font-semibold bg-success/15 text-success">
                              <CheckCircle2 className="w-10 h-10" aria-hidden />
                              <span>Aktif</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-4 px-8 py-2 rounded-full text-[11px] font-semibold bg-surface text-text-muted">
                              <XCircle className="w-10 h-10" aria-hidden />
                              <span>Nonaktif</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Baris Tengah: Peran & Outlet */}
                      <div className="flex flex-wrap items-center gap-8 text-xs">
                        <span
                          className={`inline-flex items-center px-8 py-2 rounded-full font-semibold ${
                            e.role === 'owner'
                              ? 'bg-purple-500/10 text-purple-700'
                              : e.role === 'manager'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-accent/10 text-accent'
                          }`}
                        >
                          {ROLE[e.role]}
                        </span>
                        <span className="text-text-muted flex items-center gap-4">
                          <Building2 className="w-12 h-12" aria-hidden />
                          <span>{outletDisplay}</span>
                        </span>
                      </div>

                      {/* Baris Bawah: Tombol Tindakan */}
                      <div className="pt-10 border-t border-border flex flex-wrap items-center gap-8">
                        {e.isActive && (
                          <button
                            type="button"
                            className="cg-btn cg-btn--secondary cg-btn--sm flex-1 inline-flex items-center justify-center gap-6"
                            onClick={() => {
                              setSuccessPinName(null);
                              setTargetPin(e);
                            }}
                          >
                            <KeyRound className="cg-icon cg-icon--xs" aria-hidden />
                            <span>Atur PIN</span>
                          </button>
                        )}

                        {e.role !== 'owner' && (
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => setEditEmployee(e)}
                          >
                            Ubah
                          </button>
                        )}

                        {e.role !== 'owner' && (
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                            disabled={busyId === e.id}
                            onClick={() => void toggleStatus(e)}
                          >
                            {e.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* 5. Matriks Hak Akses per Peran di Kasir */}
      <section className="mt-32 p-20 rounded-xl bg-surface-raised border border-border cg-card" aria-labelledby="hak-akses-peran">
        <h2 id="hak-akses-peran" className="text-base font-bold text-text mb-4">
          Hak akses per peran di kasir
        </h2>
        <p className="text-xs text-text-muted mb-16 leading-relaxed">
          Pemilik dan manajer dapat melakukan otorisasi langsung. Kasir memerlukan persetujuan PIN manajer untuk tindakan yang memodifikasi nominal uang atau rekonsiliasi.
        </p>

        <div className="cg-data-wrap overflow-x-auto">
          <table className="cg-data w-full" style={{ minWidth: 0 }}>
            <thead>
              <tr className="border-b border-border">
                <th className="py-10 px-12 text-left">Tindakan Kasir</th>
                <th className="py-10 px-12 text-center">Kasir</th>
                <th className="py-10 px-12 text-center">Manajer</th>
                <th className="py-10 px-12 text-center">Pemilik</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0 text-xs">
                  <td className="py-8 px-12 font-medium text-text break-words max-w-[340px]">
                    {p.label}
                  </td>
                  {(['cashier', 'manager', 'owner'] as const).map((r) => {
                    const a = accessFor(r, p.id);
                    return (
                      <td key={r} className="py-8 px-12 text-center">
                        <span
                          className={`inline-block px-8 py-2 rounded-full text-[11px] font-semibold ${
                            a === 'allow'
                              ? 'bg-success/15 text-success'
                              : a === 'approve'
                              ? 'bg-warning/15 text-warning font-bold'
                              : 'bg-surface text-text-muted'
                          }`}
                        >
                          {ACCESS_TEXT[a]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL 1: Tambah / Ubah Karyawan */}
      {editEmployee && (
        <EmployeeDialog
          employee={editEmployee === 'new' ? undefined : editEmployee}
          onClose={() => setEditEmployee(null)}
          onSaved={() => {
            setEditEmployee(null);
            contextAsync.reload();
          }}
        />
      )}

      {/* MODAL 2: Atur PIN Karyawan (6 Digit, Aman tanpa simpan mentah) */}
      {targetPin && (
        <PinDialog
          employee={targetPin}
          onClose={() => setTargetPin(null)}
          onSaved={() => {
            setSuccessPinName(targetPin.name);
            setTargetPin(null);
          }}
        />
      )}

      {/* MODAL 3: Ringkasan Karyawan per Outlet */}
      {showOutletSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="outlet-summary-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowOutletSummary(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-raised border border-border shadow-pop p-24 select-none animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h3 id="outlet-summary-title" className="text-base font-bold text-text flex items-center gap-8">
                <Building2 className="cg-icon cg-icon--sm text-accent" aria-hidden />
                <span>Ringkasan Karyawan Outlet</span>
              </h3>
              <button
                type="button"
                className="p-6 rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
                onClick={() => setShowOutletSummary(false)}
                aria-label="Tutup ringkasan"
              >
                <X className="cg-icon cg-icon--sm" aria-hidden />
              </button>
            </div>

            <div className="py-16 space-y-12">
              <div className="p-12 rounded-xl bg-surface border border-border space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-text text-sm">{ctx?.outletName || 'Outlet Utama'}</h4>
                    <span className="text-[11px] text-text-muted">{ctx?.orgName || 'CG POS'}</span>
                  </div>
                  <span className="px-8 py-2 rounded-full bg-accent/10 text-accent font-bold text-xs">
                    {employeesList.filter((e) => e.isActive).length} Aktif
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-8 pt-8 border-t border-border/50 text-xs">
                  <div>
                    <span className="text-text-muted block text-[11px]">Kasir</span>
                    <span className="font-bold text-text">
                      {employeesList.filter((e) => e.role === 'cashier' && e.isActive).length}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Manajer</span>
                    <span className="font-bold text-text">
                      {employeesList.filter((e) => e.role === 'manager' && e.isActive).length}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Nonaktif</span>
                    <span className="font-bold text-text-muted">
                      {employeesList.filter((e) => !e.isActive).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-12 border-t border-border flex justify-end">
              <button
                type="button"
                className="cg-btn cg-btn--secondary px-20 py-8 text-xs font-semibold"
                onClick={() => setShowOutletSummary(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dialog Form Atur PIN 6 Digit (Aman, Tanpa Menampilkan atau Menyimpan PIN) */
function PinDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = pinProblem(pin);
    if (problem) return setError(problem);
    if (pin !== again) return setError('Kedua isian PIN tidak sama.');
    setBusy(true);
    setError(null);
    try {
      await data.setEmployeePin(employee.id, pin);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN gagal disimpan.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal rounded-2xl bg-surface-raised border border-border shadow-pop p-24 max-w-sm w-full"
      aria-labelledby="judul-pin"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <form onSubmit={submit} className="grid gap-16">
        <h2 id="judul-pin" className="cg-modal__title text-base font-bold text-text">
          Atur PIN: {employee.name}
        </h2>
        <p className="cg-modal__body text-xs text-text-muted">
          PIN lama akan diganti. Demi keamanan, PIN tidak disimpan atau ditampilkan kembali dan hanya dapat diatur ulang.
        </p>

        <div className="cg-field">
          <label className="cg-label text-xs font-semibold" htmlFor="pin-baru">
            PIN baru (6 digit angka)
          </label>
          <input
            id="pin-baru"
            className="cg-input text-center tracking-widest text-base font-mono"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            autoFocus
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        <div className="cg-field">
          <label className="cg-label text-xs font-semibold" htmlFor="pin-ulang">
            Ulangi PIN baru
          </label>
          <input
            id="pin-ulang"
            className="cg-input text-center tracking-widest text-base font-mono"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            required
            value={again}
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        {error && <p role="alert" className="text-xs text-danger font-medium">{error}</p>}

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--ghost text-xs"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary text-xs font-semibold"
            disabled={busy || pin.length !== 6 || again.length !== 6}
          >
            {busy ? 'Menyimpan…' : 'Simpan PIN'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Dialog Form Tambah / Ubah Karyawan */
function EmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee?: ManagedEmployee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState<'manager' | 'cashier'>(
    employee?.role === 'manager' ? 'manager' : 'cashier'
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Nama karyawan wajib diisi.');
    setBusy(true);
    setError(null);
    try {
      await data.saveEmployee({ id: employee?.id, name, role });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data karyawan.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="cg-modal rounded-2xl bg-surface-raised border border-border shadow-pop p-24 max-w-md w-full"
      aria-labelledby="judul-karyawan"
      onClose={onClose}
      style={{ margin: 'auto' }}
    >
      <form onSubmit={submit} className="grid gap-16" noValidate>
        <h2 id="judul-karyawan" className="cg-modal__title text-base font-bold text-text">
          {employee ? 'Ubah Karyawan' : 'Tambah Karyawan Baru'}
        </h2>

        <div className="cg-field">
          <label className="cg-label text-xs font-semibold" htmlFor="nama-karyawan">
            Nama Lengkap
          </label>
          <input
            id="nama-karyawan"
            className="cg-input text-xs"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masukkan nama staf kasir / manajer"
          />
        </div>

        <div className="cg-field">
          <label className="cg-label text-xs font-semibold" htmlFor="peran-karyawan">
            Peran & Hak Akses
          </label>
          <select
            id="peran-karyawan"
            className="cg-input text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as 'manager' | 'cashier')}
          >
            <option value="cashier">Kasir — Transaksi penjualan dan cetak struk</option>
            <option value="manager">Manajer — Otorisasi void, diskon, dan manajemen data</option>
          </select>
        </div>

        {!employee && (
          <p className="text-text-muted text-xs bg-surface p-10 rounded-lg border border-border">
            Setelah karyawan disimpan, atur PIN 6 digit melalui tombol “Atur PIN” agar dapat masuk ke aplikasi kasir.
          </p>
        )}

        {error && <p role="alert" className="text-xs text-danger font-medium">{error}</p>}

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--ghost text-xs"
            onClick={() => ref.current?.close()}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary text-xs font-semibold"
            disabled={busy}
          >
            {busy ? 'Menyimpan…' : 'Simpan Karyawan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

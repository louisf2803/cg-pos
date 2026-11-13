'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  Bell,
  ChevronDown,
  MoreVertical,
  Sliders,
  HelpCircle,
  Sparkles,
  DollarSign,
  Package,
  Layers,
  LogOut,
  User,
  X,
  Lock,
  ArrowRight,
  CheckCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  formatStockAlertSeenValue,
  getStockAlertSeenKey,
  groupStockAlerts,
  isStockAlertSeen,
  type StockAlertGroup,
  type StockItem,
} from '@cgpos/shared';
import { MODUL, getModuleForPath } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { todayKey } from '@/components/fin-common';
import { useShell } from './shell-context';

export function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const auth = useAuth();
  const data = useData();
  const {
    setMobileNavOpen,
    lockedFeature,
    setLockedFeature,
    infoModal,
    setInfoModal,
    activeModuleHint,
    setActiveModuleHint,
    currentRole,
    currentEmployee,
    allEmployees,
    switchEmployee,
  } = useShell();

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Status dan data notifikasi stok
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockStatus, setStockStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [stockError, setStockError] = useState<string | null>(null);
  const [isSeenToday, setIsSeenToday] = useState(false);

  const moreRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const primaryCloseBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Ambil data stok untuk notifikasi
  const fetchStock = useCallback(async () => {
    try {
      const list = await data.listStock();
      setStockItems(list);
      setStockStatus('ready');
      setStockError(null);
    } catch (err: unknown) {
      setStockStatus('error');
      setStockError(err instanceof Error ? err.message : 'Gagal memuat data stok');
    }
  }, [data]);

  // Polling tiap 60 detik saat tab terlihat
  useEffect(() => {
    fetchStock();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchStock();
      }
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStock]);

  // Pengelompokan notifikasi stok
  const stockAlerts = useMemo(() => groupStockAlerts(stockItems), [stockItems]);

  // Periksa status 'sudah dilihat' dari localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = getStockAlertSeenKey(todayKey());
      const val = localStorage.getItem(key);
      setIsSeenToday(isStockAlertSeen(val, stockAlerts.totalCount));
    } catch {
      setIsSeenToday(false);
    }
  }, [stockAlerts.totalCount]);

  // Toggle notifikasi dan tandai sudah dilihat
  const toggleNotif = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      try {
        const key = getStockAlertSeenKey(todayKey());
        localStorage.setItem(key, formatStockAlertSeenValue(stockAlerts.totalCount));
        setIsSeenToday(true);
      } catch {
        // Abaikan bila di lingkungan non-storage
      }
    }
  };

  // Keyboard accessibility: Escape untuk menutup popover notifikasi dan kembalikan fokus
  useEffect(() => {
    if (!notifOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setNotifOpen(false);
        bellBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [notifOpen]);

  const contextAsync = useAsync(() => data.getContext(), [data]);
  const currentModule = getModuleForPath(path, activeModuleHint);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close locked modal and restore focus to trigger button
  const closeLockedModal = useCallback(() => {
    setLockedFeature(null);
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 50);
  }, [setLockedFeature]);

  // Accessibility: Focus trap & Escape key handler for locked modal
  useEffect(() => {
    if (!lockedFeature) return;

    // Focus into modal
    const timer = setTimeout(() => {
      primaryCloseBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLockedModal();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lockedFeature, closeLockedModal]);

  const handleModuleClick = (m: (typeof MODUL)[number], e: React.MouseEvent<HTMLButtonElement>) => {
    if (m.locked) {
      triggerRef.current = e.currentTarget;
      setLockedFeature(m.label);
      return;
    }
    setActiveModuleHint(m.id);
    router.push(m.defaultHref);
  };

  const businessName =
    contextAsync.status === 'ready'
      ? contextAsync.data.orgName || contextAsync.data.outletName
      : 'CG POS';

  const userName = auth?.email ? auth.email.split('@')[0] : 'Pemilik';

  const otherMenuItems = [
    {
      label: 'Pengaturan',
      icon: Sliders,
      action: () => {
        setMoreMenuOpen(false);
        setActiveModuleHint('pengaturan');
        router.push('/pengaturan/outlet');
      },
    },
    {
      label: 'Bantuan',
      icon: HelpCircle,
      action: () => {
        setMoreMenuOpen(false);
        setInfoModal({
          title: 'Pusat Bantuan CG POS',
          message: 'Layanan panduan dan bantuan operasional tersedia 24 jam untuk mendampingi bisnis Anda.',
        });
      },
    },
    {
      label: 'Layanan',
      icon: Layers,
      action: () => {
        setMoreMenuOpen(false);
        setInfoModal({
          title: 'Layanan Tambahan',
          message: 'Integrasi dan layanan penunjang bisnis Anda siap diaktifkan sesuai kebutuhan usaha.',
        });
      },
    },
    {
      label: 'Inspirasi',
      icon: Sparkles,
      action: () => {
        setMoreMenuOpen(false);
        setInfoModal({
          title: 'Inspirasi Bisnis',
          message: 'Kumpulan studi kasus, kiat praktis, dan artikel pengembangan bisnis ritel dan kuliner.',
        });
      },
    },
    {
      label: 'Pendanaan',
      icon: DollarSign,
      action: () => {
        setMoreMenuOpen(false);
        setInfoModal({
          title: 'Pendanaan Usaha',
          message: 'Akses modal kerja dan fasilitas pembiayaan usaha terpercaya dengan proses mudah.',
        });
      },
    },
    {
      label: 'Supplies',
      icon: Package,
      action: () => {
        setMoreMenuOpen(false);
        setInfoModal({
          title: 'CG Supplies',
          message: 'Kebutuhan bahan baku berkualitas, perlengkapan kasir, dan kertas struk untuk kelancaran outlet Anda.',
        });
      },
    },
  ];

  // Primary top modules: Penjualan, Order Online, Appointment, Karyawan, Keuangan, Whatsapp
  const topModules = MODUL.filter((m) => m.id !== 'pengaturan');

  return (
    <>
      <header className="sticky top-0 z-40 h-[60px] bg-surface-raised border-b border-border flex items-center justify-between px-16 desktop:px-24 select-none">
        {/* Left: Logo & Mobile Hamburger */}
        <div className="flex items-center gap-12 shrink-0">
          <button
            type="button"
            className="laptop:hidden p-8 rounded-md text-text-muted hover:text-text hover:bg-surface"
            aria-label="Buka menu navigasi"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="cg-icon" aria-hidden />
          </button>
          <Link href="/" className="flex items-center gap-8 font-bold text-lg text-text shrink-0">
            <span className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-on-accent text-xs font-black shadow-sm">
              CG
            </span>
            <span className="tracking-tight">POS</span>
          </Link>
        </div>

        {/* Center: Module Tabs (Horizontal, height 36px, centered, no wrap) */}
        <nav
          aria-label="Modul aplikasi"
          className="hidden laptop:flex items-center gap-4 desktop:gap-8 justify-center min-w-0 flex-1 px-8"
        >
          {topModules.map((m) => {
            const isActive = currentModule.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={(e) => handleModuleClick(m, e)}
                className={`cg-topbar-pill ${isActive ? 'cg-topbar-pill--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {m.label}
              </button>
            );
          })}

          {/* Dropdown Lainnya ▾ */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              className={`cg-topbar-pill gap-4 ${
                currentModule.id === 'pengaturan' ? 'cg-topbar-pill--active' : ''
              }`}
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
            >
              <span>{currentModule.id === 'pengaturan' ? 'Pengaturan' : 'Lainnya'}</span>
              <ChevronDown className="cg-icon cg-icon--sm" aria-hidden />
            </button>

            {moreMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-8 w-56 bg-surface-raised border border-border rounded-xl shadow-pop py-6 z-50 animate-fadeIn"
              >
                {otherMenuItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-10 px-16 py-8 text-sm text-text hover:bg-surface text-left transition-colors"
                    onClick={item.action}
                  >
                    <item.icon className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right: Notifications, Business name, User profile, Menu ⋮ (Always visible at 1280px & 1440px) */}
        <div className="flex items-center gap-12 shrink-0">
          {/* Notification bell with interactive stock alerts popover */}
          <div className="relative shrink-0" ref={notifRef}>
            <button
              ref={bellBtnRef}
              type="button"
              data-testid="notif-bell-btn"
              className="relative p-8 rounded-full text-text-muted hover:text-text hover:bg-surface transition-colors shrink-0 cursor-pointer"
              aria-label={
                stockAlerts.totalCount > 0
                  ? `Pemberitahuan stok: ${stockAlerts.totalCount} item memerlukan perhatian`
                  : 'Pemberitahuan stok'
              }
              aria-haspopup="dialog"
              aria-expanded={notifOpen}
              title="Pemberitahuan stok"
              onClick={toggleNotif}
            >
              <Bell className="cg-icon" aria-hidden />
              {stockAlerts.totalCount > 0 && !isSeenToday && (
                <span
                  data-testid="notif-badge"
                  className="absolute -top-[4px] -right-[4px] min-w-[18px] h-[18px] px-[4px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface leading-none"
                  aria-hidden
                >
                  {stockAlerts.totalCount > 99 ? '99+' : stockAlerts.totalCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label="Pemberitahuan stok"
                data-testid="notif-popover"
                className="absolute right-0 mt-8 w-[340px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-xl shadow-xl z-50 p-16 text-text flex flex-col"
              >
                {/* Header Popover */}
                <div className="flex items-center justify-between pb-12 border-b border-border mb-12">
                  <div className="flex items-center gap-8">
                    <span className="font-semibold text-sm">Pemberitahuan Stok</span>
                    {stockAlerts.totalCount > 0 && (
                      <span className="cg-badge cg-badge--danger text-xs font-semibold">
                        {stockAlerts.totalCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      bellBtnRef.current?.focus();
                    }}
                    className="text-text-muted hover:text-text p-4 rounded-md transition-colors"
                    aria-label="Tutup notifikasi"
                  >
                    <X className="w-16 h-16" />
                  </button>
                </div>

                {/* Konten Berdasarkan Keadaan: memuat, galat, kosong, atau ada notifikasi */}
                {stockStatus === 'loading' ? (
                  <div className="py-16 text-center text-xs text-text-muted" aria-busy="true">
                    <RefreshCw className="w-16 h-16 animate-spin mx-auto mb-8 text-primary" />
                    <span>Memeriksa stok...</span>
                  </div>
                ) : stockStatus === 'error' ? (
                  <div className="p-12 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
                    <p className="font-semibold mb-4">Gagal memuat notifikasi</p>
                    <p className="text-text-muted mb-8">{stockError}</p>
                    <button
                      type="button"
                      className="cg-btn cg-btn--secondary text-xs py-[4px] px-8"
                      onClick={fetchStock}
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : !stockAlerts.hasAlerts ? (
                  <div className="py-16 px-8 text-center text-xs text-text-muted">
                    <CheckCircle className="w-24 h-24 text-success mx-auto mb-8" />
                    <p className="font-semibold text-text text-sm mb-4">Semua stok aman</p>
                    <p>Tidak ada bahan atau produk yang habis, minus, atau di bawah batas minimum.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-8 max-h-[320px] overflow-y-auto">
                    {stockAlerts.groups.map((g: StockAlertGroup) => (
                      <Link
                        key={g.status}
                        href={g.href}
                        onClick={() => setNotifOpen(false)}
                        className="p-12 rounded-lg border border-border hover:border-primary hover:bg-surface-muted transition-colors flex flex-col gap-4 text-xs group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-text group-hover:text-primary transition-colors">
                            {g.label}
                          </span>
                          <span className={`cg-badge ${g.badgeClass}`}>
                            {g.count} item
                          </span>
                        </div>
                        <p className="text-text-muted line-clamp-2">
                          {g.items.slice(0, 3).map((it: StockItem) => it.name).join(', ')}
                          {g.items.length > 3 ? ` dan ${g.items.length - 3} lainnya` : ''}
                        </p>
                        <div className="flex items-center justify-end text-primary text-[11px] font-medium mt-[4px]">
                          <span>Buka halaman stok →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Footer link ke daftar stok */}
                <div className="pt-12 mt-12 border-t border-border flex items-center justify-between text-xs">
                  <Link
                    href="/inventori/stok"
                    onClick={() => setNotifOpen(false)}
                    className="text-primary hover:underline font-medium flex items-center gap-4"
                  >
                    <span>Buka daftar stok</span>
                    <ArrowRight className="w-12 h-12" />
                  </Link>
                  <button
                    type="button"
                    onClick={fetchStock}
                    className="text-text-muted hover:text-text flex items-center gap-4 cursor-pointer"
                    title="Perbarui data stok sekarang"
                  >
                    <RefreshCw className="w-12 h-12" />
                    <span>Segarkan</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Business & User badge (shrink-0, clearly displayed) */}
          <div className="hidden laptop:flex flex-col text-right justify-center shrink-0 min-w-0">
            <span className="text-sm font-semibold text-text leading-tight truncate max-w-[180px]">
              {businessName}
            </span>
            <div className="flex items-center justify-end gap-4 text-xs text-text-muted leading-tight truncate max-w-[180px]">
              <span className="truncate">{currentEmployee?.name ?? userName}</span>
              <span className="text-[10px] px-6 py-1 rounded bg-accent/10 text-accent font-bold uppercase tracking-wider">
                {currentRole.name}
              </span>
            </div>
          </div>

          {/* User menu ⋮ */}
          <div className="relative shrink-0" ref={userRef}>
            <button
              type="button"
              className="p-8 rounded-full text-text-muted hover:text-text hover:bg-surface transition-colors"
              aria-label="Menu akun"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-expanded={userMenuOpen}
            >
              <MoreVertical className="cg-icon" aria-hidden />
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-8 w-64 bg-surface-raised border border-border rounded-xl shadow-pop py-6 z-50 animate-fadeIn"
              >
                <div className="px-16 py-8 border-b border-border mb-4">
                  <p className="text-sm font-semibold truncate">{businessName}</p>
                  <p className="text-xs text-text-muted truncate">{auth?.email ?? 'admin@cgpos.local'}</p>
                  <div className="mt-8 pt-6 border-t border-border flex items-center justify-between text-xs">
                    <span className="text-text-muted">Peran Aktif:</span>
                    <span className="font-bold text-accent px-6 py-2 rounded bg-accent/10 text-[11px]">
                      {currentRole.name}
                    </span>
                  </div>
                </div>

                {allEmployees.length > 0 && (
                  <div className="px-16 py-8 border-b border-border mb-4">
                    <label htmlFor="select-role-user" className="text-[11px] font-bold text-text-muted uppercase tracking-wider block mb-4">
                      Simulasi Peran Karyawan
                    </label>
                    <select
                      id="select-role-user"
                      value={currentEmployee?.id ?? ''}
                      onChange={(e) => switchEmployee(e.target.value || null)}
                      className="w-full text-xs p-6 rounded bg-surface border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">Pemilik (Akses Penuh)</option>
                      {allEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.roleName ?? emp.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-10 px-16 py-8 text-sm text-text hover:bg-surface text-left"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setActiveModuleHint('pengaturan');
                    router.push('/pengaturan/outlet');
                  }}
                >
                  <User className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                  <span>Profil & Outlet</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-10 px-16 py-8 text-sm text-text hover:bg-surface text-left"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setInfoModal({
                      title: 'Pusat Bantuan',
                      message: 'Hubungi tim operasional kami melalui live chat di sudut kiri bawah layar.',
                    });
                  }}
                >
                  <HelpCircle className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                  <span>Bantuan & Panduan</span>
                </button>
                {auth && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-10 px-16 py-8 text-sm text-danger-strong hover:bg-danger-soft text-left border-t border-border mt-4"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void auth.signOut();
                    }}
                  >
                    <LogOut className="cg-icon cg-icon--sm" aria-hidden />
                    <span>Keluar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modal Terkunci (Appointment & Whatsapp) - Accessible dialog with Escape, Backdrop, and Focus trap */}
      {lockedFeature && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="locked-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLockedModal();
          }}
        >
          <div
            ref={modalRef}
            className="cg-card max-w-md w-full p-24 shadow-pop rounded-xl bg-surface-raised border border-border"
          >
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h2 id="locked-title" className="text-lg font-bold text-text">
                Fitur Belum Tersedia
              </h2>
              <button
                type="button"
                className="p-6 rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
                aria-label="Tutup dialog"
                onClick={closeLockedModal}
              >
                <X className="cg-icon" aria-hidden />
              </button>
            </div>
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center mx-auto mb-16 shadow-sm">
                <Lock className="w-8 h-8" aria-hidden />
              </div>
              <p className="text-base font-semibold text-text mb-8">
                Modul {lockedFeature}
              </p>
              <p className="text-sm text-text-muted max-w-sm mx-auto leading-relaxed">
                Fitur ini belum tersedia di paket Anda.
              </p>
            </div>
            <div className="flex justify-end pt-12 border-t border-border">
              <button
                ref={primaryCloseBtnRef}
                type="button"
                className="cg-btn cg-btn--primary"
                onClick={closeLockedModal}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Informasi Tambahan (Bantuan, Layanan, etc.) */}
      {infoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInfoModal(null);
          }}
        >
          <div className="cg-card max-w-md w-full p-24 shadow-pop rounded-xl bg-surface-raised border border-border">
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h2 id="info-title" className="text-lg font-bold text-text">
                {infoModal.title}
              </h2>
              <button
                type="button"
                className="p-6 rounded-md text-text-muted hover:text-text hover:bg-surface"
                aria-label="Tutup dialog"
                onClick={() => setInfoModal(null)}
              >
                <X className="cg-icon" aria-hidden />
              </button>
            </div>
            <div className="py-20 text-center">
              <p className="text-sm text-text max-w-sm mx-auto leading-relaxed">
                {infoModal.message}
              </p>
            </div>
            <div className="flex justify-end pt-12 border-t border-border">
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                onClick={() => setInfoModal(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

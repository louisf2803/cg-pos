'use client';
import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { MODUL, getModuleForPath } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
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
  } = useShell();

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

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
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModuleClick = (m: (typeof MODUL)[number]) => {
    if (m.locked) {
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
      <header className="sticky top-0 z-40 h-[60px] bg-surface-raised border-b border-border flex items-center justify-between px-16 desktop:px-24">
        {/* Left: Logo & Hamburger button */}
        <div className="flex items-center gap-12">
          <button
            type="button"
            className="desktop:hidden p-8 rounded-md text-text-muted hover:text-text hover:bg-surface"
            aria-label="Buka menu navigasi"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="cg-icon" aria-hidden />
          </button>
          <Link href="/" className="flex items-center gap-8 font-bold text-lg text-text">
            <span className="w-8 h-8 rounded-md bg-success flex items-center justify-center text-on-success text-xs font-black">
              CG
            </span>
            <span>POS</span>
          </Link>
        </div>

        {/* Center: Module Tabs (hidden on mobile <= 900px, visible on desktop) */}
        <nav
          aria-label="Modul aplikasi"
          className="hidden desktop:flex items-center gap-6 overflow-x-auto py-4"
        >
          {topModules.map((m) => {
            const isActive = currentModule.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModuleClick(m)}
                className={`px-14 py-6 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-success text-on-success font-semibold shadow-sm'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {m.label}
              </button>
            );
          })}

          {/* Dropdown Lainnya ▾ */}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className={`flex items-center gap-4 px-12 py-6 rounded-full text-sm font-medium transition-all ${
                currentModule.id === 'pengaturan'
                  ? 'bg-success text-on-success font-semibold shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-surface'
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
                className="absolute left-0 mt-8 w-56 bg-surface-raised border border-border rounded-lg shadow-pop py-6 z-50 animate-fadeIn"
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

        {/* Right: Notifications, Business name, User profile, Menu ⋮ */}
        <div className="flex items-center gap-12">
          {/* Notification bell with red indicator */}
          <button
            type="button"
            className="relative p-8 rounded-full text-text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Pemberitahuan baru"
            title="Pemberitahuan"
            onClick={() =>
              setInfoModal({
                title: 'Pemberitahuan',
                message: 'Tidak ada pemberitahuan baru saat ini. Seluruh sistem beroperasi normal.',
              })
            }
          >
            <Bell className="cg-icon" aria-hidden />
            <span
              className="absolute top-6 right-6 w-2 h-2 rounded-full bg-danger ring-2 ring-surface-raised"
              aria-hidden
            />
          </button>

          {/* Business & User badge */}
          <div className="hidden desktop:flex flex-col text-right">
            <span className="text-sm font-semibold text-text leading-tight truncate max-w-[160px]">
              {businessName}
            </span>
            <span className="text-xs text-text-muted leading-tight truncate max-w-[160px]">
              {userName}
            </span>
          </div>

          {/* User menu ⋮ */}
          <div className="relative" ref={userRef}>
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
                className="absolute right-0 mt-8 w-56 bg-surface-raised border border-border rounded-lg shadow-pop py-6 z-50 animate-fadeIn"
              >
                <div className="px-16 py-8 border-b border-border mb-4">
                  <p className="text-sm font-semibold truncate">{businessName}</p>
                  <p className="text-xs text-text-muted truncate">{auth?.email ?? 'admin@cgpos.local'}</p>
                </div>
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

      {/* Modal: Fitur Terkunci (Appointment & Whatsapp) */}
      {lockedFeature && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="locked-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm"
        >
          <div className="cg-card max-w-md w-full p-24 shadow-pop rounded-xl bg-surface-raised border border-border">
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h2 id="locked-title" className="text-lg font-bold text-text">
                Fitur Belum Tersedia
              </h2>
              <button
                type="button"
                className="p-4 rounded-md text-text-muted hover:text-text"
                aria-label="Tutup dialog"
                onClick={() => setLockedFeature(null)}
              >
                <X className="cg-icon" aria-hidden />
              </button>
            </div>
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-warning-soft text-warning-strong flex items-center justify-center mx-auto mb-16">
                <Sliders className="w-8 h-8" aria-hidden />
              </div>
              <p className="text-base font-semibold text-text mb-8">
                Modul {lockedFeature}
              </p>
              <p className="text-sm text-text-muted max-w-sm mx-auto">
                Fitur ini belum tersedia di paket Anda.
              </p>
            </div>
            <div className="flex justify-end pt-12 border-t border-border">
              <button
                type="button"
                className="cg-btn cg-btn--primary"
                onClick={() => setLockedFeature(null)}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Informasi Umum (Bantuan, Layanan, etc.) */}
      {infoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-16 bg-overlay/50 backdrop-blur-sm"
        >
          <div className="cg-card max-w-md w-full p-24 shadow-pop rounded-xl bg-surface-raised border border-border">
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <h2 id="info-title" className="text-lg font-bold text-text">
                {infoModal.title}
              </h2>
              <button
                type="button"
                className="p-4 rounded-md text-text-muted hover:text-text"
                aria-label="Tutup dialog"
                onClick={() => setInfoModal(null)}
              >
                <X className="cg-icon" aria-hidden />
              </button>
            </div>
            <div className="py-20 text-center">
              <p className="text-sm text-text max-w-sm mx-auto">
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

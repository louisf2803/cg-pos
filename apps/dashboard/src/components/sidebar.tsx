'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  X,
  Store,
  Star,
  MessageCircle,
  Headphones,
  Check,
  CreditCard,
} from 'lucide-react';
import { MODUL, ALL_ITEMS, getModuleForPath, type NavItem } from '@/lib/nav';
import { getFavorites } from '@/lib/favorites';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useShell } from './shell-context';

export function Sidebar() {
  const router = useRouter();
  const path = usePathname();
  const data = useData();
  const {
    mobileNavOpen,
    setMobileNavOpen,
    activeModuleHint,
    setActiveModuleHint,
    setLockedFeature,
    setInfoModal,
  } = useShell();

  // Outlet state
  const [selectedOutlet, setSelectedOutlet] = useState<string>('semua');
  const [outletMenuOpen, setOutletMenuOpen] = useState(false);

  // Favorites state
  const [favoriteHrefs, setFavoriteHrefs] = useState<string[]>([]);

  // Fetch outlet data
  const contextAsync = useAsync(async () => {
    const ctx = await data.getContext();
    let locations: { id: string; name: string }[] = [];
    try {
      if (typeof (data as unknown as { listStockLocations?: () => Promise<{ id: string; name: string }[]> }).listStockLocations === 'function') {
        const locs = await (data as unknown as { listStockLocations: () => Promise<{ id: string; name: string }[]> }).listStockLocations();
        locations = locs.map((l) => ({ id: l.id, name: l.name }));
      }
    } catch {
      locations = [];
    }
    return { ctx, locations };
  }, [data]);

  // Load and listen to favorites
  useEffect(() => {
    setFavoriteHrefs(getFavorites());
    const handler = () => {
      setFavoriteHrefs(getFavorites());
    };
    window.addEventListener('cgpos.favorites.changed', handler);
    return () => window.removeEventListener('cgpos.favorites.changed', handler);
  }, []);

  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  const currentModule = getModuleForPath(path, activeModuleHint);

  // Determine active item: longest matching href
  const activeItem = ALL_ITEMS.filter((i) =>
    i.href === '/' ? trimmed === '/' : trimmed === i.href || trimmed.startsWith(i.href + '/')
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Accordion state: ONE group open at a time
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Auto-open group matching active item when route or module changes
  useEffect(() => {
    const matchingGroup = currentModule.groups.find((g) =>
      g.items.some((i) => i.href === activeItem)
    )?.label;

    if (matchingGroup) {
      setOpenGroup(matchingGroup);
    } else if (currentModule.groups.length > 0 && currentModule.groups[0]) {
      setOpenGroup(currentModule.groups[0].label);
    }
  }, [currentModule, activeItem]);

  const toggleGroup = (label: string) => {
    setOpenGroup((prev) => (prev === label ? null : label));
  };

  const handleModuleSelect = (modId: string) => {
    const target = MODUL.find((m) => m.id === modId);
    if (!target) return;
    setMobileNavOpen(false);
    if (target.locked) {
      setLockedFeature(target.label);
      return;
    }
    setActiveModuleHint(target.id);
    router.push(target.defaultHref);
  };

  // Build favorite NavItems
  const favoriteItems: NavItem[] = favoriteHrefs
    .map((href) => ALL_ITEMS.find((i) => i.href === href))
    .filter((item): item is NavItem => !!item);

  // Outlets list
  const outletOptions = [
    { id: 'semua', name: 'Semua Outlet' },
    ...(contextAsync.status === 'ready' && contextAsync.data.locations.length > 0
      ? contextAsync.data.locations
      : contextAsync.status === 'ready'
      ? [{ id: contextAsync.data.ctx.outletId, name: contextAsync.data.ctx.outletName }]
      : [{ id: 'out-1', name: 'Outlet Utama' }]),
  ];

  const currentOutletName =
    outletOptions.find((o) => o.id === selectedOutlet)?.name || 'Semua Outlet';

  return (
    <>
      {/* Mobile scrim / backdrop */}
      {mobileNavOpen && (
        <div
          className="cg-scrim desktop:hidden z-40 fixed inset-0 bg-overlay/50 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        aria-label="Navigasi Menu Utama"
        className={`${
          mobileNavOpen ? 'fixed inset-y-0 left-0 z-50 flex' : 'hidden'
        } desktop:flex flex-col w-[250px] shrink-0 h-screen desktop:h-[calc(100vh-60px)] desktop:sticky desktop:top-[60px] cg-sidebar-tosca overflow-y-auto select-none`}
      >
        {/* Top Section */}
        <div className="p-16 border-b border-white/10 flex flex-col gap-12 shrink-0">
          {/* Header Mobile: Title & Close Button */}
          <div className="flex items-center justify-between desktop:hidden">
            <span className="font-bold text-base text-white tracking-wide">MENU UTAMA</span>
            <button
              type="button"
              className="p-6 rounded-md text-white/80 hover:text-white hover:bg-white/10"
              aria-label="Tutup menu"
              onClick={() => setMobileNavOpen(false)}
            >
              <X className="cg-icon cg-icon--sm" aria-hidden />
            </button>
          </div>

          {/* Mobile Chip Modul (Only visible on mobile drawer <= 900px) */}
          <div className="desktop:hidden flex flex-col gap-6">
            <span className="text-xs uppercase font-semibold text-white/60 tracking-wider">
              PILIH MODUL
            </span>
            <div className="flex items-center gap-6 overflow-x-auto pb-4 scrollbar-none">
              {MODUL.map((m) => {
                const isActive = currentModule.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModuleSelect(m.id)}
                    className={`px-10 py-4 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-white text-brand font-bold shadow'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pemilih Outlet */}
          <div className="relative">
            <label id="lbl-pemilih-outlet" className="cg-sr">Pilih Outlet</label>
            <button
              type="button"
              aria-labelledby="lbl-pemilih-outlet"
              aria-expanded={outletMenuOpen}
              className="w-full flex items-center justify-between gap-8 px-12 py-8 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors text-left"
              onClick={() => setOutletMenuOpen(!outletMenuOpen)}
            >
              <div className="flex items-center gap-8 min-w-0">
                <Store className="cg-icon cg-icon--sm shrink-0 text-white/80" aria-hidden />
                <span className="text-sm font-medium truncate">{currentOutletName}</span>
              </div>
              <ChevronDown
                className={`cg-icon cg-icon--sm shrink-0 transition-transform ${
                  outletMenuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>

            {outletMenuOpen && (
              <div
                role="listbox"
                aria-label="Daftar Outlet"
                className="absolute top-full left-0 right-0 mt-4 py-4 rounded-lg bg-surface-raised border border-border shadow-pop z-50 text-text text-sm"
              >
                {outletOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selectedOutlet === opt.id}
                    className="w-full flex items-center justify-between px-12 py-8 hover:bg-surface text-left transition-colors"
                    onClick={() => {
                      setSelectedOutlet(opt.id);
                      setOutletMenuOpen(false);
                    }}
                  >
                    <span className="truncate">{opt.name}</span>
                    {selectedOutlet === opt.id && (
                      <Check className="cg-icon cg-icon--sm text-success" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Saldo Order Online widget (khusus modul Order Online) */}
          {currentModule.id === 'order-online' && (
            <div className="p-12 rounded-lg bg-white/10 border border-white/15 flex flex-col gap-4">
              <span className="text-xs text-white/70">Saldo Order Online</span>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold text-white">Rp 0</span>
                <span className="px-6 py-2 rounded text-[10px] font-semibold bg-success text-on-success">
                  Aktif
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Accordion Menu Area */}
        <div className="flex-1 px-8 py-12 flex flex-col gap-4 overflow-y-auto">
          {/* Menu Favorit Group (Selalu ada di paling atas) */}
          <div className="mb-8">
            <button
              type="button"
              className="w-full flex items-center justify-between px-12 py-8 rounded-md text-xs font-semibold uppercase tracking-wider text-white/75 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => toggleGroup('Menu Favorit')}
              aria-expanded={openGroup === 'Menu Favorit'}
            >
              <div className="flex items-center gap-8">
                <Star className="cg-icon cg-icon--sm text-warning fill-warning" aria-hidden />
                <span>Menu Favorit</span>
              </div>
              <ChevronDown
                className={`cg-icon cg-icon--sm transition-transform ${
                  openGroup === 'Menu Favorit' ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>

            {openGroup === 'Menu Favorit' && (
              <ul className="mt-4 flex flex-col gap-2">
                {favoriteItems.length === 0 ? (
                  <li className="px-12 py-8 text-xs text-white/60 italic leading-relaxed">
                    Belum ada menu favorit. Klik tanda bintang di judul halaman untuk menambahkannya.
                  </li>
                ) : (
                  favoriteItems.map((item) => {
                    const isActive = item.href === activeItem;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          className="cg-sidebar-item flex items-center justify-between px-16 py-8 rounded-md text-sm font-medium"
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <span className="truncate">{item.label}</span>
                          {!item.built && (
                            <span className="px-4 py-1 text-[10px] rounded bg-white/20 text-white">
                              T{item.tier}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {/* Module Groups (Accordion: Single open group at a time) */}
          {currentModule.groups.map((group) => {
            const isExpanded = openGroup === group.label;
            const Icon = group.icon;

            return (
              <div key={group.label} className="flex flex-col">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-12 py-8 rounded-md text-xs font-semibold uppercase tracking-wider text-white/75 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isExpanded}
                  aria-controls={`group-${group.label.replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center gap-8 min-w-0">
                    {Icon && <Icon className="cg-icon cg-icon--sm shrink-0" aria-hidden />}
                    <span className="truncate">{group.label}</span>
                  </div>
                  <ChevronDown
                    className={`cg-icon cg-icon--sm shrink-0 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>

                {isExpanded && (
                  <ul
                    id={`group-${group.label.replace(/\s+/g, '-')}`}
                    className="mt-2 flex flex-col gap-2"
                  >
                    {group.items.map((item, idx) => {
                      const isActive = item.href === activeItem;
                      const showSection =
                        item.section &&
                        (!group.items[idx - 1] || group.items[idx - 1]?.section !== item.section);

                      return (
                        <li key={item.href} className="flex flex-col">
                          {showSection && (
                            <span className="px-16 pt-8 pb-4 text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                              {item.section}
                            </span>
                          )}
                          <Link
                            href={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={`cg-sidebar-item flex items-center justify-between rounded-md px-16 py-8 text-sm font-medium ${
                              item.section ? 'pl-24' : ''
                            }`}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <span className="truncate">{item.label}</span>
                            {!item.built && (
                              <span className="px-4 py-1 text-[10px] rounded bg-white/20 text-white shrink-0">
                                T{item.tier}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Section: Kotak Bantuan Menempel di Bawah */}
        <div className="p-16 border-t border-white/10 shrink-0">
          <div className="p-12 rounded-xl bg-white/10 border border-white/15 flex flex-col gap-8">
            <div className="flex items-center gap-8">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0">
                <Headphones className="cg-icon cg-icon--sm" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-tight">Butuh Bantuan?</p>
                <p className="text-[11px] text-white/70 leading-tight">Chat Layanan 24 Jam</p>
              </div>
            </div>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-6 py-6 px-12 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
              onClick={() =>
                setInfoModal({
                  title: 'Bantuan 24 Jam CG POS',
                  message:
                    'Tim dukungan teknis dan operasional CG POS siap melayani Anda melalui chat daring dan WhatsApp resmi.',
                })
              }
            >
              <MessageCircle className="cg-icon cg-icon--sm" aria-hidden />
              <span>Hubungi CS</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

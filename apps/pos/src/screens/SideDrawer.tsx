import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChefHat,
  Copy,
  FileBarChart,
  LifeBuoy,
  LogOut,
  Settings,
  Store,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';

export type DrawerView = 'register' | 'sales' | 'reports' | 'kitchen' | 'attendance' | 'settings' | 'help' | 'closeShift' | 'logout';

export interface SideDrawerProps {
  outletName: string;
  /** nama usaha/organisasi di kartu profil */
  orgName?: string;
  /** kode outlet, ditampilkan sebagai ID yang bisa disalin */
  outletCode?: string;
  cashierName: string;
  canOpenKitchen?: boolean;
  onClose: () => void;
  onNavigate: (view: DrawerView) => void;
}

const ITEM = 'w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left';

/**
 * Menu Samping (Side Drawer) Kasir.
 * Kartu profil (usaha, outlet, kasir, ID), lalu: Kasir, Penjualan, Laporan, Absensi, Pengaturan, Bantuan;
 * di dasar: Tutup Kasir dan Keluar Kasir. Penutupan dengan Escape, klik latar, dan kunci fokus keyboard (Tab).
 */
export function SideDrawer({ outletName, orgName, outletCode, cashierName, canOpenKitchen = false, onClose, onNavigate }: SideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const el = drawerRef.current;
    if (!el) return;
    const getFocusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((item) => !item.hasAttribute('disabled'));
    getFocusables()[0]?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab') {
        const items = getFocusables();
        if (items.length === 0) return;
        const first = items[0]!; const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); prevActive?.focus(); };
  }, [onClose]);

  const go = (view: DrawerView) => () => { onClose(); onNavigate(view); };
  const entry = (view: DrawerView, label: string, icon: ReactNode) => (
    <button type="button" className={ITEM} onClick={go(view)}>
      <span className="text-accent shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );

  async function copyId() {
    try { await navigator.clipboard.writeText(outletCode ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* izin papan klip ditolak: abaikan */ }
  }

  return (
    <div className="cg-scrim fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} role="dialog" aria-modal="true" aria-label="Menu navigasi kasir">
      <div ref={drawerRef} className="w-[320px] max-w-[85vw] h-full bg-surface-raised border-r border-border flex flex-col shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Kartu profil */}
        <div className="p-16 border-b border-border bg-surface flex items-start justify-between gap-8">
          <div className="min-w-0">
            <div className="flex items-center gap-12">
              <span className="w-[40px] h-[40px] rounded-full bg-accent text-on-accent flex items-center justify-center font-bold shrink-0" aria-hidden>{(orgName ?? outletName).trim().slice(0, 1).toUpperCase()}</span>
              <h2 className="text-base font-bold text-text truncate">{orgName ?? outletName}</h2>
            </div>
            <p className="text-sm text-text mt-8 truncate">{outletName}</p>
            <p className="text-xs text-text-muted mt-2 truncate">{cashierName}</p>
            {outletCode && (
              <p className="text-xs text-text-muted mt-2 flex items-center gap-6">
                <span>ID outlet</span>
                <strong className="text-text cg-num">{outletCode}</strong>
                <button type="button" className="p-4 rounded text-accent hover:bg-surface-raised" onClick={copyId} aria-label="Salin ID outlet" title="Salin ID outlet">
                  <Copy className="cg-icon cg-icon--xs" aria-hidden />
                </button>
                {copied && <span role="status" className="text-accent">Tersalin</span>}
              </p>
            )}
          </div>
          <button type="button" className="p-6 rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition-colors shrink-0" onClick={onClose} aria-label="Tutup menu" title="Tutup menu">
            <X className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>

        <nav className="p-12 space-y-4 flex-1 overflow-y-auto" aria-label="Menu kasir">
          {entry('register', 'Kasir', <Store className="cg-icon cg-icon--sm" aria-hidden />)}
          {entry('sales', 'Penjualan', <TrendingUp className="cg-icon cg-icon--sm" aria-hidden />)}
          {entry('reports', 'Laporan', <FileBarChart className="cg-icon cg-icon--sm" aria-hidden />)}
          {entry('attendance', 'Absensi', <UserCheck className="cg-icon cg-icon--sm" aria-hidden />)}
          {canOpenKitchen && entry('kitchen', 'Layar Dapur', <ChefHat className="cg-icon cg-icon--sm" aria-hidden />)}
          {entry('settings', 'Pengaturan', <Settings className="cg-icon cg-icon--sm" aria-hidden />)}
          {entry('help', 'Bantuan', <LifeBuoy className="cg-icon cg-icon--sm" aria-hidden />)}
          <hr className="border-border my-8" />
          <button type="button" className={`${ITEM} text-danger hover:text-danger`} onClick={go('closeShift')}>
            <Wallet className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>Tutup Kasir</span>
          </button>
        </nav>

        <div className="p-12 border-t border-border bg-surface mt-auto">
          <button type="button" className={ITEM} onClick={go('logout')}>
            <LogOut className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>Keluar Kasir</span>
          </button>
        </div>
      </div>
    </div>
  );
}

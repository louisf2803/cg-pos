import { useEffect, useRef } from 'react';
import {
  ChefHat,
  ClipboardList,
  Clock,
  Lock,
  LogOut,
  Settings,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';

export interface SideDrawerProps {
  outletName: string;
  cashierName: string;
  canOpenKitchen?: boolean;
  onClose: () => void;
  onNavigate: (
    view: 'register' | 'sales' | 'orders' | 'kitchen' | 'shift' | 'settings' | 'lock' | 'closeShift',
  ) => void;
}

/**
 * Menu Samping (Side Drawer) Kasir
 * Menampilkan identitas outlet, kasir yang bertugas, dan navigasi cepat.
 * Mendukung penutupan dengan Escape, klik backdrop, dan penguncian fokus keyboard (Tab loop).
 */
export function SideDrawer({
  outletName,
  cashierName,
  canOpenKitchen = false,
  onClose,
  onNavigate,
}: SideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus trap & Escape key listener
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const el = drawerRef.current;
    if (!el) return;

    // Focus the first focusable button
    const getFocusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((item) => !item.hasAttribute('disabled'));

    const focusables = getFocusables();
    if (focusables.length > 0) {
      focusables[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const items = getFocusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
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
      window.removeEventListener('keydown', handleKeyDown);
      prevActive?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="cg-scrim fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Menu navigasi kasir"
    >
      <div
        ref={drawerRef}
        className="w-[280px] max-w-[85vw] h-full bg-surface-raised border-r border-border flex flex-col shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Drawer */}
        <div className="p-16 border-b border-border bg-surface flex items-start justify-between">
          <div className="min-w-0 pr-8">
            <h2 className="text-base font-bold text-text truncate">{outletName}</h2>
            <p className="text-xs text-text-muted mt-2 truncate">Kasir: {cashierName}</p>
          </div>
          <button
            type="button"
            className="p-6 rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition-colors shrink-0"
            onClick={onClose}
            aria-label="Tutup menu"
            title="Tutup menu"
          >
            <X className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>

        {/* Daftar Navigasi Utama */}
        <nav className="p-12 space-y-4 flex-1 overflow-y-auto" aria-label="Menu kasir">
          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('register');
            }}
          >
            <Store className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Kasir</span>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('sales');
            }}
          >
            <TrendingUp className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Penjualan (hari ini)</span>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('orders');
            }}
          >
            <ClipboardList className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Daftar Order</span>
          </button>

          {canOpenKitchen && (
            <button
              type="button"
              className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
              onClick={() => {
                onClose();
                onNavigate('kitchen');
              }}
            >
              <ChefHat className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
              <span>Layar Dapur (KDS)</span>
            </button>
          )}

          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('shift');
            }}
          >
            <Clock className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Shift</span>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('settings');
            }}
          >
            <Settings className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Pengaturan perangkat</span>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-text hover:bg-surface hover:text-accent transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('lock');
            }}
          >
            <Lock className="cg-icon cg-icon--sm text-accent shrink-0" aria-hidden />
            <span>Kunci layar</span>
          </button>
        </nav>

        {/* Dasar Drawer: Tutup Kasir */}
        <div className="p-12 border-t border-border bg-surface mt-auto">
          <button
            type="button"
            className="w-full flex items-center gap-12 px-12 py-10 rounded-lg text-sm font-semibold text-danger hover:bg-danger/10 transition-colors text-left"
            onClick={() => {
              onClose();
              onNavigate('closeShift');
            }}
          >
            <LogOut className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>Tutup kasir</span>
          </button>
        </div>
      </div>
    </div>
  );
}

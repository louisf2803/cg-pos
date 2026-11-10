'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'cgpos.dashboard.sidebar_collapsed';

interface ShellContextType {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  lockedFeature: string | null;
  setLockedFeature: (feature: string | null) => void;
  infoModal: { title: string; message: string } | null;
  setInfoModal: (info: { title: string; message: string } | null) => void;
  activeModuleHint: string;
  setActiveModuleHint: (id: string) => void;
}

const ShellContext = createContext<ShellContextType | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [activeModuleHint, setActiveModuleHint] = useState<string>('penjualan');

  // Load collapsed preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === 'true') {
        setSidebarCollapsedState(true);
      }
    } catch {
      // Fallback gracefully without storage
    }
  }, []);

  const setSidebarCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Fallback gracefully without storage
      }
      return next;
    });
  };

  return (
    <ShellContext.Provider
      value={{
        mobileNavOpen,
        setMobileNavOpen,
        sidebarCollapsed,
        setSidebarCollapsed,
        lockedFeature,
        setLockedFeature,
        infoModal,
        setInfoModal,
        activeModuleHint,
        setActiveModuleHint,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextType {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return ctx;
}

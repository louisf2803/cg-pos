'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface ShellContextType {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
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
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [activeModuleHint, setActiveModuleHint] = useState<string>('penjualan');

  return (
    <ShellContext.Provider
      value={{
        mobileNavOpen,
        setMobileNavOpen,
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

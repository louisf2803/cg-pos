'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { ALL_ITEMS, NAV } from '@/lib/nav';
import { useAuth } from '@/lib/auth';

export function Sidebar() {
  const path = usePathname();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  // item dengan alamat terpanjang yang cocok yang menyala, agar /laporan tidak ikut menyala di /laporan/penjualan
  const current = ALL_ITEMS.filter((i) => (i.href === '/' ? trimmed === '/' : trimmed === i.href || trimmed.startsWith(i.href + '/'))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <>
      <header className="desktop:hidden flex items-center gap-12 px-16 h-[56px] border-b border-border bg-surface-raised">
        <button className="cg-btn cg-btn--ghost" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="cg-icon" aria-hidden />
        </button>
        <strong>CG POS</strong>
      </header>
      {open && <div className="cg-scrim" onClick={() => setOpen(false)} aria-hidden />}
      <nav
        aria-label="Menu utama"
        className={`${open ? 'flex' : 'hidden'} desktop:flex flex-col fixed desktop:sticky top-0 left-0 z-40 h-screen w-[280px] shrink-0 overflow-y-auto border-r border-border bg-surface p-16 gap-16`}
      >
        <div className="flex items-center justify-between">
          <strong className="text-lg">CG POS</strong>
          <button className="cg-btn cg-btn--ghost desktop:hidden" aria-label="Tutup menu" onClick={() => setOpen(false)}>
            <X className="cg-icon" aria-hidden />
          </button>
        </div>
        {NAV.map((g) => (
          <div key={g.label}>
            <p className="flex items-center gap-8 text-xs text-text-muted uppercase mb-8">
              <g.icon className="cg-icon cg-icon--sm" aria-hidden /> {g.label}
            </p>
            <ul className="grid gap-4">
              {g.items.map((i) => {
                const active = i.href === current;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between rounded-md px-12 min-h-[40px] ${active ? 'bg-accent-soft text-accent-strong' : 'hover:bg-bg'}`}
                    >
                      <span>{i.label}</span>
                      {!i.built && <span className="cg-badge" title={`Tahap ${i.tier}`}>T{i.tier}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {auth && (
          <div className="mt-auto grid gap-8 border-t border-border pt-16">
            <p className="text-xs text-text-muted break-all" title={auth.email}>{auth.email}</p>
            <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => void auth.signOut()}>Keluar</button>
          </div>
        )}
      </nav>
    </>
  );
}

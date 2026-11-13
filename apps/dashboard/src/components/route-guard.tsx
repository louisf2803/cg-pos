'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useShell } from './shell-context';
import type { ReactNode } from 'react';

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, currentRole } = useShell();

  const allowed = canAccess(pathname);

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto my-48 p-24 bg-surface-raised border border-border rounded-xl shadow-card text-center space-y-16 animate-fadeIn">
        <div className="w-48 h-48 rounded-full bg-danger/10 text-danger mx-auto flex items-center justify-center">
          <ShieldAlert className="w-24 h-24" aria-hidden />
        </div>
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-text">Akses Dibatasi</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Peran Anda (<strong>{currentRole.name}</strong>) tidak memiliki izin untuk membuka halaman <code>{pathname}</code>.
            Silakan hubungi pemilik atau manajer bila membutuhkan hak akses ini.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="cg-btn cg-btn--primary inline-flex items-center gap-6 text-xs font-semibold"
            onClick={() => router.push(currentRole.defaultDashboardPage ?? '/')}
          >
            <ArrowLeft className="w-14 h-14" aria-hidden />
            <span>Kembali ke Beranda</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

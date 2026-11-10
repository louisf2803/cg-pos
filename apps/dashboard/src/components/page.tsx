'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Star, HelpCircle } from 'lucide-react';
import { isFavorite, toggleFavorite } from '@/lib/favorites';

export function PageHeader({
  title,
  subtitle,
  actions,
  hideFavorite,
  helpText,
  updatedAt,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  hideFavorite?: boolean;
  helpText?: string;
  updatedAt?: string;
}) {
  const path = usePathname();
  const [favorite, setFavorite] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (path) {
      setFavorite(isFavorite(path));
    }
    const handler = () => {
      if (path) setFavorite(isFavorite(path));
    };
    window.addEventListener('cgpos.favorites.changed', handler);
    return () => window.removeEventListener('cgpos.favorites.changed', handler);
  }, [path]);

  const handleToggle = () => {
    if (!path) return;
    const added = toggleFavorite(path);
    setFavorite(added);
  };

  const resolvedHelp = helpText || `Bantuan dan panduan untuk halaman ${title}`;

  return (
    <div className="flex flex-wrap items-start justify-between gap-12 mb-24">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-8 flex-wrap">
          <h1 className="text-xl font-bold break-words">{title}</h1>

          {/* Ikon "?" Bantuan dengan tooltip singkat dan akses keyboard */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              className="p-4 rounded-md text-text-muted hover:text-text hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
              title={resolvedHelp}
              aria-label={`Bantuan: ${resolvedHelp}`}
              aria-describedby={`tooltip-${title.toLowerCase().replace(/\s+/g, '-')}`}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
            >
              <HelpCircle className="cg-icon cg-icon--sm" aria-hidden />
            </button>
            {showTooltip && (
              <div
                id={`tooltip-${title.toLowerCase().replace(/\s+/g, '-')}`}
                role="tooltip"
                className="absolute left-full top-1/2 -translate-y-1/2 ml-8 px-10 py-6 rounded-md bg-overlay text-white text-xs shadow-pop whitespace-nowrap z-50 pointer-events-none"
              >
                {resolvedHelp}
              </div>
            )}
          </div>

          {/* Bintang Favorit */}
          {!hideFavorite && path && (
            <button
              type="button"
              className="p-4 rounded-md text-text-muted hover:text-warning transition-colors"
              title={favorite ? 'Hapus dari Menu Favorit' : 'Tambahkan ke Menu Favorit'}
              aria-label={favorite ? 'Hapus dari Menu Favorit' : 'Tambahkan ke Menu Favorit'}
              aria-pressed={favorite}
              onClick={handleToggle}
            >
              <Star
                className={`cg-icon cg-icon--sm ${
                  favorite ? 'text-warning fill-warning' : 'text-text-muted'
                }`}
                aria-hidden
              />
            </button>
          )}
        </div>

        {subtitle && <p className="text-text-muted mt-2 text-sm">{subtitle}</p>}

        {/* Baris kecil "Diperbarui <waktu>" hanya bila props diberikan */}
        {updatedAt && (
          <p className="text-text-muted text-xs mt-4">
            Diperbarui {updatedAt}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-8">{actions}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cg-banner cg-banner--danger" role="alert">
      <span>Gagal memuat: {message}</span>
      {onRetry && (
        <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

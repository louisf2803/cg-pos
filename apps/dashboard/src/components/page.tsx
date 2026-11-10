'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';
import { isFavorite, toggleFavorite } from '@/lib/favorites';

export function PageHeader({
  title,
  subtitle,
  actions,
  hideFavorite,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  hideFavorite?: boolean;
}) {
  const path = usePathname();
  const [favorite, setFavorite] = useState(false);

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

  return (
    <div className="flex flex-wrap items-start justify-between gap-12 mb-24">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-8">
          <h1 className="text-xl break-words">{title}</h1>
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
        {subtitle && <p className="text-text-muted mt-2">{subtitle}</p>}
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

import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-12 mb-24">
      <div className="min-w-0">
        <h1 className="text-xl break-words">{title}</h1>
        {subtitle && <p className="text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-8">{actions}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cg-banner cg-banner--danger" role="alert">
      <span>Gagal memuat: {message}</span>
      {onRetry && <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

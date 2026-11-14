import type { ReactNode } from 'react';

/** Peran yang boleh mengubah pengaturan outlet dari kasir (penjaga sebenarnya tetap di server). */
export const canManageRole = (role: string) => role === 'owner' || role === 'admin' || role === 'manager';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted px-16 pt-16 pb-8">{children}</h2>;
}

/** Satu baris pengaturan: label + keterangan di kiri, kendali (saklar, nilai, tombol) di kanan. */
export function SettingRow({ label, hint, children, onClick }: { label: string; hint?: string; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && <span className="block text-xs text-text-muted mt-2">{hint}</span>}
      </span>
      <span className="shrink-0 flex items-center gap-8 text-sm text-text-muted">{children}</span>
    </>
  );
  const cls = 'w-full flex items-center justify-between gap-12 px-16 py-12 border-b border-border';
  return onClick ? <button type="button" className={`${cls} hover:bg-surface`} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="cg-toggle" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'danger'; children: ReactNode }) {
  return <div className={`cg-banner cg-banner--${kind} mx-16 my-8`} role={kind === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function PanelLoading() { return <div className="cg-skeleton h-[120px] m-16" aria-busy="true" />; }

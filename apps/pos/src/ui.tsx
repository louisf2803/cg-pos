import { useEffect, useRef, type ReactNode } from 'react';

/** Dialog: fokus masuk ke dalam, Tab terkurung, Escape menutup, fokus kembali ke pemicu. */
export function Modal({ title, children, onClose, labelledBy = 'modal-title' }: { title: string; children: ReactNode; onClose?: () => void; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((x) => !x.hasAttribute('disabled'));
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', key);
    return () => { el.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="cg-scrim" style={{ zIndex: 50 }}>
      <div ref={ref} className="cg-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <h2 id={labelledBy} className="cg-modal__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Spinner() { return <span className="cg-sr">Memuat…</span>; }

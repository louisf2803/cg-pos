'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, X } from 'lucide-react';
import { searchFeatures, type FeatureEntry } from '@cgpos/shared';
import { MODUL } from '@/lib/nav';
import { useShell } from './shell-context';

const RECENT_KEY = 'cgpos_dash_recent_features';

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
}
function writeRecent(list: string[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* penyimpanan boleh gagal */ } }

type Entry = FeatureEntry & { moduleId: string; locked: boolean };

/** Cari fitur backoffice (nama menu, grup, modul) lalu lompat ke halamannya. Pintasan: Ctrl+K atau tombol Cari fitur. */
export function FeatureSearch() {
  const router = useRouter();
  const { canAccess, setActiveModuleHint, setLockedFeature } = useShell();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const m of MODUL) for (const g of m.groups) for (const i of g.items) {
      out.push({ href: i.href, label: i.label, group: g.label, module: m.label, ...(i.section ? { section: i.section } : {}), moduleId: m.id, locked: !!m.locked });
    }
    return out;
  }, []);
  const allowed = useMemo(() => entries.filter((e) => canAccess(e.href)), [entries, canAccess]);

  const results = useMemo<Entry[]>(() => {
    if (q.trim()) return searchFeatures(allowed, q, 14) as Entry[];
    const byHref = new Map(allowed.map((e) => [e.href, e]));
    return recent.map((h) => byHref.get(h)).filter((e): e is Entry => !!e);
  }, [allowed, q, recent]);

  const close = useCallback(() => { setOpen(false); setQ(''); setActive(0); setTimeout(() => triggerRef.current?.focus(), 0); }, []);
  const openIt = useCallback(() => { setRecent(readRecent()); setOpen(true); setActive(0); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => { if (!v) { setRecent(readRecent()); setActive(0); } return !v; }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, results]);

  const go = (e: Entry) => {
    writeRecent([e.href, ...readRecent().filter((h) => h !== e.href)]);
    setOpen(false); setQ(''); setActive(0);
    if (e.locked) { setLockedFeature(e.module); return; }
    setActiveModuleHint(e.moduleId);
    router.push(e.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) go(r); }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="feature-search-btn"
        className="flex items-center gap-8 px-10 py-6 rounded-full border border-border text-text-muted hover:text-text hover:bg-surface text-sm shrink-0 cursor-pointer"
        aria-label="Cari fitur (Ctrl+K)"
        aria-haspopup="dialog"
        title="Cari fitur (Ctrl+K)"
        onClick={openIt}
      >
        <Search className="cg-icon cg-icon--sm" aria-hidden />
        <span className="hidden desktop:inline">Cari fitur</span>
        <kbd className="hidden desktop:inline text-[10px] px-4 rounded border border-border">Ctrl K</kbd>
      </button>

      {open && (
        <div className="cg-scrim" style={{ zIndex: 60, alignItems: 'start', paddingTop: '10vh' }} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-label="Cari fitur" className="cg-modal" style={{ width: 'min(560px, 100%)', padding: 'var(--space-16)' }}>
            <div className="flex items-center gap-8">
              <Search className="cg-icon text-text-muted shrink-0" aria-hidden />
              <input
                ref={inputRef}
                className="cg-input flex-1 min-w-0"
                type="search"
                placeholder="Cari fitur, misalnya stok opname atau laporan"
                aria-label="Kata kunci fitur"
                role="combobox"
                aria-expanded="true"
                aria-controls="feature-search-list"
                aria-activedescendant={results[active] ? `fs-${active}` : undefined}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                autoComplete="off"
              />
              <button type="button" className="p-8 rounded-md text-text-muted hover:text-text hover:bg-surface" aria-label="Tutup pencarian" onClick={close}><X className="cg-icon cg-icon--sm" aria-hidden /></button>
            </div>
            {!q.trim() && results.length > 0 && <p className="text-xs text-text-muted m-0">Terakhir dibuka</p>}
            {results.length > 0 ? (
              <ul id="feature-search-list" ref={listRef} role="listbox" aria-label="Hasil pencarian" className="grid gap-2 max-h-[50vh] overflow-y-auto m-0 p-0 list-none">
                {results.map((r, i) => (
                  <li key={r.href} id={`fs-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full flex items-center justify-between gap-12 px-12 py-8 rounded-lg text-left ${i === active ? 'bg-accent-soft' : 'hover:bg-surface'}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{r.label}</span>
                        <span className="block text-xs text-text-muted truncate">{r.module} › {r.group}</span>
                      </span>
                      <ArrowRight className="cg-icon cg-icon--sm text-text-muted shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cg-modal__body m-0" role="status">
                {q.trim() ? 'Tidak ada fitur yang cocok. Coba kata lain, misalnya nama laporan atau menu.' : 'Ketik nama fitur untuk mulai mencari. Tekan Ctrl+K kapan saja untuk membuka pencarian ini.'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

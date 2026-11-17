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

/**
 * Sub-header pencarian fitur: baris tetap di paling atas, di atas tab modul (Penjualan, Order Online, dst.).
 * Kolomnya selalu terlihat; hasil muncul sebagai daftar tepat di bawah kolom (bukan jendela melayang). Pintasan: Ctrl+K.
 */
export function FeatureSearchBar() {
  const router = useRouter();
  const { canAccess, setActiveModuleHint, setLockedFeature } = useShell();
  const [focused, setFocused] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const open = focused;
  const close = useCallback(() => { setFocused(false); setQ(''); setActive(0); inputRef.current?.blur(); }, []);

  // Ctrl+K memindahkan fokus ke kolom pencarian
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // klik di luar menutup daftar
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setFocused(false); setActive(0); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, results]);

  const go = (e: Entry) => {
    writeRecent([e.href, ...readRecent().filter((h) => h !== e.href)]);
    close();
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
    <div className="sticky top-0 z-50 h-[48px] bg-surface-raised flex items-center px-16 desktop:px-24" role="search" aria-label="Cari fitur">
      <div ref={wrapRef} className="relative w-full max-w-[720px]">
        <Search className="cg-icon cg-icon--sm text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        <input
          ref={inputRef}
          data-testid="feature-search-input"
          className="cg-input w-full h-[36px] text-left pl-[36px] pr-[64px] text-sm rounded-lg bg-surface border-transparent"
          type="text"
          placeholder="Cari fitur, misalnya stok opname atau laporan"
          aria-label="Cari fitur (Ctrl+K)"
          role="combobox"
          aria-expanded={open}
          aria-controls="feature-search-list"
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `fs-${active}` : undefined}
          value={q}
          onFocus={() => { setRecent(readRecent()); setFocused(true); }}
          onChange={(e) => { setQ(e.target.value); setFocused(true); }}
          onKeyDown={onInputKey}
          autoComplete="off"
        />
        {q ? (
          <button type="button" className="absolute right-8 top-1/2 -translate-y-1/2 p-4 rounded-full text-text-muted hover:text-text" aria-label="Hapus kata kunci" onClick={() => { setQ(''); inputRef.current?.focus(); }}>
            <X className="cg-icon cg-icon--xs" aria-hidden />
          </button>
        ) : (
          <kbd className="hidden desktop:block absolute right-12 top-1/2 -translate-y-1/2 text-[10px] px-4 rounded border border-border text-text-muted pointer-events-none">Ctrl K</kbd>
        )}

        {open && (
          <div className="absolute left-0 right-0 top-full mt-4 bg-surface-raised border border-border rounded-xl shadow-pop p-8 max-h-[60vh] overflow-y-auto">
            {!q.trim() && results.length > 0 && <p className="text-xs text-text-muted m-0 px-8 pb-4">Terakhir dibuka</p>}
            {results.length > 0 ? (
              <ul id="feature-search-list" ref={listRef} role="listbox" aria-label="Hasil pencarian" className="grid gap-2 m-0 p-0 list-none">
                {results.map((r, i) => (
                  <li key={r.href} id={`fs-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full flex items-center justify-between gap-12 px-12 py-8 rounded-lg text-left ${i === active ? 'bg-accent-soft' : 'hover:bg-surface'}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
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
              <p className="text-sm text-text-muted m-0 px-8 py-4" role="status">
                {q.trim() ? 'Tidak ada fitur yang cocok. Coba kata lain, misalnya nama laporan atau menu.' : 'Ketik nama fitur untuk mulai mencari.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

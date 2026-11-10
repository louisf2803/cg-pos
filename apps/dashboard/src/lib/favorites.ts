'use client';

const FAVORITES_KEY = 'cgpos.dashboard.favorites';
const DEFAULT_FAVORITES = ['/produk', '/pengaturan/karyawan', '/inventori/faktur'];

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return DEFAULT_FAVORITES;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(DEFAULT_FAVORITES));
      return DEFAULT_FAVORITES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

export function isFavorite(href: string): boolean {
  const favs = getFavorites();
  return favs.includes(href);
}

export function toggleFavorite(href: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const favs = getFavorites();
    let next: string[];
    let isAdded = false;
    if (favs.includes(href)) {
      next = favs.filter((h) => h !== href);
      isAdded = false;
    } else {
      next = [...favs, href];
      isAdded = true;
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('cgpos.favorites.changed', { detail: next }));
    return isAdded;
  } catch {
    return false;
  }
}

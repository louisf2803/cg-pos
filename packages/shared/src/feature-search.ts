/** Pencarian fitur backoffice: cocokkan kata kunci ke nama menu, grup, modul, dan alamat halaman. Murni, tanpa DOM. */
export interface FeatureEntry {
  href: string;
  label: string;
  /** nama grup menu di sidebar */
  group: string;
  /** nama modul (Penjualan, Keuangan, dst.) */
  module: string;
  /** bagian di dalam grup bila ada */
  section?: string;
}

/** Huruf kecil, tanpa aksen, tanda baca jadi spasi, spasi berlebih dirapikan. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function score(e: FeatureEntry, tokens: string[]): number {
  const label = normalizeSearch(e.label);
  const labelWords = label.split(' ');
  const rest = normalizeSearch(`${e.group} ${e.module} ${e.section ?? ''} ${e.href}`);
  let total = 0;
  for (const t of tokens) {
    if (labelWords.some((w) => w === t)) total += 6;
    else if (labelWords.some((w) => w.startsWith(t))) total += 4;
    else if (label.includes(t)) total += 3;
    else if (rest.split(' ').some((w) => w.startsWith(t))) total += 2;
    else if (rest.includes(t)) total += 1;
    else return 0; // semua kata harus ketemu
  }
  if (label.startsWith(tokens.join(' '))) total += 5;
  return total;
}

/** Hasil terurut dari yang paling cocok; kosong bila kata kunci kosong. Alamat yang sama hanya muncul sekali. */
export function searchFeatures(entries: readonly FeatureEntry[], query: string, limit = 12): FeatureEntry[] {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const seen = new Set<string>();
  return entries
    .map((e, i) => ({ e, i, s: score(e, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .filter((x) => (seen.has(x.e.href) ? false : (seen.add(x.e.href), true)))
    .slice(0, limit)
    .map((x) => x.e);
}

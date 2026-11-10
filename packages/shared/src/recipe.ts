/** Resep (BOM) dan HPP. Aturan penyimpanan dijaga database (migrasi 0022); di sini bentuk data dan hitungan biaya. */

export const RECIPE_MAX_LINES = 60;

export interface RecipeUnitOption { unitId: string; name: string; /** berapa satuan dasar bahan dalam satu satuan ini */ factor: number }
export type CostSource = 'average' | 'buy_price' | 'none';
export interface RecipeIngredient {
  id: string; name: string; baseUnit: string; units: RecipeUnitOption[];
  /** biaya per satuan dasar */
  unitCost: number;
  /** average = biaya rata-rata stok; buy_price = harga beli di data bahan (stok belum dicatat); none = belum ada */
  costSource: CostSource;
}
export interface RecipeLine { ingredientId: string; qty: number; unitId: string }
export interface RecipeProduct { id: string; name: string; price: number; isActive: boolean; lines: RecipeLine[] }

export type RecipeFilter = 'all' | 'none' | 'incomplete' | 'thin';
export const RECIPE_FILTER_LABEL: Record<RecipeFilter, string> = { all: 'Semua', none: 'Belum ada resep', incomplete: 'Biaya belum lengkap', thin: 'Margin di bawah 30%' };
export const THIN_MARGIN_PCT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ingredientFactor(ing: RecipeIngredient | undefined, unitId: string): number | null {
  return ing?.units.find((u) => u.unitId === unitId)?.factor ?? null;
}
/** Biaya satu baris resep; 0 bila bahan atau satuannya tidak dikenal. */
export function recipeLineCost(line: RecipeLine, ing: RecipeIngredient | undefined): number {
  const f = ingredientFactor(ing, line.unitId);
  return ing && f !== null ? line.qty * f * ing.unitCost : 0;
}
export interface RecipeCost { total: number; /** baris yang biayanya belum diketahui (bahan tanpa biaya, atau bahan/satuan tak dikenal) */ unknownLines: number }
export function recipeCost(lines: RecipeLine[], byId: Map<string, RecipeIngredient>): RecipeCost {
  let total = 0, unknownLines = 0;
  for (const l of lines) {
    const ing = byId.get(l.ingredientId);
    if (!ing || ing.costSource === 'none' || ingredientFactor(ing, l.unitId) === null) unknownLines++;
    total += recipeLineCost(l, ing);
  }
  return { total: round2(total), unknownLines };
}
/** Margin kotor dalam persen dari harga jual; null bila harga 0. */
export function marginPct(price: number, cost: number): number | null {
  return price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
}

/** Pesan galat untuk resep yang akan disimpan, atau null bila layak. */
export function recipeProblem(lines: RecipeLine[], ingredients: Map<string, RecipeIngredient>): string | null {
  if (lines.length > RECIPE_MAX_LINES) return `Resep paling banyak ${RECIPE_MAX_LINES} bahan.`;
  const seen = new Set<string>();
  for (const [i, l] of lines.entries()) {
    const ing = ingredients.get(l.ingredientId);
    if (!ing) return `Baris ${i + 1}: pilih bahan.`;
    if (seen.has(l.ingredientId)) return `${ing.name} muncul dua kali. Gabungkan jumlahnya dalam satu baris.`;
    seen.add(l.ingredientId);
    if (!Number.isFinite(l.qty) || l.qty <= 0) return `${ing.name}: isi jumlah lebih dari 0.`;
    if (Math.round(l.qty * 10000) / 10000 !== l.qty) return `${ing.name}: jumlah paling banyak 4 angka di belakang koma.`;
    if (ingredientFactor(ing, l.unitId) === null) return `${ing.name}: satuan itu belum punya konversi ke ${ing.baseUnit}. Atur dulu di data bahan.`;
  }
  return null;
}

export interface RecipeRow { product: RecipeProduct; cost: RecipeCost; margin: number | null }
export function recipeRows(products: RecipeProduct[], ingredients: RecipeIngredient[]): RecipeRow[] {
  const by = new Map(ingredients.map((i) => [i.id, i]));
  return products.map((p) => { const cost = recipeCost(p.lines, by); return { product: p, cost, margin: p.lines.length ? marginPct(p.price, cost.total) : null }; });
}
export function recipeFilterMatches(r: RecipeRow, f: RecipeFilter): boolean {
  if (f === 'none') return r.product.lines.length === 0;
  if (f === 'incomplete') return r.product.lines.length > 0 && r.cost.unknownLines > 0;
  if (f === 'thin') return r.product.lines.length > 0 && r.margin !== null && r.margin < THIN_MARGIN_PCT;
  return true;
}

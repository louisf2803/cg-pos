// Produksi stok (A137; migrasi 0137): acuan produksi (bahan -> barang jadi) dan perintah produksi.
import { DataError } from './types';

export interface ProductionLineInput { productId: string; qty: number }
export interface ProductionTemplateInput {
  id: string; name: string; outputProductId: string; outputQty: number; note?: string; isActive: boolean; lines: ProductionLineInput[];
}
export interface ProductionTemplate extends ProductionTemplateInput { outputName: string; lines: (ProductionLineInput & { name: string })[] }
export interface ProductionRunInput { id: string; templateId: string; locationId?: string; batches: number; date?: string; note?: string }
export interface ProductionRun {
  id: string; number: string; templateId: string; templateName: string; locationId?: string; date: string;
  batches: number; producedQty: number; totalCost: number; note?: string;
}

export function productionTemplateProblem(i: ProductionTemplateInput): string | null {
  if (!i.name.trim() || i.name.trim().length > 80) return 'Nama acuan wajib diisi (maksimal 80 huruf).';
  if (!i.outputProductId) return 'Pilih barang jadi.';
  if (!(i.outputQty > 0) || !Number.isFinite(i.outputQty)) return 'Jumlah jadi per acuan harus lebih dari nol.';
  if (i.lines.length === 0) return 'Tambahkan minimal satu bahan.';
  if (i.lines.length > 50) return 'Bahan terlalu banyak (maksimal 50).';
  const seen = new Set<string>();
  for (const l of i.lines) {
    if (!l.productId) return 'Pilih bahan pada tiap baris.';
    if (l.productId === i.outputProductId) return 'Barang jadi tidak boleh menjadi bahannya sendiri.';
    if (seen.has(l.productId)) return 'Bahan yang sama muncul dua kali.';
    seen.add(l.productId);
    if (!(l.qty > 0) || !Number.isFinite(l.qty)) return 'Jumlah tiap bahan harus lebih dari nol.';
  }
  return null;
}

export function productionRunProblem(i: ProductionRunInput): string | null {
  if (!i.templateId) return 'Pilih acuan produksi.';
  if (!(i.batches > 0) || !Number.isFinite(i.batches) || i.batches > 1_000_000) return 'Jumlah batch harus lebih dari nol.';
  if (i.date && !/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return 'Tanggal tidak valid.';
  return null;
}

/** Kebutuhan bahan dan hasil untuk sejumlah batch (pembulatan 4 angka, sama dengan server). */
export function productionRequirements(t: Pick<ProductionTemplateInput, 'outputQty' | 'lines'>, batches: number): { produced: number; needs: { productId: string; qty: number }[] } {
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return { produced: r4(t.outputQty * batches), needs: t.lines.map((l) => ({ productId: l.productId, qty: r4(l.qty * batches) })) };
}

/** Bahan yang stoknya kurang untuk sejumlah batch. */
export function productionShortfalls(
  t: Pick<ProductionTemplateInput, 'outputQty' | 'lines'>, batches: number, stock: (productId: string) => number,
): { productId: string; need: number; have: number }[] {
  return productionRequirements(t, batches).needs
    .map((n) => ({ productId: n.productId, need: n.qty, have: stock(n.productId) }))
    .filter((s) => s.have < s.need);
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengelola produksi.',
  'name required': 'Nama acuan wajib diisi.',
  'invalid output quantity': 'Jumlah jadi per acuan tidak valid.',
  'output product does not track stock': 'Barang jadi harus barang yang stoknya dilacak.',
  'template has no ingredients': 'Tambahkan minimal satu bahan.',
  'too many ingredients': 'Bahan terlalu banyak (maksimal 50).',
  'invalid ingredient quantity': 'Jumlah bahan tidak valid.',
  'output cannot be an ingredient': 'Barang jadi tidak boleh menjadi bahannya sendiri.',
  'duplicate ingredient': 'Bahan yang sama muncul dua kali.',
  'ingredient does not track stock': 'Semua bahan harus barang yang stoknya dilacak.',
  'name already used': 'Nama acuan sudah dipakai.',
  'template has runs': 'Acuan sudah pernah dipakai produksi, jadi tidak bisa dihapus. Nonaktifkan saja.',
  'template not found': 'Acuan tidak ditemukan.',
  'template inactive': 'Acuan nonaktif.',
  'location not found': 'Lokasi stok tidak ditemukan.',
  'invalid batches': 'Jumlah batch harus lebih dari nol.',
  'insufficient stock': 'Stok bahan tidak cukup untuk produksi ini.',
};
export function productionError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal memproses produksi.'));
}

interface FakeDeps {
  /** stok dan nama barang yang dilacak; null bila tidak dilacak */
  stock: (productId: string) => { name: string; qty: number } | null;
  avgCost: (productId: string) => number;
  move: (productId: string, delta: number, kind: 'production_in' | 'production_out', unitCost: number, reason: string) => void;
  allowNegative: () => boolean;
  today: () => string;
  newId: () => string;
}

/** Penyimpanan palsu untuk mode demo; perhitungan stok dan biaya sama dengan fungsi server. */
export function createFakeProduction(deps: FakeDeps) {
  const templates = new Map<string, ProductionTemplate>();
  const runs: ProductionRun[] = [];
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async listProductionTemplates(): Promise<ProductionTemplate[]> { return clone([...templates.values()].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveProductionTemplate(input: ProductionTemplateInput): Promise<void> {
      const problem = productionTemplateProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const out = deps.stock(input.outputProductId);
      if (!out) throw new DataError('invalid', SERVER_MESSAGES['output product does not track stock']!);
      if ([...templates.values()].some((t) => t.id !== input.id && t.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new DataError('invalid', SERVER_MESSAGES['name already used']!);
      const lines = input.lines.map((l) => {
        const s = deps.stock(l.productId);
        if (!s) throw new DataError('invalid', SERVER_MESSAGES['ingredient does not track stock']!);
        return { ...l, name: s.name };
      });
      templates.set(input.id, { ...input, name: input.name.trim(), outputName: out.name, lines });
    },
    async deleteProductionTemplate(id: string): Promise<void> {
      if (runs.some((r) => r.templateId === id)) throw new DataError('invalid', SERVER_MESSAGES['template has runs']!);
      templates.delete(id);
    },
    async listProductionRuns(): Promise<ProductionRun[]> { return clone([...runs].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))); },
    async runProduction(input: ProductionRunInput): Promise<ProductionRun> {
      const existing = runs.find((r) => r.id === input.id);
      if (existing) return clone(existing);
      const problem = productionRunProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const t = templates.get(input.templateId);
      if (!t) throw new DataError('not_found', SERVER_MESSAGES['template not found']!);
      if (!t.isActive) throw new DataError('invalid', SERVER_MESSAGES['template inactive']!);
      const { produced, needs } = productionRequirements(t, input.batches);
      if (!deps.allowNegative() && productionShortfalls(t, input.batches, (id) => deps.stock(id)?.qty ?? 0).length > 0) throw new DataError('invalid', SERVER_MESSAGES['insufficient stock']!);
      const number = `PRD-${String(runs.length + 1).padStart(6, '0')}`;
      let total = 0;
      for (const n of needs) {
        total += n.qty * deps.avgCost(n.productId);
        deps.move(n.productId, -n.qty, 'production_out', 0, `Produksi ${number}`);
      }
      deps.move(t.outputProductId, produced, 'production_in', Math.round((total / produced) * 10000) / 10000, `Produksi ${number}`);
      const run: ProductionRun = {
        id: input.id, number, templateId: t.id, templateName: t.name, date: input.date ?? deps.today(), batches: input.batches, producedQty: produced,
        totalCost: Math.round(total * 100) / 100, ...(input.locationId ? { locationId: input.locationId } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      };
      runs.push(run);
      return clone(run);
    },
  };
}

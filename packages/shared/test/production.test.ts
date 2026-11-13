import { describe, expect, it } from 'vitest';
import { createFakeProduction, productionError, productionRequirements, productionRunProblem, productionShortfalls, productionTemplateProblem, type ProductionTemplateInput } from '../src/production';

const tpl: ProductionTemplateInput = { id: 't1', name: 'Roti Tawar', outputProductId: 'roti', outputQty: 4, isActive: true, lines: [{ productId: 'tepung', qty: 2 }, { productId: 'gula', qty: 1 }] };

function world(allowNegative = true) {
  const qty: Record<string, number> = { tepung: 10, gula: 5, roti: 0 };
  const avg: Record<string, number> = { tepung: 5000, gula: 10000, roti: 0 };
  const log: string[] = [];
  const deps = {
    stock: (id: string) => (id in qty ? { name: id, qty: qty[id]! } : null),
    avgCost: (id: string) => avg[id] ?? 0,
    move: (id: string, delta: number, kind: string, unitCost: number) => { qty[id] = (qty[id] ?? 0) + delta; if (kind === 'production_in') avg[id] = unitCost; log.push(`${kind}:${id}:${delta}`); },
    allowNegative: () => allowNegative, today: () => '2026-11-13', newId: () => 'x',
  };
  return { qty, avg, log, store: createFakeProduction(deps as never) };
}

describe('validasi acuan dan perintah', () => {
  it('acuan yang benar lolos; kesalahan umum ditolak', () => {
    expect(productionTemplateProblem(tpl)).toBeNull();
    expect(productionTemplateProblem({ ...tpl, name: ' ' })).toMatch(/Nama/);
    expect(productionTemplateProblem({ ...tpl, lines: [] })).toMatch(/minimal satu bahan/);
    expect(productionTemplateProblem({ ...tpl, lines: [{ productId: 'roti', qty: 1 }] })).toMatch(/bahannya sendiri/);
    expect(productionTemplateProblem({ ...tpl, lines: [{ productId: 'a', qty: 1 }, { productId: 'a', qty: 2 }] })).toMatch(/dua kali/);
    expect(productionTemplateProblem({ ...tpl, outputQty: 0 })).toMatch(/lebih dari nol/);
  });
  it('perintah: batch harus positif', () => {
    expect(productionRunProblem({ id: 'r', templateId: 't1', batches: 2 })).toBeNull();
    expect(productionRunProblem({ id: 'r', templateId: 't1', batches: 0 })).toMatch(/batch/);
    expect(productionRunProblem({ id: 'r', templateId: '', batches: 1 })).toMatch(/acuan/);
  });
  it('kebutuhan dan kekurangan bahan', () => {
    expect(productionRequirements(tpl, 2.5)).toEqual({ produced: 10, needs: [{ productId: 'tepung', qty: 5 }, { productId: 'gula', qty: 2.5 }] });
    expect(productionShortfalls(tpl, 4, (id) => ({ tepung: 10, gula: 5 } as Record<string, number>)[id] ?? 0)).toEqual([{ productId: 'tepung', need: 8, have: 10 }].filter((s) => s.have < s.need));
    expect(productionShortfalls(tpl, 6, (id) => ({ tepung: 10, gula: 5 } as Record<string, number>)[id] ?? 0).map((s) => s.productId)).toEqual(['tepung', 'gula']);
  });
  it('terjemahan galat server', () => expect(productionError({ message: 'insufficient stock' }).message).toMatch(/tidak cukup/));
});

describe('produksi (demo)', () => {
  it('2 batch: bahan berkurang, barang jadi bertambah, harga perolehan = biaya bahan / jumlah jadi', async () => {
    const w = world();
    await w.store.saveProductionTemplate(tpl);
    const run = await w.store.runProduction({ id: 'r1', templateId: 't1', batches: 2 });
    expect(run).toMatchObject({ number: 'PRD-000001', producedQty: 8, totalCost: 40000, templateName: 'Roti Tawar' });
    expect(w.qty).toMatchObject({ tepung: 6, gula: 3, roti: 8 });
    expect(w.avg.roti).toBe(5000);
  });
  it('idempoten menurut id; acuan terpakai tidak bisa dihapus', async () => {
    const w = world();
    await w.store.saveProductionTemplate(tpl);
    await w.store.runProduction({ id: 'r1', templateId: 't1', batches: 1 });
    await w.store.runProduction({ id: 'r1', templateId: 't1', batches: 1 });
    expect(w.qty.tepung).toBe(8);
    expect(await w.store.listProductionRuns()).toHaveLength(1);
    await expect(w.store.deleteProductionTemplate('t1')).rejects.toThrow(/tidak bisa dihapus/);
  });
  it('stok kurang ditolak bila stok negatif dilarang, boleh bila diizinkan', async () => {
    const strict = world(false);
    await strict.store.saveProductionTemplate(tpl);
    await expect(strict.store.runProduction({ id: 'r1', templateId: 't1', batches: 10 })).rejects.toThrow(/tidak cukup/);
    expect(strict.qty.tepung).toBe(10);
    const loose = world(true);
    await loose.store.saveProductionTemplate(tpl);
    await loose.store.runProduction({ id: 'r1', templateId: 't1', batches: 10 });
    expect(loose.qty.tepung).toBe(-10);
  });
  it('nama kembar, barang tak dilacak, dan acuan nonaktif ditolak', async () => {
    const w = world();
    await w.store.saveProductionTemplate(tpl);
    await expect(w.store.saveProductionTemplate({ ...tpl, id: 't2', name: 'roti tawar' })).rejects.toThrow(/sudah dipakai/);
    await expect(w.store.saveProductionTemplate({ ...tpl, id: 't3', name: 'X', outputProductId: 'jasa' })).rejects.toThrow(/dilacak/);
    await w.store.saveProductionTemplate({ ...tpl, isActive: false });
    await expect(w.store.runProduction({ id: 'r1', templateId: 't1', batches: 1 })).rejects.toThrow(/nonaktif/);
  });
});

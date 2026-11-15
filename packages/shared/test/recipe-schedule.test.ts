import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src';

function setup() {
  let t = new Date('2026-11-15T03:00:00Z').getTime();
  const d = createFakeData({ now: () => new Date(t) });
  return { d, advance: (min: number) => { t += min * 60_000; }, iso: (min: number) => new Date(t + min * 60_000).toISOString() };
}

describe('jadwal perubahan resep (mode demo)', () => {
  it('resep lama berlaku sampai waktunya, lalu diganti seluruhnya', async () => {
    const { d, advance, iso } = setup();
    const recipes = await d.listRecipes();
    const prod = recipes.find((r) => r.lines.length > 0)!;
    const ings = await d.listRecipeIngredients();
    const ing = ings.find((i) => !prod.lines.some((l) => l.ingredientId === i.id))!;
    const next = [{ ingredientId: ing.id, qty: 12, unitId: ing.units[0]!.unitId }];
    const id = await d.saveRecipeSchedule({ productId: prod.id, effectiveAt: iso(60), lines: next, note: 'Resep musim hujan' });

    expect((await d.listRecipeSchedules())[0]).toMatchObject({ id, status: 'pending', note: 'Resep musim hujan' });
    expect((await d.listRecipes()).find((r) => r.id === prod.id)!.lines).toEqual(prod.lines);

    advance(61);
    const after = await d.listRecipeSchedules();
    expect(after[0]!.status).toBe('applied');
    expect((await d.listRecipes()).find((r) => r.id === prod.id)!.lines).toEqual(next);
  });

  it('waktu lampau dan bahan tak dikenal ditolak', async () => {
    const { d, iso } = setup();
    const prod = (await d.listRecipes())[0]!;
    const ing = (await d.listRecipeIngredients())[0]!;
    const lines = [{ ingredientId: ing.id, qty: 1, unitId: ing.units[0]!.unitId }];
    await expect(d.saveRecipeSchedule({ productId: prod.id, effectiveAt: iso(-5), lines })).rejects.toThrow(/masa depan/i);
    await expect(d.saveRecipeSchedule({ productId: prod.id, effectiveAt: iso(5), lines: [{ ingredientId: 'tidak-ada', qty: 1, unitId: 'x' }] })).rejects.toThrow();
  });

  it('jadwal menunggu bisa dibatalkan dan tidak diterapkan', async () => {
    const { d, advance, iso } = setup();
    const prod = (await d.listRecipes())[0]!;
    const ing = (await d.listRecipeIngredients())[0]!;
    const before = (await d.listRecipes()).find((r) => r.id === prod.id)!.lines;
    const id = await d.saveRecipeSchedule({ productId: prod.id, effectiveAt: iso(30), lines: [{ ingredientId: ing.id, qty: 3, unitId: ing.units[0]!.unitId }] });
    expect(await d.cancelRecipeSchedule(id)).toBe(true);
    expect(await d.cancelRecipeSchedule(id)).toBe(false);
    advance(60);
    expect((await d.listRecipeSchedules())[0]!.status).toBe('cancelled');
    expect((await d.listRecipes()).find((r) => r.id === prod.id)!.lines).toEqual(before);
  });
});

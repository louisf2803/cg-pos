import { describe, expect, it } from 'vitest';
import { createFakeData, menusUsingIngredient, unavailableLabel, unavailableMap } from '../src';

describe('bahan habis', () => {
  it('keterangan dan peta menu habis', () => {
    expect(unavailableLabel(undefined)).toBe('');
    expect(unavailableLabel({ productId: 'p', ingredientIds: ['i'], ingredientNames: ['Matcha', 'Susu'] })).toBe('Habis: Matcha, Susu');
    expect(unavailableMap([{ productId: 'p1', ingredientIds: [], ingredientNames: [] }]).has('p1')).toBe(true);
  });
  it('menu yang memuat bahan tertentu, terurut nama', () => {
    const r = [{ id: 'a', name: 'Latte', lines: [{ ingredientId: 'susu' }] }, { id: 'b', name: 'Americano', lines: [{ ingredientId: 'kopi' }] }, { id: 'c', name: 'Cappuccino', lines: [{ ingredientId: 'susu' }, { ingredientId: 'kopi' }] }];
    expect(menusUsingIngredient(r, 'susu').map((m) => m.name)).toEqual(['Cappuccino', 'Latte']);
    expect(menusUsingIngredient(r, 'gula')).toEqual([]);
  });
  it('demo: tandai bahan, menu beresep ikut habis, stok diisi lagi menyalakan otomatis; stok minus tidak menandai', async () => {
    const d = createFakeData();
    expect(await d.listUnavailableProducts()).toEqual([]);
    const recipes = await d.listRecipes();
    const withRecipe = recipes.find((r) => r.lines.length > 0)!;
    const ing = withRecipe.lines[0]!.ingredientId;
    await d.setIngredientUnavailable({ productId: ing, unavailable: true });
    const list = await d.listUnavailableProducts();
    expect(list.some((u) => u.productId === withRecipe.id && u.ingredientIds.includes(ing))).toBe(true);
    expect((await d.listIngredientUnavailable()).map((x) => x.productId)).toContain(ing);
    // stok masuk menyalakan lagi
    await d.postStock({ id: 'stok-uji-1', productId: ing, kind: 'adjust_in', qty: 5, unitCost: 100 });
    expect(await d.listUnavailableProducts()).toEqual([]);
    expect(await d.listIngredientUnavailable()).toEqual([]);
    // dihapus manual juga bisa
    await d.setIngredientUnavailable({ productId: ing, unavailable: true });
    await d.setIngredientUnavailable({ productId: ing, unavailable: false });
    expect(await d.listUnavailableProducts()).toEqual([]);
  });
});

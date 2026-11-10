import { describe, expect, it } from 'vitest';
import { createFakeData, marginPct, recipeCost, recipeFilterMatches, recipeLineCost, recipeProblem, recipeRows, type RecipeIngredient } from '../src';

const kopi: RecipeIngredient = { id: 'k', name: 'Kopi', baseUnit: 'gram', unitCost: 320, costSource: 'average', units: [{ unitId: 'gram', name: 'gram', factor: 1 }, { unitId: 'kg', name: 'kg', factor: 1000 }] };
const susu: RecipeIngredient = { id: 's', name: 'Susu', baseUnit: 'ml', unitCost: 18, costSource: 'buy_price', units: [{ unitId: 'ml', name: 'ml', factor: 1 }] };
const baru: RecipeIngredient = { id: 'b', name: 'Sirup baru', baseUnit: 'ml', unitCost: 0, costSource: 'none', units: [{ unitId: 'ml', name: 'ml', factor: 1 }] };
const by = new Map([kopi, susu, baru].map((i) => [i.id, i]));

describe('resep: biaya dan margin', () => {
  it('menghitung biaya baris dengan konversi satuan', () => {
    expect(recipeLineCost({ ingredientId: 'k', qty: 18, unitId: 'gram' }, kopi)).toBe(5760);
    expect(recipeLineCost({ ingredientId: 'k', qty: 0.018, unitId: 'kg' }, kopi)).toBeCloseTo(5760, 6);
    expect(recipeLineCost({ ingredientId: 'k', qty: 1, unitId: 'liter' }, kopi)).toBe(0);
    expect(recipeLineCost({ ingredientId: 'x', qty: 1, unitId: 'gram' }, undefined)).toBe(0);
  });
  it('menjumlahkan HPP dan menandai baris yang biayanya belum diketahui', () => {
    expect(recipeCost([{ ingredientId: 'k', qty: 18, unitId: 'gram' }, { ingredientId: 's', qty: 100, unitId: 'ml' }], by)).toEqual({ total: 7560, unknownLines: 0 });
    expect(recipeCost([{ ingredientId: 'k', qty: 18, unitId: 'gram' }, { ingredientId: 'b', qty: 10, unitId: 'ml' }], by)).toEqual({ total: 5760, unknownLines: 1 });
    expect(recipeCost([{ ingredientId: 'hilang', qty: 1, unitId: 'gram' }], by).unknownLines).toBe(1);
    expect(recipeCost([], by)).toEqual({ total: 0, unknownLines: 0 });
  });
  it('margin dalam persen dari harga jual, null bila harga 0', () => {
    expect(marginPct(20000, 7560)).toBe(62.2);
    expect(marginPct(10000, 12000)).toBe(-20);
    expect(marginPct(0, 100)).toBeNull();
  });
});

describe('resep: pemeriksaan sebelum simpan', () => {
  it('menolak bahan kosong, kembar, jumlah salah, dan satuan tanpa konversi', () => {
    expect(recipeProblem([], by)).toBeNull();
    expect(recipeProblem([{ ingredientId: '', qty: 1, unitId: 'gram' }], by)).toMatch(/pilih bahan/);
    expect(recipeProblem([{ ingredientId: 'k', qty: 1, unitId: 'gram' }, { ingredientId: 'k', qty: 2, unitId: 'kg' }], by)).toMatch(/dua kali/);
    expect(recipeProblem([{ ingredientId: 'k', qty: 0, unitId: 'gram' }], by)).toMatch(/lebih dari 0/);
    expect(recipeProblem([{ ingredientId: 'k', qty: Number.NaN, unitId: 'gram' }], by)).toMatch(/lebih dari 0/);
    expect(recipeProblem([{ ingredientId: 'k', qty: 1.00001, unitId: 'gram' }], by)).toMatch(/4 angka/);
    expect(recipeProblem([{ ingredientId: 's', qty: 1, unitId: 'gram' }], by)).toMatch(/konversi ke ml/);
    expect(recipeProblem(Array.from({ length: 61 }, (_, i) => ({ ingredientId: `i${i}`, qty: 1, unitId: 'gram' })), by)).toMatch(/60/);
    expect(recipeProblem([{ ingredientId: 'k', qty: 0.5, unitId: 'kg' }], by)).toBeNull();
  });
});

describe('resep: penyaring daftar', () => {
  it('memilah belum ada resep, biaya belum lengkap, dan margin tipis', () => {
    const rows = recipeRows([
      { id: 'a', name: 'A', price: 20000, isActive: true, lines: [] },
      { id: 'b', name: 'B', price: 20000, isActive: true, lines: [{ ingredientId: 'b', qty: 5, unitId: 'ml' }] },
      { id: 'c', name: 'C', price: 7000, isActive: true, lines: [{ ingredientId: 'k', qty: 18, unitId: 'gram' }] },
      { id: 'd', name: 'D', price: 20000, isActive: true, lines: [{ ingredientId: 'k', qty: 18, unitId: 'gram' }] },
    ], [kopi, susu, baru]);
    const ids = (f: Parameters<typeof recipeFilterMatches>[1]) => rows.filter((r) => recipeFilterMatches(r, f)).map((r) => r.product.id);
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('none')).toEqual(['a']);
    expect(ids('incomplete')).toEqual(['b']);
    expect(ids('thin')).toEqual(['c']);
    expect(rows[0]!.margin).toBeNull();
  });
});

describe('resep: data palsu', () => {
  it('membaca, menyimpan, menolak resep salah, dan mencatat satu log', async () => {
    const d = createFakeData();
    const ings = await d.listRecipeIngredients();
    expect(ings.length).toBeGreaterThanOrEqual(4);
    const recipes = await d.listRecipes();
    const kopiSusu = recipes.find((r) => r.id === 'p1')!;
    expect(kopiSusu.lines.length).toBe(4);
    expect(recipeRows([kopiSusu], ings)[0]!.cost.total).toBeGreaterThan(0);
    const before = (await d.listActivity({ entity: 'recipe' })).length;
    expect(await d.saveRecipe('p1', [{ ingredientId: 'ing-kopi', qty: 20, unitId: 'gram' }])).toBe(1);
    expect((await d.listRecipes()).find((r) => r.id === 'p1')!.lines).toEqual([{ ingredientId: 'ing-kopi', qty: 20, unitId: 'gram' }]);
    const logs = await d.listActivity({ entity: 'recipe' });
    expect(logs.length).toBe(before + 1);
    expect(logs[0]!.name).toBe('Kopi susu gula aren');
    await d.saveRecipe('p1', [{ ingredientId: 'ing-kopi', qty: 20, unitId: 'gram' }]);
    expect((await d.listActivity({ entity: 'recipe' })).length).toBe(before + 1);
    await expect(d.saveRecipe('p1', [{ ingredientId: 'ing-susu', qty: 1, unitId: 'gram' }])).rejects.toThrow(/konversi/);
    await expect(d.saveRecipe('tidak-ada', [])).rejects.toThrow(/tidak ditemukan/);
    expect(await d.saveRecipe('p1', [])).toBe(0);
    expect((await d.listRecipes()).find((r) => r.id === 'p1')!.lines).toEqual([]);
  });
});

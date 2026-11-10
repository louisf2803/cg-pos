import { describe, expect, it } from 'vitest';
import { groupNotePresets, noteHasText, notePresetProblem, toggleNoteText, type NotePreset } from '../src/notes';
import { createFakeData } from '../src';

const P = (id: string, category: string, text: string, sort = 0, isActive = true): NotePreset => ({ id, category, text, sort, isActive });

describe('notePresetProblem', () => {
  it('menolak kosong dan terlalu panjang', () => {
    expect(notePresetProblem({ category: ' ', text: 'x' })).toMatch(/Kategori/);
    expect(notePresetProblem({ category: 'Pedas', text: ' ' })).toMatch(/Isi catatan/);
    expect(notePresetProblem({ category: 'x'.repeat(41), text: 'x' })).toMatch(/40/);
    expect(notePresetProblem({ category: 'Pedas', text: 'x'.repeat(61) })).toMatch(/60/);
    expect(notePresetProblem({ category: 'Pedas', text: 'Sedang' })).toBeNull();
  });
});
describe('groupNotePresets', () => {
  it('mengelompokkan tanpa membedakan huruf besar/kecil, urut sort, membuang nonaktif', () => {
    const g = groupNotePresets([P('1', 'Pedas', 'Pedas', 2), P('2', 'pedas', 'Sedang', 1), P('3', 'Gula', 'Kurang manis', 3), P('4', 'Gula', 'Tanpa gula', 4, false)]);
    expect(g.map((x) => x.category)).toEqual(['pedas', 'Gula']);
    expect(g[0]!.items.map((x) => x.text)).toEqual(['Sedang', 'Pedas']);
    expect(g[1]!.items).toHaveLength(1);
  });
});
describe('toggleNoteText', () => {
  it('menambah, melepas, dan menjaga batas 120 huruf', () => {
    let n = toggleNoteText('', 'Sedang');
    n = toggleNoteText(n, 'Kurang manis');
    expect(n).toBe('Sedang, Kurang manis');
    expect(noteHasText(n, 'sedang')).toBe(true);
    expect(toggleNoteText(n, 'SEDANG')).toBe('Kurang manis');
    const long = 'x'.repeat(115);
    expect(toggleNoteText(long, 'Pedas')).toBe(long);
    expect(toggleNoteText(undefined, 'Pedas')).toBe('Pedas');
  });
});
describe('DataLayer fake: catatan siap pakai', () => {
  it('seed, simpan, ubah, duplikat ditolak, hapus', async () => {
    const d = createFakeData();
    const seed = await d.listNotePresets();
    expect(seed.length).toBeGreaterThan(0);
    const a = await d.saveNotePreset({ category: 'Suhu', text: 'Hangat saja' });
    expect((await d.listNotePresets()).some((x) => x.id === a.id)).toBe(true);
    await expect(d.saveNotePreset({ category: 'suhu', text: ' HANGAT SAJA ' })).rejects.toThrow(/sudah ada/);
    const b = await d.saveNotePreset({ id: a.id, category: 'Suhu', text: 'Panas', isActive: false });
    expect(b.text).toBe('Panas'); expect(b.isActive).toBe(false);
    await expect(d.saveNotePreset({ category: '', text: 'x' })).rejects.toThrow();
    await d.removeNotePreset(a.id);
    expect((await d.listNotePresets()).some((x) => x.id === a.id)).toBe(false);
    await expect(d.removeNotePreset(a.id)).rejects.toThrow();
  });
});

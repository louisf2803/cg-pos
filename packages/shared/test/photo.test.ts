import { describe, expect, it } from 'vitest';
import { bytesToDataUri, createFakeData, PHOTO_MAX_BYTES, photoPath, photoProblem } from '../src';

const jpeg = (n = 10) => ({ data: new Uint8Array(n).fill(7), contentType: 'image/jpeg' as const });

describe('foto produk', () => {
  it('pengecekan: format, kosong, terlalu besar', () => {
    expect(photoProblem(jpeg())).toBeNull();
    expect(photoProblem({ data: new Uint8Array(3), contentType: 'image/gif' })).toMatch(/JPG, PNG, atau WebP/);
    expect(photoProblem({ data: new Uint8Array(0), contentType: 'image/png' })).toMatch(/kosong/);
    expect(photoProblem(jpeg(PHOTO_MAX_BYTES + 1))).toMatch(/terlalu besar/);
    expect(photoProblem(jpeg(PHOTO_MAX_BYTES))).toBeNull();
  });
  it('alamat berisi organisasi, produk, cap waktu, dan ekstensi sesuai format', () => {
    expect(photoPath('org1', 'p1', 'image/webp', 123)).toBe('cgpos/org1/p1-123.webp');
    expect(photoPath('org1', 'p1', 'image/jpeg', 1)).toMatch(/\.jpg$/);
  });
  it('data URI untuk fake dapat dibaca balik', () => {
    const u = bytesToDataUri({ data: Uint8Array.from([1, 2, 3, 250]), contentType: 'image/png' });
    expect(u.startsWith('data:image/png;base64,')).toBe(true);
    expect(Array.from(Buffer.from(u.split(',')[1]!, 'base64'))).toEqual([1, 2, 3, 250]);
  });
  it('pasang, ganti, dan hapus foto; foto lama varian ikut terhapus', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset();
    const cat = (await d.listCatalog()).find((c) => c.name === 'Kopi susu gula aren')!;
    expect(cat.photoUrl).toBeUndefined();
    const a = await d.setProductPhoto(cat.id, jpeg());
    expect(a.photoUrl?.startsWith('data:image/jpeg')).toBe(true);
    const b = await d.setProductPhoto(cat.id, { data: new Uint8Array(5).fill(9), contentType: 'image/png' });
    expect(b.photoUrl?.startsWith('data:image/png')).toBe(true);
    // kasir melihat foto yang sama lewat listProducts
    expect((await d.listProducts()).find((p) => p.id === cat.id)?.photoUrl).toBe(b.photoUrl);
    const c = await d.setProductPhoto(cat.id, null);
    expect(c.photoUrl).toBeUndefined();
    await expect(d.setProductPhoto('nope', jpeg())).rejects.toThrow(/tidak ditemukan/);
    await expect(d.setProductPhoto(cat.id, { data: new Uint8Array(2), contentType: 'image/bmp' as 'image/png' })).rejects.toThrow(/JPG/);
  });
});

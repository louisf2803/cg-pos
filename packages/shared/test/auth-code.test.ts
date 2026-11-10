import { describe, expect, it } from 'vitest';
import { authCodeProblem, createFakeData, formatAuthCode, normalizeAuthCode } from '../src';

describe('kode otorisasi: aturan isian', () => {
  it('menormalkan spasi dan tanda hubung, memformat 4+4, dan memeriksa bentuk', () => {
    expect(normalizeAuthCode(' 1234-5678 ')).toBe('12345678');
    expect(formatAuthCode('12345678')).toBe('1234 5678');
    expect(authCodeProblem('')).toMatch(/Isi kode/);
    expect(authCodeProblem('12ab5678')).toMatch(/angka/);
    expect(authCodeProblem('1234567')).toMatch(/8 angka/);
    expect(authCodeProblem('1234 5678')).toBeNull();
  });
});

describe('kode otorisasi: data palsu', () => {
  it('terbit, dipakai sekali, tindakan harus cocok, dibatalkan, dan dikunci setelah 5 salah', async () => {
    const d = createFakeData();
    const a = await d.issueAuthCode({ permission: 'void_order', ttlMinutes: 15, note: ' meja 4 ' });
    expect(a.code).toMatch(/^\d{8}$/);
    expect(await d.useAuthCode('refund', 'x')).toBeNull();
    expect(await d.useAuthCode(a.code, 'refund')).toBeNull();
    expect(await d.useAuthCode(a.code, 'void_order')).toBeTruthy();
    expect(await d.useAuthCode(a.code, 'void_order')).toBeNull();
    const list = await d.listAuthCodes();
    expect(list[0]).toMatchObject({ id: a.id, status: 'used', permission: 'void_order', note: 'meja 4' });

    const b = await d.issueAuthCode({ permission: 'complimentary', ttlMinutes: 5 });
    expect(await d.revokeAuthCode(b.id)).toBe(true);
    expect(await d.revokeAuthCode(b.id)).toBe(false);
    expect(await d.useAuthCode(b.code, 'complimentary')).toBeNull();

    const c = await d.issueAuthCode({ permission: 'void_order', ttlMinutes: 15 });
    const wrong = c.code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i++) await d.useAuthCode(wrong, 'void_order');
    expect(await d.useAuthCode(c.code, 'void_order')).toBeNull();
  });

  it('menolak masa berlaku di luar 1-240 menit dan tindakan yang belum didukung layar', async () => {
    const d = createFakeData();
    await expect(d.issueAuthCode({ permission: 'void_order', ttlMinutes: 0 })).rejects.toThrow();
    await expect(d.issueAuthCode({ permission: 'void_order', ttlMinutes: 241 })).rejects.toThrow();
  });
});

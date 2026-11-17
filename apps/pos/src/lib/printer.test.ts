import { describe, expect, it } from 'vitest';
import { rawbtUrl } from './printer';

describe('cetak lewat RawBT (Android)', () => {
  it('membentuk intent base64 ke paket RawBT', () => {
    const url = rawbtUrl(new Uint8Array([0x1b, 0x40, 0x48, 0x69, 0x0a]));
    expect(url).toBe('intent:base64,G0BIaQo=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;');
  });
  it('byte besar tidak membuat panggilan terlalu banyak argumen', () => {
    const big = new Uint8Array(200_000).fill(65);
    expect(rawbtUrl(big).length).toBeGreaterThan(260_000);
  });
});

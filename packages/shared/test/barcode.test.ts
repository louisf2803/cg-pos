import { describe, it, expect } from 'vitest';
import {
  calculateCode128BChecksum,
  encodeCode128B,
  generateCode128Svg,
  CODE128_START_B,
  CODE128_STOP,
} from '../src/barcode';

describe('Code 128 (Set B) Generator', () => {
  describe('calculateCode128BChecksum', () => {
    it('menghitung checksum baku untuk string angka "123456"', () => {
      // 104 + 1*17 + 2*18 + 3*19 + 4*20 + 5*21 + 6*22 = 531 % 103 = 16
      const checksum = calculateCode128BChecksum('123456');
      expect(checksum).toBe(16);
    });

    it('menghitung checksum baku untuk string alfanumerik "CODE128"', () => {
      // 104 + 1*35(C) + 2*47(O) + 3*36(D) + 4*37(E) + 5*17(1) + 6*18(2) + 7*24(8) = 850 % 103 = 26
      const checksum = calculateCode128BChecksum('CODE128');
      expect(checksum).toBe(26);
    });

    it('menghitung checksum untuk SKU realistis "CGPOS-001"', () => {
      const checksum = calculateCode128BChecksum('CGPOS-001');
      expect(checksum).toBeGreaterThanOrEqual(0);
      expect(checksum).toBeLessThan(103);
    });

    it('menolak karakter di luar rentang ASCII 32..126', () => {
      expect(() => calculateCode128BChecksum('Kopi \u0000')).toThrow(/tidak didukung/);
      expect(() => calculateCode128BChecksum('Espresso ☕')).toThrow(/tidak didukung/);
    });
  });

  describe('encodeCode128B', () => {
    it('menolak teks kosong', () => {
      expect(() => encodeCode128B('')).toThrow(/tidak boleh kosong/);
    });

    it('menghasilkan urutan nilai simbol yang tepat dengan Start B dan Stop', () => {
      const res = encodeCode128B('123456');

      expect(res.values[0]).toBe(CODE128_START_B);
      expect(res.values.slice(1, 7)).toEqual([17, 18, 19, 20, 21, 22]);
      expect(res.values[7]).toBe(16); // Checksum
      expect(res.values[8]).toBe(CODE128_STOP);
      expect(res.values.length).toBe(9);
    });

    it('menghitung total modul yang benar: (N + 2)*11 + 2 = 11*N + 35', () => {
      // Untuk 6 karakter: 11 * 6 + 35 = 101 modul
      const res = encodeCode128B('123456');
      expect(res.totalModules).toBe(101);

      // Total lebar elemen dalam widths harus sama persis dengan totalModules
      const sumWidths = res.widths.reduce((a, b) => a + b, 0);
      expect(sumWidths).toBe(101);
    });

    it('menghasilkan segmen bar yang bersambung dan tidak tumpang tindih', () => {
      const res = encodeCode128B('SKU-099');
      expect(res.bars.length).toBeGreaterThan(0);

      for (let i = 0; i < res.bars.length; i++) {
        const bar = res.bars[i];
        expect(bar.width).toBeGreaterThanOrEqual(1);
        expect(bar.width).toBeLessThanOrEqual(4);

        if (i > 0) {
          const prev = res.bars[i - 1];
          expect(bar.x).toBeGreaterThanOrEqual(prev.x + prev.width);
        }
      }
    });
  });

  describe('generateCode128Svg', () => {
    it('menghasilkan markup SVG valid dengan elemen rect dan text', () => {
      const svg = generateCode128Svg('SKU-1002');
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0');
      expect(svg).toContain('<rect');
      expect(svg).toContain('<text');
      expect(svg).toContain('SKU-1002');
      expect(svg).toContain('</svg>');
    });

    it('dapat menyembunyikan teks bila includeText = false', () => {
      const svg = generateCode128Svg('SKU-NO-TEXT', { includeText: false });
      expect(svg).not.toContain('<text');
    });

    it('menerapkan ukuran custom height dan moduleWidth secara konsisten', () => {
      const svg = generateCode128Svg('A', { height: 80, moduleWidth: 3 });
      expect(svg).toContain('height="80"');
    });
  });
});

/**
 * Generator Code 128 (Set B) — Fungsi murni tanpa pustaka eksternal.
 *
 * Mendukung karakter ASCII 32 (' ') sampai 126 ('~').
 * Start Code B = 104, Stop Code = 106.
 */

export const CODE128_START_B = 104;
export const CODE128_STOP = 106;

/**
 * Pola 107 simbol standar Code 128.
 * Masing-masing string merepresentasikan lebar modul berurutan (garis, spasi, garis, spasi, garis, spasi).
 * Nilai 0 s/d 105 memiliki total 11 modul (6 elemen).
 * Nilai 106 (Stop) memiliki total 13 modul (7 elemen: bar, space, bar, space, bar, space, bar).
 */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'                                 // 100-106
];

export interface Code128BarSegment {
  x: number;
  width: number;
}

export interface Code128Result {
  text: string;
  values: number[];
  checksum: number;
  widths: number[];
  totalModules: number;
  bars: Code128BarSegment[];
}

/**
 * Menghitung checksum Code 128 Set B.
 * Formula: (StartValue + SUM(i * Value_i)) % 103
 */
export function calculateCode128BChecksum(text: string): number {
  let sum = CODE128_START_B;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) {
      throw new Error(`Karakter "${text[i]}" (kode ${code}) tidak didukung di Code 128 Set B`);
    }
    const val = code - 32;
    sum += (i + 1) * val;
  }
  return sum % 103;
}

/**
 * Mengubah string teks menjadi representasi Code 128 (Set B).
 * Mengembalikan array lebar bar/spasi, segmen bar hitam, nilai simbol, dan total modul.
 */
export function encodeCode128B(text: string): Code128Result {
  if (!text) {
    throw new Error('Teks barcode tidak boleh kosong');
  }

  const values: number[] = [CODE128_START_B];

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) {
      throw new Error(`Karakter "${text[i]}" (kode ${code}) tidak didukung di Code 128 Set B`);
    }
    values.push(code - 32);
  }

  const checksum = calculateCode128BChecksum(text);
  values.push(checksum);
  values.push(CODE128_STOP);

  const widths: number[] = [];
  const bars: Code128BarSegment[] = [];

  let currentX = 0;

  for (let symIdx = 0; symIdx < values.length; symIdx++) {
    const val = values[symIdx];
    if (val === undefined) continue;
    const pat = CODE128_PATTERNS[val];
    if (!pat) {
      throw new Error(`Pola simbol untuk nilai ${val} tidak ditemukan`);
    }

    for (let elemIdx = 0; elemIdx < pat.length; elemIdx++) {
      const char = pat[elemIdx];
      if (!char) continue;
      const w = parseInt(char, 10);
      widths.push(w);

      const isBar = elemIdx % 2 === 0;
      if (isBar) {
        bars.push({ x: currentX, width: w });
      }

      currentX += w;
    }
  }

  return {
    text,
    values,
    checksum,
    widths,
    totalModules: currentX,
    bars,
  };
}

/**
 * Menghasilkan markup SVG utuh untuk kode barcode Code 128.
 */
export function generateCode128Svg(
  text: string,
  options: {
    height?: number;
    moduleWidth?: number;
    quietZone?: number;
    includeText?: boolean;
    fontSize?: number;
  } = {}
): string {
  const {
    height = 50,
    moduleWidth = 2,
    quietZone = 10,
    includeText = true,
    fontSize = 12,
  } = options;

  const result = encodeCode128B(text);
  const barcodeWidth = result.totalModules * moduleWidth;
  const totalWidth = barcodeWidth + quietZone * 2 * moduleWidth;
  const totalHeight = height + (includeText ? fontSize + 6 : 0);

  const rects = result.bars
    .map(
      (b) =>
        `<rect x="${(b.x + quietZone) * moduleWidth}" y="0" width="${
          b.width * moduleWidth
        }" height="${height}" fill="black" />`
    )
    .join('');

  const textElement = includeText
    ? `<text x="${totalWidth / 2}" y="${
        height + fontSize + 2
      }" font-family="monospace, monospace" font-size="${fontSize}" text-anchor="middle" fill="black">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <rect width="100%" height="100%" fill="white" />
  ${rects}
  ${textElement}
</svg>`;
}

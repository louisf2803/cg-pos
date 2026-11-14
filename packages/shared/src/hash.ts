/**
 * One-way hash untuk PIN karyawan saat offline.
 * JANGAN menyimpan PIN mentah! Hash ini memakai salt unik per karyawan.
 */

function toUtf8Bytes(str: string): Uint8Array {
  const g = globalThis as { TextEncoder?: new () => { encode(s: string): Uint8Array } };
  if (typeof g.TextEncoder === 'function') {
    return new g.TextEncoder().encode(str);
  }
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export async function hashPin(employeeId: string, pin: string): Promise<string> {
  const data = toUtf8Bytes(`cgpos:pin:v1:${employeeId}:${pin}`);
  const g = globalThis as { crypto?: { subtle?: { digest?: (alg: string, data: Uint8Array) => Promise<ArrayBuffer> } } };
  if (typeof g.crypto?.subtle?.digest === 'function') {
    try {
      const buf = await g.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback if subtle digest fails
    }
  }

  // Fallback FNV-1a 64-bit multi-pass deterministic hash bila WebCrypto tidak tersedia
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i]!;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= data[i]!;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

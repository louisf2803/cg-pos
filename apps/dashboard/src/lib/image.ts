import { PHOTO_MAX_BYTES, type ProductPhotoInput } from '@cgpos/shared';

const MAX_SIDE = 800;
const MAX_SOURCE_BYTES = 15_000_000;

/** Kecilkan foto di peramban (sisi terpanjang 800 px, JPEG) supaya cepat dimuat di kasir dan hemat penyimpanan. */
export async function prepareProductPhoto(file: File): Promise<{ photo: ProductPhotoInput; previewUrl: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih file gambar (JPG, PNG, atau WebP).');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('File terlalu besar. Pilih foto di bawah 15 MB.');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('Gambar tidak bisa dibaca. Coba format JPG atau PNG.'); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)); const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Peramban ini tidak bisa mengolah gambar.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  for (const q of [0.85, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', q));
    if (blob && blob.size <= PHOTO_MAX_BYTES) return { photo: { data: new Uint8Array(await blob.arrayBuffer()), contentType: 'image/jpeg' }, previewUrl: URL.createObjectURL(blob) };
  }
  throw new Error('Foto masih terlalu besar setelah dikecilkan. Coba foto lain.');
}

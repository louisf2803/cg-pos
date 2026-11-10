/** Foto produk yang diunggah dari dashboard. Dikecilkan di peramban dulu; di sini hanya batas dan pengecekan. */
export interface ProductPhotoInput { data: Uint8Array; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }

export const PHOTO_MAX_BYTES = 1_000_000;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXT: Record<ProductPhotoInput['contentType'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const photoExt = (t: ProductPhotoInput['contentType']) => EXT[t];

export function photoProblem(p: { data: { byteLength: number }; contentType: string }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(p.contentType)) return 'Foto harus berformat JPG, PNG, atau WebP.';
  if (p.data.byteLength === 0) return 'File foto kosong.';
  if (p.data.byteLength > PHOTO_MAX_BYTES) return 'Foto terlalu besar (maksimal 1 MB setelah dikecilkan).';
  return null;
}

/** Alamat penyimpanan di bucket: dipisah per organisasi, nama unik supaya cache peramban tidak menampilkan foto lama. */
export const photoPath = (orgId: string, productId: string, type: ProductPhotoInput['contentType'], stamp: number) =>
  `cgpos/${orgId}/${productId}-${stamp}.${photoExt(type)}`;

declare function btoa(data: string): string; // ada di peramban dan Node 16+; paket ini tanpa tipe DOM

export function bytesToDataUri(p: ProductPhotoInput): string {
  let bin = '';
  for (let i = 0; i < p.data.length; i += 0x8000) bin += String.fromCharCode(...p.data.subarray(i, i + 0x8000));
  return `data:${p.contentType};base64,${btoa(bin)}`;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Trash2 } from 'lucide-react';
import { photoProblem, type ProductPhotoInput } from '@cgpos/shared';

const MAX_SIDE = 1024;

/** Perkecil gambar ke sisi terpanjang 1024 px sebagai JPEG, dan turunkan mutu sampai di bawah batas 1 MB. */
async function toJpegPhoto(source: CanvasImageSource, width: number, height: number): Promise<ProductPhotoInput | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const q of [0.8, 0.6, 0.4]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));
    if (!blob) return null;
    const photo: ProductPhotoInput = { data: new Uint8Array(await blob.arrayBuffer()), contentType: 'image/jpeg' };
    if (!photoProblem(photo)) return photo;
  }
  return null;
}

/**
 * Pengambil foto: kamera langsung (kamera belakang bila ada) dengan tombol Ambil foto, atau pilih berkas gambar bila kamera tidak tersedia.
 * Hasilnya JPEG kecil lewat `onChange`; `null` = foto dibuang.
 */
export function PhotoCapture({ value, onChange, label = 'Foto bukti', required = false }: {
  value: ProductPhotoInput | null; onChange: (p: ProductPhotoInput | null) => void; label?: string; required?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'ready' | 'unavailable'>('idle');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const stop = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const url = URL.createObjectURL(new Blob([new Uint8Array(value.data)], { type: value.contentType }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function start() {
    setErr(''); stop();
    if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); setErr('Kamera tidak tersedia di perangkat ini. Pilih berkas foto.'); return; }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setState('ready');
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined); } });
    } catch { setState('unavailable'); setErr('Kamera tidak bisa dibuka (izin ditolak atau tidak ada). Pilih berkas foto.'); }
  }
  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setErr('Kamera belum siap. Coba lagi sebentar.'); return; }
    const photo = await toJpegPhoto(v, v.videoWidth, v.videoHeight);
    if (!photo) { setErr('Foto gagal diproses atau terlalu besar. Coba lagi.'); return; }
    stop(); setState('idle'); onChange(photo);
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    setErr('');
    try {
      const bmp = await createImageBitmap(file);
      const photo = await toJpegPhoto(bmp, bmp.width, bmp.height);
      bmp.close();
      if (!photo) { setErr('Foto gagal diproses atau terlalu besar.'); return; }
      onChange(photo);
    } catch { setErr('Berkas ini bukan gambar yang bisa dibaca.'); }
  }

  return (
    <div className="grid gap-8 min-w-0" data-testid="photo-capture">
      <span className="text-sm">{label}{required ? ' (wajib)' : ' (opsional)'}</span>
      {preview && (
        <div className="relative w-fit max-w-full">
          <img src={preview} alt="Foto bukti yang dipilih" className="max-h-[160px] max-w-full rounded-md border border-border" />
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm absolute top-4 right-4 bg-surface" onClick={() => onChange(null)} aria-label="Buang foto"><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
        </div>
      )}
      {state === 'ready' && (
        <div className="grid gap-8">
          <video ref={videoRef} className="w-full max-h-[240px] rounded-md bg-black" playsInline muted aria-label="Pratinjau kamera" />
          <div className="flex gap-8"><button type="button" className="cg-btn cg-btn--primary" onClick={snap}><Camera className="cg-icon cg-icon--sm" aria-hidden /> Ambil foto</button><button type="button" className="cg-btn cg-btn--ghost" onClick={() => { stop(); setState('idle'); }}>Batal</button></div>
        </div>
      )}
      {state !== 'ready' && (
        <div className="flex flex-wrap gap-8">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={start} disabled={state === 'starting'}>{value ? <><RefreshCw className="cg-icon cg-icon--sm" aria-hidden /> Ganti foto</> : <><Camera className="cg-icon cg-icon--sm" aria-hidden /> Buka kamera</>}</button>
          <label className="cg-btn cg-btn--ghost cursor-pointer">Pilih berkas<input type="file" accept="image/*" className="cg-sr" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-danger-strong">{err}</p>}
    </div>
  );
}

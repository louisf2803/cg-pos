import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Delete, RefreshCw, RotateCcw, UserCheck, VideoOff } from 'lucide-react';
import {
  attendanceActionSuccessText,
  attendanceErrorText,
  attendanceOpenMinutes,
  formatAttendanceTime,
  formatDuration,
  PHOTO_MAX_BYTES,
  photoProblem,
  ROLE_LABEL,
  SELFIE_JPEG_QUALITY,
  SELFIE_MAX_SIDE,
  selfieTargetSize,
  type AttendanceOpen,
  type Employee,
  type OutletContext,
  type ProductPhotoInput,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useOnline } from '../lib/online';

const REFRESH_MS = 30_000;
const PIN_LEN = 6;

interface AttendanceProps {
  ctx: OutletContext;
  onClose: () => void;
}

/**
 * Layar absensi karyawan POS, satu layar: kamera depan selalu tampil di kiri dan WAJIB (foto diambil otomatis saat Clock in/out),
 * di kanan pilih nama pegawai, isi PIN 6 digit, lalu tekan Clock in atau Clock out. Jam dicatat server.
 */
/** GPS perangkat untuk radius absensi. Kosong bila tidak ada izin atau waktu habis; server yang memutuskan apakah lokasi wajib. */
function readPosition(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export function Attendance({ ctx, onClose }: AttendanceProps) {
  const data = useData();
  const online = useOnline();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openMap, setOpenMap] = useState<Map<string, AttendanceOpen>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [cameraMessage, setCameraMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startToken = useRef(0);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(() => {
    stopCamera();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setCameraMessage('Perangkat atau peramban ini tidak mendukung kamera. Absensi membutuhkan kamera depan.');
      return;
    }
    const token = ++startToken.current;
    setCameraState('starting');
    setCameraMessage('');
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (token !== startToken.current) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        setCameraState('ready');
      })
      .catch(() => {
        if (token !== startToken.current) return;
        setCameraState('unavailable');
        setCameraMessage('Kamera tidak tersedia atau izin ditolak. Izinkan akses kamera di peramban, lalu coba lagi.');
      });
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      startToken.current += 1;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (cameraState === 'ready' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraState]);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [emps, openList] = await Promise.all([data.listEmployees(), data.attendanceOpen()]);
      setEmployees(emps);
      setOpenMap(new Map(openList.map((o) => [o.employeeId, o])));
      setNowMs(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data absensi belum bisa dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data]);

  useEffect(() => {
    void load(false);
    const t = setInterval(() => {
      setNowMs(Date.now());
      void load(true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const employee = useMemo(() => employees.find((e) => e.id === employeeId) ?? null, [employees, employeeId]);
  const openEntry = employee ? openMap.get(employee.id) : undefined;
  const openCount = useMemo(() => employees.filter((e) => openMap.has(e.id)).length, [employees, openMap]);

  const press = useCallback((d: string) => {
    setActionError('');
    setPin((p) => (p.length >= PIN_LEN ? p : p + d));
  }, []);
  const eraseDigit = useCallback(() => {
    setActionError('');
    setPin((p) => p.slice(0, -1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (/^\d$/.test(e.key) && !typing) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace' && !typing) eraseDigit();
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, eraseDigit, onClose]);

  /** Ambil satu gambar dari video yang sedang tampil; null bila kamera belum siap atau hasilnya tidak sah. */
  async function captureFrame(): Promise<ProductPhotoInput | null> {
    const video = videoRef.current;
    if (!video || cameraState !== 'ready') return null;
    const { width, height } = selfieTargetSize(video.videoWidth || 640, video.videoHeight || 480, SELFIE_MAX_SIDE);
    if (width <= 0 || height <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    const toJpegBlob = (quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
    let blob = await toJpegBlob(SELFIE_JPEG_QUALITY);
    if (blob && blob.size > PHOTO_MAX_BYTES) blob = await toJpegBlob(0.5);
    if (!blob) return null;
    const photo: ProductPhotoInput = { data: new Uint8Array(await blob.arrayBuffer()), contentType: 'image/jpeg' };
    return photoProblem(photo) ? null : photo;
  }

  async function run(kind: 'in' | 'out') {
    if (!employee || pin.length !== PIN_LEN || busy) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const photo = await captureFrame();
      if (!photo) {
        setActionError('Foto dari kamera belum bisa diambil. Pastikan kamera menyala dan wajah terlihat, lalu coba lagi.');
        return;
      }
      if (kind === 'out') {
        const res = await data.attendanceClockOut(employee.id, pin, photo);
        setNotice(attendanceActionSuccessText({ kind: 'out', employeeName: employee.name, clockInAt: res.clockInAt, clockOutAt: res.clockOutAt, timeZone: ctx.timezone }));
      } else {
        const res = await data.attendanceClockIn(employee.id, pin, photo, await readPosition());
        setNotice(attendanceActionSuccessText({ kind: 'in', employeeName: employee.name, clockInAt: res.clockInAt, timeZone: ctx.timezone }));
      }
      setEmployeeId('');
      void load(true);
    } catch (err) {
      const mapped = attendanceErrorText(err);
      setActionError(mapped.kind === 'bad_pin' ? 'PIN salah' : mapped.message);
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  const ready = !!employee && pin.length === PIN_LEN && cameraState === 'ready' && online && !busy;
  const canIn = ready && !openEntry;
  const canOut = ready && !!openEntry;
  const elapsed = openEntry ? attendanceOpenMinutes(openEntry.clockInAt, new Date(nowMs)) : 0;

  return (
    <div className="fixed inset-0 z-40 bg-surface flex flex-col min-w-0">
      <header className="bg-shell-bg text-white border-b border-white/15 flex items-center justify-between gap-8 px-12 py-8 min-h-[56px] shrink-0">
        <div className="flex items-center gap-8 min-w-0">
          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center gap-6 shrink-0 cursor-pointer"
            onClick={onClose}
            aria-label="Kembali dari absensi"
          >
            <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
            <span className="text-sm font-semibold">Kembali</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm tablet:text-base font-bold leading-tight truncate">Absensi Karyawan</h1>
            <p className="text-[11px] opacity-85 truncate">{ctx.outletName}</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-6 px-10 py-6 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-semibold shrink-0 cursor-pointer"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          aria-label="Segarkan daftar absensi"
        >
          <RefreshCw className={`cg-icon cg-icon--xs ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          <span className="hidden tablet:inline">Segarkan</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-16">
        <div className="max-w-[980px] mx-auto grid gap-16 min-w-0">
          {notice && (
            <div className="cg-banner bg-accent-soft text-accent-strong border border-accent/25 flex items-center justify-between gap-8" role="status">
              <span className="flex items-center gap-8 min-w-0 font-medium">
                <CheckCircle2 className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                <span className="break-words">{notice}</span>
              </span>
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={() => setNotice('')} aria-label="Tutup pesan sukses">
                Tutup
              </button>
            </div>
          )}

          {error && (
            <div className="cg-banner cg-banner--danger flex items-center justify-between gap-8" role="alert">
              <span className="break-words">{error}</span>
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm shrink-0" onClick={() => void load(false)}>
                Coba lagi
              </button>
            </div>
          )}

          <div className="grid gap-16 tablet:grid-cols-2 min-w-0">
            {/* Kiri: kamera (wajib) */}
            <section className="grid gap-8 content-start min-w-0" aria-label="Kamera absensi">
              <div className="relative rounded-lg border border-border bg-black overflow-hidden min-w-0" style={{ aspectRatio: '4 / 3' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraState === 'ready' ? '' : 'hidden'}`}
                  aria-label="Pratinjau kamera depan"
                />
                {cameraState === 'starting' && (
                  <div className="cg-skeleton absolute inset-0 w-full h-full" aria-busy="true" aria-label="Membuka kamera depan" />
                )}
                {cameraState === 'unavailable' && (
                  <div className="absolute inset-0 grid place-items-center p-16 text-center text-white gap-8 content-center">
                    <VideoOff className="cg-icon cg-icon--lg mx-auto" aria-hidden />
                    <p className="text-sm break-words" role="alert">{cameraMessage}</p>
                    <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm mx-auto" onClick={startCamera}>
                      <RotateCcw className="cg-icon cg-icon--xs" aria-hidden />
                      <span>Coba kamera lagi</span>
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Kamera wajib menyala. Foto diambil otomatis saat Anda menekan Clock in atau Clock out.
              </p>
            </section>

            {/* Kanan: nama, PIN, Clock in / Clock out */}
            <section className="grid gap-12 content-start min-w-0" aria-label="Form absensi">
              {loading ? (
                <div className="grid gap-8" aria-busy="true" aria-label="Memuat daftar karyawan">
                  {[0, 1].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}
                </div>
              ) : employees.length === 0 ? (
                <div className="cg-empty">
                  <h3>Belum ada karyawan</h3>
                  <p className="text-text-muted">Tambahkan karyawan di dashboard terlebih dahulu.</p>
                </div>
              ) : (
                <>
                  <label className="grid gap-4 min-w-0">
                    <span className="text-sm font-semibold">Nama pegawai</span>
                    <select
                      className="cg-input"
                      value={employeeId}
                      onChange={(e) => { setEmployeeId(e.target.value); setPin(''); setActionError(''); setNotice(''); }}
                      disabled={busy}
                    >
                      <option value="">Pilih nama pegawai…</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({ROLE_LABEL[emp.role]}){openMap.has(emp.id) ? ' · sedang masuk' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  {employee && (
                    <div className="flex flex-wrap items-center gap-8 text-sm min-w-0" role="status">
                      {openEntry ? (
                        <span className="inline-flex items-center gap-6 px-8 py-4 rounded-md bg-accent-soft text-accent-strong text-xs font-medium">
                          <Clock className="cg-icon cg-icon--xs shrink-0" aria-hidden />
                          <span>Masuk {formatAttendanceTime(openEntry.clockInAt, ctx.timezone)} (lama: {formatDuration(elapsed)})</span>
                        </span>
                      ) : (
                        <span className="cg-badge">Belum masuk</span>
                      )}
                    </div>
                  )}

                  <div className="grid gap-8">
                    <span className="text-sm font-semibold">PIN (6 digit)</span>
                    <div className="cg-pin" data-error={!!actionError} role="img" aria-label={`${pin.length} dari ${PIN_LEN} digit terisi`}>
                      {Array.from({ length: PIN_LEN }, (_, i) => <i key={i} data-filled={i < pin.length} />)}
                    </div>
                    <div className="cg-keypad">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                        <button key={d} type="button" onClick={() => press(d)} disabled={busy}>{d}</button>
                      ))}
                      <span />
                      <button type="button" onClick={() => press('0')} disabled={busy}>0</button>
                      <button type="button" onClick={eraseDigit} aria-label="Hapus digit terakhir" disabled={busy}>
                        <Delete className="cg-icon" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <p role="status" className="min-h-[24px] text-sm">
                    {actionError ? <span className="text-danger-strong">{actionError}</span> : null}
                  </p>
                  {!online && (
                    <p className="cg-banner cg-banner--warning" role="status">Tidak ada koneksi, absensi membutuhkan koneksi ke server.</p>
                  )}

                  <div className="grid grid-cols-2 gap-8">
                    <button type="button" className="cg-btn cg-btn--primary" onClick={() => void run('in')} disabled={!canIn}>
                      {busy ? 'Memproses…' : 'Clock in'}
                    </button>
                    <button type="button" className="cg-btn cg-btn--secondary" onClick={() => void run('out')} disabled={!canOut}>
                      {busy ? 'Memproses…' : 'Clock out'}
                    </button>
                  </div>
                  {!employee && <p className="text-xs text-text-muted">Pilih nama pegawai, isi PIN, lalu tekan Clock in atau Clock out.</p>}
                  {employee && !canIn && !canOut && !busy && (
                    <p className="text-xs text-text-muted">
                      {cameraState !== 'ready' ? 'Menunggu kamera menyala.' : pin.length < PIN_LEN ? 'Isi PIN 6 digit.' : ''}
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center gap-8 text-xs text-text-muted">
                <UserCheck className="cg-icon cg-icon--xs text-accent" aria-hidden />
                <span>Sedang masuk: <strong>{openCount}</strong> dari {employees.length}</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

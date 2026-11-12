import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Clock, RefreshCw, RotateCcw, Search, UserCheck, VideoOff } from 'lucide-react';
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
import { Modal } from '../ui';
import { PinPad } from './PinPad';

const REFRESH_MS = 30_000;

interface AttendanceProps {
  ctx: OutletContext;
  onClose: () => void;
}

/** Layar absensi karyawan POS: status masuk/pulang real-time, PIN 6 digit, dan selfie opsional. */
export function Attendance({ ctx, onClose }: AttendanceProps) {
  const data = useData();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openMap, setOpenMap] = useState<Map<string, AttendanceOpen>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<Employee | null>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selected) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q) || ROLE_LABEL[e.role].toLowerCase().includes(q));
  }, [employees, query]);

  const openCount = useMemo(() => employees.filter((e) => openMap.has(e.id)).length, [employees, openMap]);

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
        <div className="max-w-[760px] mx-auto grid gap-16 min-w-0">
          {notice && (
            <div className="cg-banner bg-accent-soft text-accent-strong border border-accent/25 flex items-center justify-between gap-8" role="status">
              <span className="flex items-center gap-8 min-w-0 font-medium">
                <CheckCircle2 className="cg-icon cg-icon--sm shrink-0" aria-hidden />
                <span className="break-words">{notice}</span>
              </span>
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm shrink-0"
                onClick={() => setNotice('')}
                aria-label="Tutup pesan sukses"
              >
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

          <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
            <label className="cg-search flex-1 min-w-[200px] m-0">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <span className="cg-sr">Cari nama karyawan</span>
              <input
                type="search"
                className="cg-input"
                placeholder="Cari nama atau peran karyawan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="flex items-center gap-8 text-xs text-text-muted shrink-0">
              <UserCheck className="cg-icon cg-icon--xs text-accent" aria-hidden />
              <span>Sedang masuk: <strong>{openCount}</strong> dari {employees.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-8" aria-busy="true" aria-label="Memuat daftar karyawan">
              {[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 68 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="cg-empty">
              <h3>{employees.length === 0 ? 'Belum ada karyawan' : 'Karyawan tidak ditemukan'}</h3>
              <p className="text-text-muted">
                {employees.length === 0
                  ? 'Tambahkan karyawan di dashboard terlebih dahulu.'
                  : 'Coba ubah kata kunci pencarian Anda.'}
              </p>
            </div>
          ) : (
            <ul className="grid gap-8" aria-label="Daftar absensi karyawan">
              {filtered.map((emp) => {
                const open = openMap.get(emp.id);
                const mins = open ? attendanceOpenMinutes(open.clockInAt, new Date(nowMs)) : 0;
                const timeLabel = open ? formatAttendanceTime(open.clockInAt, ctx.timezone) : '';
                const statusText = open
                  ? `Sedang masuk sejak ${timeLabel} (lama: ${formatDuration(mins)})`
                  : 'Belum masuk';
                return (
                  <li key={emp.id}>
                    <button
                      type="button"
                      className="w-full flex flex-wrap items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised hover:border-accent text-left transition-colors cursor-pointer"
                      onClick={() => { setNotice(''); setSelected(emp); }}
                      aria-label={`${emp.name}, ${ROLE_LABEL[emp.role]}, ${statusText}. Ketuk untuk ${open ? 'absen pulang' : 'absen masuk'}`}
                    >
                      <div className="min-w-0 flex-1 grid gap-4">
                        <div className="flex flex-wrap items-center gap-8 min-w-0">
                          <strong className="text-sm text-text break-words">{emp.name}</strong>
                          <span className="text-xs text-text-muted">{ROLE_LABEL[emp.role]}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-6">
                          {open ? (
                            <span className="inline-flex items-center gap-6 px-8 py-4 rounded-md bg-accent-soft text-accent-strong text-xs font-medium text-left">
                              <Clock className="cg-icon cg-icon--xs shrink-0" aria-hidden />
                              <span>{statusText}</span>
                            </span>
                          ) : (
                            <span className="cg-badge">Belum masuk</span>
                          )}
                        </div>
                      </div>
                      <span className={`cg-btn cg-btn--sm shrink-0 ${open ? 'cg-btn--secondary' : 'cg-btn--primary'}`}>
                        {open ? 'Pulang' : 'Masuk'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {selected && (
        <AttendanceActionDialog
          ctx={ctx}
          employee={selected}
          openEntry={openMap.get(selected.id)}
          nowMs={nowMs}
          onClose={() => setSelected(null)}
          onDone={(msg) => {
            setSelected(null);
            setNotice(msg);
            void load(true);
          }}
        />
      )}
    </div>
  );
}

function AttendanceActionDialog({
  ctx,
  employee,
  openEntry,
  nowMs,
  onClose,
  onDone,
}: {
  ctx: OutletContext;
  employee: Employee;
  openEntry?: AttendanceOpen;
  nowMs: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const data = useData();
  const online = useOnline();
  const isClockOut = !!openEntry;
  const actionLabel = isClockOut ? 'Pulang' : 'Masuk';

  const [step, setStep] = useState<'prep' | 'pin'>('prep');
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'captured' | 'skipped' | 'unavailable'>('starting');
  const [cameraMessage, setCameraMessage] = useState('');
  const [photo, setPhoto] = useState<ProductPhotoInput | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [capturing, setCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string>('');
  const cancelRequestRef = useRef<(() => void) | null>(null);

  const stopCamera = useCallback(() => {
    cancelRequestRef.current?.();
    cancelRequestRef.current = null;
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setPreviewUrl('');
    setPhoto(null);
  }, []);

  const startCamera = useCallback(() => {
    stopCamera();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setCameraMessage('Peramban atau perangkat tidak mendukung kamera depan. Absensi tetap dapat dilanjutkan tanpa foto.');
      return () => {};
    }
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    cancelRequestRef.current = cancel;
    setCameraState('starting');
    setCameraMessage('');

    void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setCameraState('unavailable');
        setCameraMessage('Kamera tidak tersedia atau izin ditolak. Absensi tetap dapat dilanjutkan tanpa foto.');
      });

    return cancel;
  }, [stopCamera]);

  useEffect(() => {
    if (step !== 'prep') {
      stopCamera();
      return;
    }
    if (cameraState === 'captured' || cameraState === 'skipped' || cameraState === 'unavailable') {
      return;
    }
    const cancel = startCamera();
    return () => {
      cancel();
      stopCamera();
    };
    // Sengaja hanya dijalankan ulang saat masuk ke step prep / butuh memulai kamera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (cameraState === 'ready' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraState]);

  useEffect(() => () => {
    stopCamera();
    clearPreview();
  }, [stopCamera, clearPreview]);

  async function captureSelfie() {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);
    setCameraMessage('');
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const { width, height } = selfieTargetSize(vw, vh, SELFIE_MAX_SIDE);
      if (width <= 0 || height <= 0) {
        setCameraMessage('Kamera belum siap menampilkan gambar. Coba lagi atau lewati foto.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        setCameraMessage('Gagal memproses foto dari kamera. Silakan lewati foto.');
        return;
      }
      context.drawImage(video, 0, 0, width, height);

      const toJpegBlob = (quality: number) =>
        new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));

      let blob = await toJpegBlob(SELFIE_JPEG_QUALITY);
      if (blob && blob.size > PHOTO_MAX_BYTES) {
        blob = await toJpegBlob(0.5);
      }
      if (!blob) {
        setCameraMessage('Gagal mengambil gambar. Silakan ulangi atau lewati foto.');
        return;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const nextPhoto: ProductPhotoInput = { data: bytes, contentType: 'image/jpeg' };
      const problem = photoProblem(nextPhoto);
      if (problem) {
        setCameraMessage(problem);
        return;
      }

      clearPreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPhoto(nextPhoto);
      stopCamera();
      setCameraState('captured');
    } finally {
      setCapturing(false);
    }
  }

  function handleRetake() {
    clearPreview();
    setCameraMessage('');
    startCamera();
  }

  function handleSkipPhoto() {
    stopCamera();
    clearPreview();
    setCameraState('skipped');
    setCameraMessage('Selfie dilewati. Absensi akan dicatat tanpa foto.');
  }

  function handleProceedPin() {
    stopCamera();
    setStep('pin');
  }

  const verifyAttendance = useCallback(async (pin: string): Promise<boolean> => {
    try {
      if (isClockOut) {
        const res = await data.attendanceClockOut(employee.id, pin, photo ?? undefined);
        onDone(attendanceActionSuccessText({
          kind: 'out',
          employeeName: employee.name,
          clockInAt: res.clockInAt,
          clockOutAt: res.clockOutAt,
          timeZone: ctx.timezone,
        }));
      } else {
        const res = await data.attendanceClockIn(employee.id, pin, photo ?? undefined);
        onDone(attendanceActionSuccessText({
          kind: 'in',
          employeeName: employee.name,
          clockInAt: res.clockInAt,
          timeZone: ctx.timezone,
        }));
      }
      return true;
    } catch (err) {
      const mapped = attendanceErrorText(err);
      if (mapped.kind === 'bad_pin') return false;
      throw err;
    }
  }, [ctx.timezone, data, employee.id, employee.name, isClockOut, onDone, photo]);

  const handleClose = useCallback(() => {
    stopCamera();
    clearPreview();
    onClose();
  }, [stopCamera, clearPreview, onClose]);

  const elapsed = openEntry ? attendanceOpenMinutes(openEntry.clockInAt, new Date(nowMs)) : 0;

  return (
    <Modal title={`Absen ${actionLabel} · ${employee.name}`} onClose={handleClose} labelledBy="att-modal-title">
      <div className="grid gap-16 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-8 text-sm">
          <span className="text-text-muted">{ROLE_LABEL[employee.role]}</span>
          {openEntry ? (
            <span className="cg-badge cg-badge--success">
              Masuk {formatAttendanceTime(openEntry.clockInAt, ctx.timezone)} · {formatDuration(elapsed)}
            </span>
          ) : (
            <span className="cg-badge">Belum masuk</span>
          )}
        </div>

        {step === 'prep' ? (
          <>
            <section className="grid gap-12 p-12 rounded-md border border-border bg-surface min-w-0" aria-label="Selfie opsional">
              <div className="flex items-center justify-between gap-8">
                <strong className="text-sm">Selfie (opsional)</strong>
                {photo && (
                  <span className="cg-badge cg-badge--success">
                    Siap ({Math.max(1, Math.round(photo.data.byteLength / 1024))} KB)
                  </span>
                )}
              </div>

              {cameraState === 'starting' && (
                <div className="cg-skeleton w-full" style={{ height: 180 }} aria-busy="true" aria-label="Membuka kamera depan" />
              )}

              {cameraState === 'ready' && (
                <div className="grid gap-8">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-md border border-border bg-black object-cover"
                    style={{ maxHeight: 220 }}
                  />
                  <div className="flex flex-wrap gap-8">
                    <button
                      type="button"
                      className="cg-btn cg-btn--secondary flex-1"
                      onClick={() => void captureSelfie()}
                      disabled={capturing}
                    >
                      <Camera className="cg-icon cg-icon--sm" aria-hidden />
                      <span>{capturing ? 'Mengambil…' : 'Ambil foto'}</span>
                    </button>
                    <button type="button" className="cg-btn cg-btn--ghost" onClick={handleSkipPhoto}>
                      Lewati foto
                    </button>
                  </div>
                </div>
              )}

              {cameraState === 'captured' && previewUrl && (
                <div className="grid gap-8">
                  <img
                    src={previewUrl}
                    alt={`Pratinjau selfie ${employee.name}`}
                    className="w-full rounded-md border border-border object-cover"
                    style={{ maxHeight: 220 }}
                  />
                  <div className="flex flex-wrap gap-8">
                    <button type="button" className="cg-btn cg-btn--secondary flex-1" onClick={handleRetake}>
                      <RotateCcw className="cg-icon cg-icon--sm" aria-hidden />
                      <span>Ulangi</span>
                    </button>
                    <button type="button" className="cg-btn cg-btn--ghost" onClick={handleSkipPhoto}>
                      Lewati foto
                    </button>
                  </div>
                </div>
              )}

              {(cameraState === 'unavailable' || cameraState === 'skipped') && (
                <div className="grid gap-8">
                  <div className="flex items-start gap-8 text-sm text-text-muted p-8 rounded border border-border bg-surface-raised" role="status">
                    <VideoOff className="cg-icon cg-icon--sm shrink-0 mt-2" aria-hidden />
                    <span className="break-words">{cameraMessage}</span>
                  </div>
                  <div className="flex flex-wrap gap-8">
                    <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={handleRetake}>
                      <RotateCcw className="cg-icon cg-icon--xs" aria-hidden />
                      <span>Coba kamera lagi</span>
                    </button>
                  </div>
                </div>
              )}

              {cameraMessage && cameraState !== 'unavailable' && cameraState !== 'skipped' && (
                <p role="alert" className="text-sm text-danger-strong">{cameraMessage}</p>
              )}
            </section>

            <div className="cg-modal__actions">
              <button type="button" className="cg-btn cg-btn--ghost" onClick={handleClose}>
                Batal
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--primary"
                data-autofocus=""
                onClick={handleProceedPin}
              >
                {actionLabel}
              </button>
            </div>
          </>
        ) : (
          <div className="grid gap-12">
            <div className="flex items-center justify-between gap-8 text-sm p-8 rounded border border-border bg-surface">
              <span>Masukkan PIN 6 digit untuk <strong>{actionLabel}</strong></span>
              <span className={`cg-badge ${photo ? 'cg-badge--success' : ''}`}>
                {photo ? 'Dengan selfie' : 'Tanpa foto'}
              </span>
            </div>

            {!online && (
              <p className="cg-banner cg-banner--warning" role="status">
                Tidak ada koneksi, absensi membutuhkan koneksi ke server.
              </p>
            )}

            <PinPad
              verify={verifyAttendance}
              onSuccess={() => {}}
              onBack={() => {
                setCameraState(photo ? 'captured' : 'skipped');
                if (!photo) setCameraMessage('Selfie dilewati. Absensi akan dicatat tanpa foto.');
                setStep('prep');
              }}
              backLabel="Kembali"
              badPinMessage="PIN salah"
              formatError={(err) => attendanceErrorText(err).message}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

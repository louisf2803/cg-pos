'use client';

import { useEffect, useState } from 'react';
import {
  MapPin,
  LocateFixed,
  Camera,
  ShieldAlert,
  AlertCircle,
  Compass,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import type { AttendanceRadiusMode, AttendanceSettings } from '@cgpos/shared/src/hr';
import {
  attendanceSettingsProblem,
  distanceMeters,
} from '@cgpos/shared/src/hr';
import { evaluateLocationPreview } from '@cgpos/shared/src/hr-ui';

export default function RadiusAbsensiPage() {
  const data = useData();

  // Selected outlet
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');

  // Form fields
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [radiusM, setRadiusM] = useState<number>(50);
  const [mode, setMode] = useState<AttendanceRadiusMode>('block');
  const [requirePhoto, setRequirePhoto] = useState<boolean>(true);

  // Live test preview
  const [testLat, setTestLat] = useState<string>('');
  const [testLng, setTestLng] = useState<string>('');
  const [locating, setLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load data
  const contextAsync = useAsync(async () => {
    const ctx = await data.getContext();
    let outlets: { id: string; name: string }[] = [];
    try {
      if (typeof (data as unknown as { listStockLocations?: () => Promise<{ id: string; name: string }[]> }).listStockLocations === 'function') {
        const locs = await (data as unknown as { listStockLocations: () => Promise<{ id: string; name: string }[]> }).listStockLocations();
        if (locs.length > 0) {
          outlets = locs.map((l) => ({ id: l.id, name: l.name }));
        }
      }
    } catch {
      // fallback
    }
    if (outlets.length === 0) {
      outlets = [{ id: ctx.outletId || 'out-1', name: ctx.outletName || 'Outlet Utama' }];
    }

    const settingsList = await data.listAttendanceSettings();
    return { ctx, outlets, settingsList };
  }, [data]);

  const outlets: { id: string; name: string }[] = contextAsync.status === 'ready' ? contextAsync.data.outlets : [];
  const settingsList: AttendanceSettings[] = contextAsync.status === 'ready' ? contextAsync.data.settingsList : [];

  // Initialize selected outlet
  useEffect(() => {
    if (!selectedOutletId && outlets.length > 0 && outlets[0]) {
      setSelectedOutletId(outlets[0].id);
    }
  }, [outlets, selectedOutletId]);

  // Sync form when selectedOutletId changes or data refreshed
  useEffect(() => {
    if (!selectedOutletId) return;
    const existing = settingsList.find((s) => s.outletId === selectedOutletId);
    if (existing) {
      setLatitude(existing.latitude != null ? String(existing.latitude) : '');
      setLongitude(existing.longitude != null ? String(existing.longitude) : '');
      setRadiusM(existing.radiusM ?? 50);
      setMode(existing.mode ?? 'block');
      setRequirePhoto(existing.requirePhoto ?? true);
    } else {
      setLatitude('');
      setLongitude('');
      setRadiusM(50);
      setMode('block');
      setRequirePhoto(true);
    }
    setErrorBanner(null);
  }, [selectedOutletId, settingsList]);

  // GPS Geolocation Handler for Outlet Location
  const handleGetDeviceLocation = () => {
    setGeoError(null);
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoError('Peramban Anda tidak mendukung penentuan lokasi GPS (Geolocation).');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setLocating(false);
        setToastMsg('Koordinat outlet berhasil diisi dari posisi perangkat Anda.');
      },
      (err) => {
        setLocating(false);
        setGeoError(`Gagal membaca posisi GPS: ${err.message}. Pastikan izin lokasi aktif.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // GPS Geolocation Handler for Test Point
  const handleGetTestLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoError('Peramban Anda tidak mendukung penentuan lokasi GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTestLat(String(pos.coords.latitude));
        setTestLng(String(pos.coords.longitude));
      },
      (err) => {
        setGeoError(`Gagal membaca posisi GPS uji: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Evaluate preview
  const numOutletLat = latitude.trim() !== '' ? Number(latitude) : null;
  const numOutletLng = longitude.trim() !== '' ? Number(longitude) : null;
  const numTestLat = testLat.trim() !== '' ? Number(testLat) : null;
  const numTestLng = testLng.trim() !== '' ? Number(testLng) : null;

  const preview = (numOutletLat != null && numOutletLng != null && numTestLat != null && numTestLng != null)
    ? evaluateLocationPreview(numOutletLat, numOutletLng, numTestLat, numTestLng, radiusM)
    : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const latVal = latitude.trim() !== '' ? Number(latitude) : null;
    const lngVal = longitude.trim() !== '' ? Number(longitude) : null;
    const radVal = radiusM ? Number(radiusM) : null;

    const input = {
      outletId: selectedOutletId,
      latitude: latVal,
      longitude: lngVal,
      radiusM: radVal,
      mode,
      requirePhoto,
    };

    const problem = attendanceSettingsProblem(input);
    if (problem) {
      setErrorBanner(problem);
      return;
    }

    setSaving(true);
    try {
      await data.saveAttendanceSettings(input);
      setToastMsg('Pengaturan radius absensi dan lokasi outlet berhasil disimpan.');
      contextAsync.reload();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan absensi.');
    } finally {
      setSaving(false);
    }
  };

  const selectedOutletObj = outlets.find((o) => o.id === selectedOutletId);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Radius absensi & lokasi"
        subtitle="Atur titik koordinat GPS dan batas radius kehadiran untuk setiap outlet agar staf hanya dapat absen di area kerja."
      />

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setToastMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Honest Info Banner */}
      <div className="cg-card p-16 bg-surface border-border flex items-start gap-12 text-sm leading-relaxed text-text">
        <ShieldAlert className="cg-icon cg-icon--sm text-warning mt-4 shrink-0" aria-hidden />
        <div className="space-y-4">
          <p className="font-semibold text-text">Keterangan penting mengenai verifikasi lokasi GPS:</p>
          <p className="text-text-muted text-xs">
            Titik koordinat dikirim langsung dari perangkat seluler atau komputer kasir saat karyawan melakukan absensi masuk/pulang.
            Sistem radius ini berfungsi sebagai <strong>pembatas kelalaian lokasi</strong> dan pemastian kehadiran staf di lokasi fisik outlet, bukan perlindungan mutlak terhadap pemalsuan GPS perangkat yang dimodifikasi.
          </p>
        </div>
      </div>

      {/* Outlet Selector */}
      <div className="cg-card p-16 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12">
        <div className="space-y-4">
          <label htmlFor="select-outlet" className="text-xs font-semibold text-text-muted block">
            Pilih Outlet yang Dikonfigurasi
          </label>
          <p className="text-xs text-text">
            Setiap outlet dapat memiliki titik koordinat dan batas radius yang berbeda.
          </p>
        </div>
        <select
          id="select-outlet"
          className="cg-input text-sm min-w-[240px]"
          value={selectedOutletId}
          onChange={(e) => setSelectedOutletId(e.target.value)}
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {contextAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-24 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {contextAsync.status === 'ready' && selectedOutletObj && (
        <form onSubmit={handleSave} className="space-y-24">
          {errorBanner && (
            <div role="alert" className="cg-banner cg-banner--danger">
              <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              <span>{errorBanner}</span>
            </div>
          )}

          {geoError && (
            <div role="alert" className="cg-banner cg-banner--warning">
              <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              <span>{geoError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 desktop:grid-cols-2 gap-24">
            {/* Left: Outlet GPS & Radius Configuration */}
            <div className="cg-card p-24 space-y-20">
              <div className="border-b border-border pb-12 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-text">Titik Lokasi Outlet</h3>
                  <p className="text-xs text-text-muted">{selectedOutletObj.name}</p>
                </div>
                <button
                  type="button"
                  className="cg-btn cg-btn--secondary cg-btn--sm"
                  onClick={handleGetDeviceLocation}
                  disabled={locating}
                >
                  <LocateFixed className="cg-icon cg-icon--xs" aria-hidden />
                  <span>{locating ? 'Membaca GPS...' : 'Pakai lokasi saya sekarang'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
                <div className="space-y-4">
                  <label htmlFor="outlet-lat" className="text-xs font-semibold text-text-muted block">
                    Lintang (Latitude)
                  </label>
                  <input
                    id="outlet-lat"
                    type="number"
                    step="any"
                    className="cg-input w-full"
                    placeholder="-6.200000"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <label htmlFor="outlet-lng" className="text-xs font-semibold text-text-muted block">
                    Bujur (Longitude)
                  </label>
                  <input
                    id="outlet-lng"
                    type="number"
                    step="any"
                    className="cg-input w-full"
                    placeholder="106.816666"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label htmlFor="outlet-radius" className="text-xs font-semibold text-text-muted block">
                  Batas Radius Kehadiran (Meter)
                </label>
                <div className="flex items-center gap-12">
                  <input
                    id="outlet-radius"
                    type="number"
                    min={10}
                    max={5000}
                    step={1}
                    required
                    className="cg-input w-[140px] cg-num"
                    value={radiusM}
                    onChange={(e) => setRadiusM(Number(e.target.value))}
                  />
                  <span className="text-sm font-medium text-text">meter dari titik pusat</span>
                </div>
                <span className="text-[11px] text-text-muted block">
                  Rentang yang diperbolehkan: 10 meter hingga 5.000 meter (5 km). Bawaan standar: 50 m.
                </span>
              </div>

              {/* Mode Kebijakan Radius */}
              <div className="space-y-8 pt-12 border-t border-border">
                <label className="text-xs font-semibold text-text block">
                  Kebijakan Jika Karyawan Absen di Luar Radius
                </label>
                <div className="space-y-8">
                  <label className="flex items-start gap-12 p-12 rounded-lg border border-border hover:bg-surface cursor-pointer">
                    <input
                      type="radio"
                      name="radius-mode"
                      value="block"
                      checked={mode === 'block'}
                      onChange={() => setMode('block')}
                      className="mt-4"
                    />
                    <div>
                      <span className="font-bold text-sm text-text block">Blokir Absensi (Bawaan)</span>
                      <span className="text-xs text-text-muted block">
                        Karyawan ditolak melakukan absen masuk/pulang bila berada di luar radius atau jika lokasi GPS tidak diizinkan.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-12 p-12 rounded-lg border border-border hover:bg-surface cursor-pointer">
                    <input
                      type="radio"
                      name="radius-mode"
                      value="flag"
                      checked={mode === 'flag'}
                      onChange={() => setMode('flag')}
                      className="mt-4"
                    />
                    <div>
                      <span className="font-bold text-sm text-text block">Tandai Peringatan</span>
                      <span className="text-xs text-text-muted block">
                        Absensi tetap diterima, namun sistem mencatat selisih jarak meter dan memberi tanda peringatan di laporan kehadiran.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Wajib Foto */}
              <div className="pt-12 border-t border-border">
                <label className="flex items-center gap-12 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requirePhoto}
                    onChange={(e) => setRequirePhoto(e.target.checked)}
                    className="w-16 h-16 rounded text-accent"
                  />
                  <div className="flex items-center gap-8">
                    <Camera className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                    <span className="text-sm font-semibold text-text">Wajibkan foto selfie saat absensi</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Right: Interactive Distance Preview & Calculator */}
            <div className="cg-card p-24 space-y-20 bg-surface/40">
              <div className="border-b border-border pb-12">
                <h3 className="font-bold text-base text-text flex items-center gap-8">
                  <Compass className="cg-icon cg-icon--sm text-accent" aria-hidden />
                  Uji Pratinjau Jarak GPS
                </h3>
                <p className="text-xs text-text-muted">
                  Simulasikan koordinat posisi staf untuk melihat apakah posisi tersebut masuk ke dalam radius outlet.
                </p>
              </div>

              <div className="space-y-12">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-muted">Koordinat Titik Uji:</span>
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={handleGetTestLocation}
                  >
                    <MapPin className="cg-icon cg-icon--xs" aria-hidden />
                    <span>Ambil lokasi saat ini</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-12">
                  <input
                    type="number"
                    step="any"
                    placeholder="Lat Uji"
                    className="cg-input text-xs w-full"
                    value={testLat}
                    onChange={(e) => setTestLat(e.target.value)}
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Lng Uji"
                    className="cg-input text-xs w-full"
                    value={testLng}
                    onChange={(e) => setTestLng(e.target.value)}
                  />
                </div>

                {/* Live Result Box */}
                {preview ? (
                  <div
                    className={`p-16 rounded-xl border ${
                      preview.isInside
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-danger/10 border-danger/30 text-danger'
                    }`}
                  >
                    <div className="flex items-start gap-12">
                      {preview.isInside ? (
                        <CheckCircle2 className="cg-icon cg-icon--md shrink-0 mt-4" aria-hidden />
                      ) : (
                        <XCircle className="cg-icon cg-icon--md shrink-0 mt-4" aria-hidden />
                      )}
                      <div>
                        <p className="font-bold text-sm">{preview.message}</p>
                        <p className="text-xs text-text-muted mt-4">
                          {preview.isInside
                            ? 'Karyawan di titik ini diizinkan melakukan absensi masuk.'
                            : mode === 'block'
                            ? 'Karyawan di titik ini akan DIBLOKIR dari absensi masuk.'
                            : 'Karyawan di titik ini akan DITANDAI memiliki jarak di luar radius.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-16 rounded-xl border border-dashed border-border text-center text-xs text-text-muted">
                    Masukkan titik koordinat uji atau klik &quot;Ambil lokasi saat ini&quot; untuk menguji perhitungan jarak.
                  </div>
                )}
              </div>

              {/* Status summary box */}
              <div className="p-16 rounded-xl bg-surface border border-border space-y-8 text-xs text-text">
                <div className="flex justify-between">
                  <span className="text-text-muted">Outlet:</span>
                  <span className="font-bold">{selectedOutletObj.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Status Pengaturan:</span>
                  <span className={`font-semibold ${numOutletLat && numOutletLng ? 'text-success' : 'text-warning'}`}>
                    {numOutletLat && numOutletLng ? 'Koordinat Aktif' : 'Belum Diatur'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Batas Radius:</span>
                  <span className="font-semibold">{radiusM} meter</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Kebijakan Luar Radius:</span>
                  <span className="font-semibold capitalize">{mode === 'block' ? 'Blokir' : 'Tandai'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Verifikasi Foto:</span>
                  <span className="font-semibold">{requirePhoto ? 'Wajib' : 'Opsional'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-12 pt-16 border-t border-border">
            <button
              type="submit"
              className="cg-btn cg-btn--primary"
              disabled={saving}
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Radius'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

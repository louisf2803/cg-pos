import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  HardDrive,
  Monitor,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  accessFor,
  IDLE_LOCK_CHOICES,
  idleLockLabel,
  PERMISSIONS,
  ROLE_LABEL,
  type Access,
} from '@cgpos/shared';
import { useData, usePending } from '../lib/app-data';
import { openCustomerDisplayWindow } from '../lib/customer-display';
import {
  APP_MODES,
  devicePrefs,
  LOCAL_SERVER_ROLES,
  useDevicePrefs,
  VIEW_MODES,
} from '../lib/device-prefs';
import { useSession } from '../lib/session';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

const ACCESS_TEXT: Record<Access, string> = { allow: 'Boleh', approve: 'Perlu PIN manajer', deny: 'Tidak boleh' };

/** Pengaturan perangkat ini dan ringkasan hak akses peran yang sedang bertugas. */
export function DeviceSettings({ onClose }: { onClose: () => void }) {
  const data = useData();
  const pend = usePending();
  const { session } = useSession();
  const prefs = useDevicePrefs();
  const stations = useAsync(() => data.listPrintStations(), [data]);
  const role = session.employee.role;
  const canEdit = accessFor(role, 'device_settings') === 'allow';
  const activeStations = stations.status === 'ready' ? stations.data.filter((s) => s.isActive) : [];

  // State untuk uji koneksi dan sync pull
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs: number; message: string } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<{ ok: boolean; items: number; message: string } | null>(null);
  const [syncHistory, setSyncHistory] = useState(() => pend.getSyncHistory());

  async function handleTestConnection() {
    setTestingPing(true);
    setPingResult(null);
    const start = Date.now();
    try {
      await data.getContext();
      const ms = Date.now() - start;
      setPingResult({
        ok: true,
        latencyMs: ms,
        message: ms < 300 ? `Koneksi stabil (${ms} ms)` : `Koneksi terhubung (${ms} ms)`,
      });
    } catch {
      const ms = Date.now() - start;
      setPingResult({
        ok: false,
        latencyMs: ms,
        message: 'Koneksi terputus atau server tidak merespons (Offline)',
      });
    } finally {
      setTestingPing(false);
    }
  }

  async function handleSyncPull() {
    setPulling(true);
    setPullResult(null);
    try {
      const res = await pend.syncPull();
      setSyncHistory(pend.getSyncHistory());
      if (res.status === 'success') {
        setPullResult({
          ok: true,
          items: res.itemsPulled,
          message: `Berhasil menyinkronkan ${res.itemsPulled} data ke penyimpanan lokal (${res.durationMs} ms).`,
        });
      } else {
        setPullResult({
          ok: false,
          items: 0,
          message: res.error ?? 'Gagal menarik data dari server.',
        });
      }
    } catch (err) {
      setPullResult({
        ok: false,
        items: 0,
        message: err instanceof Error ? err.message : 'Gagal menarik data dari server.',
      });
    } finally {
      setPulling(false);
    }
  }

  return (
    <Modal title="Pengaturan perangkat" onClose={onClose} labelledBy="dev-title">
      <div className="grid gap-16 max-h-[70vh] overflow-y-auto pr-4">
        <div className="cg-field">
          <label className="cg-label" htmlFor="idle-lock">Kunci otomatis setelah diam</label>
          <select
            id="idle-lock"
            className="cg-input"
            value={prefs.idleLockMinutes}
            disabled={!canEdit}
            onChange={(e) => devicePrefs.set({ idleLockMinutes: Number(e.target.value) })}
          >
            {IDLE_LOCK_CHOICES.map((m) => <option key={m} value={m}>{idleLockLabel(m)}</option>)}
          </select>
          <p className="text-sm text-text-muted">
            {canEdit
              ? 'Layar meminta PIN lagi setelah tidak disentuh. Pesanan di layar tetap aman. Tidak terkunci selama offline. Berlaku untuk perangkat ini saja.'
              : 'Hanya manajer atau pemilik yang boleh mengubah ini.'}
          </p>
        </div>

        <fieldset className="grid gap-8 border-0 p-0 m-0" disabled={!canEdit}>
          <legend className="cg-label">Mode aplikasi perangkat</legend>
          {APP_MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-8 p-8 border border-border rounded cursor-pointer">
              <input
                type="radio"
                name="app-mode"
                className="mt-4"
                checked={prefs.appMode === m.id}
                onChange={() => devicePrefs.set({ appMode: m.id })}
              />
              <span>
                <strong className="block">{m.label}</strong>
                <span className="text-sm text-text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {prefs.appMode === 'kitchen' && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="kitchen-station-default">Stasiun dapur bawaan</label>
            <select
              id="kitchen-station-default"
              className="cg-input"
              value={prefs.kitchenStationId}
              disabled={!canEdit}
              onChange={(e) => devicePrefs.set({ kitchenStationId: e.target.value })}
            >
              <option value="all">Semua stasiun</option>
              {activeStations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <fieldset className="grid gap-8 border-0 p-0 m-0">
          <legend className="cg-label">Tampilan produk di kasir</legend>
          {VIEW_MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-8 p-8 border border-border rounded cursor-pointer">
              <input
                type="radio"
                name="view-mode"
                className="mt-4"
                checked={prefs.viewMode === m.id}
                onChange={() => devicePrefs.set({ viewMode: m.id })}
              />
              <span>
                <strong className="block">{m.label}</strong>
                <span className="text-sm text-text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Bagian Mode Server Lokal, Tes Koneksi & Sinkronisasi */}
        <section aria-labelledby="koneksi-offline-set" className="p-12 border border-border rounded grid gap-12 bg-surface">
          <div className="min-w-0">
            <h3 id="koneksi-offline-set" className="text-base font-semibold flex items-center gap-6">
              <Server className="cg-icon cg-icon--sm" aria-hidden /> Jaringan Outlet & Server Lokal
            </h3>
            <p className="text-sm text-text-muted mt-2">
              Atur peran perangkat di outlet (cloud langsung, server master, atau klien) dan sinkronkan data untuk berjualan tanpa internet.
            </p>
          </div>

          <fieldset className="grid gap-8 border-0 p-0 m-0" disabled={!canEdit}>
            <legend className="cg-label">Peran server perangkat ini</legend>
            {LOCAL_SERVER_ROLES.map((roleOpt) => (
              <label key={roleOpt.id} className="flex items-start gap-8 p-8 border border-border rounded cursor-pointer">
                <input
                  type="radio"
                  name="local-server-role"
                  className="mt-4"
                  checked={prefs.localServerRole === roleOpt.id}
                  onChange={() => devicePrefs.set({ localServerRole: roleOpt.id })}
                />
                <span>
                  <strong className="block">{roleOpt.label}</strong>
                  <span className="text-sm text-text-muted">{roleOpt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {prefs.localServerRole === 'client' && (
            <div className="cg-field">
              <label className="cg-label" htmlFor="local-server-host">Alamat IP / Host Server Master</label>
              <input
                id="local-server-host"
                className="cg-input"
                type="text"
                placeholder="Contoh: http://192.168.1.100:3000"
                value={prefs.localServerHost}
                disabled={!canEdit}
                onChange={(e) => devicePrefs.set({ localServerHost: e.target.value })}
              />
              <p className="text-sm text-text-muted">
                Masukkan URL server master di jaringan Wi-Fi outlet yang sama.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-8 items-center pt-4 border-t border-border">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              disabled={testingPing}
              onClick={handleTestConnection}
            >
              <Activity className="cg-icon cg-icon--sm" aria-hidden />
              {testingPing ? 'Menguji koneksi…' : 'Uji Koneksi'}
            </button>

            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              disabled={pulling}
              onClick={handleSyncPull}
            >
              <RefreshCw className={`cg-icon cg-icon--sm ${pulling ? 'animate-spin' : ''}`} aria-hidden />
              {pulling ? 'Menarik data…' : 'Tarik Data Terbaru (Sync Pull)'}
            </button>
          </div>

          {pingResult && (
            <div
              className={`p-8 rounded text-sm flex items-center gap-6 ${
                pingResult.ok ? 'bg-accent/10 text-accent-strong' : 'bg-danger/10 text-danger-strong'
              }`}
            >
              {pingResult.ok ? (
                <Wifi className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              ) : (
                <WifiOff className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              )}
              <span>{pingResult.message}</span>
            </div>
          )}

          {pullResult && (
            <div
              className={`p-8 rounded text-sm flex items-center gap-6 ${
                pullResult.ok ? 'bg-accent/10 text-accent-strong' : 'bg-danger/10 text-danger-strong'
              }`}
            >
              {pullResult.ok ? (
                <CheckCircle2 className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              ) : (
                <XCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
              )}
              <span>{pullResult.message}</span>
            </div>
          )}

          {/* Riwayat Sinkronisasi */}
          <div className="pt-8 border-t border-border">
            <h4 className="text-sm font-semibold mb-6 flex items-center gap-6">
              <HardDrive className="cg-icon cg-icon--xs" aria-hidden /> Riwayat Sinkronisasi Terakhir
            </h4>
            {syncHistory.length === 0 ? (
              <p className="text-xs text-text-muted">Belum ada riwayat sinkronisasi.</p>
            ) : (
              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-left">
                      <th className="py-4">Waktu</th>
                      <th className="py-4">Status</th>
                      <th className="py-4 text-right">Item</th>
                      <th className="py-4 text-right">Durasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.slice(0, 5).map((entry) => (
                      <tr key={entry.id} className="border-b border-border/50">
                        <td className="py-4">
                          {new Date(entry.timestamp).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-4">
                          <span
                            className={`cg-badge cg-badge--sm ${
                              entry.status === 'success' ? 'cg-badge--accent' : 'cg-badge--danger'
                            }`}
                          >
                            {entry.status === 'success' ? 'Sukses' : 'Gagal'}
                          </span>
                        </td>
                        <td className="py-4 text-right cg-num">{entry.itemsPulled}</td>
                        <td className="py-4 text-right cg-num">{entry.durationMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="layar-pelanggan-set" className="p-12 border border-border rounded grid gap-8 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="min-w-0">
              <h3 id="layar-pelanggan-set" className="text-base font-semibold">Layar Pelanggan Eksternal</h3>
              <p className="text-sm text-text-muted">Buka jendela kedua untuk monitor menghadap pelanggan; tersinkron otomatis dari kasir.</p>
            </div>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={() => openCustomerDisplayWindow()}
            >
              <Monitor className="cg-icon cg-icon--sm" aria-hidden /> Buka layar pelanggan
            </button>
          </div>
        </section>

        <section aria-labelledby="hak-akses">
          <h3 id="hak-akses" className="text-base mb-8">Hak akses {session.employee.name} ({ROLE_LABEL[role]})</h3>
          <dl className="grid gap-4">
            {PERMISSIONS.map((p) => {
              const a = accessFor(role, p.id);
              return (
                <div key={p.id} className="flex justify-between gap-12 py-4 border-b border-border text-sm">
                  <dt>{p.label}</dt>
                  <dd className={`font-semibold ${a === 'deny' ? 'text-danger-strong' : a === 'approve' ? 'text-warning-strong' : 'text-accent-strong'}`}>
                    {ACCESS_TEXT[a]}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--primary" onClick={onClose}>Selesai</button>
        </div>
      </div>
    </Modal>
  );
}

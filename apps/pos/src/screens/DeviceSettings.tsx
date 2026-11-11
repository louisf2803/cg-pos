import { Monitor } from 'lucide-react';
import {
  accessFor,
  IDLE_LOCK_CHOICES,
  idleLockLabel,
  PERMISSIONS,
  ROLE_LABEL,
  type Access,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { openCustomerDisplayWindow } from '../lib/customer-display';
import { APP_MODES, devicePrefs, useDevicePrefs, VIEW_MODES } from '../lib/device-prefs';
import { useSession } from '../lib/session';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';

const ACCESS_TEXT: Record<Access, string> = { allow: 'Boleh', approve: 'Perlu PIN manajer', deny: 'Tidak boleh' };

/** Pengaturan perangkat ini dan ringkasan hak akses peran yang sedang bertugas. */
export function DeviceSettings({ onClose }: { onClose: () => void }) {
  const data = useData();
  const { session } = useSession();
  const prefs = useDevicePrefs();
  const stations = useAsync(() => data.listPrintStations(), [data]);
  const role = session.employee.role;
  const canEdit = accessFor(role, 'device_settings') === 'allow';
  const activeStations = stations.status === 'ready' ? stations.data.filter((s) => s.isActive) : [];

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

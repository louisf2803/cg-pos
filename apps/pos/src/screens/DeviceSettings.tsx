import { accessFor, IDLE_LOCK_CHOICES, idleLockLabel, PERMISSIONS, ROLE_LABEL, type Access } from '@cgpos/shared';
import { useSession } from '../lib/session';
import { devicePrefs, useDevicePrefs, VIEW_MODES } from '../lib/device-prefs';
import { Modal } from '../ui';

const ACCESS_TEXT: Record<Access, string> = { allow: 'Boleh', approve: 'Perlu PIN manajer', deny: 'Tidak boleh' };

/** Pengaturan perangkat kasir ini dan ringkasan hak akses peran yang sedang bertugas. */
export function DeviceSettings({ onClose }: { onClose: () => void }) {
  const { session } = useSession();
  const prefs = useDevicePrefs();
  const role = session.employee.role;
  const canEdit = accessFor(role, 'device_settings') === 'allow';
  return (
    <Modal title="Pengaturan perangkat" onClose={onClose} labelledBy="perangkat-title">
      <div className="grid gap-16">
        <div className="cg-field">
          <label className="cg-label" htmlFor="kunci-layar">Kunci layar otomatis</label>
          <select id="kunci-layar" className="cg-input" value={prefs.idleLockMinutes} disabled={!canEdit} data-autofocus
            onChange={(e) => devicePrefs.set({ idleLockMinutes: Number(e.target.value) })}>
            {IDLE_LOCK_CHOICES.map((m) => <option key={m} value={m}>{m === 0 ? 'Mati' : `Setelah ${idleLockLabel(m)} tidak dipakai`}</option>)}
          </select>
          <p className="text-text-muted text-sm mt-4">
            {canEdit ? 'Layar meminta PIN lagi setelah tidak disentuh. Pesanan di layar tetap aman. Tidak terkunci selama offline. Berlaku untuk perangkat ini saja.' : 'Hanya manajer atau pemilik yang boleh mengubah ini.'}
          </p>
        </div>
        <fieldset className="grid gap-8 border border-border rounded-md p-12" data-testid="view-mode">
          <legend className="cg-label px-4">Tampilan produk di kasir</legend>
          {VIEW_MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-8 cursor-pointer">
              <input type="radio" name="view-mode" className="mt-4" checked={prefs.viewMode === m.id} onChange={() => devicePrefs.set({ viewMode: m.id })} />
              <span><span className="font-bold text-sm">{m.label}</span><span className="block text-text-muted text-sm">{m.hint}</span></span>
            </label>
          ))}
          <p className="text-text-muted text-sm">Berlaku untuk perangkat ini saja dan bisa diubah semua peran.</p>
        </fieldset>
        <section aria-labelledby="hak-akses">
          <h3 id="hak-akses" className="text-base mb-8">Hak akses {session.employee.name} ({ROLE_LABEL[role]})</h3>
          <ul className="grid gap-4">
            {PERMISSIONS.map((p) => {
              const a = accessFor(role, p.id);
              return (
                <li key={p.id} className="flex justify-between gap-12 text-sm">
                  <span className="min-w-0 break-words">{p.label}</span>
                  <span className={`cg-badge shrink-0 ${a === 'allow' ? 'cg-badge--accent' : a === 'approve' ? 'cg-badge--warning' : ''}`}>{ACCESS_TEXT[a]}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="cg-modal__actions"><button className="cg-btn cg-btn--primary" onClick={onClose}>Selesai</button></div>
      </div>
    </Modal>
  );
}

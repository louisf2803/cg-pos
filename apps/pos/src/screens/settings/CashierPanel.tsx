import { useEffect, useState } from 'react';
import { formatRp, type OutletOptions } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { useDevicePrefs, devicePrefs, VIEW_MODES, type ViewMode } from '../../lib/device-prefs';
import { Notice, PanelLoading, SectionTitle, SettingRow, Switch } from './common';

const toInt = (s: string): number | null => { const t = s.replace(/[^\d]/g, ''); return t === '' ? null : Number(t); };

/** Pengaturan Kasir: tampilan (milik perangkat ini) dan aturan buka tutup kasir, kas keluar, dan stok (milik outlet, disimpan di server). */
export function CashierPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const prefs = useDevicePrefs();
  const st = useAsync(() => data.getOutletSettings(), [data]);
  const [opts, setOpts] = useState<OutletOptions | null>(null);
  const [opening, setOpening] = useState('');
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (st.status !== 'ready') return;
    setOpts(st.data.options);
    setOpening(st.data.options.defaultOpeningCash != null ? String(st.data.options.defaultOpeningCash) : '');
    setLimit(st.data.options.cashOutDailyLimit != null ? String(st.data.options.cashOutDailyLimit) : '');
  }, [st.status === 'ready' ? st.data : null]);

  if (st.status === 'loading' || !opts) return <PanelLoading />;
  if (st.status === 'error') return <Notice kind="danger">{st.message}</Notice>;

  async function save() {
    if (!opts) return;
    setBusy(true); setMsg(null);
    try {
      await data.saveOutletOptions({ ...opts, defaultOpeningCash: toInt(opening), cashOutDailyLimit: toInt(limit) });
      setMsg({ kind: 'info', text: 'Pengaturan kasir tersimpan.' });
      st.reload();
    } catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Gagal menyimpan.' }); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <SectionTitle>Tampilan kasir (perangkat ini)</SectionTitle>
      <SettingRow label="Tampilan bawaan" hint={VIEW_MODES.find((m) => m.id === prefs.viewMode)?.hint}>
        <select className="cg-input" aria-label="Tampilan bawaan" value={prefs.viewMode} onChange={(e) => devicePrefs.set({ viewMode: e.target.value as ViewMode })}>
          {VIEW_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </SettingRow>

      <SectionTitle>Buka dan tutup kasir</SectionTitle>
      <SettingRow label="Wajib buka kasir sebelum menjual" hint="Penjualan baru hanya bisa dibuat setelah kasir dibuka.">
        <Switch checked={opts.requireOpenShift} label="Wajib buka kasir" disabled={!canEdit} onChange={(v) => setOpts({ ...opts, requireOpenShift: v })} />
      </SettingRow>
      <SettingRow label="Kas awal bawaan" hint="Terisi otomatis di layar buka kasir. Kosongkan bila kasir mengisi sendiri.">
        <input className="cg-input cg-num text-right w-[140px]" inputMode="numeric" aria-label="Kas awal bawaan" disabled={!canEdit} value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d]/g, ''))} placeholder="Tidak ada" />
      </SettingRow>

      <SectionTitle>Kas keluar</SectionTitle>
      <SettingRow label="Batas pengeluaran kas per hari" hint={limit ? `Maksimal ${formatRp(Number(limit))} per hari; dijaga server.` : 'Kosong = tanpa batas.'}>
        <input className="cg-input cg-num text-right w-[140px]" inputMode="numeric" aria-label="Batas pengeluaran kas per hari" disabled={!canEdit} value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} placeholder="Tanpa batas" />
      </SettingRow>

      <SectionTitle>Stok</SectionTitle>
      <SettingRow label="Izinkan stok minus" hint="Mati: penjualan atau pengeluaran stok yang melebihi sisa ditolak server.">
        <Switch checked={opts.allowNegativeStock} label="Izinkan stok minus" disabled={!canEdit} onChange={(v) => setOpts({ ...opts, allowNegativeStock: v })} />
      </SettingRow>

      <SectionTitle>Keamanan perangkat (perangkat ini)</SectionTitle>
      <SettingRow label="Kunci layar otomatis" hint="Layar terkunci bila tidak disentuh. 0 = tidak dikunci otomatis.">
        <input className="cg-input cg-num text-right w-[100px]" inputMode="numeric" aria-label="Menit sebelum layar terkunci" value={prefs.idleLockMinutes} onChange={(e) => devicePrefs.set({ idleLockMinutes: Number(e.target.value.replace(/[^\d]/g, '') || 0) })} />
        <span>menit</span>
      </SettingRow>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {canEdit ? (
        <div className="p-16"><button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan kasir'}</button></div>
      ) : <Notice>Hanya pemilik, admin, atau manajer yang bisa mengubah aturan outlet.</Notice>}
    </div>
  );
}

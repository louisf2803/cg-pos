import { useState } from 'react';
import { useDevicePrefs, devicePrefs } from '../../lib/device-prefs';
import { playChime } from '../../lib/sound';
import { DeviceListDialog } from '../device/DeviceListDialog';
import { DeviceSettings } from '../DeviceSettings';
import { Notice, SectionTitle, SettingRow, Switch } from './common';

/** Order online: status kanal. Pesanan dari kanal luar belum tersambung ke kasir ini, jadi semua kanal ditampilkan apa adanya. */
export function OnlineOrderPanel() {
  const channels = ['Aplikasi pelanggan CG POS', 'GrabFood', 'GoFood', 'ShopeeFood'];
  return (
    <div>
      <SectionTitle>Status order online</SectionTitle>
      {channels.map((c) => (
        <SettingRow key={c} label={c} hint="Lakukan integrasi terlebih dahulu"><span>Belum terintegrasi</span></SettingRow>
      ))}
      <Notice>Harga khusus kanal ojek online sudah bisa diatur di dashboard (Harga Ojol). Pesanan masuk otomatis dari kanal luar belum tersedia.</Notice>
    </div>
  );
}

/** Notifikasi suara: bunyi singkat saat pembayaran berhasil. Disimpan di perangkat ini. */
export function SoundPanel() {
  const prefs = useDevicePrefs();
  return (
    <div>
      <SectionTitle>Notifikasi suara (perangkat ini)</SectionTitle>
      <SettingRow label="Status" hint="Bunyi singkat saat pembayaran berhasil diproses.">
        <span>{prefs.soundEnabled ? 'Aktif' : 'Mati'}</span>
        <Switch checked={prefs.soundEnabled} label="Notifikasi suara" onChange={(v) => { devicePrefs.set({ soundEnabled: v }); if (v) playChime(); }} />
      </SettingRow>
      <SettingRow label="Coba bunyi" onClick={() => playChime(true)}><span className="text-accent">Putar</span></SettingRow>
    </div>
  );
}

/** Perangkat: daftar printer dan pemindai, serta pengaturan perangkat lain (kunci layar, tampilan, server lokal). */
export function DevicesPanel({ outletName }: { outletName: string }) {
  const [list, setList] = useState(false);
  const [more, setMore] = useState(false);
  return (
    <div>
      <SectionTitle>Perangkat</SectionTitle>
      <SettingRow label="Printer dan perangkat" hint="Tambah, cari, dan uji cetak perangkat yang terhubung." onClick={() => setList(true)}><span className="text-accent">Buka</span></SettingRow>
      <SettingRow label="Pengaturan perangkat lainnya" hint="Mode aplikasi, layar dapur, server lokal, tes koneksi, dan sinkronisasi." onClick={() => setMore(true)}><span className="text-accent">Buka</span></SettingRow>
      {list && <DeviceListDialog outletName={outletName} onClose={() => setList(false)} />}
      {more && <div className="fixed inset-0 z-50 bg-surface overflow-y-auto"><DeviceSettings onClose={() => setMore(false)} /></div>}
    </div>
  );
}

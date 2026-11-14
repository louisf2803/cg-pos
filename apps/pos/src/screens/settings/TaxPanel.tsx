import { useEffect, useState } from 'react';
import { type TaxSettings } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { Notice, PanelLoading, SectionTitle, SettingRow, Switch } from './common';

/** Pajak outlet: aktif atau mati, nama, tarif, dan apakah harga menu sudah termasuk pajak. Aturan per produk dan per jenis order diatur di dashboard. */
export function TaxPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const st = useAsync(() => data.getTaxSettings(), [data]);
  const [t, setT] = useState<TaxSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  useEffect(() => { if (st.status === 'ready') setT(st.data); }, [st.status === 'ready' ? st.data : null]);

  if (st.status === 'loading' || !t) return <PanelLoading />;
  if (st.status === 'error') return <Notice kind="danger">{st.message}</Notice>;

  async function save() {
    if (!t) return;
    setBusy(true); setMsg(null);
    try { await data.saveTaxSettings(t); setMsg({ kind: 'info', text: 'Pengaturan pajak tersimpan.' }); st.reload(); }
    catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Gagal menyimpan.' }); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <SectionTitle>Aktivasi pajak</SectionTitle>
      <SettingRow label="Status pajak" hint="Mengatur pengenaan pajak untuk setiap produk dan transaksi di outlet ini.">
        <span>{t.enabled ? 'Aktif' : 'Mati'}</span>
        <Switch checked={t.enabled} label="Status pajak" disabled={!canEdit} onChange={(v) => setT({ ...t, enabled: v })} />
      </SettingRow>
      {t.enabled && (
        <>
          <SettingRow label="Nama pajak"><input className="cg-input w-[180px]" aria-label="Nama pajak" maxLength={40} disabled={!canEdit} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></SettingRow>
          <SettingRow label="Tarif (%)"><input className="cg-input cg-num text-right w-[100px]" inputMode="decimal" aria-label="Tarif pajak persen" disabled={!canEdit} value={t.rate} onChange={(e) => setT({ ...t, rate: Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')) || 0 })} /></SettingRow>
          <SettingRow label="Harga menu sudah termasuk pajak" hint="Mati: pajak ditambahkan di atas harga menu.">
            <Switch checked={t.inclusive} label="Harga sudah termasuk pajak" disabled={!canEdit} onChange={(v) => setT({ ...t, inclusive: v })} />
          </SettingRow>
        </>
      )}
      <Notice>Pajak khusus per produk dan per jenis order diatur di dashboard (Pengaturan &gt; Pajak).</Notice>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {canEdit ? <div className="p-16"><button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pajak'}</button></div>
        : <Notice>Hanya pemilik, admin, atau manajer yang bisa mengubah pajak.</Notice>}
    </div>
  );
}

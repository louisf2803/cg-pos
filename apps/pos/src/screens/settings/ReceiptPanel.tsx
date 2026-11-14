import { useEffect, useState } from 'react';
import { type OutletOptions } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { Notice, PanelLoading, SectionTitle, SettingRow, Switch } from './common';

/** Struk kasir: teks kepala dan kaki serta bagian yang tampil. Templat lengkap (logo, QR, media sosial, lebar kertas) diatur di dashboard. */
export function ReceiptPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const st = useAsync(() => data.getOutletSettings(), [data]);
  const [o, setO] = useState<OutletOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  useEffect(() => { if (st.status === 'ready') setO(st.data.options); }, [st.status === 'ready' ? st.data : null]);

  if (st.status === 'loading' || !o) return <PanelLoading />;
  if (st.status === 'error') return <Notice kind="danger">{st.message}</Notice>;

  async function save() {
    if (!o) return;
    setBusy(true); setMsg(null);
    try { await data.saveOutletOptions(o); setMsg({ kind: 'info', text: 'Pengaturan struk tersimpan.' }); st.reload(); }
    catch (e) { setMsg({ kind: 'danger', text: e instanceof Error ? e.message : 'Gagal menyimpan.' }); }
    finally { setBusy(false); }
  }

  const header = o.receiptHeader ?? '';
  return (
    <div>
      <SectionTitle>Isi struk</SectionTitle>
      <div className="px-16 py-12 border-b border-border">
        <label className="block text-sm font-medium" htmlFor="rc-header">Teks kepala struk</label>
        <textarea id="rc-header" className="cg-input w-full mt-4" rows={3} maxLength={200} disabled={!canEdit} value={header} onChange={(e) => setO({ ...o, receiptHeader: e.target.value })} placeholder="Mis. nama toko atau slogan (maksimal 4 baris)" />
        <p className="text-xs text-text-muted mt-2 text-right cg-num">{header.length}/200</p>
      </div>
      <div className="px-16 py-12 border-b border-border">
        <label className="block text-sm font-medium" htmlFor="rc-footer">Teks kaki struk</label>
        <textarea id="rc-footer" className="cg-input w-full mt-4" rows={3} maxLength={200} disabled={!canEdit} value={o.receiptFooter} onChange={(e) => setO({ ...o, receiptFooter: e.target.value })} placeholder="Mis. ucapan terima kasih, Wi-Fi, atau jam buka" />
        <p className="text-xs text-text-muted mt-2 text-right cg-num">{o.receiptFooter.length}/200</p>
      </div>
      <SectionTitle>Bagian yang tampil</SectionTitle>
      <SettingRow label="Nama kasir"><Switch checked={o.receiptShowCashier !== false} label="Tampilkan nama kasir" disabled={!canEdit} onChange={(v) => setO({ ...o, receiptShowCashier: v })} /></SettingRow>
      <SettingRow label="Nama pelanggan"><Switch checked={o.receiptShowCustomer !== false} label="Tampilkan nama pelanggan" disabled={!canEdit} onChange={(v) => setO({ ...o, receiptShowCustomer: v })} /></SettingRow>
      <Notice>Logo, kode QR, media sosial, lebar kertas, dan bagian lain struk diatur di dashboard (Pengaturan &gt; Struk).</Notice>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {canEdit ? <div className="p-16"><button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan struk'}</button></div>
        : <Notice>Hanya pemilik, admin, atau manajer yang bisa mengubah struk.</Notice>}
    </div>
  );
}

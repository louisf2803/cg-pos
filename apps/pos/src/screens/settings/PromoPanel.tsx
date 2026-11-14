import { useState } from 'react';
import { describePromotion, formatRp, kindLabel, type Promotion } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { Notice, PanelLoading, SettingRow, Switch } from './common';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/** Promo: daftar promo outlet beserta periode dan syarat; pengelola bisa mengaktifkan atau menonaktifkan. Promo baru dibuat di dashboard. */
export function PromoPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const list = useAsync(() => data.listPromotions(), [data]);
  const [err, setErr] = useState('');

  if (list.status === 'loading') return <PanelLoading />;
  if (list.status === 'error') return <Notice kind="danger">{list.message}</Notice>;

  async function toggle(p: Promotion, v: boolean) {
    setErr('');
    try { await data.savePromotion({ id: p.id, name: p.name, kind: p.kind, value: p.value, minSpend: p.minSpend, productIds: p.productIds, freeProductId: p.freeProductId, orderTypes: p.orderTypes, startsAt: p.startsAt, endsAt: p.endsAt, isActive: v }); list.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Gagal mengubah promo.'); }
  }

  return (
    <div>
      {err && <Notice kind="danger">{err}</Notice>}
      {list.data.length === 0 ? <Notice>Belum ada promo. Buat promo di dashboard (Promosi).</Notice> : list.data.map((p) => (
        <SettingRow key={p.id} label={p.name} hint={`${kindLabel(p.kind)} · ${describePromotion(p)}${p.minSpend > 0 ? ` · minimal belanja ${formatRp(p.minSpend)}` : ''}${p.startsAt || p.endsAt ? ` · ${day(p.startsAt) || 'sejak awal'} – ${day(p.endsAt) || 'tanpa akhir'}` : ''}`}>
          <Switch checked={p.isActive} label={`Aktifkan ${p.name}`} disabled={!canEdit} onChange={(v) => toggle(p, v)} />
        </SettingRow>
      ))}
      <Notice>Promo baru, kupon, dan aturan lanjutan dibuat di dashboard (Promosi).</Notice>
    </div>
  );
}

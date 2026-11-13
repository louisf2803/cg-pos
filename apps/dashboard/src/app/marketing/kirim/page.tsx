'use client';

import { Fragment, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { CAMPAIGN_STATUS_LABEL, campaignAudience, describeCriteria, type Campaign, type CampaignRecipient } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { fmtDate, todayKey } from '@/components/fin-common';
import { CampaignDialog } from '@/components/kampanye/campaign-dialog';

export default function CampaignsPage() {
  const data = useData();
  const list = useAsync(() => data.listCampaigns(), [data]);
  const customers = useAsync(() => data.listCustomers({ limit: 5000 }), [data]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { const m = await fn(); if (m) setNotice(m); list.reload(); } catch (x) { setError(x instanceof Error ? x.message : 'Gagal memproses.'); } finally { setBusy(false); }
  }
  async function toggle(c: Campaign) {
    if (open === c.id) return setOpen(null);
    setError('');
    try { setRecipients(await data.listCampaignRecipients(c.id)); setOpen(c.id); } catch (x) { setError(x instanceof Error ? x.message : 'Gagal memuat penerima.'); }
  }
  async function mark(c: Campaign, r: CampaignRecipient) {
    await act(async () => { await data.markCampaignContact(c.id, r.customerId, !r.contacted); setRecipients(await data.listCampaignRecipients(c.id)); });
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Kirim kampanye marketing" subtitle="Susun kampanye, tentukan sasaran pelanggan, lalu catat siapa yang sudah dihubungi. Aplikasi tidak mengirim pesan; tim menghubungi pelanggan sendiri."
        actions={<button className="cg-btn cg-btn--primary" disabled={customers.status !== 'ready'} onClick={() => { setNotice(''); setCreating(true); }}><Megaphone className="cg-icon" aria-hidden /> Kampanye baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {error && <p role="alert" className="cg-banner cg-banner--danger mb-16">{error}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {list.status === 'ready' && list.data.length === 0 && <div className="cg-empty"><p><strong>Belum ada kampanye.</strong></p><p className="text-text-muted">Pilih Kampanye baru, misalnya untuk pelanggan yang berulang tahun bulan ini.</p></div>}
      {list.status === 'ready' && list.data.length > 0 && (
        <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Daftar kampanye">
          <thead><tr><th>Kampanye</th><th>Sasaran</th><th>Periode</th><th>Status</th><th className="text-right">Penerima</th><th className="text-right">Sudah dihubungi</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
          <tbody>{list.data.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td>{c.status !== 'draft' ? <button className="cg-btn cg-btn--ghost" aria-expanded={open === c.id} onClick={() => toggle(c)}>{c.name}</button> : c.name}</td>
                <td>{describeCriteria(c.criteria)}</td>
                <td>{c.startsOn ? fmtDate(c.startsOn) : '—'}{c.endsOn ? ` – ${fmtDate(c.endsOn)}` : ''}</td>
                <td><span className="cg-badge">{CAMPAIGN_STATUS_LABEL[c.status]}</span></td>
                <td className="text-right cg-num">{c.recipients}</td><td className="text-right cg-num">{c.contacted}</td>
                <td className="flex flex-wrap gap-8">
                  {c.status === 'draft' && customers.status === 'ready' && (
                    <button className="cg-btn cg-btn--primary" disabled={busy} onClick={() => act(async () => { const ids = campaignAudience(customers.data, c.criteria, todayKey()).map((x) => x.id); await data.launchCampaign(c.id, ids); return `Kampanye ${c.name} berjalan dengan ${ids.length} penerima.`; })}>Jalankan</button>
                  )}
                  {c.status === 'draft' && <button className="cg-btn cg-btn--ghost" disabled={busy} onClick={() => act(async () => { await data.deleteCampaign(c.id); return `Draf ${c.name} dihapus.`; })}>Hapus</button>}
                  {c.status === 'active' && <button className="cg-btn cg-btn--secondary" disabled={busy} onClick={() => act(async () => { await data.endCampaign(c.id); setOpen(null); return `Kampanye ${c.name} diakhiri.`; })}>Akhiri</button>}
                </td>
              </tr>
              {open === c.id && (
                <tr><td colSpan={7}>
                  {c.message && <p className="text-text-muted mb-8">Naskah: {c.message}</p>}
                  <ul className="grid gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={`Penerima ${c.name}`}>
                    {recipients.map((r) => (
                      <li key={r.customerId} className="flex items-center justify-between gap-12">
                        <span>{r.customerName}{r.phone ? ` · ${r.phone}` : ''}</span>
                        {c.status === 'active' ? (
                          <label className="flex gap-8 items-center"><input type="checkbox" checked={r.contacted} disabled={busy} onChange={() => mark(c, r)} /> Sudah dihubungi</label>
                        ) : <span className="text-text-muted">{r.contacted ? 'Sudah dihubungi' : 'Belum dihubungi'}</span>}
                      </li>
                    ))}
                  </ul>
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
      {creating && customers.status === 'ready' && <CampaignDialog customers={customers.data} onClose={() => setCreating(false)} onDone={(n) => { setCreating(false); setNotice(`Kampanye ${n} tersimpan.`); list.reload(); }} />}
    </div>
  );
}

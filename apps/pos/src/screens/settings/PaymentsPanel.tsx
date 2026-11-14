import { useState } from 'react';
import { CHANNEL_LABELS, formatRp, type PaymentChannelKind, type PaymentMethodConfig } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { Modal } from '../../ui';
import { Notice, PanelLoading, SettingRow, Switch } from './common';

const CHANNELS = Object.keys(CHANNEL_LABELS) as PaymentChannelKind[];

/** Pembayaran nontunai: daftar metode, aktif/nonaktif, biaya MDR, dan tambah metode baru. Metode bawaan tidak bisa dihapus. */
export function PaymentsPanel({ canEdit }: { canEdit: boolean }) {
  const data = useData();
  const list = useAsync(() => data.listPaymentMethodConfigs(), [data]);
  const [edit, setEdit] = useState<PaymentMethodConfig | 'new' | null>(null);
  const [err, setErr] = useState('');

  if (list.status === 'loading') return <PanelLoading />;
  if (list.status === 'error') return <Notice kind="danger">{list.message}</Notice>;
  const rows = list.data.filter((m) => m.baseKind !== 'cash');

  async function toggle(m: PaymentMethodConfig, v: boolean) {
    setErr('');
    try { await data.togglePaymentMethodActive(m.id, v); list.reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal mengubah status.'); }
  }

  return (
    <div>
      {canEdit && <div className="p-16"><button type="button" className="cg-btn cg-btn--secondary w-full" onClick={() => setEdit('new')}>Tambah pembayaran</button></div>}
      {err && <Notice kind="danger">{err}</Notice>}
      {rows.length === 0 ? <Notice>Belum ada metode pembayaran nontunai.</Notice> : rows.map((m) => (
        <SettingRow key={m.id} label={m.name} hint={`${CHANNEL_LABELS[m.channel] ?? m.channel}${m.feePct || m.feeFixed ? ` · biaya ${m.feePct}%${m.feeFixed ? ` + ${formatRp(m.feeFixed)}` : ''}` : ''}${m.accountName ? ` · ${m.accountName}` : ''}`} onClick={canEdit ? () => setEdit(m) : undefined}>
          <span onClick={(e) => e.stopPropagation()}><Switch checked={m.isActive} label={`Aktifkan ${m.name}`} disabled={!canEdit || m.baseKind === 'gateway'} onChange={(v) => toggle(m, v)} /></span>
        </SettingRow>
      ))}
      {edit && <MethodDialog method={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </div>
  );
}

function MethodDialog({ method, onClose, onSaved }: { method: PaymentMethodConfig | null; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const [name, setName] = useState(method?.name ?? '');
  const [code, setCode] = useState(method?.code ?? '');
  const [channel, setChannel] = useState<PaymentChannelKind>(method?.channel ?? 'edc');
  const [pct, setPct] = useState(String(method?.feePct ?? 0));
  const [fixed, setFixed] = useState(String(method?.feeFixed ?? 0));
  const [accName, setAccName] = useState(method?.accountName ?? '');
  const [accNo, setAccNo] = useState(method?.accountNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      await data.savePaymentMethodConfig({
        id: method?.id, code: (method?.code ?? code).trim().toUpperCase().replace(/\s+/g, '_'), name: name.trim(), channel, isActive: method?.isActive ?? true,
        feePct: Number(pct.replace(',', '.')) || 0, feeFixed: Number(fixed.replace(/[^\d]/g, '')) || 0, accountName: accName.trim() || undefined, accountNumber: accNo.trim() || undefined,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan.'); setBusy(false); }
  }
  async function remove() {
    if (!method) return;
    setBusy(true); setErr('');
    try { await data.deletePaymentMethodConfig(method.id); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menghapus.'); setBusy(false); }
  }

  return (
    <Modal title={method ? `Ubah ${method.name}` : 'Tambah pembayaran'} onClose={onClose}>
      <div className="space-y-12 min-w-0">
        <label className="block text-sm">Nama<input className="cg-input w-full mt-4" data-autofocus maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></label>
        {!method && <label className="block text-sm">Kode<input className="cg-input w-full mt-4" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. EDC_BCA" /></label>}
        <label className="block text-sm">Jenis<select className="cg-input w-full mt-4" value={channel} onChange={(e) => setChannel(e.target.value as PaymentChannelKind)}>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-12">
          <label className="block text-sm">Biaya MDR (%)<input className="cg-input cg-num w-full mt-4" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></label>
          <label className="block text-sm">Biaya tetap (Rp)<input className="cg-input cg-num w-full mt-4" inputMode="numeric" value={fixed} onChange={(e) => setFixed(e.target.value)} /></label>
        </div>
        <label className="block text-sm">Nama rekening<input className="cg-input w-full mt-4" value={accName} onChange={(e) => setAccName(e.target.value)} /></label>
        <label className="block text-sm">Nomor rekening<input className="cg-input w-full mt-4" inputMode="numeric" value={accNo} onChange={(e) => setAccNo(e.target.value)} /></label>
        {err && <p className="cg-banner cg-banner--danger" role="alert">{err}</p>}
        <div className="flex items-center justify-between gap-8">
          {method && !method.isBuiltIn ? <button type="button" className="cg-btn cg-btn--ghost text-danger" onClick={remove} disabled={busy}>Hapus</button> : <span />}
          <div className="flex gap-8"><button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button><button type="button" className="cg-btn cg-btn--primary" onClick={save} disabled={busy || !name.trim() || (!method && !code.trim())}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
        </div>
      </div>
    </Modal>
  );
}

'use client';
import { useState, type FormEvent } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { AUTH_CODE_ACTIONS, AUTH_CODE_STATUS_LABEL, AUTH_CODE_TTL_OPTIONS, formatAuthCode, type AuthCodePermission, type AuthCodeRow, type IssuedAuthCode } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

const when = (iso?: string) => (iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—');
const actionLabel = (p: AuthCodePermission) => AUTH_CODE_ACTIONS.find((a) => a.id === p)?.label ?? p;

export default function AuthCodesPage() {
  const data = useData();
  const list = useAsync(() => data.listAuthCodes(), [data]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  async function revoke(c: AuthCodeRow) {
    setBusyId(c.id); setNotice('');
    try { setNotice((await data.revokeAuthCode(c.id)) ? 'Kode dibatalkan.' : 'Kode itu sudah dipakai atau dibatalkan.'); list.reload(); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Kode gagal dibatalkan.'); }
    finally { setBusyId(''); }
  }
  return (
    <>
      <PageHeader title="Kode otorisasi" subtitle="Kode sekali pakai sebagai pengganti PIN saat manajer tidak ada di depan kasir. Berikan kodenya lewat telepon atau pesan; berlaku singkat dan hanya untuk satu tindakan."
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setOpen(true); }}><KeyRound className="cg-icon" aria-hidden /> Buat kode</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}</div>}
      {list.status === 'ready' && list.data.length === 0 && (
        <div className="cg-empty"><p><strong>Belum ada kode otorisasi.</strong></p><p className="text-text-muted">Pilih Buat kode, lalu berikan kodenya ke kasir yang membutuhkan persetujuan.</p></div>
      )}
      {list.status === 'ready' && list.data.length > 0 && (
        <ul className="grid gap-12" aria-label="Riwayat kode otorisasi">
          {list.data.map((c) => (
            <li key={c.id} className="border border-border rounded-lg bg-surface-raised p-16 grid gap-8 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-8">
                <strong className="break-words min-w-0">{actionLabel(c.permission)}</strong>
                <span className={`cg-badge${c.status === 'active' ? ' cg-badge--success' : ''}`}>{AUTH_CODE_STATUS_LABEL[c.status]}</span>
              </div>
              <p className="text-sm text-text-muted">Dibuat {when(c.issuedAt)} · berlaku sampai {when(c.expiresAt)}</p>
              <p className="text-sm break-words">Penerbit: {c.issuerEmail ?? '—'}</p>
              {(c.usedAt || c.note) && <p className="text-sm break-words">{c.usedAt ? `Dipakai ${when(c.usedAt)}${c.usedOrderNumber ? ` untuk ${c.usedOrderNumber}` : ''}` : c.note}</p>}
              {c.usedAt && c.note && <p className="text-sm text-text-muted break-words">{c.note}</p>}
              {c.status === 'active' && <button className="cg-btn cg-btn--secondary cg-btn--sm justify-self-start" disabled={busyId === c.id} onClick={() => void revoke(c)}>Batalkan kode</button>}
            </li>
          ))}
        </ul>
      )}
      {open && <IssueDialog onClose={() => { setOpen(false); list.reload(); }} />}
    </>
  );
}

function IssueDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [permission, setPermission] = useState<AuthCodePermission>('void_order');
  const [ttl, setTtl] = useState<number>(15);
  const [note, setNote] = useState('');
  const [issued, setIssued] = useState<IssuedAuthCode | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { setIssued(await data.issueAuthCode({ permission, ttlMinutes: ttl, note: note.trim() || undefined })); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Kode gagal dibuat.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.code); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-kode">
      {issued ? (
        <div className="grid gap-12" role="status">
          <h2 id="judul-kode" className="cg-modal__title">Kode siap diberikan</h2>
          <p className="cg-money-lg cg-num text-center break-all" aria-label={`Kode ${issued.code.split('').join(' ')}`}>{formatAuthCode(issued.code)}</p>
          <p className="text-text-muted text-sm text-center">{actionLabel(permission)} · berlaku sampai {when(issued.expiresAt)}. Kode ini hanya tampil sekarang dan tidak bisa dilihat lagi.</p>
          <div className="cg-modal__actions">
            <button type="button" className="cg-btn cg-btn--secondary" onClick={() => void copy()}><Copy className="cg-icon" aria-hidden /> {copied ? 'Tersalin' : 'Salin kode'}</button>
            <button type="button" className="cg-btn cg-btn--primary" onClick={() => d.ref.current?.close()}>Selesai</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-12" noValidate>
          <h2 id="judul-kode" className="cg-modal__title">Buat kode otorisasi</h2>
          <div className="cg-field"><label className="cg-label" htmlFor="kd-aksi">Untuk tindakan</label>
            <select id="kd-aksi" className="cg-input" value={permission} onChange={(e) => setPermission(e.target.value as AuthCodePermission)} autoFocus>
              {AUTH_CODE_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="kd-ttl">Berlaku</label>
            <select id="kd-ttl" className="cg-input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
              {AUTH_CODE_TTL_OPTIONS.map((m) => <option key={m} value={m}>{m} menit</option>)}
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="kd-ket">Keterangan (opsional)</label>
            <input id="kd-ket" className="cg-input" maxLength={120} placeholder="Mis. untuk meja 4, diminta Sari" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
            <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Membuat…' : 'Buat kode'}</button></div>
        </form>
      )}
    </dialog>
  );
}

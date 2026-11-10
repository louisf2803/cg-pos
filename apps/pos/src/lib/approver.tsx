import { useMemo, useState } from 'react';
import { AUTH_CODE_ACTIONS, AUTH_CODE_LENGTH, accessFor, authCodeProblem, normalizeAuthCode, type AuthCodePermission, type Employee, type Permission } from '@cgpos/shared';
import { useData } from './app-data';
import { useAsync } from './use-async';
import { useSession } from './session';

/**
 * Izin untuk satu tindakan (opts.allowCode: pemberi izin boleh memakai kode otorisasi sekali pakai dari manajer sebagai ganti PIN; hanya bila server mengenal tindakannya), menurut peran yang sedang bertugas (lihat ROLE_ACCESS):
 *  - 'self': peran ini boleh langsung, tidak ada PIN tambahan
 *  - 'pin': perlu manajer/pemilik memasukkan PIN
 *  - 'open': perlu persetujuan, tetapi outlet belum punya manajer/pemilik terdaftar, jadi tanpa PIN
 *  - 'deny': peran ini tidak boleh melakukannya
 */
export function useApprover(permission: Permission, opts: { allowCode?: boolean; orderId?: string } = {}) {
  const data = useData();
  const { session } = useSession();
  const staff = useAsync(() => data.listEmployees(), [data]);
  const approvers = useMemo<Employee[]>(() => (staff.status === 'ready' ? staff.data.filter((e) => e.role === 'owner' || e.role === 'manager') : []), [staff]);
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState('');
  const access = accessFor(session.employee.role, permission);
  const approver = approvers.find((e) => e.id === approverId) ?? approvers.find((e) => e.id === session.employee.id) ?? approvers[0];
  const mode: 'self' | 'pin' | 'open' | 'deny' = access === 'allow' ? 'self' : access === 'deny' ? 'deny' : approvers.length > 0 ? 'pin' : 'open';
  const needsPin = mode === 'pin';
  const canUseCode = !!opts.allowCode && needsPin && AUTH_CODE_ACTIONS.some((a) => a.id === permission);
  const usingCode = canUseCode && useCode;
  /** PIN (6 angka) atau kode (8 angka) sudah lengkap, atau tidak perlu sama sekali. Dipakai untuk mengaktifkan tombol kirim. */
  const credentialReady = !needsPin || (usingCode ? normalizeAuthCode(code).length === AUTH_CODE_LENGTH : pin.length === 6);
  /** Pemberi izin beserta caranya ('pin' atau 'code'), atau null bila tidak diizinkan, PIN salah, atau kode tidak berlaku. */
  async function authorizeWith(): Promise<{ id: string; method: 'pin' | 'code' } | null> {
    if (mode === 'deny') return null;
    if (mode === 'self' || mode === 'open') return { id: session.employee.id, method: 'pin' };
    if (usingCode) {
      if (authCodeProblem(code)) { setCode(''); return null; }
      const id = await data.useAuthCode(code, permission as AuthCodePermission, opts.orderId);
      if (!id) { setCode(''); return null; }
      return { id, method: 'code' };
    }
    if (!approver || !(await data.verifyPin(approver.id, pin))) { setPin(''); return null; }
    return { id: approver.id, method: 'pin' };
  }
  /** Mengembalikan id pemberi izin, atau null bila tidak diizinkan atau PIN/kode salah. */
  async function authorize(): Promise<string | null> { return (await authorizeWith())?.id ?? null; }
  return { staffLoading: staff.status === 'loading', staffReady: staff.status === 'ready', mode, approvers, approver, setApproverId, pin, setPin, needsPin, authorize, authorizeWith, canUseCode, usingCode, setUseCode, code, setCode, credentialReady };
}
export type Approver = ReturnType<typeof useApprover>;

export function ApproverFields({ a, idPrefix, what }: { a: Approver; idPrefix: string; what: string }) {
  if (a.mode === 'deny') return <p className="cg-banner cg-banner--warning">Peran kamu tidak boleh melakukan {what}. Minta manajer atau pemilik.</p>;
  if (a.mode === 'self') return null;
  if (a.mode === 'open') return a.staffReady ? <p className="text-text-muted text-sm">Belum ada manajer atau pemilik terdaftar, jadi {what} belum memerlukan PIN. Atur peran di dashboard.</p> : null;
  if (a.usingCode) {
    return (
      <>
        <div className="cg-field">
          <label className="cg-label" htmlFor={`${idPrefix}-kode`}>Kode otorisasi</label>
          <input id={`${idPrefix}-kode`} className="cg-input cg-num" inputMode="numeric" autoComplete="off" maxLength={9} value={a.code} placeholder="8 angka dari manajer"
            onChange={(e) => a.setCode(e.target.value.replace(/[^\d\s-]/g, ''))} />
          <p className="text-text-muted text-sm">Minta kode ke manajer atau pemilik. Berlaku sekali, singkat, dan hanya saat online.</p>
        </div>
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm justify-self-start" onClick={() => a.setUseCode(false)}>Pakai PIN saja</button>
      </>
    );
  }
  return (
    <>
      {a.approvers.length > 1 && (
        <div className="cg-field">
          <label className="cg-label" htmlFor={`${idPrefix}-pemberi`}>Disetujui oleh</label>
          <select id={`${idPrefix}-pemberi`} className="cg-input" value={a.approver?.id} onChange={(e) => a.setApproverId(e.target.value)}>
            {a.approvers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
      <div className="cg-field">
        <label className="cg-label" htmlFor={`${idPrefix}-pin`}>PIN {a.approver?.name}</label>
        <input id={`${idPrefix}-pin`} className="cg-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={a.pin} onChange={(e) => a.setPin(e.target.value.replace(/\D/g, ''))} />
      </div>
      {a.canUseCode && <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm justify-self-start" onClick={() => a.setUseCode(true)}>Pakai kode otorisasi</button>}
    </>
  );
}

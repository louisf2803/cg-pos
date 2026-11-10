import { useMemo, useState } from 'react';
import { accessFor, type Employee, type Permission } from '@cgpos/shared';
import { useData } from './app-data';
import { useAsync } from './use-async';
import { useSession } from './session';

/**
 * Izin untuk satu tindakan, menurut peran yang sedang bertugas (lihat ROLE_ACCESS):
 *  - 'self': peran ini boleh langsung, tidak ada PIN tambahan
 *  - 'pin': perlu manajer/pemilik memasukkan PIN
 *  - 'open': perlu persetujuan, tetapi outlet belum punya manajer/pemilik terdaftar, jadi tanpa PIN
 *  - 'deny': peran ini tidak boleh melakukannya
 */
export function useApprover(permission: Permission) {
  const data = useData();
  const { session } = useSession();
  const staff = useAsync(() => data.listEmployees(), [data]);
  const approvers = useMemo<Employee[]>(() => (staff.status === 'ready' ? staff.data.filter((e) => e.role === 'owner' || e.role === 'manager') : []), [staff]);
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const access = accessFor(session.employee.role, permission);
  const approver = approvers.find((e) => e.id === approverId) ?? approvers.find((e) => e.id === session.employee.id) ?? approvers[0];
  const mode: 'self' | 'pin' | 'open' | 'deny' = access === 'allow' ? 'self' : access === 'deny' ? 'deny' : approvers.length > 0 ? 'pin' : 'open';
  /** Mengembalikan id pemberi izin, atau null bila tidak diizinkan atau PIN salah. */
  async function authorize(): Promise<string | null> {
    if (mode === 'deny') return null;
    if (mode === 'self' || mode === 'open') return session.employee.id;
    if (!approver || !(await data.verifyPin(approver.id, pin))) { setPin(''); return null; }
    return approver.id;
  }
  const needsPin = mode === 'pin';
  return { staffLoading: staff.status === 'loading', staffReady: staff.status === 'ready', mode, approvers, approver, setApproverId, pin, setPin, needsPin, authorize };
}
export type Approver = ReturnType<typeof useApprover>;

export function ApproverFields({ a, idPrefix, what }: { a: Approver; idPrefix: string; what: string }) {
  if (a.mode === 'deny') return <p className="cg-banner cg-banner--warning">Peran kamu tidak boleh melakukan {what}. Minta manajer atau pemilik.</p>;
  if (a.mode === 'self') return null;
  if (a.mode === 'open') return a.staffReady ? <p className="text-text-muted text-sm">Belum ada manajer atau pemilik terdaftar, jadi {what} belum memerlukan PIN. Atur peran di dashboard.</p> : null;
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
    </>
  );
}

import { useMemo, useState } from 'react';
import type { Employee } from '@cgpos/shared';
import { useData } from './app-data';
import { useAsync } from './use-async';
import { useSession } from './session';

/** Pemberi izin (manajer/pemilik) dan PIN-nya. Bila belum ada satu pun, PIN tidak diminta. */
export function useApprover() {
  const data = useData();
  const { session } = useSession();
  const staff = useAsync(() => data.listEmployees(), [data]);
  const approvers = useMemo<Employee[]>(() => (staff.status === 'ready' ? staff.data.filter((e) => e.role === 'owner' || e.role === 'manager') : []), [staff]);
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const approver = approvers.find((e) => e.id === approverId) ?? approvers.find((e) => e.id === session.employee.id) ?? approvers[0];
  /** Mengembalikan id pemberi izin, atau null bila PIN salah. */
  async function authorize(): Promise<string | null> {
    if (approvers.length === 0) return session.employee.id;
    if (!approver || !(await data.verifyPin(approver.id, pin))) { setPin(''); return null; }
    return approver.id;
  }
  return { staffLoading: staff.status === 'loading', staffReady: staff.status === 'ready', approvers, approver, setApproverId, pin, setPin, needsPin: approvers.length > 0, authorize };
}
export type Approver = ReturnType<typeof useApprover>;

export function ApproverFields({ a, idPrefix, what }: { a: Approver; idPrefix: string; what: string }) {
  if (!a.needsPin) return a.staffReady ? <p className="text-text-muted text-sm">Belum ada manajer atau pemilik terdaftar, jadi {what} belum memerlukan PIN. Atur peran di dashboard.</p> : null;
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


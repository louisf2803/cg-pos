import { useEffect } from 'react';
import type { EmployeeNotification } from '@cgpos/shared';
import { Modal } from '../ui';

/** Pesan dari pengelola untuk kasir yang sedang masuk. Membuka dialog ini menandai semuanya sudah dibaca. */
export function NotificationsDialog({ items, timezone, onSeen, onClose }: { items: EmployeeNotification[]; timezone: string; onSeen: (latest: string) => void; onClose: () => void }) {
  const latest = items[0]?.createdAt;
  useEffect(() => { if (latest) onSeen(latest); }, [latest, onSeen]);
  const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Modal title="Pesan dari pengelola" onClose={onClose} labelledBy="pesan-title">
      {items.length === 0 ? (
        <p className="cg-modal__body">Belum ada pesan.</p>
      ) : (
        <ul className="grid gap-8 max-h-[60vh] overflow-y-auto" aria-label="Daftar pesan">
          {items.map((n) => (
            <li key={n.id} className="p-10 border border-border rounded-lg bg-surface">
              <strong className="text-sm block">{n.title}</strong>
              <p className="text-sm whitespace-pre-line break-words">{n.body}</p>
              <span className="text-xs text-text-muted">{fmt(n.createdAt)}{n.employeeId ? ' · khusus Anda' : ' · untuk semua karyawan'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--primary" onClick={onClose}>Tutup</button></div>
    </Modal>
  );
}

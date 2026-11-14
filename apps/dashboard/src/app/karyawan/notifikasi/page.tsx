'use client';

import { useState } from 'react';
import {
  Bell,
  Send,
  Trash2,
  Users,
  User,
  AlertCircle,
  Info,
  Clock,
} from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import type { ManagedEmployee } from '@cgpos/shared';
import type { EmployeeNotification } from '@cgpos/shared/src/hr';
import {
  notificationProblem,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_BODY_MAX,
} from '@cgpos/shared/src/hr';

export default function NotifikasiKaryawanPage() {
  const data = useData();

  // Form states
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Deleting state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load data
  const contextAsync = useAsync(async () => {
    const [ctx, employees, notifications] = await Promise.all([
      data.getContext(),
      data.listManagedEmployees(),
      data.listNotifications(),
    ]);
    return { ctx, employees, notifications };
  }, [data]);

  const employees: ManagedEmployee[] = contextAsync.status === 'ready' ? contextAsync.data.employees : [];
  const notifications: EmployeeNotification[] = contextAsync.status === 'ready' ? contextAsync.data.notifications : [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      employeeId: targetEmployeeId ? targetEmployeeId : null,
      title: title.trim(),
      body: body.trim(),
    };

    const problem = notificationProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSending(true);
    try {
      await data.sendNotification(payload);
      setTitle('');
      setBody('');
      setTargetEmployeeId('');
      setToastMsg('Notifikasi berhasil dikirim dan tersimpan di sistem.');
      contextAsync.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal mengirim notifikasi.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await data.deleteNotification(id);
      setToastMsg('Notifikasi berhasil dihapus dari riwayat.');
      contextAsync.reload();
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : 'Gagal menghapus notifikasi.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Kirim notifikasi karyawan"
        subtitle="Kirim pengumuman penting, jadwal, atau pesan broadcast dari manajemen ke staf."
      />

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setToastMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Honest Note on POS Status */}
      <div className="cg-card p-16 bg-surface border-border flex items-start gap-12 text-sm leading-relaxed text-text">
        <Info className="cg-icon cg-icon--sm text-accent mt-4 shrink-0" aria-hidden />
        <div className="space-y-4">
          <p className="font-semibold text-text">Status integrasi aplikasi kasir:</p>
          <p className="text-text-muted text-xs">
            Notifikasi yang Anda kirimkan saat ini tersimpan aman di basis data server dan dashboard manajemen.
            Penampilan lonceng atau popup notifikasi langsung di layar aplikasi kasir POS belum aktif pada tahap ini dan akan dirilis di pembaruan kasir berikutnya.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 desktop:grid-cols-3 gap-24 items-start">
        {/* Left Column: Form Kirim Notifikasi */}
        <div className="cg-card p-24 space-y-16 desktop:col-span-1">
          <h3 className="font-bold text-base text-text flex items-center gap-8 border-b border-border pb-12">
            <Send className="cg-icon cg-icon--sm text-accent" aria-hidden />
            Buat Notifikasi Baru
          </h3>

          {formError && (
            <div role="alert" className="cg-banner cg-banner--danger">
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-16">
            <div className="space-y-4">
              <label htmlFor="target-emp" className="text-xs font-semibold text-text-muted block">
                Target Penerima
              </label>
              <select
                id="target-emp"
                className="cg-input text-xs w-full"
                value={targetEmployeeId}
                onChange={(e) => setTargetEmployeeId(e.target.value)}
                disabled={sending}
              >
                <option value="">Semua Karyawan (Broadcast)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="notif-title" className="text-xs font-semibold text-text-muted block">
                  Judul Notifikasi <span className="text-danger">*</span>
                </label>
                <span className="text-[11px] text-text-muted cg-num">
                  {title.length} / {NOTIFICATION_TITLE_MAX}
                </span>
              </div>
              <input
                id="notif-title"
                type="text"
                required
                maxLength={NOTIFICATION_TITLE_MAX}
                className="cg-input text-sm w-full"
                placeholder="Misal: Rapat Evaluasi Bulanan"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={sending}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="notif-body" className="text-xs font-semibold text-text-muted block">
                  Isi Pesan <span className="text-danger">*</span>
                </label>
                <span className="text-[11px] text-text-muted cg-num">
                  {body.length} / {NOTIFICATION_BODY_MAX}
                </span>
              </div>
              <textarea
                id="notif-body"
                required
                rows={5}
                maxLength={NOTIFICATION_BODY_MAX}
                className="cg-input text-sm w-full resize-none leading-relaxed"
                placeholder="Tulis pesan lengkap untuk disampaikan ke staf..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={sending}
              />
            </div>

            <button
              type="submit"
              className="cg-btn cg-btn--primary w-full justify-center"
              disabled={sending}
            >
              <Send className="cg-icon cg-icon--sm" aria-hidden />
              <span>{sending ? 'Mengirim...' : 'Kirim Notifikasi'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Riwayat Notifikasi */}
        <div className="cg-card p-24 space-y-16 desktop:col-span-2">
          <div className="flex items-center justify-between border-b border-border pb-12">
            <div>
              <h3 className="font-bold text-base text-text flex items-center gap-8">
                <Bell className="cg-icon cg-icon--sm text-accent" aria-hidden />
                Riwayat Notifikasi
              </h3>
              <p className="text-xs text-text-muted">Daftar notifikasi yang telah terkirim (terbaru di atas).</p>
            </div>
            <span className="px-8 py-[2px] rounded-full text-xs font-bold bg-surface border border-border cg-num">
              {notifications.length} Terkirim
            </span>
          </div>

          {contextAsync.status === 'loading' && (
            <div className="space-y-12">
              <div className="cg-skeleton h-48 w-full rounded-lg" />
              <div className="cg-skeleton h-48 w-full rounded-lg" />
              <div className="cg-skeleton h-48 w-full rounded-lg" />
            </div>
          )}

          {contextAsync.status === 'ready' && notifications.length === 0 && (
            <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
              <Bell className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
              <h4 className="font-bold text-sm text-text mb-4">Belum ada riwayat notifikasi</h4>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                Kirim pesan pertama Anda menggunakan formulir di sebelah kiri untuk menyampaikan pengumuman ke staf.
              </p>
            </div>
          )}

          {contextAsync.status === 'ready' && notifications.length > 0 && (
            <div className="space-y-12 divide-y divide-border">
              {notifications.map((notif) => {
                const isBroadcast = !notif.employeeId;
                return (
                  <div key={notif.id} className="pt-12 first:pt-0 space-y-8">
                    <div className="flex items-start justify-between gap-12">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-8 mb-4">
                          <span
                            className={`inline-flex items-center gap-4 px-8 py-[2px] rounded-full text-[11px] font-semibold ${
                              isBroadcast
                                ? 'bg-accent/15 text-accent'
                                : 'bg-info/15 text-info'
                            }`}
                          >
                            {isBroadcast ? (
                              <>
                                <Users className="cg-icon cg-icon--xs" aria-hidden />
                                <span>Semua Karyawan</span>
                              </>
                            ) : (
                              <>
                                <User className="cg-icon cg-icon--xs" aria-hidden />
                                <span>{notif.employeeName || 'Karyawan Tertentu'}</span>
                              </>
                            )}
                          </span>

                          <span className="inline-flex items-center gap-4 text-[11px] text-text-muted">
                            <Clock className="cg-icon cg-icon--xs" aria-hidden />
                            <span>{new Date(notif.createdAt).toLocaleString('id-ID')}</span>
                          </span>
                        </div>

                        <h4 className="font-bold text-sm text-text">{notif.title}</h4>
                      </div>

                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10 shrink-0"
                        disabled={deletingId === notif.id}
                        aria-label={`Hapus notifikasi ${notif.title}`}
                        onClick={() => handleDelete(notif.id)}
                      >
                        <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                        <span>Hapus</span>
                      </button>
                    </div>

                    <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap bg-surface p-12 rounded-lg border border-border">
                      {notif.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RotateCcw, Save, Users } from 'lucide-react';
import {
  customerPolicyProblem,
  DEFAULT_CUSTOMER_POLICY,
  evaluateCustomerCompleteness,
  type CustomerPolicySettings,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { loadCustomerPolicy, saveCustomerPolicy } from '@/lib/a60-preview';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const digits = (v: string) => v.replace(/\D/g, '');

export default function PengaturanDataPelangganPage() {
  const data = useData();
  const customersState = useAsync(() => data.listCustomers({ limit: 500 }), [data]);

  const [policy, setPolicy] = useState<CustomerPolicySettings>(DEFAULT_CUSTOMER_POLICY);
  const [reminderDays, setReminderDays] = useState(
    String(DEFAULT_CUSTOMER_POLICY.birthdayReminderDaysBefore)
  );
  const [inactiveDays, setInactiveDays] = useState(
    String(DEFAULT_CUSTOMER_POLICY.inactiveCustomerDaysThreshold)
  );
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loaded = loadCustomerPolicy();
    setPolicy(loaded);
    setReminderDays(String(loaded.birthdayReminderDaysBefore));
    setInactiveDays(String(loaded.inactiveCustomerDaysThreshold));
  }, []);

  const completeness = useMemo(() => {
    if (customersState.status !== 'ready') return null;
    return evaluateCustomerCompleteness(customersState.data);
  }, [customersState]);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setNotice('');
    const next: CustomerPolicySettings = {
      ...policy,
      birthdayReminderDaysBefore: Number(reminderDays || '0'),
      inactiveCustomerDaysThreshold: Number(inactiveDays || '0'),
    };
    const problem = customerPolicyProblem(next);
    if (problem) {
      setErr(problem);
      return;
    }
    setPolicy(next);
    saveCustomerPolicy(next);
    setNotice('Kebijakan data pelanggan disimpan.');
  }

  function handleReset() {
    setPolicy(DEFAULT_CUSTOMER_POLICY);
    setReminderDays(String(DEFAULT_CUSTOMER_POLICY.birthdayReminderDaysBefore));
    setInactiveDays(String(DEFAULT_CUSTOMER_POLICY.inactiveCustomerDaysThreshold));
    saveCustomerPolicy(DEFAULT_CUSTOMER_POLICY);
    setErr('');
    setNotice('Pengaturan dikembalikan ke bawaan.');
  }

  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title="Pengaturan data pelanggan"
        subtitle="Kelola validasi kontak wajib, hak ubah di kasir, penyamaran nomor di struk, dan ambang batas segmentasi."
        actions={
          <Link href="/pelanggan" className="cg-btn cg-btn--secondary">
            <Users className="cg-icon" aria-hidden /> Daftar pelanggan
          </Link>
        }
      />

      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau:</strong> kebijakan input &amp; hak akses kasir untuk pelanggan tersimpan di peramban sambil menunggu dukungan kolom kebijakan pelanggan di server (docs/REQUESTS-FOR-CLAUDE.md). Ringkasan kelengkapan data di bawah membaca langsung database pelanggan saat ini.
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Pratinjau · Aturan lokal</span>
      </div>

      {customersState.status === 'error' && (
        <ErrorBox message={customersState.message} onRetry={customersState.reload} />
      )}

      {customersState.status === 'loading' && (
        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12" aria-busy="true" aria-label="Memuat kelengkapan data pelanggan">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 76 }} />
          ))}
        </div>
      )}

      {completeness && (
        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12" aria-label="Kelengkapan profil pelanggan">
          <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
            <span className="text-xs text-text-muted">Total pelanggan</span>
            <strong className="block text-xl font-bold cg-num">{completeness.total} pelanggan</strong>
          </div>
          <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
            <span className="text-xs text-text-muted">Memiliki nomor telepon</span>
            <strong className="block text-xl font-bold cg-num">
              {completeness.withPhone} dari {completeness.total}
            </strong>
          </div>
          <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
            <span className="text-xs text-text-muted">Memiliki tanggal lahir</span>
            <strong className="block text-xl font-bold cg-num">
              {completeness.withBirthDate} dari {completeness.total}
            </strong>
          </div>
        </div>
      )}

      {completeness && policy.requirePhoneOnCreate && completeness.missingPhoneCount > 0 && (
        <div className="cg-banner cg-banner--warning">
          Saat ini ada {completeness.missingPhoneCount} pelanggan tanpa nomor telepon. Pastikan profil lama dilengkapi bila nomor telepon diwajibkan.
        </div>
      )}

      <form onSubmit={handleSave} noValidate className="grid gap-16 max-w-[680px]">
        <fieldset className="border border-border rounded-xl bg-surface-raised p-16 grid gap-12">
          <legend className="px-8 font-semibold text-sm">Validasi &amp; Duplikasi</legend>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.requirePhoneOnCreate}
              onChange={(e) => setPolicy((p) => ({ ...p, requirePhoneOnCreate: e.target.checked }))}
            />
            <span>Wajibkan nomor telepon saat menambah pelanggan baru</span>
          </label>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.uniquePhoneEnforcement}
              onChange={(e) => setPolicy((p) => ({ ...p, uniquePhoneEnforcement: e.target.checked }))}
            />
            <span>Tolak nomor telepon ganda dalam satu organisasi</span>
          </label>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.defaultAutoJoinLoyalty}
              onChange={(e) => setPolicy((p) => ({ ...p, defaultAutoJoinLoyalty: e.target.checked }))}
            />
            <span>Otomatis ikutkan pelanggan baru ke pengumpulan poin loyalti</span>
          </label>
        </fieldset>

        <fieldset className="border border-border rounded-xl bg-surface-raised p-16 grid gap-12">
          <legend className="px-8 font-semibold text-sm">Izin Kasir &amp; Privasi Struk</legend>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.allowCashierCreate}
              onChange={(e) => setPolicy((p) => ({ ...p, allowCashierCreate: e.target.checked }))}
            />
            <span>Izinkan kasir menambah profil pelanggan langsung saat transaksi</span>
          </label>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.allowCashierEdit}
              onChange={(e) => setPolicy((p) => ({ ...p, allowCashierEdit: e.target.checked }))}
            />
            <span>Izinkan kasir memperbarui nomor HP atau alamat pelanggan yang sudah ada</span>
          </label>
          <label className="flex items-start gap-8 text-sm">
            <input
              type="checkbox"
              checked={policy.hidePhoneMaskOnReceipt}
              onChange={(e) => setPolicy((p) => ({ ...p, hidePhoneMaskOnReceipt: e.target.checked }))}
            />
            <span>Samarkan sebagian digit nomor telepon pelanggan pada struk cetak</span>
          </label>
        </fieldset>

        <fieldset className="border border-border rounded-xl bg-surface-raised p-16 grid gap-12">
          <legend className="px-8 font-semibold text-sm">Penomoran, Segmentasi &amp; Pengingat</legend>
          <div className="grid gap-12 tablet:grid-cols-3">
            <div className="cg-field">
              <label className="cg-label" htmlFor="pol-prefix">
                Prefiks ID pelanggan
              </label>
              <input
                id="pol-prefix"
                className="cg-input font-mono"
                maxLength={12}
                placeholder="PLG-"
                value={policy.customerIdPrefix}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    customerIdPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                  }))
                }
              />
              <span className="text-xs text-text-muted">
                Contoh nomor: <strong>{(policy.customerIdPrefix || 'PLG-')}0001</strong>
              </span>
            </div>

            <div className="cg-field">
              <label className="cg-label" htmlFor="pol-bday">
                Pengingat ulang tahun (hari sebelum H)
              </label>
              <input
                id="pol-bday"
                className="cg-input"
                inputMode="numeric"
                maxLength={2}
                value={reminderDays}
                onChange={(e) => setReminderDays(digits(e.target.value))}
              />
            </div>

            <div className="cg-field">
              <label className="cg-label" htmlFor="pol-inactive">
                Tandai tidak aktif setelah (hari tanpa belanja)
              </label>
              <input
                id="pol-inactive"
                className="cg-input"
                inputMode="numeric"
                maxLength={3}
                value={inactiveDays}
                onChange={(e) => setInactiveDays(digits(e.target.value))}
              />
            </div>
          </div>
        </fieldset>

        {err && (
          <p role="alert" className="cg-banner cg-banner--danger">
            {err}
          </p>
        )}
        {notice && (
          <p role="status" className="cg-banner cg-banner--info">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-8">
          <button type="submit" className="cg-btn cg-btn--primary">
            <Save className="cg-icon" aria-hidden /> Simpan pengaturan
          </button>
          <button type="button" className="cg-btn cg-btn--secondary" onClick={handleReset}>
            <RotateCcw className="cg-icon cg-icon--sm" aria-hidden /> Kembalikan bawaan
          </button>
        </div>
      </form>
    </div>
  );
}


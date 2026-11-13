'use client';

import { useState } from 'react';
import { METHOD_KIND_LABEL, SHIFT_JOURNAL_FLOW, methodAccountOptions, type PaymentMethodAccount } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

export default function IntermediaryAccountsPage() {
  const data = useData();
  const methods = useAsync(() => data.listPaymentMethodAccounts(), [data]);
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState<{ id: string; message: string } | null>(null);

  async function change(m: PaymentMethodAccount, accountId: string) {
    if (saving || accountId === m.accountId) return;
    setSaving(m.methodId);
    setErr(null);
    setNotice('');
    try {
      await data.setPaymentMethodAccount(m.methodId, accountId);
      setNotice(`Akun ${m.name} diganti. Berlaku untuk pembayaran baru; jurnal lama tidak berubah.`);
      methods.reload();
    } catch (x) {
      setErr({ id: m.methodId, message: x instanceof Error ? x.message : 'Gagal menyimpan.' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Akun perantara kasir" subtitle="Akun yang menampung uang dari tiap metode bayar sebelum masuk ke bank, dan akun yang dipakai saat tutup kasir." />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {methods.status === 'error' && <ErrorBox message={methods.message} onRetry={methods.reload} />}
      {accounts.status === 'error' && <ErrorBox message={accounts.message} onRetry={accounts.reload} />}
      {(methods.status === 'loading' || accounts.status === 'loading') && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {methods.status === 'ready' && accounts.status === 'ready' && (
        methods.data.length === 0 ? (
          <div className="cg-empty"><p><strong>Belum ada metode bayar aktif.</strong></p></div>
        ) : (
          <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Akun per metode bayar">
            <thead><tr><th>Metode bayar</th><th>Jenis</th><th>Akun yang di-debit saat dibayar</th></tr></thead>
            <tbody>{methods.data.map((m) => {
              const options = methodAccountOptions(m.kind, accounts.data);
              return (
                <tr key={m.methodId}>
                  <td>{m.name}</td><td>{METHOD_KIND_LABEL[m.kind]}</td>
                  <td>
                    {m.configurable ? (
                      <>
                        <label className="cg-sr" htmlFor={`akun-${m.methodId}`}>Akun untuk {m.name}</label>
                        <select id={`akun-${m.methodId}`} className="cg-input" value={m.accountId} disabled={saving !== null} onChange={(e) => change(m, e.target.value)}>
                          {!options.some((a) => a.id === m.accountId) && <option value={m.accountId}>{m.accountName}</option>}
                          {options.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                        {err?.id === m.methodId && <p role="alert" className="text-danger-strong">{err.message}</p>}
                      </>
                    ) : (
                      <span className="text-text-muted">{m.accountName} (diatur sistem)</span>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )
      )}

      <h2 className="text-lg font-semibold mt-24 mb-8">Alur jurnal buka dan tutup kasir</h2>
      <p className="text-text-muted mb-12">Ringkasan akun yang dipakai pembukuan otomatis. Akun Kas utama, Selisih kas, dan Bank utama adalah akun sistem (ubah namanya di Daftar akun).</p>
      <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Alur jurnal kasir">
        <thead><tr><th>Kejadian</th><th>Debit</th><th>Kredit</th></tr></thead>
        <tbody>{SHIFT_JOURNAL_FLOW.map((r) => <tr key={r.event}><td>{r.event}</td><td>{r.debit}</td><td>{r.credit}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

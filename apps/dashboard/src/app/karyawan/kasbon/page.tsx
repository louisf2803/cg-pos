'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Banknote, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CASH_ADVANCE_KIND_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  cashAdvanceProblem,
  formatRp,
  payrollErrorMessage,
  summarizeCashAdvanceTotals,
  type CashAdvance,
  type CashAdvanceType,
  type EmployeeCompensation,
} from '@cgpos/shared';
import { fmtDate, todayKey, useDialog } from '@/components/fin-common';
import { PageHeader } from '@/components/page';
import { PayrollLoadBanner, PayrollNoticeBanner, PayrollSkeleton, RupiahField } from '@/components/payroll-common';
import { useData } from '@/lib/data';

interface LoadedData {
  employees: EmployeeCompensation[];
  entries: CashAdvance[];
}

const KIND_BADGE: Record<CashAdvanceType, string> = {
  BORROW: 'cg-badge--warn',
  PAYMENT_TRANSFER: 'cg-badge--ok',
  PAYMENT_PAYROLL: 'cg-badge--muted',
};

type DialogState =
  | { kind: 'create'; entryKind: 'BORROW' | 'PAYMENT_TRANSFER'; employeeId?: string }
  | { kind: 'edit'; item: CashAdvance }
  | { kind: 'delete'; item: CashAdvance };

export default function KasbonKaryawanPage() {
  const data = useData();
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | CashAdvanceType>('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: LoadedData }
  >({ status: 'loading' });

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const [employees, entries] = await Promise.all([data.listCompensation(), data.listCashAdvances()]);
      setState({ status: 'ready', data: { employees, entries } });
    } catch (err) {
      setState({ status: 'error', error: err });
    }
  }, [data]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (state.status !== 'ready') return summarizeCashAdvanceTotals([]);
    return summarizeCashAdvanceTotals(state.data.entries);
  }, [state]);

  const visibleEntries = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.entries.filter((x) => {
      if (employeeFilter && x.employeeId !== employeeFilter) return false;
      if (kindFilter && x.kind !== kindFilter) return false;
      return true;
    });
  }, [state, employeeFilter, kindFilter]);

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Kasbon karyawan"
        subtitle="Pantau saldo pinjaman per karyawan, catat pinjaman baru atau pelunasan transfer, serta riwayat potong gaji otomatis."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/karyawan/jadwal" className="cg-btn cg-btn--secondary cg-btn--sm">
              Kompensasi &amp; cicilan
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              disabled={state.status !== 'ready' || state.data.employees.length === 0}
              onClick={() => setDialog({ kind: 'create', entryKind: 'PAYMENT_TRANSFER', employeeId: employeeFilter || undefined })}
            >
              <HandCoins className="cg-icon cg-icon--xs" aria-hidden />
              <span>Catat pembayaran</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={state.status !== 'ready' || state.data.employees.length === 0}
              onClick={() => setDialog({ kind: 'create', entryKind: 'BORROW', employeeId: employeeFilter || undefined })}
            >
              <Plus className="cg-icon cg-icon--xs" aria-hidden />
              <span>Catat pinjaman</span>
            </button>
          </div>
        }
      />

      <PayrollNoticeBanner notice={notice} onClose={() => setNotice(null)} />

      {state.status === 'loading' && <PayrollSkeleton />}
      {state.status === 'error' && <PayrollLoadBanner error={state.error} onRetry={() => void load()} />}

      {state.status === 'ready' && (
        <>
          <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12 min-w-0">
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Total saldo kasbon</span>
              <strong className="block text-xl cg-num mt-4" data-testid="kasbon-total-saldo">
                {formatRp(totals.totalOutstanding)}
              </strong>
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Karyawan punya saldo</span>
              <strong className="block text-xl cg-num mt-4">{totals.activeBorrowers}</strong>
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Total pinjaman tercatat</span>
              <strong className="block text-xl cg-num mt-4">{formatRp(totals.totalBorrowed)}</strong>
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Total dibayar (transfer &amp; gaji)</span>
              <strong className="block text-xl cg-num mt-4">
                {formatRp(totals.totalPaidTransfer + totals.totalPaidPayroll)}
              </strong>
            </div>
          </div>

          <div className="cg-card p-16 grid gap-12 min-w-0">
            <h2 className="text-base font-semibold m-0">Saldo kasbon per karyawan</h2>
            {state.data.employees.length === 0 ? (
              <div className="cg-empty">
                <p className="text-xs text-text-muted m-0">Belum ada karyawan aktif.</p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Saldo kasbon per karyawan">
                  <thead>
                    <tr>
                      <th>Karyawan</th>
                      <th>Status</th>
                      <th className="cg-num">Cicilan / bulan</th>
                      <th className="cg-num">Saldo kasbon</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.employees.map((emp) => {
                      const bal = totals.balancesByEmployee[emp.employeeId] ?? 0;
                      const isSelected = employeeFilter === emp.employeeId;
                      return (
                        <tr key={emp.employeeId}>
                          <td className="whitespace-nowrap">
                            <strong>{emp.employeeName}</strong>
                          </td>
                          <td className="whitespace-nowrap text-xs text-text-muted">
                            {EMPLOYMENT_STATUS_LABEL[emp.status]}
                          </td>
                          <td className="cg-num whitespace-nowrap">{formatRp(emp.cashAdvanceInstallment)}</td>
                          <td className="cg-num whitespace-nowrap" data-testid={`saldo-${emp.employeeId}`}>
                            <span className={`cg-badge ${bal > 0 ? 'cg-badge--warn' : 'cg-badge--ok'}`}>
                              {formatRp(bal)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            <div className="flex items-center gap-8">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                onClick={() => setEmployeeFilter(isSelected ? '' : emp.employeeId)}
                              >
                                {isSelected ? 'Semua riwayat' : 'Lihat riwayat'}
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--secondary cg-btn--sm"
                                aria-label={`Pinjam kasbon untuk ${emp.employeeName}`}
                                onClick={() => setDialog({ kind: 'create', entryKind: 'BORROW', employeeId: emp.employeeId })}
                              >
                                Pinjam
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--secondary cg-btn--sm"
                                aria-label={`Bayar kasbon untuk ${emp.employeeName}`}
                                onClick={() =>
                                  setDialog({ kind: 'create', entryKind: 'PAYMENT_TRANSFER', employeeId: emp.employeeId })
                                }
                              >
                                Bayar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="cg-card p-16 grid gap-12 min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-12 min-w-0">
              <h2 className="text-base font-semibold m-0">Riwayat transaksi kasbon ({visibleEntries.length})</h2>
              <div className="flex flex-wrap gap-12 min-w-0">
                <div className="cg-field min-w-[170px]">
                  <label className="cg-label" htmlFor="kasbon-filter-karyawan">
                    Karyawan
                  </label>
                  <select
                    id="kasbon-filter-karyawan"
                    className="cg-input"
                    value={employeeFilter}
                    onChange={(e) => setEmployeeFilter(e.target.value)}
                  >
                    <option value="">Semua karyawan</option>
                    {state.data.employees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.employeeName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="cg-field min-w-[170px]">
                  <label className="cg-label" htmlFor="kasbon-filter-jenis">
                    Jenis
                  </label>
                  <select
                    id="kasbon-filter-jenis"
                    className="cg-input"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as '' | CashAdvanceType)}
                  >
                    <option value="">Semua jenis</option>
                    <option value="BORROW">{CASH_ADVANCE_KIND_LABEL.BORROW}</option>
                    <option value="PAYMENT_TRANSFER">{CASH_ADVANCE_KIND_LABEL.PAYMENT_TRANSFER}</option>
                    <option value="PAYMENT_PAYROLL">{CASH_ADVANCE_KIND_LABEL.PAYMENT_PAYROLL}</option>
                  </select>
                </div>
              </div>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="cg-empty">
                <Banknote className="cg-icon cg-icon--lg text-text-muted" aria-hidden />
                <strong>Belum ada riwayat kasbon</strong>
                <p className="text-xs text-text-muted m-0">
                  Klik &ldquo;Catat pinjaman&rdquo; atau &ldquo;Catat pembayaran&rdquo; untuk mencatat transaksi kasbon.
                </p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Riwayat transaksi kasbon">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Karyawan</th>
                      <th>Jenis</th>
                      <th className="cg-num">Nominal</th>
                      <th>Catatan</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((item) => {
                      const isPayrollAuto = item.kind === 'PAYMENT_PAYROLL';
                      return (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap">{fmtDate(item.date)}</td>
                          <td className="whitespace-nowrap">
                            <strong>{item.employeeName}</strong>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className={`cg-badge ${KIND_BADGE[item.kind]}`}>
                              {CASH_ADVANCE_KIND_LABEL[item.kind]}
                              {item.payrollPeriod ? ` (${item.payrollPeriod})` : ''}
                            </span>
                          </td>
                          <td className="cg-num whitespace-nowrap">{formatRp(item.amount)}</td>
                          <td className="max-w-[260px] break-words text-xs text-text-muted">{item.notes || '—'}</td>
                          <td className="whitespace-nowrap">
                            {isPayrollAuto ? (
                              <span className="text-xs text-text-muted">Otomatis dari payroll</span>
                            ) : (
                              <div className="flex items-center gap-8">
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--ghost cg-btn--sm"
                                  aria-label={`Ubah kasbon ${item.employeeName} ${item.date}`}
                                  onClick={() => setDialog({ kind: 'edit', item })}
                                >
                                  <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                                  <span>Ubah</span>
                                </button>
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                                  aria-label={`Hapus kasbon ${item.employeeName} ${item.date}`}
                                  onClick={() => setDialog({ kind: 'delete', item })}
                                >
                                  <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {state.status === 'ready' && (dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <CashAdvanceDialog
          employees={state.data.employees}
          balancesByEmployee={totals.balancesByEmployee}
          mode={dialog.kind === 'create' ? dialog.entryKind : (dialog.item.kind as 'BORROW' | 'PAYMENT_TRANSFER')}
          initialEmployeeId={dialog.kind === 'create' ? dialog.employeeId : dialog.item.employeeId}
          initial={dialog.kind === 'edit' ? dialog.item : undefined}
          onClose={() => setDialog(null)}
          onSaved={(text) => {
            setDialog(null);
            setNotice({ kind: 'success', text });
            void load();
          }}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteCashAdvanceDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDeleted={(text) => {
            setDialog(null);
            setNotice({ kind: 'success', text });
            void load();
          }}
          onError={(text) => {
            setDialog(null);
            setNotice({ kind: 'danger', text });
          }}
        />
      )}
    </div>
  );
}

function CashAdvanceDialog({
  employees,
  balancesByEmployee,
  mode,
  initialEmployeeId,
  initial,
  onClose,
  onSaved,
}: {
  employees: EmployeeCompensation[];
  balancesByEmployee: Record<string, number>;
  mode: 'BORROW' | 'PAYMENT_TRANSFER';
  initialEmployeeId?: string;
  initial?: CashAdvance;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? initialEmployeeId ?? employees[0]?.employeeId ?? '');
  const [kind, setKind] = useState<'BORROW' | 'PAYMENT_TRANSFER'>(mode);
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [date, setDate] = useState(initial?.date ?? todayKey());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const currentBalance = balancesByEmployee[employeeId] ?? 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      employeeId,
      kind,
      amount,
      date,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const problem = cashAdvanceProblem(payload);
    if (problem) {
      setErr(problem);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await data.saveCashAdvance(payload);
      onSaved(
        `${CASH_ADVANCE_KIND_LABEL[saved.kind]} ${saved.employeeName} sebesar ${formatRp(saved.amount)} disimpan.`,
      );
    } catch (x) {
      setErr(payrollErrorMessage(x, 'Gagal menyimpan transaksi kasbon.').message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog {...dlg.props}>
      <form onSubmit={handleSubmit} className="grid gap-12" noValidate>
        <div className="cg-modal-head">
          <h3 className="text-base font-semibold m-0">
            {initial
              ? 'Ubah transaksi kasbon'
              : kind === 'BORROW'
                ? 'Catat pinjaman kasbon'
                : 'Catat pembayaran transfer'}
          </h3>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="cg-modal-body grid gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="kasbon-karyawan">
              Karyawan
            </label>
            <select
              id="kasbon-karyawan"
              className="cg-input"
              disabled={saving}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeName}
                </option>
              ))}
            </select>
            <span className="text-xs text-text-muted">
              Saldo saat ini: <strong className="cg-num">{formatRp(currentBalance)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
            <div className="cg-field">
              <label className="cg-label" htmlFor="kasbon-jenis">
                Jenis
              </label>
              <select
                id="kasbon-jenis"
                className="cg-input"
                disabled={saving}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as 'BORROW' | 'PAYMENT_TRANSFER');
                  setErr('');
                }}
              >
                <option value="BORROW">{CASH_ADVANCE_KIND_LABEL.BORROW}</option>
                <option value="PAYMENT_TRANSFER">{CASH_ADVANCE_KIND_LABEL.PAYMENT_TRANSFER}</option>
              </select>
            </div>
            <div className="cg-field">
              <label className="cg-label" htmlFor="kasbon-tanggal">
                Tanggal
              </label>
              <input
                id="kasbon-tanggal"
                type="date"
                className="cg-input"
                disabled={saving}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setErr('');
                }}
              />
            </div>
          </div>

          <RupiahField
            id="kasbon-nominal"
            label="Nominal"
            value={amount}
            disabled={saving}
            onChange={(v) => {
              setAmount(v);
              setErr('');
            }}
            hint={
              kind === 'PAYMENT_TRANSFER' && currentBalance > 0 && amount > currentBalance
                ? 'Melebihi saldo berjalan (saldo akan negatif / lebih bayar)'
                : undefined
            }
          />

          <div className="cg-field">
            <label className="cg-label" htmlFor="kasbon-catatan">
              Catatan (opsional, maks 300 huruf)
            </label>
            <textarea
              id="kasbon-catatan"
              rows={2}
              maxLength={300}
              className="cg-input"
              disabled={saving}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setErr('');
              }}
              placeholder="Mis. Transfer BCA 12 Nov, pinjaman keperluan mendadak"
            />
          </div>

          {err && (
            <p role="alert" className="cg-banner cg-banner--danger m-0">
              <span>{err}</span>
            </p>
          )}
        </div>

        <div className="cg-modal-foot">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteCashAdvanceDialog({
  item,
  onClose,
  onDeleted,
  onError,
}: {
  item: CashAdvance;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onError: (message: string) => void;
}) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await data.deleteCashAdvance(item.id);
      onDeleted(`Catatan ${CASH_ADVANCE_KIND_LABEL[item.kind]} ${item.employeeName} dihapus.`);
    } catch (x) {
      onError(payrollErrorMessage(x, 'Gagal menghapus transaksi kasbon.').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog {...dlg.props}>
      <div className="grid gap-12">
        <div className="cg-modal-head">
          <h3 className="text-base font-semibold m-0">Hapus catatan kasbon?</h3>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>
        <div className="cg-modal-body text-sm">
          Hapus catatan <strong>{CASH_ADVANCE_KIND_LABEL[item.kind]}</strong> milik{' '}
          <strong>{item.employeeName}</strong> sebesar <strong>{formatRp(item.amount)}</strong> pada{' '}
          <strong>{fmtDate(item.date)}</strong>? Saldo kasbon akan dihitung ulang.
        </div>
        <div className="cg-modal-foot">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="cg-btn cg-btn--danger" onClick={() => void handleDelete()} disabled={busy}>
            {busy ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </dialog>
  );
}


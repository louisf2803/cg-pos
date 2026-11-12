'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Calendar,
  AlertCircle,
  CreditCard,
  Pencil,
  Trash2,
  History,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  formatRp,
  recurringBillProblem,
  billIsOverdue,
  daysUntilDue,
  type RecurringBill,
  type RecurringBillInput,
  type RecurringBillRun,
  type BillFrequency,
  type Account,
  type Supplier,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog, fmtDate, todayKey } from '@/components/fin-common';

function frequencyLabel(f: BillFrequency): string {
  switch (f) {
    case 'weekly':
      return 'Mingguan';
    case 'monthly':
      return 'Bulanan';
    case 'yearly':
      return 'Tahunan';
    default:
      return f;
  }
}

// Modal Tambah / Ubah Tagihan Rutin
function BillFormDialog({
  initial,
  accounts,
  suppliers,
  onClose,
  onSaved,
}: {
  initial: RecurringBill | null;
  accounts: readonly Account[];
  suppliers: readonly Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [name, setName] = useState(initial?.name || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [frequency, setFrequency] = useState<BillFrequency>(initial?.frequency || 'monthly');
  const [nextDue, setNextDue] = useState(initial?.nextDue || todayKey());
  const [expenseAccountId, setExpenseAccountId] = useState(initial?.expenseAccountId || '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const expenseAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => (a.category === 'expense' || a.category === 'other_expense') && a.kind === 'detail' && a.isActive,
      ),
    [accounts],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numAmount = Math.round(Number(amount) || 0);

    const payload: RecurringBillInput = {
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      amount: numAmount,
      frequency,
      nextDue,
      expenseAccountId,
      supplierId: supplierId || null,
      notes: notes.trim() || null,
      isActive,
    };

    const problem = recurringBillProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    try {
      await data.saveRecurringBill(payload);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan tagihan rutin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleSubmit} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text">
              {initial ? 'Ubah Tagihan Rutin' : 'Tambah Tagihan Rutin Terjadwal'}
            </h3>
            <p className="text-xs text-text-muted mt-2">
              Atur biaya operasional yang berulang seperti sewa tempat, internet, listrik, atau langganan vendor.
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <div className="space-y-4">
          <label htmlFor="bill-name" className="text-xs font-semibold text-text-muted block">
            Nama Tagihan <span className="text-danger">*</span>
          </label>
          <input
            id="bill-name"
            type="text"
            required
            maxLength={120}
            placeholder="Misal: Biaya Langganan Internet & Wifi"
            className="cg-input text-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="space-y-4">
            <label htmlFor="bill-amount" className="text-xs font-semibold text-text-muted block">
              Jumlah Tagihan (Rp) <span className="text-danger">*</span>
            </label>
            <input
              id="bill-amount"
              type="number"
              min={1}
              step={1}
              required
              placeholder="0"
              className="cg-input text-sm w-full cg-num"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-4">
            <label htmlFor="bill-frequency" className="text-xs font-semibold text-text-muted block">
              Frekuensi Berulang <span className="text-danger">*</span>
            </label>
            <select
              id="bill-frequency"
              required
              className="cg-input text-sm w-full"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BillFrequency)}
              disabled={saving}
            >
              <option value="weekly">Mingguan (Tiap 7 Hari)</option>
              <option value="monthly">Bulanan (Tiap Bulan)</option>
              <option value="yearly">Tahunan (Tiap Tahun)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
          <div className="space-y-4">
            <label htmlFor="bill-next-due" className="text-xs font-semibold text-text-muted block">
              Jatuh Tempo Berikutnya <span className="text-danger">*</span>
            </label>
            <input
              id="bill-next-due"
              type="date"
              required
              className="cg-input text-sm w-full"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-4">
            <label htmlFor="bill-expense-account" className="text-xs font-semibold text-text-muted block">
              Akun Biaya / Beban <span className="text-danger">*</span>
            </label>
            <select
              id="bill-expense-account"
              required
              className="cg-input text-sm w-full"
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
              disabled={saving}
            >
              <option value="">-- Pilih Akun Biaya --</option>
              {expenseAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} · {acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="bill-supplier" className="text-xs font-semibold text-text-muted block">
              Mitra / Pemasok (Opsional)
            </label>
            <Link
              href="/inventori/pemasok"
              target="_blank"
              className="text-[11px] text-accent hover:underline flex items-center gap-4"
            >
              <span>Kelola Daftar Mitra</span>
              <ExternalLink className="cg-icon cg-icon--xs" aria-hidden />
            </Link>
          </div>
          <select
            id="bill-supplier"
            className="cg-input text-sm w-full"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={saving}
          >
            <option value="">-- Tanpa Mitra Terkait --</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <label htmlFor="bill-notes" className="text-xs font-semibold text-text-muted block">
            Catatan (Opsional)
          </label>
          <textarea
            id="bill-notes"
            rows={2}
            maxLength={300}
            placeholder="Nomor pelanggan, nomor kontrak, atau instruksi pembayaran..."
            className="cg-input text-sm w-full resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="pt-8">
          <label className="flex items-center gap-8 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving}
              className="w-16 h-16 rounded text-accent"
            />
            <span className="text-sm font-semibold text-text">Tagihan aktif (dijadwalkan)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Tagihan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Modal Bayar Tagihan Rutin
function PayBillDialog({
  bill,
  accounts,
  onClose,
  onPaid,
}: {
  bill: RecurringBill;
  accounts: readonly Account[];
  onClose: () => void;
  onPaid: (nextDue: string) => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [paidOn, setPaidOn] = useState(todayKey());
  const [payAccountId, setPayAccountId] = useState('');
  const [paying, setPaying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.category === 'cash_bank' && a.kind === 'detail' && a.isActive),
    [accounts],
  );

  const handlePay = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!payAccountId) {
      setFormError('Pilih akun kas atau bank yang digunakan untuk membayar.');
      return;
    }

    setPaying(true);
    try {
      const res = await data.payRecurringBill(bill.id, payAccountId, paidOn);
      onPaid(res.nextDue);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membayar tagihan.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handlePay} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div className="flex items-center gap-8">
            <CreditCard className="cg-icon cg-icon--md text-accent" aria-hidden />
            <div>
              <h3 className="font-bold text-base text-text">Bayar Tagihan Rutin</h3>
              <p className="text-xs text-text-muted mt-2">{bill.name}</p>
            </div>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={paying}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <div className="p-16 rounded-xl bg-surface border border-border space-y-8 text-xs text-text">
          <div className="flex justify-between">
            <span className="text-text-muted">Jumlah Tagihan:</span>
            <span className="font-bold text-sm text-text cg-num">{formatRp(bill.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Jatuh Tempo Saat Ini:</span>
            <span className="font-semibold">{fmtDate(bill.nextDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Frekuensi:</span>
            <span className="font-semibold capitalize">{frequencyLabel(bill.frequency)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <label htmlFor="pay-date" className="text-xs font-semibold text-text-muted block">
            Tanggal Pembayaran <span className="text-danger">*</span>
          </label>
          <input
            id="pay-date"
            type="date"
            required
            className="cg-input text-sm w-full"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            disabled={paying}
          />
        </div>

        <div className="space-y-4">
          <label htmlFor="pay-account" className="text-xs font-semibold text-text-muted block">
            Akun Kas / Bank Pembayar <span className="text-danger">*</span>
          </label>
          <select
            id="pay-account"
            required
            className="cg-input text-sm w-full"
            value={payAccountId}
            onChange={(e) => setPayAccountId(e.target.value)}
            disabled={paying}
          >
            <option value="">-- Pilih Akun Kas/Bank --</option>
            {cashAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.code} · {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-12 rounded-lg bg-info/10 border border-info/20 text-xs text-text space-y-2">
          <p className="font-semibold text-info">Konsekuensi Pembayaran:</p>
          <p className="text-text-muted">
            Sistem akan otomatis mencatat jurnal pengeluaran (Debit akun biaya, Kredit akun kas/bank terpilih) dan memajukan tanggal jatuh tempo tagihan ini secara otomatis ke jadwal berikutnya.
          </p>
        </div>

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={paying}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={paying}>
            {paying ? 'Membayar...' : 'Konfirmasi Bayar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Modal Riwayat Pembayaran Tagihan
function BillHistoryDialog({
  bill,
  onClose,
}: {
  bill: RecurringBill;
  onClose: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const historyAsync = useAsync(() => data.listRecurringBillRuns(bill.id), [data, bill.id]);
  const runs: readonly RecurringBillRun[] = historyAsync.status === 'ready' ? historyAsync.data : [];

  return (
    <dialog {...props}>
      <div className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div className="flex items-center gap-8">
            <History className="cg-icon cg-icon--md text-accent" aria-hidden />
            <div>
              <h3 className="font-bold text-base text-text">Riwayat Pembayaran Tagihan</h3>
              <p className="text-xs text-text-muted mt-2">{bill.name}</p>
            </div>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        {historyAsync.status === 'loading' && (
          <div className="space-y-8">
            <div className="cg-skeleton h-36 w-full" />
            <div className="cg-skeleton h-36 w-full" />
          </div>
        )}

        {historyAsync.status === 'error' && (
          <ErrorBox message={historyAsync.message} onRetry={historyAsync.reload} />
        )}

        {historyAsync.status === 'ready' && runs.length === 0 && (
          <div className="p-32 text-center text-sm text-text-muted bg-surface rounded-xl border border-border">
            Belum ada riwayat pembayaran untuk tagihan ini.
          </div>
        )}

        {historyAsync.status === 'ready' && runs.length > 0 && (
          <div className="cg-data-wrap min-w-0 max-h-96 overflow-y-auto">
            <table className="cg-data w-full text-left">
              <thead>
                <tr>
                  <th className="py-8 px-16 text-xs font-semibold text-text-muted">Tanggal Bayar</th>
                  <th className="py-8 px-16 text-xs font-semibold text-text-muted">Periode Jatuh Tempo</th>
                  <th className="py-8 px-16 text-xs font-semibold text-text-muted text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...runs].reverse().map((run, idx) => (
                  <tr key={`${run.paidOn}-${run.dueDate}-${idx}`} className="hover:bg-surface/50">
                    <td className="py-8 px-16 text-sm font-semibold text-text whitespace-nowrap">
                      {fmtDate(run.paidOn)}
                    </td>
                    <td className="py-8 px-16 text-xs text-text-muted whitespace-nowrap">
                      {fmtDate(run.dueDate)}
                    </td>
                    <td className="py-8 px-16 text-sm text-right font-bold text-accent cg-num whitespace-nowrap">
                      {formatRp(run.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-12 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function RecurringBillsPage() {
  const data = useData();
  const today = todayKey();

  const [query, setQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const [editingBill, setEditingBill] = useState<RecurringBill | 'new' | null>(null);
  const [payingBill, setPayingBill] = useState<RecurringBill | null>(null);
  const [viewHistoryBill, setViewHistoryBill] = useState<RecurringBill | null>(null);
  const [deletingBill, setDeletingBill] = useState<RecurringBill | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const billsAsync = useAsync(() => data.listRecurringBills(), [data]);
  const accountsAsync = useAsync(() => data.listAccounts(), [data]);
  const suppliersAsync = useAsync(() => data.listSuppliers(), [data]);

  const bills: readonly RecurringBill[] = billsAsync.status === 'ready' ? billsAsync.data : [];
  const accounts: readonly Account[] = accountsAsync.status === 'ready' ? accountsAsync.data : [];
  const suppliers: readonly Supplier[] = suppliersAsync.status === 'ready' ? suppliersAsync.data : [];

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) map.set(s.id, s.name);
    return map;
  }, [suppliers]);

  // Sort by nextDue ascending
  const sortedBills = useMemo(() => {
    return [...bills].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  }, [bills]);

  const filteredBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedBills.filter((b) => {
      const matchQ = q
        ? b.name.toLowerCase().includes(q) ||
          (b.supplierId ? supplierMap.get(b.supplierId)?.toLowerCase().includes(q) : false)
        : true;
      const matchA =
        filterActive === 'all'
          ? true
          : filterActive === 'active'
          ? b.isActive
          : !b.isActive;
      return matchQ && matchA;
    });
  }, [sortedBills, query, filterActive, supplierMap]);

  const reloadData = () => {
    billsAsync.reload();
  };

  const handleDelete = async () => {
    if (!deletingBill) return;
    setDeleting(true);
    setActionError(null);

    try {
      await data.deleteRecurringBill(deletingBill.id);
      setDeletingBill(null);
      setToastMsg(`Tagihan "${deletingBill.name}" berhasil dihapus.`);
      reloadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus tagihan.');
      setDeletingBill(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Tagihan Rutin Terjadwal"
        subtitle="Kelola biaya operasional berulang seperti sewa, listrik, air, internet, dan langganan jasa dengan pengingat jatuh tempo otomatis."
        actions={
          <div className="flex items-center gap-8">
            <Link href="/persetujuan" className="cg-btn cg-btn--secondary">
              <CheckCircle2 className="cg-icon cg-icon--sm" aria-hidden />
              <span>Alur Persetujuan</span>
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setEditingBill('new')}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              <span>Tambah tagihan</span>
            </button>
          </div>
        }
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

      {actionError && (
        <div role="alert" className="cg-banner cg-banner--danger flex items-center justify-between">
          <div className="flex items-center gap-8">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setActionError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col tablet:flex-row items-stretch tablet:items-center justify-between gap-12">
        <div className="relative flex-1 max-w-sm">
          <Search className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="text"
            className="cg-input pl-36 text-sm w-full"
            placeholder="Cari tagihan atau mitra..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-12">
          <select
            aria-label="Filter status aktif"
            className="cg-input text-xs"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">Semua Status</option>
            <option value="active">Hanya Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>

          <Link
            href="/inventori/pemasok"
            className="cg-btn cg-btn--ghost cg-btn--sm text-accent hover:underline flex items-center gap-4 whitespace-nowrap"
          >
            <span>Daftar Mitra</span>
            <ExternalLink className="cg-icon cg-icon--xs" aria-hidden />
          </Link>
        </div>
      </div>

      {billsAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {billsAsync.status === 'error' && (
        <ErrorBox message={billsAsync.message} onRetry={reloadData} />
      )}

      {billsAsync.status === 'ready' && bills.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Calendar className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada tagihan rutin</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-16">
            Tambahkan biaya operasional berulang seperti sewa ruko, wifi, atau tagihan listrik untuk mempermudah pencatatan berkala.
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setEditingBill('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            <span>Tambah tagihan pertama</span>
          </button>
        </div>
      )}

      {billsAsync.status === 'ready' && bills.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredBills.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada tagihan rutin yang sesuai dengan pencarian.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden tablet:block cg-data-wrap min-w-0">
                <table className="cg-data w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nama Tagihan</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Mitra / Pemasok</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Nominal</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Frekuensi</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Jatuh Tempo</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Status</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredBills.map((bill) => {
                      const isOverdue = billIsOverdue(bill, today);
                      const daysLeft = daysUntilDue(bill.nextDue, today);
                      const supplierName = bill.supplierId ? supplierMap.get(bill.supplierId) : null;

                      return (
                        <tr key={bill.id} className="hover:bg-surface/50">
                          <td className="py-12 px-16">
                            <span className="font-bold text-sm text-text block">{bill.name}</span>
                            {bill.notes && <span className="text-[11px] text-text-muted line-clamp-1">{bill.notes}</span>}
                          </td>
                          <td className="py-12 px-16 text-xs text-text-muted">
                            {supplierName || <span className="text-text-muted/60">-</span>}
                          </td>
                          <td className="py-12 px-16 text-sm text-right font-bold text-accent cg-num whitespace-nowrap">
                            {formatRp(bill.amount)}
                          </td>
                          <td className="py-12 px-16 text-center whitespace-nowrap">
                            <span className="px-8 py-[2px] rounded-full text-xs font-medium bg-surface border border-border">
                              {frequencyLabel(bill.frequency)}
                            </span>
                          </td>
                          <td className="py-12 px-16 whitespace-nowrap">
                            <div className="flex items-center gap-6">
                              <span className="text-xs font-semibold text-text cg-num">
                                {fmtDate(bill.nextDue)}
                              </span>
                              {bill.isActive && (
                                <>
                                  {isOverdue ? (
                                    <span className="inline-flex items-center gap-2 px-6 py-[1px] rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20">
                                      <AlertTriangle className="cg-icon cg-icon--xs" aria-hidden />
                                      Terlambat {Math.abs(daysLeft)} hari
                                    </span>
                                  ) : daysLeft === 0 ? (
                                    <span className="inline-flex items-center gap-2 px-6 py-[1px] rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20">
                                      <Clock className="cg-icon cg-icon--xs" aria-hidden />
                                      Hari ini
                                    </span>
                                  ) : daysLeft <= 7 ? (
                                    <span className="px-6 py-[1px] rounded-full text-[10px] font-semibold bg-info/10 text-info border border-info/20">
                                      {daysLeft} hari lagi
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-12 px-16 text-center">
                            <span
                              className={`px-8 py-[2px] rounded-full text-xs font-semibold ${
                                bill.isActive
                                  ? 'bg-success/10 text-success border border-success/20'
                                  : 'bg-surface text-text-muted border border-border'
                              }`}
                            >
                              {bill.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-12 px-16 text-right">
                            <div className="inline-flex items-center justify-end gap-6">
                              {bill.isActive && (
                                <button
                                  type="button"
                                  className="cg-btn cg-btn--primary cg-btn--sm"
                                  onClick={() => setPayingBill(bill)}
                                >
                                  <CreditCard className="cg-icon cg-icon--xs" aria-hidden />
                                  <span>Bayar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                title="Riwayat Pembayaran"
                                onClick={() => setViewHistoryBill(bill)}
                              >
                                <History className="cg-icon cg-icon--xs" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                title="Ubah Tagihan"
                                onClick={() => setEditingBill(bill)}
                              >
                                <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger hover:bg-danger/10"
                                title="Hapus Tagihan"
                                onClick={() => setDeletingBill(bill)}
                              >
                                <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="block tablet:hidden divide-y divide-border">
                {filteredBills.map((bill) => {
                  const isOverdue = billIsOverdue(bill, today);
                  const daysLeft = daysUntilDue(bill.nextDue, today);
                  const supplierName = bill.supplierId ? supplierMap.get(bill.supplierId) : null;

                  return (
                    <div key={bill.id} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-start justify-between gap-12">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm text-text truncate">{bill.name}</h4>
                          {supplierName && <p className="text-xs text-text-muted">Mitra: {supplierName}</p>}
                        </div>
                        <span className="font-bold text-sm text-accent cg-num">{formatRp(bill.amount)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-8 text-xs">
                        <span className="text-text-muted">Jatuh Tempo:</span>
                        <span className="font-semibold text-text cg-num">{fmtDate(bill.nextDue)}</span>
                        {bill.isActive && isOverdue && (
                          <span className="px-6 py-[1px] rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20">
                            Terlambat {Math.abs(daysLeft)} hr
                          </span>
                        )}
                        <span className="px-6 py-[1px] rounded-full text-[10px] bg-surface border border-border">
                          {frequencyLabel(bill.frequency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border/50">
                        <span
                          className={`px-8 py-[2px] rounded-full text-xs font-semibold ${
                            bill.isActive ? 'text-success' : 'text-text-muted'
                          }`}
                        >
                          {bill.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>

                        <div className="flex items-center gap-6">
                          {bill.isActive && (
                            <button
                              type="button"
                              className="cg-btn cg-btn--primary cg-btn--sm"
                              onClick={() => setPayingBill(bill)}
                            >
                              <CreditCard className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Bayar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => setViewHistoryBill(bill)}
                          >
                            <History className="cg-icon cg-icon--xs" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            onClick={() => setEditingBill(bill)}
                          >
                            <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                            onClick={() => setDeletingBill(bill)}
                          >
                            <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Dialog Tambah / Ubah */}
      {editingBill && (
        <BillFormDialog
          initial={editingBill === 'new' ? null : editingBill}
          accounts={accounts}
          suppliers={suppliers}
          onClose={() => setEditingBill(null)}
          onSaved={() => {
            reloadData();
            setToastMsg(editingBill === 'new' ? 'Tagihan berhasil ditambahkan.' : 'Perubahan tagihan disimpan.');
          }}
        />
      )}

      {/* Dialog Bayar */}
      {payingBill && (
        <PayBillDialog
          bill={payingBill}
          accounts={accounts}
          onClose={() => setPayingBill(null)}
          onPaid={(newNextDue) => {
            reloadData();
            setToastMsg(`Tagihan "${payingBill.name}" berhasil dibayar. Jatuh tempo berikutnya: ${fmtDate(newNextDue)}.`);
          }}
        />
      )}

      {/* Dialog Riwayat Bayar */}
      {viewHistoryBill && (
        <BillHistoryDialog
          bill={viewHistoryBill}
          onClose={() => setViewHistoryBill(null)}
        />
      )}

      {/* Dialog Konfirmasi Hapus */}
      {deletingBill && (
        <dialog
          open
          className="cg-modal"
          style={{ margin: 'auto', maxWidth: 'min(480px, calc(100vw - 16px))' }}
          onClose={() => !deleting && setDeletingBill(null)}
        >
          <div className="p-24 space-y-16">
            <h3 className="font-bold text-base text-text flex items-center gap-8 text-danger">
              <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
              Hapus Tagihan Rutin
            </h3>
            <p className="text-sm text-text-muted">
              Apakah Anda yakin ingin menghapus tagihan <strong>{deletingBill.name}</strong>?
              Riwayat pembayaran yang sudah ada akan tetap tersimpan di buku besar.
            </p>
            <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                disabled={deleting}
                onClick={() => setDeletingBill(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--danger"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

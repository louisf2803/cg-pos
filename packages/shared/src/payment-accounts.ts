// Akun perantara per metode bayar (A134; migrasi 0134, fungsi pos.payment_method_set_account).
import type { Account } from './finance';
import { DataError } from './types';

export type MethodKind = 'cash' | 'noncash' | 'gateway' | 'complimentary' | 'deposit';
export interface PaymentMethodAccount {
  methodId: string; code: string; name: string; kind: MethodKind;
  accountId: string; accountName: string;
  /** hanya tunai, non-tunai, dan gateway yang akunnya bisa diatur */
  configurable: boolean;
}

export const METHOD_KIND_LABEL: Record<MethodKind, string> = {
  cash: 'Tunai', noncash: 'Non-tunai', gateway: 'QRIS / gateway', complimentary: 'Komplimen', deposit: 'Deposit',
};

/** Alur jurnal yang dijelaskan di layar: tiap baris = satu kejadian dan akun yang dipakai. */
export const SHIFT_JOURNAL_FLOW: { event: string; debit: string; credit: string }[] = [
  { event: 'Penjualan tunai dibayar', debit: 'Akun metode bayar tunai (kas)', credit: 'Penjualan dan pajak' },
  { event: 'Penjualan non-tunai atau QRIS dibayar', debit: 'Akun metode bayar (piutang non-tunai atau piutang gateway)', credit: 'Penjualan dan pajak' },
  { event: 'Tutup kasir: uang di laci kurang dari seharusnya', debit: 'Selisih kas', credit: 'Kas utama' },
  { event: 'Tutup kasir: uang di laci lebih dari seharusnya', debit: 'Kas utama', credit: 'Selisih kas' },
  { event: 'Tutup kasir: non-tunai direkonsiliasi', debit: 'Bank utama', credit: 'Akun metode bayar (piutang)' },
];

/** Akun yang boleh dipilih: detail, aktif, dan kategori sesuai jenis metode (tunai hanya kas/bank). */
export function methodAccountOptions(kind: MethodKind, accounts: Account[]): Account[] {
  if (kind !== 'cash' && kind !== 'noncash' && kind !== 'gateway') return [];
  const allowed = kind === 'cash' ? ['cash_bank'] : ['cash_bank', 'receivable'];
  return accounts.filter((a) => a.kind === 'detail' && a.isActive && allowed.includes(a.category));
}

export function methodAccountProblem(m: { kind: MethodKind }, account: Account | undefined): string | null {
  if (m.kind !== 'cash' && m.kind !== 'noncash' && m.kind !== 'gateway') return 'Akun metode ini tidak bisa diubah.';
  if (!account) return 'Akun tidak ditemukan.';
  if (methodAccountOptions(m.kind, [account]).length === 0) {
    return m.kind === 'cash' ? 'Metode tunai hanya boleh memakai akun kas atau bank.' : 'Pilih akun kas, bank, atau piutang yang aktif.';
  }
  return null;
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik atau admin yang boleh mengubah akun metode bayar.',
  'method not found': 'Metode bayar tidak ditemukan.',
  'method kind not configurable': 'Akun metode ini tidak bisa diubah.',
  'account not found or not postable': 'Akun tidak ditemukan atau tidak bisa dipakai.',
  'account category not allowed': 'Pilih akun kas, bank, atau piutang.',
  'cash method needs a cash account': 'Metode tunai hanya boleh memakai akun kas atau bank.',
};

export function paymentAccountError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal menyimpan akun metode bayar.'));
}

const DEFAULT_KEY: Record<MethodKind, string> = {
  cash: 'cash_main', noncash: 'noncash_clearing', gateway: 'gateway_clearing', complimentary: 'complimentary_expense', deposit: 'customer_deposit',
};

/** Mode demo: akun bawaan menurut jenis metode; perubahan disimpan di memori. */
export function createFakePaymentAccounts(deps: {
  methods: () => Promise<{ id: string; code: string; name: string; kind: MethodKind }[]>;
  accounts: () => Promise<Account[]>;
}) {
  const chosen = new Map<string, string>();
  return {
    async listPaymentMethodAccounts(): Promise<PaymentMethodAccount[]> {
      const [methods, accounts] = await Promise.all([deps.methods(), deps.accounts()]);
      return methods.map((m) => {
        const id = chosen.get(m.id) ?? accounts.find((a) => a.systemKey === DEFAULT_KEY[m.kind])?.id ?? '';
        return {
          methodId: m.id, code: m.code, name: m.name, kind: m.kind, accountId: id,
          accountName: accounts.find((a) => a.id === id)?.name ?? '—',
          configurable: m.kind === 'cash' || m.kind === 'noncash' || m.kind === 'gateway',
        };
      });
    },
    async setPaymentMethodAccount(methodId: string, accountId: string): Promise<void> {
      const [methods, accounts] = await Promise.all([deps.methods(), deps.accounts()]);
      const m = methods.find((x) => x.id === methodId);
      if (!m) throw new DataError('not_found', 'Metode bayar tidak ditemukan.');
      const problem = methodAccountProblem(m, accounts.find((a) => a.id === accountId));
      if (problem) throw new DataError('invalid', problem);
      chosen.set(methodId, accountId);
    },
  };
}

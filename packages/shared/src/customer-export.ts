import type { Customer, Order } from './types';
import { LOYALTY_KIND_LABEL, type LoyaltyEntry } from './loyalty';
import type { CustomerDepositEntry } from './deposit-report';
import { formatOrderPaymentMethods } from './customer-history';

const GENDER_LABEL: Record<string, string> = {
  female: 'Perempuan',
  male: 'Laki-laki',
  other: 'Lainnya',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  paid: 'Lunas',
  open: 'Belum lunas',
  partially_paid: 'Belum lunas',
  void: 'Dibatalkan',
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'Makan di tempat',
  take_away: 'Bawa pulang',
  delivery: 'Antar',
  service: 'Jasa',
};

const DEPOSIT_KIND_LABEL: Record<CustomerDepositEntry['kind'], string> = {
  purchase: 'Pembelian Deposit',
  usage: 'Pemakaian Deposit',
  refund: 'Pengembalian Deposit',
};

/**
 * Membentuk baris CSV untuk ekspor daftar pelanggan.
 */
export function buildCustomerListCsvRows(
  customers: Customer[],
  depositBalances?: Record<string, number>,
): (string | number)[][] {
  const headers = [
    'Nama Pelanggan',
    'Kode',
    'Nomor Telepon',
    'Email',
    'Jenis Kelamin',
    'Tanggal Lahir',
    'Kota',
    'Alamat',
    'Saldo Poin',
    'Saldo Deposit',
    'Catatan',
  ];

  const body = customers.map((c) => [
    c.name,
    c.code ?? '',
    c.phone ?? '',
    c.email ?? '',
    c.gender ? (GENDER_LABEL[c.gender] ?? c.gender) : '',
    c.birthDate ?? '',
    c.city ?? '',
    c.address ?? '',
    c.pointsBalance,
    depositBalances?.[c.id] ?? 0,
    c.note ?? '',
  ]);

  return [headers, ...body];
}

/**
 * Membentuk baris CSV untuk ekspor riwayat transaksi pesanan pelanggan.
 */
export function buildCustomerOrdersCsvRows(
  orders: Order[],
): (string | number)[][] {
  const headers = [
    'Nomor Pesanan',
    'Waktu Transaksi',
    'Tipe Pesanan',
    'Status Pesanan',
    'Metode Pembayaran',
    'Subtotal',
    'Potongan Diskon',
    'Biaya Layanan',
    'Pajak',
    'Pembulatan',
    'Total Akhir',
  ];

  const body = orders.map((o) => [
    o.number,
    o.closedAt ?? o.openedAt,
    ORDER_TYPE_LABEL[o.type] ?? o.type,
    ORDER_STATUS_LABEL[o.status] ?? o.status,
    formatOrderPaymentMethods(o),
    o.subtotal,
    o.discountTotal,
    o.serviceCharge,
    o.taxTotal,
    o.rounding,
    o.total,
  ]);

  return [headers, ...body];
}

/**
 * Membentuk baris CSV untuk ekspor riwayat pergerakan poin pelanggan.
 */
export function buildCustomerPointsCsvRows(
  entries: LoyaltyEntry[],
): (string | number)[][] {
  const headers = [
    'Waktu',
    'Jenis Mutasi',
    'Perubahan Poin',
    'Catatan',
  ];

  const body = entries.map((e) => [
    e.createdAt,
    LOYALTY_KIND_LABEL[e.kind] ?? e.kind,
    e.points > 0 ? `+${e.points}` : e.points,
    e.note ?? '',
  ]);

  return [headers, ...body];
}

/**
 * Membentuk baris CSV untuk ekspor riwayat transaksi deposit pelanggan.
 */
export function buildCustomerDepositCsvRows(
  entries: CustomerDepositEntry[],
): (string | number)[][] {
  const headers = [
    'Waktu Transaksi',
    'Jenis Mutasi',
    'Nomor Dokumen',
    'Keterangan / Paket',
    'Metode Pembayaran',
    'Nominal Deposit',
  ];

  const body = entries.map((e) => {
    const isCredit = e.kind === 'purchase';
    const nominal = isCredit ? e.creditAmount : -e.creditAmount;
    return [
      e.occurredAt,
      DEPOSIT_KIND_LABEL[e.kind] ?? e.kind,
      e.orderNumber ?? '',
      e.packageName ?? e.reason ?? '',
      e.paymentMethod ?? '',
      nominal,
    ];
  });

  return [headers, ...body];
}

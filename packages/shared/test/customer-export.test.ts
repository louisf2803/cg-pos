import { describe, expect, it } from 'vitest';
import {
  buildCustomerListCsvRows,
  buildCustomerOrdersCsvRows,
  buildCustomerPointsCsvRows,
  buildCustomerDepositCsvRows,
} from '../src/customer-export';
import type { Customer, Order } from '../src/types';
import type { LoyaltyEntry } from '../src/loyalty';
import type { CustomerDepositEntry } from '../src/deposit-report';

describe('A124: Customer Export Helpers', () => {
  it('membentuk baris CSV daftar pelanggan dengan saldo poin dan deposit', () => {
    const customers: Customer[] = [
      {
        id: 'c-1',
        name: 'Budi Santoso',
        code: 'CUST-001',
        phone: '08123456789',
        email: 'budi@example.com',
        gender: 'male',
        birthDate: '1990-05-15',
        city: 'Jakarta Selatan',
        address: 'Jl. Sudirman No. 1',
        pointsBalance: 150,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c-2',
        name: 'Ani Wijaya',
        pointsBalance: 50,
        createdAt: '2026-01-02T00:00:00Z',
      },
    ];

    const depositBalances = {
      'c-1': 250000,
    };

    const rows = buildCustomerListCsvRows(customers, depositBalances);
    expect(rows[0]).toEqual([
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
    ]);

    expect(rows[1]).toEqual([
      'Budi Santoso',
      'CUST-001',
      '08123456789',
      'budi@example.com',
      'Laki-laki',
      '1990-05-15',
      'Jakarta Selatan',
      'Jl. Sudirman No. 1',
      150,
      250000,
      '',
    ]);

    expect(rows[2]).toEqual([
      'Ani Wijaya',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      50,
      0,
      '',
    ]);
  });

  it('membentuk baris CSV riwayat transaksi pesanan pelanggan', () => {
    const orders: Order[] = [
      {
        id: 'o-1',
        number: 'ORD-1001',
        type: 'dine_in',
        status: 'paid',
        items: [],
        subtotal: 50000,
        discountTotal: 5000,
        serviceCharge: 2000,
        taxTotal: 4700,
        rounding: 0,
        total: 51700,
        paidTotal: 51700,
        payments: [
          {
            id: 'p-1',
            orderId: 'o-1',
            methodId: 'm-1',
            methodName: 'Tunai',
            kind: 'cash',
            amount: 51700,
            paidAt: '2026-11-01T12:00:00Z',
          },
        ],
        openedAt: '2026-11-01T11:45:00Z',
        closedAt: '2026-11-01T12:00:00Z',
      },
    ];

    const rows = buildCustomerOrdersCsvRows(orders);
    expect(rows[0]).toEqual([
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
    ]);
    expect(rows[1]).toEqual([
      'ORD-1001',
      '2026-11-01T12:00:00Z',
      'Makan di tempat',
      'Lunas',
      'Tunai',
      50000,
      5000,
      2000,
      4700,
      0,
      51700,
    ]);
  });

  it('membentuk baris CSV riwayat mutasi poin pelanggan', () => {
    const entries: LoyaltyEntry[] = [
      {
        id: 'le-1',
        customerId: 'c-1',
        points: 25,
        kind: 'earn',
        createdAt: '2026-11-01T12:00:00Z',
      },
      {
        id: 'le-2',
        customerId: 'c-1',
        points: -10,
        kind: 'redeem',
        note: 'Tukar voucher kopi',
        createdAt: '2026-11-02T14:00:00Z',
      },
    ];

    const rows = buildCustomerPointsCsvRows(entries);
    expect(rows[0]).toEqual(['Waktu', 'Jenis Mutasi', 'Perubahan Poin', 'Catatan']);
    expect(rows[1]).toEqual(['2026-11-01T12:00:00Z', 'Poin didapat', '+25', '']);
    expect(rows[2]).toEqual(['2026-11-02T14:00:00Z', 'Tukar poin', -10, 'Tukar voucher kopi']);
  });

  it('membentuk baris CSV riwayat mutasi deposit pelanggan', () => {
    const entries: CustomerDepositEntry[] = [
      {
        id: 'de-1',
        customerId: 'c-1',
        kind: 'purchase',
        creditAmount: 500000,
        salePrice: 450000,
        packageName: 'Paket Promo 500rb',
        orderNumber: 'DEP/2611/001',
        paymentMethod: 'Transfer bank',
        occurredAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'de-2',
        customerId: 'c-1',
        kind: 'usage',
        creditAmount: 75000,
        orderNumber: 'ORD-2001',
        reason: 'Bayar makan siang',
        occurredAt: '2026-11-02T13:00:00Z',
      },
    ];

    const rows = buildCustomerDepositCsvRows(entries);
    expect(rows[0]).toEqual([
      'Waktu Transaksi',
      'Jenis Mutasi',
      'Nomor Dokumen',
      'Keterangan / Paket',
      'Metode Pembayaran',
      'Nominal Deposit',
    ]);
    expect(rows[1]).toEqual([
      '2026-11-01T10:00:00Z',
      'Pembelian Deposit',
      'DEP/2611/001',
      'Paket Promo 500rb',
      'Transfer bank',
      500000,
    ]);
    expect(rows[2]).toEqual([
      '2026-11-02T13:00:00Z',
      'Pemakaian Deposit',
      'ORD-2001',
      'Bayar makan siang',
      '',
      -75000,
    ]);
  });
});

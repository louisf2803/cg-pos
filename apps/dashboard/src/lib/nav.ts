import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, Coins, Home, Package, Settings, Users } from 'lucide-react';

export type NavItem = { href: string; label: string; screen: string; tier: 1 | 2 | 3; built?: boolean };
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

/** Satu sumber untuk sidebar dan halaman rintisan. `screen` = ID layar di recon.md. */
export const NAV: NavGroup[] = [
  { label: 'Beranda', icon: Home, items: [{ href: '/', label: 'Ringkasan penjualan', screen: 'S30', tier: 1, built: true }] },
  {
    label: 'Katalog', icon: Package, items: [
      { href: '/produk', label: 'Produk', screen: 'S33', tier: 1, built: true },
      { href: '/kategori', label: 'Kategori', screen: 'S34', tier: 1, built: true },
      { href: '/ekstra', label: 'Produk ekstra', screen: 'S35', tier: 1, built: true },
      { href: '/paket', label: 'Paket', screen: 'S36', tier: 1, built: true },
      { href: '/harga-jadwal', label: 'Harga terjadwal', screen: 'S38', tier: 2 },
    ],
  },
  {
    label: 'Pelanggan', icon: Users, items: [
      { href: '/pelanggan', label: 'Pelanggan', screen: 'S41', tier: 3, built: true },
      { href: '/loyalty', label: 'Poin dan loyalty', screen: 'S42', tier: 3 },
      { href: '/promo', label: 'Promo dan kupon', screen: 'S44', tier: 2 },
    ],
  },
  {
    label: 'Laporan', icon: BarChart3, items: [
      { href: '/laporan', label: 'Laporan penjualan', screen: 'S80', tier: 1, built: true },
      { href: '/laporan/penjualan', label: 'Detail penjualan', screen: 'S81', tier: 1, built: true },
      { href: '/laporan/qris', label: 'Settlement QRIS', screen: 'S84', tier: 1 },
      { href: '/laporan/jam-ramai', label: 'Jam ramai', screen: 'S85', tier: 2 },
    ],
  },
  {
    label: 'Inventori', icon: Boxes, items: [
      { href: '/inventori/stok', label: 'Daftar stok', screen: 'S54', tier: 2 },
      { href: '/inventori/opname', label: 'Stok opname', screen: 'S55', tier: 2 },
      { href: '/inventori/pemasok', label: 'Pemasok', screen: 'S58', tier: 2 },
      { href: '/inventori/pembelian', label: 'Pemesanan stok', screen: 'S51', tier: 2 },
    ],
  },
  {
    label: 'Keuangan', icon: Coins, items: [
      { href: '/keuangan', label: 'Dashboard keuangan', screen: 'S70', tier: 2 },
      { href: '/keuangan/laporan', label: 'Laba rugi dan neraca', screen: 'S71', tier: 2 },
      { href: '/keuangan/akun', label: 'Akun dan jurnal', screen: 'S72', tier: 2 },
      { href: '/keuangan/kas', label: 'Buku kas dan bank', screen: 'S73', tier: 2 },
    ],
  },
  {
    label: 'Pengaturan', icon: Settings, items: [
      { href: '/pengaturan/outlet', label: 'Bisnis dan outlet', screen: 'S31', tier: 1, built: true },
      { href: '/pengaturan/biaya', label: 'Biaya dan pembulatan', screen: 'S39', tier: 1, built: true },
      { href: '/pengaturan/pajak', label: 'Pajak', screen: 'S40', tier: 1, built: true },
      { href: '/pengaturan/karyawan', label: 'Karyawan dan akses', screen: 'S43', tier: 1, built: true },
      { href: '/pengaturan/denah', label: 'Denah dan meja', screen: 'S32', tier: 1, built: true },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
export const findByPath = (path: string) => ALL_ITEMS.find((i) => i.href === path);

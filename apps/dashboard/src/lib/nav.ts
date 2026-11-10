import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, ChefHat, Coins, Gift, Home, LineChart, ShoppingBag, Settings } from 'lucide-react';

export type NavItem = {
  href: string; label: string; screen: string; tier: 1 | 2 | 3; built?: boolean;
  /** subjudul di dalam grup; item berurutan dengan `section` sama dikelompokkan di bawah satu subjudul */
  section?: string;
};
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

/**
 * Satu sumber untuk sidebar dan halaman rintisan. `screen` = ID layar di recon.md.
 * Susunan mengikuti hierarki menu dashboard Majoo (grup > subjudul > layar) dengan kata sendiri;
 * layar yang belum dibangun tetap punya alamat supaya kerangka navigasinya final.
 */
export const NAV: NavGroup[] = [
  { label: 'Beranda', icon: Home, items: [{ href: '/', label: 'Ringkasan penjualan', screen: 'S30', tier: 1, built: true }] },
  {
    label: 'Penjualan', icon: ShoppingBag, items: [
      { section: 'Produk', href: '/produk', label: 'Produk', screen: 'S33', tier: 1, built: true },
      { section: 'Produk', href: '/produk/impor', label: 'Impor dan ekspor produk', screen: 'S33', tier: 2 },
      { section: 'Produk', href: '/kategori', label: 'Kategori dan departemen', screen: 'S34', tier: 1, built: true },
      { section: 'Produk', href: '/ekstra', label: 'Produk ekstra', screen: 'S35', tier: 1, built: true },
      { section: 'Produk', href: '/paket', label: 'Paket', screen: 'S36', tier: 1, built: true },
      { section: 'Produk', href: '/layanan', label: 'Produk layanan', screen: 'S36', tier: 2 },
      { section: 'Produk', href: '/harga-jadwal', label: 'Harga terjadwal', screen: 'S38', tier: 2 },
      { section: 'Produk', href: '/deposit', label: 'Paket deposit', screen: 'S37', tier: 3 },
      { section: 'Pelanggan', href: '/pelanggan', label: 'Daftar pelanggan', screen: 'S41', tier: 3, built: true },
      { section: 'Pelanggan', href: '/pelanggan/grup', label: 'Grup dan harga spesial', screen: 'S41', tier: 3 },
    ],
  },
  {
    label: 'Inventori', icon: Boxes, items: [
      { section: 'Kelola stok', href: '/inventori/stok', label: 'Daftar stok', screen: 'S54', tier: 2, built: true },
      { section: 'Kelola stok', href: '/inventori/opname', label: 'Stok opname', screen: 'S55', tier: 2, built: true },
      { section: 'Kelola stok', href: '/inventori/terbuang', label: 'Stok terbuang', screen: 'S56', tier: 2 },
      { section: 'Kelola stok', href: '/inventori/produksi', label: 'Produksi stok', screen: 'S57', tier: 3 },
      { section: 'Kelola stok', href: '/inventori/transfer', label: 'Transfer stok', screen: 'S54', tier: 2 },
      { section: 'Pembelian stok', href: '/inventori/permintaan', label: 'Permintaan barang', screen: 'S50', tier: 2 },
      { section: 'Pembelian stok', href: '/inventori/pembelian', label: 'Pemesanan stok', screen: 'S51', tier: 2, built: true },
      { section: 'Pembelian stok', href: '/inventori/faktur', label: 'Faktur pembelian', screen: 'S52', tier: 2, built: true },
      { section: 'Pembelian stok', href: '/inventori/bayar-faktur', label: 'Pembayaran faktur', screen: 'S53', tier: 2 },
      { section: 'Pembelian stok', href: '/inventori/retur', label: 'Retur pembelian', screen: 'S59', tier: 3 },
      { section: 'Data', href: '/inventori/pemasok', label: 'Pemasok', screen: 'S58', tier: 2, built: true },
    ],
  },
  {
    label: 'Promosi', icon: Gift, items: [
      { href: '/promo', label: 'Promo dan kupon', screen: 'S44', tier: 2, built: true },
      { href: '/loyalty', label: 'Poin dan loyalty', screen: 'S42', tier: 3, built: true },
    ],
  },
  { label: 'Dapur', icon: ChefHat, items: [{ href: '/dapur', label: 'Layar dapur', screen: 'S60', tier: 3, built: true }] },
  {
    label: 'Laporan', icon: BarChart3, items: [
      { section: 'Penjualan', href: '/laporan', label: 'Ringkasan penjualan', screen: 'S80', tier: 1, built: true },
      { section: 'Penjualan', href: '/laporan/penjualan', label: 'Detail penjualan', screen: 'S81', tier: 1, built: true },
      { section: 'Penjualan', href: '/laporan/periode', label: 'Per periode', screen: 'S80', tier: 2 },
      { section: 'Penjualan', href: '/laporan/outlet', label: 'Per outlet', screen: 'S80', tier: 3 },
      { section: 'Penjualan', href: '/laporan/uang-muka', label: 'Uang muka', screen: 'S80', tier: 3 },
      { section: 'Penjualan', href: '/laporan/jenis-bayar', label: 'Jenis bayar', screen: 'S80', tier: 2 },
      { section: 'Penjualan', href: '/laporan/jenis-order', label: 'Jenis order', screen: 'S80', tier: 2 },
      { section: 'Penjualan', href: '/laporan/void', label: 'Void', screen: 'S80', tier: 2, built: true },
      { section: 'Penjualan', href: '/laporan/refund', label: 'Refund', screen: 'S80', tier: 2, built: true },
      { section: 'Laporan lain', href: '/laporan/dapur', label: 'Dapur', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/meja', label: 'Meja', screen: 'S80', tier: 2 },
      { section: 'Laporan lain', href: '/laporan/produk', label: 'Produk', screen: 'S80', tier: 2 },
      { section: 'Laporan lain', href: '/laporan/jasa', label: 'Jasa', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/fasilitas', label: 'Fasilitas', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/promo-loyalti', label: 'Promo dan loyalti', screen: 'S80', tier: 2 },
      { section: 'Laporan lain', href: '/laporan/pajak', label: 'Pajak dan biaya layanan', screen: 'S80', tier: 2 },
      { section: 'Laporan lain', href: '/laporan/kasir', label: 'Kasir dan tutup kasir', screen: 'S80', tier: 2, built: true },
      { section: 'Laporan lain', href: '/laporan/tutup-toko', label: 'Tutup toko', screen: 'S80', tier: 2, built: true },
      { section: 'Laporan lain', href: '/laporan/deposit', label: 'Deposit', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/pelanggan', label: 'Pelanggan', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/karyawan', label: 'Karyawan', screen: 'S80', tier: 3 },
      { section: 'Laporan lain', href: '/laporan/persediaan', label: 'Persediaan', screen: 'S80', tier: 2 },
      { section: 'Laporan lain', href: '/laporan/qris', label: 'Settlement QRIS', screen: 'S84', tier: 1 },
    ],
  },
  {
    label: 'Keuangan', icon: Coins, items: [
      { href: '/keuangan', label: 'Dashboard keuangan', screen: 'S70', tier: 2 },
      { section: 'Laporan', href: '/keuangan/laporan', label: 'Laporan keuangan', screen: 'S71', tier: 2, built: true },
      { section: 'Akun dan jurnal', href: '/keuangan/akun', label: 'Daftar akun', screen: 'S72', tier: 2, built: true },
      { section: 'Akun dan jurnal', href: '/keuangan/jurnal', label: 'Jurnal umum', screen: 'S72', tier: 2, built: true },
      { section: 'Akun dan jurnal', href: '/keuangan/saldo-awal', label: 'Saldo awal', screen: 'S72', tier: 2 },
      { section: 'Akun dan jurnal', href: '/keuangan/buku-besar', label: 'Buku besar', screen: 'S75', tier: 2, built: true },
      { section: 'Kas dan bank', href: '/keuangan/kas', label: 'Buku kas dan bank', screen: 'S73', tier: 2, built: true },
      { section: 'Kas dan bank', href: '/keuangan/transfer', label: 'Daftar transfer', screen: 'S73', tier: 2 },
      { section: 'Kas dan bank', href: '/keuangan/biaya', label: 'Penerimaan dan pengeluaran', screen: 'S76', tier: 2 },
      { section: 'Kas dan bank', href: '/keuangan/rekonsiliasi', label: 'Rekonsiliasi non-tunai', screen: 'S75', tier: 2 },
      { section: 'Penjualan B2B', href: '/keuangan/faktur-penjualan', label: 'Faktur penjualan', screen: 'S74', tier: 3 },
      { section: 'Aset', href: '/keuangan/aset', label: 'Manajemen aset', screen: 'S77', tier: 3 },
    ],
  },
  {
    label: 'Analisa', icon: LineChart, items: [
      { href: '/laporan/jam-ramai', label: 'Jam ramai', screen: 'S85', tier: 2 },
      { href: '/analisa/produk', label: 'Produk terlaris dan perputaran stok', screen: 'S85', tier: 3 },
    ],
  },
  {
    label: 'Pengaturan', icon: Settings, items: [
      { section: 'Outlet', href: '/pengaturan/outlet', label: 'Bisnis dan outlet', screen: 'S31', tier: 1, built: true },
      { section: 'Outlet', href: '/pengaturan/denah', label: 'Denah dan meja', screen: 'S32', tier: 1, built: true },
      { section: 'Outlet', href: '/pengaturan/rekening', label: 'Rekening outlet', screen: 'S31', tier: 2 },
      { section: 'Pembayaran', href: '/pengaturan/biaya', label: 'Biaya dan pembulatan', screen: 'S39', tier: 1, built: true },
      { section: 'Pembayaran', href: '/pengaturan/pajak', label: 'Pajak', screen: 'S40', tier: 1, built: true },
      { section: 'Pembayaran', href: '/pengaturan/metode-bayar', label: 'Metode pembayaran', screen: 'S40', tier: 2 },
      { section: 'Produk dan inventori', href: '/pengaturan/stok', label: 'Notifikasi dan batas stok', screen: 'S60', tier: 2 },
      { section: 'Produk dan inventori', href: '/pengaturan/struk', label: 'Tampilan struk', screen: 'S53', tier: 2 },
      { section: 'Akses', href: '/pengaturan/karyawan', label: 'Karyawan dan akses', screen: 'S43', tier: 1, built: true },
      { section: 'Akses', href: '/pengaturan/log', label: 'Log aktivitas', screen: 'S43', tier: 2 },
      { section: 'Perangkat', href: '/pengaturan/sinkron', label: 'Sinkronisasi', screen: 'S23', tier: 2 },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
export const findByPath = (path: string) => ALL_ITEMS.find((i) => i.href === path);

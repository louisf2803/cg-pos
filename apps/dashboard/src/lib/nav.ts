import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Boxes,
  Coins,
  Gift,
  Home,
  LineChart,
  ShoppingBag,
  Settings,
  Users,
  ShoppingCart,
  Globe,
  Calendar,
  MessageSquare,
  Banknote,
  Shield,
  Clock,
  Briefcase,
  Wallet,
  BookOpen,
  Building,
  Store,
  CreditCard,
  Sliders,
  Lock,
  FileText,
  Megaphone,
  Award,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  screen: string;
  tier: 1 | 2 | 3;
  built?: boolean;
  section?: string;
  isSubItem?: boolean;
};

export type NavGroup = {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
};

export type NavModule = {
  id: string;
  label: string;
  defaultHref: string;
  locked?: boolean;
  groups: NavGroup[];
};

export const MODUL: NavModule[] = [
  {
    id: 'penjualan',
    label: 'Penjualan',
    defaultHref: '/',
    groups: [
      {
        label: 'Dashboard',
        icon: Home,
        items: [
          { href: '/', label: 'Ringkasan penjualan', screen: 'S30', tier: 1, built: true },
        ],
      },
      {
        label: 'Laporan',
        icon: BarChart3,
        items: [
          { section: 'Penjualan', href: '/laporan/teratas', label: '10 Laporan teratas', screen: 'S80', tier: 1, built: true },
          { section: 'Penjualan', href: '/laporan/penjualan', label: 'Detail penjualan', screen: 'S81', tier: 1, built: true },
          { section: 'Penjualan', href: '/laporan/periode', label: 'Per periode', screen: 'S80', tier: 2, built: true },
          { section: 'Penjualan', href: '/laporan/outlet', label: 'Per outlet', screen: 'S80', tier: 3 },
          { section: 'Penjualan', href: '/laporan/uang-muka', label: 'Uang muka', screen: 'S80', tier: 3 },
          { section: 'Penjualan', href: '/laporan/jenis-bayar', label: 'Jenis bayar', screen: 'S80', tier: 2, built: true },
          { section: 'Penjualan', href: '/laporan/jenis-order', label: 'Jenis order', screen: 'S80', tier: 2, built: true },
          { section: 'Penjualan', href: '/laporan/void', label: 'Void', screen: 'S80', tier: 2, built: true },
          { section: 'Penjualan', href: '/laporan/refund', label: 'Refund', screen: 'S80', tier: 2, built: true },
          { section: 'Operasional', href: '/laporan/dapur', label: 'Dapur', screen: 'S80', tier: 3, built: true },
          { section: 'Operasional', href: '/laporan/meja', label: 'Meja', screen: 'S80', tier: 2, built: true },
          { section: 'Operasional', href: '/laporan/kasir', label: 'Kasir dan tutup kasir', screen: 'S80', tier: 2, built: true },
          { section: 'Operasional', href: '/laporan/tutup-toko', label: 'Tutup toko', screen: 'S80', tier: 2, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/produk', label: 'Produk', screen: 'S80', tier: 2, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/jasa', label: 'Jasa', screen: 'S80', tier: 3, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/fasilitas', label: 'Fasilitas', screen: 'S80', tier: 3, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/promo-loyalti', label: 'Promo dan loyalti', screen: 'S80', tier: 2, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/pajak', label: 'Pajak dan biaya layanan', screen: 'S80', tier: 2, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/deposit', label: 'Deposit', screen: 'S80', tier: 3, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/pelanggan', label: 'Pelanggan', screen: 'S80', tier: 3, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/karyawan', label: 'Karyawan', screen: 'S80', tier: 3, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/persediaan', label: 'Persediaan', screen: 'S80', tier: 2, built: true },
          { section: 'Katalog & Pelanggan', href: '/laporan/qris', label: 'Settlement QRIS', screen: 'S84', tier: 1 },
          { section: 'Lainnya', href: '/laporan/ekspor', label: 'Riwayat ekspor CSV', screen: 'S80', tier: 2, built: true },
        ],
      },
      {
        label: 'Analisa Laporan',
        icon: LineChart,
        items: [
          { href: '/analisa/waktu-teramai-penjualan', label: 'Waktu teramai penjualan', screen: 'S85', tier: 2, built: true },
          { href: '/analisa/waktu-teramai-produk', label: 'Waktu teramai produk', screen: 'S85', tier: 3, built: true },
          { href: '/analisa/perputaran-stok', label: 'Perputaran stok', screen: 'S85', tier: 3, built: true },
          { href: '/analisa/kepuasan', label: 'Kepuasan pelanggan', screen: 'S85', tier: 3, built: true },
        ],
      },
      {
        label: 'Produk',
        icon: ShoppingBag,
        items: [
          { section: 'Katalog', href: '/kategori', label: 'Daftar departemen & kategori', screen: 'S34', tier: 1, built: true },
          { section: 'Katalog', href: '/produk', label: 'Produk barang', screen: 'S33', tier: 1, built: true },
          { section: 'Katalog', href: '/produk/impor', label: 'Impor dan ekspor produk', screen: 'S33', tier: 2, built: true },
          { section: 'Katalog', href: '/produk/barcode', label: 'Cetak barcode', screen: 'S33', tier: 2, built: true },
          { section: 'Katalog', href: '/layanan', label: 'Produk layanan', screen: 'S36', tier: 2 },
          { section: 'Katalog', href: '/fasilitas', label: 'Produk fasilitas', screen: 'S36', tier: 3, built: true },
          { section: 'Katalog', href: '/ekstra', label: 'Produk ekstra', screen: 'S35', tier: 1, built: true },
          { section: 'Katalog', href: '/paket', label: 'Produk paket', screen: 'S36', tier: 1, built: true },
          { section: 'Katalog', href: '/deposit', label: 'Paket deposit', screen: 'S37', tier: 3, built: true },
          { section: 'Resep & Harga', href: '/inventori/resep', label: 'Perubahan resep', screen: 'S33', tier: 2, built: true },
          { section: 'Resep & Harga', href: '/harga-ojol', label: 'Daftar harga ojek online', screen: 'S38', tier: 2 },
          { section: 'Resep & Harga', href: '/harga-jadwal', label: 'Penjadwalan harga', screen: 'S38', tier: 2, built: true },
          { section: 'Resep & Harga', href: '/harga-waktu', label: 'Harga berdasarkan waktu', screen: 'S38', tier: 3 },
        ],
      },
      {
        label: 'Inventori',
        icon: Boxes,
        items: [
          { section: 'Stok', href: '/inventori/stok', label: 'Daftar bahan baku', screen: 'S54', tier: 2, built: true },
          { section: 'Stok', href: '/inventori/opname', label: 'Stok opname', screen: 'S55', tier: 2, built: true },
          { section: 'Stok', href: '/inventori/terbuang', label: 'Stok terbuang', screen: 'S56', tier: 2 },
          { section: 'Stok', href: '/inventori/satuan', label: 'Satuan barang', screen: 'S54', tier: 2, built: true },
          { section: 'Stok', href: '/inventori/produksi', label: 'Produksi stok', screen: 'S57', tier: 3 },
          { section: 'Stok', href: '/inventori/transfer', label: 'Mutasi antar outlet', screen: 'S54', tier: 2, built: true },
          { section: 'Pembelian', href: '/inventori/pembelian', label: 'Pemesanan stok', screen: 'S51', tier: 2, built: true },
          { section: 'Pembelian', href: '/inventori/faktur', label: 'Faktur pembelian', screen: 'S52', tier: 2, built: true },
          { section: 'Pembelian', href: '/inventori/bayar-faktur', label: 'Pembayaran faktur', screen: 'S53', tier: 2, built: true },
          { section: 'Pembelian', href: '/inventori/retur', label: 'Retur pembelian', screen: 'S59', tier: 3, built: true },
          { section: 'Pembelian', href: '/inventori/permintaan', label: 'Permintaan barang', screen: 'S50', tier: 2 },
          { section: 'Mitra', href: '/inventori/pemasok', label: 'Daftar pemasok', screen: 'S58', tier: 2, built: true },
        ],
      },
      {
        label: 'Pelanggan',
        icon: Users,
        items: [
          { href: '/pelanggan', label: 'Daftar pelanggan', screen: 'S41', tier: 3, built: true },
          { href: '/pelanggan/grup', label: 'Grup pelanggan', screen: 'S41', tier: 3, built: true },
          { href: '/pelanggan/harga-spesial', label: 'Grup harga spesial', screen: 'S41', tier: 3, built: true },
          { href: '/pelanggan/kustom', label: 'Kustom data pelanggan', screen: 'S41', tier: 3, built: true },
          { href: '/pelanggan/pengaturan', label: 'Pengaturan data pelanggan', screen: 'S41', tier: 3, built: true },
        ],
      },
      {
        label: 'Promosi',
        icon: Gift,
        items: [
          { href: '/promo', label: 'Promo dan kupon', screen: 'S44', tier: 2, built: true },
          { href: '/loyalty', label: 'Loyalty dan poin', screen: 'S42', tier: 3, built: true },
        ],
      },
      {
        label: 'Komisi',
        icon: Award,
        items: [
          { href: '/komisi', label: 'Daftar grup komisi', screen: 'S45', tier: 3, built: true },
        ],
      },
      {
        label: 'Invoice',
        icon: FileText,
        items: [
          { href: '/invoice/penawaran', label: 'Daftar penawaran penjualan', screen: 'S46', tier: 3 },
          { href: '/invoice/pesanan', label: 'Daftar pesanan penjualan', screen: 'S46', tier: 3 },
          { href: '/invoice/pengiriman', label: 'Daftar pengiriman penjualan', screen: 'S46', tier: 3 },
          { href: '/invoice', label: 'Daftar invoice', screen: 'S46', tier: 3 },
          { href: '/invoice/penerimaan', label: 'Daftar penerimaan penjualan', screen: 'S46', tier: 3 },
        ],
      },
      {
        label: 'Marketing',
        icon: Megaphone,
        items: [
          { href: '/marketing/kirim', label: 'Kirim kampanye marketing', screen: 'S47', tier: 3 },
          { href: '/marketing/beli', label: 'Beli kampanye marketing', screen: 'S47', tier: 3 },
        ],
      },
    ],
  },
  {
    id: 'order-online',
    label: 'Order Online',
    defaultHref: '/order-online/pesanan',
    groups: [
      {
        label: 'Pesanan Online',
        icon: ShoppingCart,
        items: [
          { href: '/order-online/pesanan', label: 'Pesanan masuk', screen: 'S64', tier: 2, built: true },
        ],
      },
      {
        label: 'Saluran Penjualan',
        icon: Globe,
        items: [
          { href: '/order-online/mandiri', label: 'Order mandiri QR', screen: 'S65', tier: 3, built: true },
          { href: '/order-online/marketplace', label: 'Integrasi marketplace', screen: 'S66', tier: 3, built: true },
          { href: '/order-online/delivery', label: 'Pesan-antar makanan', screen: 'S67', tier: 3, built: true },
          { href: '/order-online/kios', label: 'Kios mandiri', screen: 'S68', tier: 3, built: true },
          { href: '/order-online/aplikasi', label: 'Aplikasi konsumen', screen: 'S69', tier: 3, built: true },
        ],
      },
    ],
  },
  {
    id: 'appointment',
    label: 'Appointment',
    defaultHref: '/appointment',
    groups: [
      {
        label: 'Appointment',
        icon: Calendar,
        items: [
          { href: '/appointment', label: 'Jadwal appointment', screen: 'S62', tier: 3, built: true },
        ],
      },
    ],
  },
  {
    id: 'karyawan',
    label: 'Karyawan',
    defaultHref: '/pengaturan/karyawan',
    groups: [
      {
        label: 'Karyawan & Akses',
        icon: Users,
        items: [
          { href: '/pengaturan/karyawan', label: 'Daftar karyawan', screen: 'S43', tier: 1, built: true },
          { href: '/pengaturan/log', label: 'Log aktivitas', screen: 'S43', tier: 2, built: true },
          { href: '/pengaturan/kode-otorisasi', label: 'Kode otorisasi', screen: 'S43', tier: 2, built: true },
        ],
      },
      {
        label: 'Penggajian',
        icon: Banknote,
        items: [
          { href: '/karyawan/payroll', label: 'Payroll karyawan', screen: 'S43', tier: 3 },
        ],
      },
      {
        label: 'Hak Akses',
        icon: Shield,
        items: [
          { href: '/karyawan/hak-akses', label: 'Pengaturan peran & hak akses', screen: 'S43', tier: 3, built: true },
        ],
      },
      {
        label: 'Kehadiran',
        icon: Clock,
        items: [
          { href: '/karyawan/absensi', label: 'Absensi karyawan', screen: 'S43', tier: 3, built: true },
          { href: '/karyawan/jadwal', label: 'Jadwal kerja', screen: 'S43', tier: 3 },
        ],
      },
      {
        label: 'Organisasi',
        icon: Briefcase,
        items: [
          { href: '/karyawan/tim', label: 'Struktur tim', screen: 'S43', tier: 3 },
          { href: '/karyawan/master', label: 'Pengaturan master karyawan', screen: 'S43', tier: 3 },
          { href: '/karyawan/persetujuan', label: 'Alur persetujuan', screen: 'S43', tier: 3 },
        ],
      },
    ],
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    defaultHref: '/keuangan',
    groups: [
      {
        label: 'Ringkasan',
        icon: Coins,
        items: [
          { href: '/keuangan', label: 'Dashboard keuangan', screen: 'S70', tier: 2, built: true },
          { href: '/keuangan/laporan', label: 'Laporan keuangan', screen: 'S71', tier: 2, built: true },
        ],
      },
      {
        label: 'Kas & Bank',
        icon: Wallet,
        items: [
          { href: '/keuangan/kas', label: 'Buku kas dan bank', screen: 'S73', tier: 2, built: true },
          { href: '/keuangan/transfer', label: 'Daftar transfer', screen: 'S73', tier: 2, built: true },
          { href: '/keuangan/biaya', label: 'Penerimaan dan pengeluaran', screen: 'S76', tier: 2, built: true },
          { href: '/keuangan/rekonsiliasi', label: 'Rekonsiliasi non-tunai', screen: 'S75', tier: 2, built: true },
        ],
      },
      {
        label: 'Akuntansi',
        icon: BookOpen,
        items: [
          { href: '/keuangan/akun', label: 'Daftar akun', screen: 'S72', tier: 2, built: true },
          { href: '/keuangan/jurnal', label: 'Jurnal umum', screen: 'S72', tier: 2, built: true },
          { href: '/keuangan/saldo-awal', label: 'Saldo awal', screen: 'S72', tier: 2, built: true },
          { href: '/keuangan/buku-besar', label: 'Buku besar', screen: 'S75', tier: 2, built: true },
        ],
      },
      {
        label: 'Penjualan B2B & Aset',
        icon: Building,
        items: [
          { href: '/keuangan/faktur-penjualan', label: 'Faktur penjualan B2B', screen: 'S74', tier: 3 },
          { href: '/keuangan/aset', label: 'Manajemen aset', screen: 'S77', tier: 3 },
        ],
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'Whatsapp',
    defaultHref: '/whatsapp',
    locked: true,
    groups: [
      {
        label: 'Whatsapp',
        icon: MessageSquare,
        items: [
          { href: '/whatsapp', label: 'Kampanye Whatsapp', screen: 'S48', tier: 3 },
        ],
      },
    ],
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan',
    defaultHref: '/pengaturan/outlet',
    groups: [
      {
        label: 'Outlet & Denah',
        icon: Store,
        items: [
          { href: '/pengaturan/outlet', label: 'Bisnis dan outlet', screen: 'S31', tier: 1, built: true },
          { href: '/pengaturan/denah', label: 'Denah dan meja', screen: 'S32', tier: 1, built: true },
          { href: '/pengaturan/rekening', label: 'Rekening outlet', screen: 'S31', tier: 2 },
        ],
      },
      {
        label: 'Pembayaran',
        icon: CreditCard,
        items: [
          { href: '/pengaturan/biaya', label: 'Biaya dan pembulatan', screen: 'S39', tier: 1, built: true },
          { href: '/pengaturan/pajak', label: 'Pajak', screen: 'S40', tier: 1, built: true },
          { href: '/pengaturan/metode-bayar', label: 'Metode pembayaran', screen: 'S40', tier: 2, built: true },
        ],
      },
      {
        label: 'Operasional & Cetak',
        icon: Sliders,
        items: [
          { href: '/pengaturan/stasiun-cetak', label: 'Stasiun cetak', screen: 'S53', tier: 2, built: true },
          { href: '/pengaturan/catatan', label: 'Catatan siap pakai', screen: 'S53', tier: 2, built: true },
          { href: '/pengaturan/stok', label: 'Notifikasi dan batas stok', screen: 'S60', tier: 2 },
          { href: '/pengaturan/struk', label: 'Tampilan struk', screen: 'S53', tier: 2, built: true },
          { href: '/pengaturan/ekspor', label: 'Riwayat ekspor CSV', screen: 'S54', tier: 2, built: true },
          { href: '/dapur', label: 'Layar dapur', screen: 'S60', tier: 3, built: true },
        ],
      },
      {
        label: 'Keamanan & Akses',
        icon: Lock,
        items: [
          { href: '/pengaturan/karyawan', label: 'Karyawan dan akses', screen: 'S43', tier: 1, built: true },
          { href: '/pengaturan/log', label: 'Log aktivitas', screen: 'S43', tier: 2, built: true },
          { href: '/pengaturan/kode-otorisasi', label: 'Kode otorisasi', screen: 'S43', tier: 2, built: true },
          { href: '/pengaturan/sinkron', label: 'Sinkronisasi perangkat', screen: 'S23', tier: 2 },
        ],
      },
    ],
  },
];

export const MODULS = MODUL;

// Flatten all items across all modules
const itemMap = new Map<string, NavItem>();
for (const m of MODUL) {
  for (const g of m.groups) {
    for (const item of g.items) {
      if (!itemMap.has(item.href)) {
        itemMap.set(item.href, item);
      }
    }
  }
}

export const ALL_ITEMS: NavItem[] = Array.from(itemMap.values());
export const findByPath = (path: string) => ALL_ITEMS.find((i) => i.href === path);

// Backward compatibility alias for any existing code
export const NAV: NavGroup[] = MODUL[0]!.groups;

/** Cari modul berdasarkan path URL */
export function getModuleForPath(pathname: string, activeModuleHint?: string): NavModule {
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const fallback = MODUL[0]!;

  if (activeModuleHint) {
    const hintMod = MODUL.find((m) => m.id === activeModuleHint);
    if (hintMod) {
      const containsPath = hintMod.groups.some((g) =>
        g.items.some((i) => i.href === cleanPath || cleanPath.startsWith(i.href + '/'))
      );
      if (containsPath) return hintMod;
    }
  }

  if (cleanPath.startsWith('/order-online')) {
    return MODUL.find((m) => m.id === 'order-online') || fallback;
  }
  if (cleanPath.startsWith('/keuangan')) {
    return MODUL.find((m) => m.id === 'keuangan') || fallback;
  }
  if (cleanPath.startsWith('/karyawan')) {
    return MODUL.find((m) => m.id === 'karyawan') || fallback;
  }
  if (cleanPath.startsWith('/pengaturan')) {
    if (activeModuleHint === 'karyawan' && cleanPath.startsWith('/pengaturan/karyawan')) {
      return MODUL.find((m) => m.id === 'karyawan') || fallback;
    }
    return MODUL.find((m) => m.id === 'pengaturan') || fallback;
  }

  // Check which module explicitly contains this href
  for (const m of MODUL) {
    for (const g of m.groups) {
      for (const item of g.items) {
        if (item.href === cleanPath) {
          return m;
        }
      }
    }
  }

  // Default to Penjualan
  return fallback;
}

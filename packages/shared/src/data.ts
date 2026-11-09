import type { OutletInfo, OutletOptions, TaxSettings } from './outlet';
import type {
  Bundle, BundleInput, Category, CatalogInput, ExtraGroup, ExtraGroupInput, Department, Refund, RefundInput, DiningTable, Floor, TableStatus, CatalogProduct, Employee, EmployeeInput, ManagedEmployee, OrderDraft, Order, OutletContext, PaymentInput, PaymentMethod, Product, ProductInput,
  SalesRange, SalesSummary, Shift, ShiftReport,
} from './types';

/**
 * Satu-satunya pintu data untuk dashboard dan POS. Implementasi:
 *  - createFakeData(): di memori, untuk pengembangan dan tes
 *  - (nanti, /replica-backend) createSupabaseData(): memanggil tabel + sync_push/sync_pull
 * Tanda tangan ini tidak berubah saat implementasi diganti, jadi kode layar tidak ikut berubah.
 */
export interface DataLayer {
  getContext(): Promise<OutletContext>;
  /** Informasi dan pengaturan outlet untuk layar Pengaturan outlet. */
  getOutletSettings(): Promise<{ info: OutletInfo; options: OutletOptions }>;
  /** Nama, alamat, telepon. Hanya pemilik/admin organisasi. */
  saveOutletInfo(input: { name: string; address: string; phone: string }): Promise<void>;
  /** Biaya layanan, pembulatan, aturan kasir, catatan kaki struk. Pemilik dan manajer. */
  saveOutletOptions(input: OutletOptions): Promise<void>;
  /** Pajak PB1: nyala/mati, nama, tarif, harga termasuk pajak atau tidak. */
  getTaxSettings(): Promise<TaxSettings>;
  /** Pemilik dan manajer. Berlaku untuk pesanan baru; kasir memuat ulang saat dibuka. */
  saveTaxSettings(input: TaxSettings): Promise<void>;
  listFloors(): Promise<Floor[]>;
  saveFloor(input: { id?: string; name: string }): Promise<Floor>;
  /** Hapus lantai beserta mejanya. Ditolak bila ada meja yang sedang dipakai pesanan. */
  deleteFloor(id: string): Promise<void>;
  listTables(): Promise<DiningTable[]>;
  saveTable(input: { id?: string; floorId: string | null; name: string }): Promise<DiningTable>;
  /** Hapus meja. Ditolak bila sedang dipakai pesanan. */
  deleteTable(id: string): Promise<void>;
  /** Semua meja dengan pesanan yang sedang memakainya, untuk denah di kasir. */
  listTableStatus(): Promise<TableStatus[]>;
  listCategories(): Promise<Category[]>;
  saveCategory(input: { id?: string; name: string; departmentId?: string | null }): Promise<Category>;
  /** Hapus kategori. Produk di dalamnya menjadi "tanpa kategori". */
  deleteCategory(id: string): Promise<void>;
  /** Jumlah produk (induk dan satuan, bukan bahan) per kategori. */
  categoryProductCounts(): Promise<Record<string, number>>;
  listDepartments(): Promise<Department[]>;
  saveDepartment(input: { id?: string; name: string }): Promise<Department>;
  /** Hapus departemen. Kategori di dalamnya menjadi "tanpa departemen". */
  deleteDepartment(id: string): Promise<void>;
  /** Paket (bundle): daftar, simpan, aktif/nonaktif. Di kasir paket tampil sebagai produk biasa. */
  listBundles(q?: { includeInactive?: boolean }): Promise<Bundle[]>;
  saveBundle(input: BundleInput): Promise<Bundle>;
  setBundleActive(id: string, active: boolean): Promise<void>;
  /** Grup Ekstra (modifier) beserta pilihan dan produk yang memakainya. */
  listExtraGroups(): Promise<ExtraGroup[]>;
  saveExtraGroup(input: ExtraGroupInput): Promise<ExtraGroup>;
  /** Hapus grup. Pesanan lama tetap menyimpan salinan nama dan harga pilihannya. */
  deleteExtraGroup(id: string): Promise<void>;
  listProducts(q?: { categoryId?: string | null; search?: string; includeInactive?: boolean }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  saveProduct(input: ProductInput): Promise<Product>;
  setProductActive(id: string, active: boolean): Promise<void>;

  /** Katalog gaya pemilik: satu produk punya banyak varian (S/M/L). Kasir tetap memakai listProducts (satu baris per ukuran). */
  listCatalog(q?: { search?: string; includeInactive?: boolean; categoryId?: string | null }): Promise<CatalogProduct[]>;
  getCatalogProduct(id: string): Promise<CatalogProduct | null>;
  saveCatalogProduct(input: CatalogInput): Promise<CatalogProduct>;
  /** Menonaktifkan/mengaktifkan produk beserta seluruh variannya. */
  setCatalogActive(id: string, active: boolean): Promise<void>;

  listEmployees(): Promise<Employee[]>;
  verifyPin(employeeId: string, pin: string): Promise<boolean>;
  /** Atur PIN 6 digit karyawan (khusus owner/manajer). PIN tidak pernah dibaca kembali; hanya hash-nya disimpan di server. */
  setEmployeePin(employeeId: string, pin: string): Promise<void>;
  /** Semua karyawan outlet ini, termasuk nonaktif. Untuk layar pengelolaan. */
  listManagedEmployees(): Promise<ManagedEmployee[]>;
  /** Tambah atau ubah karyawan (kasir atau manajer). Peran pemilik tidak diatur dari sini. */
  saveEmployee(input: EmployeeInput): Promise<ManagedEmployee>;
  listPaymentMethods(): Promise<PaymentMethod[]>;

  currentShift(): Promise<Shift | null>;
  openShift(input: { id: string; cashierId: string; openingCash: number }): Promise<Shift>;
  closeShift(input: { shiftId: string; counted: number; closedBy: string }): Promise<ShiftReport>;

  /** setara op order.upsert: simpan pesanan (status open), menghitung ulang angka dengan computeOrder */
  saveOrder(draft: OrderDraft, cashierId: string): Promise<Order>;
  /** setara op payment.add. Order jadi paid bila lunas. */
  addPayment(orderId: string, payment: PaymentInput): Promise<Order>;
  /** Refund sebagian atau penuh per item untuk pesanan lunas. Idempoten menurut `id`. Pemberi izin (manajer/pemilik) sudah diverifikasi PIN-nya oleh layar. */
  refundOrder(input: RefundInput): Promise<Refund>;
  listRefunds(orderId: string): Promise<Refund[]>;
  /** Semua refund dalam rentang tanggal (untuk laporan penjualan bersih dan kontrol). */
  listRefundsBetween(range: SalesRange): Promise<Refund[]>;
  voidUnpaidOrder(orderId: string, reason: string, authorizedBy: string): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  /** `by: 'closed'` memfilter dengan tanggal tutup (untuk laporan); `all` mengambil semua, tanpa batas 200. */
  listOrders(q?: { status?: Order['status']; from?: string; to?: string; limit?: number; by?: 'opened' | 'closed'; all?: boolean }): Promise<Order[]>;
  nextOrderNumber(): Promise<string>;

  salesSummary(range: SalesRange): Promise<SalesSummary>;
}

import type { OutletInfo, OutletOptions, TaxSettings } from './outlet';
import type { ProductPhotoInput } from './photo';
import type { LoyaltyEntry, LoyaltyRules } from './loyalty';
import type { Account, AccountInput, BalanceSheetTotals, CashFlow, Journal, JournalInput, JournalSummary, Ledger, PayableRow, StatementRow, TrialRow } from './finance';
import type { PayAccount, PurchaseInvoice, PurchaseInvoiceInput, PurchaseInvoiceSummary, PurchaseItem, PurchaseOrder, PurchaseOrderInput, PurchaseOrderSummary, PurchasePayInput, PurchaseReceiveInput, Supplier, SupplierInput } from './purchasing';
import type { StockFilter, StockItem, StockMove, StockOpname, StockOpnameInput, StockOpnameSummary, StockPostInput } from './stock';
import type { KitchenStatus, KitchenTicket } from './kitchen';
import type { AuthCodePermission, AuthCodeRow, IssuedAuthCode } from './auth-code';
import type { ActivityQuery, ActivityRow } from './activity';
import type { RecipeIngredient, RecipeLine, RecipeProduct } from './recipe';
import type {
  Bundle, BundleInput, Category, Coupon, CouponInput, Customer, Promotion, PromotionInput, CustomerInput, CatalogInput, ExtraGroup, ExtraGroupInput, Department, Refund, RefundInput, DiningTable, Floor, TableStatus, CatalogProduct, Employee, EmployeeInput, ManagedEmployee, OrderDraft, Order, OutletContext, PaymentInput, PaymentMethod, Product, ProductInput,
  SalesRange, SalesSummary, Shift, ShiftReport,
} from './types';
import type { ShiftReportRow } from './shift-report';

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
  /** Pindahkan pesanan yang belum dibayar ke meja kosong lain. */
  moveOrderTable(orderId: string, toTableId: string): Promise<Order>;
  /** Satukan item pesanan `fromId` ke pesanan `intoId` (keduanya meja, belum dibayar); pesanan sumber dibatalkan dengan catatan. */
  mergeOrders(input: { intoId: string; fromId: string; authorizedBy: string }): Promise<Order>;
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
  /** Pasang foto produk (null = hapus, termasuk foto varian). Pemilik dan manajer. Foto lama di penyimpanan tidak dihapus. */
  setProductPhoto(productId: string, photo: ProductPhotoInput | null): Promise<CatalogProduct>;

  /** Pelanggan (tanpa yang sudah dihapus), urut nama. `search` mencocokkan nama, nomor telepon, atau kode. */
  listCustomers(q?: { search?: string; limit?: number }): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  /** Tambah atau ubah. Nomor telepon yang sama dengan pelanggan lain ditolak. */
  saveCustomer(input: CustomerInput): Promise<Customer>;
  /** Hapus lembut: hilang dari daftar, tetapi pesanan lama tetap menyebut namanya. */
  deleteCustomer(id: string): Promise<void>;

  /** Promo (tanpa yang dihapus), urut nama. `activeOnly` = hanya yang aktif (jadwal tidak diperiksa; kasir memeriksanya). */
  listPromotions(q?: { activeOnly?: boolean }): Promise<Promotion[]>;
  savePromotion(input: PromotionInput): Promise<Promotion>;
  /** Hapus lembut; kupon dan pesanan lama yang memakainya tetap utuh. */
  deletePromotion(id: string): Promise<void>;
  /** Kupon beserta jumlah pemakaiannya (dari pesanan yang tidak dibatalkan). */
  listCoupons(promotionId?: string): Promise<Coupon[]>;
  saveCoupon(input: CouponInput): Promise<Coupon>;
  /** Kupon yang sudah pernah dipakai tidak dihapus; nonaktifkan saja. */
  deleteCoupon(id: string): Promise<void>;
  /** Cari kupon dari kode (huruf besar kecil sama). Null bila tidak ada. Pemakaiannya sudah terhitung. */
  findCoupon(code: string): Promise<{ coupon: Coupon; promotion: Promotion } | null>;

  /** Aturan poin loyalti outlet ini (bawaan: mati). */
  getLoyaltyRules(): Promise<LoyaltyRules>;
  /** Pemilik dan manajer. */
  saveLoyaltyRules(rules: LoyaltyRules): Promise<LoyaltyRules>;
  /** Riwayat poin satu pelanggan, terbaru dulu. */
  listLoyaltyLedger(customerId: string, limit?: number): Promise<LoyaltyEntry[]>;
  /** Koreksi poin manual (+ atau -); saldo tidak boleh negatif. Pemilik dan manajer. Mengembalikan saldo baru. */
  adjustPoints(customerId: string, delta: number, note?: string): Promise<number>;

  /** Stok di outlet ini: bahan baku dan barang yang stoknya dilacak. Urut nama. */
  listStock(q?: { search?: string; kind?: StockItem['kind']; status?: StockFilter }): Promise<StockItem[]>;
  /** Catat stok masuk, keluar, atau terbuang (pemilik dan manajer). Idempoten menurut `id`. Stok boleh minus. Mengembalikan keadaan terbaru. */
  postStock(input: StockPostInput): Promise<StockItem>;
  /** Kartu stok: gerakan satu item, terbaru dulu. */
  listStockMoves(productId: string, q?: { limit?: number }): Promise<StockMove[]>;
  /** Batas stok minimum untuk peringatan (kosong = tanpa peringatan). Pemilik dan manajer. */
  setStockMin(productId: string, min: number | null): Promise<void>;

  /** Opname outlet ini, terbaru dulu. */
  listOpnames(): Promise<StockOpnameSummary[]>;
  getOpname(id: string): Promise<StockOpname | null>;
  /** Buat atau ubah draf (pemilik dan manajer). Jumlah sistem tiap item dicatat saat item itu pertama masuk draf. Opname final tidak bisa diubah. */
  saveOpname(input: StockOpnameInput): Promise<StockOpname>;
  /** Selesaikan draf: stok disesuaikan sebesar selisih (fisik - sistem saat dihitung). Sekali saja. */
  finalizeOpname(id: string): Promise<StockOpname>;
  /** Hanya draf. */
  deleteOpname(id: string): Promise<void>;

  /** Pemasok, urut nama. Nonaktif disembunyikan kecuali diminta. */
  listSuppliers(q?: { includeInactive?: boolean; search?: string }): Promise<Supplier[]>;
  /** Tambah atau ubah pemasok (pemilik dan manajer). */
  saveSupplier(input: SupplierInput): Promise<Supplier>;
  /** Barang yang stoknya dilacak beserta satuan belinya. */
  listPurchaseItems(): Promise<PurchaseItem[]>;
  /** Akun kas dan bank untuk membayar faktur. */
  listPayAccounts(): Promise<PayAccount[]>;
  listPurchaseOrders(): Promise<PurchaseOrderSummary[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | null>;
  /** Buat atau ubah PO (draf atau dipesan). Yang sudah diterima atau dibatalkan tidak bisa diubah. */
  savePurchaseOrder(input: PurchaseOrderInput): Promise<PurchaseOrder>;
  listPurchaseInvoices(q?: { supplierId?: string; status?: PurchaseInvoice['status'] }): Promise<PurchaseInvoiceSummary[]>;
  getPurchaseInvoice(id: string): Promise<PurchaseInvoice | null>;
  /** Buat faktur (idempoten menurut id): stok masuk untuk yang diterima, hutang dibukukan. Bila dari PO, PO ditandai diterima. */
  createPurchaseInvoice(input: PurchaseInvoiceInput): Promise<PurchaseInvoice>;
  /** Penerimaan lanjutan untuk faktur yang belum lengkap. Idempoten menurut id. */
  receivePurchase(input: PurchaseReceiveInput): Promise<PurchaseInvoice>;
  /** Bayar faktur (sebagian atau lunas). Idempoten menurut id. */
  payPurchase(input: PurchasePayInput): Promise<PurchaseInvoice>;

  /** Daftar akun (chart of accounts) org ini, urut kode. Nonaktif ikut. */
  listAccounts(): Promise<Account[]>;
  /** Tambah atau ubah akun (pemilik dan manajer). Akun sistem: hanya nama yang boleh diubah. */
  saveAccount(input: AccountInput): Promise<Account>;
  /** Jurnal dalam rentang tanggal (YYYY-MM-DD, kedua ujung termasuk), terbaru dulu. */
  listJournal(q: { from: string; to: string; sourceType?: string; search?: string }): Promise<JournalSummary[]>;
  getJournal(id: string): Promise<Journal | null>;
  /** Jurnal manual atau saldo awal (pemilik dan admin). Harus seimbang. Idempoten menurut id. */
  postJournal(input: JournalInput): Promise<Journal>;
  /** Pembalik untuk jurnal manual atau saldo awal. Jurnal asli menjadi voided. */
  reverseJournal(id: string, reason?: string, date?: string): Promise<Journal>;
  ledger(accountId: string, range: { from: string; to: string }): Promise<Ledger>;
  trialBalance(range: { from: string; to: string }): Promise<TrialRow[]>;
  incomeStatement(range: { from: string; to: string }): Promise<StatementRow[]>;
  balanceSheet(asOf: string): Promise<{ rows: StatementRow[]; totals: BalanceSheetTotals }>;
  cashFlow(range: { from: string; to: string }): Promise<CashFlow>;
  /** Hutang usaha yang belum lunas per faktur pembelian. */
  payablesAging(asOf: string): Promise<PayableRow[]>;

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
  /** Ringkasan shift tanpa menutupnya: penerimaan per metode, kas, produk terjual. Bisa dipanggil berulang. */
  shiftSummary(shiftId: string): Promise<ShiftReport>;
  /** Semua shift outlet ini yang dibuka pada rentang (paling banyak 100, terbaru dulu), lengkap dengan laporannya. Untuk dashboard. */
  listShiftReports(range: SalesRange): Promise<ShiftReportRow[]>;

  /** setara op order.upsert: simpan pesanan (status open), menghitung ulang angka dengan computeOrder */
  saveOrder(draft: OrderDraft, cashierId: string): Promise<Order>;
  /** setara op payment.add. Order jadi paid bila lunas. */
  addPayment(orderId: string, payment: PaymentInput): Promise<Order>;
  /** Refund sebagian atau penuh per item untuk pesanan lunas. Idempoten menurut `id`. Pemberi izin (manajer/pemilik) sudah diverifikasi PIN-nya oleh layar. */
  refundOrder(input: RefundInput): Promise<Refund>;
  listRefunds(orderId: string): Promise<Refund[]>;
  /** Semua refund dalam rentang tanggal (untuk laporan penjualan bersih dan kontrol). */
  listRefundsBetween(range: SalesRange): Promise<Refund[]>;
  /** authMethod: 'pin' (bawaan) atau 'code' bila pemberi izin memakai kode otorisasi; dicatat di riwayat void. */
  voidUnpaidOrder(orderId: string, reason: string, authorizedBy: string, authMethod?: 'pin' | 'code'): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  /** `by: 'closed'` memfilter dengan tanggal tutup (untuk laporan); `all` mengambil semua, tanpa batas 200. */
  listOrders(q?: { status?: Order['status']; customerId?: string; from?: string; to?: string; limit?: number; by?: 'opened' | 'closed'; all?: boolean }): Promise<Order[]>;
  nextOrderNumber(): Promise<string>;

  salesSummary(range: SalesRange): Promise<SalesSummary>;
  // ---------- dapur ----------
  /** Papan dapur outlet ini: tiket per pesanan yang baris-barisnya sudah dikirim. `servedMinutes` menambah yang baru disajikan. */
  kitchenBoard(servedMinutes?: number): Promise<KitchenTicket[]>;
  /** Kirim baris pesanan yang belum terkirim ke dapur (idempoten). Pesanan harus sudah tersimpan di server. */
  kitchenSend(orderId: string): Promise<{ sent: number }>;
  kitchenSetStatus(itemIds: string[], status: KitchenStatus): Promise<void>;

  // ---------- kode otorisasi ----------
  /** Dashboard: terbitkan kode sekali pakai untuk outlet ini (pemilik/admin/manajer). Teks kode hanya dikembalikan di sini. */
  issueAuthCode(input: { permission: AuthCodePermission; ttlMinutes: number; note?: string }): Promise<IssuedAuthCode>;
  /** Dashboard: riwayat kode outlet ini, terbaru dulu (tanpa teks kode). */
  listAuthCodes(): Promise<AuthCodeRow[]>;
  /** Dashboard: batalkan kode yang belum dipakai. Mengembalikan false bila sudah dipakai atau dibatalkan. */
  revokeAuthCode(id: string): Promise<boolean>;
  /** Kasir (perangkat): tukar kode dengan identitas penerbit; null bila salah, kedaluwarsa, sudah dipakai, atau perangkat dikunci karena terlalu banyak salah. Hanya online. */
  useAuthCode(code: string, permission: AuthCodePermission, orderId?: string): Promise<string | null>;

  // ---------- log aktivitas ----------
  /** Dashboard (pemilik/admin/manajer): perubahan pengaturan dan kejadian sistem, terbaru dulu. Bawaan 30 hari terakhir, paling banyak 200. */
  listActivity(q?: ActivityQuery): Promise<ActivityRow[]>;

  // ---------- resep dan HPP ----------
  /** Bahan yang bisa dipakai di resep, dengan satuan, konversi, dan biaya per satuan dasar (biaya rata-rata stok, atau harga beli bila stok belum dicatat). */
  listRecipeIngredients(): Promise<RecipeIngredient[]>;
  /** Semua produk jual (termasuk yang belum punya resep) dengan baris resepnya. */
  listRecipes(): Promise<RecipeProduct[]>;
  /** Ganti seluruh resep satu produk secara atomik (pemilik/admin/manajer). Mengembalikan jumlah baris tersimpan. */
  saveRecipe(productId: string, lines: RecipeLine[]): Promise<number>;
}


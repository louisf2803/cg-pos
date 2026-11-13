import type { OutletInfo, OutletOptions, TaxSettings } from './outlet';
import type { Appointment, AppointmentInput } from './appointment';
import type { ProductPhotoInput } from './photo';
import type { RoleDefinition } from './permission-matrix';
import type { PurchasePriceInput, PurchasePriceMapping, PurchasePriceSuggestion } from './purchase-price';
import type { StockRequest, StockRequestInput, StockRequestStatus } from './stock-requests';
import type { ApprovalInput, ApprovalRequest, ApprovalStatus, RecurringBill, RecurringBillInput, RecurringBillRun } from './bills';
import type { AssetDepreciationEntry, DepreciationRunResult, FixedAsset, FixedAssetDisposalInput, FixedAssetInput } from './fixed-assets';
import type { AttendanceSettings, AttendanceSettingsInput, EmployeeHr, EmployeeHrInput, EmployeeNotification, EmployeeNotificationInput, EmployeeType, EmployeeTypeInput, JobLevel, JobLevelInput, OrgUnit, OrgUnitInput } from './hr';
import type { CashAdvance, CashAdvanceInput, EmployeeCompensation, EmployeeIncident, EmployeeIncidentInput, PayrollRecord, PayrollRecordInput, PayrollRules, WeeklySchedule } from './payroll';
import type { LoyaltyEntry, LoyaltyRules } from './loyalty';
import type { Account, AccountInput, BalanceSheetTotals, CashFlow, Journal, JournalInput, JournalSummary, Ledger, PayableRow, StatementRow, TrialRow } from './finance';
import type { PayAccount, PurchaseInvoice, PurchaseInvoiceInput, PurchaseInvoiceSummary, PurchaseItem, PurchaseOrder, PurchaseOrderInput, PurchaseOrderSummary, PurchasePayInput, PurchaseReceiveInput, Supplier, SupplierInput } from './purchasing';
import type { StockFilter, StockItem, StockMove, StockOpname, StockOpnameInput, StockOpnameSummary, StockPostInput, StockMoveEntry, StockMoveKind } from './stock';
import type { KitchenStatus, KitchenTicket } from './kitchen';
import type { PrintStation, PrintStationInput, SentLine } from './station';
import type { NotePreset, NotePresetInput } from './notes';
import type { AuthCodePermission, AuthCodeRow, IssuedAuthCode } from './auth-code';
import type { ActivityQuery, ActivityRow } from './activity';
import type { RecipeIngredient, RecipeLine, RecipeProduct } from './recipe';
import type { DiscountUse } from './promo-report';
import type { StockLocation, StockTransfer, StockTransferInput } from './stock-transfer';
import type { ProductUnitInput, ProductUnitRow } from './product-unit';
import type {
  Bundle, BundleInput, Category, Coupon, CouponInput, Customer, Promotion, PromotionInput, CustomerInput, CatalogInput, ExtraGroup, ExtraGroupInput, Department, Refund, RefundInput, DiningTable, Floor, TableStatus, CatalogProduct, Employee, EmployeeInput, ManagedEmployee, OrderDraft, Order, OutletContext, PaymentInput, PaymentMethod, Product, ProductInput,
  SalesRange, SalesSummary, Shift, ShiftReport, CashMovement, AttendanceInput, AttendanceOpen, AttendanceRecord, PriceChange,
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
  /** Id produk sistem "Item bebas" (jual barang tak terdaftar). Nama dan harga tiap baris diisi kasir. Dibuat otomatis bila belum ada. */
  getCustomItemProductId(): Promise<string>;
  saveProduct(input: ProductInput): Promise<Product>;
  setProductActive(id: string, active: boolean): Promise<void>;

  /** Katalog gaya pemilik: satu produk punya banyak varian (S/M/L). Kasir tetap memakai listProducts (satu baris per ukuran). */
  listCatalog(q?: { search?: string; includeInactive?: boolean; categoryId?: string | null }): Promise<CatalogProduct[]>;
  getCatalogProduct(id: string): Promise<CatalogProduct | null>;
  saveCatalogProduct(input: CatalogInput): Promise<CatalogProduct>;
  /** Atur batas persen kasir boleh mengubah harga baris untuk produk-produk ini (satu produk, atau semua variannya). 0 = tidak boleh. Pemilik/admin/manajer. */
  setPriceOverride(productIds: string[], pct: number): Promise<void>;
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
  /** Mutasi stok semua barang outlet ini yang terjadi dalam rentang (occurredAt, ISO UTC), terbaru dulu; kinds menyaring jenis (mis. ['waste']). */
  listStockMovesBetween(range: SalesRange, kinds?: StockMoveKind[]): Promise<StockMoveEntry[]>;
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
  /** Karyawan yang sedang clock in di outlet perangkat ini (POS memakainya untuk menampilkan siapa yang sudah masuk). */
  attendanceOpen(): Promise<AttendanceOpen[]>;
  /** Clock in dengan PIN karyawan. Jam dari server. Selfie opsional (bucket privat). location = GPS perangkat; bila outlet punya radius absensi mode blokir, tanpa location atau di luar radius ditolak (galat forbidden). Galat: bad_pin, invalid (sudah clock in), not_found, forbidden. */
  attendanceClockIn(employeeId: string, pin: string, photo?: ProductPhotoInput, location?: { lat: number; lng: number }): Promise<{ id: string; clockInAt: string }>;
  /** Clock out dengan PIN karyawan. Galat: bad_pin, invalid (belum clock in). */
  attendanceClockOut(employeeId: string, pin: string, photo?: ProductPhotoInput): Promise<{ id: string; clockInAt: string; clockOutAt: string }>;
  /** Catatan absensi untuk pemilik/manajer (clockInAt dalam rentang), terbaru dulu; employeeId untuk satu karyawan. */
  listAttendance(range: SalesRange, employeeId?: string): Promise<AttendanceRecord[]>;
  /** Koreksi atau tambah catatan (pemilik/manajer). Satu karyawan hanya boleh punya satu catatan yang belum clock out. */
  saveAttendance(input: AttendanceInput): Promise<AttendanceRecord>;
  deleteAttendance(id: string): Promise<void>;
  /**
   * Peran KUSTOM org ini (tabel 0033). Peran bawaan (owner, manager, cashier) tidak disimpan di server: ambil dari
   * createDefaultRoleDefinitions lalu gabungkan dengan mergeRoleOverrides([...bawaan, ...hasil ini]).
   */
  listRoles(): Promise<RoleDefinition[]>;
  /** Simpan peran kustom (baru atau ubah). Peran baru mendapat id UUID dari server: pakai id pada hasil. Hanya pemilik/manajer; ownerAppAccess hanya bisa diaktifkan pemilik/admin. */
  saveRolePermissions(role: RoleDefinition): Promise<RoleDefinition>;
  /** Hapus peran kustom; karyawan yang memakainya kehilangan tautan peran. Peran bawaan ditolak (forbidden). */
  deleteRole(roleId: string): Promise<void>;

  // ----- payroll (khusus pemilik/manajer; kasir dan akun perangkat tidak boleh membaca gaji) -----
  /** Semua karyawan aktif dengan gaji pokok dan tunjangannya (bawaan: tetap, semua nol). */
  listCompensation(): Promise<EmployeeCompensation[]>;
  saveCompensation(input: Omit<EmployeeCompensation, 'employeeName'>): Promise<EmployeeCompensation>;
  /** Jadwal kerja mingguan per karyawan (hari + jam mulai shift, jam lokal outlet). Karyawan tanpa jadwal tidak muncul. */
  listSchedules(): Promise<Record<string, WeeklySchedule>>;
  saveSchedule(employeeId: string, schedule: WeeklySchedule): Promise<void>;
  /** Aturan payroll org; kunci yang belum diatur memakai nilai bawaan Coffee Ground. */
  getPayrollRules(): Promise<PayrollRules>;
  savePayrollRules(rules: PayrollRules): Promise<PayrollRules>;
  /** Catatan harian dalam rentang tanggal lokal "yyyy-mm-dd" (kedua ujung ikut), terbaru dulu. */
  listIncidents(range: { from: string; to: string }, employeeId?: string): Promise<EmployeeIncident[]>;
  saveIncident(input: EmployeeIncidentInput): Promise<EmployeeIncident>;
  deleteIncident(id: string): Promise<void>;
  // ---- struktur SDM (migrasi 0038); hanya pemilik/manajer. Nama ganda (tanpa beda huruf) = invalid. Menghapus jabatan/unit/tipe melepas tautan karyawan. ----
  listJobLevels(): Promise<JobLevel[]>;
  saveJobLevel(input: JobLevelInput): Promise<JobLevel>;
  deleteJobLevel(id: string): Promise<void>;
  listOrgUnits(): Promise<OrgUnit[]>;
  saveOrgUnit(input: OrgUnitInput): Promise<OrgUnit>;
  deleteOrgUnit(id: string): Promise<void>;
  listEmployeeTypes(): Promise<EmployeeType[]>;
  saveEmployeeType(input: EmployeeTypeInput): Promise<EmployeeType>;
  deleteEmployeeType(id: string): Promise<void>;
  /** Profil SDM semua karyawan yang sudah diatur. */
  listEmployeeHr(): Promise<EmployeeHr[]>;
  saveEmployeeHr(input: EmployeeHrInput): Promise<EmployeeHr>;
  /** Pengaturan lokasi dan radius absensi per outlet (hanya outlet yang sudah diatur). */
  listAttendanceSettings(): Promise<AttendanceSettings[]>;
  saveAttendanceSettings(input: AttendanceSettingsInput): Promise<AttendanceSettings>;
  /** Notifikasi dari pengelola ke karyawan, terbaru dulu. */
  listNotifications(): Promise<EmployeeNotification[]>;
  sendNotification(input: EmployeeNotificationInput): Promise<EmployeeNotification>;
  deleteNotification(id: string): Promise<void>;
  // ---- reservasi dan appointment dengan kalender (migrasi 0105; A143) ----
  listAppointments(range?: { from?: string; to?: string }): Promise<Appointment[]>;
  saveAppointment(input: AppointmentInput): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;
  // ---- aset tetap (migrasi 0040); hanya pemilik/admin. Rancangan Claude atas arahan Louis (Majoo tidak bisa dilihat). ----
  listFixedAssets(): Promise<FixedAsset[]>;
  /** Riwayat penyusutan yang sudah dicatat, satu aset atau semua (terbaru dulu). */
  listAssetDepreciations(assetId?: string): Promise<AssetDepreciationEntry[]>;
  /** Catat aset baru (id dibuat klien bila kosong; mengulang id yang sama tidak menggandakan). Dengan payAccountId: jurnal Dr Peralatan, Cr akun bayar. Galat: invalid, forbidden. */
  saveFixedAsset(input: FixedAssetInput): Promise<FixedAsset>;
  /** Susutkan semua aset aktif untuk bulan period (tanggal mana pun di bulan itu; bukan bulan depan). Aman diulang. */
  depreciateFixedAssets(period: string): Promise<DepreciationRunResult>;
  /** Lepas aset (jual/buang): jurnal menghapus harga perolehan dan akumulasi; selisih ke akun laba/rugi. */
  disposeFixedAsset(input: FixedAssetDisposalInput): Promise<FixedAsset>;
  // ---- tagihan rutin dan persetujuan (migrasi 0041); pengelola (pemilik/admin/manajer). Rancangan Claude atas arahan Louis. ----
  listRecurringBills(q?: { includeInactive?: boolean }): Promise<RecurringBill[]>;
  saveRecurringBill(input: RecurringBillInput): Promise<RecurringBill>;
  deleteRecurringBill(id: string): Promise<void>;
  /** Bayar tagihan pada jatuh tempo berikutnya: jurnal Dr akun biaya, Cr akun bayar; jatuh tempo maju satu periode. Hanya pemilik/admin. Galat: invalid, forbidden, not_found. */
  payRecurringBill(billId: string, payAccountId: string, date: string): Promise<RecurringBill>;
  listRecurringBillRuns(billId?: string): Promise<RecurringBillRun[]>;
  listApprovals(q?: { status?: ApprovalStatus }): Promise<ApprovalRequest[]>;
  requestApproval(input: ApprovalInput): Promise<ApprovalRequest>;
  /** Setuju/tolak. Penyetuju bukan pengaju kecuali pemilik; keputusan final. Galat: forbidden, invalid (sudah diputuskan). */
  decideApproval(id: string, approve: boolean, note?: string): Promise<ApprovalRequest>;
  cancelApproval(id: string): Promise<ApprovalRequest>;
  // ---- permintaan barang antar lokasi (migrasi 0042); pengelola. Rancangan Claude atas arahan Louis. ----
  listStockRequests(q?: { status?: StockRequestStatus }): Promise<StockRequest[]>;
  /** Id dibuat klien bila kosong; mengulang id yang sama tidak menggandakan. Galat: invalid, not_found, forbidden. */
  createStockRequest(input: StockRequestInput): Promise<StockRequest>;
  decideStockRequest(id: string, approve: boolean, note?: string): Promise<StockRequest>;
  /** Penuhi permintaan yang disetujui: membuat transfer stok sumber -> peminta (stok sumber berkurang saat itu juga). */
  fulfillStockRequest(id: string): Promise<StockRequest>;
  cancelStockRequest(id: string): Promise<StockRequest>;
  // ---- pemetaan harga beli (migrasi 0043); pengelola. Rancangan Claude atas arahan Louis. ----
  /** Hanya barang yang sudah punya pengaturan; barang lain otomatis memakai mode 'last'. */
  listPurchasePriceMappings(): Promise<PurchasePriceMapping[]>;
  /** mode 'last' menghapus harga manual. Galat: invalid, not_found (barang/satuan), forbidden. */
  setPurchasePriceMapping(input: PurchasePriceInput): Promise<PurchasePriceMapping>;
  /** Harga beli yang disarankan untuk satu barang (manual atau faktur terakhir yang tidak batal). */
  suggestPurchasePrice(productId: string): Promise<PurchasePriceSuggestion>;
  /** Riwayat kasbon (terbaru dulu), semua karyawan atau satu karyawan. Saldo: cashAdvanceBalance dari payroll.ts. */
  listCashAdvances(employeeId?: string): Promise<CashAdvance[]>;
  saveCashAdvance(input: CashAdvanceInput): Promise<CashAdvance>;
  deleteCashAdvance(id: string): Promise<void>;
  listPayroll(month: number, year: number): Promise<PayrollRecord[]>;
  /** Semua gaji tersimpan dalam satu tahun (untuk kuota absen tahunan lewat pastAbsencesInYear). */
  listPayrollYear(year: number): Promise<PayrollRecord[]>;
  /** Simpan seluruh gaji satu periode secara atomik. lock = kunci (PAID) dan catat potongan kasbon. Galat: order_locked bila periode sudah dikunci. */
  savePayrollPeriod(month: number, year: number, rows: PayrollRecordInput[], lock: boolean): Promise<void>;
  /** Buka kunci periode (khusus pemilik/admin); mengembalikan jumlah catatan yang dibuka. */
  unlockPayroll(month: number, year: number): Promise<number>;
  /** Semua karyawan outlet ini, termasuk nonaktif. Untuk layar pengelolaan. */
  listManagedEmployees(): Promise<ManagedEmployee[]>;
  /** Tambah atau ubah karyawan (kasir atau manajer). Peran pemilik tidak diatur dari sini. */
  saveEmployee(input: EmployeeInput): Promise<ManagedEmployee>;
  /** Tautkan karyawan ke peran kustom (roleId dari listRoles) atau lepas tautan dengan null. Hanya pemilik/manajer. Galat: not_found (karyawan atau peran). */
  setEmployeeRoleId(employeeId: string, roleId: string | null): Promise<ManagedEmployee>;
  listPaymentMethods(): Promise<PaymentMethod[]>;

  currentShift(): Promise<Shift | null>;
  openShift(input: { id: string; cashierId: string; openingCash: number }): Promise<Shift>;
  closeShift(input: { shiftId: string; counted: number; closedBy: string }): Promise<ShiftReport>;
  /** Ringkasan shift tanpa menutupnya: penerimaan per metode, kas, produk terjual. Bisa dipanggil berulang. */
  shiftSummary(shiftId: string): Promise<ShiftReport>;
  /** Catat kas masuk/keluar di laci pada shift yang terbuka. Jumlah > 0 dan alasan wajib; batas kas keluar harian dijaga server. */
  addCashMovement(input: { id: string; shiftId: string; kind: 'in' | 'out'; amount: number; reason: string; employeeId?: string }): Promise<CashMovement>;
  listCashMovements(shiftId: string): Promise<CashMovement[]>;
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
  /** Baris pesanan yang harganya diubah kasir (pesanan dibuka dalam rentang), terbaru dulu. Pesanan batal ikut dengan statusnya. */
  listPriceChanges(range: SalesRange): Promise<PriceChange[]>;
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
  /**
   * Teruskan baris pesanan yang belum terkirim ke stasiun masing-masing (idempoten). Hanya baris yang produknya punya stasiun aktif.
   * Mengembalikan baris yang BARU diteruskan supaya kasir bisa mencetak tiketnya. Pesanan harus sudah tersimpan di server.
   */
  kitchenSend(orderId: string): Promise<{ sent: number; lines: SentLine[] }>;
  // ---------- stasiun cetak (Dapur, Bar, Label) ----------
  /** Stasiun outlet ini (termasuk yang nonaktif), urut. Kosong bila belum ada atau database belum menerima migrasi 0029. */
  listPrintStations(): Promise<PrintStation[]>;
  savePrintStation(input: PrintStationInput): Promise<PrintStation>;
  /** Hapus stasiun; produk yang menunjuk ke stasiun ini kembali tanpa stasiun. */
  removePrintStation(id: string): Promise<void>;
  // ---------- catatan siap pakai (kategori catatan) ----------
  /** Catatan siap pakai outlet ini (termasuk yang nonaktif). Kosong bila belum ada atau database belum menerima migrasi 0030. */
  listNotePresets(): Promise<NotePreset[]>;
  /** Buat (tanpa id) atau ubah (dengan id). Kategori + isi yang sama (tanpa membedakan huruf besar/kecil) ditolak. */
  saveNotePreset(input: NotePresetInput): Promise<NotePreset>;
  removeNotePreset(id: string): Promise<void>;
  /** Petakan produk ke stasiun (atau lepas dengan null): per daftar produk dan/atau semua produk satu kategori. Varian ikut induknya. */
  assignProductsToStation(input: { stationId: string | null; productIds?: string[]; categoryId?: string }): Promise<{ changed: number }>;
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

  // ---------- satuan ganda ----------
  /** Satuan satu barang (dasar dulu), beserta penanda sudah dipakai. */
  listProductUnits(productId: string): Promise<ProductUnitRow[]>;
  /** Tambah atau ubah satuan lain suatu barang (pemilik/admin/manajer). Nama satuan baru dibuat otomatis. */
  saveProductUnit(input: ProductUnitInput): Promise<void>;
  /** Arsipkan satuan lain yang belum dipakai. Mengembalikan false bila tidak ada. */
  removeProductUnit(productId: string, unitId: string): Promise<boolean>;

  // ---------- transfer stok ----------
  /** Lokasi stok aktif (outlet dan gudang) yang boleh dikelola. */
  listStockLocations(): Promise<StockLocation[]>;
  /** Transfer terbaru dulu. */
  listStockTransfers(): Promise<StockTransfer[]>;
  /** Kirim: stok keluar dari lokasi asal sekarang, status dalam perjalanan. Id yang sama dikirim ulang tidak menggandakan. */
  createStockTransfer(input: StockTransferInput): Promise<{ number: string }>;
  /** Terima: stok masuk ke lokasi tujuan dengan biaya rata-rata saat dikirim. */
  receiveStockTransfer(id: string): Promise<void>;
  /** Batalkan selama masih dalam perjalanan: stok kembali ke lokasi asal. */
  cancelStockTransfer(id: string): Promise<void>;

  // ---------- laporan promo ----------
  /** Potongan yang tercatat pada pesanan lunas yang ditutup dalam rentang [from, to). Hanya baca. */
  listDiscountUses(range: { from: string; to: string }): Promise<DiscountUse[]>;
}


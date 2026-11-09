import type {
  Category, CatalogInput, Department, CatalogProduct, Employee, OrderDraft, Order, OutletContext, PaymentInput, PaymentMethod, Product, ProductInput,
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
  listPaymentMethods(): Promise<PaymentMethod[]>;

  currentShift(): Promise<Shift | null>;
  openShift(input: { id: string; cashierId: string; openingCash: number }): Promise<Shift>;
  closeShift(input: { shiftId: string; counted: number; closedBy: string }): Promise<ShiftReport>;

  /** setara op order.upsert: simpan pesanan (status open), menghitung ulang angka dengan computeOrder */
  saveOrder(draft: OrderDraft, cashierId: string): Promise<Order>;
  /** setara op payment.add. Order jadi paid bila lunas. */
  addPayment(orderId: string, payment: PaymentInput): Promise<Order>;
  voidUnpaidOrder(orderId: string, reason: string, authorizedBy: string): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  listOrders(q?: { status?: Order['status']; from?: string; to?: string; limit?: number }): Promise<Order[]>;
  nextOrderNumber(): Promise<string>;

  salesSummary(range: SalesRange): Promise<SalesSummary>;
}

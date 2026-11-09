import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataLayer } from './data';
import { DataError } from './types';
import type {
  CatalogInput, CatalogProduct, Category, Department, ManagedEmployee, Employee, Order, OrderDraft, OutletContext, PaymentMethod, Product, ProductInput, SalesRange, SalesSummary,
  Shift, ShiftReport,
} from './types';
import type { OrderType } from './order-calc';
import { computeOrder } from './order-calc';
import { formatOrderNumber, localDateKey } from './order-number';
import { roundToStep } from './money';
import { newId } from './id';
import { assembleCatalog, variantProductName, variantsProblem } from './variants';
import {
  buildOrderPayload, mapDbError, mapOpError, nextSeq, payloadFromStored, summarizeSales, toOrder, toProduct, toShift,
} from './supabase-map';
import type { Row } from './supabase-map';

export interface SupabaseDataOptions {
  /** Perangkat kasir (pos.devices.id). Kosong: dicari perangkat aktif milik pengguna yang sedang masuk. */
  deviceId?: string;
  /** Outlet tujuan bila tidak ada perangkat (dashboard). Kosong: outlet aktif pertama yang terlihat. */
  outletId?: string;
  now?: () => Date;
}

const PRODUCT_SELECT =
  'id,name,category_id,kind,is_active,show_in_menu,is_favorite,track_stock,parent_id,is_sellable,product_units(id,price,sku,is_base,deleted_at)';
const ORDER_SELECT =
  'id,number,order_type,table_id,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,' +
  'order_items(id,product_id,name,qty,unit_price,line_total,note,sort,voided_at),' +
  'payments(id,method_id,amount,tendered,change_given,status,paid_at,payment_methods(name,kind))';
/** Untuk membangun ulang payload op: semua kolom yang dibutuhkan _apply_op. */
const ORDER_RAW_SELECT =
  'id,number,order_type,table_id,customer_id,guest_count,label,note,queue_no,shift_id,cashier_id,status,subtotal,discount_total,service_charge,tax_total,rounding,total,paid_total,version,opened_at,closed_at,client_created_at,' +
  'order_items(id,product_id,product_unit_id,name,sku,qty,unit_price,extras_total,discount,tax_amount,line_total,note,is_free,sort,voided_at,void_reason),' +
  'order_discounts(id,order_item_id,source,promotion_id,coupon_id,points_used,amount,authorized_by),' +
  'order_tax_lines(tax_id,name,rate,base_amount,amount)';

interface Resolved {
  ctx: OutletContext;
  orgId: string;
  device: { id: string; code: string } | null;
}

/**
 * DataLayer nyata di atas Supabase (schema `pos`). Versi ONLINE: dipakai dashboard dan POS web.
 *  - baca lewat tabel (dijaga RLS), tulis transaksi lewat RPC pos.sync_push (aturan bisnis ada di database)
 *  - PIN lewat RPC pos.verify_pin; hash PIN tidak pernah keluar dari server
 * Tablet offline-first (Expo) memakai pos.sync_pull + antrean lokal; tanda tangan DataLayer sama.
 */
export function createSupabaseData(client: SupabaseClient, opts: SupabaseDataOptions = {}): DataLayer {
  const now = opts.now ?? (() => new Date());
  const db = () => client.schema('pos');

  function must<T>(res: { data: T | null; error: { code?: string; message?: string } | null }): T {
    if (res.error) throw mapDbError(res.error);
    return res.data as T;
  }

  /** Ambil semua baris halaman demi halaman (PostgREST membatasi 1000 baris per permintaan). */
  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const rows = must(await build(from, from + page - 1)) ?? [];
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }

  let resolved: Promise<Resolved> | null = null;
  const resolve = (): Promise<Resolved> => {
    resolved ??= load().catch((e) => { resolved = null; throw e; });
    return resolved;
  };

  async function load(): Promise<Resolved> {
    const { data: u } = await client.auth.getUser();
    const userId = u.user?.id;
    if (!userId) throw new DataError('forbidden', 'Belum masuk. Silakan masuk dulu');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dq: any = db().from('devices').select('id,org_id,outlet_id,code').eq('is_active', true);
    dq = opts.deviceId ? dq.eq('id', opts.deviceId) : dq.eq('user_id', userId);
    const device = ((must(await dq.order('created_at').limit(1)) as Row[] | null) ?? [])[0] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let oq: any = db().from('outlets').select('id,org_id,code,name,timezone').is('deleted_at', null).eq('is_active', true);
    if (device) oq = oq.eq('id', device.outlet_id);
    else if (opts.outletId) oq = oq.eq('id', opts.outletId);
    const outlet = ((must(await oq.order('created_at').limit(1)) as Row[] | null) ?? [])[0];
    if (!outlet) throw new DataError('not_found', 'Akunmu belum terhubung ke outlet mana pun');

    const [org, st, taxes] = await Promise.all([
      db().from('orgs').select('name').eq('id', outlet.org_id).single(),
      db().from('outlet_settings').select('*').eq('outlet_id', outlet.id).single(),
      db().from('taxes').select('id,name,rate').eq('is_default', true).is('deleted_at', null),
    ]);
    const s = must(st) as Row;
    const ctx: OutletContext = {
      orgName: (must(org) as Row).name, outletId: outlet.id, outletCode: outlet.code, outletName: outlet.name,
      timezone: outlet.timezone, deviceCode: device?.code ?? '-',
      settings: {
        taxCalc: s.tax_calc, taxMode: s.tax_mode, serviceChargePct: Number(s.service_charge_pct),
        serviceChargeTaxable: !!s.service_charge_taxable, serviceChargeOrderTypes: (s.service_charge_order_types ?? []) as OrderType[],
        roundingCashStep: Number(s.rounding_cash_step), roundingNoncashStep: Number(s.rounding_noncash_step),
        requireOpenShift: !!s.require_open_shift, allowNegativeStock: !!s.allow_negative_stock,
      },
      taxes: ((must(taxes) as Row[] | null) ?? []).map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) })),
    };
    return { ctx, orgId: outlet.org_id, device: device ? { id: device.id, code: device.code } : null };
  }

  async function requireDevice(): Promise<{ r: Resolved; deviceId: string }> {
    const r = await resolve();
    if (!r.device) throw new DataError('invalid', 'Perangkat kasir belum didaftarkan untuk akun ini');
    return { r, deviceId: r.device.id };
  }

  async function pushOps(deviceId: string, ops: { type: string; entityId?: string; payload: unknown }[]): Promise<void> {
    const body = ops.map((o) => ({ op_id: newId(), type: o.type, entity_id: o.entityId ?? null, payload: o.payload }));
    const { data, error } = await db().rpc('sync_push', { p_device: deviceId, p_ops: body });
    if (error) throw mapDbError(error);
    for (const r of (data ?? []) as { status: string; error?: string }[]) {
      if (r.status === 'rejected') throw mapOpError(r.error ?? '');
    }
  }

  // ---- penomoran: awalan {outlet}/{perangkat}/{yymmdd}/ harus cocok dengan aturan server ----
  const seqCache = new Map<string, number>();
  async function reserveNumber(r: Resolved, peek: boolean): Promise<string> {
    const at = now();
    const base = formatOrderNumber(r.ctx.outletCode, r.ctx.deviceCode, at, 1, r.ctx.timezone);
    const prefix = base.slice(0, base.lastIndexOf('/') + 1);
    const day = localDateKey(at, r.ctx.timezone);
    const rows = must(await db().from('orders').select('number').eq('outlet_id', r.ctx.outletId).like('number', `${prefix}%`)
      .order('number', { ascending: false }).limit(1)) as Row[] | null;
    const seq = nextSeq((rows ?? []).map((x) => x.number), seqCache.get(`${prefix}${day}`) ?? 0);
    if (!peek) seqCache.set(`${prefix}${day}`, seq);
    return formatOrderNumber(r.ctx.outletCode, r.ctx.deviceCode, at, seq, r.ctx.timezone);
  }

  async function fetchOrderRaw(id: string): Promise<Row | null> {
    return must(await db().from('orders').select(ORDER_RAW_SELECT).eq('id', id).maybeSingle()) as Row | null;
  }

  async function fetchOrders(f: (qb: any) => any, limit?: number): Promise<Order[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (limit !== undefined) {
      const rows = must(await f(db().from('orders').select(ORDER_SELECT)).order('opened_at', { ascending: false }).limit(limit)) as Row[] | null;
      return (rows ?? []).map(toOrder);
    }
    const rows = await fetchAll<Row>((from, to) =>
      f(db().from('orders').select(ORDER_SELECT)).order('opened_at', { ascending: false }).order('id').range(from, to));
    return rows.map(toOrder);
  }

  function shiftQuery(deviceId: string) {
    return db().from('shifts').select('*').eq('device_id', deviceId);
  }

  const self: DataLayer = {
    async getContext() {
      return JSON.parse(JSON.stringify((await resolve()).ctx)) as OutletContext;
    },

    // ---------- katalog ----------
    async listCategories() {
      const [cats, ing] = await Promise.all([
        fetchAll<Row>((f, t) => db().from('categories').select('id,name,sort,department_id').is('deleted_at', null).order('sort').order('name').order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('products').select('category_id').eq('kind', 'ingredient').not('category_id', 'is', null).is('deleted_at', null).order('id').range(f, t)),
      ]);
      const ingredientCats = new Set(ing.map((r) => r.category_id as string));
      return cats.filter((c) => !ingredientCats.has(c.id)).map((c): Category => ({ id: c.id, name: c.name, sort: Number(c.sort ?? 0), departmentId: c.department_id ?? null }));
    },
    async saveCategory(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama kategori wajib diisi');
      const { orgId } = await resolve();
      const cols = 'id,name,sort,department_id';
      const out = (row: Row): Category => ({ id: row.id, name: row.name, sort: Number(row.sort ?? 0), departmentId: row.department_id ?? null });
      const clash = (e: unknown): never => { throw e instanceof DataError && /duplicate|unique|already/i.test(e.message) ? new DataError('invalid', `Kategori "${name}" sudah ada`) : e; };
      try {
        if (input.id) {
          const patch: Record<string, unknown> = { name };
          if (input.departmentId !== undefined) patch.department_id = input.departmentId;
          const row = must(await db().from('categories').update(patch).eq('id', input.id).is('deleted_at', null).select(cols).maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Kategori tidak ditemukan');
          return out(row);
        }
        const sort = (await self.listCategories()).length + 1;
        return out(must(await db().from('categories').insert({ id: newId(), org_id: orgId, name, sort, department_id: input.departmentId ?? null }).select(cols).single()) as Row);
      } catch (e) { return clash(e); }
    },
    async deleteCategory(id) {
      const cur = must(await db().from('categories').select('name').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Kategori tidak ditemukan');
      must(await db().from('products').update({ category_id: null }).eq('category_id', id));
      // nama dilepas agar bisa dipakai lagi (unik per organisasi, baris terhapus tetap ikut hitungan)
      must(await db().from('categories').update({ deleted_at: new Date().toISOString(), name: `${cur.name} (dihapus ${id.slice(0, 8)})` }).eq('id', id));
    },
    async categoryProductCounts() {
      const rows = await fetchAll<Row>((f, t) => db().from('products').select('category_id').in('kind', ['goods', 'service']).is('parent_id', null).not('category_id', 'is', null).is('deleted_at', null).order('id').range(f, t));
      const out: Record<string, number> = {};
      for (const r of rows) out[r.category_id] = (out[r.category_id] ?? 0) + 1;
      return out;
    },
    async listDepartments() {
      const rows = await fetchAll<Row>((f, t) => db().from('departments').select('id,name,sort').is('deleted_at', null).order('sort').order('name').order('id').range(f, t));
      return rows.map((r): Department => ({ id: r.id, name: r.name, sort: Number(r.sort ?? 0) }));
    },
    async saveDepartment(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama departemen wajib diisi');
      const { orgId } = await resolve();
      const out = (row: Row): Department => ({ id: row.id, name: row.name, sort: Number(row.sort ?? 0) });
      try {
        if (input.id) {
          const row = must(await db().from('departments').update({ name }).eq('id', input.id).is('deleted_at', null).select('id,name,sort').maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Departemen tidak ditemukan');
          return out(row);
        }
        const sort = (await self.listDepartments()).length + 1;
        return out(must(await db().from('departments').insert({ id: newId(), org_id: orgId, name, sort }).select('id,name,sort').single()) as Row);
      } catch (e) { throw e instanceof DataError && /duplicate|unique|already/i.test(e.message) ? new DataError('invalid', `Departemen "${name}" sudah ada`) : e; }
    },
    async deleteDepartment(id) {
      const cur = must(await db().from('departments').select('name').eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!cur) throw new DataError('not_found', 'Departemen tidak ditemukan');
      must(await db().from('categories').update({ department_id: null }).eq('department_id', id));
      // nama dilepas agar bisa dipakai lagi (unik per organisasi, baris terhapus tetap ikut hitungan)
      must(await db().from('departments').update({ deleted_at: new Date().toISOString(), name: `${cur.name} (dihapus ${id.slice(0, 8)})` }).eq('id', id));
    },
    async listProducts(q = {}) {
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(PRODUCT_SELECT).eq('is_sellable', true).in('kind', ['goods', 'service']).is('deleted_at', null);
        if (!q.includeInactive) qb = qb.eq('is_active', true).eq('show_in_menu', true);
        if (q.categoryId) qb = qb.eq('category_id', q.categoryId);
        return qb.order('name').order('id').range(f, t);
      });
      const s = q.search?.trim().toLowerCase();
      return rows.map(toProduct).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s));
    },
    async getProduct(id) {
      const row = must(await db().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle()) as Row | null;
      return row ? toProduct(row) : null;
    },
    async saveProduct(input: ProductInput) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      if (!Number.isFinite(input.price) || input.price < 0) throw new DataError('invalid', 'Harga tidak boleh negatif');
      const price = Math.round(input.price);
      const sku = input.sku?.trim() || null;
      const { orgId } = await resolve();
      try {
        if (input.id) {
          const patch: Row = { name, category_id: input.categoryId };
          if (input.kind) patch.kind = input.kind;
          if (input.trackStock !== undefined) patch.track_stock = input.trackStock;
          if (input.isFavorite !== undefined) patch.is_favorite = input.isFavorite;
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          const row = must(await db().from('products').update(patch).eq('id', input.id).select('id').maybeSingle()) as Row | null;
          if (!row) throw new DataError('not_found', 'Produk tidak ditemukan');
          must(await db().from('product_units').update({ price, sku }).eq('product_id', input.id).eq('is_base', true).is('deleted_at', null).select('id'));
          return (await self.getProduct(input.id))!;
        }
        const unit = ((must(await db().from('units').select('id').eq('name', 'pcs').is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
        if (!unit) throw new DataError('not_found', "Satuan 'pcs' belum ada di org ini");
        const id = newId();
        must(await db().from('products').insert({
          id, org_id: orgId, kind: input.kind ?? 'goods', name, category_id: input.categoryId, base_unit_id: unit.id,
          is_sellable: true, show_in_menu: true, track_stock: input.trackStock ?? true, is_favorite: input.isFavorite ?? false,
          is_active: input.isActive ?? true,
        }));
        must(await db().from('product_units').insert({ org_id: orgId, product_id: id, unit_id: unit.id, conversion: 1, is_base: true, price, sku }));
        return (await self.getProduct(id))!;
      } catch (e) {
        if (e instanceof DataError && /sudah ada/.test(e.message)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
        throw e;
      }
    },
    async setProductActive(id, active) {
      const row = must(await db().from('products').update({ is_active: active }).eq('id', id).select('id').maybeSingle()) as Row | null;
      if (!row) throw new DataError('not_found', 'Produk tidak ditemukan');
    },

    // ---------- katalog gaya pemilik (produk + varian) ----------
    async listCatalog(q = {}) {
      const rows = await fetchAll<Row>((f, t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qb: any = db().from('products').select(PRODUCT_SELECT).in('kind', ['goods', 'service']).is('deleted_at', null);
        if (q.categoryId) qb = qb.eq('category_id', q.categoryId);
        return qb.order('name').order('id').range(f, t);
      });
      let list = assembleCatalog(rows.map(toProduct));
      if (!q.includeInactive) list = list.filter((p) => p.isActive);
      const s = q.search?.trim().toLowerCase();
      if (s) list = list.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s) || p.variants.some((v) => v.label.toLowerCase().includes(s) || (v.sku ?? '').toLowerCase().includes(s)));
      return list;
    },
    async getCatalogProduct(id) {
      const row = must(await db().from('products').select(PRODUCT_SELECT).eq('id', id).is('deleted_at', null).maybeSingle()) as Row | null;
      if (!row) return null;
      const parentId = (row.parent_id as string | null) ?? (row.is_sellable === false ? (row.id as string) : null);
      if (!parentId) return assembleCatalog([toProduct(row)])[0] ?? null;
      const head = parentId === row.id ? row : (must(await db().from('products').select(PRODUCT_SELECT).eq('id', parentId).maybeSingle()) as Row | null);
      const kids = (must(await db().from('products').select(PRODUCT_SELECT).eq('parent_id', parentId).is('deleted_at', null)) as Row[] | null) ?? [];
      return assembleCatalog([...(head ? [toProduct(head)] : []), ...kids.map(toProduct)])[0] ?? null;
    },
    async saveCatalogProduct(input: CatalogInput): Promise<CatalogProduct> {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama produk wajib diisi');
      const problem = variantsProblem(input.variants);
      if (problem) throw new DataError('invalid', problem);
      const kind = input.kind ?? 'goods';
      if (input.variants.length === 0) {
        if (input.id) { // dari produk berarian menjadi tunggal: varian lama diarsipkan, induk dijual langsung
          const kids = (must(await db().from('products').select('id').eq('parent_id', input.id).is('deleted_at', null)) as Row[] | null) ?? [];
          if (kids.length) {
            must(await db().from('products').update({ deleted_at: now().toISOString(), is_active: false }).eq('parent_id', input.id));
            must(await db().from('products').update({ is_sellable: true, show_in_menu: true }).eq('id', input.id));
          }
        }
        const p = await self.saveProduct({ id: input.id, name, categoryId: input.categoryId, price: input.price, sku: input.sku, kind, trackStock: input.trackStock, isFavorite: input.isFavorite, isActive: input.isActive });
        return (await self.getCatalogProduct(p.id))!;
      }
      for (const v of input.variants) if (!Number.isFinite(v.price) || v.price < 0) throw new DataError('invalid', 'Harga varian tidak valid');
      const { orgId } = await resolve();
      const unit = ((must(await db().from('units').select('id').eq('name', 'pcs').is('deleted_at', null).limit(1)) as Row[] | null) ?? [])[0];
      if (!unit) throw new DataError('not_found', "Satuan 'pcs' belum ada di org ini");
      const parentId = input.id ?? newId();
      const trackStock = input.trackStock ?? true;
      const isFavorite = input.isFavorite ?? false;
      const groupActive = input.isActive ?? true;
      try {
        const existing = input.id ? (must(await db().from('products').select('id').eq('id', input.id).maybeSingle()) as Row | null) : null;
        if (!existing) {
          must(await db().from('products').insert({ id: parentId, org_id: orgId, kind, name, category_id: input.categoryId, base_unit_id: unit.id,
            is_sellable: false, show_in_menu: false, track_stock: false, is_favorite: isFavorite, is_active: groupActive }));
        } else {
          must(await db().from('products').update({ name, category_id: input.categoryId, kind, is_sellable: false, show_in_menu: false, is_favorite: isFavorite, is_active: groupActive }).eq('id', parentId));
        }
        const kids = (must(await db().from('products').select('id').eq('parent_id', parentId).is('deleted_at', null)) as Row[] | null) ?? [];
        const kidIds = new Set(kids.map((k) => k.id as string));
        const keep = new Set(input.variants.map((v) => v.id).filter((x): x is string => !!x && kidIds.has(x)));
        const drop = [...kidIds].filter((id) => !keep.has(id));
        if (drop.length) must(await db().from('products').update({ deleted_at: now().toISOString(), is_active: false }).in('id', drop));
        for (const v of input.variants) {
          const childName = variantProductName(name, v.label);
          const price = Math.round(v.price);
          const sku = v.sku?.trim() || null;
          const active = groupActive && (v.isActive ?? true);
          if (v.id && kidIds.has(v.id)) {
            must(await db().from('products').update({ name: childName, category_id: input.categoryId, kind, is_active: active, track_stock: trackStock, is_favorite: isFavorite }).eq('id', v.id));
            must(await db().from('product_units').update({ price, sku }).eq('product_id', v.id).eq('is_base', true).is('deleted_at', null).select('id'));
          } else {
            const id = newId();
            must(await db().from('products').insert({ id, org_id: orgId, kind, name: childName, category_id: input.categoryId, base_unit_id: unit.id, parent_id: parentId,
              is_sellable: true, show_in_menu: true, track_stock: trackStock, is_favorite: isFavorite, is_active: active }));
            must(await db().from('product_units').insert({ org_id: orgId, product_id: id, unit_id: unit.id, conversion: 1, is_base: true, price, sku }));
          }
        }
      } catch (e) {
        if (e instanceof DataError && /sudah ada/.test(e.message)) throw new DataError('invalid', 'SKU sudah dipakai produk lain');
        throw e;
      }
      return (await self.getCatalogProduct(parentId))!;
    },
    async setCatalogActive(id, active) {
      const rows = (must(await db().from('products').update({ is_active: active }).or(`id.eq.${id},parent_id.eq.${id}`).is('deleted_at', null).select('id')) as Row[] | null) ?? [];
      if (rows.length === 0) throw new DataError('not_found', 'Produk tidak ditemukan');
    },

    // ---------- karyawan dan metode bayar ----------
    async listEmployees() {
      const { ctx } = await resolve();
      const rows = must(await db().from('employees').select('id,name,role,employee_outlets!inner(outlet_id)')
        .eq('employee_outlets.outlet_id', ctx.outletId).eq('is_active', true).is('deleted_at', null)
        .in('role', ['owner', 'manager', 'cashier']).order('name')) as Row[] | null;
      return (rows ?? []).map((e): Employee => ({ id: e.id, name: e.name, role: e.role }));
    },
    async listManagedEmployees() {
      const { ctx } = await resolve();
      const rows = must(await db().from('employees').select('id,name,role,is_active,employee_outlets!inner(outlet_id)')
        .eq('employee_outlets.outlet_id', ctx.outletId).is('deleted_at', null)
        .in('role', ['owner', 'manager', 'cashier']).order('name')) as Row[] | null;
      return (rows ?? []).map((e): ManagedEmployee => ({ id: e.id, name: e.name, role: e.role, isActive: !!e.is_active }));
    },
    async saveEmployee(input) {
      const name = input.name.trim();
      if (!name) throw new DataError('invalid', 'Nama karyawan wajib diisi');
      if (input.role !== 'manager' && input.role !== 'cashier') throw new DataError('invalid', 'Peran tidak dikenal');
      const { orgId, ctx } = await resolve();
      const clash = (await self.listManagedEmployees()).some((x) => x.id !== input.id && x.isActive && x.name.toLowerCase() === name.toLowerCase());
      if (clash) throw new DataError('invalid', `Sudah ada karyawan aktif bernama "${name}"`);
      const out = (r: Row): ManagedEmployee => ({ id: r.id, name: r.name, role: r.role, isActive: !!r.is_active });
      if (input.id) {
        const patch: Record<string, unknown> = { name, role: input.role };
        if (input.isActive !== undefined) patch.is_active = input.isActive;
        const row = must(await db().from('employees').update(patch).eq('id', input.id).neq('role', 'owner').is('deleted_at', null).select('id,name,role,is_active').maybeSingle()) as Row | null;
        if (!row) throw new DataError('not_found', 'Karyawan tidak ditemukan, atau datanya hanya bisa diubah pemilik');
        return out(row);
      }
      const id = newId();
      const row = must(await db().from('employees').insert({ id, org_id: orgId, name, role: input.role, is_active: input.isActive ?? true }).select('id,name,role,is_active').single()) as Row;
      must(await db().from('employee_outlets').insert({ employee_id: id, outlet_id: ctx.outletId, org_id: orgId }));
      return out(row);
    },
    async verifyPin(employeeId, pin) {
      const { r } = await requireDevice();
      const { data, error } = await db().rpc('verify_pin', { p_device: r.device!.id, p_employee: employeeId, p_pin: pin });
      if (error) throw mapDbError(error);
      return data === true;
    },
    async setEmployeePin(employeeId, pin) {
      if (!/^\d{6}$/.test(pin)) throw new DataError('invalid', 'PIN harus 6 digit angka');
      const { error } = await db().rpc('admin_set_pin', { p_employee: employeeId, p_pin: pin });
      if (error) throw mapDbError(error);
    },
    async listPaymentMethods() {
      const rows = must(await db().from('payment_methods').select('id,code,name,kind,requires_online')
        .eq('is_active', true).is('deleted_at', null).order('sort').order('code')) as Row[] | null;
      return (rows ?? []).map((m): PaymentMethod => ({ id: m.id, code: m.code, name: m.name, kind: m.kind, requiresOnline: !!m.requires_online }));
    },

    // ---------- shift ----------
    async currentShift() {
      const r = await resolve();
      if (!r.device) return null;
      const row = must(await shiftQuery(r.device.id).eq('status', 'open').maybeSingle()) as Row | null;
      return row ? toShift(row) : null;
    },
    async openShift({ id, cashierId, openingCash }) {
      const { deviceId } = await requireDevice();
      if (openingCash < 0) throw new DataError('bad_amount', 'Modal awal tidak boleh negatif');
      if (await self.currentShift()) throw new DataError('shift_already_open', 'Masih ada shift yang terbuka di perangkat ini');
      await pushOps(deviceId, [{
        type: 'shift.open', entityId: id,
        payload: { id, cashier_id: cashierId, opened_at: now().toISOString(), opening_cash: Math.round(openingCash) },
      }]);
      return toShift(must(await db().from('shifts').select('*').eq('id', id).single()) as Row);
    },
    async closeShift({ shiftId, counted, closedBy }) {
      const { deviceId } = await requireDevice();
      const before = must(await db().from('shifts').select('*').eq('id', shiftId).maybeSingle()) as Row | null;
      if (!before) throw new DataError('not_found', 'Shift tidak ditemukan');
      if (before.status === 'closed') throw new DataError('invalid', 'Shift sudah ditutup');
      await pushOps(deviceId, [{
        type: 'shift.close', entityId: shiftId,
        payload: { id: shiftId, closed_by: closedBy, counted: Math.round(counted), closed_at: now().toISOString() },
      }]);
      const [shiftRow, pays, moves, items, paidCount] = await Promise.all([
        db().from('shifts').select('*').eq('id', shiftId).single(),
        fetchAll<Row>((f, t) => db().from('payments').select('amount,payment_methods(kind)').eq('shift_id', shiftId).eq('status', 'succeeded').order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('cash_movements').select('kind,amount').eq('shift_id', shiftId).order('id').range(f, t)),
        fetchAll<Row>((f, t) => db().from('order_items').select('product_id,name,qty,line_total,orders!inner(shift_id,status)')
          .eq('orders.shift_id', shiftId).eq('orders.status', 'paid').is('voided_at', null).order('id').range(f, t)),
        db().from('orders').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId).eq('status', 'paid'),
      ]);
      const shift = toShift(must(shiftRow) as Row);
      const sumOf = (rows: Row[], f: (r: Row) => boolean) => rows.filter(f).reduce((a, x) => a + Number(x.amount), 0);
      const cashSales = sumOf(pays, (p) => p.payment_methods?.kind === 'cash');
      const otherSales = sumOf(pays, (p) => p.payment_methods?.kind !== 'cash');
      const sold = new Map<string, { productId: string; name: string; qty: number; amount: number }>();
      for (const i of items) {
        const cur = sold.get(i.product_id) ?? { productId: i.product_id, name: i.name, qty: 0, amount: 0 };
        cur.qty += Number(i.qty); cur.amount += Number(i.line_total); sold.set(i.product_id, cur);
      }
      return {
        shift, expectedCash: shift.expectedCash ?? 0, counted: shift.counted ?? Math.round(counted), variance: shift.variance ?? 0,
        cashSales, otherSales,
        cashIn: sumOf(moves, (m) => m.kind === 'in'), cashOut: sumOf(moves, (m) => m.kind === 'out'),
        orderCount: paidCount.count ?? 0,
        productsSold: [...sold.values()].sort((a, b) => b.amount - a.amount),
      } satisfies ShiftReport;
    },

    // ---------- pesanan ----------
    async nextOrderNumber() {
      return reserveNumber(await resolve(), true);
    },
    async saveOrder(draft: OrderDraft, cashierId: string) {
      const { r, deviceId } = await requireDevice();
      const shift = await self.currentShift();
      if (r.ctx.settings.requireOpenShift && !shift) throw new DataError('no_open_shift', 'Buka kasir dulu sebelum membuat pesanan');
      if (draft.items.length === 0) throw new DataError('invalid', 'Pesanan masih kosong');
      if (draft.items.some((i) => i.qty <= 0)) throw new DataError('invalid', 'Jumlah item harus lebih dari 0');

      const existing = must(await db().from('orders').select('id,number,status,paid_total,version,opened_at').eq('id', draft.id).maybeSingle()) as Row | null;
      if (existing && (existing.status !== 'open' || Number(existing.paid_total) > 0)) {
        throw new DataError('order_locked', 'Pesanan sudah ada pembayaran, tidak bisa diubah');
      }
      const productIds = [...new Set(draft.items.map((i) => i.productId))];
      const units = must(await db().from('product_units').select('id,product_id,sku').in('product_id', productIds).eq('is_base', true).is('deleted_at', null)) as Row[] | null;
      const unitOf = new Map((units ?? []).map((u) => [u.product_id as string, u]));
      const missing = productIds.find((p) => !unitOf.has(p));
      if (missing) throw new DataError('not_found', 'Ada produk di pesanan yang sudah tidak tersedia');

      const calc = computeOrder({
        orderType: draft.type, orderDiscount: draft.orderDiscount, roundingStep: 0, settings: r.ctx.settings,
        items: draft.items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice })),
        orderTaxes: r.ctx.taxes.map((t) => ({ taxId: t.id, name: t.name, rate: t.rate })),
      });
      const items = draft.items.map((i) => ({
        id: i.id, productId: i.productId, productUnitId: unitOf.get(i.productId)!.id as string, name: i.name,
        sku: (unitOf.get(i.productId)!.sku as string | null) ?? null, qty: i.qty, unitPrice: i.unitPrice, note: i.note ?? null,
      }));

      for (let attempt = 0; ; attempt++) {
        const number = existing ? (existing.number as string) : await reserveNumber(r, false);
        const payload = buildOrderPayload({
          id: draft.id, number, orderType: draft.type, tableId: draft.tableId, label: draft.label, shiftId: shift?.id,
          cashierId, openedAt: existing ? (existing.opened_at as string) : now().toISOString(),
          baseVersion: existing ? Number(existing.version) : undefined, calc, orderDiscount: draft.orderDiscount ?? 0,
          authorizedBy: cashierId, items,
        });
        try {
          await pushOps(deviceId, [{ type: 'order.upsert', entityId: draft.id, payload }]);
          break;
        } catch (e) {
          // nomor bentrok (mis. dua tab membuat pesanan bersamaan): ambil nomor berikutnya sekali lagi
          if (!existing && attempt < 2 && e instanceof DataError && /Nomor pesanan bentrok/.test(e.message)) continue;
          throw e;
        }
      }
      return (await self.getOrder(draft.id))!;
    },
    async addPayment(orderId, pay) {
      const { r, deviceId } = await requireDevice();
      const raw = await fetchOrderRaw(orderId);
      if (!raw) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (raw.status === 'void') throw new DataError('order_locked', 'Pesanan sudah dibatalkan');
      const dup = must(await db().from('payments').select('id').eq('id', pay.id).maybeSingle()) as Row | null;
      if (dup) return (await self.getOrder(orderId))!;                       // idempoten, seperti data palsu

      const method = must(await db().from('payment_methods').select('id,kind,name').eq('id', pay.methodId).maybeSingle()) as Row | null;
      if (!method) throw new DataError('not_found', 'Metode bayar tidak ditemukan');
      if (method.kind === 'gateway') throw new DataError('invalid', 'Pembayaran QRIS (DOKU) belum diaktifkan');

      // pembulatan mengikuti metode, ditentukan pada pembayaran pertama (pesanan masih open -> boleh upsert ulang)
      const ops: { type: string; entityId?: string; payload: unknown }[] = [];
      let total = Number(raw.total);
      if (Number(raw.paid_total) === 0) {
        const step = method.kind === 'cash' ? r.ctx.settings.roundingCashStep : r.ctx.settings.roundingNoncashStep;
        const base = Number(raw.total) - Number(raw.rounding);
        const rounded = step ? roundToStep(base, step) : base;
        if (rounded !== total) {
          total = rounded;
          ops.push({ type: 'order.upsert', entityId: orderId, payload: payloadFromStored(raw, rounded - base) });
        }
      }
      const balance = total - Number(raw.paid_total);
      if (pay.amount <= 0 || pay.amount > balance) throw new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
      const shift = await self.currentShift();
      ops.push({
        type: 'payment.add', entityId: pay.id,
        payload: {
          id: pay.id, order_id: orderId, method_id: pay.methodId, shift_id: shift?.id ?? raw.shift_id ?? null,
          amount: pay.amount, tendered: pay.tendered ?? pay.amount, paid_at: pay.paidAt ?? now().toISOString(),
          created_by: raw.cashier_id,
        },
      });
      await pushOps(deviceId, ops);
      return (await self.getOrder(orderId))!;
    },
    async voidUnpaidOrder(orderId, reason, authorizedBy) {
      const { deviceId } = await requireDevice();
      const o = must(await db().from('orders').select('id,status,paid_total').eq('id', orderId).maybeSingle()) as Row | null;
      if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
      if (o.status !== 'open' || Number(o.paid_total) > 0) {
        throw new DataError('order_locked', 'Hanya pesanan yang belum dibayar yang bisa dibatalkan; pesanan lunas lewat refund');
      }
      await pushOps(deviceId, [{
        type: 'order.void', entityId: orderId,
        payload: { order_id: orderId, authorized_by: authorizedBy, auth_method: 'pin', reason, voided_by: authorizedBy, voided_at: now().toISOString() },
      }]);
      return (await self.getOrder(orderId))!;
    },
    async getOrder(id) {
      const row = must(await db().from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle()) as Row | null;
      return row ? toOrder(row) : null;
    },
    async listOrders(q = {}) {
      return fetchOrders((qb) => {
        let x = qb;
        if (q.status) x = x.eq('status', q.status);
        if (q.from) x = x.gte('opened_at', q.from);
        if (q.to) x = x.lt('opened_at', q.to);
        return x;
      }, q.limit ?? 200);
    },

    // ---------- laporan ----------
    async salesSummary(range: SalesRange): Promise<SalesSummary> {
      const { ctx } = await resolve();
      const paid = await fetchOrders((qb) => qb.eq('outlet_id', ctx.outletId).eq('status', 'paid').gte('closed_at', range.from).lt('closed_at', range.to));
      return summarizeSales(paid, ctx.timezone);
    },
  };
  return self;
}

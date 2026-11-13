import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Lock, Monitor, Tag, UserCheck, UserRound, X, Minus, Settings, Plus, Save, Search, Trash2, Wifi, WifiOff, Menu, Bell, ScanBarcode, Split, Star } from 'lucide-react';
import { checkStockLimit, declaredBasePrice, groupNotePresets, noteHasText, orderTypeLabel, toggleNoteText, type NotePreset, promoProductIds, splitByItem, stockLimitMessage, extrasLineTotal, extrasPerUnit, formatRp, groupVariants, priceOverrideProblem, groupsForProduct, newId, pickedExtras, selectionProblem, taxDisplay, type CatalogTile, type ExtraGroup, type Order, type OrderType, type OutletContext, type Product, type Promotion } from '@cgpos/shared';
import { useData, usePending } from '../lib/app-data';
import { openCustomerDisplayWindow, publishCustomerDisplay } from '../lib/customer-display';
import { useAsync } from '../lib/use-async';
import { useCart, type CartPricingRules } from '../lib/cart';
import { useDevicePrefs } from '../lib/device-prefs';
import { useSession } from '../lib/session';
import { forwardNotice, forwardOrder, useTickets } from '../lib/stations';
import { TicketStrip } from './TicketHost';
import { useOnline } from '../lib/online';
import { DiscountLines, Modal, ProductPhoto } from '../ui';
import { Orders } from './Orders';
import { TablePicker } from './TablePicker';
import { DeviceSettings } from './DeviceSettings';
import { ShiftSummary } from './ShiftSummary';
import { Payment } from './Payment';
import { CustomerPicker } from './CustomerPicker';
import { DiscountDialog } from './DiscountDialog';
import { SideDrawer } from './SideDrawer';
import { Sales } from './Sales';
import { SplitBillDialog } from './SplitBillDialog';

const TYPES: { v: OrderType; label: string }[] = [
  { v: 'takeaway', label: 'Bawa pulang' }, { v: 'dine_in', label: 'Makan di tempat' }, { v: 'delivery', label: 'Antar' }, { v: 'service', label: 'Jasa' },
];
const FAV = '__favorit';
const BUNDLE = '__paket';
const PROMO = '__promo';
const NO_PROMOS: Promotion[] = [];
const LABEL_HINT: Record<OrderType, string> = {
  dine_in: 'Nama pesanan (opsional)', takeaway: 'Nama pemesan (opsional)', delivery: 'Nama dan tujuan antar (opsional)', service: 'Keterangan jasa (opsional)',
};

/** Inisial besar dua huruf sebagai pengganti foto produk */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0]?.[0] && parts[1]?.[0]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

export function Register({
  ctx,
  canOpenKitchen = false,
  onOpenKitchen,
  onOpenAttendance,
  onCloseShift,
  onLock,
}: {
  ctx: OutletContext;
  canOpenKitchen?: boolean;
  onOpenKitchen?: () => void;
  onOpenAttendance?: () => void;
  onCloseShift: () => void;
  onLock: () => void;
}) {
  const data = useData();
  const { session } = useSession();
  const tickets = useTickets();
  const online = useOnline();
  const cats = useAsync(() => data.listCategories(), [data]);
  const prods = useAsync(() => data.listProducts(), [data]);
  const extraGroups = useAsync<ExtraGroup[]>(() => data.listExtraGroups().catch(() => []), [data]);
  const waitingOrders = useAsync(() => data.listOrders({ status: 'open', limit: 100 }).catch(() => []), [data]);
  const openOrdersCount = waitingOrders.status === 'ready' ? waitingOrders.data.length : 0;
  const [extraFor, setExtraFor] = useState<Product | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [cat, setCat] = useState<string | 'all'>('all');
  const [q, setQ] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const { viewMode } = useDevicePrefs();
  /** true selama bagian yang dipisah sedang dibayar: keranjang (sisa pesanan) tidak dikosongkan setelahnya */
  const [keepCart, setKeepCart] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [picking, setPicking] = useState<Extract<CatalogTile, { kind: 'group' }> | null>(null);
  const [pickErr, setPickErr] = useState('');
  const [placing, setPlacing] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [showOrders, setShowOrders] = useState(false);
  const [ordersTab, setOrdersTab] = useState<'waiting' | 'pending'>('waiting');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const pend = usePending();
  const [notice, setNotice] = useState('');
  const [tablePick, setTablePick] = useState(false);
  const [settings, setSettings] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [custPick, setCustPick] = useState(false);
  const notePresets = useAsync<NotePreset[]>(() => data.listNotePresets().catch(() => []), [data]);
  const noteGroups = groupNotePresets(notePresets.status === 'ready' ? notePresets.data : []);
  const promos = useAsync<Promotion[]>(() => data.listPromotions({ activeOnly: true }).catch(() => []), [data]);
  const schedulesRes = useAsync(() => data.listPriceSchedules().catch(() => []), [data]);
  const tieredPricesRes = useAsync(() => data.listTieredPrices().catch(() => []), [data]);
  const groupMembersRes = useAsync(() => data.listCustomerGroupMembers().catch(() => []), [data]);

  const groupMemberMap = useMemo(() => {
    const map = new Map<string, string>();
    if (groupMembersRes.status === 'ready') {
      for (const m of groupMembersRes.data) {
        map.set(m.customerId, m.groupId);
      }
    }
    return map;
  }, [groupMembersRes]);

  const pricingRules = useMemo<CartPricingRules>(() => ({
    schedules: schedulesRes.status === 'ready' ? schedulesRes.data : undefined,
    tieredPrices: tieredPricesRes.status === 'ready' ? tieredPricesRes.data : undefined,
  }), [schedulesRes, tieredPricesRes]);

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [priceFor, setPriceFor] = useState<{ id: string; text: string; err: string } | null>(null);
  const cart = useCart(ctx, 0, promos.status === 'ready' ? promos.data : NO_PROMOS, pricingRules);

  const activePricing = useMemo<CartPricingRules>(() => ({
    schedules: schedulesRes.status === 'ready' ? schedulesRes.data : undefined,
    tieredPrices: tieredPricesRes.status === 'ready' ? tieredPricesRes.data : undefined,
    customerGroupId: cart.state.customerId ? groupMemberMap.get(cart.state.customerId) : undefined,
  }), [schedulesRes, tieredPricesRes, cart.state.customerId, groupMemberMap]);
  const [discOpen, setDiscOpen] = useState(false);
  // isi cadangan offline selagi online: metode bayar dan denah dipakai layar Bayar dan Pilih meja
  useEffect(() => { void Promise.allSettled([data.listPaymentMethods(), data.listFloors(), data.listTables(), data.listTableStatus(), data.currentShift()]); }, [data]);

  // Sinkronkan isi keranjang secara waktu-nyata ke layar pelanggan eksternal (?display=customer)
  useEffect(() => {
    if (paying) return;
    const hasItems = cart.state.lines.length > 0;
    publishCustomerDisplay({
      version: 1,
      outletName: ctx.outletName,
      outletAddress: ctx.address,
      cashierName: session.employee.name,
      phase: hasItems ? 'ordering' : 'idle',
      orderTypeLabel: hasItems ? orderTypeLabel(cart.state.type) : undefined,
      tableName: cart.state.tableName,
      customerName: cart.state.customerName ?? (cart.state.label?.trim() || undefined),
      lines: cart.state.lines.map((line) => ({
        id: line.id,
        name: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
        ...(line.extras?.length ? { extrasLabel: line.extras.map((e) => e.name).join(', ') } : {}),
        lineTotal: line.qty * line.unitPrice + extrasLineTotal(line.qty, line.extras),
      })),
      subtotal: cart.calc.subtotal,
      discountTotal: cart.calc.discountTotal,
      serviceCharge: cart.calc.serviceCharge,
      taxTotal: cart.calc.taxTotal,
      rounding: cart.calc.rounding,
      total: cart.calc.total,
      welcomeMessage: ctx.receiptHeader,
      updatedAt: new Date().toISOString(),
    });
  }, [paying, ctx, session.employee.name, cart.state, cart.calc]);

  function openCustomerScreen() {
    const res = openCustomerDisplayWindow();
    setNotice(res.opened ? 'Layar pelanggan dibuka di jendela baru.' : `Jendela pop-up diblokir. Buka manual: ${res.url}`);
  }

  const hasFav = prods.status === 'ready' && prods.data.some((p) => p.isFavorite);
  const hasBundle = prods.status === 'ready' && prods.data.some((p) => p.kind === 'bundle');
  /** produk yang sedang ikut promo item untuk jenis order di keranjang; filter Promo muncul hanya bila ada yang cocok */
  const promoIds = useMemo(
    () => (promos.status === 'ready' ? promoProductIds(promos.data, new Date(), cart.state.type) : new Set<string>()),
    [promos, cart.state.type],
  );
  const hasPromo = prods.status === 'ready' && prods.data.some((p) => promoIds.has(p.id));
  useEffect(() => { if (cat === PROMO && prods.status === 'ready' && !hasPromo) setCat('all'); }, [cat, hasPromo, prods.status]);
  const visible = useMemo(() => {
    if (prods.status !== 'ready') return [];
    const s = q.trim().toLowerCase();
    const hit = (p: Product) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s);
    return groupVariants(prods.data).filter((t) => {
      const c = t.kind === 'single' ? t.product.categoryId : t.categoryId;
      if (cat === FAV) { if (!(t.kind === 'single' ? t.product.isFavorite : t.options.some((o) => o.product.isFavorite))) return false; }
      else if (cat === PROMO) { if (!(t.kind === 'single' ? promoIds.has(t.product.id) : t.options.some((o) => promoIds.has(o.product.id)))) return false; }
      else if (cat === BUNDLE) { if (!(t.kind === 'single' && t.product.kind === 'bundle')) return false; }
      else if (cat !== 'all' && c !== cat) return false;
      if (!s) return true;
      return t.kind === 'single' ? hit(t.product) : t.name.toLowerCase().includes(s) || t.options.some((o) => hit(o.product));
    });
  }, [prods, cat, q, promoIds]);

  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** Enter di kolom cari: kode SKU persis langsung masuk pesanan (pemindai kode batang mengetik lalu menekan Enter); kalau hasil cari tinggal satu, itu yang dipakai. */
  const onSearchEnter = () => {
    const code = q.trim();
    if (!code || prods.status !== 'ready') return;
    const exact = prods.data.find((p) => p.isActive !== false && (p.sku ?? '').trim().toLowerCase() === code.toLowerCase());
    const only = visible.length === 1 ? visible[0] : undefined;
    if (exact) { choose(exact); setScanMsg({ ok: true, text: `${exact.name} masuk pesanan.` }); setQ(''); return; }
    if (only) {
      if (only.kind === 'group') { setPickErr(''); setPicking(only); setQ(''); setScanMsg(null); return; }
      choose(only.product); setScanMsg({ ok: true, text: `${only.product.name} masuk pesanan.` }); setQ(''); return;
    }
    setScanMsg({ ok: false, text: visible.length ? `Ada ${visible.length} produk yang cocok. Pilih dari daftar atau ketik kode SKU lengkap.` : `Kode atau nama “${code}” tidak ditemukan.` });
  };
  const qtyOf = (p: Product) => cart.state.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
  const optionLimit = (p: Product, adding = 1) => checkStockLimit({ allowNegative: ctx.settings.allowNegativeStock, trackStock: !!p.trackStock, stock: p.stock ?? undefined, inCart: qtyOf(p), adding });
  /** Produk dengan grup Ekstra membuka pemilih dulu; selainnya langsung masuk pesanan. */
  /** Bila outlet melarang stok minus, tolak penambahan melebihi sisa stok (pesan di bilah status). */
  const stockOk = (p: Product, adding = 1): boolean => {
    const r = optionLimit(p, adding);
    if (!r.ok) setNotice(stockLimitMessage(p.name, r.available));
    return r.ok;
  };
  const choose = (p: Product) => {
    if (!stockOk(p)) return;
    const gs = extraGroups.status === 'ready' ? groupsForProduct(extraGroups.data, p) : [];
    if (gs.length) setExtraFor(p); else cart.dispatch({ t: 'add', product: p, pricing: activePricing });
  };
  const qtyOfTile = (t: CatalogTile) => (t.kind === 'single' ? qtyOf(t.product) : t.options.reduce((n, o) => n + qtyOf(o.product), 0));

  /** Simpan pesanan ke server. Id dipertahankan di keranjang, jadi simpan ulang memperbarui pesanan yang sama. */
  async function persist(): Promise<Order> {
    const o = await data.saveOrder({
      id: cart.state.orderId ?? newId(), type: cart.state.type,
      tableId: cart.state.type === 'dine_in' ? cart.state.tableId : undefined, customerId: cart.state.customerId, orderDiscount: cart.discounts.total || undefined, discounts: cart.discounts.entries.length ? cart.discounts.entries : undefined, label: cart.state.label?.trim() || undefined,
      guestCount: cart.state.type === 'dine_in' ? cart.state.guestCount : undefined,
      items: cart.state.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, ...declaredBasePrice(l), extras: l.extras, note: l.note?.trim() || undefined })),
    }, session.employee.id);
    cart.dispatch({ t: 'saved', orderId: o.id });
    waitingOrders.reload();
    return o;
  }

  /** Pisah bayar per item: bagian terpilih disimpan sebagai pesanan baru lalu dibayar; sisanya tetap di keranjang. */
  async function splitPay(picks: Record<string, number>) {
    const r = splitByItem(cart.state.lines, picks, newId);
    if (r.problem) throw new Error(r.problem);
    const items = (ls: typeof r.paid) => ls.map((l) => ({ id: l.id, productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, ...declaredBasePrice(l), extras: l.extras, note: l.note?.trim() || undefined }));
    const where = cart.state.tableName ?? cart.state.label?.trim();
    // 1) simpan bagian yang dibayar lebih dulu: bila langkah 2 gagal, tidak ada item yang hilang
    const part = await data.saveOrder({
      id: newId(), type: cart.state.type, customerId: cart.state.customerId, label: [where, 'pisah bayar'].filter(Boolean).join(' · ').slice(0, 60), items: items(r.paid),
    }, session.employee.id);
    // 2) perbarui pesanan asal dengan sisanya
    let rest: Order;
    try {
      rest = await data.saveOrder({
        id: cart.state.orderId ?? newId(), type: cart.state.type, tableId: cart.state.type === 'dine_in' ? cart.state.tableId : undefined, customerId: cart.state.customerId,
        label: cart.state.label?.trim() || undefined, guestCount: cart.state.type === 'dine_in' ? cart.state.guestCount : undefined, items: items(r.remain),
      }, session.employee.id);
    } catch (e) {
      throw new Error(`Bagian yang dipisah tersimpan sebagai ${part.number}, tetapi pesanan asal belum diperbarui (${e instanceof Error ? e.message : 'galat'}). Cek Daftar Order sebelum membayar.`);
    }
    cart.dispatch({ t: 'load', order: rest, tableName: cart.state.tableName, products: prods.status === 'ready' ? prods.data : undefined });
    waitingOrders.reload();
    setSplitOpen(false); setKeepCart(true); setPaying(part);
  }

  async function pay() {
    if (!cart.state.lines.length || placing) return;
    setPlacing(true); setSaveErr(''); setNotice('');
    try { setPaying(await persist()); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Pesanan gagal disimpan.'); }
    finally { setPlacing(false); }
  }

  async function hold() {
    if (!cart.state.lines.length || placing) return;
    setPlacing(true); setSaveErr(''); setNotice('');
    try {
      const o = await persist();
      cart.dispatch({ t: 'clear' }); setPanelOpen(false);
      setNotice(`Pesanan ${o.number} disimpan. Lanjutkan dari Daftar Order.`);
      const f = forwardNotice(await forwardOrder({ data, ctx, order: o, cashierName: session.employee.name, online }));
      if (f) setNotice(`Pesanan ${o.number} disimpan. ${f}`);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : 'Pesanan gagal disimpan.'); }
    finally { setPlacing(false); }
  }

  if (paying) {
    const fromList = showOrders && paying.id !== cart.state.orderId;
    return <Payment order={paying} ctx={ctx} skipForward={keepCart}
      onUpdated={(saved) => {
        if (saved.id === cart.state.orderId) cart.dispatch({ t: 'meta', label: saved.label, guestCount: saved.guestCount });
        waitingOrders.reload();
      }}
      onBack={() => { if (keepCart) { setKeepCart(false); setNotice(`Pesanan pisah ${paying.number} belum dibayar; ada di Daftar Order.`); } setPaying(null); }}
      onDone={() => {
        if (keepCart) { setKeepCart(false); setPanelOpen(true); setNotice(`Bagian pisah ${paying.number} lunas. Sisa pesanan masih terbuka di keranjang.`); }
        else if (!fromList) { cart.dispatch({ t: 'clear' }); setPanelOpen(false); setShowOrders(false); }
        setPaying(null); prods.reload(); waitingOrders.reload();
      }} />;
  }
  if (showSales) {
    return <Sales ctx={ctx} onClose={() => setShowSales(false)} />;
  }
  if (showOrders) {
    return <Orders ctx={ctx} canResume={cart.state.lines.length === 0} initialTab={ordersTab}
      onClose={() => { setShowOrders(false); waitingOrders.reload(); }}
      onResume={async (o0) => {
        const o = (await data.getOrder(o0.id).catch(() => null)) ?? o0;
        const full = o;
        const tableName = o.tableId ? (await data.listTables().catch(() => [])).find((t) => t.id === o.tableId)?.name : undefined;
        cart.dispatch({ t: 'load', order: full, tableName, products: prods.status === 'ready' ? prods.data : undefined }); setShowOrders(false); setPanelOpen(true); setNotice(''); waitingOrders.reload();
      }}
      onPay={(o) => setPaying(o)} />;
  }

  return (
    <div className={`cg-shell reg ${panelOpen ? 'reg--panel' : ''}`}>
      <header className="cg-shell__header flex items-center justify-between text-white">
        {/* Kiri: Tombol Menu + Nama Outlet + Kasir + Online */}
        <div className="flex items-center gap-8 min-w-0">
          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Menu kasir"
            title="Menu kasir"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="cg-icon cg-icon--sm" aria-hidden />
          </button>
          <strong className="truncate max-w-[120px] tablet:max-w-[180px] font-bold text-white text-sm">{ctx.outletName}</strong>
          <span className="text-white/80 text-xs truncate hidden tablet:inline">Kasir: {session.employee.name}</span>
          <span
            className={`inline-flex items-center gap-4 text-xs font-medium px-8 py-2 rounded-full shrink-0 ${
              online ? 'bg-white/20 text-white' : 'bg-red-500/90 text-white'
            }`}
            role="status"
            aria-label={online ? 'Online' : 'Offline'}
          >
            {online ? <Wifi className="cg-icon cg-icon--xs" aria-hidden /> : <WifiOff className="cg-icon cg-icon--xs" aria-hidden />}
            <span className="hidden desktop:inline">{online ? 'Online' : 'Offline'}</span>
          </span>
        </div>

        {/* Tengah: Nama aplikasi CG POS sebagai teks */}
        <div className="hidden laptop:flex items-center justify-center font-extrabold tracking-wider text-base text-white select-none">
          CG POS
        </div>

        {/* Kanan: Notifikasi, Tertunda, Daftar Order, Shift, Pengaturan, Kunci */}
        <div className="flex items-center gap-6 shrink-0">
          <button
            type="button"
            className="relative p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            aria-label="Notifikasi"
            title="Notifikasi"
          >
            <Bell className="cg-icon cg-icon--sm" aria-hidden />
            {pend.entries.length > 0 && (
              <span className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-400 border border-white" />
            )}
          </button>

          {pend.entries.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-4 px-8 py-4 rounded-md bg-warning text-on-warning text-xs font-bold shrink-0 cursor-pointer"
              onClick={() => { setOrdersTab('pending'); setShowOrders(true); }}
              aria-label={`${pend.entries.length} transaksi tertunda, buka daftar`}
            >
              <span>Tertunda ({pend.entries.length})</span>
            </button>
          )}

          <button
            type="button"
            className="inline-flex items-center gap-6 px-10 py-6 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            aria-label="Daftar Order"
            onClick={() => { setOrdersTab('waiting'); setShowOrders(true); }}
          >
            <ClipboardList className="cg-icon cg-icon--sm" aria-hidden />
            <span className="hidden tablet:inline">Daftar Order</span>
            {openOrdersCount > 0 && (
              <span className="px-6 py-1 rounded-full text-[10px] font-bold bg-white text-accent">
                {openOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-4 px-10 py-6 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            onClick={() => setShiftOpen(true)}
          >
            Shift
          </button>

          {onOpenAttendance && (
            <button
              type="button"
              className="hidden laptop:inline-flex items-center gap-4 px-10 py-6 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              onClick={onOpenAttendance}
              aria-label="Absensi karyawan"
            >
              <UserCheck className="cg-icon cg-icon--xs" aria-hidden />
              <span>Absensi</span>
            </button>
          )}

          <button
            type="button"
            className="hidden tablet:flex p-6 rounded hover:bg-white/15 text-white items-center justify-center cursor-pointer"
            onClick={openCustomerScreen}
            aria-label="Layar pelanggan"
            title="Layar pelanggan eksternal"
          >
            <Monitor className="cg-icon cg-icon--sm" aria-hidden />
          </button>

          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            onClick={() => setSettings(true)}
            aria-label="Pengaturan perangkat"
            title="Pengaturan perangkat"
          >
            <Settings className="cg-icon cg-icon--sm" aria-hidden />
          </button>

          <button
            type="button"
            className="p-6 rounded hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
            onClick={onLock}
            aria-label="Kunci layar"
            title="Kunci layar"
          >
            <Lock className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>
      </header>

      <nav className="cg-shell__rail" aria-label="Kategori">
        <button className="cg-rail-item" aria-current={cat === 'all'} onClick={() => setCat('all')}>Semua</button>
        {hasFav && <button className="cg-rail-item" aria-current={cat === FAV} onClick={() => setCat(FAV)}>Favorit</button>}
        {hasPromo && <button className="cg-rail-item" aria-current={cat === PROMO} onClick={() => setCat(PROMO)}>Promo</button>}
        {hasBundle && <button className="cg-rail-item" aria-current={cat === BUNDLE} onClick={() => setCat(BUNDLE)}>Paket</button>}
        {cats.status === 'ready' && cats.data.map((c) => (
          <button key={c.id} className="cg-rail-item" aria-current={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </nav>

      <section className="reg__catalog" aria-label="Produk">
        {/* Bar cari sejajar dengan ikon scan dan tombol Item bebas */}
        <div className="flex items-center gap-8 px-16 pt-12 pb-4 shrink-0">
          <label className="cg-search flex-1 m-0 relative">
            <Search className="cg-icon cg-icon--sm" aria-hidden />
            <span className="cg-sr">Cari produk</span>
            <input
              className="cg-input pr-36"
              type="search"
              placeholder="Cari produk, atau ketik/scan SKU lalu Enter"
              value={q}
              onChange={(e) => { setQ(e.target.value); setScanMsg(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); } }}
              autoFocus={viewMode === 'sku'}
            />
            <button
              type="button"
              className="absolute right-12 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-4 cursor-pointer"
              title="Pemindai kode batang"
              aria-label="Pemindai kode batang"
              onClick={() => { if (q) onSearchEnter(); }}
            >
              <ScanBarcode className="cg-icon cg-icon--sm" aria-hidden />
            </button>
          </label>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm whitespace-nowrap shrink-0"
            data-testid="custom-open"
            onClick={() => setCustomOpen(true)}
            aria-haspopup="dialog"
          >
            Item bebas
          </button>
        </div>
        {scanMsg && (
          <p
            role="status"
            className={`px-16 text-sm ${scanMsg.ok ? 'text-text-muted' : 'text-danger-strong'}`}
            data-testid="scan-msg"
          >
            {scanMsg.text}
          </p>
        )}
        <div className={`cg-shell__grid ${viewMode !== 'grid' ? 'reg-grid--list' : ''}`} data-view={viewMode}>
          {prods.status === 'loading' && Array.from({ length: 8 }, (_, i) => <div key={i} className="cg-skeleton" style={{ height: 170 }} aria-hidden />)}
          {prods.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert" style={{ gridColumn: '1 / -1' }}><span>Produk gagal dimuat. {prods.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={prods.reload}>Coba lagi</button></div>}
          {prods.status === 'ready' && viewMode === 'sku' && !q.trim() && (
            <div className="cg-empty" style={{ gridColumn: '1 / -1' }} data-testid="sku-idle">
              <h3>Scan atau ketik kode SKU</h3>
              <p>Produk yang cocok muncul di sini. Tekan Enter untuk langsung memasukkan produk yang kodenya persis sama.</p>
            </div>
          )}
          {prods.status === 'ready' && !(viewMode === 'sku' && !q.trim()) && visible.length === 0 && (
            <div className="cg-empty" style={{ gridColumn: '1 / -1' }}>
              <h3>{q ? 'Produk tidak ditemukan' : 'Belum ada produk di kategori ini'}</h3>
              <p>{q ? `Tidak ada yang cocok dengan “${q}”.` : 'Tambahkan produk dari dashboard.'}</p>
            </div>
          )}
          {(viewMode === 'sku' && !q.trim() ? [] : visible).map((t) => {
            const n = qtyOfTile(t);
            const isGroup = t.kind === 'group';
            const name = isGroup ? t.name : t.product.name;
            const limitExhausted = isGroup ? t.options.every((o) => !optionLimit(o.product).ok) : !optionLimit(t.product).ok;
            const out = (isGroup ? t.soldOut : t.product.trackStock && (t.product.stock ?? 0) <= 0) || limitExhausted;
            const price = isGroup ? (t.minPrice === t.maxPrice ? formatRp(t.minPrice) : `mulai ${formatRp(t.minPrice)}`) : formatRp(t.product.price);
            const photoUrl = isGroup ? t.options.find((o) => o.product.photoUrl)?.product.photoUrl : t.product.photoUrl;

            const tracksStock = isGroup ? t.options.some((o) => o.product.trackStock) : !!t.product.trackStock;
            const rawStock = isGroup
              ? t.options.reduce((sum, o) => sum + (o.product.trackStock ? (o.product.stock ?? 0) : 0), 0)
              : (t.product.stock ?? 0);
            const currentStock = Math.max(0, rawStock - n);
            const isFav = isGroup ? t.options.some((o) => o.product.isFavorite) : !!t.product.isFavorite;

            return (
              <button
                key={t.key}
                className="cg-tile relative group"
                onClick={() => {
                  if (isGroup) { setPickErr(''); setPicking(t); }
                  else choose(t.product);
                }}
                aria-haspopup={isGroup ? 'dialog' : undefined}
                aria-label={`${name}, ${price}${isGroup ? `, pilih ukuran (${t.options.length})` : ''}${n ? `, di pesanan ${n}` : ''}${out ? ', stok habis' : ''}`}
              >
                <span className="cg-tile__media relative overflow-hidden" aria-hidden>
                  {/* Lencana stok kecil di pojok kiri atas gambar jika melacak stok */}
                  {tracksStock && (
                    <span
                      className={`absolute top-[6px] left-[6px] z-10 px-[6px] py-[1px] rounded-[4px] text-[11px] leading-[16px] font-bold tracking-tight shadow-xs ${
                        currentStock <= 0
                          ? 'bg-danger text-on-danger'
                          : 'bg-surface/90 text-text border border-border'
                      }`}
                    >
                      {currentStock <= 0 ? 'Habis' : currentStock}
                    </span>
                  )}

                  {/* Bintang kecil bila favorit di pojok kanan atas gambar */}
                  {isFav && (
                    <span className="absolute top-[6px] right-[6px] z-10 p-[3px] rounded-full bg-surface/90 text-amber-500 shadow-xs border border-border flex items-center justify-center">
                      <Star className="w-[14px] h-[14px] fill-amber-400 text-amber-400" aria-hidden />
                    </span>
                  )}

                  <ProductPhoto
                    src={photoUrl}
                    fallback={
                      <div className="w-full h-full flex items-center justify-center bg-surface font-extrabold text-2xl text-text-muted select-none">
                        {getInitials(name)}
                      </div>
                    }
                  />
                </span>

                <span className="cg-tile__body">
                  <span className="cg-tile__name">{name}</span>
                  <span className="cg-tile__price">{price}</span>
                  {viewMode !== 'grid' && (isFav || (tracksStock && !out)) && (
                    <span className="text-xs text-text-muted flex items-center gap-4 tabular-nums">
                      {isFav && <Star className="w-[12px] h-[12px] fill-amber-400 text-amber-400" aria-label="Favorit" />}
                      {tracksStock && !out && <span>Stok {currentStock}</span>}
                    </span>
                  )}
                  {isGroup && <span className="text-xs text-text-muted">{t.options.map((o) => o.label).join(' · ')}</span>}
                  {out && <span className="cg-badge cg-badge--warning w-fit">Stok habis</span>}
                </span>

                {/* Lapisan hijau semi-transparan dengan jumlah di tengah setelah ada di pesanan */}
                {n > 0 && (
                  <div className="reg-tile-count absolute inset-0 bg-accent/25 backdrop-blur-[0.5px] rounded-[inherit] flex items-center justify-center z-20 pointer-events-none transition-all">
                    <span className="w-[36px] h-[36px] rounded-full bg-accent text-on-accent font-bold text-[16px] flex items-center justify-center shadow-lg border-2 border-white">
                      {n}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {(saveErr || notice || tickets.length > 0) && (
          <div className="reg__notes px-16 py-8 flex flex-col gap-8 min-w-0">
            {saveErr && <span role="alert" className="text-danger-strong text-sm">{saveErr}</span>}
            {!saveErr && notice && <span role="status" className="text-sm">{notice}</span>}
            <TicketStrip />
          </div>
        )}
      </section>

      <aside className="cg-shell__panel reg__panel" aria-label="Pesanan">
        <div className="p-12 border-b border-border grid gap-8">
          {/* 1. Header Pesanan dengan nomor transaksi kecil abu */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text">Pesanan</h2>
              <span className="text-xs text-text-muted font-mono">
                {cart.state.orderId ? `#${cart.state.orderId.slice(-8).toUpperCase()}` : '#BARU'}
              </span>
            </div>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm reg__close"
              onClick={() => setPanelOpen(false)}
            >
              Tutup
            </button>
          </div>

          {/* Jenis Pesanan dan Tombol Pelanggan Sebaris (Dua kolom sama lebar) */}
          <div className="grid grid-cols-2 gap-8 items-stretch">
            {/* Kolom 1: Jenis Pesanan */}
            <div className="relative">
              <select
                className="cg-input h-[38px] text-xs font-semibold w-full cursor-pointer bg-surface"
                value={cart.state.type}
                onChange={(e) => cart.dispatch({ t: 'type', type: e.target.value as OrderType })}
                aria-label="Jenis pesanan"
              >
                {TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Kolom 2: Tombol Pelanggan */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="cg-btn cg-btn--secondary h-[38px] text-xs w-full flex items-center justify-between px-8"
                onClick={() => setCustPick(true)}
                aria-label={cart.state.customerId ? `Pelanggan ${cart.state.customerName ?? ''}, ganti pelanggan` : 'Pilih pelanggan'}
              >
                <span className="flex items-center gap-6 min-w-0">
                  <UserRound className="cg-icon cg-icon--xs shrink-0" aria-hidden />
                  <span className="truncate font-semibold">{cart.state.customerId ? cart.state.customerName : 'Pelanggan'}</span>
                </span>
                {!cart.state.customerId && <span className="text-text-muted text-[10px]">Opsional</span>}
              </button>
              {cart.state.customerId && (
                <button
                  type="button"
                  className="cg-btn cg-btn--ghost p-6 h-[38px]"
                  aria-label="Lepas pelanggan"
                  onClick={() => cart.dispatch({ t: 'customer', pricing: pricingRules })}
                >
                  <X className="cg-icon cg-icon--xs" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {cart.state.type !== 'dine_in' && (
            <label className="cg-field">
              <span className="cg-sr">{LABEL_HINT[cart.state.type]}</span>
              <input
                className="cg-input h-[34px] text-xs"
                placeholder={LABEL_HINT[cart.state.type]}
                maxLength={60}
                value={cart.state.label ?? ''}
                onChange={(e) => cart.dispatch({ t: 'meta', label: e.target.value, guestCount: undefined })}
              />
            </label>
          )}

          {cart.state.type === 'dine_in' && (
            <div className="grid gap-6">
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--block flex justify-between h-[34px] text-xs"
                onClick={() => setTablePick(true)}
                aria-label={cart.state.tableId ? `Meja ${cart.state.tableName ?? ''}, ganti meja` : 'Pilih meja'}
              >
                <span>{cart.state.tableId ? `Meja ${cart.state.tableName ?? ''}` : 'Pilih meja'}</span>
                <span className="text-text-muted">{cart.state.tableId ? 'Ganti' : 'Opsional'}</span>
              </button>
              <div className="grid grid-cols-[1fr_80px] gap-6">
                <label className="cg-field">
                  <span className="cg-sr">Nama pesanan</span>
                  <input
                    className="cg-input h-[34px] text-xs"
                    placeholder={LABEL_HINT.dine_in}
                    maxLength={40}
                    value={cart.state.label ?? ''}
                    onChange={(e) => cart.dispatch({ t: 'meta', label: e.target.value, guestCount: cart.state.guestCount })}
                  />
                </label>
                <label className="cg-field">
                  <span className="cg-sr">Jumlah tamu</span>
                  <input
                    className="cg-input h-[34px] text-xs"
                    inputMode="numeric"
                    placeholder="Tamu"
                    value={cart.state.guestCount ?? ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      cart.dispatch({ t: 'meta', label: cart.state.label, guestCount: Number.isFinite(n) && n > 0 ? Math.min(n, 99) : undefined });
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 2. Baris pesanan: jumlah di kiri, nama, harga di kanan, ekstra/catatan kecil di bawah nama, tombol hapus merah bulat di ujung kanan */}
        <div className="cg-shell__lines p-8 overflow-y-auto">
          {cart.state.lines.length === 0 ? (
            <div className="cg-empty py-24">
              <h3>Pesanan masih kosong</h3>
              <p>Ketuk produk untuk menambahkannya.</p>
            </div>
          ) : (
            <ul className="space-y-6">
              {cart.state.lines.map((l) => {
                const total = cart.calc.lines.find((x) => x.id === l.id)?.lineTotal ?? 0;
                const isSelected = selectedLineId === l.id;
                return (
                  <li
                    key={l.id}
                    className={`p-8 rounded-lg border transition-colors cursor-pointer ${
                      isSelected ? 'border-accent bg-surface-raised shadow-xs' : 'border-border bg-surface hover:border-border-input'
                    }`}
                    onClick={() => setSelectedLineId(isSelected ? null : l.id)}
                  >
                    <div className="flex items-start gap-8">
                      {/* Jumlah di kiri */}
                      <span className="w-24 h-24 rounded bg-surface-raised border border-border text-xs font-bold flex items-center justify-center shrink-0">
                        {l.qty}
                      </span>

                      {/* Nama & Ekstra/Catatan */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-text break-words leading-tight">{l.name}</p>
                        {l.extras?.length ? (
                          <p className="text-[11px] text-text-muted mt-2">{l.extras.map((e) => e.name).join(', ')}</p>
                        ) : null}
                        {l.note ? (
                          <p className="text-[11px] text-accent italic mt-2">Catatan: {l.note}</p>
                        ) : null}
                      </div>

                      {/* Harga di kanan */}
                      <span className="text-xs font-bold text-text tabular-nums shrink-0">
                        {formatRp(total)}
                      </span>

                      {/* Tombol hapus merah bulat di ujung kanan */}
                      <button
                        type="button"
                        className="w-24 h-24 rounded-full bg-danger/10 hover:bg-danger text-danger hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        aria-label={`Hapus ${l.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          cart.dispatch({ t: 'qty', lineId: l.id, qty: 0 });
                        }}
                      >
                        <Trash2 className="w-12 h-12" aria-hidden />
                      </button>
                    </div>

                    {/* Stepper ringkas & aksi (muncul saat baris dipilih) */}
                    {isSelected && (
                      <div
                        className="mt-8 pt-6 border-t border-border flex items-center justify-between gap-8 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Stepper ringkas */}
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            className="w-32 h-32 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised"
                            onClick={() => cart.dispatch({ t: 'qty', lineId: l.id, qty: l.qty - 1, pricing: activePricing })}
                            aria-label={l.qty === 1 ? `Hapus ${l.name}` : `Kurangi ${l.name}`}
                          >
                            {l.qty === 1 ? <Trash2 className="w-12 h-12" /> : <Minus className="w-12 h-12" />}
                          </button>
                          <span className="w-32 text-center text-xs font-bold tabular-nums">{l.qty}</span>
                          <button
                            type="button"
                            className="w-32 h-32 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised"
                            onClick={() => {
                              const pr = prods.status === 'ready' ? prods.data.find((x) => x.id === l.productId) : undefined;
                              if (pr && !stockOk(pr)) return;
                              cart.dispatch({ t: 'qty', lineId: l.id, qty: l.qty + 1, pricing: activePricing });
                            }}
                            aria-label={`Tambah ${l.name}`}
                          >
                            <Plus className="w-12 h-12" />
                          </button>
                        </div>

                        {/* Catatan toggle & Ubah harga */}
                        <div className="flex items-center gap-6">
                          {noteFor === l.id ? (
                            <input
                              className="cg-input h-[28px] text-xs px-6"
                              autoFocus
                              maxLength={120}
                              placeholder="Catatan..."
                              value={l.note ?? ''}
                              onChange={(e) => cart.dispatch({ t: 'note', lineId: l.id, note: e.target.value })}
                              onBlur={() => setNoteFor(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault();
                                  setNoteFor(null);
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-text-muted hover:text-accent font-medium underline"
                              onClick={() => setNoteFor(l.id)}
                            >
                              {l.note ? 'Ubah catatan' : '+ Catatan'}
                            </button>
                          )}
                        </div>
                        {noteFor === l.id && noteGroups.length > 0 && (
                          <div className="flex flex-col gap-4 w-full" data-testid="note-presets" aria-label="Catatan siap pakai" ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>
                            {noteGroups.map((g) => (
                              <div key={g.category} className="flex flex-wrap items-center gap-4">
                                <span className="text-[11px] text-text-muted">{g.category}:</span>
                                {g.items.map((n) => {
                                  const on = noteHasText(l.note, n.text);
                                  return (
                                    <button
                                      key={n.id}
                                      type="button"
                                      aria-pressed={on}
                                      className="cg-chip note-chip"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => cart.dispatch({ t: 'note', lineId: l.id, note: toggleNoteText(l.note, n.text) })}
                                    >{n.text}</button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                        {l.overridePct && l.basePrice !== undefined && (
                          <div className="flex items-center gap-6 w-full">
                            {priceFor?.id === l.id ? (
                              <form
                                className="grid gap-4 w-full mt-4"
                                noValidate
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const price = Number(priceFor.text.replace(/\./g, '').replace(',', '.'));
                                  const problem = priceOverrideProblem(l.basePrice!, l.overridePct!, price);
                                  if (problem) return setPriceFor({ ...priceFor, err: problem });
                                  cart.dispatch({ t: 'price', lineId: l.id, unitPrice: price });
                                  setPriceFor(null);
                                }}
                              >
                                <label className="text-[11px] text-text-muted" htmlFor={`harga-${l.id}`}>
                                  Harga baru {l.name} (daftar {formatRp(l.basePrice)}, batas {l.overridePct}%)
                                </label>
                                <div className="flex items-center gap-6">
                                  <input
                                    id={`harga-${l.id}`}
                                    className="cg-input cg-num h-[30px] text-xs flex-1 min-w-0"
                                    inputMode="numeric"
                                    autoFocus
                                    value={priceFor.text}
                                    onChange={(e) => setPriceFor({ ...priceFor, text: e.target.value.replace(/[^\d.,]/g, ''), err: '' })}
                                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setPriceFor(null); } }}
                                  />
                                  <button type="submit" className="cg-btn cg-btn--primary cg-btn--sm">Pakai</button>
                                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setPriceFor(null)}>Batal</button>
                                </div>
                                {priceFor.err && <p role="alert" className="text-xs text-danger-strong break-words">{priceFor.err}</p>}
                              </form>
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-text-muted hover:text-accent font-medium underline"
                                onClick={() => setPriceFor({ id: l.id, text: String(l.unitPrice), err: '' })}
                                aria-label={`Ubah harga ${l.name}`}
                              >
                                {l.unitPrice === l.basePrice ? 'Ubah harga' : `Harga diubah (${formatRp(l.unitPrice)})`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 3. Dasar kolom keranjang: tiga tombol ikon sebaris (kosongkan, diskon/promo, simpan), Kirim ke dapur, batang hijau penuh Bayar */}
        <div className="p-12 border-t border-border grid gap-8 bg-surface-raised mt-auto">
          {cart.state.lines.length > 0 && (
            <div className="pb-4 grid gap-4">
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--block flex justify-between"
                onClick={() => setDiscOpen(true)}
                aria-label={cart.discounts.total > 0 ? `Diskon dan promo, terpasang ${formatRp(cart.discounts.total)}` : 'Diskon dan promo'}
              >
                <span className="flex items-center gap-8"><Tag className="cg-icon cg-icon--sm" aria-hidden /> Diskon dan promo</span>
                <span className={cart.discounts.total > 0 ? 'cg-num' : 'text-text-muted text-sm'}>
                  {cart.discounts.total > 0 ? `-${formatRp(cart.discounts.total)}` : 'Opsional'}
                </span>
              </button>
              <DiscountLines entries={cart.discounts.entries} inset={false} />
              {cart.discounts.skipped.map((d) => (
                <p key={d.id} role="status" className="text-sm text-danger-strong break-words">
                  {d.label} tidak berlaku lagi: {d.reason}
                </p>
              ))}
            </div>
          )}

          <Totals calc={cart.calc} />

          {/* Tiga tombol ikon sebaris: kosongkan, diskon/promo, simpan */}
          <div className="grid grid-cols-3 gap-6">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm flex items-center justify-center gap-4 text-xs"
              disabled={!cart.state.lines.length}
              onClick={() => cart.dispatch({ t: 'clear' })}
              title="Kosongkan pesanan"
              aria-label="Kosongkan pesanan"
            >
              <Trash2 className="cg-icon cg-icon--xs" aria-hidden />
              <span>Kosongkan</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm flex items-center justify-center gap-4 text-xs"
              onClick={() => setDiscOpen(true)}
              title="Diskon dan promo"
              aria-label="Diskon dan promo"
            >
              <Tag className="cg-icon cg-icon--xs" aria-hidden />
              <span>Diskon</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm flex items-center justify-center gap-4 text-xs"
              disabled={!cart.state.lines.length || placing}
              onClick={hold}
              title="Simpan pesanan"
              aria-label="Simpan pesanan"
            >
              <Save className="cg-icon cg-icon--xs" aria-hidden />
              <span>Simpan</span>
            </button>
          </div>

          {/* Tombol sekunder: Pisah bayar per item. Pesanan diteruskan ke dapur/bar otomatis saat disimpan atau dibayar. */}
          <div className="grid grid-cols-1 gap-6">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm w-full flex items-center justify-center gap-6"
              disabled={cart.state.lines.length < 1 || cart.count < 2 || placing}
              onClick={() => {
                if (cart.discounts.entries.length || cart.discounts.total > 0) { setSaveErr(''); setNotice('Hapus diskon pesanan dulu untuk memisah bayar per item.'); return; }
                setSplitOpen(true);
              }}
              title={cart.count < 2 ? 'Butuh minimal 2 item' : 'Bayar sebagian item lebih dulu'}
              aria-label="Pisah bayar per item"
              data-testid="split-open"
            >
              <Split className="cg-icon cg-icon--xs" aria-hidden />
              <span>Pisah item</span>
            </button>
          </div>

          {/* Batang hijau penuh lebar Bayar dengan lencana jumlah item di kiri dan total di kanan */}
          <button
            type="button"
            className="w-full h-[48px] px-16 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-bold flex items-center justify-between shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            disabled={!cart.state.lines.length || placing}
            aria-busy={placing}
            onClick={pay}
            aria-label={`Bayar ${cart.state.lines.length ? formatRp(cart.calc.total) : ''}`}
          >
            <span className="flex items-center gap-8">
              <span className="w-24 h-24 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                {cart.count}
              </span>
              <span>Bayar</span>
            </span>
            <span className="tabular-nums font-extrabold text-base">
              {formatRp(cart.calc.total)}
            </span>
          </button>
        </div>
      </aside>

      <footer className="cg-shell__bar cg-shell__bar--idle">
        <button type="button" className="cg-btn cg-btn--secondary reg__show flex-1" onClick={() => setPanelOpen(true)}>Pesanan ({cart.count})</button>
      </footer>
      {shiftOpen && <ShiftSummary onClose={() => setShiftOpen(false)} onCloseShift={() => { setShiftOpen(false); onCloseShift(); }} />}
      {settings && <DeviceSettings onClose={() => setSettings(false)} />}
      {discOpen && (
        <DiscountDialog applied={cart.state.discounts} resolved={cart.discounts} promos={promos.status === 'ready' ? promos.data : NO_PROMOS}
          cart={{ orderType: cart.state.type, lines: cart.state.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, extrasTotal: extrasLineTotal(l.qty, l.extras) })) }}
          gross={cart.calc.grossTotal} customerId={cart.state.customerId} productName={(id) => (prods.status === 'ready' ? prods.data.find((p) => p.id === id)?.name : undefined)}
          onAdd={(d) => cart.dispatch({ t: 'discount-add', discount: d })} onRemove={(id) => cart.dispatch({ t: 'discount-remove', id })} onClose={() => setDiscOpen(false)} />
      )}
      {custPick && (
        <CustomerPicker
          currentId={cart.state.customerId}
          onClose={() => setCustPick(false)}
          onPick={(c) => {
            const gId = c?.id ? groupMemberMap.get(c.id) : undefined;
            cart.dispatch({
              t: 'customer',
              customerId: c?.id,
              customerName: c?.name,
              customerGroupId: gId,
              pricing: {
                schedules: schedulesRes.status === 'ready' ? schedulesRes.data : undefined,
                tieredPrices: tieredPricesRes.status === 'ready' ? tieredPricesRes.data : undefined,
                customerGroupId: gId,
              },
            });
            setCustPick(false);
          }}
        />
      )}
      {tablePick && (
        <TablePicker currentTableId={cart.state.tableId} canResume={cart.state.lines.length === 0}
          onClose={() => setTablePick(false)}
          onPick={(t) => { cart.dispatch({ t: 'table', tableId: t.id, tableName: t.name }); setTablePick(false); }}
          onResume={async (t) => {
            setTablePick(false);
            const o = await data.getOrder(t.order!.id);
            if (o) { cart.dispatch({ t: 'load', order: o, tableName: t.name, products: prods.status === 'ready' ? prods.data : undefined }); setPanelOpen(true); setNotice(''); }
          }} />
      )}
      {extraFor && extraGroups.status === 'ready' && (
        <ExtraPicker product={extraFor} groups={groupsForProduct(extraGroups.data, extraFor)} onClose={() => setExtraFor(null)}
          onAdd={(extras) => { if (!stockOk(extraFor)) { setExtraFor(null); return; } cart.dispatch({ t: 'add', product: extraFor, extras, pricing: activePricing }); setExtraFor(null); }} />
      )}
      {splitOpen && <SplitBillDialog lines={cart.state.lines} ctx={ctx} orderType={cart.state.type} onClose={() => setSplitOpen(false)} onConfirm={splitPay} />}
      {customOpen && (
        <CustomItemDialog onClose={() => setCustomOpen(false)}
          onAdd={async (name, price, qty) => {
            const productId = await data.getCustomItemProductId();
            cart.dispatch({ t: 'custom', productId, name, unitPrice: price, qty });
            setCustomOpen(false); setPanelOpen(true);
          }} />
      )}
      {picking && (
        <Modal title={`Pilih ukuran: ${picking.name}`} onClose={() => { setPicking(null); setPickErr(''); }}>
          <ul className="grid gap-8" aria-label="Ukuran">
            {picking.options.map((o, i) => {
              const n = qtyOf(o.product);
              const limit = optionLimit(o.product);
              const rawOut = !!o.product.trackStock && (o.product.stock ?? 0) <= 0;
              const blocked = !limit.ok;
              const out = rawOut || blocked;
              return (
                <li key={o.product.id}>
                  <button
                    className={`cg-btn cg-btn--secondary cg-btn--lg cg-btn--block flex justify-between ${blocked ? 'opacity-60' : ''}`}
                    data-autofocus={i === 0 ? '' : undefined}
                    aria-disabled={blocked}
                    onClick={() => {
                      if (blocked) {
                        const msg = stockLimitMessage(o.product.name, limit.available);
                        setPickErr(msg);
                        setNotice(msg);
                        return;
                      }
                      setPickErr('');
                      choose(o.product);
                      setPicking(null);
                    }}
                    aria-label={`${o.label}, ${formatRp(o.product.price)}${n ? `, di pesanan ${n}` : ''}${out ? ', stok habis' : ''}`}
                  >
                    <span>
                      {o.label}
                      {n > 0 && <span className="cg-badge cg-badge--accent ml-8">{n}</span>}
                      {o.product.trackStock && !out && Number.isFinite(limit.available) && (
                        <span className="text-xs text-text-muted ml-8">Sisa {limit.available}</span>
                      )}
                      {out && <span className="cg-badge cg-badge--warning ml-8">Stok habis</span>}
                    </span>
                    <span className="cg-num">{formatRp(o.product.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pickErr && <p role="alert" className="text-sm text-danger-strong mt-8" data-testid="pick-stock-err">{pickErr}</p>}
          <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={() => { setPicking(null); setPickErr(''); }}>Batal</button></div>
        </Modal>
      )}
      {drawerOpen && (
        <SideDrawer
          outletName={ctx.outletName}
          cashierName={session.employee.name}
          canOpenKitchen={canOpenKitchen}
          onClose={() => setDrawerOpen(false)}
          onNavigate={(view) => {
            setDrawerOpen(false);
            if (view === 'register') {
              // Sudah di kasir
            } else if (view === 'sales') {
              setShowSales(true);
            } else if (view === 'orders') {
              setOrdersTab('waiting');
              setShowOrders(true);
            } else if (view === 'kitchen') {
              onOpenKitchen?.();
            } else if (view === 'customerDisplay') {
              openCustomerScreen();
            } else if (view === 'shift') {
              setShiftOpen(true);
            } else if (view === 'attendance') {
              onOpenAttendance?.();
            } else if (view === 'settings') {
              setSettings(true);
            } else if (view === 'lock') {
              onLock();
            } else if (view === 'closeShift') {
              onCloseShift();
            }
          }}
        />
      )}
    </div>
  );
}

export function Totals({ calc }: { calc: ReturnType<typeof useCart>['calc'] }) {
  const d = taxDisplay({ gross: calc.grossTotal, subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxTotal: calc.taxTotal });
  return (
    <div className="cg-totals">
      <div className="cg-totals__row"><span>Subtotal</span><span className="cg-num">{formatRp(d.subtotal)}</span></div>
      {d.discount > 0 && <div className="cg-totals__row"><span>Potongan</span><span className="cg-num">-{formatRp(d.discount)}</span></div>}
      {calc.serviceCharge > 0 && <div className="cg-totals__row"><span>Biaya layanan</span><span className="cg-num">{formatRp(calc.serviceCharge)}</span></div>}
      {!d.inclusive && calc.taxLines.map((t) => <div key={t.name} className="cg-totals__row"><span>{t.name} {t.rate}%</span><span className="cg-num">{formatRp(t.amount)}</span></div>)}
      <div className="cg-totals__row cg-totals__row--grand"><span>Total</span><span className="cg-num">{formatRp(calc.total)}</span></div>
      {d.inclusive && calc.taxLines.map((t) => <div key={t.name} className="cg-totals__row text-text-muted text-sm"><span>Sudah termasuk {t.name} {t.rate}%</span><span className="cg-num">{formatRp(t.amount)}</span></div>)}
    </div>
  );
}

function ExtraPicker({ product, groups, onClose, onAdd }: { product: Product; groups: ExtraGroup[]; onClose: () => void; onAdd: (extras: ReturnType<typeof pickedExtras>) => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');
  const toggle = (g: ExtraGroup, id: string) => {
    setError('');
    setChosen((cur) => {
      const on = cur.includes(id);
      if (g.mode === 'single') return [...cur.filter((x) => !g.options.some((o) => o.id === x)), ...(on && !g.required ? [] : [id])];
      return on ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };
  const extras = pickedExtras(groups, chosen);
  function add() {
    for (const g of groups) {
      const p = selectionProblem(g, chosen);
      if (p) return setError(p);
    }
    onAdd(extras);
  }
  return (
    <Modal title={`Ekstra: ${product.name}`} onClose={onClose} labelledBy="extra-title">
      <div className="grid gap-16">
        {groups.map((g, gi) => {
          const hint = g.mode === 'single' ? 'pilih satu' : g.maxSelect ? `maksimal ${g.maxSelect}` : 'boleh lebih dari satu';
          return (
            <fieldset key={g.id} className="grid gap-8 border-0 p-0 m-0 min-w-0">
              <legend className="font-semibold mb-4">{g.name} <span className="text-text-muted text-sm font-normal">· {g.required ? 'wajib' : 'opsional'}, {hint}</span></legend>
              {g.options.map((o, oi) => {
                const on = chosen.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center justify-between gap-12 min-h-[44px] px-12 rounded-md border border-border cursor-pointer" style={on ? { borderColor: 'var(--color-accent)' } : undefined}>
                    <span className="flex items-center gap-8 min-w-0">
                      <input type={g.mode === 'single' ? 'radio' : 'checkbox'} name={`g-${g.id}`} checked={on} data-autofocus={gi === 0 && oi === 0 ? '' : undefined}
                        onChange={() => toggle(g, o.id)} onClick={() => { if (g.mode === 'single' && on) toggle(g, o.id); }} />
                      <span className="break-words">{o.name}</span>
                    </span>
                    <span className="cg-num text-text-muted shrink-0">{o.price > 0 ? `+${formatRp(o.price)}` : 'Gratis'}</span>
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
          <button type="button" className="cg-btn cg-btn--primary" onClick={add}>Tambah {formatRp(product.price + extrasPerUnit(extras))}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Jual barang atau jasa yang tidak ada di menu: nama dan harga diketik kasir, tercatat sebagai baris biasa di pesanan dan laporan. */
function CustomItemDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, price: number, qty: number) => Promise<void> }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim(); const pr = Number(price.replace(/[^\d]/g, '')); const q = Number(qty.replace(',', '.'));
    if (!n) { setErr('Nama item wajib diisi.'); return; }
    if (!Number.isFinite(pr) || pr <= 0) { setErr('Harga harus lebih dari 0.'); return; }
    if (!Number.isFinite(q) || q <= 0) { setErr('Jumlah harus lebih dari 0.'); return; }
    setBusy(true); setErr('');
    try { await onAdd(n.slice(0, 80), Math.round(pr), q); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Item gagal ditambahkan.'); setBusy(false); }
  }
  return (
    <Modal title="Item bebas" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <label className="grid gap-4"><span className="text-sm">Nama item</span>
          <input className="cg-input" data-autofocus data-testid="custom-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-4"><span className="text-sm">Harga satuan (Rp)</span>
          <input className="cg-input" inputMode="numeric" data-testid="custom-price" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="grid gap-4"><span className="text-sm">Jumlah</span>
          <input className="cg-input" inputMode="decimal" data-testid="custom-qty" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        {err && <p role="alert" className="text-sm text-danger-strong" data-testid="custom-err">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} data-testid="custom-add">Tambah ke pesanan</button>
        </div>
      </form>
    </Modal>
  );
}

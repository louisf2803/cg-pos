import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Lock, UserRound, X, Minus, Settings, Plus, Save, Search, ShoppingBag, Trash2, Wifi, WifiOff } from 'lucide-react';
import { extrasPerUnit, formatRp, groupVariants, groupsForProduct, newId, pickedExtras, selectionProblem, taxDisplay, type CatalogTile, type ExtraGroup, type Order, type OrderType, type OutletContext, type Product } from '@cgpos/shared';
import { useData, usePending } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { useOnline } from '../lib/online';
import { Modal, ProductPhoto } from '../ui';
import { Orders } from './Orders';
import { TablePicker } from './TablePicker';
import { DeviceSettings } from './DeviceSettings';
import { ShiftSummary } from './ShiftSummary';
import { Payment } from './Payment';
import { CustomerPicker } from './CustomerPicker';

const TYPES: { v: OrderType; label: string }[] = [
  { v: 'takeaway', label: 'Bawa pulang' }, { v: 'dine_in', label: 'Makan di tempat' }, { v: 'delivery', label: 'Antar' }, { v: 'service', label: 'Jasa' },
];
const LABEL_HINT: Record<OrderType, string> = {
  dine_in: 'Nama pesanan (opsional)', takeaway: 'Nama pemesan (opsional)', delivery: 'Nama dan tujuan antar (opsional)', service: 'Keterangan jasa (opsional)',
};

export function Register({ ctx, onCloseShift, onLock }: { ctx: OutletContext; onCloseShift: () => void; onLock: () => void }) {
  const data = useData();
  const { session } = useSession();
  const online = useOnline();
  const cats = useAsync(() => data.listCategories(), [data]);
  const prods = useAsync(() => data.listProducts(), [data]);
  const extraGroups = useAsync<ExtraGroup[]>(() => data.listExtraGroups().catch(() => []), [data]);
  const [extraFor, setExtraFor] = useState<Product | null>(null);
  const [cat, setCat] = useState<string | 'all'>('all');
  const [q, setQ] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [picking, setPicking] = useState<Extract<CatalogTile, { kind: 'group' }> | null>(null);
  const [placing, setPlacing] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [showOrders, setShowOrders] = useState(false);
  const [ordersTab, setOrdersTab] = useState<'waiting' | 'pending'>('waiting');
  const pend = usePending();
  const [notice, setNotice] = useState('');
  const [tablePick, setTablePick] = useState(false);
  const [settings, setSettings] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [custPick, setCustPick] = useState(false);
  const cart = useCart(ctx);
  // isi cadangan offline selagi online: metode bayar dan denah dipakai layar Bayar dan Pilih meja
  useEffect(() => { void Promise.allSettled([data.listPaymentMethods(), data.listFloors(), data.listTables(), data.listTableStatus(), data.currentShift()]); }, [data]);

  const visible = useMemo(() => {
    if (prods.status !== 'ready') return [];
    const s = q.trim().toLowerCase();
    const hit = (p: Product) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s);
    return groupVariants(prods.data).filter((t) => {
      const c = t.kind === 'single' ? t.product.categoryId : t.categoryId;
      if (cat !== 'all' && c !== cat) return false;
      if (!s) return true;
      return t.kind === 'single' ? hit(t.product) : t.name.toLowerCase().includes(s) || t.options.some((o) => hit(o.product));
    });
  }, [prods, cat, q]);

  const qtyOf = (p: Product) => cart.state.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
  /** Produk dengan grup Ekstra membuka pemilih dulu; selainnya langsung masuk pesanan. */
  const choose = (p: Product) => {
    const gs = extraGroups.status === 'ready' ? groupsForProduct(extraGroups.data, p) : [];
    if (gs.length) setExtraFor(p); else cart.dispatch({ t: 'add', product: p });
  };
  const qtyOfTile = (t: CatalogTile) => (t.kind === 'single' ? qtyOf(t.product) : t.options.reduce((n, o) => n + qtyOf(o.product), 0));

  /** Simpan pesanan ke server. Id dipertahankan di keranjang, jadi simpan ulang memperbarui pesanan yang sama. */
  async function persist(): Promise<Order> {
    const o = await data.saveOrder({
      id: cart.state.orderId ?? newId(), type: cart.state.type,
      tableId: cart.state.type === 'dine_in' ? cart.state.tableId : undefined, customerId: cart.state.customerId, label: cart.state.label?.trim() || undefined,
      guestCount: cart.state.type === 'dine_in' ? cart.state.guestCount : undefined,
      items: cart.state.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, extras: l.extras })),
    }, session.employee.id);
    cart.dispatch({ t: 'saved', orderId: o.id });
    return o;
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
    } catch (e) { setSaveErr(e instanceof Error ? e.message : 'Pesanan gagal disimpan.'); }
    finally { setPlacing(false); }
  }

  if (paying) {
    const fromList = showOrders && paying.id !== cart.state.orderId;
    return <Payment order={paying} ctx={ctx} onBack={() => setPaying(null)}
      onDone={() => { if (!fromList) { cart.dispatch({ t: 'clear' }); setPanelOpen(false); setShowOrders(false); } setPaying(null); prods.reload(); }} />;
  }
  if (showOrders) {
    return <Orders ctx={ctx} canResume={cart.state.lines.length === 0} initialTab={ordersTab}
      onClose={() => setShowOrders(false)}
      onResume={async (o) => {
        const tableName = o.tableId ? (await data.listTables().catch(() => [])).find((t) => t.id === o.tableId)?.name : undefined;
        cart.dispatch({ t: 'load', order: o, tableName }); setShowOrders(false); setPanelOpen(true); setNotice('');
      }}
      onPay={(o) => setPaying(o)} />;
  }

  return (
    <div className={`cg-shell reg ${panelOpen ? 'reg--panel' : ''}`}>
      <header className="cg-shell__header">
        <strong className="truncate">{ctx.outletName}</strong>
        <span className="text-text-muted text-sm truncate hidden tablet:inline">Kasir: {session.employee.name}</span>
        <span className={`cg-conn ${online ? 'cg-conn--online' : 'cg-conn--offline'} ml-auto`} role="status" aria-label={online ? 'Online' : 'Offline'}>
          {online ? <Wifi className="cg-icon cg-icon--sm" aria-hidden /> : <WifiOff className="cg-icon cg-icon--sm" aria-hidden />}
          <span className="hidden tablet:inline">{online ? 'Online' : 'Offline'}</span>
        </span>
        {pend.entries.length > 0 && (
          <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => { setOrdersTab('pending'); setShowOrders(true); }} aria-label={`${pend.entries.length} transaksi tertunda, buka daftar`}>
            Tertunda ({pend.entries.length})
          </button>
        )}
        <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label="Daftar Order" onClick={() => { setOrdersTab('waiting'); setShowOrders(true); }}><ClipboardList className="cg-icon cg-icon--sm" aria-hidden /> <span className="hidden tablet:inline">Daftar Order</span></button>
        <button className="cg-btn cg-btn--ghost cg-btn--sm whitespace-nowrap" onClick={() => setShiftOpen(true)}>Shift</button>
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setSettings(true)} aria-label="Pengaturan perangkat"><Settings className="cg-icon" aria-hidden /></button>
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onLock} aria-label="Kunci layar"><Lock className="cg-icon" aria-hidden /></button>
      </header>

      <nav className="cg-shell__rail" aria-label="Kategori">
        <button className="cg-rail-item" aria-current={cat === 'all'} onClick={() => setCat('all')}>Semua</button>
        {cats.status === 'ready' && cats.data.map((c) => (
          <button key={c.id} className="cg-rail-item" aria-current={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </nav>

      <section className="reg__catalog" aria-label="Produk">
        <label className="cg-search reg__search">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari produk</span>
          <input className="cg-input" type="search" placeholder="Cari produk atau SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="cg-shell__grid">
          {prods.status === 'loading' && Array.from({ length: 8 }, (_, i) => <div key={i} className="cg-skeleton" style={{ height: 170 }} aria-hidden />)}
          {prods.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert" style={{ gridColumn: '1 / -1' }}><span>Produk gagal dimuat. {prods.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={prods.reload}>Coba lagi</button></div>}
          {prods.status === 'ready' && visible.length === 0 && (
            <div className="cg-empty" style={{ gridColumn: '1 / -1' }}>
              <h3>{q ? 'Produk tidak ditemukan' : 'Belum ada produk di kategori ini'}</h3>
              <p>{q ? `Tidak ada yang cocok dengan “${q}”.` : 'Tambahkan produk dari dashboard.'}</p>
            </div>
          )}
          {visible.map((t) => {
            const n = qtyOfTile(t);
            const isGroup = t.kind === 'group';
            const name = isGroup ? t.name : t.product.name;
            const out = isGroup ? t.soldOut : t.product.trackStock && (t.product.stock ?? 0) <= 0;
            const price = isGroup ? (t.minPrice === t.maxPrice ? formatRp(t.minPrice) : `mulai ${formatRp(t.minPrice)}`) : formatRp(t.product.price);
            return (
              <button key={t.key} className="cg-tile"
                onClick={() => (isGroup ? setPicking(t) : choose(t.product))}
                aria-haspopup={isGroup ? 'dialog' : undefined}
                aria-label={`${name}, ${price}${isGroup ? `, pilih ukuran (${t.options.length})` : ''}${n ? `, di pesanan ${n}` : ''}${out ? ', stok habis' : ''}`}>
                <span className="cg-tile__media" aria-hidden><ProductPhoto src={isGroup ? t.options.find((o) => o.product.photoUrl)?.product.photoUrl : t.product.photoUrl} fallback={<ShoppingBag className="cg-icon cg-icon--lg" />} /></span>
                <span className="cg-tile__body">
                  <span className="cg-tile__name">{name}</span>
                  <span className="cg-tile__price">{price}</span>
                  {isGroup && <span className="text-xs text-text-muted">{t.options.map((o) => o.label).join(' · ')}</span>}
                  {out && <span className="cg-badge cg-badge--warning w-fit">Stok habis</span>}
                </span>
                {n > 0 && <span className="cg-badge cg-badge--accent cg-tile__qty" aria-hidden>{n}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="cg-shell__panel reg__panel" aria-label="Pesanan">
        <div className="p-12 border-b border-border grid gap-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Pesanan</h2>
            <span className="flex gap-4">
              <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={!cart.state.lines.length} onClick={() => cart.dispatch({ t: 'clear' })}>Kosongkan</button>
              <button className="cg-btn cg-btn--secondary cg-btn--sm reg__close" onClick={() => setPanelOpen(false)}>Tutup</button>
            </span>
          </div>
          <div className="cg-tabs" role="tablist" aria-label="Jenis pesanan">
            {TYPES.map((t) => <button key={t.v} role="tab" className="cg-tab" aria-selected={cart.state.type === t.v} onClick={() => cart.dispatch({ t: 'type', type: t.v })}>{t.label}</button>)}
          </div>
          <div className="flex gap-8">
            <button className="cg-btn cg-btn--secondary cg-btn--block flex justify-between" onClick={() => setCustPick(true)}
              aria-label={cart.state.customerId ? `Pelanggan ${cart.state.customerName ?? ''}, ganti pelanggan` : 'Pilih pelanggan'}>
              <span className="flex items-center gap-8 min-w-0"><UserRound className="cg-icon cg-icon--sm" aria-hidden /><span className="truncate">{cart.state.customerId ? cart.state.customerName : 'Pelanggan'}</span></span>
              {!cart.state.customerId && <span className="text-text-muted text-sm">Opsional</span>}
            </button>
            {cart.state.customerId && <button className="cg-btn cg-btn--ghost" aria-label="Lepas pelanggan" onClick={() => cart.dispatch({ t: 'customer' })}><X className="cg-icon cg-icon--sm" aria-hidden /></button>}
          </div>
          {cart.state.type !== 'dine_in' && (
            <label className="cg-field"><span className="cg-sr">{LABEL_HINT[cart.state.type]}</span>
              <input className="cg-input" placeholder={LABEL_HINT[cart.state.type]} maxLength={60} value={cart.state.label ?? ''} onChange={(e) => cart.dispatch({ t: 'meta', label: e.target.value, guestCount: undefined })} />
            </label>
          )}
          {cart.state.type === 'dine_in' && (
            <div className="grid gap-8">
              <button className="cg-btn cg-btn--secondary cg-btn--block flex justify-between" onClick={() => setTablePick(true)} aria-label={cart.state.tableId ? `Meja ${cart.state.tableName ?? ''}, ganti meja` : 'Pilih meja'}>
                <span>{cart.state.tableId ? `Meja ${cart.state.tableName ?? ''}` : 'Pilih meja'}</span><span className="text-text-muted">{cart.state.tableId ? 'Ganti' : 'Opsional'}</span>
              </button>
              <div className="grid grid-cols-[1fr_96px] gap-8">
                <label className="cg-field"><span className="cg-sr">Nama pesanan</span>
                  <input className="cg-input" placeholder={LABEL_HINT.dine_in} maxLength={40} value={cart.state.label ?? ''} onChange={(e) => cart.dispatch({ t: 'meta', label: e.target.value, guestCount: cart.state.guestCount })} />
                </label>
                <label className="cg-field"><span className="cg-sr">Jumlah tamu</span>
                  <input className="cg-input" inputMode="numeric" placeholder="Tamu" value={cart.state.guestCount ?? ''} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); cart.dispatch({ t: 'meta', label: cart.state.label, guestCount: Number.isFinite(n) && n > 0 ? Math.min(n, 99) : undefined }); }} />
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="cg-shell__lines">
          {cart.state.lines.length === 0
            ? <div className="cg-empty"><h3>Pesanan masih kosong</h3><p>Ketuk produk untuk menambahkannya.</p></div>
            : <ul>{cart.state.lines.map((l) => {
              const total = cart.calc.lines.find((x) => x.id === l.id)?.lineTotal ?? 0;
              return (
                <li key={l.id} className="cg-line" style={{ cursor: 'default' }}>
                  <span className="cg-line__name break-words min-w-0">{l.name}{l.extras?.length ? <span className="block text-text-muted text-sm font-normal">{l.extras.map((e) => e.name).join(', ')}</span> : null}</span>
                  <span className="cg-line__amount cg-num">{formatRp(total)}</span>
                  <span className="cg-line__sub">{l.qty} × {formatRp(l.unitPrice + extrasPerUnit(l.extras))}</span>
                  <span className="cg-stepper" style={{ gridColumn: '1 / -1', justifySelf: 'start', marginTop: 8 }}>
                    <button onClick={() => cart.dispatch({ t: 'qty', lineId: l.id, qty: l.qty - 1 })} aria-label={l.qty === 1 ? `Hapus ${l.name}` : `Kurangi ${l.name}`}>{l.qty === 1 ? <Trash2 className="cg-icon cg-icon--sm" aria-hidden /> : <Minus className="cg-icon cg-icon--sm" aria-hidden />}</button>
                    <output aria-label={`Jumlah ${l.name}`}>{l.qty}</output>
                    <button onClick={() => cart.dispatch({ t: 'qty', lineId: l.id, qty: l.qty + 1 })} aria-label={`Tambah ${l.name}`}><Plus className="cg-icon cg-icon--sm" aria-hidden /></button>
                  </span>
                </li>
              );
            })}</ul>}
        </div>
        <Totals calc={cart.calc} />
      </aside>

      <footer className="cg-shell__bar">
        {saveErr && <span role="alert" className="text-danger-strong text-sm flex-1">{saveErr}</span>}
        {!saveErr && notice && <span role="status" className="text-sm flex-1">{notice}</span>}
        <button className="cg-btn cg-btn--secondary reg__show" onClick={() => setPanelOpen(true)}>Pesanan ({cart.count})</button>
        <button className="cg-btn cg-btn--secondary" disabled={!cart.state.lines.length || placing} onClick={hold}><Save className="cg-icon cg-icon--sm" aria-hidden /> Simpan</button>
        <button className="cg-btn cg-btn--primary cg-btn--lg ml-auto reg__pay" disabled={!cart.state.lines.length || placing} aria-busy={placing} onClick={pay}>
          Bayar {cart.state.lines.length ? formatRp(cart.calc.total) : ''}
        </button>
      </footer>
      {shiftOpen && <ShiftSummary onClose={() => setShiftOpen(false)} onCloseShift={() => { setShiftOpen(false); onCloseShift(); }} />}
      {settings && <DeviceSettings onClose={() => setSettings(false)} />}
      {custPick && <CustomerPicker currentId={cart.state.customerId} onClose={() => setCustPick(false)} onPick={(c) => { cart.dispatch({ t: 'customer', customerId: c?.id, customerName: c?.name }); setCustPick(false); }} />}
      {tablePick && (
        <TablePicker currentTableId={cart.state.tableId} canResume={cart.state.lines.length === 0}
          onClose={() => setTablePick(false)}
          onPick={(t) => { cart.dispatch({ t: 'table', tableId: t.id, tableName: t.name }); setTablePick(false); }}
          onResume={async (t) => {
            setTablePick(false);
            const o = await data.getOrder(t.order!.id);
            if (o) { cart.dispatch({ t: 'load', order: o, tableName: t.name }); setPanelOpen(true); setNotice(''); }
          }} />
      )}
      {extraFor && extraGroups.status === 'ready' && (
        <ExtraPicker product={extraFor} groups={groupsForProduct(extraGroups.data, extraFor)} onClose={() => setExtraFor(null)}
          onAdd={(extras) => { cart.dispatch({ t: 'add', product: extraFor, extras }); setExtraFor(null); }} />
      )}
      {picking && (
        <Modal title={`Pilih ukuran: ${picking.name}`} onClose={() => setPicking(null)}>
          <ul className="grid gap-8" aria-label="Ukuran">
            {picking.options.map((o, i) => {
              const out = o.product.trackStock && (o.product.stock ?? 0) <= 0;
              const n = qtyOf(o.product);
              return (
                <li key={o.product.id}>
                  <button className="cg-btn cg-btn--secondary cg-btn--lg cg-btn--block flex justify-between" data-autofocus={i === 0 ? '' : undefined}
                    onClick={() => { choose(o.product); setPicking(null); }}
                    aria-label={`${o.label}, ${formatRp(o.product.price)}${n ? `, di pesanan ${n}` : ''}${out ? ', stok habis' : ''}`}>
                    <span>{o.label}{n > 0 && <span className="cg-badge cg-badge--accent ml-8">{n}</span>}{out && <span className="cg-badge cg-badge--warning ml-8">Stok habis</span>}</span>
                    <span className="cg-num">{formatRp(o.product.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cg-modal__actions"><button className="cg-btn cg-btn--ghost" onClick={() => setPicking(null)}>Batal</button></div>
        </Modal>
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

import { useMemo, useState } from 'react';
import { Lock, Minus, Plus, Search, ShoppingBag, Trash2, Wifi, WifiOff } from 'lucide-react';
import { formatRp, type Order, type OrderType, type OutletContext, type Product } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { useOnline } from '../lib/online';
import { Payment } from './Payment';

const TYPES: { v: OrderType; label: string }[] = [{ v: 'takeaway', label: 'Bawa pulang' }, { v: 'dine_in', label: 'Makan di tempat' }];

export function Register({ ctx, onCloseShift, onLock }: { ctx: OutletContext; onCloseShift: () => void; onLock: () => void }) {
  const data = useData();
  const { session } = useSession();
  const online = useOnline();
  const cats = useAsync(() => data.listCategories(), [data]);
  const prods = useAsync(() => data.listProducts(), [data]);
  const [cat, setCat] = useState<string | 'all'>('all');
  const [q, setQ] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [placing, setPlacing] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const cart = useCart(ctx);

  const visible = useMemo(() => {
    if (prods.status !== 'ready') return [];
    const s = q.trim().toLowerCase();
    return prods.data.filter((p) => (cat === 'all' || p.categoryId === cat) && (!s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s)));
  }, [prods, cat, q]);

  const qtyOf = (p: Product) => cart.state.lines.find((l) => l.productId === p.id)?.qty ?? 0;

  async function pay() {
    if (!cart.state.lines.length || placing) return;
    setPlacing(true); setSaveErr('');
    try {
      const o = await data.saveOrder({
        id: crypto.randomUUID(), type: cart.state.type,
        items: cart.state.lines.map((l) => ({ id: l.id, productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
      }, session.employee.id);
      setPaying(o);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : 'Pesanan gagal disimpan.'); }
    finally { setPlacing(false); }
  }

  if (paying) {
    return <Payment order={paying} ctx={ctx} onBack={() => setPaying(null)} onDone={() => { cart.dispatch({ t: 'clear' }); setPaying(null); setPanelOpen(false); prods.reload(); }} />;
  }

  return (
    <div className={`cg-shell reg ${panelOpen ? 'reg--panel' : ''}`}>
      <header className="cg-shell__header">
        <strong className="truncate">{ctx.outletName}</strong>
        <span className="text-text-muted text-sm truncate hidden tablet:inline">Kasir: {session.employee.name}</span>
        <span className={`cg-conn ${online ? 'cg-conn--online' : 'cg-conn--offline'} ml-auto`} role="status">
          {online ? <Wifi className="cg-icon cg-icon--sm" aria-hidden /> : <WifiOff className="cg-icon cg-icon--sm" aria-hidden />}
          {online ? 'Online' : 'Offline'}
        </span>
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onCloseShift}>Tutup kasir</button>
        <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onLock} aria-label="Kunci dan ganti kasir"><Lock className="cg-icon" aria-hidden /></button>
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
          {visible.map((p) => {
            const n = qtyOf(p);
            const out = p.trackStock && (p.stock ?? 0) <= 0;
            return (
              <button key={p.id} className="cg-tile" onClick={() => cart.dispatch({ t: 'add', product: p })} aria-label={`${p.name}, ${formatRp(p.price)}${n ? `, di pesanan ${n}` : ''}${out ? ', stok habis' : ''}`}>
                <span className="cg-tile__media" aria-hidden><ShoppingBag className="cg-icon cg-icon--lg" /></span>
                <span className="cg-tile__body">
                  <span className="cg-tile__name">{p.name}</span>
                  <span className="cg-tile__price">{formatRp(p.price)}</span>
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
        </div>
        <div className="cg-shell__lines">
          {cart.state.lines.length === 0
            ? <div className="cg-empty"><h3>Pesanan masih kosong</h3><p>Ketuk produk untuk menambahkannya.</p></div>
            : <ul>{cart.state.lines.map((l) => {
              const total = cart.calc.lines.find((x) => x.id === l.id)?.lineTotal ?? 0;
              return (
                <li key={l.id} className="cg-line" style={{ cursor: 'default' }}>
                  <span className="cg-line__name break-words min-w-0">{l.name}</span>
                  <span className="cg-line__amount cg-num">{formatRp(total)}</span>
                  <span className="cg-line__sub">{l.qty} × {formatRp(l.unitPrice)}</span>
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
        <button className="cg-btn cg-btn--secondary reg__show" onClick={() => setPanelOpen(true)}>Pesanan ({cart.count})</button>
        <button className="cg-btn cg-btn--primary cg-btn--lg ml-auto reg__pay" disabled={!cart.state.lines.length || placing} aria-busy={placing} onClick={pay}>
          Bayar {cart.state.lines.length ? formatRp(cart.calc.total) : ''}
        </button>
      </footer>
    </div>
  );
}

export function Totals({ calc }: { calc: ReturnType<typeof useCart>['calc'] }) {
  return (
    <div className="cg-totals">
      <div className="cg-totals__row"><span>Subtotal</span><span className="cg-num">{formatRp(calc.subtotal)}</span></div>
      {calc.discountTotal > 0 && <div className="cg-totals__row"><span>Potongan</span><span className="cg-num">-{formatRp(calc.discountTotal)}</span></div>}
      {calc.serviceCharge > 0 && <div className="cg-totals__row"><span>Biaya layanan</span><span className="cg-num">{formatRp(calc.serviceCharge)}</span></div>}
      {calc.taxLines.map((t) => <div key={t.name} className="cg-totals__row"><span>{t.name} {t.rate}%</span><span className="cg-num">{formatRp(t.amount)}</span></div>)}
      <div className="cg-totals__row cg-totals__row--grand"><span>Total</span><span className="cg-num">{formatRp(calc.total)}</span></div>
    </div>
  );
}

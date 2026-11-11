import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Filter,
  Merge,
  MoveRight,
  Play,
  Printer,
  RefreshCw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import {
  formatRp,
  type PendingEntry,
  refundAmounts,
  refundableLines,
  newId,
  type Order,
  type OutletContext,
  type Refund,
} from '@cgpos/shared';
import { useData, usePending } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { Modal } from '../ui';
import { ReceiptDialog } from './Receipt';
import { MergeTableDialog, MoveTableDialog } from './TableMove';
import { useApprover, ApproverFields } from '../lib/approver';

const REASONS = ['Salah input pesanan', 'Pelanggan batal', 'Pesanan ganda', 'Lainnya'];
const REFUND_REASONS = ['Pesanan salah', 'Produk bermasalah', 'Pelanggan batal', 'Lainnya'];
const TYPE_LABELS: Record<Order['type'], string> = {
  takeaway: 'Bawa pulang',
  dine_in: 'Makan di tempat',
  delivery: 'Antar',
  service: 'Jasa',
};

const hhmm = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

type CategoryKey = 'all' | 'open' | 'paid' | 'void' | 'pending';

/**
 * Daftar Order (Orders.tsx):
 * Rel kategori kiri di desktop (Semua, Terbuka, Selesai, Dibatalkan, tiap dengan jumlah),
 * chip scroll di mobile (<1024px).
 * Tabel: Jenis, Nama/meja, Nomor, Waktu, Status (pil berwarna), Tagihan, dan Aksi.
 * Kolom pencarian nomor/nama & modal filter jenis/status.
 */
export function Orders({
  ctx,
  canResume,
  initialTab = 'waiting',
  onClose,
  onResume,
  onPay,
}: {
  ctx: OutletContext;
  canResume: boolean;
  initialTab?: 'waiting' | 'paid' | 'pending';
  onClose: () => void;
  onResume: (o: Order) => void;
  onPay: (o: Order) => void;
}) {
  const data = useData();
  const pend = usePending();

  // Kategori terpilih: inisialisasi dari prop initialTab
  const [category, setCategory] = useState<CategoryKey>(() => {
    if (initialTab === 'paid') return 'paid';
    if (initialTab === 'pending') return 'pending';
    return 'open';
  });

  // Pencarian & Filter
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'partially_paid' | 'paid' | 'void'>('all');
  const [filterType, setFilterType] = useState<'all' | Order['type']>('all');

  // Ambil semua pesanan dari DataLayer
  const list = useAsync(() => data.listOrders({ limit: 200 }), [data]);

  // Dialog & Aksi
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [moving, setMoving] = useState<Order | null>(null);
  const [merging, setMerging] = useState<Order | null>(null);
  const [bill, setBill] = useState<Order | null>(null);
  const [billKind, setBillKind] = useState<'receipt' | 'bill'>('receipt');
  const [notice, setNotice] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Ambil daftar meja untuk nama meja
  const tableList = useAsync(() => data.listTables(), [data]);
  const names = useMemo<Record<string, string>>(
    () => (tableList.status === 'ready' ? Object.fromEntries(tableList.data.map((t) => [t.id, t.name])) : {}),
    [tableList]
  );

  const rawOrders = list.status === 'ready' ? list.data : [];

  // Hitung jumlah untuk tiap rel kategori
  const counts = useMemo(() => {
    const all = rawOrders.length;
    const open = rawOrders.filter((o) => o.status === 'open' || o.status === 'partially_paid').length;
    const paid = rawOrders.filter((o) => o.status === 'paid').length;
    const voided = rawOrders.filter((o) => o.status === 'void').length;
    const pending = pend.entries.length;
    return { all, open, paid, voided, pending };
  }, [rawOrders, pend.entries.length]);

  // Filter pesanan sesuai kategori, pencarian, dan filter modal
  const filteredOrders = useMemo(() => {
    return rawOrders.filter((o) => {
      // Filter kategori rel
      if (category === 'open' && o.status !== 'open' && o.status !== 'partially_paid') return false;
      if (category === 'paid' && o.status !== 'paid') return false;
      if (category === 'void' && o.status !== 'void') return false;

      // Filter modal status
      if (filterStatus !== 'all') {
        if (filterStatus === 'open' && o.status !== 'open') return false;
        if (filterStatus === 'partially_paid' && o.status !== 'partially_paid') return false;
        if (filterStatus === 'paid' && o.status !== 'paid') return false;
        if (filterStatus === 'void' && o.status !== 'void') return false;
      }

      // Filter modal jenis
      if (filterType !== 'all' && o.type !== filterType) return false;

      // Pencarian query
      if (q.trim()) {
        const query = q.trim().toLowerCase();
        const hitNum = o.number.toLowerCase().includes(query);
        const hitCust = o.customerName ? o.customerName.toLowerCase().includes(query) : false;
        const hitLabel = o.label ? o.label.toLowerCase().includes(query) : false;
        const hitTable = o.tableId && names[o.tableId] ? names[o.tableId]?.toLowerCase().includes(query) : false;
        if (!hitNum && !hitCust && !hitLabel && !hitTable) return false;
      }

      return true;
    });
  }, [rawOrders, category, filterStatus, filterType, q, names]);

  const hasActiveFilter = filterStatus !== 'all' || filterType !== 'all';

  return (
    <div className="min-h-full flex flex-col bg-bg">
      {/* Header Utama Daftar Order */}
      <header className="flex items-center justify-between gap-8 px-16 min-h-[var(--layout-pos-header,56px)] border-b border-border bg-surface-raised shrink-0">
        <div className="flex items-center gap-8 min-w-0">
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm shrink-0"
            onClick={onClose}
            aria-label="Kembali ke kasir"
          >
            <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
            <span className="hidden tablet:inline">Kembali</span>
          </button>
          <h1 className="text-base font-bold text-text truncate">Daftar Order</h1>
        </div>
        <div className="flex items-center gap-6 ml-auto shrink-0">
          <button
            type="button"
            className={`cg-btn cg-btn--sm ${hasActiveFilter ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
            onClick={() => setFilterOpen(true)}
            aria-haspopup="dialog"
            aria-label="Filter pesanan"
          >
            <Filter className="cg-icon cg-icon--xs" aria-hidden />
            <span>Filter{hasActiveFilter ? ' (1)' : ''}</span>
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={() => list.reload()}
            title="Muat ulang"
            aria-label="Muat ulang"
          >
            <RefreshCw className="cg-icon cg-icon--xs" aria-hidden />
            <span className="hidden tablet:inline">Muat ulang</span>
          </button>
        </div>
      </header>

      {/* Bar Notifikasi jika ada */}
      {notice && (
        <p role="status" className="cg-banner cg-banner--info mx-16 mt-12 mb-0">
          {notice}
        </p>
      )}

      {/* Peringatan jika pesanan di kasir belum disimpan */}
      {!canResume && category === 'open' && counts.open > 0 && (
        <p className="cg-banner cg-banner--warning mx-16 mt-12 mb-0">
          Pesanan di layar kasir belum disimpan. Simpan atau kosongkan dulu sebelum melanjutkan pesanan lain.
        </p>
      )}

      {/* Layout Konten: Rel Kiri (Desktop) + Area Tabel Kanan */}
      <div className="flex-1 flex flex-col laptop:flex-row p-12 tablet:p-16 gap-16 max-w-[1200px] w-full mx-auto min-w-0">
        {/* Rel Kategori Desktop */}
        <nav
          className="hidden laptop:flex flex-col gap-6 w-[200px] shrink-0 border-r border-border pr-16"
          aria-label="Kategori order"
        >
          <button
            type="button"
            className={`w-full flex items-center justify-between px-12 py-10 rounded-lg text-sm font-semibold transition-colors text-left ${
              category === 'all'
                ? 'bg-accent text-on-accent'
                : 'hover:bg-surface-raised text-text'
            }`}
            onClick={() => { setCategory('all'); setNotice(''); }}
          >
            <span>Semua</span>
            <span className={`cg-badge cg-badge--sm ml-4 ${category === 'all' ? 'bg-white/25 text-white' : ''}`}>
              {counts.all}
            </span>
          </button>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-12 py-10 rounded-lg text-sm font-semibold transition-colors text-left ${
              category === 'open'
                ? 'bg-accent text-on-accent'
                : 'hover:bg-surface-raised text-text'
            }`}
            onClick={() => { setCategory('open'); setNotice(''); }}
          >
            <span>Terbuka</span>
            <span className={`cg-badge cg-badge--sm ml-4 ${category === 'open' ? 'bg-white/25 text-white' : ''}`}>
              {counts.open}
            </span>
          </button>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-12 py-10 rounded-lg text-sm font-semibold transition-colors text-left ${
              category === 'paid'
                ? 'bg-accent text-on-accent'
                : 'hover:bg-surface-raised text-text'
            }`}
            onClick={() => { setCategory('paid'); setNotice(''); }}
          >
            <span>Selesai</span>
            <span className={`cg-badge cg-badge--sm ml-4 ${category === 'paid' ? 'bg-white/25 text-white' : ''}`}>
              {counts.paid}
            </span>
          </button>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-12 py-10 rounded-lg text-sm font-semibold transition-colors text-left ${
              category === 'void'
                ? 'bg-accent text-on-accent'
                : 'hover:bg-surface-raised text-text'
            }`}
            onClick={() => { setCategory('void'); setNotice(''); }}
          >
            <span>Dibatalkan</span>
            <span className={`cg-badge cg-badge--sm ml-4 ${category === 'void' ? 'bg-white/25 text-white' : ''}`}>
              {counts.voided}
            </span>
          </button>
          {counts.pending > 0 && (
            <button
              type="button"
              className={`w-full flex items-center justify-between px-12 py-10 rounded-lg text-sm font-semibold transition-colors text-left ${
                category === 'pending'
                  ? 'bg-accent text-on-accent'
                  : 'hover:bg-surface-raised text-text'
              }`}
              onClick={() => { setCategory('pending'); setNotice(''); }}
            >
              <span>Tertunda</span>
              <span className="cg-badge cg-badge--warning cg-badge--sm ml-4">
                {counts.pending}
              </span>
            </button>
          )}
        </nav>

        {/* Rel Chip Horizontal Mobile (<1024px) */}
        <div className="laptop:hidden overflow-x-auto flex items-center gap-8 pb-4 shrink-0 no-scrollbar">
          <button
            type="button"
            className={`cg-chip shrink-0 ${category === 'all' ? 'cg-chip--active' : ''}`}
            onClick={() => { setCategory('all'); setNotice(''); }}
          >
            Semua ({counts.all})
          </button>
          <button
            type="button"
            className={`cg-chip shrink-0 ${category === 'open' ? 'cg-chip--active' : ''}`}
            onClick={() => { setCategory('open'); setNotice(''); }}
          >
            Terbuka ({counts.open})
          </button>
          <button
            type="button"
            className={`cg-chip shrink-0 ${category === 'paid' ? 'cg-chip--active' : ''}`}
            onClick={() => { setCategory('paid'); setNotice(''); }}
          >
            Selesai ({counts.paid})
          </button>
          <button
            type="button"
            className={`cg-chip shrink-0 ${category === 'void' ? 'cg-chip--active' : ''}`}
            onClick={() => { setCategory('void'); setNotice(''); }}
          >
            Dibatalkan ({counts.voided})
          </button>
          {counts.pending > 0 && (
            <button
              type="button"
              className={`cg-chip shrink-0 ${category === 'pending' ? 'cg-chip--active' : ''}`}
              onClick={() => { setCategory('pending'); setNotice(''); }}
            >
              Tertunda ({counts.pending})
            </button>
          )}
        </div>

        {/* Area Konten Utama Kanan: Cari + Tabel / Pending List */}
        <div className="flex-1 flex flex-col space-y-12 min-w-0">
          {/* Kolom Cari */}
          <div className="flex items-center gap-8">
            <label className="cg-search flex-1 m-0">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <span className="cg-sr">Cari pesanan</span>
              <input
                type="search"
                className="cg-input"
                placeholder="Cari nomor struk, nama pemesan, atau meja..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {q && (
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm"
                onClick={() => setQ('')}
                aria-label="Bersihkan pencarian"
              >
                <X className="cg-icon cg-icon--xs" aria-hidden />
              </button>
            )}
          </div>

          {/* Jika kategori Tertunda, tampilkan PendingList */}
          {category === 'pending' ? (
            <PendingList
              entries={pend.entries}
              onRetry={pend.retry}
              onDiscard={pend.discard}
              onNotice={setNotice}
            />
          ) : (
            <>
              {/* Status Memuat (Skeleton) */}
              {list.status === 'loading' && (
                <div className="space-y-8" aria-busy="true" aria-label="Memuat daftar pesanan">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="cg-skeleton h-[56px] rounded-lg" />
                  ))}
                </div>
              )}

              {/* Status Galat */}
              {list.status === 'error' && (
                <div className="cg-banner cg-banner--danger" role="alert">
                  <span>Daftar order gagal dimuat. {list.message}</span>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm ml-auto"
                    onClick={list.reload}
                  >
                    Coba lagi
                  </button>
                </div>
              )}

              {/* Status Siap & Kosong */}
              {list.status === 'ready' && filteredOrders.length === 0 && (
                <div className="cg-empty py-32 text-center bg-surface-raised rounded-xl border border-border">
                  <h3 className="font-bold text-sm">
                    {q || hasActiveFilter
                      ? 'Tidak ada pesanan yang cocok'
                      : category === 'paid'
                      ? 'Belum ada pesanan lunas'
                      : category === 'void'
                      ? 'Belum ada pesanan dibatalkan'
                      : 'Tidak ada pesanan terbuka'}
                  </h3>
                  <p className="text-xs text-text-muted mt-4">
                    {q || hasActiveFilter
                      ? 'Coba sesuaikan kata kunci pencarian atau bersihkan filter.'
                      : 'Pesanan yang diproses kasir akan muncul di sini.'}
                  </p>
                </div>
              )}

              {/* Status Siap & Ada Data: Tabel Responsif */}
              {list.status === 'ready' && filteredOrders.length > 0 && (
                <div className="border border-border rounded-xl bg-surface-raised overflow-hidden shadow-xs">
                  <div className="overflow-x-auto min-w-0">
                    <table className="w-full text-left border-collapse text-sm min-w-[620px]">
                      <thead className="border-b border-border bg-surface text-xs font-semibold text-text-muted uppercase tracking-wider">
                        <tr>
                          <th className="p-12">Jenis</th>
                          <th className="p-12">Nama / Meja</th>
                          <th className="p-12">Nomor</th>
                          <th className="p-12">Waktu</th>
                          <th className="p-12">Status</th>
                          <th className="p-12 text-right">Tagihan</th>
                          <th className="p-12 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredOrders.map((o) => {
                          const partial = o.status === 'partially_paid';
                          const isExpanded = expandedId === o.id;
                          const tableName = o.tableId ? names[o.tableId] : undefined;
                          const displayName = tableName
                            ? `Meja ${tableName}`
                            : o.customerName || o.label || '—';

                          return (
                            <tr
                              key={o.id}
                              className={`group hover:bg-surface/50 transition-colors ${
                                isExpanded ? 'bg-surface/40' : ''
                              }`}
                            >
                              <td className="p-12 align-top">
                                <span className="cg-badge text-[11px] font-medium whitespace-nowrap">
                                  {TYPE_LABELS[o.type]}
                                </span>
                              </td>
                              <td className="p-12 align-top">
                                <div className="font-medium text-text max-w-[150px] truncate" title={displayName}>
                                  {displayName}
                                </div>
                                {tableName && o.customerName && (
                                  <span className="text-xs text-text-muted block truncate max-w-[150px]">
                                    {o.customerName}
                                  </span>
                                )}
                              </td>
                              <td className="p-12 align-top">
                                <span className="font-mono text-xs font-semibold text-text break-all">
                                  {o.number}
                                </span>
                              </td>
                              <td className="p-12 align-top whitespace-nowrap text-xs text-text-muted">
                                {hhmm(o.openedAt)}
                              </td>
                              <td className="p-12 align-top">
                                {o.status === 'paid' && (
                                  <span className="cg-badge cg-badge--accent text-[11px]">Selesai</span>
                                )}
                                {o.status === 'open' && (
                                  <span className="cg-badge text-[11px]">Terbuka</span>
                                )}
                                {partial && (
                                  <span className="cg-badge cg-badge--warning text-[11px]">Sebagian</span>
                                )}
                                {o.status === 'void' && (
                                  <span className="cg-badge cg-badge--danger text-[11px]">Dibatalkan</span>
                                )}
                              </td>
                              <td className="p-12 align-top text-right">
                                <strong className="cg-num text-sm text-text tabular-nums">
                                  {formatRp(o.total)}
                                </strong>
                                {partial && (
                                  <span className="text-[11px] text-text-muted block">
                                    Sisa {formatRp(o.total - o.paidTotal)}
                                  </span>
                                )}
                              </td>
                              <td className="p-12 align-top text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-6">
                                  {o.status === 'paid' ? (
                                    <>
                                      <button
                                        type="button"
                                        className="cg-btn cg-btn--ghost cg-btn--sm"
                                        onClick={() => {
                                          setBillKind('receipt');
                                          setBill(o);
                                        }}
                                        title="Cetak Struk"
                                        aria-label={`Struk pesanan ${o.number}`}
                                      >
                                        <Printer className="cg-icon cg-icon--xs" aria-hidden />
                                        <span>Struk</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="cg-btn cg-btn--secondary cg-btn--sm"
                                        onClick={() => setRefunding(o)}
                                        title="Refund pesanan"
                                        aria-label={`Refund pesanan ${o.number}`}
                                      >
                                        <Undo2 className="cg-icon cg-icon--xs" aria-hidden />
                                        <span>Refund</span>
                                      </button>
                                    </>
                                  ) : o.status === 'void' ? (
                                    <span className="text-xs text-text-muted italic pr-4">Batal</span>
                                  ) : (
                                    <>
                                      {!partial && (
                                        <button
                                          type="button"
                                          className="cg-btn cg-btn--secondary cg-btn--sm"
                                          disabled={!canResume}
                                          onClick={() => onResume(o)}
                                          title={canResume ? 'Lanjutkan pesanan di kasir' : 'Kosongkan kasir dulu'}
                                          aria-label={`Lanjutkan pesanan ${o.number}`}
                                        >
                                          <Play className="cg-icon cg-icon--xs" aria-hidden />
                                          <span className="hidden tablet:inline">Lanjutkan</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="cg-btn cg-btn--primary cg-btn--sm"
                                        onClick={() => onPay(o)}
                                        aria-label={`Bayar pesanan ${o.number}`}
                                      >
                                        <CreditCard className="cg-icon cg-icon--xs" aria-hidden />
                                        <span>Bayar</span>
                                      </button>
                                    </>
                                  )}

                                  {/* Tombol Detail/Expander */}
                                  <button
                                    type="button"
                                    className="p-6 rounded hover:bg-surface text-text-muted hover:text-text cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                                    aria-expanded={isExpanded}
                                    aria-label={`Detail pesanan ${o.number}`}
                                    title="Tampilkan detail"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="cg-icon cg-icon--xs" aria-hidden />
                                    ) : (
                                      <ChevronDown className="cg-icon cg-icon--xs" aria-hidden />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Panel Detail Item yang Diekspansi */}
                  {expandedId && (
                    <div className="p-16 border-t border-border bg-surface/30">
                      {(() => {
                        const target = filteredOrders.find((o) => o.id === expandedId);
                        if (!target) return null;
                        const partial = target.status === 'partially_paid';

                        return (
                          <div className="space-y-12">
                            <div className="flex flex-wrap items-center justify-between gap-8 pb-8 border-b border-border">
                              <div>
                                <h4 className="text-sm font-bold text-text">
                                  Rincian Pesanan: {target.number}
                                </h4>
                                <p className="text-xs text-text-muted mt-2">
                                  {target.items.reduce((sum, it) => sum + it.qty, 0)} item · Total: {formatRp(target.total)}
                                  {target.customerName ? ` · Pelanggan: ${target.customerName}` : ''}
                                  {target.label ? ` · Catatan: ${target.label}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-8">
                                {target.status !== 'paid' && target.status !== 'void' && (
                                  <>
                                    <button
                                      type="button"
                                      className="cg-btn cg-btn--ghost cg-btn--sm"
                                      onClick={() => {
                                        setBillKind('bill');
                                        setBill(target);
                                      }}
                                    >
                                      <Printer className="cg-icon cg-icon--xs" aria-hidden />
                                      <span>Cetak Tagihan</span>
                                    </button>
                                    {!partial && target.type === 'dine_in' && target.tableId && (
                                      <>
                                        <button
                                          type="button"
                                          className="cg-btn cg-btn--ghost cg-btn--sm"
                                          onClick={() => setMoving(target)}
                                        >
                                          <MoveRight className="cg-icon cg-icon--xs" aria-hidden />
                                          <span>Pindah meja</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="cg-btn cg-btn--ghost cg-btn--sm"
                                          onClick={() => setMerging(target)}
                                        >
                                          <Merge className="cg-icon cg-icon--xs" aria-hidden />
                                          <span>Gabung meja</span>
                                        </button>
                                      </>
                                    )}
                                    {!partial && (
                                      <button
                                        type="button"
                                        className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                                        onClick={() => setVoiding(target)}
                                      >
                                        <Ban className="cg-icon cg-icon--xs" aria-hidden />
                                        <span>Batalkan pesanan</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <OrderDetailExtra
                              order={target}
                              tableNames={names}
                              tz={ctx.timezone}
                            />

                            {/* Daftar Item */}
                            <ul className="space-y-6 text-xs">
                              {target.items.map((item) => (
                                <li key={item.id} className="flex justify-between gap-12">
                                  <div className="min-w-0">
                                    <span className="font-semibold text-text">{item.name}</span>{' '}
                                    <span className="text-text-muted">× {item.qty}</span>
                                    {item.extras && item.extras.length > 0 && (
                                      <span className="block text-text-muted text-[11px] mt-2">
                                        + {item.extras.map((ex) => ex.name).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                  <span className="cg-num tabular-nums text-text font-medium shrink-0">
                                    {formatRp(item.lineTotal)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal Filter */}
      {filterOpen && (
        <FilterDialog
          status={filterStatus}
          type={filterType}
          onClose={() => setFilterOpen(false)}
          onApply={(s, t) => {
            setFilterStatus(s as typeof filterStatus);
            setFilterType(t as typeof filterType);
            setFilterOpen(false);
          }}
          onReset={() => {
            setFilterStatus('all');
            setFilterType('all');
            setFilterOpen(false);
          }}
        />
      )}

      {/* Dialog Aksi Pesanan */}
      {refunding && (
        <RefundDialog
          order={refunding}
          onClose={() => setRefunding(null)}
          onDone={(r) => {
            setRefunding(null);
            setNotice(`Refund ${r.number} ${formatRp(r.total)} tercatat via ${r.methodName}.`);
            list.reload();
          }}
        />
      )}
      {bill && (
        <ReceiptDialog
          order={bill}
          ctx={ctx}
          kind={billKind}
          onClose={() => setBill(null)}
        />
      )}
      {moving && (
        <MoveTableDialog
          order={moving}
          tableName={names[moving.tableId ?? ''] ?? '—'}
          onClose={() => setMoving(null)}
          onDone={(o, to) => {
            setMoving(null);
            setNotice(`Pesanan ${o.number} dipindah ke meja ${to}.`);
            list.reload();
          }}
        />
      )}
      {merging && (
        <MergeTableDialog
          order={merging}
          names={names}
          onClose={() => setMerging(null)}
          onDone={(o, from) => {
            setMerging(null);
            setNotice(`Pesanan ${from.number} digabung ke ${o.number} (meja ${names[o.tableId ?? ''] ?? '—'}).`);
            list.reload();
          }}
        />
      )}
      {voiding && (
        <VoidDialog
          order={voiding}
          onClose={() => setVoiding(null)}
          onDone={(n) => {
            setVoiding(null);
            setNotice(`Pesanan ${n} dibatalkan.`);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function fmtOrderDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Rincian void (kasir, waktu, alasan) dan riwayat refund per transaksi di panel Pesanan. */
function OrderDetailExtra({
  order,
  tableNames,
  tz,
}: {
  order: Order;
  tableNames: Record<string, string>;
  tz: string;
}) {
  const data = useData();
  const extraLoad = useAsync(async () => {
    const [employees, refunds] = await Promise.all([
      data.listEmployees(),
      order.status === 'paid' ? data.listRefunds(order.id) : Promise.resolve([] as Refund[]),
    ]);
    return { employees, refunds };
  }, [data, order]);

  if (order.status !== 'void' && order.status !== 'paid') return null;

  const employees = extraLoad.status === 'ready' ? extraLoad.data.employees : [];
  const cashierName = employees.find((e) => e.id === order.cashierId)?.name ?? '—';
  const tableName = order.tableId ? tableNames[order.tableId] : undefined;
  const meta = order as Order & { voidReason?: string; reason?: string; authorizedBy?: string };
  const voidReason = meta.voidReason ?? meta.reason ?? order.label ?? 'Tidak ada catatan alasan';
  const authorizerName = meta.authorizedBy
    ? (employees.find((e) => e.id === meta.authorizedBy)?.name ?? meta.authorizedBy)
    : undefined;

  if (order.status === 'void') {
    return (
      <div className="cg-banner cg-banner--danger text-xs" role="status">
        <div className="min-w-0 space-y-4">
          <strong>Pesanan Dibatalkan (Void)</strong>
          <p>
            Kasir: {cashierName}
            {tableName ? ` · Meja ${tableName}` : ''}
            {authorizerName ? ` · Otorisasi: ${authorizerName}` : ''}
          </p>
          <p>
            Dibuka: {fmtOrderDateTime(order.openedAt, tz)} · Dibatalkan:{' '}
            {fmtOrderDateTime(order.closedAt ?? order.openedAt, tz)}
          </p>
          <p>Alasan: {voidReason}</p>
        </div>
      </div>
    );
  }

  const refunds = extraLoad.status === 'ready' ? extraLoad.data.refunds : [];
  const totalRefunded = refunds.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-8 text-xs">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4 text-text-muted bg-surface-raised border border-border rounded p-8">
        <span>Kasir: {cashierName}</span>
        {tableName && <span>Meja: {tableName}</span>}
        <span>Lunas: {fmtOrderDateTime(order.closedAt ?? order.openedAt, tz)}</span>
        {order.payments.length > 0 && (
          <span>
            Bayar: {order.payments.map((p) => `${p.methodName} (${formatRp(p.amount)})`).join(' + ')}
          </span>
        )}
      </div>

      {extraLoad.status === 'loading' ? (
        <div className="cg-skeleton h-10 w-full" aria-label="Memuat riwayat refund" />
      ) : extraLoad.status === 'error' ? (
        <p className="text-danger">{extraLoad.message}</p>
      ) : refunds.length > 0 ? (
        <div className="bg-surface-raised border border-border rounded p-12 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <span className="font-bold text-text">
              Riwayat Refund ({refunds.length}) · Total -{formatRp(totalRefunded)}
            </span>
            <span className="font-semibold text-accent cg-num">
              Bersih: {formatRp(order.total - totalRefunded)}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {refunds.map((r) => (
              <li key={r.id} className="py-6 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <div className="flex flex-wrap items-center gap-6">
                    <span className="font-semibold text-text">{r.number}</span>
                    <span className="cg-badge cg-badge--warning">{r.methodName}</span>
                  </div>
                  <span className="cg-num font-bold text-danger">-{formatRp(r.total)}</span>
                </div>
                <p className="text-text-muted">
                  {fmtOrderDateTime(r.createdAt, tz)} · Alasan: {r.reason}
                  {r.note ? ` (${r.note})` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Modal Filter Pesanan (Status & Jenis) */
function FilterDialog({
  status,
  type,
  onClose,
  onApply,
  onReset,
}: {
  status: string;
  type: string;
  onClose: () => void;
  onApply: (status: string, type: string) => void;
  onReset: () => void;
}) {
  const [selStatus, setSelStatus] = useState(status);
  const [selType, setSelType] = useState(type);

  return (
    <Modal title="Filter Pesanan" onClose={onClose} labelledBy="filter-order-title">
      <div className="grid gap-16">
        <div className="cg-field">
          <label className="cg-label" htmlFor="filter-status-select">
            Status Pesanan
          </label>
          <select
            id="filter-status-select"
            className="cg-input"
            value={selStatus}
            onChange={(e) => setSelStatus(e.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="open">Terbuka</option>
            <option value="partially_paid">Dibayar sebagian</option>
            <option value="paid">Lunas / Selesai</option>
            <option value="void">Dibatalkan</option>
          </select>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="filter-type-select">
            Jenis Pesanan
          </label>
          <select
            id="filter-type-select"
            className="cg-input"
            value={selType}
            onChange={(e) => setSelType(e.target.value)}
          >
            <option value="all">Semua jenis pesanan</option>
            <option value="dine_in">Makan di tempat</option>
            <option value="takeaway">Bawa pulang</option>
            <option value="delivery">Antar</option>
            <option value="service">Jasa</option>
          </select>
        </div>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onReset}>
            Reset
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => onApply(selStatus, selType)}
          >
            Terapkan Filter
          </button>
        </div>
      </div>
    </Modal>
  );
}

function VoidDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (number: string) => void }) {
  const data = useData();
  const ap = useApprover('void_order', { allowCode: true, orderId: order.id });
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason === 'Lainnya' && !note.trim()) return setError('Tulis alasannya.');
    setBusy(true); setError('');
    try {
      const by = await ap.authorizeWith();
      if (!by) { setBusy(false); return setError(ap.usingCode ? 'Kode salah, sudah dipakai, atau kedaluwarsa.' : 'PIN salah.'); }
      await data.voidUnpaidOrder(order.id, reason === 'Lainnya' ? note.trim() : note.trim() ? `${reason}: ${note.trim()}` : reason, by.id, by.method);
      onDone(order.number);
    } catch (err) { setError(err instanceof Error ? err.message : 'Pesanan gagal dibatalkan.'); setBusy(false); }
  }

  return (
    <Modal title={`Batalkan ${order.number}?`} onClose={busy ? undefined : onClose} labelledBy="void-title">
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">Pesanan {formatRp(order.total)} akan dibatalkan dan tidak bisa dibayar lagi. Pesanan yang sudah ada pembayarannya harus di-refund, bukan dibatalkan.</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="alasan">Alasan</label>
          <select id="alasan" className="cg-input" value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="catatan">Catatan {reason === 'Lainnya' ? '' : '(opsional)'}</label>
          <input id="catatan" className="cg-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ApproverFields a={ap} idPrefix="void" what="pembatalan" />
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Jangan batalkan</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || ap.staffLoading || !ap.credentialReady}>{busy ? 'Membatalkan…' : 'Batalkan pesanan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RefundDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (r: Refund) => void }) {
  const data = useData();
  const ap = useApprover('refund');
  const history = useAsync(() => data.listRefunds(order.id), [data, order.id]);
  const methods = useAsync(() => data.listPaymentMethods(), [data]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [methodId, setMethodId] = useState('');
  const [reason, setReason] = useState(REFUND_REASONS[0]!);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt] = useState(() => newId());

  const lines = history.status === 'ready' ? refundableLines(order, history.data) : [];
  const options = methods.status === 'ready' ? methods.data.filter((m) => m.kind === 'cash' || m.kind === 'noncash') : [];
  const method = options.find((m) => m.id === methodId) ?? options.find((m) => order.payments.some((p) => p.methodName === m.name)) ?? options[0];
  const picks = lines.map((l) => ({ orderItemId: l.orderItemId, qty: Math.min(qty[l.orderItemId] ?? 0, l.remainingQty) }));
  const total = refundAmounts(order, picks).reduce((a, x) => a + x.amount, 0);
  const alreadyRefunded = history.status === 'ready' ? history.data.reduce((a, r) => a + r.total, 0) : 0;
  const nothingLeft = history.status === 'ready' && lines.every((l) => l.remainingQty <= 0);
  const step = (id: string, d: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] ?? 0) + d)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !method) return;
    if (total <= 0) return setError('Pilih minimal satu item untuk di-refund.');
    if (reason === 'Lainnya' && !note.trim()) return setError('Tulis alasannya.');
    setBusy(true); setError('');
    try {
      const by = await ap.authorize();
      if (!by) { setBusy(false); return setError('PIN salah.'); }
      const r = await data.refundOrder({ id: attempt, orderId: order.id, methodId: method.id, items: picks.filter((p) => p.qty > 0), reason: reason === 'Lainnya' ? note.trim() : reason, note: reason === 'Lainnya' ? undefined : note.trim() || undefined, restock, authorizedBy: by });
      onDone(r);
    } catch (err) { setError(err instanceof Error ? err.message : 'Refund gagal dicatat.'); setBusy(false); }
  }

  return (
    <Modal title={`Refund ${order.number}`} onClose={busy ? undefined : onClose} labelledBy="refund-title">
      <form onSubmit={submit} className="grid gap-16">
        {history.status === 'loading' && <div className="cg-skeleton" style={{ height: 96 }} aria-busy="true" aria-label="Memuat" />}
        {history.status === 'error' && <p role="alert" className="text-danger-strong">Riwayat refund gagal dimuat. {history.message}</p>}
        {history.status === 'ready' && (
          <>
            <p className="cg-modal__body">Dibayar {formatRp(order.paidTotal)}{alreadyRefunded > 0 && <> · sudah di-refund <span className="cg-num">{formatRp(alreadyRefunded)}</span></>}. Pilih item dan jumlah yang dikembalikan; pajak, biaya layanan, dan potongan ikut dihitung sebanding.</p>
            {nothingLeft ? <p className="cg-banner cg-banner--info">Semua item pesanan ini sudah di-refund.</p> : (
              <ul className="grid gap-8" aria-label="Item untuk di-refund">
                {lines.map((l) => (
                  <li key={l.orderItemId} className="flex items-center justify-between gap-12">
                    <span className="min-w-0 break-words">{l.name}<span className="block text-text-muted text-sm">{l.remainingQty} dari {l.soldQty} bisa di-refund</span></span>
                    <span className="flex items-center gap-8 shrink-0">
                      <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label={`Kurangi ${l.name}`} disabled={(qty[l.orderItemId] ?? 0) <= 0} onClick={() => step(l.orderItemId, -1, l.remainingQty)}>−</button>
                      <span className="cg-num min-w-[24px] text-center" aria-label={`Jumlah ${l.name}`}>{picks.find((p) => p.orderItemId === l.orderItemId)?.qty ?? 0}</span>
                      <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" aria-label={`Tambah ${l.name}`} disabled={l.remainingQty <= 0 || (qty[l.orderItemId] ?? 0) >= l.remainingQty} onClick={() => step(l.orderItemId, 1, l.remainingQty)}>+</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!nothingLeft && (
              <>
                <p className="flex justify-between gap-12"><span>Dikembalikan ke pelanggan</span><strong className="cg-num">{formatRp(total)}</strong></p>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-metode">Dikembalikan lewat</label>
                  <select id="refund-metode" className="cg-input" value={method?.id ?? ''} onChange={(e) => setMethodId(e.target.value)}>
                    {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-alasan">Alasan</label>
                  <select id="refund-alasan" className="cg-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REFUND_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="refund-catatan">Catatan {reason === 'Lainnya' ? '' : '(opsional)'}</label>
                  <input id="refund-catatan" className="cg-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
                </div>
                <label className="flex items-center gap-8"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Kembalikan barang ke stok</label>
                <ApproverFields a={ap} idPrefix="refund" what="refund" />
              </>
            )}
          </>
        )}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Tutup</button>
          {!nothingLeft && <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || total <= 0 || !method || ap.staffLoading || !ap.credentialReady}>{busy ? 'Mencatat…' : `Refund ${formatRp(total)}`}</button>}
        </div>
      </form>
    </Modal>
  );
}

function PendingList({
  entries,
  onRetry,
  onDiscard,
  onNotice,
}: {
  entries: PendingEntry[];
  onRetry: (id: string) => Promise<void>;
  onDiscard: (id: string) => void;
  onNotice: (m: string) => void;
}) {
  const [discarding, setDiscarding] = useState<PendingEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="cg-empty py-32 text-center bg-surface-raised rounded-xl border border-border">
        <h3 className="font-bold text-sm">Semua transaksi sudah terkirim</h3>
        <p className="text-xs text-text-muted mt-4">
          Pesanan dan pembayaran yang dibuat saat internet putus muncul di sini sampai terkirim ke server.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <p className="cg-banner cg-banner--info">
        Transaksi di bawah ini tersimpan di perangkat ini dan akan dikirim otomatis saat koneksi kembali. Nomor pesanan sementara diganti nomor resmi setelah terkirim.
      </p>
      <ul className="grid gap-12">
        {entries.map((e) => (
          <li key={e.id} className="border border-border rounded-lg bg-surface-raised p-16 grid gap-8">
            <div className="flex flex-wrap items-baseline justify-between gap-8">
              <strong className="break-all text-sm font-bold text-text">{e.label}</strong>
              <span className="text-text-muted text-xs">
                {hhmm(e.createdAt)} · <span className="cg-num font-semibold">{formatRp(e.amount)}</span>
              </span>
            </div>
            <p className="text-xs">
              {e.status === 'failed' ? (
                <span className="cg-badge cg-badge--warning">Ditolak server</span>
              ) : (
                <span className="cg-badge">Menunggu koneksi</span>
              )}
              {e.status === 'failed' && e.error && (
                <span className="ml-8 text-danger-strong break-words">{e.error}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-8">
              <button
                type="button"
                className="cg-btn cg-btn--secondary cg-btn--sm"
                disabled={busy === e.id}
                onClick={async () => {
                  setBusy(e.id);
                  try {
                    await onRetry(e.id);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === e.id ? 'Mengirim…' : 'Kirim ulang'}
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--ghost cg-btn--sm ml-auto"
                onClick={() => setDiscarding(e)}
              >
                Hapus
              </button>
            </div>
          </li>
        ))}
      </ul>
      {discarding && (
        <DiscardDialog
          entry={discarding}
          onClose={() => setDiscarding(null)}
          onDone={() => {
            onDiscard(discarding.id);
            onNotice('Transaksi tertunda dihapus dari perangkat.');
            setDiscarding(null);
          }}
        />
      )}
    </div>
  );
}

function DiscardDialog({ entry, onClose, onDone }: { entry: PendingEntry; onClose: () => void; onDone: () => void }) {
  const ap = useApprover('discard_pending');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const by = await ap.authorize();
      if (!by) { setBusy(false); return setError('PIN salah.'); }
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); setBusy(false); }
  }

  return (
    <Modal title="Hapus transaksi tertunda?" onClose={busy ? undefined : onClose} labelledBy="discard-title">
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">{entry.label} ({formatRp(entry.amount)}) akan dihapus dari perangkat dan <strong>tidak pernah tercatat di server</strong>. {entry.kind === 'order' ? 'Pembayaran yang menempel pada pesanan ini ikut terhapus. ' : ''}Tindakan ini tidak bisa dibatalkan.</p>
        <ApproverFields a={ap} idPrefix="discard" what="penghapusan" />
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>Jangan hapus</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || ap.staffLoading || !ap.credentialReady}>{busy ? 'Menghapus…' : 'Hapus transaksi'}</button>
        </div>
      </form>
    </Modal>
  );
}

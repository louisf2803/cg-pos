'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  buildCustomerDepositCsvRows,
  buildCustomerListCsvRows,
  buildCustomerOrdersCsvRows,
  buildCustomerPointsCsvRows,
  computeCustomerOrderStats,
  customerProblem,
  filterCustomerOrders,
  formatOrderPaymentMethods,
  formatRp,
  LOYALTY_KIND_LABEL,
  paginateOrders,
  toCsv,
  type Customer,
  type CustomerInput,
  type Order,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { downloadCsvWithHistory } from '@/lib/export';
import { ErrorBox, PageHeader } from '@/components/page';

type Dlg = { kind: 'edit'; item?: Customer } | { kind: 'detail'; item: Customer } | { kind: 'delete'; item: Customer };
const GENDER: Record<string, string> = { female: 'Perempuan', male: 'Laki-laki', other: 'Lainnya' };
const fmtDate = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(iso));

export default function PelangganPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useAsync(() => data.listCustomers({ search: term, limit: 200 }), [data, term]);
  const deposits = useAsync(async () => {
    try {
      return await data.listCustomerDepositBalances();
    } catch {
      return [];
    }
  }, [data]);

  const depBalances = deposits.status === 'ready' ? deposits.data : undefined;
  const depositMap = useMemo(() => {
    const map = new Map<string, number>();
    if (depBalances) {
      for (const d of depBalances) {
        map.set(d.customerId, d.currentBalance);
      }
    }
    return map;
  }, [depBalances]);

  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [notice, setNotice] = useState('');
  const done = (msg: string) => { setDlg(null); setNotice(msg); list.reload(); deposits.reload(); };

  function handleExportCustomers() {
    if (list.status !== 'ready' || list.data.length === 0) return;
    const depRecord: Record<string, number> = {};
    for (const [k, v] of depositMap.entries()) {
      depRecord[k] = v;
    }
    const rows = buildCustomerListCsvRows(list.data, depRecord);
    const csvContent = toCsv(rows);
    downloadCsvWithHistory({
      fileName: `daftar-pelanggan-${new Date().toISOString().slice(0, 10)}.csv`,
      reportName: 'Daftar Pelanggan',
      period: 'Semua Pelanggan',
      rowCount: list.data.length,
      sourceUrl: '/pelanggan',
      csvContent,
    });
  }

  return (
    <>
      <PageHeader
        title="Pelanggan"
        subtitle="Simpan data pelanggan, saldo poin, deposit, dan riwayat belanjanya"
        actions={
          <div className="flex items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleExportCustomers}
              disabled={list.status !== 'ready' || list.data.length === 0}
            >
              <Download className="cg-icon cg-icon--sm" aria-hidden />
              Ekspor CSV
            </button>
            <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>
              <Plus className="cg-icon" aria-hidden /> Tambah pelanggan
            </button>
          </div>
        }
      />
      <div className="mb-16"><label className="cg-search">
        <Search className="cg-icon cg-icon--sm" aria-hidden />
        <input className="cg-input" type="search" placeholder="Cari nama, kode, atau nomor telepon" aria-label="Cari pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
      </label></div>
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {list.status === 'ready' && (list.data.length === 0 ? (
        <div className="cg-empty">
          <p><strong>{term ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan.'}</strong></p>
          {!term && <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Tambah pelanggan pertama</button>}
        </div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Telepon</th>
                <th>Kota</th>
                <th className="text-right">Poin</th>
                <th className="text-right">Deposit</th>
                <th><span className="cg-sr">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <td className="break-words max-w-[280px]">
                    <button className="text-left font-semibold underline underline-offset-2 min-h-[32px]" onClick={() => setDlg({ kind: 'detail', item: c })}>{c.name}</button>
                    {c.code && <span className="block text-sm text-text-muted">{c.code}</span>}
                  </td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.city ?? '—'}</td>
                  <td className="text-right cg-num">{c.pointsBalance}</td>
                  <td className="text-right cg-num font-medium">{formatRp(depositMap.get(c.id) ?? 0)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'edit', item: c })} aria-label={`Ubah ${c.name}`}><Pencil className="cg-icon cg-icon--sm" aria-hidden /></button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'delete', item: c })} aria-label={`Hapus ${c.name}`}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {dlg?.kind === 'edit' && <EditDialog item={dlg.item} onClose={() => setDlg(null)} onSaved={(c) => done(`${c.name} disimpan.`)} />}
      {dlg?.kind === 'detail' && <DetailDialog item={dlg.item} onClose={() => setDlg(null)} onEdit={() => setDlg({ kind: 'edit', item: dlg.item })} />}
      {dlg?.kind === 'delete' && <DeleteDialog item={dlg.item} onClose={() => setDlg(null)} onDone={() => done(`${dlg.item.name} dihapus. Riwayat transaksinya tetap tersimpan.`)} />}
    </>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}

function EditDialog({ item, onClose, onSaved }: { item?: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [f, setF] = useState({ name: item?.name ?? '', phone: item?.phone ?? '', email: item?.email ?? '', gender: item?.gender ?? '', birthDate: item?.birthDate ?? '', city: item?.city ?? '', address: item?.address ?? '', note: item?.note ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: CustomerInput = {
      id: item?.id, name: f.name, phone: f.phone || undefined, email: f.email || undefined, gender: (f.gender || undefined) as CustomerInput['gender'],
      birthDate: f.birthDate || undefined, city: f.city || undefined, address: f.address || undefined, note: f.note || undefined,
    };
    const problem = customerProblem(input);
    if (problem) return setError(problem);
    setBusy(true); setError(null);
    try { onSaved(await data.saveCustomer(input)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Pelanggan gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-pelanggan">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-pelanggan" className="cg-modal__title">{item ? 'Ubah pelanggan' : 'Tambah pelanggan'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="p-nama">Nama</label>
          <input id="p-nama" className="cg-input" autoFocus maxLength={80} value={f.name} onChange={set('name')} /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="p-tel">Telepon</label>
            <input id="p-tel" className="cg-input" inputMode="tel" maxLength={20} value={f.phone} onChange={set('phone')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-email">Email</label>
            <input id="p-email" className="cg-input" type="email" maxLength={120} value={f.email} onChange={set('email')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-gender">Jenis kelamin</label>
            <select id="p-gender" className="cg-input" value={f.gender} onChange={set('gender')}>
              <option value="">Tidak diisi</option><option value="female">Perempuan</option><option value="male">Laki-laki</option><option value="other">Lainnya</option>
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-lahir">Tanggal lahir</label>
            <input id="p-lahir" className="cg-input" type="date" value={f.birthDate} onChange={set('birthDate')} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="p-kota">Kota</label>
            <input id="p-kota" className="cg-input" maxLength={60} value={f.city} onChange={set('city')} /></div>
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="p-alamat">Alamat</label>
          <textarea id="p-alamat" className="cg-input" rows={2} maxLength={300} value={f.address} onChange={set('address')} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="p-catatan">Catatan</label>
          <textarea id="p-catatan" className="cg-input" rows={2} maxLength={300} value={f.note} onChange={set('note')} /></div>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

type DetailTab = 'summary' | 'orders' | 'points' | 'deposit';

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: 'Lunas',
  open: 'Belum lunas',
  partially_paid: 'Belum lunas',
  void: 'Dibatalkan',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Makan di tempat',
  take_away: 'Bawa pulang',
  delivery: 'Antar',
  service: 'Jasa',
};

const DEPOSIT_KIND_LABELS: Record<string, string> = {
  purchase: 'Pembelian Deposit',
  usage: 'Pemakaian Deposit',
  refund: 'Pengembalian Deposit',
};

function DetailDialog({ item, onClose, onEdit }: { item: Customer; onClose: () => void; onEdit: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [activeTab, setActiveTab] = useState<DetailTab>('summary');

  // Ambil transaksi pelanggan (dengan filter klien pengaman)
  const hist = useAsync(async () => {
    const res = await data.listOrders({ customerId: item.id, all: true });
    return res.filter((o: Order) => !o.customerId || o.customerId === item.id);
  }, [data, item.id]);

  // Ambil riwayat mutasi poin
  const led = useAsync(async () => {
    try {
      return await data.listLoyaltyLedger(item.id, 50);
    } catch {
      return [];
    }
  }, [data, item.id]);

  // Ambil saldo deposit pelanggan
  const dep = useAsync(async () => {
    try {
      return await data.getCustomerDeposit(item.id);
    } catch {
      return null;
    }
  }, [data, item.id]);

  // Ambil riwayat transaksi deposit pelanggan
  const depEntries = useAsync(async () => {
    try {
      return await data.listCustomerDepositEntries(item.id);
    } catch {
      return [];
    }
  }, [data, item.id]);

  const [balance, setBalance] = useState(item.pointsBalance);
  const [adj, setAdj] = useState({ delta: '', note: '' });
  const [adjErr, setAdjErr] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);

  // Filter & paginasi untuk tab riwayat transaksi
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const allOrders = hist.status === 'ready' ? hist.data : [];
  const stats = useMemo(() => computeCustomerOrderStats(allOrders, item.id), [allOrders, item.id]);

  const filteredOrders = useMemo(() => {
    return filterCustomerOrders(allOrders, item.id, orderSearch, orderStatus);
  }, [allOrders, item.id, orderSearch, orderStatus]);

  const paginated = useMemo(() => {
    return paginateOrders(filteredOrders, page, 5);
  }, [filteredOrders, page]);

  useEffect(() => {
    setPage(1);
  }, [orderSearch, orderStatus]);

  function handleExportOrders() {
    if (filteredOrders.length === 0) return;
    const rows = buildCustomerOrdersCsvRows(filteredOrders);
    const csvContent = toCsv(rows);
    downloadCsvWithHistory({
      fileName: `riwayat-transaksi-${item.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      reportName: `Riwayat Transaksi - ${item.name}`,
      period: 'Semua Transaksi',
      rowCount: filteredOrders.length,
      sourceUrl: '/pelanggan',
      csvContent,
    });
  }

  function handleExportPoints() {
    if (led.status !== 'ready' || led.data.length === 0) return;
    const rows = buildCustomerPointsCsvRows(led.data);
    const csvContent = toCsv(rows);
    downloadCsvWithHistory({
      fileName: `riwayat-poin-${item.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      reportName: `Riwayat Poin - ${item.name}`,
      period: 'Semua Poin',
      rowCount: led.data.length,
      sourceUrl: '/pelanggan',
      csvContent,
    });
  }

  function handleExportDeposits() {
    if (depEntries.status !== 'ready' || depEntries.data.length === 0) return;
    const rows = buildCustomerDepositCsvRows(depEntries.data);
    const csvContent = toCsv(rows);
    downloadCsvWithHistory({
      fileName: `riwayat-deposit-${item.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      reportName: `Riwayat Deposit - ${item.name}`,
      period: 'Semua Deposit',
      rowCount: depEntries.data.length,
      sourceUrl: '/pelanggan',
      csvContent,
    });
  }

  async function adjust(e: FormEvent) {
    e.preventDefault();
    if (adjBusy) return;
    const n = Number(adj.delta.replace(/[^\d-]/g, ''));
    if (!Number.isInteger(n) || n === 0) {
      return setAdjErr('Isi jumlah poin, positif untuk menambah atau negatif untuk mengurangi.');
    }
    setAdjBusy(true);
    setAdjErr('');
    try {
      setBalance(await data.adjustPoints(item.id, n, adj.note));
      setAdj({ delta: '', note: '' });
      led.reload();
    } catch (err) {
      setAdjErr(err instanceof Error ? err.message : 'Poin gagal disesuaikan.');
    } finally {
      setAdjBusy(false);
    }
  }

  const profileRows: [string, string | undefined][] = [
    ['Kode', item.code],
    ['Telepon', item.phone],
    ['Email', item.email],
    ['Jenis kelamin', item.gender ? GENDER[item.gender] : undefined],
    ['Tanggal lahir', item.birthDate ? fmtDate(item.birthDate + 'T12:00:00+07:00') : undefined],
    ['Kota', item.city],
    ['Alamat', item.address],
    ['Catatan', item.note],
  ];

  return (
    <dialog {...d.props} aria-labelledby="judul-detail">
      <div className="grid gap-16 w-full max-w-[640px] text-text">
        {/* Header Dialog */}
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h2 id="judul-detail" className="cg-modal__title break-words">
              {item.name}
            </h2>
            {item.code && <span className="text-xs text-text-muted">{item.code}</span>}
          </div>
          <button
            type="button"
            className="text-text-muted hover:text-text p-4 rounded-md"
            onClick={() => d.ref.current?.close()}
            aria-label="Tutup dialog"
          >
            <X className="w-16 h-16" />
          </button>
        </div>

        {/* Tab Segmented Control */}
        <div className="flex items-center gap-8 border-b border-border pb-8 overflow-x-auto min-w-0" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'summary'}
            className="cg-chip"
            aria-pressed={activeTab === 'summary'}
            onClick={() => {
              setActiveTab('summary');
              setSelectedOrder(null);
            }}
          >
            Ringkasan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            className="cg-chip"
            aria-pressed={activeTab === 'orders'}
            onClick={() => setActiveTab('orders')}
          >
            Riwayat transaksi {allOrders.length > 0 ? `(${allOrders.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'points'}
            className="cg-chip"
            aria-pressed={activeTab === 'points'}
            onClick={() => {
              setActiveTab('points');
              setSelectedOrder(null);
            }}
          >
            Poin ({balance})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'deposit'}
            className="cg-chip"
            aria-pressed={activeTab === 'deposit'}
            onClick={() => {
              setActiveTab('deposit');
              setSelectedOrder(null);
            }}
          >
            Deposit {dep.status === 'ready' && dep.data ? `(${formatRp(dep.data.currentBalance)})` : ''}
          </button>
        </div>

        {/* TAB 1: RINGKASAN */}
        {activeTab === 'summary' && (
          <div className="grid gap-16 min-w-0">
            {/* 4 Kartu Ringkasan Cepat */}
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-8">
              <div className="p-8 border border-border rounded-xl bg-surface-muted/30">
                <span className="text-xs text-text-muted block mb-4">Total Belanja</span>
                <strong className="text-sm cg-num text-text">{formatRp(stats.totalSpend)}</strong>
              </div>
              <div className="p-8 border border-border rounded-xl bg-surface-muted/30">
                <span className="text-xs text-text-muted block mb-4">Transaksi Lunas</span>
                <strong className="text-sm cg-num text-text">{stats.paidCount}</strong>
              </div>
              <div className="p-8 border border-border rounded-xl bg-surface-muted/30">
                <span className="text-xs text-text-muted block mb-4">Saldo Poin</span>
                <strong className="text-sm cg-num text-text" data-testid="saldo-poin">{balance}</strong>
              </div>
              <div className="p-8 border border-border rounded-xl bg-surface-muted/30">
                <span className="text-xs text-text-muted block mb-4">Saldo Deposit</span>
                <strong className="text-sm cg-num text-text" data-testid="saldo-deposit">
                  {formatRp(dep.status === 'ready' && dep.data ? dep.data.currentBalance : 0)}
                </strong>
              </div>
            </div>

            {/* Rincian Profil */}
            <section aria-label="Profil pelanggan">
              <h3 className="font-semibold text-xs text-text-muted uppercase mb-8">Informasi Kontak & Alamat</h3>
              <dl className="grid gap-8 text-sm" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 16 }}>
                {profileRows.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="break-words font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}

        {/* TAB 2: RIWAYAT TRANSAKSI */}
        {activeTab === 'orders' && (
          <div className="grid gap-12 min-w-0">
            {selectedOrder ? (
              /* Tampilan Ringkasan Pesanan Baca-Saja */
              <div className="border border-border rounded-xl p-16 bg-surface-muted/20 flex flex-col gap-12">
                <div className="flex items-center justify-between pb-8 border-b border-border">
                  <div>
                    <h3 className="font-bold text-sm text-text">
                      Pesanan {selectedOrder.number}
                    </h3>
                    <span className="text-xs text-text-muted">
                      {fmtDate(selectedOrder.closedAt ?? selectedOrder.openedAt)} · {ORDER_TYPE_LABELS[selectedOrder.type] || selectedOrder.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Kembali ke daftar
                  </button>
                </div>

                {/* Tabel Item Pesanan */}
                <div className="cg-data-wrap">
                  <table className="cg-data w-full text-xs" aria-label="Rincian item pesanan">
                    <thead>
                      <tr>
                        <th>Menu</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Harga</th>
                        <th className="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="break-words max-w-[200px]">
                            <span className="font-medium text-text">{it.name}</span>
                            {it.note && <span className="block text-[11px] text-text-muted italic">Catatan: {it.note}</span>}
                          </td>
                          <td className="text-right cg-num">{it.qty}</td>
                          <td className="text-right cg-num">{formatRp(it.unitPrice)}</td>
                          <td className="text-right cg-num font-medium">{formatRp(it.unitPrice * it.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ringkasan Hitungan Biaya */}
                <div className="grid gap-4 text-xs max-w-[260px] ml-auto border-t border-border pt-8 w-full">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Subtotal:</span>
                    <span className="cg-num">{formatRp(selectedOrder.subtotal)}</span>
                  </div>
                  {selectedOrder.discountTotal > 0 && (
                    <div className="flex justify-between text-danger">
                      <span>Potongan:</span>
                      <span className="cg-num">-{formatRp(selectedOrder.discountTotal)}</span>
                    </div>
                  )}
                  {selectedOrder.serviceCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Layanan:</span>
                      <span className="cg-num">{formatRp(selectedOrder.serviceCharge)}</span>
                    </div>
                  )}
                  {selectedOrder.taxTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Pajak PB1:</span>
                      <span className="cg-num">{formatRp(selectedOrder.taxTotal)}</span>
                    </div>
                  )}
                  {selectedOrder.rounding !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Pembulatan:</span>
                      <span className="cg-num">{formatRp(selectedOrder.rounding)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm border-t border-border pt-4 text-text">
                    <span>Total:</span>
                    <span className="cg-num">{formatRp(selectedOrder.total)}</span>
                  </div>
                </div>

                {/* Rincian Pembayaran */}
                {selectedOrder.payments.length > 0 && (
                  <div className="border-t border-border pt-8 text-xs">
                    <span className="font-semibold text-text block mb-4">Pembayaran:</span>
                    {selectedOrder.payments.map((p, pIdx) => (
                      <div key={p.id || pIdx} className="flex justify-between text-text-muted py-[2px]">
                        <span>{p.methodName || p.kind} {p.reference ? `(${p.reference})` : ''}</span>
                        <span className="cg-num font-medium text-text">{formatRp(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Tabel Daftar Riwayat Pesanan */
              <>
                {/* Baris Pencarian & Filter Status */}
                <div className="flex flex-col tablet:flex-row gap-8 items-stretch tablet:items-center justify-between">
                  <div className="relative flex-1">
                    <Search className="w-16 h-16 absolute left-8 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="search"
                      placeholder="Cari nomor pesanan…"
                      className="cg-input pl-[28px] text-xs w-full h-[36px]"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-8 shrink-0">
                    <select
                      className="cg-input text-xs h-[36px]"
                      value={orderStatus}
                      onChange={(e) => setOrderStatus(e.target.value)}
                    >
                      <option value="all">Semua status</option>
                      <option value="paid">Lunas</option>
                      <option value="unpaid">Belum lunas</option>
                      <option value="void">Dibatalkan</option>
                    </select>
                    {filteredOrders.length > 0 && (
                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm h-[36px]"
                        onClick={handleExportOrders}
                      >
                        <Download className="w-12 h-12 mr-4" />
                        Ekspor Transaksi
                      </button>
                    )}
                  </div>
                </div>

                {hist.status === 'loading' && (
                  <div className="grid gap-8 py-16" aria-busy="true" aria-label="Memuat transaksi">
                    {[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}
                  </div>
                )}
                {hist.status === 'error' && <ErrorBox message={hist.message} onRetry={hist.reload} />}

                {hist.status === 'ready' && (
                  paginated.totalCount === 0 ? (
                    <div className="p-16 text-center text-xs text-text-muted border border-border rounded-xl">
                      <p className="font-semibold text-text mb-4">
                        {orderSearch || orderStatus !== 'all' ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.'}
                      </p>
                      <p>Transaksi pelanggan akan tercatat otomatis saat kasir memilih pelanggan ini saat checkout.</p>
                    </div>
                  ) : (
                    <>
                      <div className="cg-data-wrap min-w-0">
                        <table className="cg-data w-full text-xs" aria-label="Daftar transaksi pelanggan">
                          <thead>
                            <tr>
                              <th>Nomor</th>
                              <th>Waktu</th>
                              <th>Metode</th>
                              <th>Status</th>
                              <th className="text-right">Total</th>
                              <th className="text-center"><span className="cg-sr">Aksi</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginated.items.map((o) => (
                              <tr key={o.id} className="hover:bg-surface-muted/50 cursor-pointer" onClick={() => setSelectedOrder(o)}>
                                <td className="font-semibold text-primary">{o.number}</td>
                                <td className="whitespace-nowrap text-text-muted">{fmtDate(o.closedAt ?? o.openedAt)}</td>
                                <td className="max-w-[120px] truncate text-text-muted">{formatOrderPaymentMethods(o)}</td>
                                <td>
                                  <span className={`cg-badge ${
                                    o.status === 'paid' ? 'cg-badge--success' : o.status === 'void' ? 'cg-badge--danger' : 'cg-badge--warning'
                                  }`}>
                                    {ORDER_STATUS_LABELS[o.status] || o.status}
                                  </span>
                                </td>
                                <td className="text-right cg-num font-bold">{formatRp(o.total)}</td>
                                <td className="text-center">
                                  <button
                                    type="button"
                                    className="cg-btn cg-btn--ghost cg-btn--sm p-4"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrder(o);
                                    }}
                                    aria-label={`Lihat pesanan ${o.number}`}
                                  >
                                    <Eye className="w-12 h-12" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {paginated.totalPages > 1 && (
                        <div className="flex items-center justify-between text-xs pt-8 border-t border-border mt-4">
                          <span className="text-text-muted">
                            Halaman {paginated.currentPage} dari {paginated.totalPages} ({paginated.totalCount} transaksi)
                          </span>
                          <div className="flex items-center gap-8">
                            <button
                              type="button"
                              className="cg-btn cg-btn--secondary cg-btn--sm"
                              disabled={paginated.currentPage <= 1}
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="w-12 h-12 mr-4" />
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              className="cg-btn cg-btn--secondary cg-btn--sm"
                              disabled={paginated.currentPage >= paginated.totalPages}
                              onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
                            >
                              Berikutnya
                              <ChevronRight className="w-12 h-12 ml-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: POIN */}
        {activeTab === 'points' && (
          <div className="grid gap-16 min-w-0">
            {/* Saldo Poin Box */}
            <div className="p-16 border border-border rounded-xl bg-surface-muted/30 flex items-center justify-between">
              <div>
                <span className="text-xs text-text-muted block">Saldo Poin Aktif</span>
                <span className="text-2xl font-bold cg-num text-primary" data-testid="saldo-poin">
                  {balance}
                </span>
                <span className="text-xs text-text-muted block mt-4">
                  Poin dapat ditukarkan saat transaksi di kasir sesuai aturan loyalti.
                </span>
              </div>
            </div>

            {/* Riwayat Mutasi Poin */}
            <section aria-labelledby="poin-judul">
              <div className="flex items-center justify-between mb-8">
                <h3 id="poin-judul" className="font-semibold text-xs text-text-muted uppercase">
                  Riwayat Pergerakan Poin
                </h3>
                {led.status === 'ready' && led.data.length > 0 && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={handleExportPoints}
                  >
                    <Download className="w-12 h-12 mr-4" />
                    Ekspor Poin
                  </button>
                )}
              </div>

              {led.status === 'loading' && <div className="cg-skeleton" style={{ height: 48 }} aria-busy="true" aria-label="Memuat poin" />}
              {led.status === 'error' && <ErrorBox message={led.message} onRetry={led.reload} />}
              {led.status === 'ready' && (led.data.length === 0 ? (
                <p className="text-xs text-text-muted">Belum ada pergerakan poin.</p>
              ) : (
                <ul className="grid gap-4 max-h-[160px] overflow-auto text-xs" aria-label="Pergerakan poin">
                  {led.data.map((e) => (
                    <li key={e.id} className="flex justify-between gap-12 border-b border-border pb-4">
                      <span className="min-w-0 break-words">
                        <span className="font-medium text-text">{LOYALTY_KIND_LABEL[e.kind] || e.kind}</span>
                        {e.note ? ` · ${e.note}` : ''}
                        <span className="block text-text-muted">{fmtDate(e.createdAt)}</span>
                      </span>
                      <span className={`cg-num font-bold ${e.points > 0 ? 'text-success' : 'text-danger'}`}>
                        {e.points > 0 ? `+${e.points}` : e.points}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}

              {/* Form Koreksi Poin */}
              <form onSubmit={adjust} className="grid gap-8 mt-16 p-12 border border-border rounded-xl" noValidate aria-label="Sesuaikan poin">
                <span className="font-semibold text-xs text-text">Penyesuaian Poin Manual</span>
                <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(96px, 1fr) 2fr' }}>
                  <div className="cg-field">
                    <label className="cg-label text-xs" htmlFor="poin-delta">Poin (+/-)</label>
                    <input
                      id="poin-delta"
                      className="cg-input text-xs"
                      inputMode="numeric"
                      placeholder="+100 atau -50"
                      maxLength={7}
                      value={adj.delta}
                      onChange={(e) => {
                        setAdj((s) => ({ ...s, delta: e.target.value }));
                        setAdjErr('');
                      }}
                    />
                  </div>
                  <div className="cg-field">
                    <label className="cg-label text-xs" htmlFor="poin-catatan">Alasan penyesuaian</label>
                    <input
                      id="poin-catatan"
                      className="cg-input text-xs"
                      placeholder="Contoh: Koreksi kasir, reward khusus"
                      maxLength={200}
                      value={adj.note}
                      onChange={(e) => setAdj((s) => ({ ...s, note: e.target.value }))}
                    />
                  </div>
                </div>
                {adjErr && <p role="alert" className="text-danger text-xs min-h-[16px]">{adjErr}</p>}
                <div>
                  <button type="submit" className="cg-btn cg-btn--secondary cg-btn--sm" disabled={adjBusy}>
                    {adjBusy ? 'Menyimpan…' : 'Simpan penyesuaian poin'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* TAB 4: DEPOSIT */}
        {activeTab === 'deposit' && (
          <div className="grid gap-16 min-w-0">
            {dep.status === 'loading' && <div className="cg-skeleton" style={{ height: 80 }} aria-busy="true" aria-label="Memuat deposit" />}
            {dep.status === 'error' && <ErrorBox message={dep.message} onRetry={dep.reload} />}
            {dep.status === 'ready' && (
              <>
                <div className="p-16 border border-border rounded-xl bg-surface-muted/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-text-muted block">Saldo Deposit Aktif</span>
                    <span className="text-2xl font-bold cg-num text-primary" data-testid="detail-saldo-deposit">
                      {formatRp(dep.data?.currentBalance ?? 0)}
                    </span>
                    <span className="text-xs text-text-muted block mt-4">
                      Pembelian dan pemakaian saldo deposit dicatat secara otomatis melalui kasir atau menu Deposit.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
                  <div className="p-12 border border-border rounded-xl bg-surface">
                    <span className="text-xs text-text-muted block mb-4">Total Pembelian</span>
                    <strong className="text-sm cg-num text-success">{formatRp(dep.data?.totalDepositPurchased ?? 0)}</strong>
                  </div>
                  <div className="p-12 border border-border rounded-xl bg-surface">
                    <span className="text-xs text-text-muted block mb-4">Total Pemakaian</span>
                    <strong className="text-sm cg-num text-text">{formatRp(dep.data?.totalDepositUsed ?? 0)}</strong>
                  </div>
                  <div className="p-12 border border-border rounded-xl bg-surface">
                    <span className="text-xs text-text-muted block mb-4">Total Pengembalian</span>
                    <strong className="text-sm cg-num text-danger">{formatRp(dep.data?.totalDepositRefunded ?? 0)}</strong>
                  </div>
                </div>

                {/* Riwayat Mutasi Deposit */}
                <section aria-labelledby="deposit-riwayat-judul">
                  <div className="flex items-center justify-between mb-8">
                    <h3 id="deposit-riwayat-judul" className="font-semibold text-xs text-text-muted uppercase">
                      Riwayat Mutasi Deposit
                    </h3>
                    {depEntries.status === 'ready' && depEntries.data.length > 0 && (
                      <button
                        type="button"
                        className="cg-btn cg-btn--secondary cg-btn--sm"
                        onClick={handleExportDeposits}
                      >
                        <Download className="w-12 h-12 mr-4" />
                        Ekspor Deposit
                      </button>
                    )}
                  </div>

                  {depEntries.status === 'loading' && <div className="cg-skeleton" style={{ height: 60 }} aria-busy="true" aria-label="Memuat riwayat deposit" />}
                  {depEntries.status === 'error' && <ErrorBox message={depEntries.message} onRetry={depEntries.reload} />}
                  {depEntries.status === 'ready' && (depEntries.data.length === 0 ? (
                    <div className="p-16 text-center text-xs text-text-muted border border-border rounded-xl">
                      <p className="font-semibold text-text mb-4">Belum ada riwayat transaksi deposit.</p>
                      <p>Transaksi deposit akan tercatat saat pelanggan membeli paket deposit atau melakukan transaksi menggunakan deposit.</p>
                    </div>
                  ) : (
                    <div className="cg-data-wrap min-w-0">
                      <table className="cg-data w-full text-xs" aria-label="Riwayat mutasi deposit">
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Jenis</th>
                            <th>Nomor Dokumen</th>
                            <th>Keterangan</th>
                            <th className="text-right">Nominal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {depEntries.data.map((e) => {
                            const isCredit = e.kind === 'purchase';
                            return (
                              <tr key={e.id}>
                                <td className="whitespace-nowrap text-text-muted">{fmtDate(e.occurredAt)}</td>
                                <td>
                                  <span className={`cg-badge ${isCredit ? 'cg-badge--success' : e.kind === 'refund' ? 'cg-badge--danger' : 'cg-badge--warning'}`}>
                                    {DEPOSIT_KIND_LABELS[e.kind] || e.kind}
                                  </span>
                                </td>
                                <td className="font-semibold text-text">{e.orderNumber || '—'}</td>
                                <td className="break-words max-w-[180px] text-text-muted">
                                  {e.packageName || e.reason || '—'}
                                  {e.paymentMethod ? ` (${e.paymentMethod})` : ''}
                                </td>
                                <td className={`text-right cg-num font-bold ${isCredit ? 'text-success' : 'text-danger'}`}>
                                  {isCredit ? `+${formatRp(e.creditAmount)}` : `-${formatRp(e.creditAmount)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="cg-modal__actions pt-12 border-t border-border flex justify-end gap-8">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>
            Tutup
          </button>
          <button type="button" className="cg-btn cg-btn--primary" onClick={onEdit}>
            Ubah pelanggan
          </button>
        </div>
      </div>
    </dialog>
  );
}

function DeleteDialog({ item, onClose, onDone }: { item: Customer; onClose: () => void; onDone: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try { await data.deleteCustomer(item.id); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal menghapus.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-hapus">
      <div className="grid gap-16">
        <h2 id="judul-hapus" className="cg-modal__title">Hapus {item.name}?</h2>
        <p className="cg-modal__body">Pelanggan hilang dari daftar. Transaksi lamanya tetap tersimpan di laporan.</p>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button className="cg-btn cg-btn--danger" disabled={busy} onClick={() => void go()}>{busy ? 'Menghapus…' : 'Hapus'}</button>
        </div>
      </div>
    </dialog>
  );
}

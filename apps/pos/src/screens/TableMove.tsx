import { useMemo, useState, type FormEvent } from 'react';
import {
  createTableGroup,
  formatRp,
  formatTableGroupLabel,
  newId,
  splitByItem,
  type Order,
  type OrderDraft,
  type TableGroup,
  type TableStatus,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useApprover, ApproverFields } from '../lib/approver';
import { Modal } from '../ui';
import { Minus, Plus } from 'lucide-react';

/** Pindahkan pesanan yang belum dibayar ke meja kosong lain dengan otorisasi PIN manajer. */
export function MoveTableDialog({
  order,
  tableName,
  onClose,
  onDone,
}: {
  order: Order;
  tableName: string;
  onClose: () => void;
  onDone: (o: Order, to: string) => void;
}) {
  const data = useData();
  const ap = useApprover('move_table');
  const st = useAsync(
    async () => ({
      floors: await data.listFloors(),
      tables: await data.listTableStatus(),
    }),
    [data],
  );
  const [floor, setFloor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const floors = st.status === 'ready' ? st.data.floors : [];
  const active =
    floor ??
    floors.find(
      (f) =>
        st.status === 'ready' &&
        st.data.tables.some((t) => t.floorId === f.id && t.id === order.tableId),
    )?.id ??
    floors[0]?.id ??
    null;
  const shown = useMemo(
    () =>
      st.status === 'ready'
        ? st.data.tables.filter((t) => (active ? t.floorId === active : true))
        : [],
    [st, active],
  );
  const target = st.status === 'ready' ? st.data.tables.find((t) => t.id === picked) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !picked || !target) return;
    setBusy(true);
    setError('');
    try {
      const by = await ap.authorize();
      if (!by) {
        setBusy(false);
        return setError('PIN otorisasi manajer salah.');
      }
      onDone(await data.moveOrderTable(order.id, picked), target.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pesanan gagal dipindah.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Pindah ${order.number}`}
      onClose={busy ? undefined : onClose}
      labelledBy="pindah-title"
    >
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">
          Sekarang di meja <strong>{tableName}</strong>. Pilih meja kosong tujuan dan otorisasi dengan PIN. Isi pesanan dan nomornya tidak berubah.
        </p>
        {st.status === 'loading' && (
          <div className="grid gap-8" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 56 }} />
            ))}
          </div>
        )}
        {st.status === 'error' && (
          <div className="cg-banner cg-banner--danger" role="alert">
            <span>Meja gagal dimuat. {st.message}</span>
            <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={st.reload}>
              Coba lagi
            </button>
          </div>
        )}
        {st.status === 'ready' && floors.length > 0 && (
          <>
            <div className="cg-tabs" role="tablist" aria-label="Lantai">
              {floors.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  className="cg-tab"
                  aria-selected={active === f.id}
                  onClick={() => {
                    setFloor(f.id);
                    setPicked(null);
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <ul
              className="grid gap-8"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}
              aria-label="Meja tujuan"
            >
              {shown.map((t) => {
                const here = t.id === order.tableId;
                const taken = !!t.order && !here;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`cg-btn cg-btn--block ${
                        picked === t.id ? 'cg-btn--primary' : 'cg-btn--secondary'
                      }`}
                      style={{ minHeight: 64, flexDirection: 'column' }}
                      disabled={taken || here}
                      aria-pressed={picked === t.id}
                      aria-label={
                        here
                          ? `Meja ${t.name}, meja sekarang`
                          : taken
                          ? `Meja ${t.name}, terisi`
                          : `Meja ${t.name}, kosong`
                      }
                      onClick={() => setPicked(t.id)}
                    >
                      <strong>{t.name}</strong>
                      <span
                        className={`cg-badge ${
                          here ? '' : taken ? 'cg-badge--warning' : 'cg-badge--accent'
                        }`}
                      >
                        {here ? 'Sekarang' : taken ? 'Terisi' : 'Kosong'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {target && <ApproverFields a={ap} idPrefix="pindah" what="pemindahan meja" />}

        <p role="alert" className="min-h-[24px] text-danger-strong">
          {error}
        </p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={busy || !picked || ap.staffLoading || !ap.credentialReady}
          >
            {busy ? 'Memindahkan…' : target ? `Pindah ke ${target.name}` : 'Pilih meja'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Satukan pesanan meja lain ke pesanan ini (mendukung gabung banyak sisa pesanan jadi satu transaksi) dengan PIN manajer. */
export function MergeTableDialog({
  order,
  names,
  onClose,
  onDone,
}: {
  order: Order;
  names: Record<string, string>;
  onClose: () => void;
  onDone: (o: Order, mergedCount: number) => void;
}) {
  const data = useData();
  const ap = useApprover('merge_tables');
  const others = useAsync(
    async () =>
      (await data.listOrders({ status: 'open', limit: 100 })).filter(
        (o) => o.id !== order.id && o.type === 'dine_in' && !!o.tableId && o.paidTotal === 0,
      ),
    [data, order.id],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const availableOrders = others.status === 'ready' ? others.data : [];
  const selectedOrders = availableOrders.filter((o) => selectedIds.includes(o.id));
  const totalMergedItems = selectedOrders.reduce(
    (n, o) => n + o.items.reduce((sum, i) => sum + i.qty, 0),
    0,
  );
  const totalMergedAmount = selectedOrders.reduce((sum, o) => sum + o.total, 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === availableOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableOrders.map((o) => o.id));
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const by = await ap.authorize();
      if (!by) {
        setBusy(false);
        return setError('PIN otorisasi manajer salah.');
      }
      let currentOrder = order;
      for (const fromId of selectedIds) {
        currentOrder = await data.mergeOrders({
          intoId: currentOrder.id,
          fromId,
          authorizedBy: by,
        });
      }
      onDone(currentOrder, selectedIds.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pesanan gagal digabung.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Gabung ke ${order.number}`}
      onClose={busy ? undefined : onClose}
      labelledBy="gabung-title"
    >
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">
          Pilih satu atau lebih pesanan meja lain yang disatukan ke meja{' '}
          <strong>{names[order.tableId ?? ''] ?? '—'}</strong>. Semua sisa item akan bergabung ke transaksi ini dan pesanan sumber dibatalkan.
        </p>
        {others.status === 'loading' && (
          <div className="cg-skeleton" style={{ height: 56 }} aria-busy="true" />
        )}
        {others.status === 'error' && (
          <div className="cg-banner cg-banner--danger" role="alert">
            <span>Daftar pesanan gagal dimuat. {others.message}</span>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={others.reload}
            >
              Coba lagi
            </button>
          </div>
        )}
        {others.status === 'ready' && others.data.length === 0 && (
          <p className="text-text-muted">
            Tidak ada pesanan meja lain yang bisa digabung. Pesanan yang sudah dibayar sebagian tidak bisa digabung.
          </p>
        )}
        {others.status === 'ready' && others.data.length > 0 && (
          <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="flex items-center justify-between">
              <legend className="cg-label font-semibold text-xs">Pilih Pesanan Meja Sumber</legend>
              <button
                type="button"
                className="text-xs text-accent hover:underline cursor-pointer"
                onClick={selectAll}
              >
                {selectedIds.length === availableOrders.length ? 'Batal Semua' : 'Pilih Semua'}
              </button>
            </div>
            {others.data.map((o) => {
              const checked = selectedIds.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-12 border rounded-lg p-12 cursor-pointer transition-colors ${
                    checked ? 'border-accent bg-accent/5' : 'border-border bg-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="sumber"
                    value={o.id}
                    checked={checked}
                    onChange={() => toggleSelect(o.id)}
                  />
                  <span className="grid min-w-0 flex-1">
                    <strong className="break-words">
                      Meja {names[o.tableId ?? ''] ?? '—'} · {o.number}
                    </strong>
                    <span className="text-text-muted text-sm">
                      {o.items.reduce((n, i) => n + i.qty, 0)} item ·{' '}
                      <span className="cg-num">{formatRp(o.total)}</span>
                      {o.label ? ` · ${o.label}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {selectedOrders.length > 0 && (
          <div className="p-10 rounded-lg bg-surface-muted text-xs flex justify-between items-center">
            <span>
              Total digabung: <strong>{selectedOrders.length} pesanan</strong> ({totalMergedItems} item)
            </span>
            <span className="font-bold cg-num">{formatRp(totalMergedAmount)}</span>
          </div>
        )}

        {selectedOrders.length > 0 && (
          <ApproverFields a={ap} idPrefix="gabung" what="penggabungan pesanan" />
        )}

        <p role="alert" className="min-h-[24px] text-danger-strong">
          {error}
        </p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={
              busy ||
              selectedOrders.length === 0 ||
              ap.staffLoading ||
              !ap.credentialReady
            }
          >
            {busy
              ? 'Menggabungkan…'
              : selectedOrders.length > 1
              ? `Gabungkan ${selectedOrders.length} Pesanan`
              : 'Gabungkan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Reset meja: batalkan pesanan terbuka yang menggantung pada meja dengan PIN manajer. */
export function ResetTableDialog({
  order,
  tableName,
  onClose,
  onDone,
}: {
  order: Order;
  tableName: string;
  onClose: () => void;
  onDone: (orderNumber: string) => void;
}) {
  const data = useData();
  const ap = useApprover('void_order');
  const [reason, setReason] = useState('Tamu batal / meninggalkan meja');
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveReason = reason === 'lainnya' ? customReason.trim() : reason;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !effectiveReason) return;
    setBusy(true);
    setError('');
    try {
      const by = await ap.authorize();
      if (!by) {
        setBusy(false);
        return setError('PIN otorisasi manajer salah.');
      }
      await data.voidUnpaidOrder(order.id, effectiveReason, by);
      onDone(order.number);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset meja.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Reset Meja ${tableName}`}
      onClose={busy ? undefined : onClose}
      labelledBy="reset-title"
    >
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">
          Mereset meja <strong>{tableName}</strong> akan membatalkan pesanan terbuka{' '}
          <strong>{order.number}</strong> ({formatRp(order.total)}) dan mengosongkan meja kembali. Tindakan ini memerlukan otorisasi PIN manajer.
        </p>

        <div className="cg-field">
          <label className="cg-label font-semibold text-xs" htmlFor="reset-reason">
            Alasan Reset Meja
          </label>
          <select
            id="reset-reason"
            className="cg-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="Tamu batal / meninggalkan meja">Tamu batal / meninggalkan meja</option>
            <option value="Pesanan salah / ganda">Pesanan salah / ganda</option>
            <option value="Pembersihan / pergantian meja">Pembersihan / pergantian meja</option>
            <option value="lainnya">Alasan lainnya</option>
          </select>
        </div>

        {reason === 'lainnya' && (
          <div className="cg-field">
            <label className="cg-label font-semibold text-xs" htmlFor="custom-reason">
              Tuliskan Alasan
            </label>
            <input
              id="custom-reason"
              type="text"
              className="cg-input"
              placeholder="Contoh: Kesalahan sistem kasir"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              required
            />
          </div>
        )}

        <ApproverFields a={ap} idPrefix="reset" what="reset meja" />

        <p role="alert" className="min-h-[24px] text-danger-strong">
          {error}
        </p>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--danger"
            disabled={busy || !effectiveReason || ap.staffLoading || !ap.credentialReady}
          >
            {busy ? 'Mereset…' : 'Reset & Kosongkan Meja'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Pisah item / tagihan terpisah dari pesanan terbuka di Daftar Order. */
export function SplitOrderDialog({
  order,
  tableName,
  onClose,
  onDone,
}: {
  order: Order;
  tableName: string;
  onClose: () => void;
  onDone: (orig: Order, split: Order) => void;
}) {
  const data = useData();
  const ap = useApprover('move_table');
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setQty = (id: string, v: number, max: number) => {
    setError('');
    setPicks((p) => ({ ...p, [id]: Math.max(0, Math.min(max, v)) }));
  };

  const splitResult = useMemo(
    () => splitByItem(order.items, picks, newId),
    [order.items, picks],
  );

  const anyPicked = Object.values(picks).some((v) => v > 0);
  const splitSubtotal = splitResult.paid.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const remainSubtotal = splitResult.remain.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || splitResult.problem || !anyPicked) return;
    setBusy(true);
    setError('');
    try {
      const by = await ap.authorize();
      if (!by) {
        setBusy(false);
        return setError('PIN otorisasi manajer salah.');
      }

      // 1. Buat pesanan baru untuk item yang dipisah
      const newDraft: OrderDraft = {
        id: newId(),
        type: order.type,
        tableId: order.tableId,
        label: `${order.label ? order.label + ' ' : ''}(Pisah ${order.number})`,
        customerId: order.customerId,
        customerName: order.customerName,
        guestCount: 1,
        items: splitResult.paid.map((i) => ({
          id: i.id,
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          note: i.note,
          extras: i.extras,
        })),
      };
      const splitOrder = await data.saveOrder(newDraft, by);

      // 2. Perbarui pesanan asal dengan sisa item
      const remainDraft: OrderDraft = {
        id: order.id,
        type: order.type,
        tableId: order.tableId,
        label: order.label,
        customerId: order.customerId,
        customerName: order.customerName,
        guestCount: Math.max(1, (order.guestCount ?? 1) - 1),
        items: splitResult.remain.map((i) => ({
          id: i.id,
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          note: i.note,
          extras: i.extras,
        })),
      };
      const updatedOrig = await data.saveOrder(remainDraft, by);

      onDone(updatedOrig, splitOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memisah item pesanan.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Pisah Tagihan ${order.number}`}
      onClose={busy ? undefined : onClose}
      labelledBy="split-order-title"
    >
      <form onSubmit={submit} className="grid gap-16">
        <p className="cg-modal__body">
          Pilih item dari meja <strong>{tableName}</strong> yang ingin dipisahkan menjadi tagihan terpisah baru. Tindakan ini memerlukan otorisasi PIN manajer.
        </p>

        <ul className="grid gap-8 max-h-[260px] overflow-y-auto" aria-label="Item pesanan">
          {order.items.map((i) => {
            const val = picks[i.id] ?? 0;
            return (
              <li
                key={i.id}
                className="flex items-center justify-between p-8 border border-border rounded-lg bg-surface"
              >
                <div className="min-w-0 pr-8">
                  <strong className="text-sm block truncate">{i.name}</strong>
                  <span className="text-xs text-text-muted">
                    Total: {i.qty} · @{formatRp(i.unitPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    className="w-28 h-28 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised disabled:opacity-40"
                    disabled={val <= 0}
                    aria-label={`Kurangi ${i.name}`}
                    onClick={() => setQty(i.id, val - 1, i.qty)}
                  >
                    <Minus className="w-12 h-12" aria-hidden />
                  </button>
                  <span className="w-28 text-center text-sm font-bold tabular-nums">
                    {val}
                  </span>
                  <button
                    type="button"
                    className="w-28 h-28 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised disabled:opacity-40"
                    disabled={val >= i.qty}
                    aria-label={`Tambah ${i.name}`}
                    onClick={() => setQty(i.id, val + 1, i.qty)}
                  >
                    <Plus className="w-12 h-12" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <dl className="grid gap-4 text-xs bg-surface-muted rounded-md p-10">
          <div className="flex justify-between">
            <dt className="text-text-muted">Tagihan Baru Dipisah:</dt>
            <dd className="font-bold cg-num">{formatRp(splitSubtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Sisa Tagihan Asal:</dt>
            <dd className="cg-num">{formatRp(remainSubtotal)}</dd>
          </div>
        </dl>

        {splitResult.problem && (
          <p role="alert" className="text-xs text-danger-strong">
            {splitResult.problem}
          </p>
        )}

        {anyPicked && !splitResult.problem && (
          <ApproverFields a={ap} idPrefix="split" what="pemisahan tagihan" />
        )}

        <p role="alert" className="min-h-[20px] text-danger-strong text-xs">
          {error}
        </p>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary"
            disabled={
              busy ||
              !anyPicked ||
              !!splitResult.problem ||
              ap.staffLoading ||
              !ap.credentialReady
            }
          >
            {busy ? 'Memisahkan…' : 'Pisah Jadi Tagihan Baru'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const TABLE_GROUP_STORAGE_KEY = 'cgpos_pos_table_groups';

export function loadTableGroups(): TableGroup[] {
  try {
    const raw = localStorage.getItem(TABLE_GROUP_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) ?? [];
  } catch {
    return [];
  }
}

export function saveTableGroups(groups: TableGroup[]) {
  try {
    localStorage.setItem(TABLE_GROUP_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Ignore storage quota
  }
}

/** Kelola Grup Meja: gabungkan meja kosong untuk rombongan atau bubarkan grup. */
export function TableGroupDialog({
  tables,
  onClose,
  onDone,
}: {
  tables: TableStatus[];
  onClose: () => void;
  onDone: (groups: TableGroup[]) => void;
}) {
  const [groups, setGroups] = useState<TableGroup[]>(() => loadTableGroups());
  const [name, setName] = useState('');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const names = useMemo(
    () => Object.fromEntries(tables.map((t) => [t.id, t.name])),
    [tables],
  );

  const toggleTable = (id: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateGroup = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const newGrp = createTableGroup(newId(), name, selectedTableIds);
      const next = [...groups, newGrp];
      setGroups(next);
      saveTableGroups(next);
      setName('');
      setSelectedTableIds([]);
      onDone(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat grup meja.');
    }
  };

  const handleDissolveGroup = (groupId: string) => {
    const next = groups.filter((g) => g.id !== groupId);
    setGroups(next);
    saveTableGroups(next);
    onDone(next);
  };

  return (
    <Modal title="Grup Meja Gabungan" onClose={onClose} labelledBy="group-title">
      <div className="grid gap-16">
        <p className="cg-modal__body">
          Gabungkan 2 atau lebih meja kosong untuk tamu rombongan sehingga dapat dilayani bersama.
        </p>

        {groups.length > 0 && (
          <div className="grid gap-8">
            <span className="cg-label font-semibold text-xs">Grup Meja Aktif</span>
            <ul className="grid gap-8">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between p-10 border border-border rounded-lg bg-surface"
                >
                  <div>
                    <strong className="text-sm block">{g.name}</strong>
                    <span className="text-xs text-text-muted">
                      {formatTableGroupLabel(g, names)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                    onClick={() => handleDissolveGroup(g.id)}
                  >
                    Bubarkan
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={handleCreateGroup}
          className="grid gap-12 p-12 border border-border rounded-xl bg-surface-muted"
        >
          <strong className="text-xs uppercase font-semibold text-text-muted tracking-wider">
            + Bentuk Grup Meja Baru
          </strong>

          <div className="cg-field">
            <label className="cg-label font-semibold text-xs" htmlFor="grp-name">
              Nama Grup
            </label>
            <input
              id="grp-name"
              type="text"
              className="cg-input"
              placeholder="Contoh: Rombongan Keluarga / VIP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-6">
            <span className="cg-label font-semibold text-xs">Pilih Meja Gabungan (Min. 2)</span>
            <div className="grid grid-cols-2 tablet:grid-cols-3 gap-6">
              {tables.map((t) => {
                const isSelected = selectedTableIds.includes(t.id);
                const isBusy = !!t.order;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`p-8 border rounded-lg text-left text-xs ${
                      isSelected
                        ? 'bg-accent/15 border-accent font-bold'
                        : isBusy
                        ? 'bg-surface-muted border-border opacity-50'
                        : 'bg-surface border-border hover:border-accent/40'
                    }`}
                    disabled={isBusy}
                    onClick={() => toggleTable(t.id)}
                  >
                    <span className="block truncate">{t.name}</span>
                    <span className="text-[10px] text-text-muted block">
                      {isBusy ? 'Terisi' : isSelected ? 'Dipilih' : 'Kosong'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-danger-strong">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="cg-btn cg-btn--secondary cg-btn--sm mt-4"
            disabled={!name.trim() || selectedTableIds.length < 2}
          >
            Bentuk Grup Meja
          </button>
        </form>

        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}

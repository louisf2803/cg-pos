'use client';

import { useMemo, useState } from 'react';
import {
  formatRp,
  getPriceScheduleStatus,
  partitionPriceSchedules,
  resolveScheduledPrice,
  validatePriceScheduleInput,
  type CatalogProduct,
  type PriceSchedule,
} from '@cgpos/shared';
import { CalendarClock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import {
  formatJakartaDateTime,
  parseJakartaLocalInput,
  toJakartaLocalInput,
} from '@/lib/pricing-preview';

type ScheduleFilter = 'all' | 'upcoming_active' | 'expired';

function ScheduleEditorDialog({
  products,
  initial,
  isBusy,
  onSave,
  onClose,
}: {
  products: CatalogProduct[];
  initial: PriceSchedule | null;
  isBusy?: boolean;
  onSave: (payload: Omit<PriceSchedule, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const activeProducts = useMemo(() => {
    if (initial) return products;
    return products.filter((p) => p.isActive);
  }, [products, initial]);

  const [productId, setProductId] = useState(
    initial?.productId ?? activeProducts[0]?.id ?? '',
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  const [newPrice, setNewPrice] = useState(() => {
    if (initial) return String(initial.newPrice);
    const base = activeProducts[0]?.price ?? 0;
    return String(Math.max(0, Math.round((base * 0.9) / 100) * 100));
  });
  const [startLocal, setStartLocal] = useState(() =>
    initial ? toJakartaLocalInput(initial.startAt) : toJakartaLocalInput(new Date(Date.now() + 3600_000).toISOString()),
  );
  const [endLocal, setEndLocal] = useState(() =>
    initial?.endAt ? toJakartaLocalInput(initial.endAt) : '',
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startAt = parseJakartaLocalInput(startLocal);
    const endAt = endLocal.trim() ? parseJakartaLocalInput(endLocal) : null;
    const priceNum = Number(newPrice);
    const problem = validatePriceScheduleInput({
      productId,
      newPrice: priceNum,
      startAt,
      endAt,
    });
    if (problem) {
      setError(problem);
      return;
    }
    onSave({
      productId,
      newPrice: Math.round(priceNum),
      startAt,
      endAt,
      note: note.trim() || undefined,
    });
  };

  return (
    <dialog {...dialog.props} aria-labelledby="dlg-schedule-title">
      <form onSubmit={handleSubmit} className="grid gap-16">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="dlg-schedule-title" className="text-lg font-bold">
              {initial ? 'Ubah jadwal harga' : 'Buat jadwal perubahan harga'}
            </h2>
            <p className="text-sm text-text-muted mt-4">
              Semua waktu menggunakan zona WIB (Asia/Jakarta). Jika ada jadwal tumpang tindih untuk produk sama, jadwal yang paling baru dibuat akan dipakai.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose} disabled={isBusy}>
            Tutup
          </button>
        </div>

        {error && (
          <p role="alert" className="cg-banner cg-banner--danger">
            {error}
          </p>
        )}

        <div className="cg-field">
          <label htmlFor="sch-product" className="cg-label">
            Produk *
          </label>
          <select
            id="sch-product"
            className="cg-select"
            value={productId}
            disabled={isBusy}
            onChange={(e) => {
              const id = e.target.value;
              setProductId(id);
              if (!initial) {
                const p = products.find((x) => x.id === id);
                if (p) setNewPrice(String(Math.max(0, Math.round((p.price * 0.9) / 100) * 100)));
              }
              if (error) setError('');
            }}
          >
            {activeProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — Harga normal {formatRp(p.price)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label htmlFor="sch-price" className="cg-label">
              Harga terjadwal (Rp) *
            </label>
            <input
              id="sch-price"
              type="number"
              min={0}
              step={100}
              disabled={isBusy}
              className="cg-input"
              value={newPrice}
              onChange={(e) => {
                setNewPrice(e.target.value);
                if (error) setError('');
              }}
            />
            {selectedProduct && (
              <span className="text-xs text-text-muted mt-4">
                Harga normal saat ini: {formatRp(selectedProduct.price)}
              </span>
            )}
          </div>

          <div className="cg-field">
            <label htmlFor="sch-note" className="cg-label">
              Alasan / catatan jadwal
            </label>
            <input
              id="sch-note"
              className="cg-input"
              maxLength={100}
              disabled={isBusy}
              placeholder="Contoh: Promo akhir pekan atau kenaikan bahan"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
          <div className="cg-field">
            <label htmlFor="sch-start" className="cg-label">
              Tanggal & jam mulai berlaku *
            </label>
            <input
              id="sch-start"
              type="datetime-local"
              disabled={isBusy}
              className="cg-input"
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value);
                if (error) setError('');
              }}
            />
          </div>

          <div className="cg-field">
            <label htmlFor="sch-end" className="cg-label">
              Tanggal & jam berakhir (opsional)
            </label>
            <input
              id="sch-end"
              type="datetime-local"
              disabled={isBusy}
              className="cg-input"
              value={endLocal}
              onChange={(e) => {
                setEndLocal(e.target.value);
                if (error) setError('');
              }}
            />
            <span className="text-xs text-text-muted mt-4">
              Bila diisi, harga otomatis kembali ke harga normal setelah waktu berakhir.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose} disabled={isBusy}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={isBusy}>
            {isBusy ? 'Menyimpan...' : 'Simpan jadwal'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function PriceSchedulesPage() {
  const data = useData();
  const catalogRes = useAsync(() => data.listCatalog(), [data]);
  const schedulesRes = useAsync(() => data.listPriceSchedules(), [data]);

  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [editing, setEditing] = useState<PriceSchedule | null | 'new'>(null);
  const [isBusy, setIsBusy] = useState(false);

  const schedules = useMemo(
    () => (schedulesRes.status === 'ready' ? schedulesRes.data : []),
    [schedulesRes],
  );

  const products = useMemo(
    () => (catalogRes.status === 'ready' ? catalogRes.data : []),
    [catalogRes],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const nowIso = new Date().toISOString();
  const buckets = useMemo(() => partitionPriceSchedules(schedules, nowIso), [schedules, nowIso]);

  const activeWinnerByProduct = useMemo(() => {
    const winners = new Map<string, string>();
    for (const prod of products) {
      const res = resolveScheduledPrice(schedules, prod.id, prod.price, nowIso);
      if (res.activeSchedule) {
        winners.set(prod.id, res.activeSchedule.id);
      }
    }
    return winners;
  }, [products, schedules, nowIso]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules
      .filter((s) => {
        const status = getPriceScheduleStatus(s, nowIso);
        if (filter === 'upcoming_active' && status === 'expired') return false;
        if (filter === 'expired' && status !== 'expired') return false;
        if (!q) return true;
        const prod = productMap.get(s.productId);
        return (
          (prod?.name ?? s.productId).toLowerCase().includes(q) ||
          (s.note ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [schedules, filter, search, productMap, nowIso]);

  const handleSave = async (payload: Omit<PriceSchedule, 'id' | 'createdAt'>) => {
    try {
      setIsBusy(true);
      setErrorNotice('');
      if (editing && editing !== 'new') {
        await data.savePriceSchedule({ id: editing.id, ...payload });
        setNotice('Jadwal perubahan harga diperbarui.');
      } else {
        await data.savePriceSchedule(payload);
        setNotice('Jadwal perubahan harga baru ditambahkan.');
      }
      await schedulesRes.reload();
      setEditing(null);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal menyimpan jadwal harga.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (item: PriceSchedule) => {
    try {
      setIsBusy(true);
      setErrorNotice('');
      await data.deletePriceSchedule(item.id);
      await schedulesRes.reload();
      setNotice('Jadwal perubahan harga dihapus.');
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal menghapus jadwal harga.');
    } finally {
      setIsBusy(false);
    }
  };

  const isLoading = catalogRes.status === 'loading' || schedulesRes.status === 'loading';

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Penjadwalan harga"
        subtitle="Jadwalkan harga baru produk pada tanggal dan jam tertentu, dengan opsi kembali ke harga normal saat berakhir."
        helpText="Jadwal aktif terbaru akan menggantikan harga normal pada rentang waktunya. Jadwal yang sudah lewat tetap tersimpan sebagai riwayat."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            disabled={products.length === 0 || isBusy}
            onClick={() => setEditing('new')}
          >
            <Plus className="cg-icon cg-icon--sm" aria-hidden />
            Buat jadwal harga
          </button>
        }
      />

      {notice && (
        <div role="status" className="cg-banner cg-banner--info flex items-center justify-between gap-12">
          <span>{notice}</span>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={() => setNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {errorNotice && (
        <div role="alert" className="cg-banner cg-banner--danger flex items-center justify-between gap-12">
          <span>{errorNotice}</span>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={() => setErrorNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {catalogRes.status === 'error' && (
        <div role="alert" className="cg-banner cg-banner--danger flex flex-wrap items-center justify-between gap-12">
          <span>Gagal memuat katalog produk: {catalogRes.message}</span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={catalogRes.reload}
          >
            Muat ulang
          </button>
        </div>
      )}

      {schedulesRes.status === 'error' && (
        <div role="alert" className="cg-banner cg-banner--danger flex flex-wrap items-center justify-between gap-12">
          <span>Gagal memuat jadwal harga: {schedulesRes.message}</span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={schedulesRes.reload}
          >
            Muat ulang
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Sedang Berlaku</div>
          <div className="text-2xl font-bold mt-4 text-accent-strong">
            {schedulesRes.status === 'ready' ? buckets.active.length : '—'}
          </div>
        </div>
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Akan Datang</div>
          <div className="text-2xl font-bold mt-4">{schedulesRes.status === 'ready' ? buckets.upcoming.length : '—'}</div>
        </div>
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Sudah Lewat</div>
          <div className="text-2xl font-bold mt-4 text-text-muted">
            {schedulesRes.status === 'ready' ? buckets.expired.length : '—'}
          </div>
        </div>
      </div>

      <div className="cg-card grid gap-16 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <div className="flex flex-wrap items-center gap-8">
            {(
              [
                ['all', `Semua (${schedules.length})`],
                ['upcoming_active', `Aktif & Akan Datang (${buckets.active.length + buckets.upcoming.length})`],
                ['expired', `Sudah Lewat (${buckets.expired.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  filter === key ? 'cg-btn cg-btn--primary cg-btn--sm' : 'cg-btn cg-btn--secondary cg-btn--sm'
                }
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search
              className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              className="cg-input pl-40"
              placeholder="Cari produk atau catatan jadwal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-8" aria-busy="true" aria-label="Memuat jadwal harga">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[52px]" />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="cg-empty">
            <CalendarClock className="cg-icon cg-icon--lg mx-auto text-text-muted mb-8" aria-hidden />
            <p className="font-semibold">
              {schedules.length === 0 ? 'Belum ada jadwal perubahan harga' : 'Tidak ada jadwal pada filter ini'}
            </p>
            <p className="text-sm text-text-muted mt-4">
              {schedules.length === 0
                ? 'Buat jadwal untuk mengubah harga produk otomatis pada tanggal dan jam tertentu.'
                : 'Coba pilih filter atau kata kunci lain.'}
            </p>
            {schedules.length === 0 && products.length > 0 && (
              <button
                type="button"
                className="cg-btn cg-btn--primary mt-12"
                onClick={() => setEditing('new')}
              >
                <Plus className="cg-icon cg-icon--sm" aria-hidden />
                Buat jadwal pertama
              </button>
            )}
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Harga baru</th>
                  <th>Mulai berlaku</th>
                  <th>Berakhir</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => {
                  const prod = productMap.get(item.productId);
                  const status = getPriceScheduleStatus(item, nowIso);
                  const isWinningOverlap =
                    status === 'active' && activeWinnerByProduct.get(item.productId) === item.id;
                  const diff = prod ? item.newPrice - prod.price : 0;

                  return (
                    <tr key={item.id}>
                      <td className="max-w-[240px]">
                        <div className="font-semibold break-words">
                          {prod?.name ?? 'Produk tidak ditemukan'}
                        </div>
                        <div className="text-xs text-text-muted truncate">
                          {item.note || (prod ? `Normal: ${formatRp(prod.price)}` : '—')}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-semibold">{formatRp(item.newPrice)}</div>
                        {prod && diff !== 0 && (
                          <div className={`text-xs ${diff < 0 ? 'text-success-strong' : 'text-danger'}`}>
                            {diff < 0 ? formatRp(diff) : `+${formatRp(diff)}`} vs normal
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-sm">
                        {formatJakartaDateTime(item.startAt)}
                      </td>
                      <td className="whitespace-nowrap text-sm text-text-muted">
                        {item.endAt ? formatJakartaDateTime(item.endAt) : 'Tanpa batas'}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-4">
                          {status === 'active' ? (
                            <span className="cg-badge cg-badge--success">Berlaku</span>
                          ) : status === 'upcoming' ? (
                            <span className="cg-badge cg-badge--info">Akan datang</span>
                          ) : (
                            <span className="cg-badge">Sudah lewat</span>
                          )}
                          {isWinningOverlap && (
                            <span className="cg-badge cg-badge--accent">Prioritas aktif</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-8">
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            disabled={isBusy}
                            aria-label={`Ubah jadwal ${prod?.name ?? item.productId}`}
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                            Ubah
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                            disabled={isBusy}
                            aria-label={`Hapus jadwal ${prod?.name ?? item.productId}`}
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && products.length > 0 && (
        <ScheduleEditorDialog
          products={products}
          initial={editing === 'new' ? null : editing}
          isBusy={isBusy}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

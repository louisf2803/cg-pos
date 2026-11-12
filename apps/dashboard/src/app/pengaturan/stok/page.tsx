'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Bell, Check, Search, ShieldAlert, X } from 'lucide-react';
import {
  outletOptionsProblem,
  parseStockMinInput,
  stockFilterMatches,
  stockSearchMatches,
  STOCK_STATUS_LABEL,
  summarizeStockAlerts,
  type OutletOptions,
  type StockFilter,
  type StockItem,
  type StockStatus,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

const KIND_LABEL: Record<StockItem['kind'], string> = {
  goods: 'Barang',
  ingredient: 'Bahan baku',
};

const STATUS_BADGE: Record<StockStatus, string> = {
  ok: 'cg-badge--success',
  low: 'cg-badge--warning',
  out: 'cg-badge--danger',
  negative: 'cg-badge--danger',
};

export default function PengaturanStokPage() {
  const data = useData();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | StockItem['kind']>('');
  const [status, setStatus] = useState<'' | StockFilter>('');
  const [category, setCategory] = useState('');
  const [notice, setNotice] = useState('');

  const state = useAsync(async () => {
    const [settings, items] = await Promise.all([data.getOutletSettings(), data.listStock()]);
    return { info: settings.info, options: settings.options, items };
  }, [data]);

  const items = state.status === 'ready' ? state.data.items : [];
  const summary = useMemo(() => summarizeStockAlerts(items), [items]);
  const categories = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.categoryName).filter((n): n is string => Boolean(n)))).sort((a, b) =>
        a.localeCompare(b, 'id'),
      ),
    [items],
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!kind || i.kind === kind) &&
          (!category || i.categoryName === category) &&
          stockFilterMatches(i, status || undefined) &&
          stockSearchMatches(i, search),
      ),
    [items, kind, category, status, search],
  );

  return (
    <div className="min-w-0">
      <PageHeader
        title="Notifikasi dan batas stok"
        subtitle="Pantau item menipis, habis, atau minus, atur batas minimum, dan tentukan aturan penjualan saat stok habis."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/inventori/stok" className="cg-btn cg-btn--secondary">
              <span>Daftar stok &amp; kartu</span>
              <ArrowRight className="cg-icon cg-icon--sm" aria-hidden />
            </Link>
          </div>
        }
      />

      {notice && (
        <div
          className="cg-banner bg-accent-soft text-accent-strong border border-accent/25 items-center justify-between mb-16"
          role="status"
        >
          <span className="font-medium break-words">{notice}</span>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={() => setNotice('')}>
            Tutup
          </button>
        </div>
      )}

      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat pengaturan stok">
          <div className="cg-skeleton" style={{ height: 112 }} />
          <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 84 }} />
            ))}
          </div>
          <div className="cg-skeleton" style={{ height: 220 }} />
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          <NegativeStockPolicyCard
            initial={state.data.options}
            onSaved={(msg) => {
              setNotice(msg);
              state.reload();
            }}
          />

          <dl className="grid grid-cols-2 laptop:grid-cols-4 gap-12 min-w-0 m-0" aria-label="Ringkasan peringatan stok">
            <div className="cg-card p-12 min-w-0">
              <dt className="text-xs text-text-muted flex items-center gap-4 m-0">
                <Bell className="cg-icon cg-icon--xs text-accent shrink-0" aria-hidden />
                <span>Perlu perhatian</span>
              </dt>
              <dd className="m-0 mt-4 flex items-baseline justify-between gap-8">
                <button
                  type="button"
                  className="cg-num text-lg font-bold underline cursor-pointer text-left"
                  onClick={() => setStatus((cur) => (cur === 'alert' ? '' : 'alert'))}
                  aria-pressed={status === 'alert'}
                  data-testid="stok-ringkasan-perhatian"
                >
                  {summary.attentionCount}
                </button>
                <Link href="/inventori/stok?status=alert" className="text-xs text-accent-strong underline whitespace-nowrap">
                  Buka stok
                </Link>
              </dd>
              <span className="text-xs text-text-muted block mt-4">Habis, minus, atau di bawah batas</span>
            </div>

            <div className="cg-card p-12 min-w-0">
              <dt className="text-xs text-text-muted m-0">Stok habis (= 0)</dt>
              <dd className="m-0 mt-4">
                <button
                  type="button"
                  className="cg-num text-lg font-bold underline cursor-pointer text-danger"
                  onClick={() => setStatus((cur) => (cur === 'out' ? '' : 'out'))}
                  aria-pressed={status === 'out'}
                >
                  {summary.outCount}
                </button>
              </dd>
              <span className="text-xs text-text-muted block mt-4">Item siap diisi ulang</span>
            </div>

            <div className="cg-card p-12 min-w-0">
              <dt className="text-xs text-text-muted flex items-center gap-4 m-0">
                <ShieldAlert className="cg-icon cg-icon--xs text-danger shrink-0" aria-hidden />
                <span>Stok minus (&lt; 0)</span>
              </dt>
              <dd className="m-0 mt-4">
                <button
                  type="button"
                  className="cg-num text-lg font-bold underline cursor-pointer text-danger"
                  onClick={() => setStatus((cur) => (cur === 'negative' ? '' : 'negative'))}
                  aria-pressed={status === 'negative'}
                >
                  {summary.negativeCount}
                </button>
              </dd>
              <span className="text-xs text-text-muted block mt-4">Butuh opname / penyesuaian</span>
            </div>

            <div className="cg-card p-12 min-w-0">
              <dt className="text-xs text-text-muted flex items-center gap-4 m-0">
                <AlertTriangle className="cg-icon cg-icon--xs shrink-0" aria-hidden />
                <span>Menipis (&le; batas)</span>
              </dt>
              <dd className="m-0 mt-4">
                <button
                  type="button"
                  className="cg-num text-lg font-bold underline cursor-pointer"
                  onClick={() => setStatus((cur) => (cur === 'low' ? '' : 'low'))}
                  aria-pressed={status === 'low'}
                  data-testid="stok-ringkasan-menipis"
                >
                  {summary.lowCount}
                </button>
              </dd>
              <span className="text-xs text-text-muted block mt-4">{summary.configuredMinCount} item berbatas aktif</span>
            </div>
          </dl>

          <section className="cg-card p-16 grid gap-12 min-w-0" aria-labelledby="judul-batas-min">
            <div className="flex flex-wrap items-start justify-between gap-8">
              <div className="min-w-0">
                <h2 id="judul-batas-min" className="text-base font-semibold m-0">
                  Batas minimum per barang dan bahan baku
                </h2>
                <p className="text-xs text-text-muted m-0 mt-4">
                  Bila sisa stok sama atau lebih rendah dari batas minimum, item ditandai <strong>Menipis</strong> di daftar stok dan beranda. Kosongkan atau klik <strong>Matikan</strong> untuk menonaktifkan batas.
                </p>
              </div>
              {status && (
                <button
                  type="button"
                  className="cg-btn cg-btn--ghost cg-btn--sm"
                  onClick={() => setStatus('')}
                >
                  Tampilkan semua status
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-8 items-end min-w-0">
              <label className="cg-search flex-1 min-w-[200px] m-0">
                <Search className="cg-icon cg-icon--sm" aria-hidden />
                <span className="cg-sr">Cari nama barang atau bahan baku</span>
                <input
                  id="pengaturan-stok-cari"
                  type="search"
                  className="cg-input"
                  placeholder="Cari nama barang atau bahan baku…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>

              <div className="cg-field">
                <label className="cg-label" htmlFor="pengaturan-stok-jenis">Jenis</label>
                <select
                  id="pengaturan-stok-jenis"
                  className="cg-input"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as '' | StockItem['kind'])}
                >
                  <option value="">Semua jenis</option>
                  <option value="ingredient">Bahan baku</option>
                  <option value="goods">Barang</option>
                </select>
              </div>

              {categories.length > 0 && (
                <div className="cg-field">
                  <label className="cg-label" htmlFor="pengaturan-stok-kategori">Kategori</label>
                  <select
                    id="pengaturan-stok-kategori"
                    className="cg-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Semua kategori</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="cg-field">
                <label className="cg-label" htmlFor="pengaturan-stok-status">Status</label>
                <select
                  id="pengaturan-stok-status"
                  className="cg-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | StockFilter)}
                >
                  <option value="">Semua status</option>
                  <option value="alert">Perlu perhatian</option>
                  <option value="out">Habis</option>
                  <option value="negative">Minus</option>
                  <option value="low">Menipis</option>
                  <option value="ok">Aman</option>
                </select>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="cg-empty">
                <p><strong>Belum ada barang atau bahan baku yang stoknya dilacak.</strong></p>
                <p className="text-text-muted">Aktifkan pelacakan stok pada produk atau tambahkan bahan baku lewat menu resep.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="cg-empty">
                <p><strong>Tidak ada item yang cocok dengan filter ini.</strong></p>
                <button
                  type="button"
                  className="cg-btn cg-btn--secondary mt-8"
                  onClick={() => {
                    setSearch('');
                    setKind('');
                    setCategory('');
                    setStatus('');
                  }}
                >
                  Atur ulang filter
                </button>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Batas minimum stok item">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Jenis</th>
                      <th className="text-right">Stok kini</th>
                      <th>Status</th>
                      <th>Batas minimum</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <StockMinRow
                        key={item.productId}
                        item={item}
                        onUpdated={(msg) => {
                          setNotice(msg);
                          state.reload();
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function NegativeStockPolicyCard({
  initial,
  onSaved,
}: {
  initial: OutletOptions;
  onSaved: (message: string) => void;
}) {
  const data = useData();
  const [allowNegative, setAllowNegative] = useState(initial.allowNegativeStock);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAllowNegative(initial.allowNegativeStock);
  }, [initial.allowNegativeStock]);

  const dirty = allowNegative !== initial.allowNegativeStock;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const next: OutletOptions = { ...initial, allowNegativeStock: allowNegative };
    const problem = outletOptionsProblem(next);
    if (problem) {
      setErr(problem);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await data.saveOutletOptions(next);
      onSaved(
        allowNegative
          ? 'Kebijakan disimpan: outlet mengizinkan penjualan dan mutasi walau stok habis.'
          : 'Kebijakan disimpan: penjualan di kasir dan mutasi keluar ditolak bila stok tidak mencukupi.',
      );
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan kebijakan stok.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="cg-card p-16 grid gap-12 min-w-0" noValidate>
      <div className="min-w-0">
        <h2 className="text-base font-semibold m-0">Kebijakan stok habis &amp; stok minus</h2>
        <p className="text-xs text-text-muted m-0 mt-4">
          Mengatur apakah kasir dan mutasi keluar tetap bisa memproses barang ketika stok mencapai 0 atau di bawah 0.
        </p>
      </div>

      <label className="flex items-start gap-8 cursor-pointer min-w-0">
        <input
          id="kebijakan-stok-minus"
          type="checkbox"
          className="mt-4 shrink-0"
          checked={allowNegative}
          onChange={(e) => {
            setAllowNegative(e.target.checked);
            setErr('');
          }}
        />
        <span className="text-sm min-w-0">
          <strong>Boleh menjual dan mencatat keluar walau stok habis (stok boleh minus)</strong>
          <span className="block text-xs text-text-muted mt-4">
            Bila dimatikan, kasir dan dialog mutasi stok di dashboard akan menolak pengurangan barang yang membuat saldo menjadi minus.
          </span>
        </span>
      </label>

      {err && (
        <p role="alert" className="cg-banner cg-banner--danger m-0">
          <span>{err}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-8">
        <span className="text-xs text-text-muted">
          Status saat ini:{' '}
          <strong className="text-text">{allowNegative ? 'Stok boleh minus (bawaan)' : 'Tolak stok minus'}</strong>
        </span>
        <button type="submit" className="cg-btn cg-btn--primary" disabled={saving || !dirty}>
          {saving ? 'Menyimpan…' : 'Simpan kebijakan'}
        </button>
      </div>
    </form>
  );
}

function StockMinRow({
  item,
  onUpdated,
}: {
  item: StockItem;
  onUpdated: (message: string) => void;
}) {
  const data = useData();
  const initialDraft = item.minQty !== undefined ? String(item.minQty) : '';
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setDraft(item.minQty !== undefined ? String(item.minQty) : '');
    setErr('');
  }, [item.minQty]);

  const parsed = parseStockMinInput(draft);
  const changed = draft.trim() !== initialDraft.trim();

  async function save(nextVal: number | null) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await data.setStockMin(item.productId, nextVal);
      onUpdated(
        nextVal === null || nextVal === 0
          ? `Peringatan batas minimum untuk ${item.name} dimatikan.`
          : `Batas minimum ${item.name} disimpan: ${fmtQty(nextVal)} ${item.unit}.`,
      );
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan batas minimum.');
    } finally {
      setBusy(false);
    }
  }

  function handleRowSubmit(e: FormEvent) {
    e.preventDefault();
    if ('error' in parsed) {
      setErr(parsed.error);
      return;
    }
    void save(parsed.value);
  }

  return (
    <tr>
      <td className="break-words max-w-[260px]">
        <strong>{item.name}</strong>
        {item.categoryName && <span className="block text-xs text-text-muted">{item.categoryName}</span>}
      </td>
      <td className="text-sm whitespace-nowrap">{KIND_LABEL[item.kind]}</td>
      <td className="cg-num whitespace-nowrap">
        {fmtQty(item.qty)} <span className="text-text-muted text-xs">{item.unit}</span>
      </td>
      <td className="whitespace-nowrap">
        <span className={`cg-badge ${STATUS_BADGE[item.status]}`}>{STOCK_STATUS_LABEL[item.status]}</span>
      </td>
      <td>
        <form onSubmit={handleRowSubmit} className="flex items-center gap-8 min-w-[160px]" noValidate>
          <input
            id={`min-${item.productId}`}
            type="text"
            inputMode="decimal"
            aria-label={`Batas minimum ${item.name} (${item.unit})`}
            className="cg-input w-[96px]"
            placeholder="Nonaktif"
            maxLength={16}
            value={draft}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value.replace(/[^\d.,]/g, ''));
              setErr('');
            }}
          />
          <span className="text-xs text-text-muted whitespace-nowrap">{item.unit}</span>
          <button
            type="submit"
            className="cg-btn cg-btn--secondary cg-btn--sm shrink-0"
            disabled={busy || !changed}
            aria-label={`Simpan batas minimum ${item.name}`}
          >
            <Check className="cg-icon cg-icon--xs" aria-hidden />
            <span>Simpan</span>
          </button>
        </form>
        {err && (
          <p role="alert" className="text-xs text-danger-strong m-0 mt-4">
            {err}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap">
        {item.minQty !== undefined && item.minQty > 0 ? (
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
            disabled={busy}
            onClick={() => void save(null)}
            aria-label={`Matikan batas minimum ${item.name}`}
          >
            <X className="cg-icon cg-icon--xs" aria-hidden />
            <span>Matikan</span>
          </button>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
    </tr>
  );
}


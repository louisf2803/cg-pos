'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, PackageMinus, Plus, RefreshCw, Search } from 'lucide-react';
import {
  WASTE_ITEM_KIND_LABEL,
  buildStockKindMap,
  filterWasteMoves,
  formatRp,
  getActiveColumns,
  hasVisibleColumns,
  summarizeWasteMoves,
  toCsv,
  type ColumnDef,
  type StockMoveEntry,
  type WasteItemKindFilter,
} from '@cgpos/shared';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type WasteColKey =
  | 'occurredAt'
  | 'productName'
  | 'itemKind'
  | 'qty'
  | 'unit'
  | 'totalCost'
  | 'reason';

const WASTE_COLUMNS: ColumnDef<WasteColKey>[] = [
  { key: 'occurredAt', label: 'Waktu', defaultVisible: true },
  { key: 'productName', label: 'Barang', defaultVisible: true },
  { key: 'itemKind', label: 'Jenis', defaultVisible: true },
  { key: 'qty', label: 'Qty terbuang', defaultVisible: true },
  { key: 'unit', label: 'Satuan', defaultVisible: true },
  { key: 'totalCost', label: 'Nilai terbuang', defaultVisible: true },
  { key: 'reason', label: 'Alasan', defaultVisible: true },
];

const fmtQty = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

function fmtDateTime(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(d);
}

function renderCell(
  row: StockMoveEntry,
  key: WasteColKey,
  tz: string,
  kindByProductId: Record<string, 'goods' | 'ingredient'>,
) {
  const kind = kindByProductId[row.productId];
  switch (key) {
    case 'occurredAt':
      return (
        <td key={key} className="whitespace-nowrap text-xs text-text-muted">
          {fmtDateTime(row.occurredAt, tz)}
        </td>
      );
    case 'productName':
      return (
        <td key={key} className="font-semibold text-text">
          {row.productName}
        </td>
      );
    case 'itemKind':
      return (
        <td key={key} className="whitespace-nowrap">
          {kind ? (
            <span className="cg-badge cg-badge--info">{WASTE_ITEM_KIND_LABEL[kind]}</span>
          ) : (
            <span className="text-text-muted text-xs">—</span>
          )}
        </td>
      );
    case 'qty':
      return (
        <td key={key} className="cg-num whitespace-nowrap text-danger font-medium">
          {fmtQty(Math.abs(row.qtyDelta))}
        </td>
      );
    case 'unit':
      return (
        <td key={key} className="whitespace-nowrap text-xs text-text-muted">
          {row.unit || '—'}
        </td>
      );
    case 'totalCost':
      return (
        <td key={key} className="cg-num whitespace-nowrap font-semibold text-danger">
          {formatRp(Math.abs(row.totalCost))}
        </td>
      );
    case 'reason':
      return (
        <td key={key} className="text-sm text-text break-words max-w-[260px]">
          {row.reason?.trim() ? row.reason : <span className="text-text-muted">—</span>}
        </td>
      );
  }
}

export default function StokTerbuangPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<WasteItemKindFilter>('all');

  const colPrefs = useColumnPrefs('inventori_terbuang', WASTE_COLUMNS);

  const state = useAsync(async () => {
    if (ctx.status !== 'ready') return null;
    const [moves, stockItems] = await Promise.all([
      data.listStockMovesBetween({ from: range.from, to: range.to }, ['waste']),
      data.listStock(),
    ]);
    return { moves, stockItems };
  }, [data, ctx.status, range.from, range.to]);

  const payload = state.status === 'ready' ? state.data : null;

  const kindByProductId = useMemo(
    () => buildStockKindMap(payload?.stockItems ?? []),
    [payload?.stockItems],
  );
  const hasKindMetadata = useMemo(
    () => Object.keys(kindByProductId).length > 0,
    [kindByProductId],
  );

  const filteredMoves = useMemo(() => {
    if (!payload) return [];
    return filterWasteMoves(payload.moves, kindByProductId, {
      search,
      itemKind: kindFilter,
    });
  }, [payload, kindByProductId, search, kindFilter]);

  const { summary, byProduct } = useMemo(
    () => summarizeWasteMoves(filteredMoves, kindByProductId),
    [filteredMoves, kindByProductId],
  );

  const activeCols = useMemo(
    () => getActiveColumns(WASTE_COLUMNS, colPrefs.prefs),
    [colPrefs.prefs],
  );
  const hasCols = hasVisibleColumns(colPrefs.prefs);

  function handleDownloadCsv() {
    if (filteredMoves.length === 0 || !hasCols) return;
    const headers = activeCols.map((c) => c.label);
    const body = filteredMoves.map((row) =>
      activeCols.map((c) => {
        switch (c.key) {
          case 'occurredAt':
            return fmtDateTime(row.occurredAt, tz);
          case 'productName':
            return row.productName;
          case 'itemKind': {
            const k = kindByProductId[row.productId];
            return k ? WASTE_ITEM_KIND_LABEL[k] : '';
          }
          case 'qty':
            return Math.abs(row.qtyDelta);
          case 'unit':
            return row.unit;
          case 'totalCost':
            return Math.abs(row.totalCost);
          case 'reason':
            return row.reason ?? '';
        }
      }),
    );
    const csv = toCsv([headers, ...body]);
    downloadCsvWithHistory({
      fileName: `stok-terbuang-${today}.csv`,
      csvContent: csv,
      reportName: 'Stok terbuang',
      period: value.from === value.to ? value.from : `${value.from} – ${value.to}`,
      rowCount: filteredMoves.length,
      sourceUrl: '/inventori/terbuang',
    });
  }

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Laporan stok terbuang"
        subtitle="Pantau barang jual maupun bahan baku yang rusak, basi, atau terbuang beserta nilai kerugian dan alasannya."
        actions={
          <div className="flex flex-wrap gap-8">
            <Link href="/inventori/stok" className="cg-btn cg-btn--secondary cg-btn--sm">
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              Catat stok terbuang
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={() => state.reload()}
              aria-label="Muat ulang laporan"
            >
              <RefreshCw className="cg-icon cg-icon--sm" aria-hidden />
              Muat ulang
            </button>
            <ColumnChooser
              columns={WASTE_COLUMNS}
              prefs={colPrefs.prefs}
              onToggle={colPrefs.toggle}
              onMoveUp={colPrefs.moveUp}
              onMoveDown={colPrefs.moveDown}
              onReset={colPrefs.reset}
            />
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={filteredMoves.length === 0 || !hasCols}
              onClick={handleDownloadCsv}
              data-testid="waste-export-csv"
            >
              <Download className="cg-icon cg-icon--sm" aria-hidden />
              Unduh CSV
            </button>
          </div>
        }
      />

      {/* Filter rentang tanggal, cari, dan jenis barang */}
      <section className="cg-card p-16 grid gap-12 min-w-0">
        <RangePicker value={value} today={today} onChange={setValue} />
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12 min-w-0">
          <div className="cg-field min-w-0">
            <label className="cg-label" htmlFor="waste-search">
              Cari barang atau alasan
            </label>
            <div className="cg-search w-full">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <input
                id="waste-search"
                type="search"
                className="cg-input"
                placeholder="Nama barang atau alasan terbuang..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {hasKindMetadata && (
            <div className="cg-field min-w-0">
              <label className="cg-label" htmlFor="waste-kind-filter">
                Jenis barang
              </label>
              <select
                id="waste-kind-filter"
                className="cg-input"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as WasteItemKindFilter)}
              >
                <option value="all">Semua jenis</option>
                <option value="ingredient">Bahan baku</option>
                <option value="goods">Barang jual</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {(ctx.status === 'loading' || (ctx.status === 'ready' && state.status === 'loading')) && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan stok terbuang">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="cg-skeleton h-[84px]" />
            <div className="cg-skeleton h-[84px]" />
            <div className="cg-skeleton h-[84px]" />
          </div>
          <div className="cg-skeleton h-[260px]" />
        </div>
      )}

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {ctx.status === 'ready' && state.status === 'error' && (
        <ErrorBox message={state.message} onRetry={state.reload} />
      )}

      {payload && (
        <>
          {/* Tiga ringkasan utama */}
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 min-w-0">
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Jumlah kejadian</div>
              <div
                className="text-2xl font-bold cg-num text-text mt-4"
                data-testid="kpi-waste-count"
              >
                {summary.incidentCount}
              </div>
            </div>
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Total nilai terbuang</div>
              <div
                className="text-2xl font-bold cg-num text-danger mt-4"
                data-testid="kpi-waste-value"
              >
                {formatRp(summary.totalValue)}
              </div>
            </div>
            <div className="cg-card p-16 min-w-0">
              <div className="text-xs text-text-muted">Barang paling sering terbuang</div>
              {summary.topProduct ? (
                <div className="mt-4 min-w-0" data-testid="kpi-waste-top">
                  <div className="text-base font-bold text-text break-words">
                    {summary.topProduct.productName}
                  </div>
                  <div className="text-xs text-text-muted cg-num mt-4">
                    {summary.topProduct.incidentCount} kejadian · {fmtQty(summary.topProduct.totalQty)}{' '}
                    {summary.topProduct.unit} ({formatRp(summary.topProduct.totalValue)})
                  </div>
                </div>
              ) : (
                <div className="text-xl font-bold text-text-muted mt-4" data-testid="kpi-waste-top">
                  —
                </div>
              )}
            </div>
          </div>

          {filteredMoves.length === 0 ? (
            <div className="cg-empty" data-testid="waste-empty-state">
              <PackageMinus className="cg-icon cg-icon--lg mx-auto mb-8 text-text-muted" aria-hidden />
              <p>
                <strong>Tidak ada catatan stok terbuang pada periode ini</strong>
              </p>
              <p className="text-sm text-text-muted mt-4 mb-12">
                {search.trim() || kindFilter !== 'all'
                  ? 'Coba bersihkan kata kunci pencarian atau pilih filter Semua jenis.'
                  : 'Anda dapat mencatat barang rusak, basi, atau tumpah lewat menu Daftar bahan baku.'}
              </p>
              <div className="flex flex-wrap justify-center gap-8">
                {(search.trim() || kindFilter !== 'all') && (
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => {
                      setSearch('');
                      setKindFilter('all');
                    }}
                  >
                    Tampilkan semua
                  </button>
                )}
                <Link href="/inventori/stok" className="cg-btn cg-btn--primary cg-btn--sm">
                  Buka Daftar bahan baku
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Rekap Per Barang (urut nilai terbesar) */}
              <section className="cg-card p-16 grid gap-12 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-8">
                  <h2 className="text-base font-bold text-text">
                    Rekap per barang ({byProduct.length})
                  </h2>
                  <span className="text-xs text-text-muted">Urut nilai terbuang terbesar</span>
                </div>
                <div className="cg-data-wrap min-w-0">
                  <table className="cg-data w-full" aria-label="Rekap stok terbuang per barang">
                    <thead>
                      <tr>
                        <th>Barang</th>
                        <th>Jenis</th>
                        <th className="cg-num whitespace-nowrap">Jumlah kejadian</th>
                        <th className="cg-num whitespace-nowrap">Total qty</th>
                        <th className="cg-num whitespace-nowrap">Total nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProduct.map((row) => (
                        <tr key={row.productId} data-testid={`waste-product-${row.productId}`}>
                          <td className="font-semibold text-text">{row.productName}</td>
                          <td className="whitespace-nowrap">
                            {row.itemKind ? (
                              <span className="cg-badge cg-badge--info">
                                {WASTE_ITEM_KIND_LABEL[row.itemKind]}
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                          <td className="cg-num whitespace-nowrap">{row.incidentCount}</td>
                          <td className="cg-num whitespace-nowrap">
                            {fmtQty(row.totalQty)} {row.unit}
                          </td>
                          <td className="cg-num whitespace-nowrap font-semibold text-danger">
                            {formatRp(row.totalValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Tabel Rincian Kejadian */}
              <section className="cg-card p-16 grid gap-12 min-w-0">
                <h2 className="text-base font-bold text-text">
                  Rincian kejadian ({filteredMoves.length})
                </h2>
                {!hasCols ? (
                  <p className="text-sm text-text-muted">
                    Seluruh kolom sedang disembunyikan. Aktifkan kembali dari menu Atur kolom.
                  </p>
                ) : (
                  <div className="cg-data-wrap min-w-0">
                    <table className="cg-data w-full" aria-label="Rincian kejadian stok terbuang">
                      <thead>
                        <tr>
                          {activeCols.map((c) => (
                            <th
                              key={c.key}
                              className={
                                c.key === 'qty' || c.key === 'totalCost'
                                  ? 'cg-num whitespace-nowrap'
                                  : 'whitespace-nowrap'
                              }
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMoves.map((row) => (
                          <tr key={row.id} data-testid={`waste-row-${row.id}`}>
                            {activeCols.map((c) => renderCell(row, c.key, tz, kindByProductId))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}


'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Printer,
  Plus,
  Edit2,
  Trash2,
  Package,
  Layers,
  Copy,
  Sliders,
  Type,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  stationProblem,
  defaultTemplate,
  normalizeTemplate,
  checkerPieces,
  labelPieceSets,
  sampleTicket,
  paperCols,
  printModeLabel,
  stationKindLabel,
  PRINT_MODE_OPTIONS,
  STATION_KIND_OPTIONS,
  PRINT_THEMES,
  type PrintStation,
  type PrintStationInput,
  type StationKind,
  type PrintMode,
  type StationTemplate,
  type PaperWidth,
  type PrintTheme,
  type CatalogProduct,
} from '@cgpos/shared';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

export default function PrintStationsPage() {
  const data = useData();
  const [dialogStation, setDialogStation] = useState<{ mode: 'new' | 'edit'; station?: PrintStation } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PrintStation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const stationsState = useAsync(() => data.listPrintStations(), [data]);
  const productsState = useAsync(() => data.listProducts(), [data]);

  const stations = stationsState.status === 'ready' ? stationsState.data : [];
  const products = productsState.status === 'ready' ? productsState.data : [];

  // Map of station ID to mapped products count
  const productCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.printStationId) {
        map.set(p.printStationId, (map.get(p.printStationId) || 0) + 1);
      }
    }
    return map;
  }, [products]);

  const handleSeedDefaults = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await data.savePrintStation({
        name: 'Dapur',
        kind: 'checker',
        printMode: 'auto',
        copies: 1,
        paper: '58',
        template: defaultTemplate('checker'),
        isActive: true,
      });
      await data.savePrintStation({
        name: 'Bar',
        kind: 'checker',
        printMode: 'auto',
        copies: 1,
        paper: '58',
        template: defaultTemplate('checker'),
        isActive: true,
      });
      stationsState.reload();
      productsState.reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal membuat stasiun bawaan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (station: PrintStation) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await data.removePrintStation(station.id);
      setDeleteConfirm(null);
      setDialogStation(null);
      stationsState.reload();
      productsState.reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus stasiun');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSave = async (input: PrintStationInput) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await data.savePrintStation(input);
      setDialogStation(null);
      stationsState.reload();
      productsState.reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan stasiun');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const isLoading = stationsState.status === 'loading' || productsState.status === 'loading';
  const hasError = stationsState.status === 'error';

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Stasiun Cetak"
        subtitle="Kelola stasiun cetak pesanan untuk dapur, bar, dan label cup/kemasan"
        helpText="Pengaturan stasiun cetak untuk pesanan yang diteruskan otomatis dari kasir ke dapur, bar, atau printer label."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link
              href="/pengaturan/stasiun-cetak/penetapan"
              className="cg-btn cg-btn--secondary flex items-center gap-8 text-xs font-semibold"
            >
              <Package className="w-16 h-16" aria-hidden />
              <span>Penetapan Produk</span>
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary flex items-center gap-8 text-xs font-semibold"
              onClick={() => setDialogStation({ mode: 'new' })}
            >
              <Plus className="w-16 h-16" aria-hidden />
              <span>Tambah stasiun</span>
            </button>
          </div>
        }
      />

      {/* Global Action Error Banner */}
      {actionError && (
        <div className="cg-banner cg-banner--danger flex items-center justify-between gap-12" role="alert">
          <div className="flex items-center gap-8">
            <AlertCircle className="w-16 h-16 text-danger shrink-0" aria-hidden />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            className="text-xs underline hover:text-text shrink-0"
            onClick={() => setActionError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Server Error State */}
      {hasError && (
        <ErrorBox
          message={stationsState.message || 'Gagal memuat stasiun cetak dari server'}
          onRetry={() => {
            stationsState.reload();
            productsState.reload();
          }}
        />
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-16" aria-busy="true" aria-label="Memuat stasiun cetak">
          {[1, 2, 3].map((i) => (
            <div key={i} className="cg-skeleton h-[200px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !hasError && stations.length === 0 && (
        <div className="cg-empty py-48 text-center border border-border rounded-xl bg-surface p-24">
          <Printer className="w-48 h-48 mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="text-base font-bold text-text mb-4">Belum Ada Stasiun Cetak</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-20 leading-normal">
            Belum ada stasiun cetak untuk meneruskan pesanan otomatis ke dapur atau bar.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12">
            <button
              type="button"
              className="cg-btn cg-btn--primary flex items-center gap-8"
              disabled={actionLoading}
              onClick={handleSeedDefaults}
            >
              <Layers className="w-16 h-16" aria-hidden />
              <span>Buat Dapur dan Bar</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--secondary flex items-center gap-8"
              onClick={() => setDialogStation({ mode: 'new' })}
            >
              <Plus className="w-16 h-16" aria-hidden />
              <span>Buat stasiun sendiri</span>
            </button>
          </div>
        </div>
      )}

      {/* Stations List Cards */}
      {!isLoading && !hasError && stations.length > 0 && (
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-16 min-w-0">
          {stations.map((s: PrintStation) => {
            const count = productCountMap.get(s.id) || 0;
            return (
              <div
                key={s.id}
                className={`p-16 border rounded-xl bg-surface transition-shadow hover:shadow-sm flex flex-col justify-between min-w-0 ${
                  s.isActive ? 'border-border' : 'border-border/60 opacity-75'
                }`}
              >
                <div>
                  {/* Card Header: Name + Badges */}
                  <div className="flex items-start justify-between gap-8 mb-12">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-text truncate" title={s.name}>
                        {s.name}
                      </h3>
                      <div className="flex items-center gap-6 mt-4 flex-wrap">
                        <span
                          className={`text-xs px-8 py-[2px] rounded-full font-medium ${
                            s.kind === 'checker'
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : 'bg-accent/10 text-accent-strong border border-accent/20'
                          }`}
                        >
                          {stationKindLabel(s.kind)}
                        </span>
                        <span
                          className={`text-xs px-8 py-[2px] rounded-full font-medium ${
                            s.isActive
                              ? 'bg-success-soft text-success-strong'
                              : 'bg-surface-raised text-text-muted border border-border'
                          }`}
                        >
                          {s.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="p-8 rounded-lg border border-border text-text hover:bg-surface-raised transition-colors shrink-0"
                      title="Ubah stasiun"
                      aria-label={`Ubah stasiun ${s.name}`}
                      onClick={() => setDialogStation({ mode: 'edit', station: s })}
                    >
                      <Edit2 className="w-16 h-16" aria-hidden />
                    </button>
                  </div>

                  {/* Card Attributes */}
                  <div className="space-y-8 text-xs text-text-muted pt-8 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-[6px]">
                        <Printer className="w-16 h-16" aria-hidden />
                        <span>Mode cetak</span>
                      </span>
                      <span className="font-semibold text-text">
                        {printModeLabel(s.printMode)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-[6px]">
                        <Copy className="w-16 h-16" aria-hidden />
                        <span>Salinan & kertas</span>
                      </span>
                      <span className="font-medium text-text">
                        {s.copies} rangkap • {s.paper} mm
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-[6px]">
                        <Type className="w-16 h-16" aria-hidden />
                        <span>Ukuran huruf tiket</span>
                      </span>
                      <span className="font-medium text-text">
                        {PRINT_THEMES.find((t) => t.id === s.template.theme)?.label ?? 'Normal'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-[6px]">
                        <Package className="w-16 h-16" aria-hidden />
                        <span>Produk terhubung</span>
                      </span>
                      <span className={`font-semibold ${count > 0 ? 'text-accent-strong' : 'text-text-muted'}`}>
                        {count} produk
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Quick Actions */}
                <div className="pt-12 mt-12 border-t border-border flex items-center justify-between gap-8">
                  <span className="text-[11px] text-text-muted truncate">
                    {s.template.title ? `Judul: "${s.template.title}"` : 'Judul bawaan'}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-accent-strong font-semibold hover:underline shrink-0"
                    onClick={() => setDialogStation({ mode: 'edit', station: s })}
                  >
                    Atur templat →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Station Form Dialog (Create / Edit) */}
      {dialogStation && (
        <StationFormModal
          mode={dialogStation.mode}
          initialStation={dialogStation.station}
          productsCount={dialogStation.station ? (productCountMap.get(dialogStation.station.id) || 0) : 0}
          onClose={() => setDialogStation(null)}
          onSave={handleSave}
          onDeleteClick={(station) => setDeleteConfirm(station)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          station={deleteConfirm}
          productsCount={productCountMap.get(deleteConfirm.id) || 0}
          isLoading={actionLoading}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FORM MODAL WITH LIVE PREVIEW
// ---------------------------------------------------------------------------

function StationFormModal({
  mode,
  initialStation,
  productsCount,
  onClose,
  onSave,
  onDeleteClick,
}: {
  mode: 'new' | 'edit';
  initialStation?: PrintStation;
  productsCount: number;
  onClose: () => void;
  onSave: (input: PrintStationInput) => Promise<void>;
  onDeleteClick: (station: PrintStation) => void;
}) {
  const d = useDialog(onClose);

  const [name, setName] = useState(initialStation?.name || '');
  const [kind, setKind] = useState<StationKind>(initialStation?.kind || 'checker');
  const [printMode, setPrintMode] = useState<PrintMode>(initialStation?.printMode || 'auto');
  const [copies, setCopies] = useState<number>(initialStation?.copies || 1);
  const [paper, setPaper] = useState<PaperWidth>(initialStation?.paper || '58');
  const [isActive, setIsActive] = useState<boolean>(initialStation ? initialStation.isActive : true);

  // Template settings
  const [template, setTemplate] = useState<StationTemplate>(() => {
    if (initialStation?.template) {
      return normalizeTemplate(initialStation.template, initialStation.kind);
    }
    return defaultTemplate(kind);
  });

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate on input
  const validationProblem = useMemo(() => {
    return stationProblem({
      id: initialStation?.id,
      name,
      kind,
      printMode,
      copies,
      paper,
      template,
    });
  }, [initialStation?.id, name, kind, printMode, copies, paper, template]);

  const handleKindChange = (newKind: StationKind) => {
    setKind(newKind);
    // If not edited from initial, update template defaults
    if (!initialStation) {
      setTemplate(defaultTemplate(newKind));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationProblem) {
      setErrorBanner(validationProblem);
      return;
    }

    setIsSubmitting(true);
    setErrorBanner(null);
    try {
      await onSave({
        id: initialStation?.id,
        name: name.trim(),
        kind,
        printMode,
        copies,
        paper,
        isActive,
        template,
      });
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal menyimpan stasiun');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      {...d.props}
      className="cg-modal fixed inset-0 z-50 flex items-center justify-center p-12 bg-black/50 overflow-y-auto"
      style={{ margin: 'auto', maxWidth: 'min(980px, calc(100vw - 16px))', width: '100%' }}
    >
      <div className="bg-surface rounded-2xl shadow-pop border border-border overflow-hidden flex flex-col max-h-[90vh] w-full min-w-0">
        {/* Modal Header */}
        <div className="p-16 border-b border-border flex items-center justify-between gap-12 bg-surface-raised shrink-0">
          <div>
            <h2 className="text-base font-bold text-text">
              {mode === 'new' ? 'Tambah Stasiun Cetak' : `Ubah Stasiun: ${initialStation?.name}`}
            </h2>
            <p className="text-xs text-text-muted mt-2">
              Atur printer stasiun dan kustomisasi templat cetak tiket pesanan
            </p>
          </div>
          <button
            type="button"
            className="p-4 rounded-md text-text-muted hover:text-text hover:bg-surface text-sm font-semibold"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Content Grid */}
        <div className="p-16 overflow-y-auto min-w-0 flex-1">
          {errorBanner && (
            <div className="cg-banner cg-banner--danger mb-16 flex items-center justify-between gap-12" role="alert">
              <span className="text-xs">{errorBanner}</span>
              <button
                type="button"
                className="text-xs underline hover:text-text shrink-0"
                onClick={() => setErrorBanner(null)}
              >
                Tutup
              </button>
            </div>
          )}

          <form id="station-form" onSubmit={handleSubmit} className="min-w-0">
            <div className="grid grid-cols-1 desktop:grid-cols-12 gap-20 min-w-0">
              {/* Left Column: Form Controls (7 cols on desktop) */}
              <div className="desktop:col-span-7 space-y-16 min-w-0">
                {/* 1. Nama Stasiun */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label htmlFor="station-name" className="text-xs font-semibold text-text">
                      Nama Stasiun <span className="text-danger">*</span>
                    </label>
                    <span className="text-[11px] text-text-muted">{name.length}/40</span>
                  </div>
                  <input
                    id="station-name"
                    type="text"
                    required
                    maxLength={40}
                    placeholder="Contoh: Dapur Utama, Bar Minuman, Label Cup"
                    className="cg-input w-full text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* 2. Jenis Stasiun */}
                <div>
                  <label className="text-xs font-semibold text-text block mb-6">Jenis Stasiun</label>
                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-8">
                    {STATION_KIND_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleKindChange(opt.id)}
                        className={`p-10 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                          kind === opt.id
                            ? 'border-accent bg-accent/5 ring-1 ring-accent'
                            : 'border-border bg-surface hover:bg-surface-raised'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-6 mb-2">
                          <strong className="text-xs text-text font-bold">{opt.label}</strong>
                          {kind === opt.id && <CheckCircle2 className="w-16 h-16 text-accent shrink-0" aria-hidden />}
                        </div>
                        <span className="text-[11px] text-text-muted leading-tight">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Mode Cetak */}
                <div>
                  <label className="text-xs font-semibold text-text block mb-6">Mode Cetak di Kasir</label>
                  <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
                    {PRINT_MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrintMode(opt.id)}
                        className={`p-10 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                          printMode === opt.id
                            ? 'border-accent bg-accent/5 ring-1 ring-accent'
                            : 'border-border bg-surface hover:bg-surface-raised'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <strong className="text-xs text-text font-bold">{opt.label}</strong>
                          {printMode === opt.id && <CheckCircle2 className="w-16 h-16 text-accent shrink-0" aria-hidden />}
                        </div>
                        <span className="text-[10px] text-text-muted leading-tight">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Salinan & Lebar Kertas */}
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
                  <div>
                    <label htmlFor="station-copies" className="text-xs font-semibold text-text block mb-4">
                      Jumlah Salinan Tiket
                    </label>
                    <div className="flex items-center gap-8">
                      <select
                        id="station-copies"
                        className="cg-input w-full text-sm"
                        value={copies}
                        onChange={(e) => setCopies(parseInt(e.target.value, 10))}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} rangkap / salinan
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[10px] text-text-muted mt-2 block">
                      Jumlah rangkap yang dicetak setiap kali transaksi dikirim
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-text block mb-4">Lebar Kertas Printer</label>
                    <div className="grid grid-cols-2 gap-8">
                      {(['58', '80'] as PaperWidth[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPaper(p)}
                          className={`py-8 px-12 rounded-lg border text-center text-xs font-semibold transition-colors ${
                            paper === p
                              ? 'border-accent bg-accent/5 text-accent-strong ring-1 ring-accent'
                              : 'border-border bg-surface text-text hover:bg-surface-raised'
                          }`}
                        >
                          {p} mm
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-text-muted mt-2 block">
                      58 mm (standar struk kecil) atau 80 mm (lebar)
                    </span>
                  </div>
                </div>

                {/* 5. Status Aktif */}
                <div className="p-12 rounded-xl border border-border bg-surface-raised flex items-center justify-between gap-12">
                  <div>
                    <span className="text-xs font-semibold text-text block">Status Stasiun Aktif</span>
                    <span className="text-[11px] text-text-muted">
                      Bila nonaktif, pesanan tidak diteruskan ke stasiun ini
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-[36px] h-20 bg-border peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-16 after:w-16 after:transition-all peer-checked:bg-accent" />
                  </label>
                </div>

                {/* 6. Templat Setting Section */}
                <div className="pt-16 border-t border-border space-y-12 min-w-0">
                  <div className="flex items-center gap-8">
                    <Sliders className="w-16 h-16 text-primary" aria-hidden />
                    <h3 className="text-sm font-bold text-text">Format & Templat Tiket</h3>
                  </div>

                  {/* Ukuran Huruf / Tema */}
                  <div>
                    <label className="text-xs font-semibold text-text block mb-4">
                      Ukuran Huruf Tiket (Tema)
                    </label>
                    <div className="grid grid-cols-3 gap-8">
                      {PRINT_THEMES.map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => setTemplate((prev) => ({ ...prev, theme: th.id }))}
                          className={`py-8 px-8 rounded-lg border text-center text-xs font-medium transition-colors ${
                            template.theme === th.id
                              ? 'border-accent bg-accent/5 text-accent-strong ring-1 ring-accent font-semibold'
                              : 'border-border bg-surface text-text hover:bg-surface-raised'
                          }`}
                        >
                          {th.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Judul & Teks Bawah */}
                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <label htmlFor="tpl-title" className="text-xs font-medium text-text">
                          Judul Atas Tiket
                        </label>
                        <span className="text-[10px] text-text-muted">{template.title.length}/60</span>
                      </div>
                      <input
                        id="tpl-title"
                        type="text"
                        maxLength={60}
                        placeholder={name ? name.toUpperCase() : 'JUDUL STASIUN'}
                        className="cg-input w-full text-xs"
                        value={template.title}
                        onChange={(e) => setTemplate((prev) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <label htmlFor="tpl-footer" className="text-xs font-medium text-text">
                          Teks Bawah Tiket
                        </label>
                        <span className="text-[10px] text-text-muted">{template.footer.length}/60</span>
                      </div>
                      <input
                        id="tpl-footer"
                        type="text"
                        maxLength={60}
                        placeholder="Contoh: Segera sajikan selagi hangat"
                        className="cg-input w-full text-xs"
                        value={template.footer}
                        onChange={(e) => setTemplate((prev) => ({ ...prev, footer: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Sakelar Tampil / Sembunyi */}
                  <div>
                    <span className="text-xs font-semibold text-text block mb-6">
                      Informasi yang Dicetak
                    </span>
                    <div className="grid grid-cols-1 tablet:grid-cols-2 gap-x-12 gap-y-8 bg-surface-raised p-12 rounded-xl border border-border text-xs">
                      <ToggleOption
                        id="tpl-order-no"
                        label="Nomor pesanan"
                        checked={template.showOrderNo}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showOrderNo: checked }))}
                      />
                      <ToggleOption
                        id="tpl-order-type"
                        label="Jenis order (Dine In / Take Away)"
                        checked={template.showOrderType}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showOrderType: checked }))}
                      />
                      <ToggleOption
                        id="tpl-table"
                        label="Nama meja / label pesanan"
                        checked={template.showTable}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showTable: checked }))}
                      />
                      <ToggleOption
                        id="tpl-guests"
                        label="Jumlah tamu"
                        checked={template.showGuests}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showGuests: checked }))}
                      />
                      <ToggleOption
                        id="tpl-cashier"
                        label="Nama kasir"
                        checked={template.showCashier}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showCashier: checked }))}
                      />
                      <ToggleOption
                        id="tpl-time"
                        label="Waktu order"
                        checked={template.showTime}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showTime: checked }))}
                      />
                      <ToggleOption
                        id="tpl-notes"
                        label="Catatan item"
                        checked={template.showNotes}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showNotes: checked }))}
                      />
                      <ToggleOption
                        id="tpl-extras"
                        label="Ekstra / modifier produk"
                        checked={template.showExtras}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, showExtras: checked }))}
                      />
                      <ToggleOption
                        id="tpl-bold-items"
                        label="Nama item dicetak tebal"
                        checked={template.boldItems}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, boldItems: checked }))}
                      />
                      <ToggleOption
                        id="tpl-separators"
                        label="Garis pemisah antarbagian"
                        checked={template.separators}
                        onChange={(checked) => setTemplate((prev) => ({ ...prev, separators: checked }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Monospace Ticket Preview (5 cols on desktop) */}
              <div className="desktop:col-span-5 flex flex-col min-w-0">
                <div className="sticky top-0 space-y-8 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-[6px]">
                      <Printer className="w-16 h-16 text-text-muted" aria-hidden />
                      Pratinjau Tiket ({paper} mm)
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {paperCols(paper)} kolom • Tema: {PRINT_THEMES.find((t) => t.id === template.theme)?.label}
                    </span>
                  </div>

                  {/* Monospace Struk Render Box */}
                  <div className="border border-border/80 rounded-xl bg-surface-raised p-12 min-w-0 shadow-xs">
                    <div
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 rounded-lg shadow-sm font-mono text-xs text-zinc-900 dark:text-zinc-100 overflow-x-auto min-w-0 max-w-full"
                      style={{ minHeight: '260px' }}
                    >
                      <StationLivePreview
                        name={name || 'DAPUR'}
                        kind={kind}
                        paper={paper}
                        template={template}
                      />
                    </div>
                    <p className="text-[10px] text-text-muted text-center mt-8">
                      Pratinjau di atas menggunakan contoh pesanan tiruan untuk menguji tata letak dan ukuran huruf.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-16 border-t border-border bg-surface-raised flex flex-wrap items-center justify-between gap-12 shrink-0">
          <div>
            {mode === 'edit' && initialStation && (
              <button
                type="button"
                className="cg-btn cg-btn--danger flex items-center gap-6 text-xs"
                disabled={isSubmitting}
                onClick={() => onDeleteClick(initialStation)}
              >
                <Trash2 className="w-16 h-16" aria-hidden />
                <span>Hapus stasiun</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-8 ml-auto">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="submit"
              form="station-form"
              className="cg-btn cg-btn--primary"
              disabled={isSubmitting || Boolean(validationProblem)}
            >
              {isSubmitting ? 'Menyimpan…' : mode === 'new' ? 'Tambah Stasiun' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// LIVE MONOSPACE PREVIEW COMPONENT
// ---------------------------------------------------------------------------

function StationLivePreview({
  name,
  kind,
  paper,
  template,
}: {
  name: string;
  kind: StationKind;
  paper: PaperWidth;
  template: StationTemplate;
}) {
  const sample = useMemo(() => sampleTicket(), []);
  const cols = paperCols(paper);

  const pieces = useMemo(() => {
    if (kind === 'label') {
      const sets = labelPieceSets({
        station: { name, template },
        meta: sample.meta,
        lines: sample.lines,
        cols,
      });
      return sets[0] || [];
    }

    return checkerPieces({
      station: { name, template },
      meta: sample.meta,
      lines: sample.lines,
      cols,
    });
  }, [name, kind, template, sample, cols]);

  return (
    <pre className="font-mono leading-relaxed select-text whitespace-pre-wrap break-all min-w-0 max-w-full">
      {pieces.map((piece, idx) => {
        const alignClass = piece.align === 'center' ? 'text-center' : 'text-left';

        let sizeClass = 'text-xs';
        if (piece.size === 'medium') sizeClass = 'text-xs tracking-wider';
        if (piece.size === 'large') sizeClass = 'text-sm tracking-wide font-extrabold';

        const boldClass = piece.bold ? 'font-bold' : 'font-normal';

        return (
          <div key={idx} className={`${alignClass} ${boldClass} ${sizeClass} min-h-[16px]`}>
            {piece.text || ' '}
          </div>
        );
      })}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// TOGGLE OPTION COMPONENT
// ---------------------------------------------------------------------------

function ToggleOption({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-8 cursor-pointer select-none py-[2px]">
      <span className="text-text font-medium leading-normal">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded-xs border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer shrink-0"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// DELETE CONFIRMATION MODAL
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  station,
  productsCount,
  isLoading,
  onClose,
  onConfirm,
}: {
  station: PrintStation;
  productsCount: number;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const d = useDialog(onClose);

  return (
    <dialog
      {...d.props}
      className="cg-modal fixed inset-0 z-50 flex items-center justify-center p-12 bg-black/50"
      style={{ margin: 'auto', maxWidth: '440px', width: '100%' }}
    >
      <div className="bg-surface rounded-2xl shadow-pop border border-border p-20 w-full min-w-0">
        <div className="flex items-start gap-12 mb-16">
          <div className="p-8 rounded-full bg-danger/10 text-danger shrink-0">
            <Trash2 className="w-20 h-20" aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Hapus Stasiun "{station.name}"?</h3>
            <p className="text-xs text-text-muted mt-4 leading-normal">
              Yakin ingin menghapus stasiun cetak ini?{' '}
              {productsCount > 0 ? (
                <strong className="text-danger font-semibold">
                  {productsCount} produk yang terhubung ke stasiun ini akan kembali tanpa stasiun.
                </strong>
              ) : (
                'Produk yang terhubung akan kembali tanpa stasiun.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-8 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary text-xs"
            disabled={isLoading}
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger text-xs"
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? 'Menghapus…' : 'Ya, Hapus Stasiun'}
          </button>
        </div>
      </div>
    </dialog>
  );
}


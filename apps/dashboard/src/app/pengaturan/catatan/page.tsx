'use client';

import { useState, useMemo, type FormEvent } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Tag,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ShoppingBag,
  Eye,
} from 'lucide-react';
import {
  notePresetProblem,
  groupNotePresets,
  toggleNoteText,
  noteHasText,
  NOTE_CATEGORY_MAX,
  NOTE_TEXT_MAX,
  type NotePreset,
  type NotePresetInput,
  type NoteGroup,
} from '@cgpos/shared';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

// Catatan bawaan untuk tombol "Isi contoh"
const SAMPLE_PRESETS: { category: string; text: string }[] = [
  { category: 'Level pedas', text: 'Tidak pedas' },
  { category: 'Level pedas', text: 'Sedang' },
  { category: 'Level pedas', text: 'Pedas' },
  { category: 'Gula', text: 'Kurang manis' },
  { category: 'Gula', text: 'Tanpa gula' },
  { category: 'Es', text: 'Es sedikit' },
  { category: 'Es', text: 'Tanpa es' },
  { category: 'Permintaan', text: 'Bungkus terpisah' },
  { category: 'Permintaan', text: 'Jangan pakai sedotan' },
];

export default function NotePresetsPage() {
  const data = useData();
  const presetsState = useAsync(() => data.listNotePresets(), [data]);

  const [dialogPreset, setDialogPreset] = useState<{
    mode: 'new' | 'edit';
    preset?: NotePreset;
    defaultCategory?: string;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<NotePreset | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // State untuk pratinjau interaktif kasir
  const [previewNote, setPreviewNote] = useState<string>('kurang manis, es sedikit');

  const presets = presetsState.status === 'ready' ? presetsState.data : [];

  // Kelompokkan semua catatan untuk manajemen kartu per kategori (termasuk nonaktif)
  const allGroups = useMemo(() => {
    const groups = new Map<string, { category: string; items: NotePreset[] }>();
    const sorted = [...presets].sort(
      (a, b) => a.sort - b.sort || a.category.localeCompare(b.category) || a.text.localeCompare(b.text)
    );
    for (const p of sorted) {
      const key = p.category.trim().toLowerCase();
      let g = groups.get(key);
      if (!g) {
        g = { category: p.category.trim(), items: [] };
        groups.set(key, g);
      }
      g.items.push(p);
    }
    return [...groups.values()];
  }, [presets]);

  // Daftar nama kategori unik yang sudah ada
  const existingCategories = useMemo(() => {
    return Array.from(new Set(presets.map((p) => p.category.trim()))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [presets]);

  // Kelompokkan catatan aktif untuk pratinjau kasir
  const activeGroups: NoteGroup[] = useMemo(() => {
    return groupNotePresets(presets);
  }, [presets]);

  const handleSeedSamples = async () => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      let created = 0;
      for (let i = 0; i < SAMPLE_PRESETS.length; i++) {
        const item = SAMPLE_PRESETS[i]!;
        // Jangan duplikasi jika sudah ada di kategori yang sama
        const alreadyExists = presets.some(
          (p) =>
            p.category.trim().toLowerCase() === item.category.toLowerCase() &&
            p.text.trim().toLowerCase() === item.text.toLowerCase()
        );
        if (!alreadyExists) {
          await data.saveNotePreset({
            category: item.category,
            text: item.text,
            sort: i + 1,
            isActive: true,
          });
          created++;
        }
      }
      presetsState.reload();
      setActionSuccess(`Berhasil menambahkan ${created} catatan contoh.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengisi catatan contoh.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (preset: NotePreset) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await data.saveNotePreset({
        id: preset.id,
        category: preset.category,
        text: preset.text,
        sort: preset.sort,
        isActive: !preset.isActive,
      });
      presetsState.reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah status catatan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (preset: NotePreset) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await data.removeNotePreset(preset.id);
      setDeleteConfirm(null);
      presetsState.reload();
      setActionSuccess(`Catatan "${preset.text}" berhasil dihapus.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus catatan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSave = async (input: NotePresetInput) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await data.saveNotePreset(input);
      setDialogPreset(null);
      presetsState.reload();
      setActionSuccess(`Catatan "${input.text}" berhasil disimpan.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan catatan.');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Catatan Siap Pakai"
        subtitle="Susun pilihan catatan pesanan agar kasir dapat mencatat permintaan pelanggan dengan satu ketukan"
        helpText="Catatan ini tampil sebagai tombol cepat di layar kasir saat menambah atau mengubah pesanan item."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary flex items-center gap-8 text-xs font-semibold"
              onClick={() => setDialogPreset({ mode: 'new' })}
            >
              <Plus className="w-16 h-16" aria-hidden />
              <span>Tambah kategori baru</span>
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary flex items-center gap-8 text-xs font-semibold"
              onClick={() => setDialogPreset({ mode: 'new' })}
            >
              <Plus className="w-16 h-16" aria-hidden />
              <span>Tambah catatan</span>
            </button>
          </div>
        }
      />

      {/* Pesan Status / Galat Server */}
      {actionError && (
        <p role="alert" className="cg-banner cg-banner--danger">
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p role="status" className="cg-banner cg-banner--info flex items-center gap-8">
          <Check className="w-16 h-16 text-accent" aria-hidden />
          <span>{actionSuccess}</span>
        </p>
      )}

      {presetsState.status === 'error' && (
        <ErrorBox message={presetsState.message} onRetry={presetsState.reload} />
      )}

      {presetsState.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat">
          <div className="grid grid-cols-1 laptop:grid-cols-12 gap-24">
            <div className="laptop:col-span-8 space-y-16">
              {[0, 1].map((i) => (
                <div key={i} className="cg-skeleton h-[180px]" />
              ))}
            </div>
            <div className="laptop:col-span-4 cg-skeleton h-[300px]" />
          </div>
        </div>
      )}

      {presetsState.status === 'ready' && (
        <>
          {presets.length === 0 ? (
            /* Keadaan Kosong */
            <div className="cg-empty space-y-12 max-w-[560px] mx-auto py-40">
              <Tag className="cg-icon w-48 h-48 text-text-muted mx-auto" aria-hidden />
              <div>
                <p className="font-semibold text-base">Belum ada catatan siap pakai.</p>
                <p className="text-sm text-text-muted mt-4">
                  Tambahkan catatan cepat seperti level pedas atau tingkat manis agar kasir lebih mudah mencatat pesanan.
                </p>
              </div>
              <div className="pt-8 flex flex-wrap items-center justify-center gap-12">
                <button
                  type="button"
                  className="cg-btn cg-btn--primary flex items-center gap-8 text-xs font-semibold"
                  disabled={actionLoading}
                  onClick={handleSeedSamples}
                >
                  <Sparkles className="w-16 h-16" aria-hidden />
                  <span>{actionLoading ? 'Menyiapkan…' : 'Isi catatan contoh'}</span>
                </button>
                <button
                  type="button"
                  className="cg-btn cg-btn--secondary flex items-center gap-8 text-xs font-semibold"
                  onClick={() => setDialogPreset({ mode: 'new' })}
                >
                  <Plus className="w-16 h-16" aria-hidden />
                  <span>Buat catatan sendiri</span>
                </button>
              </div>
            </div>
          ) : (
            /* Layout Grid: Daftar Kategori & Catatan di Kiri, Pratinjau Kasir di Kanan */
            <div className="grid grid-cols-1 laptop:grid-cols-12 gap-24 items-start min-w-0">
              {/* Kolom Kiri: Kartu per Kategori */}
              <div className="laptop:col-span-8 space-y-20 min-w-0">
                {allGroups.map((group) => {
                  const activeCount = group.items.filter((i) => i.isActive).length;
                  return (
                    <section
                      key={group.category}
                      className="bg-surface border border-border rounded-lg p-20 space-y-16 min-w-0"
                      aria-labelledby={`cat-${group.category}`}
                    >
                      {/* Header Kategori */}
                      <div className="flex flex-wrap items-center justify-between gap-12 pb-12 border-b border-border">
                        <div className="flex items-center gap-8">
                          <h2
                            id={`cat-${group.category}`}
                            className="font-bold text-base text-text flex items-center gap-8"
                          >
                            <Tag className="w-16 h-16 text-accent" aria-hidden />
                            <span>{group.category}</span>
                          </h2>
                          <span className="cg-badge text-xs">
                            {activeCount}/{group.items.length} aktif
                          </span>
                        </div>

                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary flex items-center gap-6 text-xs"
                          onClick={() =>
                            setDialogPreset({
                              mode: 'new',
                              defaultCategory: group.category,
                            })
                          }
                        >
                          <Plus className="w-16 h-16" aria-hidden />
                          <span>Tambah ke {group.category}</span>
                        </button>
                      </div>

                      {/* Baris Catatan */}
                      <div className="grid grid-cols-1 gap-8 min-w-0">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className={`p-12 border rounded-md flex items-center justify-between gap-12 transition-colors ${
                              item.isActive
                                ? 'bg-surface border-border'
                                : 'bg-surface-raised border-dashed border-border opacity-60'
                            }`}
                          >
                            <div className="min-w-0 grow">
                              <span className="text-sm font-medium block break-words">
                                {item.text}
                              </span>
                              {!item.isActive && (
                                <span className="text-[11px] text-text-muted block mt-2">
                                  Nonaktif (tidak tampil di kasir)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              {/* Tombol Toggle Aktif / Nonaktif */}
                              <button
                                type="button"
                                className={`cg-btn text-xs px-8 py-4 ${
                                  item.isActive
                                    ? 'cg-btn--ghost text-accent font-semibold'
                                    : 'cg-btn--secondary text-text-muted'
                                }`}
                                title={item.isActive ? 'Nonaktifkan catatan' : 'Aktifkan catatan'}
                                aria-label={item.isActive ? `Nonaktifkan ${item.text}` : `Aktifkan ${item.text}`}
                                onClick={() => handleToggleActive(item)}
                                disabled={actionLoading}
                              >
                                {item.isActive ? 'Aktif' : 'Mati'}
                              </button>

                              {/* Tombol Ubah */}
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost p-6 text-text-muted hover:text-text"
                                title="Ubah catatan"
                                aria-label={`Ubah ${item.text}`}
                                onClick={() =>
                                  setDialogPreset({
                                    mode: 'edit',
                                    preset: item,
                                  })
                                }
                              >
                                <Edit2 className="w-16 h-16" aria-hidden />
                              </button>

                              {/* Tombol Hapus */}
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost p-6 text-danger hover:text-danger-strong"
                                title="Hapus catatan"
                                aria-label={`Hapus ${item.text}`}
                                onClick={() => setDeleteConfirm(item)}
                              >
                                <Trash2 className="w-16 h-16" aria-hidden />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              {/* Kolom Kanan: Pratinjau "Begini tampil di kasir" */}
              <div className="laptop:col-span-4 bg-surface border border-border rounded-lg p-20 space-y-16 sticky top-24 min-w-0">
                <div className="flex items-center justify-between pb-12 border-b border-border">
                  <div className="flex items-center gap-8">
                    <Eye className="w-16 h-16 text-accent" aria-hidden />
                    <h3 className="text-sm font-semibold">Begini Tampil di Kasir</h3>
                  </div>
                  <span className="cg-badge cg-badge--info text-xs">Simulasi Interaktif</span>
                </div>

                <p className="text-xs text-text-muted">
                  Kasir mengetuk chip catatan untuk menambahkan atau melepasnya dari catatan pesanan pelanggan.
                </p>

                {/* Simulasi Kotak Catatan Pesanan */}
                <div className="bg-surface-raised p-12 rounded-md border border-border space-y-6">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wide block">
                    Catatan Pesanan Saat Ini:
                  </span>
                  <div className="p-8 bg-surface border border-border rounded text-sm min-h-[40px] font-mono break-words">
                    {previewNote ? (
                      <span className="text-text font-medium">{previewNote}</span>
                    ) : (
                      <span className="text-text-muted italic">Tidak ada catatan</span>
                    )}
                  </div>
                  {previewNote && (
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline block pt-2"
                      onClick={() => setPreviewNote('')}
                    >
                      Kosongkan catatan simulasi
                    </button>
                  )}
                </div>

                {/* Simulasi Chip per Kategori (groupNotePresets) */}
                <div className="space-y-16 pt-8">
                  {activeGroups.length === 0 ? (
                    <p className="text-xs text-text-muted italic">
                      Tidak ada catatan yang aktif untuk ditampilkan di kasir.
                    </p>
                  ) : (
                    activeGroups.map((group) => (
                      <div key={group.category} className="space-y-6">
                        <span className="text-xs font-semibold text-text-muted block">
                          {group.category}
                        </span>
                        <div className="flex flex-wrap gap-6">
                          {group.items.map((item) => {
                            const isSelected = noteHasText(previewNote, item.text);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className="cg-chip text-xs"
                                aria-pressed={isSelected}
                                onClick={() => {
                                  setPreviewNote((prev) => toggleNoteText(prev, item.text));
                                }}
                              >
                                {item.text}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Tambah / Ubah Catatan */}
      {dialogPreset && (
        <PresetFormDialog
          mode={dialogPreset.mode}
          preset={dialogPreset.preset}
          defaultCategory={dialogPreset.defaultCategory}
          existingCategories={existingCategories}
          isLoading={actionLoading}
          onClose={() => setDialogPreset(null)}
          onSave={handleSave}
        />
      )}

      {/* Modal Konfirmasi Hapus Catatan */}
      {deleteConfirm && (
        <DeleteConfirmDialog
          preset={deleteConfirm}
          isLoading={actionLoading}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
        />
      )}
    </div>
  );
}

// Dialog Form Tambah / Ubah Catatan
function PresetFormDialog({
  mode,
  preset,
  defaultCategory,
  existingCategories,
  isLoading,
  onClose,
  onSave,
}: {
  mode: 'new' | 'edit';
  preset?: NotePreset;
  defaultCategory?: string;
  existingCategories: string[];
  isLoading: boolean;
  onClose: () => void;
  onSave: (input: NotePresetInput) => Promise<void>;
}) {
  const d = useDialog(onClose);

  const initialCat = preset?.category ?? defaultCategory ?? existingCategories[0] ?? '';
  const [isNewCategory, setIsNewCategory] = useState(!preset && !defaultCategory && existingCategories.length === 0);
  const [selectedCategory, setSelectedCategory] = useState(initialCat);
  const [newCategoryText, setNewCategoryText] = useState('');
  const [text, setText] = useState(preset?.text ?? '');
  const [sort, setSort] = useState(preset?.sort ? String(preset.sort) : '1');
  const [isActive, setIsActive] = useState(preset?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const categoryValue = isNewCategory ? newCategoryText.trim() : selectedCategory.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const problem = notePresetProblem({
      category: categoryValue,
      text: text.trim(),
    });

    if (problem) {
      setError(problem);
      return;
    }

    try {
      await onSave({
        id: preset?.id,
        category: categoryValue,
        text: text.trim(),
        sort: parseInt(sort, 10) || 1,
        isActive,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    }
  };

  return (
    <dialog
      {...d.props}
      aria-labelledby="dialog-preset-title"
      style={{ margin: 'auto', maxWidth: 'min(480px, calc(100vw - 32px))' }}
      className="bg-surface text-text rounded-xl p-24 border border-border shadow-xl backdrop:bg-black/50"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-20 min-w-0">
        <h2 id="dialog-preset-title" className="text-base font-bold text-text">
          {mode === 'new' ? 'Tambah Catatan Siap Pakai' : 'Ubah Catatan'}
        </h2>

        {error && (
          <p role="alert" className="cg-banner cg-banner--danger text-xs">
            {error}
          </p>
        )}

        {/* Kategori Catatan */}
        <div className="space-y-8">
          <label className="cg-label block" htmlFor="category-select">
            Kategori Catatan
          </label>

          {existingCategories.length > 0 && !isNewCategory ? (
            <div className="space-y-6">
              <select
                id="category-select"
                className="cg-input"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-xs text-accent hover:underline block"
                onClick={() => setIsNewCategory(true)}
              >
                + Buat kategori baru
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <input
                id="new-category-input"
                type="text"
                className="cg-input"
                maxLength={NOTE_CATEGORY_MAX}
                value={newCategoryText}
                onChange={(e) => {
                  setNewCategoryText(e.target.value);
                  setError(null);
                }}
                placeholder="Mis. Level pedas, Gula, Es, Saus"
                autoFocus
              />
              {existingCategories.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-accent hover:underline block"
                  onClick={() => setIsNewCategory(false)}
                >
                  ← Pilih dari kategori yang sudah ada
                </button>
              )}
            </div>
          )}
        </div>

        {/* Isi Catatan */}
        <div className="space-y-6">
          <label className="cg-label block" htmlFor="preset-text-input">
            Isi Catatan
          </label>
          <input
            id="preset-text-input"
            type="text"
            className="cg-input"
            maxLength={NOTE_TEXT_MAX}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="Mis. Tidak pedas, Sedang, Kurang manis, Tanpa es"
          />
          <p className="text-xs text-text-muted">
            Maksimal {NOTE_TEXT_MAX} huruf ({text.length}/{NOTE_TEXT_MAX}).
          </p>
        </div>

        {/* Urutan Tampil (Sort) */}
        <div className="space-y-6">
          <label className="cg-label block" htmlFor="preset-sort-input">
            Urutan Tampil
          </label>
          <input
            id="preset-sort-input"
            type="number"
            min={1}
            max={999}
            className="cg-input w-[100px] cg-num"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          />
        </div>

        {/* Status Aktif */}
        <div className="pt-8 border-t border-border">
          <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Aktif (tampil di pilihan kasir)</span>
          </label>
        </div>

        {/* Aksi Modal */}
        <div className="flex items-center justify-end gap-12 pt-16 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary text-xs"
            disabled={isLoading}
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="submit"
            className="cg-btn cg-btn--primary text-xs flex items-center gap-6"
            disabled={isLoading}
          >
            <Check className="w-16 h-16" aria-hidden />
            <span>{isLoading ? 'Menyimpan…' : 'Simpan'}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Dialog Konfirmasi Hapus Catatan
function DeleteConfirmDialog({
  preset,
  isLoading,
  onClose,
  onConfirm,
}: {
  preset: NotePreset;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const d = useDialog(onClose);

  return (
    <dialog
      {...d.props}
      aria-labelledby="delete-confirm-title"
      style={{ margin: 'auto', maxWidth: 'min(440px, calc(100vw - 32px))' }}
      className="bg-surface text-text rounded-xl p-24 border border-border shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-16 min-w-0">
        <div className="flex items-start gap-12">
          <div className="p-8 rounded-full bg-danger-soft text-danger shrink-0">
            <AlertCircle className="w-24 h-24" aria-hidden />
          </div>
          <div className="space-y-4">
            <h2 id="delete-confirm-title" className="text-base font-bold text-text">
              Hapus Catatan Siap Pakai?
            </h2>
            <p className="text-sm text-text-muted">
              Apakah Anda yakin ingin menghapus catatan <strong className="text-text font-semibold">"{preset.text}"</strong> dari kategori <strong className="text-text font-semibold">"{preset.category}"</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-12 pt-16 border-t border-border">
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
            className="cg-btn cg-btn--danger text-xs flex items-center gap-6"
            disabled={isLoading}
            onClick={onConfirm}
          >
            <Trash2 className="w-16 h-16" aria-hidden />
            <span>{isLoading ? 'Menghapus…' : 'Ya, Hapus'}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}

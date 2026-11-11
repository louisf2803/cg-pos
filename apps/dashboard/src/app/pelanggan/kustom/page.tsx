'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ListPlus, Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import {
  CUSTOMER_FIELD_TYPE_LABELS,
  customerCustomFieldProblem,
  DEFAULT_CUSTOMER_CUSTOM_FIELDS,
  newId,
  type CustomerCustomField,
  type CustomerFieldType,
} from '@cgpos/shared';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { loadCustomerCustomFields, saveCustomerCustomFields } from '@/lib/a60-preview';

function FieldModal({
  editing,
  existing,
  onClose,
  onSave,
}: {
  editing?: CustomerCustomField;
  existing: CustomerCustomField[];
  onClose: () => void;
  onSave: (field: CustomerCustomField) => void;
}) {
  const d = useDialog(onClose);
  const [label, setLabel] = useState(editing?.label ?? '');
  const [fieldType, setFieldType] = useState<CustomerFieldType>(editing?.fieldType ?? 'text');
  const [optionsText, setOptionsText] = useState((editing?.options ?? []).join(', '));
  const [placeholder, setPlaceholder] = useState(editing?.placeholder ?? '');
  const [required, setRequired] = useState(editing?.required ?? false);
  const [showInReceipt, setShowInReceipt] = useState(editing?.showInReceipt ?? false);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const options =
      fieldType === 'select'
        ? optionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const problem = customerCustomFieldProblem(
      { label, fieldType, options, placeholder },
      existing,
      editing?.id
    );
    if (problem) {
      setErr(problem);
      return;
    }
    onSave({
      id: editing?.id ?? `cf-${newId()}`,
      label: label.trim(),
      fieldType,
      required,
      showInReceipt,
      isActive,
      options,
      placeholder: placeholder.trim() || undefined,
    });
  }

  return (
    <dialog {...d.props} aria-labelledby="cf-modal-title">
      <form onSubmit={submit} noValidate className="grid gap-16 p-20 max-w-[520px]">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="cf-modal-title" className="text-lg font-bold">
              {editing ? 'Ubah kolom kustom' : 'Tambah kolom kustom'}
            </h2>
            <p className="text-xs text-text-muted">
              Kolom ini melengkapi formulir profil pelanggan di luar kolom bawaan.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        {err && (
          <div className="cg-banner cg-banner--danger" role="alert">
            {err}
          </div>
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="cf-label">
            Nama kolom
          </label>
          <input
            id="cf-label"
            className="cg-input"
            placeholder="Contoh: Preferensi rasa atau Asal komunitas"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={50}
            autoFocus
          />
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="cf-type">
            Tipe isian
          </label>
          <select
            id="cf-type"
            className="cg-select"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomerFieldType)}
          >
            {(['text', 'number', 'date', 'select'] as CustomerFieldType[]).map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {fieldType === 'select' ? (
          <div className="cg-field">
            <label className="cg-label" htmlFor="cf-options">
              Opsi pilihan (pisahkan dengan koma)
            </label>
            <input
              id="cf-options"
              className="cg-input"
              placeholder="Less sugar, Tanpa es, Susu oat"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </div>
        ) : (
          <div className="cg-field">
            <label className="cg-label" htmlFor="cf-placeholder">
              Teks contoh pengisian (opsional)
            </label>
            <input
              id="cf-placeholder"
              className="cg-input"
              placeholder="Contoh: Divisi pemasaran"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              maxLength={80}
            />
          </div>
        )}

        <div className="grid gap-8">
          <label className="flex items-center gap-8 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            <span>Wajib diisi saat membuat profil pelanggan</span>
          </label>
          <label className="flex items-center gap-8 text-sm">
            <input
              type="checkbox"
              checked={showInReceipt}
              onChange={(e) => setShowInReceipt(e.target.checked)}
            />
            <span>Tampilkan nilainya di ringkasan profil kasir / struk</span>
          </label>
          <label className="flex items-center gap-8 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Aktif</span>
          </label>
        </div>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan kolom
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function KustomDataPelangganPage() {
  const [fields, setFields] = useState<CustomerCustomField[]>(DEFAULT_CUSTOMER_CUSTOM_FIELDS);
  const [modal, setModal] = useState<{ open: boolean; editing?: CustomerCustomField }>({
    open: false,
  });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setFields(loadCustomerCustomFields());
  }, []);

  function persist(next: CustomerCustomField[], msg: string) {
    setFields(next);
    saveCustomerCustomFields(next);
    setNotice(msg);
  }

  function handleSaveField(saved: CustomerCustomField) {
    const exists = fields.some((f) => f.id === saved.id);
    const next = exists
      ? fields.map((f) => (f.id === saved.id ? saved : f))
      : [...fields, saved];
    persist(next, `Kolom "${saved.label}" disimpan.`);
    setModal({ open: false });
  }

  function handleToggle(field: CustomerCustomField) {
    const next = fields.map((f) =>
      f.id === field.id ? { ...f, isActive: !f.isActive } : f
    );
    persist(next, `Kolom "${field.label}" ${!field.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
  }

  function handleDelete(field: CustomerCustomField) {
    const next = fields.filter((f) => f.id !== field.id);
    persist(next, `Kolom "${field.label}" dihapus.`);
  }

  const activeFields = fields.filter((f) => f.isActive);

  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title="Kustom data pelanggan"
        subtitle="Rancang kolom tambahan pada profil pelanggan sesuai kebutuhan outlet."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={() => persist(DEFAULT_CUSTOMER_CUSTOM_FIELDS, 'Daftar kolom dikembalikan ke bawaan.')}
            >
              <RotateCcw className="cg-icon cg-icon--sm" aria-hidden /> Reset bawaan
            </button>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setModal({ open: true })}
            >
              <Plus className="cg-icon" aria-hidden /> Tambah kolom
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau:</strong> definisi kolom kustom tersimpan di peramban sambil menunggu dukungan kolom JSON kustom pelanggan di server (docs/REQUESTS-FOR-CLAUDE.md). Kolom bernuansa PIN atau kata sandi dilarang otomatis demi keamanan.
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Pratinjau · Skema formulir</span>
      </div>

      {notice && (
        <p role="status" className="cg-banner cg-banner--info">
          {notice}
        </p>
      )}

      {fields.length === 0 ? (
        <div className="cg-empty">
          <ListPlus className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
          <p>
            <strong>Belum ada kolom kustom pelanggan.</strong>
          </p>
          <p className="text-text-muted text-sm">
            Tambahkan kolom tambahan seperti preferensi rasa, asal perusahaan, atau ukuran favorit.
          </p>
          <button
            type="button"
            className="cg-btn cg-btn--primary mt-8"
            onClick={() => setModal({ open: true })}
          >
            <Plus className="cg-icon" aria-hidden /> Tambah kolom pertama
          </button>
        </div>
      ) : (
        <div className="cg-data-wrap min-w-0">
          <table className="cg-data">
            <thead>
              <tr>
                <th>Nama kolom</th>
                <th>Tipe</th>
                <th>Aturan</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id}>
                  <td className="min-w-[180px] max-w-[260px]">
                    <div className="font-semibold break-words">{f.label}</div>
                    {f.fieldType === 'select' && f.options.length > 0 && (
                      <div className="text-xs text-text-muted break-words">
                        Opsi: {f.options.join(', ')}
                      </div>
                    )}
                    {f.fieldType !== 'select' && f.placeholder && (
                      <div className="text-xs text-text-muted break-words">
                        Contoh: {f.placeholder}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{CUSTOMER_FIELD_TYPE_LABELS[f.fieldType]}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-4">
                      <span className="cg-badge">{f.required ? 'Wajib diisi' : 'Opsional'}</span>
                      {f.showInReceipt && <span className="cg-badge cg-badge--info">Tampil di kasir</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`cg-badge ${f.isActive ? 'cg-badge--success' : ''}`}>
                      {f.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-4">
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        onClick={() => setModal({ open: true, editing: f })}
                        aria-label={`Ubah ${f.label}`}
                      >
                        <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        onClick={() => handleToggle(f)}
                      >
                        <Power className="cg-icon cg-icon--sm" aria-hidden />
                        {f.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm text-danger-strong"
                        onClick={() => handleDelete(f)}
                        aria-label={`Hapus ${f.label}`}
                      >
                        <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeFields.length > 0 && (
        <section className="border border-border rounded-xl bg-surface-raised p-16 space-y-12 max-w-[640px]">
          <div>
            <h2 className="text-base font-semibold">Pratinjau Tampilan di Formulir Pelanggan</h2>
            <p className="text-xs text-text-muted">
              Simulasi kolom aktif ({activeFields.length} kolom) yang nantinya tampil saat menambah atau mengubah pelanggan.
            </p>
          </div>
          <div className="grid gap-12 tablet:grid-cols-2">
            {activeFields.map((f) => (
              <div key={f.id} className="cg-field">
                <span className="cg-label">
                  {f.label} {f.required ? '*' : ''}
                </span>
                {f.fieldType === 'select' ? (
                  <select className="cg-select" disabled defaultValue="">
                    <option value="">Pilih {f.label.toLowerCase()}</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="cg-input"
                    type={f.fieldType === 'date' ? 'date' : f.fieldType === 'number' ? 'number' : 'text'}
                    placeholder={f.placeholder ?? ''}
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {modal.open && (
        <FieldModal
          editing={modal.editing}
          existing={fields}
          onClose={() => setModal({ open: false })}
          onSave={handleSaveField}
        />
      )}
    </div>
  );
}


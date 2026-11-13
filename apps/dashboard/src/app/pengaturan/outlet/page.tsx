'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Building2, CreditCard, ImagePlus, Plus, Store } from 'lucide-react';
import {
  outletInfoProblem,
  outletOptionsProblem,
  type ManagedOutlet,
  type OutletInfo,
  type OutletOptions,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

export default function BisnisDanOutlet() {
  const data = useData();
  const [activeTab, setActiveTab] = useState<'info' | 'bank' | 'multi'>('info');

  const state = useAsync(async () => {
    const [st, outlets, groups] = await Promise.all([
      data.getOutletSettings(),
      data.listOutlets(),
      data.listOutletGroups(),
    ]);
    return { st, outlets, groups };
  }, [data]);

  return (
    <>
      <PageHeader
        title="Bisnis dan outlet"
        subtitle="Identitas usaha, rekening pembayaran, dan pengelolaan multi-outlet"
      />

      <div className="cg-tabs mb-16" role="tablist" aria-label="Tab Pengaturan Outlet">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'info'}
          className="cg-tab"
          onClick={() => setActiveTab('info')}
        >
          <Building2 className="cg-icon cg-icon--sm" aria-hidden />
          Informasi Bisnis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'bank'}
          className="cg-tab"
          onClick={() => setActiveTab('bank')}
        >
          <CreditCard className="cg-icon cg-icon--sm" aria-hidden />
          Rekening Pembayaran
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'multi'}
          className="cg-tab"
          onClick={() => setActiveTab('multi')}
        >
          <Store className="cg-icon cg-icon--sm" aria-hidden />
          Daftar Outlet ({state.status === 'ready' ? state.data.outlets.length : '…'})
        </button>
      </div>

      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'loading' && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {activeTab === 'info' && (
            <InfoForm
              info={state.data.st.info}
              options={state.data.st.options}
              groups={state.data.groups}
              onSaved={state.reload}
            />
          )}

          {activeTab === 'bank' && (
            <BankForm
              info={state.data.st.info}
              onSaved={state.reload}
            />
          )}

          {activeTab === 'multi' && (
            <OutletListTab
              outlets={state.data.outlets}
              groups={state.data.groups}
              onReload={state.reload}
            />
          )}
        </>
      )}
    </>
  );
}

function InfoForm({
  info,
  options,
  groups,
  onSaved,
}: {
  info: OutletInfo;
  options: OutletOptions;
  groups: string[];
  onSaved: () => void;
}) {
  const data = useData();
  const [name, setName] = useState(info.name);
  const [address, setAddress] = useState(info.address);
  const [phone, setPhone] = useState(info.phone);
  const [email, setEmail] = useState(info.email ?? '');
  const [taxIdNumber, setTaxIdNumber] = useState(info.taxIdNumber ?? '');
  const [businessType, setBusinessType] = useState(info.businessType ?? '');
  const [outletGroup, setOutletGroup] = useState(info.outletGroup ?? '');
  const [logoUrl, setLogoUrl] = useState(info.logoUrl ?? '');
  const [footer, setFooter] = useState(options.receiptFooter);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ok) {
      const t = setTimeout(() => setOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [ok]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = outletInfoProblem({ name, address, phone });
    if (problem) return setErr(problem);
    const optsProblem = outletOptionsProblem({ ...options, receiptFooter: footer });
    if (optsProblem) return setErr(optsProblem);
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await data.saveOutletInfo({
        name,
        address,
        phone,
        email: email.trim() || undefined,
        taxIdNumber: taxIdNumber.trim() || undefined,
        businessType: businessType.trim() || undefined,
        outletGroup: outletGroup.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        bankName: info.bankName,
        bankAccountNumber: info.bankAccountNumber,
        bankAccountName: info.bankAccountName,
      });
      const cur = await data.getOutletSettings();
      await data.saveOutletOptions({ ...cur.options, receiptFooter: footer });
      setOk(true);
      onSaved();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-16 max-w-[640px]">
      <div className="cg-field">
        <label className="cg-label" htmlFor="o-nama">Nama outlet</label>
        <input
          id="o-nama"
          className="cg-input"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
        <div className="cg-field">
          <label className="cg-label" htmlFor="o-grup">Grup / Wilayah outlet</label>
          <input
            id="o-grup"
            className="cg-input"
            list="outlet-groups-list"
            placeholder="Mis. Jabodetabek, Surabaya..."
            value={outletGroup}
            onChange={(e) => setOutletGroup(e.target.value)}
          />
          <datalist id="outlet-groups-list">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <p className="text-xs text-text-muted">Kelompokkan laporan dan data per area bisnis.</p>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="o-bidang">Jenis usaha</label>
          <input
            id="o-bidang"
            className="cg-input"
            placeholder="Mis. Kafe, Restoran, Ritel, Salon..."
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
          />
        </div>
      </div>

      <div className="cg-field">
        <label className="cg-label" htmlFor="o-alamat">Alamat lengkap</label>
        <textarea
          id="o-alamat"
          className="cg-input"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
        <div className="cg-field">
          <label className="cg-label" htmlFor="o-telp">Nomor telepon / WhatsApp</label>
          <input
            id="o-telp"
            className="cg-input"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="o-email">Email bisnis</label>
          <input
            id="o-email"
            type="email"
            className="cg-input"
            placeholder="kontak@bisnis.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
        <div className="cg-field">
          <label className="cg-label" htmlFor="o-npwp">NPWP usaha</label>
          <input
            id="o-npwp"
            className="cg-input"
            placeholder="Nomor Pokok Wajib Pajak"
            value={taxIdNumber}
            onChange={(e) => setTaxIdNumber(e.target.value)}
          />
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="o-logo">URL Logo outlet (opsional)</label>
          <input
            id="o-logo"
            type="url"
            className="cg-input"
            placeholder="https://..."
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="cg-field">
        <label className="cg-label" htmlFor="o-footer">Catatan kaki struk</label>
        <textarea
          id="o-footer"
          className="cg-input"
          rows={2}
          maxLength={300}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          aria-describedby="o-footer-h"
        />
        <p id="o-footer-h" className="text-text-muted text-sm">
          Mis. ucapan terima kasih atau info Wi-Fi. {footer.length}/300
        </p>
      </div>

      <div className="border border-border rounded-md p-16 flex flex-col tablet:flex-row items-start tablet:items-center justify-between gap-12 bg-surface">
        <div>
          <h3 className="font-semibold text-sm">Tampilan Struk Pelanggan</h3>
          <p className="text-text-muted text-sm mt-[2px]">
            Atur ukuran huruf, bagian yang tampil, teks kepala/kaki, serta batasan cetak ulang struk.
          </p>
        </div>
        <Link href="/pengaturan/struk" className="cg-btn cg-btn--secondary whitespace-nowrap text-xs">
          Buka editor struk →
        </Link>
      </div>

      <dl className="grid gap-4 text-sm text-text-muted">
        <div className="flex gap-8">
          <dt>Kode outlet:</dt>
          <dd className="cg-num font-semibold">{info.code}</dd>
        </div>
        <div className="flex gap-8">
          <dt>Zona waktu:</dt>
          <dd>{info.timezone}</dd>
        </div>
      </dl>

      <p className="text-text-muted text-sm">
        Kode outlet dipakai di nomor pesanan. Informasi di atas hanya dapat diubah oleh pemilik atau admin.
      </p>

      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      {ok && <p role="status" className="cg-banner cg-banner--info">Tersimpan.</p>}

      <div>
        <button className="cg-btn cg-btn--primary" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan informasi'}
        </button>
      </div>
    </form>
  );
}

function BankForm({
  info,
  onSaved,
}: {
  info: OutletInfo;
  onSaved: () => void;
}) {
  const data = useData();
  const [bankName, setBankName] = useState(info.bankName ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(info.bankAccountNumber ?? '');
  const [bankAccountName, setBankAccountName] = useState(info.bankAccountName ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ok) {
      const t = setTimeout(() => setOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [ok]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await data.saveOutletInfo({
        name: info.name,
        address: info.address,
        phone: info.phone,
        email: info.email,
        taxIdNumber: info.taxIdNumber,
        businessType: info.businessType,
        outletGroup: info.outletGroup,
        logoUrl: info.logoUrl,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
      });
      setOk(true);
      onSaved();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan rekening.');
    } finally {
      setBusy(false);
    }
  }

  const POPULAR_BANKS = ['BCA', 'Mandiri', 'BRI', 'BNI', 'CIMB Niaga', 'Permata', 'BSI'];

  return (
    <form onSubmit={submit} noValidate className="grid gap-16 max-w-[640px]">
      <div className="p-12 rounded-lg bg-surface-raised border border-border text-sm text-text-muted">
        Rekening pembayaran ini dicantumkan sebagai tujuan transfer pelanggan dan acuan rekonsiliasi kas/bank outlet.
      </div>

      <div className="cg-field">
        <label className="cg-label" htmlFor="b-nama">Nama bank</label>
        <input
          id="b-nama"
          className="cg-input"
          list="bank-popular-list"
          placeholder="Misal: BCA, Mandiri, BRI"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
        />
        <datalist id="bank-popular-list">
          {POPULAR_BANKS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>

      <div className="cg-field">
        <label className="cg-label" htmlFor="b-nomor">Nomor rekening</label>
        <input
          id="b-nomor"
          className="cg-input cg-num"
          inputMode="numeric"
          placeholder="Nomor rekening tanpa spasi"
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value.replace(/[^\d]/g, ''))}
        />
      </div>

      <div className="cg-field">
        <label className="cg-label" htmlFor="b-pemilik">Nama pemilik rekening (atas nama)</label>
        <input
          id="b-pemilik"
          className="cg-input"
          placeholder="Nama sesuai buku tabungan"
          value={bankAccountName}
          onChange={(e) => setBankAccountName(e.target.value)}
        />
      </div>

      {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}
      {ok && <p role="status" className="cg-banner cg-banner--info">Rekening tersimpan.</p>}

      <div>
        <button className="cg-btn cg-btn--primary" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan rekening'}
        </button>
      </div>
    </form>
  );
}

function OutletListTab({
  outlets,
  groups,
  onReload,
}: {
  outlets: ManagedOutlet[];
  groups: string[];
  onReload: () => void;
}) {
  const [editingOutlet, setEditingOutlet] = useState<ManagedOutlet | 'new' | null>(null);

  return (
    <div className="grid gap-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <p className="text-sm text-text-muted">
          Kelola cabang dan grup operasional bisnis Anda.
        </p>
        <button
          type="button"
          className="cg-btn cg-btn--primary"
          onClick={() => setEditingOutlet('new')}
        >
          <Plus className="cg-icon" aria-hidden /> Tambah outlet
        </button>
      </div>

      <div className="cg-data-wrap">
        <table className="cg-data min-w-0">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Outlet</th>
              <th>Grup Wilayah</th>
              <th>Telepon</th>
              <th>Rekening Bank</th>
              <th>Status</th>
              <th><span className="cg-sr">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {outlets.map((o) => (
              <tr key={o.id}>
                <td className="cg-num font-semibold whitespace-nowrap">{o.code}</td>
                <td className="font-medium whitespace-nowrap">
                  {o.name}
                  {o.address && <span className="block text-xs text-text-muted truncate max-w-[240px]">{o.address}</span>}
                </td>
                <td className="whitespace-nowrap">
                  {o.outletGroup ? (
                    <span className="cg-badge cg-badge--info">{o.outletGroup}</span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="text-xs whitespace-nowrap">{o.phone ?? '—'}</td>
                <td className="text-xs whitespace-nowrap">
                  {o.bankName && o.bankAccountNumber ? (
                    `${o.bankName} ${o.bankAccountNumber}`
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {o.isActive ? (
                    <span className="cg-badge cg-badge--ok">Aktif</span>
                  ) : (
                    <span className="cg-badge">Nonaktif</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="cg-btn cg-btn--ghost cg-btn--sm"
                    onClick={() => setEditingOutlet(o)}
                  >
                    Ubah
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingOutlet && (
        <OutletModal
          outlet={editingOutlet === 'new' ? undefined : editingOutlet}
          groups={groups}
          onClose={() => setEditingOutlet(null)}
          onSaved={() => {
            setEditingOutlet(null);
            onReload();
          }}
        />
      )}
    </div>
  );
}

function OutletModal({
  outlet,
  groups,
  onClose,
  onSaved,
}: {
  outlet?: ManagedOutlet;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [name, setName] = useState(outlet?.name ?? '');
  const [code, setCode] = useState(outlet?.code ?? '');
  const [group, setGroup] = useState(outlet?.outletGroup ?? '');
  const [address, setAddress] = useState(outlet?.address ?? '');
  const [phone, setPhone] = useState(outlet?.phone ?? '');
  const [email, setEmail] = useState(outlet?.email ?? '');
  const [isActive, setIsActive] = useState(outlet?.isActive ?? true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Nama outlet wajib diisi.');
    setBusy(true);
    setErr('');
    try {
      await data.saveOutlet({
        id: outlet?.id,
        code: code.trim() || undefined,
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        outletGroup: group.trim() || undefined,
        isActive,
      });
      onSaved();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan outlet.');
      setBusy(false);
    }
  }

  return (
    <dialog {...d.props} aria-labelledby="modal-outlet-title" className="p-0 rounded-xl max-w-[500px] w-full">
      <form onSubmit={submit} className="grid gap-16 p-20" noValidate>
        <h3 id="modal-outlet-title" className="text-base font-bold">
          {outlet ? 'Ubah Outlet' : 'Tambah Outlet Baru'}
        </h3>

        <div className="grid grid-cols-3 gap-12">
          <div className="cg-field col-span-2">
            <label className="cg-label" htmlFor="m-o-nama">Nama outlet</label>
            <input
              id="m-o-nama"
              className="cg-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="cg-field col-span-1">
            <label className="cg-label" htmlFor="m-o-kode">Kode</label>
            <input
              id="m-o-kode"
              className="cg-input cg-num uppercase"
              maxLength={6}
              placeholder="Oto"
              disabled={Boolean(outlet)}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="m-o-grup">Grup Wilayah</label>
          <input
            id="m-o-grup"
            className="cg-input"
            list="m-groups-list"
            placeholder="Misal: Jabodetabek, Surabaya"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
          <datalist id="m-groups-list">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="m-o-alamat">Alamat</label>
          <input
            id="m-o-alamat"
            className="cg-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-12">
          <div className="cg-field">
            <label className="cg-label" htmlFor="m-o-telp">Telepon</label>
            <input
              id="m-o-telp"
              className="cg-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="m-o-email">Email</label>
            <input
              id="m-o-email"
              type="email"
              className="cg-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {outlet && (
          <label className="flex items-center gap-8 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Outlet aktif dan menerima transaksi
          </label>
        )}

        {err && <p role="alert" className="cg-banner cg-banner--danger">{err}</p>}

        <div className="flex justify-end gap-8 mt-8">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan outlet'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

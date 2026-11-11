'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  assignCustomerToGroup,
  countGroupMembers,
  newId,
  type Customer,
  type CustomerGroup,
  type CustomerGroupMember,
} from '@cgpos/shared';
import { Pencil, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import {
  formatJakartaDateTime,
  loadCustomerGroups,
  loadGroupMembers,
  saveCustomerGroups,
  saveGroupMembers,
} from '@/lib/pricing-preview';

function GroupEditorDialog({
  initial,
  existingNames,
  onSave,
  onClose,
}: {
  initial: CustomerGroup | null;
  existingNames: string[];
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nama grup wajib diisi.');
      return;
    }
    const lower = trimmed.toLowerCase();
    const dup = existingNames.some(
      (n) => n.toLowerCase() === lower && lower !== (initial?.name ?? '').toLowerCase(),
    );
    if (dup) {
      setError('Nama grup sudah digunakan.');
      return;
    }
    onSave(trimmed, description.trim());
    onClose();
  };

  return (
    <dialog {...dialog.props} aria-labelledby="dlg-group-title">
      <form onSubmit={handleSubmit} className="grid gap-16">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="dlg-group-title" className="text-lg font-bold">
              {initial ? 'Ubah grup pelanggan' : 'Tambah grup pelanggan'}
            </h2>
            <p className="text-sm text-text-muted mt-4">
              Gunakan grup untuk membedakan segmen seperti Member, Reseller, atau Karyawan.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        {error && (
          <p role="alert" className="cg-banner cg-banner--danger">
            {error}
          </p>
        )}

        <div className="cg-field">
          <label htmlFor="grp-name" className="cg-label">
            Nama grup *
          </label>
          <input
            id="grp-name"
            className="cg-input"
            maxLength={80}
            placeholder="Contoh: Reseller Grosir Utama"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            autoFocus
          />
        </div>

        <div className="cg-field">
          <label htmlFor="grp-desc" className="cg-label">
            Keterangan singkat
          </label>
          <textarea
            id="grp-desc"
            className="cg-input min-h-[84px] py-8"
            maxLength={200}
            placeholder="Catatan tujuan grup atau kriteria anggota"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan grup
          </button>
        </div>
      </form>
    </dialog>
  );
}

function GroupMembersDialog({
  group,
  groups,
  customers,
  members,
  onToggleMember,
  onClose,
}: {
  group: CustomerGroup;
  groups: CustomerGroup[];
  customers: Customer[];
  members: CustomerGroupMember[];
  onToggleMember: (customerId: string, assign: boolean) => void;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const [search, setSearch] = useState('');

  const groupNameMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );
  const memberByCustomer = useMemo(
    () => new Map(members.map((m) => [m.customerId, m.groupId])),
    [members],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.code ?? '').toLowerCase().includes(q),
    );
  }, [customers, search]);

  const currentCount = useMemo(
    () => members.filter((m) => m.groupId === group.id).length,
    [members, group.id],
  );

  return (
    <dialog
      {...dialog.props}
      style={{ ...dialog.props.style, width: 'min(720px, calc(100vw - 16px))' }}
      aria-labelledby="dlg-members-title"
    >
      <div className="grid gap-16">
        <div className="flex items-start justify-between gap-12">
          <div className="min-w-0">
            <h2 id="dlg-members-title" className="text-lg font-bold break-words">
              Kelola anggota: {group.name}
            </h2>
            <p className="text-sm text-text-muted mt-4">
              Setiap pelanggan hanya dapat masuk ke satu grup. Memilih pelanggan dari grup lain akan memindahkannya ke grup ini.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-12">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              className="cg-input pl-40"
              placeholder="Cari nama, telepon, atau kode pelanggan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="cg-badge cg-badge--accent">{currentCount} anggota aktif</span>
        </div>

        {customers.length === 0 ? (
          <div className="cg-empty">
            <p className="font-semibold">Belum ada pelanggan terdaftar</p>
            <p className="text-sm text-text-muted mt-4">
              Tambahkan pelanggan terlebih dahulu di menu Daftar pelanggan agar bisa dimasukkan ke grup.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cg-empty">
            <p className="font-semibold">Pelanggan tidak ditemukan</p>
            <p className="text-sm text-text-muted mt-4">Coba kata kunci pencarian lain.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Grup saat ini</th>
                  <th className="text-right">Status di grup ini</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const assignedGroupId = memberByCustomer.get(c.id);
                  const isInThis = assignedGroupId === group.id;
                  const otherName =
                    assignedGroupId && !isInThis
                      ? groupNameMap.get(assignedGroupId) ?? 'Grup lain'
                      : null;

                  return (
                    <tr key={c.id}>
                      <td className="max-w-[220px]">
                        <div className="font-medium break-words">{c.name}</div>
                        <div className="text-xs text-text-muted">
                          {c.phone || c.code || 'Tanpa nomor telepon'}
                        </div>
                      </td>
                      <td>
                        {isInThis ? (
                          <span className="cg-badge cg-badge--success">{group.name}</span>
                        ) : otherName ? (
                          <span className="cg-badge cg-badge--warning">Pindah dari: {otherName}</span>
                        ) : (
                          <span className="text-xs text-text-muted">Belum masuk grup</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          type="button"
                          className={
                            isInThis
                              ? 'cg-btn cg-btn--secondary cg-btn--sm'
                              : 'cg-btn cg-btn--primary cg-btn--sm'
                          }
                          onClick={() => onToggleMember(c.id, !isInThis)}
                        >
                          {isInThis ? 'Keluarkan' : otherName ? 'Pindahkan ke sini' : 'Masukkan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--primary" onClick={onClose}>
            Selesai
          </button>
        </div>
      </div>
    </dialog>
  );
}

function DeleteGroupDialog({
  group,
  memberCount,
  onConfirm,
  onClose,
}: {
  group: CustomerGroup;
  memberCount: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  return (
    <dialog {...dialog.props} aria-labelledby="dlg-del-group">
      <div className="grid gap-16">
        <h2 id="dlg-del-group" className="text-lg font-bold">
          Hapus grup pelanggan?
        </h2>
        <p className="text-sm text-text">
          Grup <strong>{group.name}</strong> akan dihapus
          {memberCount > 0
            ? ` dan ${memberCount} pelanggan di dalamnya akan kembali menjadi tanpa grup`
            : ''}
          . Lanjutkan?
        </p>
        <div className="flex justify-end gap-8">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="cg-btn cg-btn--danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Hapus grup
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function CustomerGroupsPage() {
  const data = useData();
  const customersRes = useAsync(() => data.listCustomers({ limit: 500 }), [data]);

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [members, setMembers] = useState<CustomerGroupMember[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null | 'new'>(null);
  const [managingMembersFor, setManagingMembersFor] = useState<CustomerGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<CustomerGroup | null>(null);

  useEffect(() => {
    setGroups(loadCustomerGroups());
    setMembers(loadGroupMembers());
    setHydrated(true);
  }, []);

  const persistGroups = (next: CustomerGroup[]) => {
    setGroups(next);
    saveCustomerGroups(next);
  };

  const persistMembers = (next: CustomerGroupMember[]) => {
    setMembers(next);
    saveGroupMembers(next);
  };

  const customers = useMemo(
    () => (customersRes.status === 'ready' ? customersRes.data : []),
    [customersRes],
  );

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const memberCounts = useMemo(() => countGroupMembers(members), [members]);

  const membersPreviewByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      const cust = customerMap.get(m.customerId);
      if (!cust) continue;
      const list = map.get(m.groupId) ?? [];
      list.push(cust.name);
      map.set(m.groupId, list);
    }
    return map;
  }, [members, customerMap]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q),
    );
  }, [groups, search]);

  const assignedCount = members.filter((m) => groups.some((g) => g.id === m.groupId)).length;
  const unassignedCount = Math.max(0, customers.length - assignedCount);

  const handleSaveGroup = (name: string, description: string) => {
    if (editingGroup && editingGroup !== 'new') {
      const next = groups.map((g) =>
        g.id === editingGroup.id ? { ...g, name, description: description || undefined } : g,
      );
      persistGroups(next);
      setNotice(`Grup "${name}" berhasil diperbarui.`);
    } else {
      const created: CustomerGroup = {
        id: newId(),
        name,
        description: description || undefined,
        createdAt: new Date().toISOString(),
      };
      persistGroups([created, ...groups]);
      setNotice(`Grup "${name}" berhasil ditambahkan.`);
    }
  };

  const handleDeleteGroup = (group: CustomerGroup) => {
    persistGroups(groups.filter((g) => g.id !== group.id));
    persistMembers(members.filter((m) => m.groupId !== group.id));
    setNotice(`Grup "${group.name}" dihapus.`);
  };

  const handleToggleMember = (groupId: string, customerId: string, assign: boolean) => {
    const next = assignCustomerToGroup(
      members,
      customerId,
      assign ? groupId : null,
      new Date().toISOString(),
    );
    persistMembers(next);
  };

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Grup pelanggan"
        subtitle="Kelompokkan pelanggan ke dalam segmen (misalnya Member, Reseller, Karyawan) untuk pengaturan harga khusus."
        helpText="Buat grup pelanggan, tetapkan anggota, lalu atur harga grosir bertingkat per grup pada menu Grup harga spesial."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/pelanggan/harga-spesial" className="cg-btn cg-btn--secondary">
              Atur harga spesial
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              onClick={() => setEditingGroup('new')}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              Tambah grup
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--warning">
        <p className="font-semibold">Pratinjau — belum tersambung server</p>
        <p className="text-sm mt-4">
          Data grup pelanggan dan keanggotaan disimpan sementara di penyimpanan lokal peramban sambil menunggu tabel
          <code> customer_groups </code> dan <code> customer_group_members </code> serta sinkronisasi ke kasir oleh server.
        </p>
      </div>

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

      {customersRes.status === 'error' && (
        <div role="alert" className="cg-banner cg-banner--danger flex flex-wrap items-center justify-between gap-12">
          <span>Gagal memuat daftar pelanggan: {customersRes.message}</span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={customersRes.reload}
          >
            Muat ulang
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Total Grup</div>
          <div className="text-2xl font-bold mt-4">{hydrated ? groups.length : '—'}</div>
        </div>
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Pelanggan Tergabung</div>
          <div className="text-2xl font-bold mt-4 text-accent-strong">
            {hydrated ? assignedCount : '—'}
          </div>
        </div>
        <div className="cg-card">
          <div className="text-xs font-semibold text-text-muted uppercase">Belum Masuk Grup</div>
          <div className="text-2xl font-bold mt-4">
            {customersRes.status === 'ready' ? unassignedCount : '—'}
          </div>
        </div>
      </div>

      <div className="cg-card grid gap-16 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <div className="relative flex-1 min-w-[220px] max-w-[380px]">
            <Search
              className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              className="cg-input pl-40"
              placeholder="Cari nama atau keterangan grup..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-sm text-text-muted">
            Menampilkan {visibleGroups.length} dari {groups.length} grup
          </div>
        </div>

        {!hydrated || customersRes.status === 'loading' ? (
          <div className="grid gap-8" aria-busy="true" aria-label="Memuat daftar grup pelanggan">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[52px]" />
            ))}
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="cg-empty">
            <Users className="cg-icon cg-icon--lg mx-auto text-text-muted mb-8" aria-hidden />
            <p className="font-semibold">
              {groups.length === 0 ? 'Belum ada grup pelanggan' : 'Tidak ada grup yang cocok'}
            </p>
            <p className="text-sm text-text-muted mt-4">
              {groups.length === 0
                ? 'Tambahkan grup pertama seperti Member, Reseller, atau Karyawan untuk mengelompokkan pelanggan.'
                : 'Coba ubah kata kunci pencarian Anda.'}
            </p>
            {groups.length === 0 && (
              <button
                type="button"
                className="cg-btn cg-btn--primary mt-12"
                onClick={() => setEditingGroup('new')}
              >
                <Plus className="cg-icon cg-icon--sm" aria-hidden />
                Tambah grup pertama
              </button>
            )}
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Nama grup</th>
                  <th>Anggota</th>
                  <th>Dibuat</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const count = memberCounts[g.id] ?? 0;
                  const names = membersPreviewByGroup.get(g.id) ?? [];
                  const preview =
                    names.length === 0
                      ? 'Belum ada anggota ditetapkan'
                      : names.length <= 2
                        ? names.join(', ')
                        : `${names.slice(0, 2).join(', ')}, +${names.length - 2} lainnya`;
                  return (
                    <tr key={g.id}>
                      <td className="max-w-[280px]">
                        <div className="font-semibold break-words">{g.name}</div>
                        {g.description && (
                          <div className="text-xs text-text-muted break-words mt-4">
                            {g.description}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[260px]">
                        <div className="flex items-center gap-8">
                          <span className="cg-badge cg-badge--accent">{count} anggota</span>
                        </div>
                        <div className="text-xs text-text-muted truncate mt-4">{preview}</div>
                      </td>
                      <td className="whitespace-nowrap text-sm text-text-muted">
                        {formatJakartaDateTime(g.createdAt)}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-8">
                          <button
                            type="button"
                            className="cg-btn cg-btn--secondary cg-btn--sm"
                            onClick={() => setManagingMembersFor(g)}
                          >
                            <UserPlus className="cg-icon cg-icon--sm" aria-hidden />
                            Kelola anggota
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm"
                            aria-label={`Ubah grup ${g.name}`}
                            onClick={() => setEditingGroup(g)}
                          >
                            <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                            Ubah
                          </button>
                          <button
                            type="button"
                            className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                            aria-label={`Hapus grup ${g.name}`}
                            onClick={() => setDeletingGroup(g)}
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

      {editingGroup !== null && (
        <GroupEditorDialog
          initial={editingGroup === 'new' ? null : editingGroup}
          existingNames={groups.map((g) => g.name)}
          onSave={handleSaveGroup}
          onClose={() => setEditingGroup(null)}
        />
      )}

      {managingMembersFor && (
        <GroupMembersDialog
          group={managingMembersFor}
          groups={groups}
          customers={customers}
          members={members}
          onToggleMember={(customerId, assign) =>
            handleToggleMember(managingMembersFor.id, customerId, assign)
          }
          onClose={() => setManagingMembersFor(null)}
        />
      )}

      {deletingGroup && (
        <DeleteGroupDialog
          group={deletingGroup}
          memberCount={memberCounts[deletingGroup.id] ?? 0}
          onConfirm={() => handleDeleteGroup(deletingGroup)}
          onClose={() => setDeletingGroup(null)}
        />
      )}
    </div>
  );
}

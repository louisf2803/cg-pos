import { describe, expect, it } from 'vitest';
import { createFakeData, customerMatches, customerProblem, newId, normalizePhone, searchTerm } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };

describe('pelanggan: aturan data', () => {
  it('nomor telepon dinormalkan', () => {
    expect(normalizePhone(' 0812-3456 789 ')).toBe('08123456789');
    expect(normalizePhone('+62 812 3456 789')).toBe('+628123456789');
  });
  it('pengecekan nama, telepon, email, tanggal lahir', () => {
    expect(customerProblem({ name: '  ' })).toMatch(/Nama/);
    expect(customerProblem({ name: 'x'.repeat(81) })).toMatch(/80/);
    expect(customerProblem({ name: 'A', phone: '123' })).toMatch(/8 sampai 15/);
    expect(customerProblem({ name: 'A', phone: '0812-3456-7890' })).toBeNull();
    expect(customerProblem({ name: 'A', email: 'bukan-email' })).toMatch(/email/i);
    expect(customerProblem({ name: 'A', birthDate: '2999-01-01' }, '2026-11-09')).toMatch(/masuk akal/);
    expect(customerProblem({ name: 'A', birthDate: '1990-13-45' })).toMatch(/tidak valid/);
    expect(customerProblem({ name: 'A', birthDate: '1990-05-17' })).toBeNull();
  });
  it('pencarian: nama, kode, nomor tanpa tanda baca', () => {
    const c = { name: 'Bu Ani Wijaya', phone: '081234567802', code: 'C-007' };
    expect(customerMatches(c, 'ani')).toBe(true);
    expect(customerMatches(c, 'c-007')).toBe(true);
    expect(customerMatches(c, '0812-3456')).toBe(true);
    expect(customerMatches(c, '99')).toBe(false);
    expect(customerMatches(c, '')).toBe(true);
    expect(searchTerm('a,b(c)%*')).toBe('a b c');
  });
});

describe('pelanggan: data palsu', () => {
  it('tambah, ubah, cari, nomor ganda ditolak, hapus lembut', async () => {
    const d = mk();
    const base = (await d.listCustomers()).length;
    const c = await d.saveCustomer({ name: ' Mas Rudi ', phone: '0856-1111-2222' });
    expect(c).toMatchObject({ name: 'Mas Rudi', phone: '085611112222', pointsBalance: 0 });
    await expect(d.saveCustomer({ name: 'Orang Lain', phone: '085611112222' })).rejects.toThrow(/sudah dipakai pelanggan Mas Rudi/);
    const u = await d.saveCustomer({ id: c.id, name: 'Mas Rudi S', phone: '085611112222', email: 'rudi@example.com' });
    expect(u.email).toBe('rudi@example.com');   // nomor sendiri tidak dianggap ganda
    expect((await d.listCustomers({ search: 'rudi' })).map((x) => x.id)).toEqual([c.id]);
    expect((await d.listCustomers({ search: '5611112' }))[0]?.id).toBe(c.id);
    await d.deleteCustomer(c.id);
    expect(await d.getCustomer(c.id)).toBeNull();
    expect((await d.listCustomers()).length).toBe(base);
    await expect(d.deleteCustomer(c.id)).rejects.toThrow(/tidak ditemukan/);
    await expect(d.saveCustomer({ id: 'nope', name: 'X' })).rejects.toThrow(/tidak ditemukan/);
  });

  it('pesanan membawa pelanggan; tetap terbaca setelah pelanggan dihapus; filter riwayat; pindah meja tidak melepasnya', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const item = () => [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }];
    const a = await d.saveOrder({ id: newId(), type: 'dine_in', tableId: 't-T1', customerId: 'cu-ani', items: item() }, 'e-sari');
    expect(a).toMatchObject({ customerId: 'cu-ani', customerName: 'Bu Ani' });
    const b = await d.saveOrder({ id: newId(), type: 'takeaway', items: item() }, 'e-sari');
    expect(b.customerId).toBeUndefined();
    expect((await d.listOrders({ customerId: 'cu-ani' })).map((o) => o.id)).toEqual([a.id]);
    await expect(d.saveOrder({ id: newId(), type: 'takeaway', customerId: 'nope', items: item() }, 'e-sari')).rejects.toThrow(/Pelanggan tidak ditemukan/);
    const moved = await d.moveOrderTable(a.id, 't-T5');
    expect(moved.customerName).toBe('Bu Ani');
    const merged = await d.mergeOrders({ intoId: b.id, fromId: a.id, authorizedBy: 'e-budi' }).catch((e: Error) => e);
    expect(merged instanceof Error).toBe(true);        // b bukan pesanan meja: ditolak
    await d.saveCustomer({ id: 'cu-ani', name: 'Bu Ani Wijaya' });
    expect((await d.getOrder(a.id))!.customerName).toBe('Bu Ani Wijaya');
    await d.deleteCustomer('cu-ani');
    expect((await d.getOrder(a.id))!.customerName).toBe('Bu Ani Wijaya');
  });
});

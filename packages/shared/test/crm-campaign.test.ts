import { describe, expect, it } from 'vitest';
import type { Customer } from '../src/types';
import { campaignAudience, campaignError, campaignProblem, createFakeCampaigns, describeCriteria } from '../src/crm-campaign';

const cust = (id: string, extra: Partial<Customer> = {}): Customer => ({ id, name: `Pelanggan ${id}`, pointsBalance: 0, createdAt: '2026-01-01T00:00:00Z', ...extra });
const customers = [
  cust('a', { birthDate: '1990-11-05', pointsBalance: 120, city: 'Makassar', phone: '0811' }),
  cust('b', { birthDate: '1991-03-10', pointsBalance: 10, city: 'Jakarta' }),
  cust('c', { birthDate: '1985-11-30', pointsBalance: 500, city: 'makassar ', phone: '0822' }),
];
const mk = () => createFakeCampaigns({ customers: async () => customers, now: () => '2026-11-13T00:00:00Z' });

describe('sasaran kampanye', () => {
  it('menyaring menurut kriteria yang diisi', () => {
    expect(campaignAudience(customers, {}, '2026-11-13').map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(campaignAudience(customers, { birthdayMonth: true }, '2026-11-13').map((c) => c.id)).toEqual(['a', 'c']);
    expect(campaignAudience(customers, { minPoints: 200 }, '2026-11-13').map((c) => c.id)).toEqual(['c']);
    expect(campaignAudience(customers, { city: 'MAKASSAR' }, '2026-11-13').map((c) => c.id)).toEqual(['a', 'c']);
    expect(campaignAudience(customers, { hasPhone: true, birthdayMonth: true, minPoints: 100 }, '2026-11-13').map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('deskripsi kriteria', () => {
    expect(describeCriteria({})).toBe('Semua pelanggan');
    expect(describeCriteria({ birthdayMonth: true, minPoints: 50 })).toBe('berulang tahun bulan ini, poin minimal 50');
  });
  it('validasi dan terjemahan galat', () => {
    const base = { id: 'k', name: 'Promo', criteria: {} };
    expect(campaignProblem(base)).toBeNull();
    expect(campaignProblem({ ...base, name: ' ' })).toMatch(/Nama/);
    expect(campaignProblem({ ...base, startsOn: '2026-12-01', endsOn: '2026-11-01' })).toMatch(/selesai/);
    expect(campaignProblem({ ...base, criteria: { minPoints: -1 } })).toMatch(/Poin/);
    expect(campaignError({ message: 'no recipients' }).message).toMatch(/cocok/);
  });
});

describe('alur kampanye (demo)', () => {
  it('draf -> berjalan (penerima dibekukan) -> tandai dihubungi -> selesai', async () => {
    const s = mk();
    await s.saveCampaign({ id: 'k1', name: 'Ulang tahun', criteria: { birthdayMonth: true } });
    await s.launchCampaign('k1', ['a', 'c', 'tidak-ada']);
    let c = (await s.listCampaigns())[0]!;
    expect(c).toMatchObject({ status: 'active', recipients: 2, contacted: 0 });
    await s.markCampaignContact('k1', 'a', true);
    c = (await s.listCampaigns())[0]!;
    expect(c.contacted).toBe(1);
    expect((await s.listCampaignRecipients('k1')).find((r) => r.customerId === 'a')).toMatchObject({ contacted: true, phone: '0811' });
    await expect(s.markCampaignContact('k1', 'b', true)).rejects.toThrow(/bukan penerima/);
    await s.endCampaign('k1');
    expect((await s.listCampaigns())[0]!.status).toBe('ended');
    await expect(s.markCampaignContact('k1', 'a', false)).rejects.toThrow(/belum berjalan atau sudah selesai/);
  });
  it('hanya draf yang bisa diubah dan dihapus; tanpa penerima ditolak', async () => {
    const s = mk();
    await s.saveCampaign({ id: 'k1', name: 'A', criteria: {} });
    await s.saveCampaign({ id: 'k1', name: 'A2', criteria: {} });
    expect((await s.listCampaigns())[0]!.name).toBe('A2');
    await expect(s.launchCampaign('k1', ['x'])).rejects.toThrow(/cocok/);
    await s.launchCampaign('k1', ['a']);
    await expect(s.saveCampaign({ id: 'k1', name: 'A3', criteria: {} })).rejects.toThrow(/draf/);
    await expect(s.deleteCampaign('k1')).rejects.toThrow(/draf/);
    await s.saveCampaign({ id: 'k2', name: 'B', criteria: {} });
    await s.deleteCampaign('k2');
    expect(await s.listCampaigns()).toHaveLength(1);
  });
});

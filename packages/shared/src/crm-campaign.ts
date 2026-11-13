// Kampanye CRM tanpa kirim pesan (A132; migrasi 0132): daftar kampanye, sasaran pelanggan, dan hasil (sudah dihubungi) di aplikasi.
import type { Customer } from './types';
import { DataError } from './types';

export type CampaignStatus = 'draft' | 'active' | 'ended';
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = { draft: 'Draf', active: 'Berjalan', ended: 'Selesai' };

export interface CampaignCriteria {
  /** hanya pelanggan yang berulang tahun pada bulan hari ini */
  birthdayMonth?: boolean;
  /** saldo poin minimal */
  minPoints?: number;
  /** kota persis sama (tanpa membedakan huruf besar kecil) */
  city?: string;
  /** hanya yang punya nomor telepon */
  hasPhone?: boolean;
}

export interface CampaignInput { id: string; name: string; message?: string; startsOn?: string; endsOn?: string; criteria: CampaignCriteria }
export interface Campaign {
  id: string; name: string; message?: string; startsOn?: string; endsOn?: string; criteria: CampaignCriteria; status: CampaignStatus;
  recipients: number; contacted: number; launchedAt?: string;
}
export interface CampaignRecipient { customerId: string; customerName: string; phone?: string; contacted: boolean }

export function campaignProblem(i: CampaignInput): string | null {
  if (!i.name.trim() || i.name.trim().length > 80) return 'Nama kampanye wajib diisi (maksimal 80 huruf).';
  if ((i.message ?? '').length > 500) return 'Naskah pesan maksimal 500 huruf.';
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if ((i.startsOn && !ymd.test(i.startsOn)) || (i.endsOn && !ymd.test(i.endsOn))) return 'Tanggal tidak valid.';
  if (i.startsOn && i.endsOn && i.endsOn < i.startsOn) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  if (i.criteria.minPoints !== undefined && (!Number.isInteger(i.criteria.minPoints) || i.criteria.minPoints < 0)) return 'Poin minimal harus bilangan bulat, tidak negatif.';
  return null;
}

/** Pelanggan yang cocok dengan semua kriteria yang diisi. today = YYYY-MM-DD (tanggal lokal outlet). */
export function campaignAudience(customers: Customer[], c: CampaignCriteria, today: string): Customer[] {
  const month = today.slice(5, 7);
  const city = c.city?.trim().toLowerCase();
  return customers.filter((x) => {
    if (c.birthdayMonth && x.birthDate?.slice(5, 7) !== month) return false;
    if (c.minPoints !== undefined && c.minPoints > 0 && x.pointsBalance < c.minPoints) return false;
    if (city && (x.city ?? '').trim().toLowerCase() !== city) return false;
    if (c.hasPhone && !(x.phone ?? '').trim()) return false;
    return true;
  });
}

export function describeCriteria(c: CampaignCriteria): string {
  const parts: string[] = [];
  if (c.birthdayMonth) parts.push('berulang tahun bulan ini');
  if (c.minPoints) parts.push(`poin minimal ${c.minPoints}`);
  if (c.city?.trim()) parts.push(`kota ${c.city.trim()}`);
  if (c.hasPhone) parts.push('punya nomor telepon');
  return parts.length === 0 ? 'Semua pelanggan' : parts.join(', ');
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengelola kampanye.',
  'name required': 'Nama kampanye wajib diisi.',
  'invalid period': 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
  'invalid criteria': 'Kriteria sasaran tidak valid.',
  'campaign not found': 'Kampanye tidak ditemukan.',
  'campaign not draft': 'Hanya kampanye draf yang bisa diubah atau dihapus.',
  'campaign not active': 'Kampanye belum berjalan atau sudah selesai.',
  'no recipients': 'Belum ada pelanggan yang cocok dengan sasaran ini.',
  'too many recipients': 'Penerima terlalu banyak (maksimal 20.000).',
  'recipient not found': 'Pelanggan itu bukan penerima kampanye ini.',
};
export function campaignError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal memproses kampanye.'));
}

/** Penyimpanan palsu untuk mode demo; aturan status sama dengan fungsi server. */
export function createFakeCampaigns(deps: { customers: () => Promise<Customer[]>; now: () => string }) {
  interface Rec { campaign: Campaign; recipients: Map<string, boolean> }
  const store = new Map<string, Rec>();
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const get = (id: string) => { const r = store.get(id); if (!r) throw new DataError('not_found', SERVER_MESSAGES['campaign not found']!); return r; };
  const sync = (r: Rec) => { r.campaign.recipients = r.recipients.size; r.campaign.contacted = [...r.recipients.values()].filter(Boolean).length; };
  return {
    async listCampaigns(): Promise<Campaign[]> { return clone([...store.values()].map((r) => r.campaign).reverse()); },
    async listCampaignRecipients(id: string): Promise<CampaignRecipient[]> {
      const r = get(id);
      const customers = await deps.customers();
      return [...r.recipients].map(([customerId, contacted]) => {
        const c = customers.find((x) => x.id === customerId);
        return { customerId, customerName: c?.name ?? '(pelanggan dihapus)', ...(c?.phone ? { phone: c.phone } : {}), contacted };
      });
    },
    async saveCampaign(input: CampaignInput): Promise<void> {
      const problem = campaignProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const cur = store.get(input.id);
      if (cur && cur.campaign.status !== 'draft') throw new DataError('invalid', SERVER_MESSAGES['campaign not draft']!);
      const campaign: Campaign = {
        id: input.id, name: input.name.trim(), criteria: input.criteria, status: 'draft', recipients: 0, contacted: 0,
        ...(input.message?.trim() ? { message: input.message.trim() } : {}), ...(input.startsOn ? { startsOn: input.startsOn } : {}), ...(input.endsOn ? { endsOn: input.endsOn } : {}),
      };
      store.set(input.id, { campaign, recipients: new Map() });
    },
    async launchCampaign(id: string, customerIds: string[]): Promise<void> {
      const r = get(id);
      if (r.campaign.status === 'active') return;
      if (r.campaign.status !== 'draft') throw new DataError('invalid', SERVER_MESSAGES['campaign not draft']!);
      const known = new Set((await deps.customers()).map((c) => c.id));
      for (const cid of customerIds) if (known.has(cid)) r.recipients.set(cid, false);
      if (r.recipients.size === 0) throw new DataError('invalid', SERVER_MESSAGES['no recipients']!);
      r.campaign.status = 'active'; r.campaign.launchedAt = deps.now(); sync(r);
    },
    async markCampaignContact(id: string, customerId: string, contacted: boolean): Promise<void> {
      const r = get(id);
      if (r.campaign.status !== 'active') throw new DataError('invalid', SERVER_MESSAGES['campaign not active']!);
      if (!r.recipients.has(customerId)) throw new DataError('invalid', SERVER_MESSAGES['recipient not found']!);
      r.recipients.set(customerId, contacted); sync(r);
    },
    async endCampaign(id: string): Promise<void> {
      const r = get(id);
      if (r.campaign.status === 'ended') return;
      if (r.campaign.status !== 'active') throw new DataError('invalid', SERVER_MESSAGES['campaign not active']!);
      r.campaign.status = 'ended';
    },
    async deleteCampaign(id: string): Promise<void> {
      const r = store.get(id);
      if (!r) return;
      if (r.campaign.status !== 'draft') throw new DataError('invalid', SERVER_MESSAGES['campaign not draft']!);
      store.delete(id);
    },
  };
}

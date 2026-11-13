// Dokumen penjualan berantai (A130; migrasi 0130): penawaran -> pesanan -> pengiriman -> penerimaan -> faktur (A129).
import { DataError } from './types';

export type SalesDocType = 'quote' | 'order' | 'delivery' | 'receipt';
export type SalesDocStatus = 'open' | 'converted' | 'cancelled';

export const SALES_DOC_LABEL: Record<SalesDocType, string> = { quote: 'Penawaran', order: 'Pesanan', delivery: 'Pengiriman', receipt: 'Penerimaan' };
export const SALES_DOC_PLURAL: Record<SalesDocType, string> = { quote: 'penawaran', order: 'pesanan', delivery: 'pengiriman', receipt: 'penerimaan' };
export const SALES_DOC_STATUS_LABEL: Record<SalesDocStatus, string> = { open: 'Terbuka', converted: 'Sudah dilanjutkan', cancelled: 'Dibatalkan' };
/** Dokumen turunan berikutnya; penerimaan berlanjut ke faktur (A129). */
export const NEXT_SALES_DOC: Record<SalesDocType, SalesDocType | 'invoice'> = { quote: 'order', order: 'delivery', delivery: 'receipt', receipt: 'invoice' };
/** Dokumen yang boleh langsung dijadikan faktur (pesanan tanpa pengiriman, atau penerimaan). */
export const CAN_INVOICE: SalesDocType[] = ['order', 'receipt'];

export interface SalesDocLineInput { name: string; qty: number; unitPrice: number }
export interface SalesDocLine extends SalesDocLineInput { id: string; lineTotal: number }
export interface SalesDocumentInput {
  id: string; type: SalesDocType; customerId?: string; date?: string; note?: string;
  /** diisi = turunan dari dokumen ini (baris disalin bila lines kosong) */
  parentId?: string; lines?: SalesDocLineInput[];
}
export interface SalesDocument {
  id: string; type: SalesDocType; number: string; customerId?: string; customerName: string; parentId?: string; invoiceId?: string;
  date: string; note?: string; status: SalesDocStatus; total: number; lines: SalesDocLine[];
}

export function salesDocumentProblem(i: SalesDocumentInput): string | null {
  if (!i.parentId) {
    if (i.type !== 'quote' && i.type !== 'order') return `${SALES_DOC_LABEL[i.type]} dibuat dari dokumen sebelumnya.`;
    if (!i.lines || i.lines.length === 0) return 'Dokumen butuh minimal satu baris barang atau jasa.';
  }
  for (const l of i.lines ?? []) {
    if (!l.name.trim() || l.name.trim().length > 120) return 'Nama tiap baris wajib diisi (maksimal 120 huruf).';
    if (!(l.qty > 0) || !Number.isFinite(l.qty)) return 'Jumlah tiap baris harus lebih dari nol.';
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) return 'Harga satuan harus bilangan bulat rupiah, tidak negatif.';
  }
  if (i.date && !/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return 'Tanggal tidak valid.';
  return null;
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengelola dokumen penjualan.',
  'document has no lines': 'Dokumen butuh minimal satu baris barang atau jasa.',
  'parent required': 'Dokumen ini dibuat dari dokumen sebelumnya.',
  'parent not found': 'Dokumen asal tidak ditemukan.',
  'wrong parent type': 'Urutan dokumen salah: penawaran, pesanan, pengiriman, penerimaan.',
  'parent not open': 'Dokumen asal sudah dilanjutkan atau dibatalkan.',
  'customer not found': 'Pelanggan tidak ditemukan.',
  'invalid line': 'Ada baris yang tidak valid (nama, jumlah, atau harga).',
  'document not found': 'Dokumen tidak ditemukan.',
  'document already continued': 'Dokumen sudah dilanjutkan, tidak bisa dibatalkan.',
  'document not open': 'Dokumen sudah dilanjutkan atau dibatalkan.',
  'wrong document type': 'Hanya pesanan atau penerimaan yang bisa dijadikan faktur.',
  'invoice not found': 'Faktur tidak ditemukan.',
};
export function salesDocumentError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal memproses dokumen penjualan.'));
}

interface FakeDeps {
  customerName: (id: string) => Promise<string | undefined>;
  invoiceExists: (id: string) => Promise<boolean>;
  today: () => string;
  newId: () => string;
}
const PARENT_OF: Record<SalesDocType, SalesDocType | null> = { quote: null, order: 'quote', delivery: 'order', receipt: 'delivery' };
const PREFIX: Record<SalesDocType, string> = { quote: 'PNW', order: 'PSN', delivery: 'PGR', receipt: 'PNR' };

/** Penyimpanan palsu untuk mode demo; aturan urutan dan status sama dengan fungsi server. */
export function createFakeSalesDocuments(deps: FakeDeps) {
  const docs: SalesDocument[] = [];
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async listSalesDocuments(type?: SalesDocType): Promise<SalesDocument[]> {
      return clone(docs.filter((d) => !type || d.type === type).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)));
    },
    async createSalesDocument(input: SalesDocumentInput): Promise<SalesDocument> {
      const existing = docs.find((d) => d.id === input.id);
      if (existing) return clone(existing);
      const problem = salesDocumentProblem(input);
      if (problem) throw new DataError('invalid', problem);
      let customerId = input.customerId;
      let lines: SalesDocLine[];
      if (input.parentId) {
        const par = docs.find((d) => d.id === input.parentId);
        if (!par) throw new DataError('not_found', 'Dokumen asal tidak ditemukan.');
        if (PARENT_OF[input.type] !== par.type) throw new DataError('invalid', SERVER_MESSAGES['wrong parent type']!);
        if (par.status !== 'open') throw new DataError('invalid', SERVER_MESSAGES['parent not open']!);
        customerId = customerId ?? par.customerId;
        lines = (input.lines && input.lines.length > 0 ? input.lines.map((l) => ({ ...l, id: deps.newId(), lineTotal: Math.round(l.qty * l.unitPrice) })) : par.lines.map((l) => ({ ...l, id: deps.newId() })));
        par.status = 'converted';
      } else {
        lines = (input.lines ?? []).map((l) => ({ ...l, name: l.name.trim(), id: deps.newId(), lineTotal: Math.round(l.qty * l.unitPrice) }));
      }
      const name = customerId ? await deps.customerName(customerId) : undefined;
      if (customerId && !name) throw new DataError('not_found', SERVER_MESSAGES['customer not found']!);
      const seq = docs.filter((d) => d.type === input.type).length + 1;
      const doc: SalesDocument = {
        id: input.id, type: input.type, number: `${PREFIX[input.type]}-${String(seq).padStart(6, '0')}`,
        ...(customerId ? { customerId } : {}), customerName: name ?? '(tanpa pelanggan)', ...(input.parentId ? { parentId: input.parentId } : {}),
        date: input.date ?? deps.today(), ...(input.note?.trim() ? { note: input.note.trim() } : {}), status: 'open',
        total: lines.reduce((s, l) => s + l.lineTotal, 0), lines,
      };
      docs.push(doc);
      return clone(doc);
    },
    async cancelSalesDocument(id: string): Promise<void> {
      const d = docs.find((x) => x.id === id);
      if (!d) throw new DataError('not_found', SERVER_MESSAGES['document not found']!);
      if (d.status === 'cancelled') return;
      if (d.status !== 'open') throw new DataError('invalid', SERVER_MESSAGES['document already continued']!);
      d.status = 'cancelled';
    },
    async linkSalesDocumentInvoice(docId: string, invoiceId: string): Promise<void> {
      const d = docs.find((x) => x.id === docId);
      if (!d) throw new DataError('not_found', SERVER_MESSAGES['document not found']!);
      if (!CAN_INVOICE.includes(d.type)) throw new DataError('invalid', SERVER_MESSAGES['wrong document type']!);
      if (d.status !== 'open') throw new DataError('invalid', SERVER_MESSAGES['document not open']!);
      if (!(await deps.invoiceExists(invoiceId))) throw new DataError('not_found', SERVER_MESSAGES['invoice not found']!);
      d.invoiceId = invoiceId;
      d.status = 'converted';
    },
  };
}

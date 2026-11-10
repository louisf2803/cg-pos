import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { computeOrder, extrasLineTotal, formatRp, splitByItem, type OutletContext, type OrderType } from '@cgpos/shared';
import type { CartLine } from '../lib/cart';
import { Modal } from '../ui';

const toCalc = (ctx: OutletContext, type: OrderType, lines: CartLine[]) => computeOrder({
  orderType: type, orderTaxes: ctx.taxes, settings: ctx.settings, roundingStep: 0, orderDiscount: 0,
  items: lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, extrasTotal: extrasLineTotal(l.qty, l.extras) })),
});

/** Pilih berapa dari tiap baris yang dibayar sekarang. Pajak dan biaya layanan dihitung ulang untuk tiap bagian. */
export function SplitBillDialog({ lines, ctx, orderType, onClose, onConfirm }: {
  lines: CartLine[]; ctx: OutletContext; orderType: OrderType; onClose: () => void; onConfirm: (picks: Record<string, number>) => Promise<void>;
}) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (id: string, v: number, max: number) => { setErr(''); setPicks((p) => ({ ...p, [id]: Math.max(0, Math.min(max, v)) })); };
  const preview = useMemo(() => {
    const r = splitByItem(lines, picks, () => 'x');
    if (r.problem) return { problem: r.problem, paid: null, remain: null };
    return { problem: null, paid: toCalc(ctx, orderType, r.paid), remain: toCalc(ctx, orderType, r.remain) };
  }, [lines, picks, ctx, orderType]);
  const any = Object.values(picks).some((v) => v > 0);

  async function submit() {
    if (preview.problem) { setErr(preview.problem); return; }
    setBusy(true); setErr('');
    try { await onConfirm(picks); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal memisah pesanan.'); setBusy(false); }
  }

  return (
    <Modal title="Pisah bayar per item" onClose={onClose}>
      <div className="grid gap-12" data-testid="split-dialog">
        <p className="text-sm text-text-muted">Pilih item yang dibayar sekarang. Sisanya tetap di pesanan ini. Pajak dan biaya layanan dihitung ulang untuk tiap bagian.</p>
        <ul className="grid gap-8 max-h-[320px] overflow-y-auto" aria-label="Item pesanan">
          {lines.map((l) => {
            const v = picks[l.id] ?? 0;
            return (
              <li key={l.id} className="flex items-center justify-between gap-8 border border-border rounded-md p-8">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{l.name}</div>
                  <div className="text-xs text-text-muted tabular-nums">dipesan {l.qty} × {formatRp(l.unitPrice + (l.extras?.reduce((s, e) => s + e.price, 0) ?? 0))}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <button type="button" className="w-32 h-32 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised disabled:opacity-40" disabled={v <= 0} aria-label={`Kurangi ${l.name} yang dibayar`} onClick={() => set(l.id, v - 1, l.qty)}><Minus className="w-12 h-12" aria-hidden /></button>
                  <span className="w-32 text-center text-sm font-bold tabular-nums" data-testid={`split-qty-${l.id}`} aria-live="polite">{v}</span>
                  <button type="button" className="w-32 h-32 rounded-md bg-surface border border-border flex items-center justify-center hover:bg-surface-raised disabled:opacity-40" disabled={v >= l.qty} aria-label={`Tambah ${l.name} yang dibayar`} onClick={() => set(l.id, v + 1, l.qty)}><Plus className="w-12 h-12" aria-hidden /></button>
                </div>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-4 text-sm bg-surface rounded-md p-12">
          <div className="flex justify-between"><dt>Dibayar sekarang</dt><dd className="font-bold tabular-nums" data-testid="split-paid">{preview.paid ? formatRp(preview.paid.total) : any ? '—' : formatRp(0)}</dd></div>
          <div className="flex justify-between text-text-muted"><dt>Sisa di pesanan</dt><dd className="tabular-nums" data-testid="split-remain">{preview.remain ? formatRp(preview.remain.total) : '—'}</dd></div>
        </dl>
        {err && <p role="alert" className="text-sm text-danger-strong" data-testid="split-err">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>Batal</button>
          <button type="button" className="cg-btn cg-btn--primary" disabled={busy || !any} onClick={submit} data-testid="split-go">Lanjut bayar</button>
        </div>
      </div>
    </Modal>
  );
}

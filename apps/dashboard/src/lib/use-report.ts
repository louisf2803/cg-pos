'use client';
import { buildSalesReport, type Order, type SalesReport } from '@cgpos/shared';
import { useData } from './data';
import { useAsync } from './use-async';
import { useRange } from './use-range';

/** Muat konteks outlet, lalu pesanan lunas dalam rentang terpilih beserta laporan turunannya. */
export function useReport() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : undefined;
  const r = useRange(tz);
  const state = useAsync(async (): Promise<{ orders: Order[]; report: SalesReport; names: Map<string, string> } | null> => {
    if (!tz) return null;
    const [orders, products, categories, employees, refunds, voided] = await Promise.all([
      data.listOrders({ status: 'paid', from: r.range.from, to: r.range.to, by: 'closed', all: true }),
      data.listProducts({ includeInactive: true }), data.listCategories(), data.listManagedEmployees(),
      data.listRefundsBetween(r.range), data.listOrders({ status: 'void', from: r.range.from, to: r.range.to, by: 'closed', all: true }),
    ]);
    const report = buildSalesReport({ orders, products, categories, employees, timezone: tz, refunds, voided });
    return { orders, report, names: new Map(employees.map((e) => [e.id, e.name])) };
  }, [data, tz, r.range.from, r.range.to]);
  return { ctx, ...r, state };
}

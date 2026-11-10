'use client';
import { PageHeader } from '@/components/page';
import { CashierReport } from '@/components/shift-reports';

export default function CashierReportPage() {
  return (
    <>
      <PageHeader title="Laporan kasir" subtitle="Setiap shift: modal, penjualan tunai dan non-tunai, uang seharusnya di laci, hitungan kasir, dan selisihnya." />
      <CashierReport />
    </>
  );
}

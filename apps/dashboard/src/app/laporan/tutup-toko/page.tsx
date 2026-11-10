'use client';
import { PageHeader } from '@/components/page';
import { StoreCloseReport } from '@/components/shift-reports';

export default function StoreCloseReportPage() {
  return (
    <>
      <PageHeader title="Tutup toko" subtitle="Laporan gabungan semua shift dalam satu hari. Toko siap ditutup hanya setelah setiap kasir selesai tutup kasir." />
      <StoreCloseReport />
    </>
  );
}

'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/page';

export default function BuyCampaignPage() {
  return (
    <div className="min-w-0">
      <PageHeader title="Beli kampanye marketing" subtitle="Informasi paket kampanye berbayar." />
      <div className="cg-empty">
        <p><strong>Pembelian kampanye belum tersedia.</strong></p>
        <p className="text-text-muted">CG POS tidak mengirim pesan lewat WhatsApp, email, atau SMS, jadi belum ada paket kuota yang bisa dibeli. Kamu tetap bisa menyusun kampanye, menentukan sasaran, dan mencatat pelanggan yang sudah dihubungi tim.</p>
        <p><Link className="cg-btn cg-btn--primary" href="/marketing/kirim">Buka kampanye marketing</Link></p>
      </div>
    </div>
  );
}

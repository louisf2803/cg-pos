import { useState, type ReactNode } from 'react';
import { ArrowLeft, Bell, CreditCard, Globe, Laptop, LogOut, Package, Percent, Receipt, Tag, Wallet } from 'lucide-react';
import type { OutletContext } from '@cgpos/shared';
import { useSession } from '../../lib/session';
import { canManageRole } from './common';
import { CashierPanel } from './CashierPanel';
import { DevicesPanel, OnlineOrderPanel, SoundPanel } from './OtherPanels';
import { PaymentsPanel } from './PaymentsPanel';
import { ProductsPanel } from './ProductsPanel';
import { PromoPanel } from './PromoPanel';
import { ReceiptPanel } from './ReceiptPanel';
import { TaxPanel } from './TaxPanel';

type SectionId = 'produk' | 'online' | 'struk' | 'pajak' | 'kasir' | 'perangkat' | 'suara' | 'nontunai' | 'promo';

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: 'produk', label: 'Produk & Kategori', icon: <Package className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'online', label: 'Order Online', icon: <Globe className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'struk', label: 'Struk & Biaya', icon: <Receipt className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'pajak', label: 'Pajak', icon: <Percent className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'kasir', label: 'Kasir', icon: <Wallet className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'perangkat', label: 'Perangkat', icon: <Laptop className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'suara', label: 'Notifikasi Suara', icon: <Bell className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'nontunai', label: 'Pembayaran Nontunai', icon: <CreditCard className="cg-icon cg-icon--sm" aria-hidden /> },
  { id: 'promo', label: 'Promo', icon: <Tag className="cg-icon cg-icon--sm" aria-hidden /> },
];

/**
 * Pengaturan outlet dari kasir. Kiri: menu "Operasional"; kanan: isi bagian yang dipilih.
 * Pengelola (pemilik, admin, manajer) boleh mengubah; kasir hanya melihat. Penjaga sebenarnya tetap di server.
 */
export function Settings({ ctx, onClose }: { ctx: OutletContext; onClose: () => void }) {
  const { session } = useSession();
  const canEdit = canManageRole(session.employee.role);
  const [sec, setSec] = useState<SectionId>('produk');
  const current = SECTIONS.find((s) => s.id === sec)!;

  const body = (() => {
    switch (sec) {
      case 'produk': return <ProductsPanel canEdit={canEdit} />;
      case 'online': return <OnlineOrderPanel />;
      case 'struk': return <ReceiptPanel canEdit={canEdit} />;
      case 'pajak': return <TaxPanel canEdit={canEdit} />;
      case 'kasir': return <CashierPanel canEdit={canEdit} />;
      case 'perangkat': return <DevicesPanel outletName={ctx.outletName} />;
      case 'suara': return <SoundPanel />;
      case 'nontunai': return <PaymentsPanel canEdit={canEdit} />;
      case 'promo': return <PromoPanel canEdit={canEdit} />;
    }
  })();

  return (
    <div className="flex flex-col h-full bg-surface min-w-0">
      <header className="flex items-center gap-12 px-16 py-12 bg-surface-raised border-b border-border shrink-0">
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose} aria-label="Kembali"><ArrowLeft className="cg-icon cg-icon--sm" aria-hidden /><span className="hidden tablet:inline">Kembali</span></button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-text leading-tight truncate">Pengaturan · {current.label}</h1>
          <p className="text-xs text-text-muted truncate">{ctx.outletName}{canEdit ? '' : ' · hanya lihat'}</p>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col tablet:flex-row">
        <nav className="tablet:w-[260px] shrink-0 border-b tablet:border-b-0 tablet:border-r border-border bg-surface-raised overflow-x-auto tablet:overflow-y-auto" aria-label="Menu pengaturan">
          <p className="hidden tablet:block text-xs font-semibold uppercase tracking-wider text-text-muted px-16 pt-16 pb-8">Operasional</p>
          <ul className="flex tablet:flex-col p-8 gap-4">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button type="button" className="cg-rail-item w-full whitespace-nowrap" aria-current={sec === s.id} onClick={() => setSec(s.id)}>{s.icon}{s.label}</button>
              </li>
            ))}
            <li className="shrink-0">
              <button type="button" className="cg-rail-item w-full whitespace-nowrap" onClick={onClose}><LogOut className="cg-icon cg-icon--sm" aria-hidden />Keluar</button>
            </li>
          </ul>
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto">{body}</main>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Info } from 'lucide-react';
import type { FixedAssetStatus } from '@cgpos/shared';

export function AssetNavTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: '/keuangan/aset', label: 'Daftar aset' },
    { href: '/keuangan/aset/penyusutan', label: 'Penyusutan' },
    { href: '/keuangan/aset/pelepasan', label: 'Pelepasan' },
    { href: '/keuangan/aset/laporan', label: 'Laporan' },
  ];

  return (
    <nav aria-label="Navigasi aset tetap" className="flex border-b border-border gap-8 mb-20 overflow-x-auto min-w-0">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-16 py-8 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AssetAssumptionNote() {
  return (
    <div className="flex items-center gap-8 text-xs text-text-muted mt-12 bg-surface/60 p-8 rounded-lg border border-border">
      <Info className="cg-icon cg-icon--xs text-accent shrink-0" aria-hidden />
      <span>
        <strong>Ketentuan penyusutan:</strong> Penyusutan garis lurus; mulai bulan setelah bulan perolehan.
      </span>
    </div>
  );
}

export function AssetStatusBadge({ status }: { status: FixedAssetStatus }) {
  if (status === 'disposed') {
    return (
      <span className="inline-flex items-center px-8 py-[2px] rounded-full text-xs font-semibold bg-danger/10 text-danger border border-danger/20">
        Dilepas
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-8 py-[2px] rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
      Aktif
    </span>
  );
}

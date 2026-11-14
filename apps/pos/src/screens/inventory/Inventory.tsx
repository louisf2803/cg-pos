import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { posSalesRange, type OutletContext, type PosRangePreset } from '@cgpos/shared';
import { useSession } from '../../lib/session';
import { canManageRole } from '../settings/common';
import { InvoicesSection, OpnameSection, TransferSection, WasteSection, type SectionProps } from './Sections';

type SectionId = 'faktur' | 'opname' | 'mutasi' | 'terbuang';

const SECTIONS: { id: SectionId; label: string; add: string; Body: (p: SectionProps) => ReactNode }[] = [
  { id: 'faktur', label: 'Faktur Pembelian', add: 'Tambah faktur pembelian', Body: InvoicesSection },
  { id: 'opname', label: 'Stok Opname', add: 'Tambah stok opname', Body: OpnameSection },
  { id: 'mutasi', label: 'Terima Mutasi Stok', add: 'Terima mutasi stok', Body: TransferSection },
  { id: 'terbuang', label: 'Stok Terbuang', add: 'Tambah stok terbuang', Body: WasteSection },
];
const RANGES: { id: PosRangePreset; label: string }[] = [{ id: 'today', label: 'Hari ini' }, { id: '7d', label: '7 hari' }, { id: '30d', label: '30 hari' }];

/** Inventori di kasir: faktur pembelian, stok opname, terima mutasi stok, dan stok terbuang. Hanya pengelola yang boleh menambah (dijaga server). */
export function Inventory({ ctx, onClose }: { ctx: OutletContext; onClose: () => void }) {
  const { session } = useSession();
  const canEdit = canManageRole(session.employee.role);
  const [sec, setSec] = useState<SectionId>('faktur');
  const [preset, setPreset] = useState<PosRangePreset>('today');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const range = useMemo(() => posSalesRange(ctx.timezone, preset), [ctx.timezone, preset]);
  const cur = SECTIONS.find((s) => s.id === sec)!;
  const Body = cur.Body;

  return (
    <div className="flex flex-col h-full bg-surface min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-12 px-16 py-12 bg-surface-raised border-b border-border shrink-0">
        <div className="flex items-center gap-12 min-w-0">
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose} aria-label="Kembali"><ArrowLeft className="cg-icon cg-icon--sm" aria-hidden /><span className="hidden tablet:inline">Kembali</span></button>
          <div className="min-w-0"><h1 className="text-base font-bold leading-tight truncate">Inventori · {cur.label}</h1><p className="text-xs text-text-muted truncate">{ctx.outletName}{canEdit ? '' : ' · hanya lihat'}</p></div>
        </div>
        <div className="flex items-center gap-8 min-w-0">
          <label className="cg-search m-0 relative"><Search className="cg-icon cg-icon--sm" aria-hidden /><span className="cg-sr">Cari</span><input className="cg-input" placeholder="Cari" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {canEdit && <button type="button" className="cg-btn cg-btn--primary cg-btn--sm whitespace-nowrap" onClick={() => setAdding(true)}>{cur.add}</button>}
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col tablet:flex-row">
        <nav className="tablet:w-[220px] shrink-0 border-b tablet:border-b-0 tablet:border-r border-border bg-surface-raised overflow-x-auto tablet:overflow-y-auto" aria-label="Kategori inventori">
          <ul className="flex tablet:flex-col p-8 gap-4">
            {SECTIONS.map((s) => <li key={s.id} className="shrink-0"><button type="button" className="cg-rail-item w-full whitespace-nowrap" aria-current={sec === s.id} onClick={() => { setSec(s.id); setAdding(false); }}>{s.label}</button></li>)}
          </ul>
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="flex items-center gap-6 px-16 py-12" role="group" aria-label="Rentang waktu">
            {RANGES.map((r) => <button key={r.id} type="button" className="cg-chip" aria-pressed={preset === r.id} onClick={() => setPreset(r.id)}>{r.label}</button>)}
          </div>
          <Body ctx={ctx} range={{ from: range.from, to: range.to }} search={q} canEdit={canEdit} adding={adding} onAddClose={() => setAdding(false)} />
        </main>
      </div>
    </div>
  );
}

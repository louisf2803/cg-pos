'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  APPOINTMENT_KIND_LABEL, APPOINTMENT_STATUS_LABEL, buildReservationReport, reservationReportProblem, toReservationReportCsv,
  type AppointmentStatus,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];
const ymd = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));

function Bars({ label, values, labels }: { label: string; values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <ul className="grid gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={label}>
      {values.map((v, i) => (
        <li key={labels[i]} className="grid gap-8" style={{ gridTemplateColumns: '4ch minmax(0, 1fr) 7ch', alignItems: 'center' }}>
          <span>{labels[i]}</span>
          <span role="presentation" style={{ background: 'var(--color-border)', borderRadius: 'var(--radius-md)', height: 12, display: 'block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round((v / max) * 100)}%`, background: 'var(--color-accent)', borderRadius: 'var(--radius-md)' }} />
          </span>
          <span className="text-right cg-num text-sm">{Math.round(v / 6) / 10} jam</span>
        </li>
      ))}
    </ul>
  );
}

export default function ReservationReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [openAt, setOpenAt] = useState('08:00');
  const [closeAt, setCloseAt] = useState('22:00');
  const from = ymd(range.from, tz);
  const to = ymd(new Date(new Date(range.to).getTime() - 1000).toISOString(), tz);
  const list = useAsync(() => data.listAppointments({ from, to }), [data, from, to]);
  const opts = { from, to, openAt, closeAt };
  const problem = reservationReportProblem(opts);
  const report = useMemo(() => (list.status === 'ready' && !problem ? buildReservationReport(list.data, opts) : null), [list, from, to, openAt, closeAt, problem]); // eslint-disable-line react-hooks/exhaustive-deps

  function downloadCsv() {
    if (!report || report.targets.length === 0) return;
    downloadCsvWithHistory({
      fileName: `laporan-reservasi-${range.label.replace(/\s+/g, '_')}.csv`, csvContent: toReservationReportCsv(report, APPOINTMENT_KIND_LABEL),
      reportName: 'Laporan reservasi dan utilisasi', period: range.label, rowCount: report.targets.length, sourceUrl: '/laporan/reservasi',
    });
  }
  const hours = report ? report.byHour.map((v, h) => ({ v, h })).filter((x) => x.h >= Number(openAt.slice(0, 2)) && x.h < Number(closeAt.slice(0, 2)) + (closeAt.slice(3) === '00' ? 0 : 1)) : [];

  return (
    <div className="min-w-0">
      <PageHeader title="Laporan reservasi dan utilisasi" subtitle={`Jasa, ruangan, dan meja · ${range.label}`}
        actions={<button className="cg-btn cg-btn--secondary" onClick={downloadCsv} disabled={!report || report.targets.length === 0}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <div className="flex flex-wrap gap-12 mb-16 items-end">
        <RangePicker value={value} today={today} onChange={setValue} />
        <div className="cg-field"><label className="cg-label" htmlFor="rs-buka">Jam buka</label><input id="rs-buka" type="time" className="cg-input" value={openAt} onChange={(e) => setOpenAt(e.target.value)} /></div>
        <div className="cg-field"><label className="cg-label" htmlFor="rs-tutup">Jam tutup</label><input id="rs-tutup" type="time" className="cg-input" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} /></div>
      </div>
      {problem && <p role="alert" className="cg-banner cg-banner--danger mb-16">{problem}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat data">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {report && report.total === 0 && <div className="cg-empty"><p><strong>Belum ada reservasi pada rentang ini.</strong></p><p className="text-text-muted">Reservasi dibuat di menu Jadwal appointment.</p></div>}
      {report && report.total > 0 && (
        <>
          <dl className="grid gap-8 mb-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Jumlah reservasi</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{report.total}</strong></dd></div>
            {STATUSES.map((s) => <div key={s} className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">{APPOINTMENT_STATUS_LABEL[s]}</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{report.byStatus[s]}</strong></dd></div>)}
            <div className="p-8" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><dt className="text-sm text-text-muted">Tingkat pembatalan</dt><dd className="cg-num" style={{ margin: 0 }}><strong>{report.cancellationPct}%</strong></dd></div>
          </dl>
          <div className="cg-data-wrap min-w-0 mb-16"><table className="cg-data" aria-label="Pemakaian per ruangan atau jasa">
            <thead><tr><th>Jenis</th><th>Nama</th><th className="text-right">Reservasi</th><th className="text-right">Dibatalkan</th><th className="text-right">Jam terpakai</th><th className="text-right">Pemakaian</th></tr></thead>
            <tbody>{report.targets.map((t) => (
              <tr key={`${t.kind}|${t.targetName}`}><td>{APPOINTMENT_KIND_LABEL[t.kind]}</td><td>{t.targetName}</td><td className="text-right cg-num">{t.bookings}</td><td className="text-right cg-num">{t.cancelled}</td>
                <td className="text-right cg-num">{Math.round(t.bookedMinutes / 6) / 10}</td><td className="text-right cg-num">{t.utilizationPct}%</td></tr>
            ))}</tbody>
          </table></div>
          <div className="grid gap-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <section aria-labelledby="rs-hari"><h2 id="rs-hari" className="text-lg font-semibold mb-8">Per hari dalam pekan</h2><Bars label="Jam terpakai per hari" values={report.byWeekday} labels={DAYS} /></section>
            <section aria-labelledby="rs-jam"><h2 id="rs-jam" className="text-lg font-semibold mb-8">Per jam</h2><Bars label="Jam terpakai per jam" values={hours.map((x) => x.v)} labels={hours.map((x) => String(x.h).padStart(2, '0'))} /></section>
          </div>
          <p className="text-sm text-text-muted mt-8">Pemakaian = menit reservasi (tidak termasuk yang dibatalkan) dibagi menit tersedia pada jam operasional setiap hari dalam rentang, per ruangan atau jasa.</p>
        </>
      )}
    </div>
  );
}

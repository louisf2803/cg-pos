import type { OutletContext } from '@cgpos/shared';
import { Modal } from '../ui';

/** Bantuan kasir: kontak outlet dan jawaban cepat untuk hal yang paling sering ditanyakan di meja kasir. */
export function HelpDialog({ ctx, onClose }: { ctx: OutletContext; onClose: () => void }) {
  return (
    <Modal title="Bantuan" onClose={onClose}>
      <div className="space-y-16 min-w-0">
        <section aria-label="Kontak">
          <h3 className="text-sm font-semibold">Hubungi pengelola outlet</h3>
          <p className="text-sm text-text-muted">Kalau kasir bermasalah, hubungi pemilik atau manajer {ctx.outletName}.</p>
          {ctx.phone ? <p className="text-sm mt-4">Telepon outlet: <strong className="cg-num">{ctx.phone}</strong></p> : <p className="text-sm text-text-muted mt-4">Nomor telepon outlet belum diisi di dashboard.</p>}
          <p className="text-xs text-text-muted mt-4">Kode perangkat ini: <span className="cg-num">{ctx.deviceCode}</span> (sebutkan saat melapor).</p>
        </section>
        <section aria-label="Jawaban cepat">
          <h3 className="text-sm font-semibold">Jawaban cepat</h3>
          <ul className="text-sm space-y-8 mt-4">
            <li><strong>Pesanan tertunda?</strong> Transaksi yang dibuat saat internet putus disimpan di perangkat, lalu terkirim otomatis. Lihat tombol Tertunda di pita atas.</li>
            <li><strong>Salah memasukkan item?</strong> Ubah jumlah dengan tombol minus, atau tekan lingkaran merah di baris item untuk menghapusnya.</li>
            <li><strong>Pesanan sudah dibayar tapi salah?</strong> Gunakan Refund dari menu Penjualan; pembatalan (void) hanya untuk pesanan yang belum dibayar.</li>
            <li><strong>Lupa PIN?</strong> Minta pemilik atau manajer mengatur ulang PIN dari dashboard.</li>
            <li><strong>Selisih uang saat tutup kasir?</strong> Hitung ulang uang di laci, lalu tuliskan penyebabnya di catatan tutup kasir.</li>
          </ul>
        </section>
        <div className="flex justify-end"><button type="button" className="cg-btn cg-btn--primary" onClick={onClose} data-autofocus>Mengerti</button></div>
      </div>
    </Modal>
  );
}

import { useAuth } from '../lib/auth';

/** Akun sudah masuk, tetapi belum terhubung ke perangkat kasir (pos.devices) di outlet mana pun. */
export function NoDevice({ outletName }: { outletName: string }) {
  const auth = useAuth();
  return (
    <main className="min-h-full grid place-items-center p-16">
      <div className="cg-empty" role="alert">
        <h3>Perangkat kasir belum didaftarkan</h3>
        <p>
          {auth?.email ? `Akun ${auth.email} ` : 'Akun ini '}belum terhubung ke perangkat kasir di {outletName}.
          Minta pemilik mendaftarkan perangkat untuk akun ini, lalu muat ulang halaman.
        </p>
        <div className="flex gap-8 justify-center">
          <button className="cg-btn cg-btn--secondary" onClick={() => location.reload()}>Muat ulang</button>
          {auth && <button className="cg-btn cg-btn--ghost" onClick={() => void auth.signOut()}>Keluar akun</button>}
        </div>
      </div>
    </main>
  );
}

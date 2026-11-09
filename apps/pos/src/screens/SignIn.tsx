import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Masuk akun (bukan PIN kasir). Akun dibuat pemilik; tidak ada pendaftaran mandiri di sini. */
export function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(/invalid login|invalid_credentials/i.test(`${err.code ?? ''} ${err.message}`)
          ? 'Email atau kata sandi salah.'
          : 'Belum bisa masuk. Periksa koneksi internet lalu coba lagi.');
      }
    } catch {
      setError('Tidak bisa terhubung ke server. Periksa koneksi internet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full grid place-items-center p-16">
      <form onSubmit={submit} className="w-full max-w-[420px] grid gap-16" aria-labelledby="judul-masuk">
        <header className="text-center">
          <h1 id="judul-masuk" className="text-xl">CG POS</h1>
          <p className="text-text-muted">Masuk dengan akun perangkat kasir ini</p>
        </header>
        <div className="cg-field">
          <label className="cg-label" htmlFor="email">Email</label>
          <input id="email" className="cg-input" type="email" autoComplete="username" inputMode="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="sandi">Kata sandi</label>
          <input id="sandi" className="cg-input" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
        <p className="text-center text-text-muted text-sm">Akun dibuat oleh pemilik. Belum punya akun? Hubungi pemilik.</p>
      </form>
    </main>
  );
}

'use client';
import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';

/** Masuk dashboard. Akun dibuat di Supabase oleh pemilik; tidak ada pendaftaran mandiri di sini. */
export function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <div className="cg-auth">
      <aside className="cg-auth__hero cg-auth__hero--dash" aria-hidden>
        <div>
          <h2 className="cg-auth__title">CG<br />POS<br />Dashboard</h2>
          <div className="cg-auth__rule" />
        </div>
      </aside>

      <main className="cg-auth__panel">
        <div className="cg-auth__box">
          <div className="cg-auth__brand">CG POS Dashboard</div>
          <header className="cg-auth__head">
            <h1 id="judul-masuk">Selamat datang kembali</h1>
            <p>Masuk untuk melihat penjualan dan mengatur katalog</p>
          </header>

          {error && (
            <div className="cg-auth-error" role="alert">
              <AlertCircle className="cg-icon cg-icon--sm" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="grid gap-32" aria-labelledby="judul-masuk">
            <div className="cg-auth-field">
              <label htmlFor="email">Email</label>
              <div className="cg-auth-field__wrap">
                <span className="cg-auth-field__icon"><Mail className="cg-icon cg-icon--sm" aria-hidden /></span>
                <input id="email" type="email" autoComplete="username" inputMode="email" required autoFocus placeholder="nama@usaha.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="cg-auth-field">
              <label htmlFor="sandi">Kata sandi</label>
              <div className="cg-auth-field__wrap">
                <span className="cg-auth-field__icon"><Lock className="cg-icon cg-icon--sm" aria-hidden /></span>
                <input id="sandi" type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Masukkan kata sandi"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="cg-auth-field__toggle" aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff className="cg-icon cg-icon--sm" aria-hidden /> : <Eye className="cg-icon cg-icon--sm" aria-hidden />}
                </button>
              </div>
            </div>
            <button className="cg-auth-btn" type="submit" disabled={busy || !email || !password} aria-busy={busy}>
              {busy ? <Loader2 className="cg-icon cg-auth-spin" aria-hidden /> : <>Masuk ke dashboard <ArrowRight className="cg-icon cg-icon--sm" aria-hidden /></>}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

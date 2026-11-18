import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

// Dashboard membuat/mengganti akun login karyawan. Pemanggil harus pengelola (diperiksa oleh pos.staff_account_check dengan JWT pemanggil);
// pembuatan pengguna memakai kunci service di sisi server. Kata sandi tidak disimpan atau dicatat di mana pun selain Supabase Auth.
// Sudah dideploy ke produksi (verify_jwt = true) sebagai fungsi "staff-create-account"; berkas ini adalah salinan sumbernya.
const DOMAIN = 'karyawan.cgpos.app';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, db: { schema: 'pos' } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let body: { employeeId?: string; username?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON tidak valid.' }, 400); }
  const employeeId = String(body.employeeId ?? '');
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!/^[0-9a-f-]{36}$/.test(employeeId)) return json({ error: 'Karyawan tidak valid.' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'Kata sandi 8 sampai 72 karakter.' }, 400);

  const chk = await caller.rpc('staff_account_check', { p_employee: employeeId });
  if (chk.error) return json({ error: /not allowed|no access/i.test(chk.error.message) ? 'Hanya manajer dan pemilik yang boleh membuat akun.' : chk.error.message }, 403);
  const existing = chk.data as string | null;

  if (existing) {
    const up = await admin.auth.admin.updateUserById(existing, { password });
    if (up.error) return json({ error: up.error.message }, 400);
    return json({ ok: true, mode: 'reset', email: up.data.user.email });
  }
  const email = username.includes('@') ? username : `${username}@${DOMAIN}`;
  if (!/^[a-z0-9._-]{3,40}$/.test(username.split('@')[0] ?? '') || !/^[^\s@]+@[^\s@]+$/.test(email)) return json({ error: 'Username 3 sampai 40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.' }, 400);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) return json({ error: /already|registered|exists/i.test(created.error.message) ? 'Username itu sudah dipakai.' : created.error.message }, 400);
  const link = await caller.rpc('staff_account_link', { p_employee: employeeId, p_email: email });
  if (link.error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return json({ error: link.error.message }, 400);
  }
  return json({ ok: true, mode: 'created', email });
});

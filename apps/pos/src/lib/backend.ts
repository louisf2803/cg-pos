import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Koneksi ke Supabase. Hanya URL dan kunci publik (publishable) yang dipakai di browser;
 * hak akses dijaga RLS di database. Bila salah satu env kosong, aplikasi memakai data palsu di memori
 * (cara kerja pengembangan dan tes), jadi tidak ada layar login.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

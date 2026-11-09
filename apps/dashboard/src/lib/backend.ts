import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Koneksi ke Supabase. Hanya URL dan kunci publik (publishable) yang dipakai di browser;
 * hak akses dijaga RLS di database. Env kosong -> data palsu di memori (pengembangan dan tes), tanpa layar masuk.
 * Next hanya menanamkan env bila ditulis persis `process.env.NEXT_PUBLIC_...`.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

-- MANUAL, BUKAN migrasi otomatis: jalankan hanya setelah Louis memastikan aplikasi BackendCoffeeGround tidak lagi dipakai.
-- Tabel lama dari aplikasi BackendCoffeeGround (public.employees) menyimpan username, kata sandi (bukan bcrypt), NIK, rekening, dan gaji
-- tanpa RLS dan terbaca oleh peran anonim. Kunci: aktifkan RLS tanpa kebijakan dan cabut akses anon/authenticated. Hanya bila tabelnya ada.
-- (Pulihkan bila aplikasi lama masih perlu: alter table public.employees disable row level security; grant select on public.employees to anon, authenticated;)
do $$
begin
  if to_regclass('public.employees') is not null then
    execute 'alter table public.employees enable row level security';
    execute 'revoke all on public.employees from anon, authenticated';
  end if;
end $$;

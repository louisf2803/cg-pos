-- CG POS · 0019_complimentary
-- Pembayaran gratis (komplimen) wajib punya alasan, dan catatan referensi pembayaran dibatasi panjangnya.
--   * pos.payments_guard_reason : pemicu sebelum simpan. Metode berjenis 'complimentary' wajib punya referensi (alasan) minimal 3 karakter
--                                 setelah dipangkas; referensi untuk semua metode maksimal 120 karakter. Spasi di tepi dibuang,
--                                 teks kosong menjadi null.
-- Aturan ada di basis data karena kasir luring bisa mengirim operasi lama lewat sinkronisasi; aplikasi saja tidak cukup.
begin;

create or replace function pos.payments_guard_reason() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_kind text;
begin
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  if new.reference is not null and char_length(new.reference) > 120 then
    raise exception 'reference_too_long: referensi maksimal 120 karakter';
  end if;
  select kind into v_kind from pos.payment_methods where id = new.method_id and org_id = new.org_id;
  if v_kind = 'complimentary' and char_length(coalesce(new.reference, '')) < 3 then
    raise exception 'complimentary_reason_required: pembayaran gratis wajib beralasan, minimal 3 karakter';
  end if;
  return new;
end $$;
revoke all on function pos.payments_guard_reason() from public, anon, authenticated;

create trigger payments_guard_reason before insert or update of reference, method_id on pos.payments
  for each row execute function pos.payments_guard_reason();

commit;

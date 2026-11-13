-- CG POS · 0134_payment_method_account
-- Akun perantara per metode bayar (A134): payment_methods.account_id adalah akun yang di-debit saat pembayaran diterima
-- (kas untuk tunai; piutang non-tunai atau piutang gateway untuk non-tunai dan QRIS). Fungsi ini mengubahnya dengan pemeriksaan:
-- hanya pemilik/admin, hanya metode tunai/non-tunai/gateway, akun harus detail, aktif, dan berkategori kas/bank atau piutang.
-- Perubahan berlaku untuk pembayaran BARU; jurnal lama tidak berubah. Perangkat menerima perubahan lewat sync (pemicu sync_seq).
create or replace function pos.payment_method_set_account(p_method uuid, p_account uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare m payment_methods%rowtype; a accounts%rowtype;
begin
  select * into m from payment_methods where id = p_method and deleted_at is null for update;
  if not found then raise exception 'method not found'; end if;
  if not pos.is_org_admin(m.org_id) then raise exception 'not allowed'; end if;
  if m.kind not in ('cash', 'noncash', 'gateway') then raise exception 'method kind not configurable'; end if;
  select * into a from accounts where id = p_account and org_id = m.org_id;
  if not found or a.kind <> 'detail' or not a.is_active then raise exception 'account not found or not postable'; end if;
  if a.category not in ('cash_bank', 'receivable') then raise exception 'account category not allowed'; end if;
  if m.kind = 'cash' and a.category <> 'cash_bank' then raise exception 'cash method needs a cash account'; end if;
  update payment_methods set account_id = p_account, updated_at = now() where id = m.id;
  return jsonb_build_object('id', m.id, 'account_id', p_account);
end $$;
revoke all on function pos.payment_method_set_account(uuid, uuid) from public, anon;
grant execute on function pos.payment_method_set_account(uuid, uuid) to authenticated, service_role;

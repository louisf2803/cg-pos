-- CG POS · 0098_revoke_public_grosir_rpc
-- Pengetatan atas 0097: fungsi baru secara bawaan bisa dieksekusi PUBLIC (termasuk anon). Pola migrasi lain mencabutnya
-- dan memberi hak hanya ke authenticated (pemeriksaan pos.can_manage tetap ada di dalam fungsi).

revoke all on function pos.customer_group_save(uuid, uuid, text, text) from public, anon;
revoke all on function pos.customer_group_delete(uuid, uuid) from public, anon;
revoke all on function pos.customer_group_assign(uuid, uuid, uuid) from public, anon;
revoke all on function pos.tiered_price_save(uuid, uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function pos.tiered_price_delete(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function pos.price_schedule_save(uuid, uuid, uuid, numeric, timestamptz, timestamptz, text) from public, anon;
revoke all on function pos.price_schedule_delete(uuid, uuid) from public, anon;
grant execute on function pos.customer_group_save(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function pos.customer_group_delete(uuid, uuid) to authenticated, service_role;
grant execute on function pos.customer_group_assign(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function pos.tiered_price_save(uuid, uuid, uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function pos.tiered_price_delete(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function pos.price_schedule_save(uuid, uuid, uuid, numeric, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function pos.price_schedule_delete(uuid, uuid) to authenticated, service_role;

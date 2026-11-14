-- CG POS · 0140_price_rules_readable_by_members
-- Kasir (peran cashier) harus MEMBACA aturan harga agar bisa menerapkannya saat menjual: harga kanal ojek online, harga berdasarkan waktu (0135),
-- jadwal harga, harga bertingkat per grup, dan keanggotaan grup pelanggan (0097). Sebelumnya select hanya untuk pengelola (pos.can_manage),
-- jadi kasir mendapat daftar kosong dan aturan tidak pernah berlaku di kasir. Menulis tetap hanya pengelola (kebijakan ins/upd/del tidak diubah).

drop policy if exists sel on pos.channel_prices;
create policy sel on pos.channel_prices for select to authenticated using (org_id in (select pos.user_org_ids()));

drop policy if exists sel on pos.time_prices;
create policy sel on pos.time_prices for select to authenticated using (org_id in (select pos.user_org_ids()));

drop policy if exists sel on pos.price_schedules;
create policy sel on pos.price_schedules for select to authenticated using (org_id in (select pos.user_org_ids()));

drop policy if exists sel on pos.tiered_prices;
create policy sel on pos.tiered_prices for select to authenticated using (org_id in (select pos.user_org_ids()));

drop policy if exists sel on pos.customer_group_members;
create policy sel on pos.customer_group_members for select to authenticated using (org_id in (select pos.user_org_ids()));

-- Tes kontrak: payload op yang dibuat kode klien (packages/shared) harus diterima pos.sync_push apa adanya.
-- Fixture dibuat oleh `pnpm -F @cgpos/shared test` (test/contract-payloads.test.ts).
\set raw `cat tests/fixtures/payloads.json`
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create temp table _fx as select :'raw'::jsonb as j;

do $$
declare
  t text := (select j::text from _fx);
  fx jsonb; v jsonb; cash uuid; oa uuid; ob uuid; rej text;
begin
  select id into cash from payment_methods where org_id = ctx('o1') and code = 'CASH';
  -- shift milik perangkat sama sudah ada dari skenario lain? tutup dulu agar op shift.open tidak bentrok
  update shifts set status = 'closed', closed_at = now() where device_id = ctx('dev') and status = 'open';
  t := replace(t, '@opt_shot', ctx('opt_shot')::text);
  t := replace(t, '@kopi_pu', ctx('pu_kopi')::text);
  t := replace(t, '@air_pu', ctx('pu_air')::text);
  t := replace(t, '@kopi', ctx('kopi')::text);
  t := replace(t, '@air', ctx('air')::text);
  t := replace(t, '@emp', ctx('emp')::text);
  t := replace(t, '@cash', cash::text);
  fx := t::jsonb;
  oa := (fx->'ids'->>'orderA')::uuid;
  ob := (fx->'ids'->>'orderB')::uuid;

  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  v := pos.sync_push(ctx('dev'), fx->'ops');
  select string_agg(e->>'op_id' || ': ' || coalesce(e->>'error', ''), ' | ') into rej
    from jsonb_array_elements(v) e where e->>'status' <> 'applied';
  perform pg_temp.ok(rej is null, 'semua op klien diterapkan, ditolak: ' || coalesce(rej, '-'));

  perform pg_temp.ok((select status from orders where id = oa) = 'paid', 'pesanan A lunas');
  perform pg_temp.ok((select total from orders where id = oa) = (fx->'expected'->>'totalA')::numeric, 'total A cocok dengan hitungan klien');
  perform pg_temp.ok((select status from orders where id = ob) = 'paid', 'pesanan B lunas setelah pembulatan');
  perform pg_temp.ok((select total from orders where id = ob) = (fx->'expected'->>'totalB')::numeric, 'total B termasuk pembulatan');
  perform pg_temp.ok((select rounding from orders where id = ob) = (fx->'expected'->>'roundingB')::numeric, 'pembulatan B tersimpan');
  -- versi: 1 saat dibuat, 2 setelah upsert ulang (base_version diterima), 3 setelah trigger pembayaran
  perform pg_temp.ok((select version from orders where id = ob) = 3, 'versi pesanan B = 3: ' || (select version from orders where id = ob));
  perform pg_temp.ok((select count(*) from order_items where order_id = ob) = 2, 'baris pesanan tidak menggandakan saat upsert ulang');
  perform pg_temp.ok((select count(*) from order_discounts where order_id = ob) = 1, 'diskon tersimpan sekali');
  perform pg_temp.ok((select sum(amount) from order_tax_lines where order_id = ob) = 4515, 'baris pajak PB1 4515');
  perform pg_temp.ok((select service_charge from orders where id = oa) = 2150, 'biaya layanan 5% dari 43000');

  -- terbukukan dan seimbang, termasuk pembulatan
  perform pg_temp.ok((select finalized_at is not null from orders where id = ob), 'pesanan B terbukukan');
  perform pg_temp.ok(
    (select sum(debit) = sum(credit) from journal_lines where entry_id = (select id from journal_entries where source_key = 'order:' || ob || ':sale')),
    'jurnal B seimbang');
  perform pg_temp.ok(
    (select coalesce(sum(credit), 0) from journal_lines where entry_id = (select id from journal_entries where source_key = 'order:' || ob || ':sale')
        and account_id = pos.account_id(ctx('o1'), 'rounding')) = 35, 'pembulatan 35 masuk akun pembulatan');
  -- kembalian tunai dihitung server
  perform pg_temp.ok((select change_given from payments where order_id = ob) = 300, 'kembalian 300 dihitung server');

  -- batalkan pesanan belum dibayar dan tutup shift dengan payload klien
  perform pg_temp.ok((select status from orders where id = (fx->'ids'->>'orderC')::uuid) = 'void', 'pesanan C dibatalkan');
  perform pg_temp.ok((select subtotal = 36364 and tax_total = 3636 and total = 40000 and status = 'void' from orders where id = (fx->'ids'->>'orderD')::uuid), 'pesanan D inklusif: subtotal bersih + pajak = harga menu');
  perform pg_temp.ok((select base_amount = 36364 and amount = 3636 from order_tax_lines where order_id = (fx->'ids'->>'orderD')::uuid), 'baris pajak D tersimpan');
  perform pg_temp.ok((select count(*) from order_voids where order_id = (fx->'ids'->>'orderC')::uuid) = 1, 'catatan pembatalan tersimpan');
  perform pg_temp.ok((select status from shifts where id = (fx->'ids'->>'shift')::uuid) = 'closed', 'shift ditutup');
  perform pg_temp.ok((select expected_cash from shifts where id = (fx->'ids'->>'shift')::uuid) = (fx->'expected'->>'expectedCash')::numeric, 'kas diharapkan cocok: ' || (select expected_cash from shifts where id = (fx->'ids'->>'shift')::uuid));
  perform pg_temp.ok((select cash_variance from shifts where id = (fx->'ids'->>'shift')::uuid) = (fx->'expected'->>'variance')::numeric, 'selisih kas -365');

  -- refund dari payload klien: tersimpan, jurnal seimbang, nilainya sama dengan hitungan klien
  perform pg_temp.ok((select total from refunds where id = (fx->'ids'->>'refund')::uuid) = (fx->'expected'->>'refundTotal')::numeric, 'total refund cocok dengan hitungan klien');
  perform pg_temp.ok((select count(*) from refund_items where refund_id = (fx->'ids'->>'refund')::uuid) = 1, 'baris refund tersimpan');
  perform pg_temp.ok(
    (select sum(debit) = sum(credit) from journal_lines where entry_id = (select id from journal_entries where source_key = 'refund:' || (fx->'ids'->>'refund'))),
    'jurnal refund seimbang');

  -- Ekstra dari payload klien: baris pesanan menyimpan salinan nama/harga pilihan, total ekstra = qty x harga
  perform pg_temp.ok((select count(*) from order_item_extras e join order_items i on i.id = e.order_item_id where i.order_id = (fx->'ids'->>'orderC')::uuid) = 1, 'ekstra tersimpan');
  perform pg_temp.ok((select i.extras_total = e.qty * e.price from order_item_extras e join order_items i on i.id = e.order_item_id where i.order_id = (fx->'ids'->>'orderC')::uuid) = true, 'total ekstra = qty x harga');
  perform pg_temp.ok((select i.line_total from order_item_extras e join order_items i on i.id = e.order_item_id where i.order_id = (fx->'ids'->>'orderC')::uuid) = 50000, 'baris 2x20000 + 10000 ekstra');

  -- kirim ulang seluruh batch: idempoten
  v := pos.sync_push(ctx('dev'), fx->'ops');
  perform pg_temp.ok((select bool_and((e->>'duplicate')::boolean) from jsonb_array_elements(v) e), 'kirim ulang batch -> semua duplikat');
  perform pg_temp.ok((select count(*) from payments where order_id in (oa, ob)) = 2, 'tidak ada pembayaran ganda');
end $$;

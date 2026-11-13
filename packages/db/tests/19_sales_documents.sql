-- Dokumen penjualan berantai (migrasi 0130): penawaran -> pesanan -> pengiriman -> penerimaan -> faktur; urutan jenis dijaga, induk menjadi converted,
-- baris disalin, idempoten, batal hanya untuk yang open, kasir dan org lain ditolak.
create or replace function pg_temp.ok30(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails30(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  q uuid := gen_random_uuid(); so uuid := gen_random_uuid(); dl uuid := gen_random_uuid(); rc uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); inv uuid := gen_random_uuid();
  cust uuid := gen_random_uuid(); r jsonb;
  lines jsonb := '[{"name":"Kopi 1 kg","qty":10,"unit_price":100000},{"name":"Gula","qty":5,"unit_price":20000}]';
begin
  insert into auth.users(id, email) values (adm, 'adm-sd@x'), (cash, 'cash-sd@x'), (stranger, 'stranger-sd@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  insert into customers(id, org_id, name) values (cust, o1, 'PT Dokumen');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  r := pos.sales_doc_create(q, o1, 'quote', cust, date '2026-11-01', 'Penawaran awal', null, lines);
  perform pg_temp.ok30((r->>'number') like 'PNW-%' and (r->>'total')::numeric = 1100000, 'penawaran: nomor dan total');
  perform pg_temp.ok30((pos.sales_doc_create(q, o1, 'quote', cust, null, null, null, lines)->>'already')::boolean, 'idempoten menurut id');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''delivery'', null, null, null, null, %L)', gen_random_uuid(), o1, lines), 'parent required'), 'pengiriman tanpa induk ditolak');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''delivery'', null, null, null, %L, null)', gen_random_uuid(), o1, q), 'wrong parent type'), 'urutan jenis dijaga');
  -- penawaran -> pesanan (baris disalin, induk converted)
  r := pos.sales_doc_create(so, o1, 'order', null, null, null, q, null);
  perform pg_temp.ok30((r->>'number') like 'PSN-%' and (r->>'total')::numeric = 1100000 and (r->>'lines')::int = 2, 'pesanan menyalin baris penawaran');
  perform pg_temp.ok30((select status from pos.sales_documents where id = q) = 'converted' and (select customer_id from pos.sales_documents where id = so) = cust, 'induk converted, pelanggan terwarisi');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''order'', null, null, null, %L, null)', gen_random_uuid(), o1, q), 'parent not open'), 'induk yang sudah dilanjutkan tidak bisa dipakai lagi');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_cancel(%L)', q), 'document already continued'), 'yang sudah dilanjutkan tidak bisa dibatalkan');
  -- pesanan -> pengiriman -> penerimaan
  perform pos.sales_doc_create(dl, o1, 'delivery', null, null, null, so, null);
  r := pos.sales_doc_create(rc, o1, 'receipt', null, null, null, dl, null);
  perform pg_temp.ok30((r->>'number') like 'PNR-%' and (r->>'total')::numeric = 1100000, 'penerimaan menyalin baris');
  -- hubungkan ke faktur
  perform pos.sales_invoice_create(inv, o1, cust, null, 0, 0, 0, 0, null, null, lines);
  perform pos.sales_doc_link_invoice(rc, inv);
  perform pg_temp.ok30((select status from pos.sales_documents where id = rc) = 'converted' and (select invoice_id from pos.sales_documents where id = rc) = inv, 'penerimaan terhubung ke faktur');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_link_invoice(%L, %L)', rc, inv), 'document not open'), 'tidak bisa dihubungkan dua kali');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_link_invoice(%L, %L)', dl, inv), 'wrong document type'), 'pengiriman tidak langsung ke faktur');
  -- batal
  perform pos.sales_doc_create(q2, o1, 'quote', null, null, null, null, lines);
  perform pos.sales_doc_cancel(q2);
  perform pg_temp.ok30((select status from pos.sales_documents where id = q2) = 'cancelled', 'penawaran bisa dibatalkan');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''order'', null, null, null, %L, null)', gen_random_uuid(), o1, q2), 'parent not open'), 'induk batal tidak bisa dilanjutkan');
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''quote'', null, null, null, null, ''[{"name":"X","qty":0,"unit_price":1}]'')', gen_random_uuid(), o1), 'invalid line'), 'qty 0 ditolak');
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_create(%L, %L, ''quote'', null, null, null, null, %L)', gen_random_uuid(), o1, lines), 'not allowed'), 'kasir tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok30(pg_temp.fails30(format('select pos.sales_doc_cancel(%L)', q2), 'not allowed'), 'org lain tidak boleh');
    reset role;
  end if;
  delete from pos.sales_documents where org_id = o1 and parent_id is not null;
  delete from pos.sales_documents where org_id = o1;
  delete from pos.sales_invoices where org_id = o1;
  delete from pos.doc_sequences where org_id = o1 and (scope like 'SD-%' or scope = 'SINV');
  delete from pos.customers where id = cust;
end $$;

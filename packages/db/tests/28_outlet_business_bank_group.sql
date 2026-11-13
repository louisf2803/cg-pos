-- Test 28: Informasi bisnis, rekening bank, grup outlet, dan logo pada pos.outlets
begin;

select plan(5);

select has_column('pos', 'outlets', 'bank_name', 'kolom bank_name ada di pos.outlets');
select has_column('pos', 'outlets', 'bank_account_number', 'kolom bank_account_number ada di pos.outlets');
select has_column('pos', 'outlets', 'outlet_group', 'kolom outlet_group ada di pos.outlets');
select has_column('pos', 'outlets', 'logo_url', 'kolom logo_url ada di pos.outlets');
select has_table('pos', 'outlet_groups', 'tabel pos.outlet_groups ada');

select * from finish();
rollback;

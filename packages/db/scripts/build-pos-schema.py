#!/usr/bin/env python3
"""Ubah db/*.sql (skema asli, di schema public + app) menjadi migrasi yang aman untuk proyek Supabase
yang SUDAH berisi tabel lain: semua objek CG POS tinggal di schema `pos`; tidak ada satu pun perintah
yang menyentuh schema `public` (revoke/grant/ubah constraint). Keluaran: migrations/NNNN_*.sql."""
import re, sys, pathlib

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '../../../replica/db').resolve()
OUT = pathlib.Path(__file__).resolve().parent.parent / 'migrations'
TESTS_SRC = SRC.parent / 'tests'
TESTS_OUT = pathlib.Path(__file__).resolve().parent.parent / 'tests'

def conv(sql: str) -> str:
    s = sql
    s = re.sub(r"table_schema\s*=\s*'public'", "table_schema = 'pos'", s)
    s = s.replace("'public'::regnamespace", "'pos'::regnamespace")
    s = re.sub(r"nspname\s*=\s*'public'", "nspname = 'pos'", s)
    s = s.replace("in schema public", "in schema pos").replace("on schema public", "on schema pos")
    s = s.replace("in schema app", "in schema pos").replace("on schema app", "on schema pos")
    s = s.replace("create schema if not exists app;", "")
    s = s.replace("public, app, pg_temp", "pos, extensions, pg_temp")
    s = re.sub(r"\bapp\.", "pos.", s)
    return s

HEADER = ("-- CG POS · {name}\n-- Semua objek ada di schema pos. Tidak menyentuh schema public.\n"
          "begin;\nset local search_path = pos, extensions, public;\n\n")
FOOTER = "\ncommit;\n"

groups = [
    ('0001_base_tenancy', ['00_base', '01_tenancy']),
    ('0002_accounts_catalog', ['02_accounts', '03_catalog']),
    ('0003_customers_sales', ['04_customers_floor', '05_sales']),
    ('0004_gateway_inventory_purchasing', ['06_gateway', '07_inventory', '08_purchasing', '09_finance_extra']),
    ('0005_helpers', ['10_helpers']),
    ('0006_posting', ['11_posting']),
    ('0007_access_reports', ['12_access', '13_reports']),
    ('0008_sync', ['14_sync']),
    ('0009_security', ['15_security']),
]
for old in OUT.glob('*.sql'): old.unlink()
for name, parts in groups:
    body = ''
    for p in parts:
        body += f"-- ===== {p}.sql =====\n" + conv((SRC / f'{p}.sql').read_text()) + "\n"
    if name.startswith('0009'):
        body += '''
-- Setiap fungsi membawa search_path sendiri: PostgREST memanggil dengan search_path bawaan (public), bukan pos.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'pos' and p.prokind = 'f'
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = pos, extensions, pg_temp', f.sig);
  end loop;
end $$;
'''
    if name.startswith('0001'):
        body = "create schema if not exists pos;\n" + body
    (OUT / f'{name}.sql').write_text(HEADER.format(name=name) + body + FOOTER)
    print(name, len((HEADER + body).encode()), 'bytes')

# tes: ganti app. -> pos.; dijalankan dengan search_path = pos,public
for t in TESTS_SRC.glob('[1-9]*.sql'):
    (TESTS_OUT / t.name).write_text(conv(t.read_text()))
print('tes diperbarui')

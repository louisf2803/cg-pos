#!/usr/bin/env bash
# Muat ulang migrasi ke Postgres lokal lalu jalankan semua skenario.
# Env: PGHOST (default /tmp/pgsock), PGPORT (54329), PGUSER (postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-/tmp/pgsock}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
export PGOPTIONS="-c search_path=pos,extensions,public"
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists cgpos_test" -c "create database cgpos_test"
PGOPTIONS="" $P -d cgpos_test -f tests/00_auth_stub.sql
for m in migrations/*.sql; do echo "== $m"; $P -d cgpos_test -f "$m"; done
for f in tests/[1-9]*.sql; do echo "== $f"; $P -d cgpos_test -f "$f"; done
echo "SEMUA TES LULUS"

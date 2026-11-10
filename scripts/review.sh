#!/usr/bin/env bash
# Review ringkas: hanya cetak LULUS/GAGAL per langkah dan 15 baris galat terakhir.
set -u
cd "$(dirname "$0")/.."
ok=1
run(){ n="$1"; shift; out=$("$@" 2>&1); if [ $? -eq 0 ]; then echo "LULUS  $n"; else echo "GAGAL  $n"; echo "$out" | tail -15; ok=0; fi; }
run typecheck pnpm -r typecheck
run tes-shared pnpm -F @cgpos/shared test
run build-dashboard pnpm -F @cgpos/dashboard build
git checkout -q packages/db/tests/fixtures/payloads.json 2>/dev/null
[ $ok -eq 1 ] && echo "SEMUA LULUS" || echo "ADA YANG GAGAL"

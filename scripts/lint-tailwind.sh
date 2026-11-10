#!/usr/bin/env bash
# Penjaga Tailwind: tandai BARIS BARU (dibanding cabang dasar) di apps/dashboard yang memakai
#  (1) prefix breakpoint yang tidak ada (sm: md: lg: xl: 2xl:) — preset hanya punya tablet: laptop: desktop: wide:
#  (2) kunci spasi angka yang tidak didefinisikan preset (hanya 4/8/12/16/20/24/32/40/48/64) — jatuh ke skala bawaan
#      Tailwind (mis. w-14 = 56px, gap-10 = 40px) dan merusak tampilan; pakai nilai eksplisit seperti w-[14px].
# Pakai: scripts/lint-tailwind.sh [cabang-dasar]   (bawaan: master; bila tidak ada, origin/main)
set -u
cd "$(dirname "$0")/.."
base="${1:-master}"
git rev-parse --verify -q "$base" >/dev/null || base=origin/main
added=$(git diff -U0 "$(git merge-base "$base" HEAD)" HEAD -- 'apps/dashboard/src/*.tsx' 'apps/dashboard/src/*.ts' \
  | grep -E '^\+[^+]' || true)
bad1=$(echo "$added" | grep -E '(^|[ "'"'"'`:])(sm|md|lg|xl|2xl):[a-z\[-]' || true)
bad2=$(echo "$added" | grep -E '(^|[ "'"'"'`:])-?(w|h|size|gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|top|left|right|bottom|inset|space-x|space-y)-(1|2|3|5|6|7|9|10|11|14|18|28|36)([ "'"'"'`]|$)' || true)
rc=0
if [ -n "$bad1" ]; then echo "GAGAL  prefix breakpoint tidak ada (pakai tablet:/laptop:/desktop:/wide:):"; echo "$bad1" | head -10; rc=1; fi
if [ -n "$bad2" ]; then echo "GAGAL  kunci spasi tak terdefinisi (pakai nilai eksplisit w-[14px]):"; echo "$bad2" | head -10; rc=1; fi
[ $rc -eq 0 ] && echo "LULUS  tailwind-guard"
exit $rc

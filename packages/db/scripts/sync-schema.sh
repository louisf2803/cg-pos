#!/usr/bin/env bash
# Salin schema.sql terbaru dari replica/ ke migrasi pertama (sumber kebenaran sementara).
set -euo pipefail
cd "$(dirname "$0")/.."
cp ../../../replica/schema.sql migrations/0001_init.sql
echo "migrations/0001_init.sql diperbarui"

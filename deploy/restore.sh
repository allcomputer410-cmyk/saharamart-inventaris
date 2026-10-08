#!/usr/bin/env bash
# Memulihkan database inventaris ke dalam container db.
# Syarat: deploy/.env sudah terisi, dan deploy/private/inventaris-dump.sql ada
# (dikirim terpisah, tidak ada di Git).
set -euo pipefail
cd "$(dirname "$0")"

DUMP=private/inventaris-dump.sql
[ -f .env ] || { echo "deploy/.env belum ada. Jalankan ./setup.sh dulu."; exit 1; }
[ -f "$DUMP" ] || { echo "$DUMP tidak ditemukan. Salin file dump yang dikirim ke deploy/private/."; exit 1; }
set -a; . ./.env; set +a
[ -n "${REST_DB_PASSWORD:-}" ] || { echo "REST_DB_PASSWORD kosong di .env"; exit 1; }

COMPOSE="docker compose --env-file .env -f docker-compose.yml"

echo "[1/5] Menyalakan database..."
$COMPOSE up -d db
echo "[2/5] Menunggu database siap..."
until $COMPOSE exec -T db pg_isready -U postgres -d inventaris >/dev/null 2>&1; do sleep 2; done

# Cegah menimpa data yang sudah ada.
EXISTING=$($COMPOSE exec -T db psql -X -tA -U postgres -d inventaris \
  -c "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth','app_private')")
if [ "${EXISTING//[[:space:]]/}" != "0" ]; then
  echo "Database sudah berisi tabel. Restore dibatalkan agar data tidak tertimpa."
  exit 1
fi

echo "[3/5] Membuat role..."
$COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d inventaris < roles.sql

echo "[4/5] Memulihkan data (ini bisa beberapa menit)..."
$COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d inventaris < "$DUMP"

echo "[5/5] Mengatur password PostgREST..."
$COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d inventaris \
  -c "ALTER ROLE authenticator PASSWORD '$REST_DB_PASSWORD'"

echo "Selesai. Lanjut: ./deploy.sh untuk menyalakan PostgREST + app."

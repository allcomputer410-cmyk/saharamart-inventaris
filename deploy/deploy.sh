#!/usr/bin/env bash
# Build image app + nyalakan semua service (db, rest, app).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env belum ada. Jalankan ./setup.sh dulu."; exit 1; }

COMPOSE="docker compose --env-file .env -f docker-compose.yml"
echo "Build image app (pertama kali bisa 3-6 menit)..."
$COMPOSE build app
echo "Menyalakan semua service..."
$COMPOSE up -d
echo
$COMPOSE ps
echo
echo "App di-bind ke 127.0.0.1:$(. ./.env; echo ${APP_PORT:-3100}). Arahkan Caddy ke sana (lihat Caddyfile.snippet)."

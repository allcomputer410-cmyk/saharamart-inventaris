#!/usr/bin/env bash
# Membuat deploy/.env dengan 3 secret acak. Tidak menimpa yang sudah ada.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo "deploy/.env sudah ada — secret tidak diubah."
  exit 0
fi

gen() { openssl rand -hex 32; }

cat > .env <<EOF
POSTGRES_PASSWORD=$(gen)
REST_DB_PASSWORD=$(gen)
POSTGREST_JWT_SECRET=$(gen)

# WAJIB diisi: domain HTTPS publik (harus sama dengan di Caddy)
APP_ORIGIN=https://GANTI-DENGAN-DOMAIN-ANDA

# Opsional
APP_PORT=3100
CRON_SECRET=
EOF
chmod 600 .env
echo "deploy/.env dibuat. EDIT baris APP_ORIGIN dengan domain HTTPS Anda sebelum lanjut."

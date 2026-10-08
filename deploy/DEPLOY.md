# Panduan Pasang Backend Inventaris di VPS

Aplikasi ini satu paket Next.js: web + API backend jadi satu. Database memakai
PostgreSQL 17 + PostgREST (seperti Supabase, tapi self-hosted). Semua jalan via Docker.

## Yang dibutuhkan di VPS
- Docker + Docker Compose plugin
- Reverse proxy yang sudah ada (Caddy) untuk HTTPS
- RAM sisa ± 0,7 GB, disk sisa ± 1 GB
- Satu subdomain yang diarahkan ke VPS (mis. `inventaris.deliveryku.com`),
  atau pakai `inventaris.<IP-pakai-strip>.sslip.io` tanpa beli domain.

Database & PostgREST **tidak** dibuka ke internet — hanya app (port lokal 3100)
yang di-proxy Caddy ke publik lewat HTTPS.

## File dump database (dikirim terpisah)
`inventaris-dump.sql` TIDAK ada di Git (berisi data penjualan asli). Taruh di
`deploy/private/inventaris-dump.sql` sebelum menjalankan restore.

## Langkah

```bash
# 1. Ambil kode (repo self-hosted, branch default: main)
git clone https://github.com/allcomputer410-cmyk/saharamart-inventaris-selfhost.git
cd saharamart-inventaris-selfhost
cd deploy

# 2. Buat secret acak
chmod +x *.sh
./setup.sh
#   -> lalu EDIT deploy/.env, isi APP_ORIGIN dengan domain HTTPS Anda
nano .env

# 3. Taruh file dump yang dikirim ke deploy/private/inventaris-dump.sql
#    lalu pulihkan database
./restore.sh

# 4. Build app + nyalakan semua service
./deploy.sh

# 5. Arahkan Caddy ke app (lihat Caddyfile.snippet), lalu reload Caddy
#    domain di Caddy harus sama dengan APP_ORIGIN di .env
```

Cek: buka `https://domain-anda/login` — harus muncul halaman login.
Login pakai akun lama (password bcrypt tetap berlaku).

## Setelah backend hidup — hubungkan kasir
Buat token sync untuk tiap toko (jalankan di folder repo, bukan deploy):

```bash
# dari root repo, pastikan bisa akses db:
#   caranya paling mudah lewat container db:
docker compose --env-file deploy/.env -f deploy/docker-compose.yml \
  exec -T db psql -U postgres -d inventaris -c \
  "INSERT INTO app_private.sync_keys(store_id, token_hash, label)
   SELECT id, encode(digest('GANTI_TOKEN_ACAK','sha256'),'hex'), 'iPOS agent'
   FROM stores WHERE code='SM01';"
```

Lebih mudah: minta pemilik repo menjalankan `npm run backend:sync-key` terhubung
ke VPS, atau buat token via skrip. Lalu di `.env` tiap PC kasir isi:

```
INVENTORY_API_URL=https://domain-anda/api/sync
INVENTORY_SYNC_TOKEN=token_toko
```

## Operasional
- **Jangan** `docker compose down -v` (opsi -v menghapus volume database).
- Update aplikasi: `git pull` lalu `./deploy.sh` (build ulang app saja).
- Backup rutin: `docker compose ... exec -T db pg_dump -U postgres inventaris > backup.sql`
  dan simpan di luar VPS. Uji pemulihannya berkala.
- Data & PostgREST tetap privat; publik hanya menyentuh app lewat Caddy.

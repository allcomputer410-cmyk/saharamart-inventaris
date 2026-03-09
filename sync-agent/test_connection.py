"""
Test Koneksi iPOS → Supabase
Jalankan script ini SEBELUM setup sync agent untuk memastikan:
  1. Koneksi ke iPOS PostgreSQL berhasil
  2. Tabel-tabel iPOS ditemukan
  3. Koneksi ke Supabase berhasil

Cara pakai:
  python test_connection.py
"""

import sys

print("=" * 55)
print("  TEST KONEKSI — iPOS Saharamart & Supabase")
print("=" * 55)

# ── Coba import psycopg2 ──────────────────────────────────────
print("\n[1/4] Cek library psycopg2...", end=" ")
try:
    import psycopg2
    print("✅ OK")
except ImportError:
    print("❌ BELUM TERINSTALL")
    print("\n  Jalankan dulu: pip install psycopg2-binary")
    sys.exit(1)

# ── Coba import requests ──────────────────────────────────────
print("[2/4] Cek library requests...", end=" ")
try:
    import requests
    print("✅ OK")
except ImportError:
    print("❌ BELUM TERINSTALL")
    print("\n  Jalankan: pip install requests")
    sys.exit(1)

# ── Koneksi ke iPOS ───────────────────────────────────────────
print("\n[3/4] Koneksi ke iPOS PostgreSQL...")

# Daftar password yang akan dicoba (dari yang paling umum)
PASSWORDS_TO_TRY = [
    "",           # kosong (tanpa password)
    "admin",      # default umum
    "postgres",   # default postgres
    "saharamart", # nama toko
    "ipos",       # nama aplikasi
    "123456",     # password sederhana
]

DB_HOST = "localhost"
DB_PORT = 5444          # ✅ Port khusus iPOS 4 InspirasiBiz (bukan 5432!)
DB_NAME = "i4_SAHARAMART"  # ✅ Prefix i4_ adalah standar iPOS 4
USERNAMES_TO_TRY = ["postgres", "admin"]

connected = False
working_user = None
working_pass = None

for user in USERNAMES_TO_TRY:
    for pwd in PASSWORDS_TO_TRY:
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=user,
                password=pwd,
                connect_timeout=5,
            )
            conn.close()
            connected = True
            working_user = user
            working_pass = pwd
            break
        except psycopg2.OperationalError:
            continue
        except Exception:
            continue
    if connected:
        break

if not connected:
    print("  ❌ GAGAL terhubung ke iPOS PostgreSQL")
    print("\n  Kemungkinan penyebab:")
    print("  - PostgreSQL iPOS tidak sedang running")
    print("  - Database 'SAHARAMART' tidak ditemukan")
    print("  - Username/password berbeda dari yang umum")
    print("\n  Solusi:")
    print("  1. Pastikan iPOS sedang berjalan")
    print("  2. Buka ipgsql → coba login manual")
    print("  3. Edit bagian PASSWORDS_TO_TRY di script ini")
    sys.exit(1)

print(f"  ✅ BERHASIL! User: {working_user!r}, Password: {repr(working_pass) if working_pass else repr('')}")

# ── Cek tabel iPOS ────────────────────────────────────────────
print("\n[3b] Cek tabel-tabel iPOS yang diperlukan...")

REQUIRED_TABLES = [
    "tbl_item",
    "tbl_itemstok",
    "tbl_supel",
    "tbl_kantor",
    "tbl_itemjenis",
    "tbl_itemmerek",
    "tbl_ikhd",
    "tbl_ikdt",
]

conn = psycopg2.connect(
    host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
    user=working_user, password=working_pass, connect_timeout=5,
)
cur = conn.cursor()

missing = []
for tbl in REQUIRED_TABLES:
    cur.execute(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)",
        (tbl,)
    )
    exists = cur.fetchone()[0]
    status = "✅" if exists else "❌"
    print(f"  {status} {tbl}")
    if not exists:
        missing.append(tbl)

# Hitung jumlah produk
cur.execute("SELECT COUNT(*) FROM tbl_item")
total_produk = cur.fetchone()[0]

# Hitung jumlah kantor
cur.execute("SELECT kodekantor, namakantor FROM tbl_kantor")
kantors = cur.fetchall()

cur.close()
conn.close()

print(f"\n  Total produk di iPOS : {total_produk:,} item")
print(f"  Kantor ditemukan     : {len(kantors)}")
for kode, nama in kantors:
    marker = " ← Saharamart (UTM)" if kode == "UTM" else ""
    print(f"    - {kode}: {nama}{marker}")

if missing:
    print(f"\n  ⚠️  {len(missing)} tabel tidak ditemukan: {missing}")
    print("  Pastikan database iPOS yang benar sudah dipilih.")

# ── Test Supabase ─────────────────────────────────────────────
print("\n[4/4] Cek koneksi Supabase...")

# Cek apakah .env ada
import os
env_path = os.path.join(os.path.dirname(__file__), ".env")
if not os.path.exists(env_path):
    print("  ⏭️  File .env belum ada — lewati test Supabase")
    print("     Buat .env dulu dari .env.example setelah install selesai")
else:
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not url or not key or "ISI_SERVICE" in key:
            print("  ⏭️  SUPABASE_SERVICE_KEY belum diisi di .env")
        else:
            resp = requests.get(
                f"{url}/rest/v1/stores?select=count",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Prefer": "count=exact",
                },
                timeout=10,
            )
            if resp.status_code in (200, 206):
                print("  ✅ Supabase TERHUBUNG!")
            else:
                print(f"  ❌ Supabase error: HTTP {resp.status_code}")
                print(f"     {resp.text[:200]}")
    except Exception as e:
        print(f"  ❌ Error: {e}")

# ── Ringkasan ─────────────────────────────────────────────────
print("\n" + "=" * 55)
print("  HASIL TEST")
print("=" * 55)
if connected and not missing:
    print(f"""
  iPOS PostgreSQL : ✅ TERHUBUNG
  Database        : SAHARAMART
  User/Password   : {working_user} / {repr(working_pass) if working_pass else '(kosong)'}
  Total Produk    : {total_produk:,} item
  Semua Tabel     : ✅ Lengkap

  SIMPAN INFO INI untuk mengisi file .env:
  ─────────────────────────────────────────
  IPOS_DB_NAME=SAHARAMART
  IPOS_DB_USER={working_user}
  IPOS_DB_PASS={working_pass or ''}
  ─────────────────────────────────────────
""")
else:
    print("  ❌ Ada masalah — baca pesan error di atas")

print("=" * 55)

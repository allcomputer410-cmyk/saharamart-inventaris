"""
Konfigurasi Sync Agent iPOS → Supabase
Salin file ini sebagai .env di folder sync-agent, lalu isi nilainya.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# iPOS PostgreSQL 8.4 connection per store
# Format: IPOS_{KODEKANTOR}_HOST, IPOS_{KODEKANTOR}_PORT, etc.
# Defaults for single-store setup:
IPOS_DB_HOST = os.getenv("IPOS_DB_HOST", "localhost")
IPOS_DB_PORT = int(os.getenv("IPOS_DB_PORT", "5444"))   # iPOS InspirasiBiz pakai 5444
IPOS_DB_NAME = os.getenv("IPOS_DB_NAME", "i4_SAHARAMART")
IPOS_DB_USER = os.getenv("IPOS_DB_USER", "postgres")
IPOS_DB_PASS = os.getenv("IPOS_DB_PASS", "")

# Sync interval in minutes
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "15"))

# Jumlah hari ke belakang untuk sync penjualan (daily_sales + daily_sale_items)
# Set ke 90 atau 365 untuk re-sync data historis pertama kali
SALES_DAYS_BACK = int(os.getenv("SALES_DAYS_BACK", "30"))

# Filter toko: jika diisi, sync agent hanya akan sync toko dengan code ini.
# Contoh: STORE_CODE=SM01  → hanya Saharamart
#         STORE_CODE=ARM01 → hanya Arafamart
#         (kosong)         → sync semua toko aktif
STORE_CODE = os.getenv("STORE_CODE", "")

# Log level
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

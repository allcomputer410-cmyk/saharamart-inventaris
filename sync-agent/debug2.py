"""
debug2.py — Cari penyebab 400 error pada batch produk
Jalankan: python debug2.py
"""
import os, sys, requests, json
from datetime import datetime
from decimal import Decimal
from dotenv import load_dotenv
import psycopg2, psycopg2.extras

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation,resolution=merge-duplicates",
}
STORE_ID = "5675b037-8fd7-4c78-a9e8-ce459f783e5c"

DB_HOST = os.getenv("IPOS_DB_HOST", "localhost")
DB_PORT = int(os.getenv("IPOS_DB_PORT", "5444"))
DB_NAME = os.getenv("IPOS_DB_NAME", "i4_SAHARAMART")
DB_USER = os.getenv("IPOS_DB_USER", "admin")
DB_PASS = os.getenv("IPOS_DB_PASS", "")

def dec(val):
    if val is None: return 0.0
    if isinstance(val, Decimal): return float(val)
    return float(val)

conn = psycopg2.connect(
    host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
    user=DB_USER, password=DB_PASS, connect_timeout=5,
)
conn.set_client_encoding("UTF8")

cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 60)
print("  DEBUG2 — Diagnosa 400 Error pada Produk")
print("=" * 60)

# ── [1] Cek tipe kolom dateupd di iPOS ───────────────────────
print("\n[1] Tipe kolom dateupd di tbl_item:")
cur.execute("""
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'tbl_item'
      AND column_name IN ('dateupd', 'kodeitem', 'namaitem', 'satuan', 'rak')
    ORDER BY column_name
""")
for row in cur.fetchall():
    print(f"  {row['column_name']:15} → {row['data_type']}"
          + (f" ({row['character_maximum_length']})" if row['character_maximum_length'] else ""))

# ── [2] Ambil 10 produk pertama, tampilkan dateupd ───────────
print("\n[2] Sample dateupd dari 10 produk pertama:")
cur.execute("""
    SELECT kodeitem, namaitem, dateupd, satuan, rak, stokmin
    FROM tbl_item
    WHERE statushapus = '0' OR statushapus IS NULL
    ORDER BY kodeitem
    LIMIT 10
""")
items = cur.fetchall()
for item in items:
    dateupd = item.get("dateupd")
    print(f"  [{item['kodeitem']}] dateupd={repr(dateupd)} type={type(dateupd).__name__}")

# ── [3] Bangun product_data seperti di sync_agent.py ─────────
print("\n[3] Test upsert 10 produk (dengan semua field):")

now = datetime.utcnow().isoformat()
to_upsert = []
for item in items:
    kode = str(item["kodeitem"]).strip()
    if not kode:
        continue

    # Sama persis seperti di sync_agent.py
    dateupd_raw = item.get("dateupd")
    ipos_last_update = str(dateupd_raw or "") or None
    if ipos_last_update == "None":
        ipos_last_update = None

    product_data = {
        "store_id": STORE_ID,
        "barcode": kode,
        "name": str(item.get("namaitem") or kode).strip(),
        "unit": str(item.get("satuan") or "PCS").strip(),
        "hpp": dec(item.get("hargapokok") if "hargapokok" in item else 0),
        "sell_price": dec(item.get("hargajual1") if "hargajual1" in item else 0),
        "shelf_location": str(item.get("rak") or "").strip() or None,
        "is_active": True,
        "is_deleted": False,
        "ipos_kodeitem": kode,
        "ipos_last_update": ipos_last_update,
        "last_synced": now,
    }
    to_upsert.append(product_data)

print(f"  Membangun {len(to_upsert)} rows...")
print(f"  Sample ipos_last_update: {repr(to_upsert[0].get('ipos_last_update') if to_upsert else 'N/A')}")

# Test upsert dengan semua field
r = requests.post(
    f"{SUPABASE_URL}/rest/v1/store_products",
    headers=HEADERS,
    json=to_upsert,
    params={"on_conflict": "store_id,barcode"},
)
print(f"\n  Status: {r.status_code}")
if r.status_code in (200, 201):
    print("  ✅ BERHASIL dengan semua field!")
else:
    print("  ❌ GAGAL!")
    try:
        err = r.json()
        print(f"  message : {err.get('message', '-')}")
        print(f"  details : {err.get('details', '-')}")
        print(f"  hint    : {err.get('hint', '-')}")
        print(f"  code    : {err.get('code', '-')}")
    except:
        print(f"  raw: {r.text[:400]}")

    # ── [4] Cari field mana yang bermasalah ──────────────────
    print("\n[4] Cari field yang menyebabkan error (tes satu per satu):")
    fields_to_skip = []
    optional_fields = ["ipos_last_update", "shelf_location", "unit", "is_active", "is_deleted",
                       "ipos_kodeitem", "last_synced", "hpp", "sell_price"]

    for skip_field in optional_fields:
        test_rows = []
        for row in to_upsert:
            r2 = {k: v for k, v in row.items() if k != skip_field}
            test_rows.append(r2)

        r2_resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/store_products",
            headers=HEADERS,
            json=test_rows,
            params={"on_conflict": "store_id,barcode"},
        )
        if r2_resp.status_code in (200, 201):
            print(f"  ✅ Tanpa '{skip_field}' → BERHASIL! ← INI PENYEBABNYA")
            fields_to_skip.append(skip_field)
            break
        else:
            print(f"  ✗  Tanpa '{skip_field}' → masih {r2_resp.status_code}")

    if not fields_to_skip:
        print("\n  Coba tanpa semua optional fields:")
        minimal_rows = [{"store_id": r["store_id"], "barcode": r["barcode"], "name": r["name"]} for r in to_upsert]
        r3 = requests.post(
            f"{SUPABASE_URL}/rest/v1/store_products",
            headers=HEADERS,
            json=minimal_rows,
            params={"on_conflict": "store_id,barcode"},
        )
        print(f"  Minimal (store_id+barcode+name) → Status {r3.status_code}")
        if r3.status_code not in (200, 201):
            try:
                print(f"  {r3.json()}")
            except:
                print(f"  {r3.text[:200]}")

cur.close()
conn.close()

print("\n" + "=" * 60)
input("Tekan Enter untuk keluar...")

"""
debug.py — Diagnosa lengkap semua masalah sync
Jalankan: python debug.py
"""
import os, sys, json, requests
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

DB_HOST = os.getenv("IPOS_DB_HOST", "localhost")
DB_PORT = int(os.getenv("IPOS_DB_PORT", "5444"))
DB_NAME = os.getenv("IPOS_DB_NAME", "i4_SAHARAMART")
DB_USER = os.getenv("IPOS_DB_USER", "admin")
DB_PASS = os.getenv("IPOS_DB_PASS", "")

print("=" * 60)
print("  DEBUG LENGKAP — Sync Agent Saharamart")
print("=" * 60)

# ── [A] Cek store SM01 di Supabase ────────────────────────────
print("\n[A] CEK STORE DI SUPABASE")
r = requests.get(
    f"{SUPABASE_URL}/rest/v1/stores",
    headers=HEADERS,
    params={"code": "eq.SM01", "select": "id,code,name,ipos_kodekantor,ipos_db_port,is_active"},
)
stores = r.json()
if not stores:
    print("  ❌ Store SM01 tidak ditemukan di Supabase!")
    print("  Jalankan migration SQL terlebih dahulu.")
    store_id = None
else:
    s = stores[0]
    store_id = s["id"]
    print(f"  ✅ Store ditemukan:")
    print(f"     id              = {s['id']}")
    print(f"     code            = {s['code']}")
    print(f"     name            = {s['name']}")
    print(f"     ipos_kodekantor = {s['ipos_kodekantor']}")
    print(f"     ipos_db_port    = {s['ipos_db_port']}")
    print(f"     is_active       = {s['is_active']}")

# ── [B] Cek store_products di Supabase ───────────────────────
print("\n[B] CEK PRODUK DI SUPABASE")
if store_id:
    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/store_products",
        headers={**HEADERS, "Prefer": "count=exact"},
        params={"store_id": f"eq.{store_id}", "select": "id"},
    )
    total_sp = r2.headers.get("Content-Range", "?/?").split("/")[-1]
    print(f"  Total produk di store_products: {total_sp}")
    if total_sp == "0":
        print("  ⚠️  Produk belum tersync — inilah yang perlu diperbaiki")
    else:
        print("  ✅ Ada produk — stock dan sales bisa menggunakan data ini")

# ── [C] Koneksi iPOS ──────────────────────────────────────────
print("\n[C] KONEKSI iPOS")
try:
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS, connect_timeout=5,
    )
    conn.set_client_encoding("UTF8")
    print(f"  ✅ Terhubung ke {DB_HOST}:{DB_PORT}/{DB_NAME} sebagai {DB_USER}")
except Exception as e:
    print(f"  ❌ Gagal: {e}")
    conn = None

# ── [D] Cek supplier tipe ─────────────────────────────────────
print("\n[D] CEK SUPPLIER DI iPOS")
if conn:
    cur = conn.cursor()
    cur.execute("SELECT tipe, COUNT(*) as jml FROM tbl_supel GROUP BY tipe ORDER BY jml DESC")
    rows = cur.fetchall()
    if not rows:
        print("  ❌ tbl_supel kosong!")
    else:
        print("  Nilai tipe yang ada di tbl_supel:")
        for tipe, jml in rows:
            marker = " ← ini yang dipakai sync_agent (filter tipe='S')" if tipe == "S" else ""
            print(f"    tipe={repr(tipe)}  jumlah={jml}{marker}")
        tipes = [r[0] for r in rows]
        if "S" not in tipes:
            print("\n  ⚠️  MASALAH: Tidak ada tipe='S'!")
            print("  Filter di sync_agent: WHERE tipe = 'S' tidak cocok.")
            print(f"  Nilai tipe yang tersedia: {tipes}")
            # Suggest fix
            if tipes:
                print(f"\n  SOLUSI: Ubah filter di sync_suppliers menjadi tipe='{tipes[0]}'")
                print("  atau hapus filter WHERE tipe='S' agar semua supplier masuk.")
        else:
            cur.execute("SELECT COUNT(*) FROM tbl_supel WHERE tipe='S'")
            cnt = cur.fetchone()[0]
            print(f"\n  ✅ Ada {cnt} supplier dengan tipe='S' — filter sudah benar")
    cur.close()

# ── [E] Test upsert 1 produk ke Supabase ──────────────────────
print("\n[E] TEST UPSERT PRODUK KE SUPABASE (diagnosa 400 error)")
if conn and store_id:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT kodeitem, namaitem, satuan, hargapokok, hargajual1
        FROM tbl_item
        WHERE statushapus = '0' OR statushapus IS NULL
        LIMIT 1
    """)
    item = cur.fetchone()
    cur.close()

    if item:
        kode = str(item["kodeitem"]).strip()
        test_row = {
            "store_id": store_id,
            "barcode": kode,
            "name": str(item.get("namaitem") or kode).strip(),
            "unit": str(item.get("satuan") or "PCS").strip(),
            "hpp": float(item.get("hargapokok") or 0),
            "sell_price": float(item.get("hargajual1") or 0),
            "is_active": True,
            "is_deleted": False,
            "ipos_kodeitem": kode,
        }

        print(f"  Data test produk: barcode={kode!r}, name={test_row['name']!r}")

        # Test dengan on_conflict="store_id,barcode" (cara yang BENAR)
        print("\n  [E1] Test dengan on_conflict='store_id,barcode'...")
        r_test = requests.post(
            f"{SUPABASE_URL}/rest/v1/store_products",
            headers=HEADERS,
            json=[test_row],
            params={"on_conflict": "store_id,barcode"},
        )
        if r_test.status_code in (200, 201):
            print(f"  ✅ BERHASIL! Status {r_test.status_code}")
            print("     on_conflict='store_id,barcode' bekerja dengan baik")
        else:
            print(f"  ❌ GAGAL! Status {r_test.status_code}")
            try:
                err = r_test.json()
                print(f"     Error message : {err.get('message', '-')}")
                print(f"     Error details : {err.get('details', '-')}")
                print(f"     Error hint    : {err.get('hint', '-')}")
            except Exception:
                print(f"     Response body : {r_test.text[:300]}")

        # Test dengan on_conflict="id" (cara yang LAMA/SALAH)
        print("\n  [E2] Test dengan on_conflict='id' (cara lama)...")
        r_test2 = requests.post(
            f"{SUPABASE_URL}/rest/v1/store_products",
            headers=HEADERS,
            json=[test_row],
            params={"on_conflict": "id"},
        )
        if r_test2.status_code in (200, 201):
            print(f"  Status {r_test2.status_code} - insert berhasil (tapi duplikat mungkin terjadi!)")
        else:
            print(f"  Status {r_test2.status_code} — {r_test2.text[:200]}")
    else:
        print("  ❌ Tidak ada produk di iPOS untuk ditest")

if conn:
    conn.close()

# ── [F] Ringkasan masalah & solusi ───────────────────────────
print("\n" + "=" * 60)
print("  RINGKASAN MASALAH & SOLUSI")
print("=" * 60)
print("""
  MASALAH 1: Product sync → 400 Bad Request
  ─────────────────────────────────────────
  PENYEBAB : sync_agent.py pakai on_conflict="id" (kode lama)
  SOLUSI   : Jalankan patch.py dulu, lalu sync lagi
             python patch.py

  MASALAH 2: Suppliers → No suppliers found
  ─────────────────────────────────────────
  Lihat hasil [D] di atas untuk tau nilai tipe yang ada.
  Jika tipe bukan 'S', perlu ubah filter di sync_agent.py.

  MASALAH 3: Stock → 0 records
  ─────────────────────────────────────────
  PENYEBAB : Produk belum tersync (Masalah 1 belum solved)
  SOLUSI   : Otomatis fix setelah Masalah 1 selesai

  ✅ SALES → 8 hari data BERHASIL disync!
""")

input("Tekan Enter untuk keluar...")

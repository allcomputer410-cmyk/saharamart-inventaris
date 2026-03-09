"""
verify.py — Verifikasi kelengkapan data iPOS → Supabase
=========================================================
Script ini membandingkan jumlah data di iPOS (sumber)
dengan data yang sudah masuk ke Supabase (tujuan).

Jalankan: python verify.py
"""

import sys
import psycopg2
import psycopg2.extras
import requests
import config

# ── Warna terminal ─────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✅ {msg}{RESET}")
def warn(msg):  print(f"  {YELLOW}⚠️  {msg}{RESET}")
def err(msg):   print(f"  {RED}❌ {msg}{RESET}")
def info(msg):  print(f"  {CYAN}ℹ  {msg}{RESET}")

# ── Koneksi iPOS ───────────────────────────────────────────────
def connect_ipos():
    return psycopg2.connect(
        host=config.IPOS_DB_HOST,
        port=config.IPOS_DB_PORT,
        dbname=config.IPOS_DB_NAME,
        user=config.IPOS_DB_USER,
        password=config.IPOS_DB_PASS,
        connect_timeout=10,
    )

# ── Query Supabase REST API ────────────────────────────────────
def sb_count(table, params=None):
    """Hitung baris di tabel Supabase (dengan pagination)."""
    headers = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "Prefer": "count=exact",
        "Range": "0-0",   # Ambil 0 baris, hanya butuh header Count
    }
    url = f"{config.SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    r = requests.get(url, headers=headers, params=params or {})
    r.raise_for_status()
    # Supabase mengembalikan jumlah di header Content-Range: 0-0/TOTAL
    content_range = r.headers.get("Content-Range", "0-0/0")
    try:
        total = int(content_range.split("/")[-1])
    except Exception:
        total = 0
    return total

def sb_select_all(table, params=None):
    """Ambil semua baris dengan pagination."""
    all_rows = []
    page_size = 1000
    offset = 0
    p = dict(params or {})
    headers = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
    }
    url = f"{config.SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    while True:
        p["limit"] = page_size
        p["offset"] = offset
        r = requests.get(url, headers=headers, params=p)
        r.raise_for_status()
        rows = r.json()
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows

# ── Fungsi bantu ───────────────────────────────────────────────
def pct(a, b):
    if b == 0: return "0%"
    return f"{min(100, round(a/b*100))}%"

def status_line(label, ipos_count, sb_count_val):
    diff = ipos_count - sb_count_val
    pct_str = pct(sb_count_val, ipos_count)
    bar_len = 20
    filled = int(min(bar_len, sb_count_val / max(ipos_count, 1) * bar_len))
    bar = "█" * filled + "░" * (bar_len - filled)

    if diff == 0:
        status = f"{GREEN}LENGKAP{RESET}"
    elif diff <= ipos_count * 0.01:   # toleransi 1%
        status = f"{YELLOW}HAMPIR{RESET}"
    else:
        status = f"{RED}KURANG {diff:,} data{RESET}"

    print(f"  {BOLD}{label:<22}{RESET} [{bar}] {pct_str:>4}  "
          f"iPOS={ipos_count:>6,}  Supabase={sb_count_val:>6,}  {status}")

# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
def main():
    print()
    print(f"{BOLD}{'='*65}{RESET}")
    print(f"{BOLD}  VERIFIKASI DATA iPOS → SUPABASE — SAHARAMART{RESET}")
    print(f"{BOLD}{'='*65}{RESET}")
    print()

    # ── 1. Koneksi ─────────────────────────────────────────────
    print(f"{BOLD}[1/6] Koneksi ke iPOS...{RESET}")
    try:
        ipos = connect_ipos()
        cur = ipos.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        ok(f"iPOS: {config.IPOS_DB_HOST}:{config.IPOS_DB_PORT}/{config.IPOS_DB_NAME}")
    except Exception as e:
        err(f"Gagal konek iPOS: {e}")
        sys.exit(1)

    print(f"{BOLD}[2/6] Koneksi ke Supabase...{RESET}")
    try:
        sb_count("stores")
        ok(f"Supabase: {config.SUPABASE_URL}")
    except Exception as e:
        err(f"Gagal konek Supabase: {e}")
        sys.exit(1)

    # ── 2. Cari store yang cocok dengan iPOS ──────────────────
    # Ambil semua kantor yang ada di iPOS
    cur.execute("SELECT kodekantor, namakantor FROM tbl_kantor ORDER BY kodekantor")
    ipos_kantors = {str(r["kodekantor"]).strip(): r["namakantor"] for r in cur.fetchall()}
    print()
    info(f"Kantor di iPOS: {list(ipos_kantors.keys())}")

    # Ambil semua store di Supabase
    all_stores = sb_select_all("stores", {"select": "id,code,name,ipos_kodekantor,is_active"})
    if not all_stores:
        err("Tidak ada toko di Supabase. Jalankan insert_saharamart.sql dulu.")
        sys.exit(1)

    # Cocokkan: cari store Supabase yang ipos_kodekantor-nya ada di iPOS
    matched_stores = [
        s for s in all_stores
        if s.get("ipos_kodekantor") and s["ipos_kodekantor"] in ipos_kantors
    ]

    if not matched_stores:
        print()
        warn("Tidak ada store di Supabase yang cocok dengan kantor iPOS!")
        print()
        print(f"  Store di Supabase:")
        for s in all_stores:
            print(f"    - {s['code']}: {s['name']} (ipos_kodekantor={s.get('ipos_kodekantor', '-')})")
        print()
        print(f"  Kantor di iPOS: {list(ipos_kantors.keys())}")
        print()
        print(f"  Fix: Update ipos_kodekantor di Supabase agar sesuai dengan kode kantor iPOS di atas.")
        print(f"  SQL: UPDATE stores SET ipos_kodekantor='UTM' WHERE code='SM01';")
        sys.exit(1)

    # Pakai store yang cocok pertama
    store = matched_stores[0]
    store_id  = store["id"]
    kodekantor = store["ipos_kodekantor"]
    info(f"Toko terdeteksi: {store['name']} (code={store['code']}, kantor={kodekantor})")

    # ── 3. Hitung di iPOS ──────────────────────────────────────
    print()
    print(f"{BOLD}[3/6] Menghitung data di iPOS...{RESET}")

    cur.execute("SELECT COUNT(*) as n FROM tbl_item WHERE statushapus='0' OR statushapus IS NULL")
    ipos_products = cur.fetchone()["n"]

    cur.execute("""
        SELECT COUNT(*) as n FROM tbl_item i
        WHERE (i.statushapus='0' OR i.statushapus IS NULL)
    """)
    ipos_stock_items = cur.fetchone()["n"]  # semua produk aktif punya potensi stok

    # Hitung semua supplier di iPOS (tanpa filter tipe — tiap iPOS beda)
    cur.execute("SELECT COUNT(*) as n FROM tbl_supel")
    ipos_suppliers = cur.fetchone()["n"]

    cur.execute("SELECT COUNT(DISTINCT jenis) as n FROM tbl_item WHERE jenis IS NOT NULL AND jenis != ''")
    ipos_categories = cur.fetchone()["n"]

    cur.execute("SELECT COUNT(DISTINCT merek) as n FROM tbl_item WHERE merek IS NOT NULL AND merek != ''")
    ipos_brands = cur.fetchone()["n"]

    cur.execute(f"""
        SELECT COUNT(*) as n FROM tbl_ikhd
        WHERE kodekantor = %s
    """, (kodekantor,))
    ipos_transactions = cur.fetchone()["n"]

    cur.execute(f"""
        SELECT COUNT(DISTINCT DATE(tanggal)) as n FROM tbl_ikhd
        WHERE kodekantor = %s
    """, (kodekantor,))
    ipos_sales_days = cur.fetchone()["n"]

    ok("Selesai hitung iPOS")

    # ── 4. Hitung di Supabase ──────────────────────────────────
    print()
    print(f"{BOLD}[4/6] Menghitung data di Supabase...{RESET}")

    sb_products    = sb_count("store_products", {"store_id": f"eq.{store_id}"})
    sb_stock       = sb_count("stock",          {"store_id": f"eq.{store_id}"})
    sb_suppliers   = sb_count("suppliers")
    sb_categories  = sb_count("categories")
    sb_brands      = sb_count("brands")
    sb_sales_days  = sb_count("daily_sales",    {"store_id": f"eq.{store_id}"})

    ok("Selesai hitung Supabase")

    # ── 5. Bandingkan ──────────────────────────────────────────
    print()
    print(f"{BOLD}[5/6] Perbandingan Data:{RESET}")
    print()
    print(f"  {'Kategori':<22} {'Progress':>22}  {'iPOS':>8}  {'Supabase':>10}  Status")
    print(f"  {'-'*80}")

    status_line("Produk (master)",    ipos_products,       sb_products)
    status_line("Stok produk",        ipos_stock_items,    sb_stock)
    status_line("Supplier",           ipos_suppliers,      sb_suppliers)
    status_line("Kategori",           ipos_categories,     sb_categories)
    status_line("Merek",              ipos_brands,         sb_brands)
    status_line("Hari penjualan",     ipos_sales_days,     sb_sales_days)

    # ── 6. Cek produk yang hilang (sample) ────────────────────
    print()
    print(f"{BOLD}[6/6] Cek produk yang belum masuk Supabase...{RESET}")

    # Ambil semua kodeitem yang ada di Supabase
    sb_items = sb_select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "ipos_kodeitem",
    })
    sb_kodeitems = {r["ipos_kodeitem"] for r in sb_items if r.get("ipos_kodeitem")}

    # Ambil semua kodeitem aktif dari iPOS
    cur.execute("""
        SELECT kodeitem, namaitem FROM tbl_item
        WHERE statushapus='0' OR statushapus IS NULL
        ORDER BY kodeitem
    """)
    ipos_items = cur.fetchall()
    ipos_kodeitems = {str(r["kodeitem"]).strip() for r in ipos_items}

    missing = ipos_kodeitems - sb_kodeitems
    missing_count = len(missing)

    if missing_count == 0:
        ok(f"Semua {ipos_products:,} produk sudah ada di Supabase!")
    else:
        warn(f"{missing_count:,} produk belum masuk Supabase:")
        # Tampilkan max 20 contoh
        sample_missing = [
            r for r in ipos_items
            if str(r["kodeitem"]).strip() in missing
        ][:20]
        for item in sample_missing:
            print(f"    - {str(item['kodeitem']).strip():<20} {item['namaitem']}")
        if missing_count > 20:
            print(f"    ... dan {missing_count - 20} produk lainnya")

    # ── Ringkasan Akhir ────────────────────────────────────────
    print()
    print(f"{BOLD}{'='*65}{RESET}")
    total_ipos = ipos_products + ipos_suppliers + ipos_categories + ipos_brands
    total_sb   = sb_products + sb_suppliers + sb_categories + sb_brands
    overall_pct = pct(total_sb, total_ipos)

    print(f"{BOLD}  KESIMPULAN:{RESET}")
    print()

    if missing_count == 0 and sb_stock >= ipos_stock_items * 0.99:
        print(f"  {GREEN}{BOLD}✅ DATA LENGKAP — Semua data iPOS sudah tersinkron!{RESET}")
    elif missing_count == 0:
        print(f"  {YELLOW}{BOLD}⚠️  Produk lengkap, tapi stok masih kurang.{RESET}")
        print(f"     Jalankan: python sync_agent.py --type stock")
    elif missing_count > 0 and sb_products == 0:
        print(f"  {RED}{BOLD}❌ BELUM ADA DATA — Sync produk dulu!{RESET}")
        print(f"     Jalankan: python sync_agent.py --type products")
    else:
        print(f"  {YELLOW}{BOLD}⚠️  Data belum lengkap ({missing_count:,} produk missing).{RESET}")
        print(f"     Jalankan: python sync_agent.py --type products")
        print(f"     Lalu    : python sync_agent.py --type stock")

    print()
    if sb_sales_days == 0:
        warn("Data penjualan belum ada. Jalankan: python sync_agent.py --type sales")
    else:
        ok(f"Penjualan: {sb_sales_days} hari sudah tersimpan")

    print()
    print(f"{BOLD}{'='*65}{RESET}")
    print()

    cur.close()
    ipos.close()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDibatalkan.")
    input("Tekan Enter untuk keluar...")

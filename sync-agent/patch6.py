"""
patch6.py — Fix sync berhenti di 1000 produk
Penyebab: PostgREST/Supabase default limit 1000 baris per request.
          Saat sync_stock fetch store_products untuk peta produk,
          hanya dapat 1000 dari 6959 — sisanya tidak pernah diproses.
Fix    : Tambah select_all() dengan auto-pagination, ganti 3 fetch besar.
Jalankan: python patch6.py
"""
import os, shutil

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")
if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan!")
    input("Enter..."); raise SystemExit(1)

shutil.copy2(TARGET, TARGET + ".bak6")
print("Backup: sync_agent.py.bak6")

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

results = []

# ── Patch A: Tambah method select_all ke SupabaseClient ──────────────────────
OLD_A = """    def select(self, table: str, params: Optional[dict] = None) -> list:
        r = requests.get(self._url(table), headers=self.headers, params=params or {})
        r.raise_for_status()
        return r.json()"""

NEW_A = """    def select(self, table: str, params: Optional[dict] = None) -> list:
        r = requests.get(self._url(table), headers=self.headers, params=params or {})
        r.raise_for_status()
        return r.json()

    def select_all(self, table: str, params: Optional[dict] = None) -> list:
        \"\"\"Fetch ALL rows with auto-pagination (bypasses PostgREST 1000-row limit).\"\"\"
        all_rows = []
        page_size = 1000
        offset = 0
        p = dict(params or {})
        while True:
            p["limit"] = page_size
            p["offset"] = offset
            rows = self.select(table, p)
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return all_rows"""

if "def select_all(" in src:
    results.append("✅ select_all sudah ada — skip Patch A")
elif OLD_A in src:
    src = src.replace(OLD_A, NEW_A)
    results.append("✅ Patch A: select_all ditambahkan")
else:
    results.append("⚠️  Patch A gagal — pola select() tidak ditemukan, cek manual")

# ── Patch B: sync_products — fetch existing store_products ────────────────────
src = src.replace(
    'existing = sb.select("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem,barcode",\n    })',
    'existing = sb.select_all("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem,barcode",\n    })',
)
results.append("✅ Patch B: sync_products pakai select_all")

# ── Patch C: sync_stock — fetch prod_map ──────────────────────────────────────
src = src.replace(
    'products = sb.select("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem",\n    })',
    'products = sb.select_all("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem",\n    })',
)
results.append("✅ Patch C: sync_stock prod_map pakai select_all")

# ── Patch D: sync_stock — fetch existing stock ────────────────────────────────
src = src.replace(
    'existing_stock = sb.select("stock", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,store_product_id,current_qty",\n    })',
    'existing_stock = sb.select_all("stock", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,store_product_id,current_qty",\n    })',
)
results.append("✅ Patch D: sync_stock existing_stock pakai select_all")

# ── Patch E: sync_sales — fetch prod_map ─────────────────────────────────────
src = src.replace(
    'products = sb.select("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem,hpp",\n    })',
    'products = sb.select_all("store_products", {\n        "store_id": f"eq.{store_id}",\n        "select": "id,ipos_kodeitem,hpp",\n    })',
)
results.append("✅ Patch E: sync_sales prod_map pakai select_all")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print()
print("=" * 60)
print("  HASIL PATCH6")
print("=" * 60)
for r in results:
    print(f"  {r}")
print()
print("  Jalankan sync ulang:")
print("  python sync_agent.py --type products")
print("  python sync_agent.py --type stock")
print("=" * 60)
input("\nTekan Enter untuk keluar...")

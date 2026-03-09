"""
patch3.py — Fix: "All object keys must match" pada batch produk
Penyebab: category_id/brand_id/supplier_id hanya ada di sebagian row
Fix    : Selalu include semua key (None jika tidak ada data)
Jalankan: python patch3.py
"""
import os, shutil

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")
if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan!")
    input("Enter..."); raise SystemExit(1)

shutil.copy2(TARGET, TARGET + ".bak3")
print("Backup: sync_agent.py.bak3")

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

# ── Blok lama: category/brand/supplier ditambah secara kondisional ────────────
OLD = '''        product_data = {
            "store_id": store_id,
            "barcode": kode,
            "name": str(item.get("namaitem") or kode).strip(),
            "unit": str(item.get("satuan") or "PCS").strip(),
            "hpp": dec(item.get("hargapokok")),
            "sell_price": dec(item.get("hargajual1")),
            "shelf_location": str(item.get("rak") or "").strip() or None,
            "is_active": str(item.get("statusjual")) != "1",
            "is_deleted": False,
            "ipos_kodeitem": kode,
            "ipos_supplier_code": str(item.get("supplier1") or "").strip() or None,
            "last_synced": now,
        }

        # Map category
        jenis = str(item.get("jenis") or "").strip()
        if jenis and jenis in cat_map:
            product_data["category_id"] = cat_map[jenis]

        # Map brand
        merek = str(item.get("merek") or "").strip()
        if merek and merek in brand_map:
            product_data["brand_id"] = brand_map[merek]

        # Map supplier
        sup_code = str(item.get("supplier1") or "").strip()
        if sup_code and sup_code in sup_map:
            product_data["supplier_id"] = sup_map[sup_code]'''

# ── Blok baru: semua key selalu ada (PostgREST requirement) ──────────────────
NEW = '''        # Map category, brand, supplier — selalu None jika tidak ditemukan
        # (PostgREST butuh semua row punya key yang sama persis)
        jenis = str(item.get("jenis") or "").strip()
        merek = str(item.get("merek") or "").strip()
        sup_code = str(item.get("supplier1") or "").strip()

        product_data = {
            "store_id": store_id,
            "barcode": kode,
            "name": str(item.get("namaitem") or kode).strip(),
            "unit": str(item.get("satuan") or "PCS").strip(),
            "hpp": dec(item.get("hargapokok")),
            "sell_price": dec(item.get("hargajual1")),
            "shelf_location": str(item.get("rak") or "").strip() or None,
            "is_active": str(item.get("statusjual")) != "1",
            "is_deleted": False,
            "ipos_kodeitem": kode,
            "ipos_supplier_code": sup_code or None,
            "category_id": cat_map.get(jenis) if jenis else None,
            "brand_id": brand_map.get(merek) if merek else None,
            "supplier_id": sup_map.get(sup_code) if sup_code else None,
            "last_synced": now,
        }'''

if OLD in src:
    src = src.replace(OLD, NEW)
    result = "✅ Fix berhasil — semua key produk sekarang konsisten"
elif '"category_id": cat_map.get(jenis)' in src:
    result = "✅ SUDAH OK — fix sudah diterapkan sebelumnya"
else:
    result = "⚠️  Pola tidak ditemukan persis — cek manual sync_agent.py baris ~244"

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print()
print("=" * 55)
print("  HASIL PATCH3")
print("=" * 55)
print(f"  {result}")
print()
print("  Sekarang jalankan:")
print("  python sync_agent.py --type full")
print("=" * 55)
input("\nTekan Enter untuk keluar...")

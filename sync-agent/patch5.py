"""
patch5.py — Fix stok produk yang kosong di aplikasi
Penyebab: sync hanya ambil dari tbl_itemstok, padahal
          banyak produk stoknya ada di tbl_item.stok
Fix    : LEFT JOIN ke tbl_itemstok, fallback ke tbl_item.stok
Jalankan: python patch5.py
"""
import os, shutil

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")
if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan!")
    input("Enter..."); raise SystemExit(1)

shutil.copy2(TARGET, TARGET + ".bak5")
print("Backup: sync_agent.py.bak5")

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

OLD = """        SELECT s.kodeitem, s.stok, i.stokmin
        FROM tbl_itemstok s
        JOIN tbl_item i ON i.kodeitem = s.kodeitem
        WHERE s.kantor = %s
          AND (i.statushapus = '0' OR i.statushapus IS NULL)"""

NEW = """        SELECT i.kodeitem,
               COALESCE(s.stok, i.stok, 0) AS stok,
               i.stokmin
        FROM tbl_item i
        LEFT JOIN tbl_itemstok s ON s.kodeitem = i.kodeitem AND s.kantor = %s
        WHERE (i.statushapus = '0' OR i.statushapus IS NULL)"""

if OLD in src:
    src = src.replace(OLD, NEW)
    result = "✅ Fix berhasil — semua stok produk sekarang disync (termasuk tbl_item.stok)"
elif "COALESCE(s.stok, i.stok" in src:
    result = "✅ SUDAH OK — fix sudah ada sebelumnya"
else:
    result = "⚠️  Pola tidak ditemukan — cek manual fungsi sync_stock"

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print()
print("=" * 60)
print("  HASIL PATCH5")
print("=" * 60)
print(f"  {result}")
print()
print("  Jalankan sync ulang untuk update semua stok:")
print("  python sync_agent.py --type stock")
print("=" * 60)
input("\nTekan Enter untuk keluar...")

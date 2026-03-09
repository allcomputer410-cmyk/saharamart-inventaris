"""
patch_purchases.py
==================
Jalankan SEKALI di PC kasir untuk sync data pembelian dari iPOS ke Supabase.
Setelah ini, sync otomatis akan berjalan tiap 2 menit via daemon.

Cara pakai:
  python patch_purchases.py

Perintah ini mensync 90 hari terakhir pembelian (sekitar 133 faktur).
"""

import subprocess, sys

print("=" * 60)
print("  Sync Pembelian Masuk: iPOS → Supabase")
print("  Mensync data tbl_imhd + tbl_imdt (90 hari terakhir)")
print("=" * 60)
print()

result = subprocess.run(
    [sys.executable, "sync_agent.py", "--type", "purchases"],
    capture_output=False,
)

print()
if result.returncode == 0:
    print("✓ Selesai! Data pembelian sudah masuk ke Supabase.")
    print("  Buka halaman 'Pembelian Masuk' di aplikasi untuk lihat hasilnya.")
else:
    print("✗ Ada error. Cek output di atas atau lihat sync_agent.log")

"""
patch2.py — Fix lanjutan: supplier tipe + produk 400 error
Jalankan: python patch2.py
"""
import os, shutil

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")

if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan!")
    input("Enter untuk keluar..."); raise SystemExit(1)

shutil.copy2(TARGET, TARGET + ".bak2")
print("Backup dibuat: sync_agent.py.bak2")

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

changes = []

# ════════════════════════════════════════════════════════════
# FIX A: Supplier filter tipe='S' → tipe IN ('S','SU')
# Data real di iPOS Saharamart pakai tipe='SU' bukan 'S'
# ════════════════════════════════════════════════════════════
OLD_A1 = "        WHERE tipe = 'S'\n        ORDER BY kode"
NEW_A1 = "        WHERE tipe IN ('S', 'SU')\n        ORDER BY kode"
if OLD_A1 in src:
    src = src.replace(OLD_A1, NEW_A1)
    changes.append("Fix A: Filter supplier tipe='S' → IN ('S','SU')")
elif "tipe IN ('S', 'SU')" in src:
    changes.append("Fix A: SUDAH OK (filter supplier sudah benar)")
else:
    print("  SKIP Fix A: pola tidak ditemukan — cek manual!")

# ════════════════════════════════════════════════════════════
# FIX B: Hapus ipos_last_update dari product_data
# Kolom ini menyebabkan 400 karena format tanggal iPOS
# tidak kompatibel dengan TIMESTAMPTZ Supabase
# ════════════════════════════════════════════════════════════
# Hapus baris ipos_last_update dari dict product_data
OLD_B = (
    '            "ipos_last_update": str(item.get("dateupd") or "") or None,\n'
)
if OLD_B in src:
    src = src.replace(OLD_B, "")
    changes.append("Fix B: Hapus ipos_last_update dari product_data (format tgl tidak kompatibel)")
elif '"ipos_last_update"' not in src:
    changes.append("Fix B: SUDAH OK (ipos_last_update sudah tidak ada)")
else:
    # Fallback: hapus semua variant
    import re
    new_src = re.sub(r'\s*"ipos_last_update"\s*:.*?,?\n', '\n', src)
    if new_src != src:
        src = new_src
        changes.append("Fix B (regex): Hapus ipos_last_update dari product_data")
    else:
        print("  SKIP Fix B: tidak bisa menemukan ipos_last_update — cek manual!")

# ════════════════════════════════════════════════════════════
# FIX C: Tambah verbose error logging di upsert method
# Agar error 400 berikutnya langsung kelihatan penyebabnya
# ════════════════════════════════════════════════════════════
OLD_C = (
    "    def upsert(self, table: str, rows: list, on_conflict: str = \"\") -> list:\n"
    "        headers = {**self.headers, \"Prefer\": \"return=representation,resolution=merge-duplicates\"}\n"
    "        params = {}\n"
    "        if on_conflict:\n"
    "            params[\"on_conflict\"] = on_conflict\n"
    "        r = requests.post(self._url(table), headers=headers, json=rows, params=params)\n"
    "        r.raise_for_status()\n"
    "        return r.json()"
)
NEW_C = (
    "    def upsert(self, table: str, rows: list, on_conflict: str = \"\") -> list:\n"
    "        headers = {**self.headers, \"Prefer\": \"return=representation,resolution=merge-duplicates\"}\n"
    "        params = {}\n"
    "        if on_conflict:\n"
    "            params[\"on_conflict\"] = on_conflict\n"
    "        r = requests.post(self._url(table), headers=headers, json=rows, params=params)\n"
    "        if not r.ok:\n"
    "            try:\n"
    "                err = r.json()\n"
    "                log.error(f\"Supabase {table} error {r.status_code}: \"\n"
    "                          f\"{err.get('message','')} | {err.get('details','')}\")\n"
    "            except Exception:\n"
    "                log.error(f\"Supabase {table} error {r.status_code}: {r.text[:300]}\")\n"
    "        r.raise_for_status()\n"
    "        return r.json()"
)
if OLD_C in src:
    src = src.replace(OLD_C, NEW_C)
    changes.append("Fix C: Tambah verbose error di upsert (error body langsung terlihat)")
elif "err.get('message','')" in src:
    changes.append("Fix C: SUDAH OK (verbose error sudah ada)")
else:
    print("  SKIP Fix C: pola upsert tidak ditemukan persis — skip verbose logging")

# ── Tulis hasil ───────────────────────────────────────────────
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print()
print("=" * 55)
print("  HASIL PATCH2")
print("=" * 55)
if changes:
    for c in changes:
        print(f"  ✅ {c}")
else:
    print("  ⚠️  Tidak ada perubahan")
print()
print("  Sekarang jalankan:")
print("  python sync_agent.py --type full")
print("=" * 55)
input("\nTekan Enter untuk keluar...")

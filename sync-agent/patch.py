"""
patch.py — Perbaiki sync_agent.py secara otomatis
Jalankan: python patch.py
"""
import os, shutil

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")

if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan di folder ini!")
    input("Tekan Enter untuk keluar...")
    raise SystemExit(1)

# Backup dulu
backup = TARGET + ".bak"
shutil.copy2(TARGET, backup)
print(f"Backup dibuat: sync_agent.py.bak")

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

changes = []

# ── Fix 1: Hapus kolom hp dari SELECT tbl_supel ──────────────────────────────
OLD1 = "        SELECT kode, nama, alamat, kota, telepon, hp, email, kontak, tipe"
NEW1 = "        SELECT kode, nama, alamat, kota, telepon, email, kontak, tipe"
if OLD1 in src:
    src = src.replace(OLD1, NEW1)
    changes.append("Fix 1: Hapus kolom hp dari SELECT tbl_supel")
elif "telepon, email, kontak" in src:
    changes.append("Fix 1: SUDAH OK (hp sudah tidak ada)")
else:
    print("  SKIP Fix 1: pola tidak ditemukan")

# ── Fix 2: on_conflict="id" → on_conflict="store_id,barcode" ─────────────────
OLD2 = 'sb.upsert("store_products", batch, on_conflict="id")'
NEW2 = 'sb.upsert("store_products", batch, on_conflict="store_id,barcode")'
if OLD2 in src:
    src = src.replace(OLD2, NEW2)
    changes.append('Fix 2: on_conflict "id" → "store_id,barcode"')
elif 'on_conflict="store_id,barcode"' in src:
    changes.append("Fix 2: SUDAH OK (on_conflict sudah benar)")
else:
    print("  SKIP Fix 2: pola tidak ditemukan")

# ── Fix 3: Hapus baris fallback upsert (jika ada) ───────────────────────────
# Pola lama: ada upsert kedua dengan on_conflict="store_id,barcode" sebagai fallback
OLD3 = (
    '        sb.upsert("store_products", batch, on_conflict="id")\n'
    '        except Exception:\n'
    '            # Fallback'
)
if OLD3 in src:
    # Cukup biarkan Fix 2 yang handle, pola ini sudah tidak relevan
    changes.append("Fix 3: Fallback logic ditemukan tapi Fix 2 sudah menangani")

# ── Fix 4: AND kantor = %s → AND kodekantor = %s (tbl_ikhd header) ──────────
OLD4 = "          AND kantor = %s\n        GROUP BY DATE(tanggal)"
NEW4 = "          AND kodekantor = %s\n        GROUP BY DATE(tanggal)"
if OLD4 in src:
    src = src.replace(OLD4, NEW4)
    changes.append("Fix 4: AND kantor → AND kodekantor (tbl_ikhd header)")
elif "AND kodekantor = %s\n        GROUP BY DATE(tanggal)" in src:
    changes.append("Fix 4: SUDAH OK (kodekantor sudah benar di header)")
else:
    print("  SKIP Fix 4: pola tidak ditemukan")

# ── Fix 5: AND h.kantor = %s → AND h.kodekantor = %s (tbl_ikdt join) ────────
OLD5 = "              AND h.kantor = %s"
NEW5 = "              AND h.kodekantor = %s"
if OLD5 in src:
    src = src.replace(OLD5, NEW5)
    changes.append("Fix 5: AND h.kantor → AND h.kodekantor (tbl_ikdt join)")
elif "AND h.kodekantor = %s" in src:
    changes.append("Fix 5: SUDAH OK (h.kodekantor sudah benar di detail)")
else:
    print("  SKIP Fix 5: pola tidak ditemukan")

# ── Tulis hasil ───────────────────────────────────────────────────────────────
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print()
print("=" * 50)
print("  HASIL PATCH")
print("=" * 50)
if changes:
    for c in changes:
        print(f"  ✅ {c}")
else:
    print("  ⚠️  Tidak ada perubahan yang dilakukan")
print()
print("  sync_agent.py sudah diperbaiki!")
print("  Sekarang jalankan:")
print("  python sync_agent.py --type full")
print("=" * 50)
input("\nTekan Enter untuk keluar...")

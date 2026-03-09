"""
patch4.py — Fix batch produk "All object keys must match"
Jalankan: python patch4.py
"""
import os, shutil, re

TARGET = os.path.join(os.path.dirname(__file__), "sync_agent.py")
if not os.path.exists(TARGET):
    print("ERROR: sync_agent.py tidak ditemukan!")
    input("Enter..."); raise SystemExit(1)

with open(TARGET, "r", encoding="utf-8") as f:
    lines = f.readlines()

# ── Tampilkan sekitar baris upsert store_products ─────────────
print("Mencari baris upsert store_products...")
target_lines = []
for i, line in enumerate(lines):
    if 'upsert' in line and 'store_products' in line:
        start = max(0, i - 6)
        end = min(len(lines), i + 3)
        target_lines.append((i, start, end))

if not target_lines:
    print("TIDAK DITEMUKAN baris upsert store_products!")
    input("Enter..."); raise SystemExit(1)

for (idx, start, end) in target_lines:
    print(f"\n--- Baris {start+1} sampai {end+1} ---")
    for j in range(start, end):
        marker = ">>>" if j == idx else "   "
        print(f"  {marker} {j+1:4d}: {lines[j]}", end="")

# ── Apply fix: insert row.pop sebelum upsert store_products ──
shutil.copy2(TARGET, TARGET + ".bak4")
print(f"\n\nBackup: sync_agent.py.bak4")

fixed = False
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Cek apakah ini baris upsert store_products
    if 'upsert' in line and 'store_products' in line and 'on_conflict' in line:
        # Cek apakah baris sebelumnya sudah ada row.pop
        prev_block = "".join(lines[max(0, i-5):i])
        if 'row.pop("id"' in prev_block or "row.pop('id'" in prev_block:
            new_lines.append(line)
            print(f"\nBaris {i+1}: row.pop sudah ada — skip")
        else:
            # Ambil indentasi dari baris ini
            indent = len(line) - len(line.lstrip())
            indent_str = " " * indent
            # Sisipkan row.pop sebelum upsert
            new_lines.append(indent_str + 'for row in batch:\n')
            new_lines.append(indent_str + '    row.pop("id", None)\n')
            new_lines.append(line)
            fixed = True
            print(f"\nBaris {i+1}: ✅ Sisipkan row.pop sebelum upsert store_products")
    else:
        new_lines.append(line)
    i += 1

with open(TARGET, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print()
print("=" * 55)
print("  HASIL PATCH4")
print("=" * 55)
if fixed:
    print("  ✅ Fix berhasil — row.pop(id) ditambahkan")
else:
    print("  ✅ SUDAH OK — tidak perlu perubahan")
print()
print("  Jalankan sekarang:")
print("  python sync_agent.py --daemon")
print("=" * 55)
input("\nTekan Enter untuk keluar...")

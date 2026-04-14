-- ════════════════════════════════════════════════════════════════
-- FIX: Unique constraint notransaksi → per-toko
-- Jalankan di: Supabase Dashboard → SQL Editor
--
-- MASALAH:
--   sales_transactions.notransaksi   → UNIQUE GLOBAL (bahaya multi-toko!)
--   purchases.ipos_notransaksi       → UNIQUE GLOBAL (bahaya multi-toko!)
--
--   Jika dua toko memakai nomor nota yang sama (misal: 000001),
--   UPSERT sync agent akan menimpa data toko pertama dengan toko kedua.
--
-- SOLUSI:
--   Ubah constraint menjadi UNIQUE(store_id, notransaksi)
--   sehingga nomor yang sama boleh ada di toko berbeda.
--
-- AMAN DIJALANKAN:
--   ✅ Tidak hapus data existing (hanya ubah constraint)
--   ✅ Data Saharamart tidak berubah sama sekali
--   ✅ Jalankan SEBELUM sync agent Arafamart pertama kali
-- ════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────
-- 1. sales_transactions
-- ────────────────────────────────────────────────────────────────

-- Hapus constraint GLOBAL lama
ALTER TABLE sales_transactions
  DROP CONSTRAINT IF EXISTS sales_transactions_notransaksi_key;

-- Tambah constraint baru: UNIQUE per-toko
ALTER TABLE sales_transactions
  ADD CONSTRAINT sales_transactions_store_notransaksi_key
  UNIQUE (store_id, notransaksi);

-- Index untuk performa JOIN di v_rekap_kasir (notransaksi saja, tanpa store_id)
CREATE INDEX IF NOT EXISTS idx_sales_transactions_notransaksi
  ON sales_transactions (notransaksi);


-- ────────────────────────────────────────────────────────────────
-- 2. purchases
-- ────────────────────────────────────────────────────────────────

-- Hapus constraint GLOBAL lama
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_ipos_notransaksi_key;

-- Tambah constraint baru: UNIQUE per-toko
ALTER TABLE purchases
  ADD CONSTRAINT purchases_store_ipos_notransaksi_key
  UNIQUE (store_id, ipos_notransaksi);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_purchases_ipos_notransaksi
  ON purchases (ipos_notransaksi);


-- ────────────────────────────────────────────────────────────────
-- 3. Verifikasi: cek constraint yang aktif
-- ────────────────────────────────────────────────────────────────

SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_name = tc.table_name
WHERE tc.table_name IN ('sales_transactions', 'purchases')
  AND tc.constraint_type = 'UNIQUE'
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name;

-- Hasil yang DIHARAPKAN setelah migration:
-- sales_transactions | sales_transactions_store_notransaksi_key | UNIQUE | store_id, notransaksi
-- purchases          | purchases_store_ipos_notransaksi_key     | UNIQUE | store_id, ipos_notransaksi

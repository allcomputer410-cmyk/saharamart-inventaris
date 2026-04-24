-- Tambah kolom exclude_from_report ke store_products
-- Digunakan untuk menyembunyikan produk non-revenue (plastik kresek, bonus item, dll)
-- dari laporan terlaris, rekomendasi promo, dan analisis trend

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS exclude_from_report BOOLEAN NOT NULL DEFAULT FALSE;

-- Index untuk query performa
CREATE INDEX IF NOT EXISTS idx_store_products_exclude
  ON store_products (store_id, exclude_from_report)
  WHERE exclude_from_report = TRUE;

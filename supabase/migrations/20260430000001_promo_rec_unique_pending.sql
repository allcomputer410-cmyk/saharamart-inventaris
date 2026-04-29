-- Bersihkan duplikat pending dulu (keep yang analyzed_at terbaru per store+produk)
-- Approved & rejected TIDAK tersentuh
DELETE FROM promo_recommendations
WHERE status = 'pending'
  AND id NOT IN (
    SELECT DISTINCT ON (store_id, store_product_id) id
    FROM promo_recommendations
    WHERE status = 'pending'
    ORDER BY store_id, store_product_id, analyzed_at DESC NULLS LAST
  );

-- Tambah unique constraint: satu produk hanya boleh 1 rekomendasi pending per toko
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_rec_unique_pending
  ON promo_recommendations (store_id, store_product_id)
  WHERE status = 'pending';

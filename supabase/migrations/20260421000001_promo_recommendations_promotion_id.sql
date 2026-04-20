-- Tambah kolom promotion_id ke promo_recommendations
-- Diperlukan untuk tracking link rekomendasi ↔ promo yang dibuat
-- ON DELETE SET NULL: jika promo dihapus, kolom ini null saja (tidak hapus rekomendasi)

ALTER TABLE promo_recommendations
  ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promo_rec_promotion ON promo_recommendations(promotion_id);

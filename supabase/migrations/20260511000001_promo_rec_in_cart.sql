-- Tambah kolom in_cart untuk fitur keranjang promo
ALTER TABLE promo_recommendations
  ADD COLUMN IF NOT EXISTS in_cart boolean DEFAULT false;

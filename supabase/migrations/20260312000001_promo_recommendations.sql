-- Tabel untuk menyimpan hasil analisis Promo Intelligence Engine
CREATE TABLE IF NOT EXISTS promo_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  store_product_id UUID REFERENCES store_products(id) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',   -- pending|approved|rejected
  priority VARCHAR(20) DEFAULT 'suggested', -- urgent|suggested|optional
  promo_type VARCHAR(20) NOT NULL,         -- discount|bundle|bxgy|min_purchase|flash_sale
  reason TEXT,
  -- Product snapshot
  product_name TEXT NOT NULL,
  product_barcode VARCHAR(100),
  hpp NUMERIC(20,3) DEFAULT 0,
  sell_price NUMERIC(20,3) DEFAULT 0,
  current_stock NUMERIC(20,3) DEFAULT 0,
  days_no_sale INTEGER DEFAULT 0,
  -- Auto-calculated params (JSONB — berisi semua angka spesifik per tipe)
  params JSONB NOT NULL DEFAULT '{}',
  -- Estimasi
  est_revenue NUMERIC(20,3) DEFAULT 0,
  est_profit NUMERIC(20,3) DEFAULT 0,
  loss_if_no_promo NUMERIC(20,3) DEFAULT 0,
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_rec_store ON promo_recommendations(store_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_rec_product ON promo_recommendations(store_product_id);

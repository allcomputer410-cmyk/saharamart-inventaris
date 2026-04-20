-- Tabel diskon produk dari iPOS (tbl_itemdisp + tbl_itemdispdt)
-- Diisi oleh sync agent, dibaca aplikasi untuk deteksi "Sedang Diskon"

CREATE TABLE IF NOT EXISTS store_item_discounts (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id          UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_product_id  UUID        REFERENCES store_products(id),
  ipos_kodeitem     VARCHAR(100),
  ipos_iddiskon     VARCHAR(50),
  jenis             VARCHAR(50),
  merek             VARCHAR(50),
  tgl_dari          TIMESTAMPTZ,
  tgl_sampai        TIMESTAMPTZ,
  jam_dari          TIME,
  jam_sampai        TIME,
  diskon1           NUMERIC(20,3)  DEFAULT 0,
  diskon2           NUMERIC(20,3)  DEFAULT 0,
  diskon3           NUMERIC(20,3)  DEFAULT 0,
  diskon4           NUMERIC(20,3)  DEFAULT 0,
  disknom1          NUMERIC(20,3)  DEFAULT 0,
  disknom2          NUMERIC(20,3)  DEFAULT 0,
  disknom3          NUMERIC(20,3)  DEFAULT 0,
  disknom4          NUMERIC(20,3)  DEFAULT 0,
  hari_berlaku      JSONB,         -- {w1..w7: bool} hari dalam seminggu
  is_active         BOOLEAN        DEFAULT false,
  prioritas         INTEGER        DEFAULT 0,
  synced_at         TIMESTAMPTZ    DEFAULT NOW(),
  created_at        TIMESTAMPTZ    DEFAULT NOW(),

  CONSTRAINT store_item_discounts_unique UNIQUE (store_id, ipos_iddiskon, ipos_kodeitem)
);

CREATE INDEX IF NOT EXISTS idx_sid_store_id        ON store_item_discounts(store_id);
CREATE INDEX IF NOT EXISTS idx_sid_store_product   ON store_item_discounts(store_product_id);
CREATE INDEX IF NOT EXISTS idx_sid_is_active       ON store_item_discounts(is_active);
CREATE INDEX IF NOT EXISTS idx_sid_tgl             ON store_item_discounts(tgl_dari, tgl_sampai);

ALTER TABLE store_item_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sid_select" ON store_item_discounts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sid_service" ON store_item_discounts
  FOR ALL TO service_role USING (true);

-- ════════════════════════════════════════════════════════
-- INVENTARIS MULTI-TOKO v7.0 — PostgreSQL Schema
-- iPOS 4 Compatible (tipe data disamakan)
-- ════════════════════════════════════════════════════════

-- CORE TABLES

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,      -- mapping: tbl_kantor.kodekantor
  name VARCHAR(200) NOT NULL,            -- mapping: tbl_kantor.namakantor
  address TEXT,                          -- mapping: tbl_kantor.alamat
  phone VARCHAR(150),                    -- mapping: tbl_kantor.notelepon
  type VARCHAR(20) DEFAULT 'toko',       -- 'toko' | 'gudang' | 'pusat'
  ipos_kodekantor VARCHAR(50),           -- DIRECT MAPPING to tbl_kantor.kodekantor
  ipos_db_host VARCHAR(100),             -- IP/host PC kasir untuk sync
  ipos_db_port INTEGER DEFAULT 5432,     -- Port PostgreSQL iPOS
  ipos_db_name VARCHAR(50),              -- Database name iPOS
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,      -- mapping: tbl_itemjenis.jenis
  name VARCHAR(100),                     -- mapping: tbl_itemjenis.ketjenis
  ipos_jenis VARCHAR(50)                 -- exact value from iPOS
);

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,      -- mapping: tbl_itemmerek.merek
  name VARCHAR(100)                      -- mapping: tbl_itemmerek.ketmerek
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,      -- mapping: tbl_itemsatuan.satuan
  description VARCHAR(100),              -- mapping: tbl_itemsatuan.ketsatuan
  conversion NUMERIC(20,3) DEFAULT 0,    -- mapping: tbl_itemsatuan.konversi
  base_unit VARCHAR(50),                 -- mapping: tbl_itemsatuan.satuankonversi
  is_primary BOOLEAN DEFAULT false       -- mapping: tbl_itemsatuan.utama
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,            -- mapping: tbl_supel.nama
  type VARCHAR(2) DEFAULT 'S',           -- mapping: tbl_supel.tipe (S=Supplier,P=Pelanggan)
  address TEXT,                          -- mapping: tbl_supel.alamat
  city VARCHAR(100),                     -- mapping: tbl_supel.kota
  phone VARCHAR(200),                    -- mapping: tbl_supel.telepon
  email VARCHAR(200),                    -- mapping: tbl_supel.email
  contact_person VARCHAR(200),           -- mapping: tbl_supel.kontak
  ipos_kode VARCHAR(50),                 -- DIRECT MAPPING to tbl_supel.kode
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE store_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  UNIQUE(store_id, supplier_id)
);

-- PRODUCT TABLES

CREATE TABLE product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode VARCHAR(100) UNIQUE NOT NULL,  -- mapping: tbl_item.kodeitem
  name TEXT NOT NULL,                    -- mapping: tbl_item.namaitem
  category_id UUID REFERENCES categories(id),
  brand_id UUID REFERENCES brands(id),
  unit_id UUID REFERENCES units(id),
  default_supplier_id UUID REFERENCES suppliers(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_catalog_barcode ON product_catalog(barcode);

CREATE TABLE store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  catalog_id UUID REFERENCES product_catalog(id),
  barcode VARCHAR(100) NOT NULL,         -- mapping: tbl_item.kodeitem
  name TEXT NOT NULL,                    -- mapping: tbl_item.namaitem
  category_id UUID REFERENCES categories(id),
  brand_id UUID REFERENCES brands(id),
  unit VARCHAR(50),                      -- mapping: tbl_item.satuan
  hpp NUMERIC(20,3) DEFAULT 0,           -- mapping: tbl_item.hargapokok (TIPE SAMA!)
  sell_price NUMERIC(20,3) DEFAULT 0,    -- mapping: tbl_item.hargajual1 (TIPE SAMA!)
  supplier_id UUID REFERENCES suppliers(id),
  shelf_location VARCHAR(100),           -- mapping: tbl_item.rak
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,      -- mapping: tbl_item.statushapus
  ipos_kodeitem VARCHAR(100),            -- DIRECT MAPPING to tbl_item.kodeitem
  ipos_supplier_code VARCHAR(50),        -- DIRECT MAPPING to tbl_item.supplier1
  ipos_last_update TIMESTAMPTZ,          -- mapping: tbl_item.dateupd
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, barcode)
);

CREATE INDEX idx_sp_store_barcode ON store_products(store_id, barcode);
CREATE INDEX idx_sp_ipos ON store_products(ipos_kodeitem);

CREATE TABLE stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  store_product_id UUID REFERENCES store_products(id) NOT NULL,
  current_qty NUMERIC(20,3) DEFAULT 0,   -- mapping: tbl_itemstok.stok (TIPE SAMA!)
  max_qty NUMERIC(20,3) DEFAULT 0,       -- user-set (tidak ada di iPOS)
  min_qty NUMERIC(20,3) DEFAULT 0,       -- mapping: tbl_item.stokmin
  last_synced TIMESTAMPTZ,
  UNIQUE(store_id, store_product_id)
);

CREATE INDEX idx_stock_critical ON stock(store_id) WHERE current_qty <= min_qty;

-- ORDER TABLES

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) NOT NULL,
  do_number VARCHAR(50) UNIQUE NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'draft',    -- draft|ordered|partial|complete|cancelled
  sent_at TIMESTAMPTZ, sent_via VARCHAR(20),
  notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  store_product_id UUID REFERENCES store_products(id) NOT NULL,
  qty_ordered NUMERIC(20,3) NOT NULL,
  qty_received NUMERIC(20,3) DEFAULT 0,
  hpp_at_order NUMERIC(20,3),
  status VARCHAR(20) DEFAULT 'pending',  -- pending|received|partial|cancelled
  received_at TIMESTAMPTZ, received_by UUID, notes TEXT
);

-- SALES TABLES (sync dari tbl_ikhd/tbl_ikdt)

CREATE TABLE daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  sale_date DATE NOT NULL,
  total_transactions INTEGER DEFAULT 0,
  total_revenue NUMERIC(20,3) DEFAULT 0,
  total_items_sold NUMERIC(20,3) DEFAULT 0,
  total_profit NUMERIC(20,3) DEFAULT 0,
  synced_at TIMESTAMPTZ,
  UNIQUE(store_id, sale_date)
);

CREATE TABLE daily_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_sale_id UUID REFERENCES daily_sales(id) ON DELETE CASCADE,
  store_product_id UUID REFERENCES store_products(id),
  qty_sold NUMERIC(20,3) DEFAULT 0,
  revenue NUMERIC(20,3) DEFAULT 0,
  hpp_total NUMERIC(20,3) DEFAULT 0,
  profit NUMERIC(20,3) DEFAULT 0,
  avg_sell_price NUMERIC(20,3) DEFAULT 0
);

-- PROMO TABLES (feature_enabled=false) — mimic tbl_itemdisp

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),   -- NULL = semua toko
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,             -- discount|bundle|bxgy|min_purchase|flash_sale
  start_date DATE, end_date DATE,
  start_time TIME, end_time TIME,        -- mapping: tbl_itemdisp.jamdari/jamsampai
  active_days JSONB DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":true,"sun":true}',
  status VARCHAR(20) DEFAULT 'draft',
  priority INTEGER DEFAULT 10,           -- mapping: tbl_itemdisp.prioritas
  max_usage INTEGER, current_usage INTEGER DEFAULT 0,
  feature_enabled BOOLEAN DEFAULT false,  -- DISABLED sampai Fase 6
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promo_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  discount_pct_1 NUMERIC(20,3) DEFAULT 0, -- mapping: pot1
  discount_pct_2 NUMERIC(20,3) DEFAULT 0, -- mapping: pot2
  discount_pct_3 NUMERIC(20,3) DEFAULT 0, -- mapping: pot3
  discount_pct_4 NUMERIC(20,3) DEFAULT 0, -- mapping: pot4
  discount_nom_1 NUMERIC(40,20) DEFAULT 0, -- mapping: disknom1
  discount_nom_2 NUMERIC(40,20) DEFAULT 0,
  discount_nom_3 NUMERIC(40,20) DEFAULT 0,
  discount_nom_4 NUMERIC(40,20) DEFAULT 0,
  min_qty NUMERIC(20,3) DEFAULT 0,
  free_qty NUMERIC(20,3) DEFAULT 0,
  min_purchase NUMERIC(20,3) DEFAULT 0,
  bundle_price NUMERIC(20,3) DEFAULT 0
);

CREATE TABLE promo_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  store_product_id UUID REFERENCES store_products(id),
  promo_price NUMERIC(20,3), is_bundle_item BOOLEAN DEFAULT false
);

-- WAREHOUSE TABLES (feature_enabled=false) — mimic tbl_itrhd/tbl_itrdt

CREATE TABLE warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(50) UNIQUE NOT NULL,
  from_store_id UUID REFERENCES stores(id) NOT NULL,
  to_store_id UUID REFERENCES stores(id) NOT NULL,
  transfer_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'draft',    -- draft|sent|received|cancelled
  notes TEXT,
  feature_enabled BOOLEAN DEFAULT false,  -- DISABLED
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE warehouse_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  store_product_id UUID REFERENCES store_products(id),
  qty NUMERIC(20,3) NOT NULL,
  notes TEXT
);

CREATE TABLE stock_opnames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) NOT NULL,
  period VARCHAR(20),                    -- mapping: tbl_itemopname.periode
  opname_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'draft',    -- draft|counting|completed|approved
  feature_enabled BOOLEAN DEFAULT false,  -- DISABLED
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stock_opname_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_id UUID REFERENCES stock_opnames(id) ON DELETE CASCADE,
  store_product_id UUID REFERENCES store_products(id),
  qty_system NUMERIC(20,3) DEFAULT 0,    -- mapping: jmlsebelum
  qty_physical NUMERIC(20,3) DEFAULT 0,  -- mapping: jmlfisik
  qty_diff NUMERIC(20,3) DEFAULT 0,      -- mapping: jmlselisih
  notes TEXT
);

-- TRACKING TABLES

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  store_product_id UUID REFERENCES store_products(id),
  movement_type VARCHAR(30) NOT NULL,     -- sync_ipos|received|adjustment|transfer_in|transfer_out|opname|return
  qty_before NUMERIC(20,3), qty_change NUMERIC(20,3), qty_after NUMERIC(20,3),
  reference_type VARCHAR(30),             -- order_item|transfer|opname
  reference_id UUID,
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, store_id UUID REFERENCES stores(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50), entity_id UUID,
  detail JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  sync_type VARCHAR(20),                  -- products|stock|sales|full
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  errors JSONB, status VARCHAR(20) DEFAULT 'running'
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,                    -- FK to auth.users
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  role VARCHAR(20) DEFAULT 'direktur',    -- direktur|gm|supervisor|admin_gudang
  store_id UUID REFERENCES stores(id),    -- NULL = all stores (direktur)
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  feature_enabled BOOLEAN DEFAULT false   -- role enforcement OFF dulu
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, store_id UUID REFERENCES stores(id),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200), message TEXT,
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ════ VIEWS ════

CREATE VIEW v_critical_stock AS
  SELECT st.store_id, sp.barcode, sp.name, sp.hpp, sp.sell_price,
    st.current_qty, st.max_qty, st.min_qty,
    CASE WHEN st.current_qty <= st.min_qty THEN 'KRITIS'
         WHEN st.current_qty <= st.max_qty * 0.5 THEN 'RENDAH'
         WHEN st.current_qty > st.max_qty THEN 'OVERSTOCK'
         ELSE 'OK' END AS status
  FROM stock st
  JOIN store_products sp ON sp.id = st.store_product_id
  JOIN stores s ON s.id = st.store_id
  WHERE sp.is_active = true;

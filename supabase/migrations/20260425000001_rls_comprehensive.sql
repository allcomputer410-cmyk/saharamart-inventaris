-- ════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE ROW LEVEL SECURITY — Inventaris Multi-Toko
-- 2026-04-25
--
-- CARA PAKAI:
--   Jalankan SELURUH script ini di Supabase Dashboard → SQL Editor
--   Aman dijalankan berulang. Tabel yang belum ada di-skip otomatis.
-- ════════════════════════════════════════════════════════════════════

DO $MAIN$
DECLARE
  _t TEXT;
BEGIN

-- ── HELPER FUNCTIONS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_store_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT store_id FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_is_global()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT role IN ('direktur', 'gm') FROM user_profiles WHERE id = auth.uid()),
    false
  )
$$;

-- ── BAGIAN 1: REFERENSI GLOBAL ───────────────────────────────────────

FOREACH _t IN ARRAY ARRAY['categories','brands','units','suppliers','product_catalog'] LOOP
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=_t) THEN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _t);
  END IF;
END LOOP;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='categories') THEN
  DROP POLICY IF EXISTS "categories_select" ON categories;
  CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='brands') THEN
  DROP POLICY IF EXISTS "brands_select" ON brands;
  CREATE POLICY "brands_select" ON brands FOR SELECT TO authenticated USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='units') THEN
  DROP POLICY IF EXISTS "units_select" ON units;
  CREATE POLICY "units_select" ON units FOR SELECT TO authenticated USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='suppliers') THEN
  DROP POLICY IF EXISTS "suppliers_select"      ON suppliers;
  DROP POLICY IF EXISTS "suppliers_all_service" ON suppliers;
  CREATE POLICY "suppliers_select"      ON suppliers FOR SELECT TO authenticated USING (true);
  CREATE POLICY "suppliers_all_service" ON suppliers FOR ALL    TO service_role  USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='product_catalog') THEN
  DROP POLICY IF EXISTS "product_catalog_select" ON product_catalog;
  CREATE POLICY "product_catalog_select" ON product_catalog FOR SELECT TO authenticated USING (true);
END IF;

-- ── BAGIAN 2: STORES ────────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='stores') THEN
  ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stores_select" ON stores;
  CREATE POLICY "stores_select" ON stores
    FOR SELECT TO authenticated
    USING (auth_is_global() OR id = auth_store_id());
END IF;

-- ── BAGIAN 3: PRODUK & STOK ─────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='store_products') THEN
  ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "store_products_select"      ON store_products;
  DROP POLICY IF EXISTS "store_products_update"      ON store_products;
  DROP POLICY IF EXISTS "store_products_all_service" ON store_products;
  CREATE POLICY "store_products_select"      ON store_products
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "store_products_update"      ON store_products
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id())
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "store_products_all_service" ON store_products FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='stock') THEN
  ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stock_select"      ON stock;
  DROP POLICY IF EXISTS "stock_update"      ON stock;
  DROP POLICY IF EXISTS "stock_all_service" ON stock;
  CREATE POLICY "stock_select" ON stock
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "stock_update" ON stock
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id())
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "stock_all_service" ON stock FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='store_suppliers') THEN
  ALTER TABLE store_suppliers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "store_suppliers_select" ON store_suppliers;
  CREATE POLICY "store_suppliers_select" ON store_suppliers
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
END IF;

-- ── BAGIAN 4: PESANAN ───────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='orders') THEN
  ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "orders_select" ON orders;
  DROP POLICY IF EXISTS "orders_insert" ON orders;
  DROP POLICY IF EXISTS "orders_update" ON orders;
  CREATE POLICY "orders_select" ON orders
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "orders_insert" ON orders
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "orders_update" ON orders
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id())
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='order_items') THEN
  ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "order_items_select" ON order_items;
  DROP POLICY IF EXISTS "order_items_insert" ON order_items;
  DROP POLICY IF EXISTS "order_items_update" ON order_items;
  DROP POLICY IF EXISTS "order_items_delete" ON order_items;
  CREATE POLICY "order_items_select" ON order_items
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = auth_store_id()
      )
    );
  CREATE POLICY "order_items_insert" ON order_items
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = auth_store_id()
      )
    );
  CREATE POLICY "order_items_update" ON order_items
    FOR UPDATE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = auth_store_id()
      )
    );
  CREATE POLICY "order_items_delete" ON order_items
    FOR DELETE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = auth_store_id()
      )
    );
END IF;

-- ── BAGIAN 5: PENJUALAN HARIAN ──────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='daily_sales') THEN
  ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "daily_sales_select"      ON daily_sales;
  DROP POLICY IF EXISTS "daily_sales_all_service" ON daily_sales;
  CREATE POLICY "daily_sales_select" ON daily_sales
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "daily_sales_all_service" ON daily_sales FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='daily_sale_items') THEN
  ALTER TABLE daily_sale_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "daily_sale_items_select"      ON daily_sale_items;
  DROP POLICY IF EXISTS "daily_sale_items_all_service" ON daily_sale_items;
  CREATE POLICY "daily_sale_items_select" ON daily_sale_items
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM daily_sales ds WHERE ds.id = daily_sale_items.daily_sale_id AND ds.store_id = auth_store_id()
      )
    );
  CREATE POLICY "daily_sale_items_all_service" ON daily_sale_items FOR ALL TO service_role USING (true);
END IF;

-- ── BAGIAN 6: PEMBELIAN / FAKTUR ────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchases') THEN
  ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "purchases_select"      ON purchases;
  DROP POLICY IF EXISTS "purchases_service"     ON purchases;
  DROP POLICY IF EXISTS "purchases_all_service" ON purchases;
  CREATE POLICY "purchases_select" ON purchases
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "purchases_all_service" ON purchases FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchase_items') THEN
  ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "purchase_items_select"      ON purchase_items;
  DROP POLICY IF EXISTS "purchase_items_service"     ON purchase_items;
  DROP POLICY IF EXISTS "purchase_items_all_service" ON purchase_items;
  CREATE POLICY "purchase_items_select" ON purchase_items
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM purchases p WHERE p.id = purchase_items.purchase_id AND p.store_id = auth_store_id()
      )
    );
  CREATE POLICY "purchase_items_all_service" ON purchase_items FOR ALL TO service_role USING (true);
END IF;

-- ── BAGIAN 7: PROMO ─────────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='promotions') THEN
  ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "promotions_select" ON promotions;
  DROP POLICY IF EXISTS "promotions_insert" ON promotions;
  DROP POLICY IF EXISTS "promotions_update" ON promotions;
  DROP POLICY IF EXISTS "promotions_delete" ON promotions;
  CREATE POLICY "promotions_select" ON promotions
    FOR SELECT TO authenticated
    USING (auth_is_global() OR store_id IS NULL OR store_id = auth_store_id());
  CREATE POLICY "promotions_insert" ON promotions
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "promotions_update" ON promotions
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id() OR store_id IS NULL)
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "promotions_delete" ON promotions
    FOR DELETE TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='promo_rules') THEN
  ALTER TABLE promo_rules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "promo_rules_select" ON promo_rules;
  DROP POLICY IF EXISTS "promo_rules_insert" ON promo_rules;
  DROP POLICY IF EXISTS "promo_rules_delete" ON promo_rules;
  CREATE POLICY "promo_rules_select" ON promo_rules
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_rules.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
  CREATE POLICY "promo_rules_insert" ON promo_rules
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_rules.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
  CREATE POLICY "promo_rules_delete" ON promo_rules
    FOR DELETE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_rules.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='promo_products') THEN
  ALTER TABLE promo_products ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "promo_products_select" ON promo_products;
  DROP POLICY IF EXISTS "promo_products_insert" ON promo_products;
  DROP POLICY IF EXISTS "promo_products_delete" ON promo_products;
  CREATE POLICY "promo_products_select" ON promo_products
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_products.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
  CREATE POLICY "promo_products_insert" ON promo_products
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_products.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
  CREATE POLICY "promo_products_delete" ON promo_products
    FOR DELETE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM promotions p WHERE p.id = promo_products.promo_id
        AND (p.store_id = auth_store_id() OR p.store_id IS NULL)
      )
    );
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='promo_recommendations') THEN
  ALTER TABLE promo_recommendations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "promo_recommendations_select" ON promo_recommendations;
  DROP POLICY IF EXISTS "promo_recommendations_insert" ON promo_recommendations;
  DROP POLICY IF EXISTS "promo_recommendations_update" ON promo_recommendations;
  DROP POLICY IF EXISTS "promo_recommendations_delete" ON promo_recommendations;
  CREATE POLICY "promo_recommendations_select" ON promo_recommendations
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "promo_recommendations_insert" ON promo_recommendations
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "promo_recommendations_update" ON promo_recommendations
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id())
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "promo_recommendations_delete" ON promo_recommendations
    FOR DELETE TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
END IF;

-- ── BAGIAN 8: TRANSFER GUDANG ───────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='warehouse_transfers') THEN
  ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "warehouse_transfers_select" ON warehouse_transfers;
  DROP POLICY IF EXISTS "warehouse_transfers_insert" ON warehouse_transfers;
  DROP POLICY IF EXISTS "warehouse_transfers_update" ON warehouse_transfers;
  CREATE POLICY "warehouse_transfers_select" ON warehouse_transfers
    FOR SELECT TO authenticated
    USING (auth_is_global() OR from_store_id = auth_store_id() OR to_store_id = auth_store_id());
  CREATE POLICY "warehouse_transfers_insert" ON warehouse_transfers
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR from_store_id = auth_store_id());
  CREATE POLICY "warehouse_transfers_update" ON warehouse_transfers
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR from_store_id = auth_store_id() OR to_store_id = auth_store_id());
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='warehouse_transfer_items') THEN
  ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "warehouse_transfer_items_select" ON warehouse_transfer_items;
  DROP POLICY IF EXISTS "warehouse_transfer_items_insert" ON warehouse_transfer_items;
  DROP POLICY IF EXISTS "warehouse_transfer_items_update" ON warehouse_transfer_items;
  CREATE POLICY "warehouse_transfer_items_select" ON warehouse_transfer_items
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM warehouse_transfers wt WHERE wt.id = warehouse_transfer_items.transfer_id
        AND (wt.from_store_id = auth_store_id() OR wt.to_store_id = auth_store_id())
      )
    );
  CREATE POLICY "warehouse_transfer_items_insert" ON warehouse_transfer_items
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM warehouse_transfers wt WHERE wt.id = warehouse_transfer_items.transfer_id
        AND wt.from_store_id = auth_store_id()
      )
    );
  CREATE POLICY "warehouse_transfer_items_update" ON warehouse_transfer_items
    FOR UPDATE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM warehouse_transfers wt WHERE wt.id = warehouse_transfer_items.transfer_id
        AND (wt.from_store_id = auth_store_id() OR wt.to_store_id = auth_store_id())
      )
    );
END IF;

-- ── BAGIAN 9: TRACKING ──────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='stock_movements') THEN
  ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stock_movements_select"      ON stock_movements;
  DROP POLICY IF EXISTS "stock_movements_insert"      ON stock_movements;
  DROP POLICY IF EXISTS "stock_movements_all_service" ON stock_movements;
  CREATE POLICY "stock_movements_select" ON stock_movements
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "stock_movements_insert" ON stock_movements
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "stock_movements_all_service" ON stock_movements FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='audit_log') THEN
  ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "audit_log_select"      ON audit_log;
  DROP POLICY IF EXISTS "audit_log_insert"      ON audit_log;
  DROP POLICY IF EXISTS "audit_log_all_service" ON audit_log;
  CREATE POLICY "audit_log_select" ON audit_log
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "audit_log_insert" ON audit_log
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "audit_log_all_service" ON audit_log FOR ALL TO service_role USING (true);
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sync_log') THEN
  ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "sync_log_select"      ON sync_log;
  DROP POLICY IF EXISTS "sync_log_all_service" ON sync_log;
  CREATE POLICY "sync_log_select" ON sync_log
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "sync_log_all_service" ON sync_log FOR ALL TO service_role USING (true);
END IF;

-- ── BAGIAN 10: USER PROFILES ────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='user_profiles') THEN
  ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "user_profiles_select_own"   ON user_profiles;
  DROP POLICY IF EXISTS "user_profiles_select_store" ON user_profiles;
  DROP POLICY IF EXISTS "user_profiles_insert"       ON user_profiles;
  DROP POLICY IF EXISTS "user_profiles_update_own"   ON user_profiles;
  DROP POLICY IF EXISTS "user_profiles_update_mgmt"  ON user_profiles;
  DROP POLICY IF EXISTS "user_profiles_all_service"  ON user_profiles;

  -- Baca profil sendiri
  CREATE POLICY "user_profiles_select_own" ON user_profiles
    FOR SELECT TO authenticated USING (id = auth.uid());

  -- Manajemen bisa baca semua profil di tokonya
  CREATE POLICY "user_profiles_select_store" ON user_profiles
    FOR SELECT TO authenticated USING (
      auth_is_global()
      OR (
        store_id = auth_store_id()
        AND EXISTS (
          SELECT 1 FROM user_profiles me WHERE me.id = auth.uid()
          AND me.role IN ('owner', 'manajer', 'direktur', 'gm')
        )
      )
    );

  -- Insert: hanya manajemen
  CREATE POLICY "user_profiles_insert" ON user_profiles
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global()
      OR EXISTS (
        SELECT 1 FROM user_profiles me WHERE me.id = auth.uid()
        AND me.role IN ('owner', 'manajer')
      )
    );

  -- Update profil sendiri
  CREATE POLICY "user_profiles_update_own" ON user_profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  -- Manajemen update profil staf di tokonya
  CREATE POLICY "user_profiles_update_mgmt" ON user_profiles
    FOR UPDATE TO authenticated USING (
      auth_is_global()
      OR (
        store_id = auth_store_id()
        AND EXISTS (
          SELECT 1 FROM user_profiles me WHERE me.id = auth.uid()
          AND me.role IN ('owner', 'manajer', 'direktur', 'gm')
        )
      )
    );

  -- Service role bypass
  CREATE POLICY "user_profiles_all_service" ON user_profiles FOR ALL TO service_role USING (true);
END IF;

-- ── BAGIAN 11: NOTIFIKASI ───────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notifications') THEN
  ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "notifications_select"      ON notifications;
  DROP POLICY IF EXISTS "notifications_update"      ON notifications;
  DROP POLICY IF EXISTS "notifications_insert"      ON notifications;
  DROP POLICY IF EXISTS "notifications_all_service" ON notifications;
  CREATE POLICY "notifications_select" ON notifications
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "notifications_update" ON notifications
    FOR UPDATE TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "notifications_all_service" ON notifications FOR ALL TO service_role USING (true);
END IF;

-- ── BAGIAN 12: BIAYA OPERASIONAL ────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='operational_costs') THEN
  ALTER TABLE operational_costs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "operational_costs_select" ON operational_costs;
  DROP POLICY IF EXISTS "operational_costs_insert" ON operational_costs;
  DROP POLICY IF EXISTS "operational_costs_update" ON operational_costs;
  CREATE POLICY "operational_costs_select" ON operational_costs
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "operational_costs_insert" ON operational_costs
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "operational_costs_update" ON operational_costs
    FOR UPDATE TO authenticated
    USING (auth_is_global() OR store_id = auth_store_id())
    WITH CHECK (auth_is_global() OR store_id = auth_store_id());
END IF;

-- ── BAGIAN 13: CEK STOK SESSIONS ────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cek_stok_sessions') THEN
  ALTER TABLE cek_stok_sessions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cek_stok_sessions_select" ON cek_stok_sessions;
  DROP POLICY IF EXISTS "cek_stok_sessions_insert" ON cek_stok_sessions;
  DROP POLICY IF EXISTS "cek_stok_sessions_update" ON cek_stok_sessions;
  DROP POLICY IF EXISTS "cek_stok_sessions_delete" ON cek_stok_sessions;
  CREATE POLICY "cek_stok_sessions_select" ON cek_stok_sessions
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "cek_stok_sessions_insert" ON cek_stok_sessions
    FOR INSERT TO authenticated WITH CHECK (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "cek_stok_sessions_update" ON cek_stok_sessions
    FOR UPDATE TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "cek_stok_sessions_delete" ON cek_stok_sessions
    FOR DELETE TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
END IF;

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cek_stok_session_items') THEN
  ALTER TABLE cek_stok_session_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cek_stok_session_items_select" ON cek_stok_session_items;
  DROP POLICY IF EXISTS "cek_stok_session_items_insert" ON cek_stok_session_items;
  DROP POLICY IF EXISTS "cek_stok_session_items_update" ON cek_stok_session_items;
  DROP POLICY IF EXISTS "cek_stok_session_items_delete" ON cek_stok_session_items;
  CREATE POLICY "cek_stok_session_items_select" ON cek_stok_session_items
    FOR SELECT TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM cek_stok_sessions s WHERE s.id = cek_stok_session_items.session_id
        AND s.store_id = auth_store_id()
      )
    );
  CREATE POLICY "cek_stok_session_items_insert" ON cek_stok_session_items
    FOR INSERT TO authenticated WITH CHECK (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM cek_stok_sessions s WHERE s.id = cek_stok_session_items.session_id
        AND s.store_id = auth_store_id()
      )
    );
  CREATE POLICY "cek_stok_session_items_update" ON cek_stok_session_items
    FOR UPDATE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM cek_stok_sessions s WHERE s.id = cek_stok_session_items.session_id
        AND s.store_id = auth_store_id()
      )
    );
  CREATE POLICY "cek_stok_session_items_delete" ON cek_stok_session_items
    FOR DELETE TO authenticated USING (
      auth_is_global() OR EXISTS (
        SELECT 1 FROM cek_stok_sessions s WHERE s.id = cek_stok_session_items.session_id
        AND s.store_id = auth_store_id()
      )
    );
END IF;

-- ── BAGIAN 14: DISKON iPOS ──────────────────────────────────────────

IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='store_item_discounts') THEN
  ALTER TABLE store_item_discounts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "sid_select"      ON store_item_discounts;
  DROP POLICY IF EXISTS "sid_service"     ON store_item_discounts;
  DROP POLICY IF EXISTS "sid_all_service" ON store_item_discounts;
  CREATE POLICY "sid_select" ON store_item_discounts
    FOR SELECT TO authenticated USING (auth_is_global() OR store_id = auth_store_id());
  CREATE POLICY "sid_all_service" ON store_item_discounts FOR ALL TO service_role USING (true);
END IF;

RAISE NOTICE 'RLS setup selesai!';

END $MAIN$;

-- ── VERIFIKASI ───────────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity AS "RLS Aktif"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ════════════════════════════════════════════════════════════════
-- FIX SECURITY ADVISOR — tutup 8 CRITICAL
-- Dibuat 09 Sep 2026. Sudah diterapkan & diverifikasi di CLONE (deliveryku).
-- BELUM diterapkan ke produksi — tinjau dulu sebelum menjalankan di live.
-- Idempotent (DROP POLICY IF EXISTS sebelum CREATE).
--
-- A. Enable RLS + policy per-toko pada 4 tabel yang sebelumnya RLS OFF
--    (mengikuti pola app: auth_is_global() OR store_id = auth_store_id()).
-- B. Ubah 4 view jadi security_invoker agar menghormati RLS pemanggil
--    (mencegah kebocoran data antar-toko).
-- ════════════════════════════════════════════════════════════════

-- ── A1. sales_transactions (punya store_id) ──
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS st_all ON sales_transactions;
DROP POLICY IF EXISTS st_service ON sales_transactions;
CREATE POLICY st_all ON sales_transactions FOR ALL TO authenticated
  USING (auth_is_global() OR store_id = auth_store_id())
  WITH CHECK (auth_is_global() OR store_id = auth_store_id());
CREATE POLICY st_service ON sales_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── A2. stock_opnames (punya store_id) ──
ALTER TABLE stock_opnames ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS so_all ON stock_opnames;
DROP POLICY IF EXISTS so_service ON stock_opnames;
CREATE POLICY so_all ON stock_opnames FOR ALL TO authenticated
  USING (auth_is_global() OR store_id = auth_store_id())
  WITH CHECK (auth_is_global() OR store_id = auth_store_id());
CREATE POLICY so_service ON stock_opnames FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── A3. stock_opname_items (scope lewat opname_id → stock_opnames.store_id) ──
ALTER TABLE stock_opname_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS soi_all ON stock_opname_items;
DROP POLICY IF EXISTS soi_service ON stock_opname_items;
CREATE POLICY soi_all ON stock_opname_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM stock_opnames o WHERE o.id = stock_opname_items.opname_id
                 AND (auth_is_global() OR o.store_id = auth_store_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM stock_opnames o WHERE o.id = stock_opname_items.opname_id
                 AND (auth_is_global() OR o.store_id = auth_store_id())));
CREATE POLICY soi_service ON stock_opname_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── A4. payment_method_overrides (scope lewat notransaksi → sales_transactions.store_id) ──
ALTER TABLE payment_method_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pmo_all ON payment_method_overrides;
DROP POLICY IF EXISTS pmo_service ON payment_method_overrides;
CREATE POLICY pmo_all ON payment_method_overrides FOR ALL TO authenticated
  USING (auth_is_global() OR EXISTS (SELECT 1 FROM sales_transactions s
         WHERE s.notransaksi = payment_method_overrides.notransaksi AND s.store_id = auth_store_id()))
  WITH CHECK (auth_is_global() OR EXISTS (SELECT 1 FROM sales_transactions s
         WHERE s.notransaksi = payment_method_overrides.notransaksi AND s.store_id = auth_store_id()));
CREATE POLICY pmo_service ON payment_method_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── B. View: security_invoker agar menghormati RLS pemanggil ──
ALTER VIEW v_sale_items_detail SET (security_invoker = on);
ALTER VIEW v_rekap_kasir       SET (security_invoker = on);
ALTER VIEW v_margin_rendah     SET (security_invoker = on);
ALTER VIEW v_critical_stock    SET (security_invoker = on);

-- ════════════════════════════════════════════════════════
-- AUDIT GAPS — Blueprint v7 Check (2026-03-11)
-- ════════════════════════════════════════════════════════
-- Temuan audit:
-- 1. Semua 25 tabel sudah ada di initial schema
-- 2. VIEW v_critical_stock sudah ada
-- 3. INDEX idx_catalog_barcode, idx_sp_store_barcode, idx_sp_ipos, idx_stock_critical sudah ada
-- 4. Sync agent: semua fungsi ada (sync_products, sync_stock, sync_sales,
--    sync_suppliers, sync_categories (via sync_products), heartbeat, sync_log)
-- 5. Semua halaman sudah ada (promo & users masih placeholder, akan diimplementasi di feat/promo & feat/role-enforcement)
-- 6. Pesanan: handleConfirmItem sudah update stock + catat stock_movements + audit_log
--
-- GAP yang perlu difix:
-- A. Kolom feature toggle di stores belum ada (akan dipakai modul Promo & Gudang)
-- B. stores.type perlu nilai 'gudang' untuk modul transfer antar toko

-- A. Feature toggles di stores (dibutuhkan Step 3 & 4)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_promo BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_gudang BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_roles BOOLEAN DEFAULT false;

-- B. Pastikan index ada untuk warehouse_transfers (query by status)
CREATE INDEX IF NOT EXISTS idx_wt_from_store ON warehouse_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_wt_to_store ON warehouse_transfers(to_store_id);
CREATE INDEX IF NOT EXISTS idx_wt_status ON warehouse_transfers(status);

-- C. Index untuk stock_opnames
CREATE INDEX IF NOT EXISTS idx_opname_store ON stock_opnames(store_id);
CREATE INDEX IF NOT EXISTS idx_opname_status ON stock_opnames(status);

-- D. Index untuk promotions
CREATE INDEX IF NOT EXISTS idx_promo_store ON promotions(store_id);
CREATE INDEX IF NOT EXISTS idx_promo_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promo_type ON promotions(type);

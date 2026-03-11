-- ════════════════════════════════════════════════════════
-- PROMO FEATURE TOGGLE — Fase 6 Step 3
-- ════════════════════════════════════════════════════════
-- Kolom sudah ditambahkan di 20260311000001_audit_gaps.sql
-- File ini disiapkan untuk dokumentasi / jika dijalankan terpisah

ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_promo BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_gudang BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS feature_roles BOOLEAN DEFAULT false;

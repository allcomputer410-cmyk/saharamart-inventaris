-- ════════════════════════════════════════════════════════
-- FIX: orders.supplier_id nullable (2026-04-17)
-- ════════════════════════════════════════════════════════
-- Bug: supplier_id NOT NULL menyebabkan insert gagal diam-diam
-- ketika produk tidak memiliki supplier yang terdaftar.
-- Fix: jadikan nullable agar draft pesanan bisa dibuat dulu,
-- supplier bisa diisi belakangan.
-- ════════════════════════════════════════════════════════

ALTER TABLE orders ALTER COLUMN supplier_id DROP NOT NULL;

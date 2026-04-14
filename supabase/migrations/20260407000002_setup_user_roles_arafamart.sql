-- ════════════════════════════════════════════════════════════════
-- SETUP USER ROLES — ARAFAMART
-- Jalankan di: Supabase Dashboard → SQL Editor
--
-- LANGKAH PENGGUNAAN:
--   1. Jalankan BAGIAN 1 → lihat daftar UUID user yang ada
--   2. Buat akun baru (jika belum ada) di:
--        Dashboard → Authentication → Users → Add User
--   3. Jalankan BAGIAN 1 lagi → copy UUID user baru
--   4. Isi UUID + nama + email di BAGIAN 2, lalu jalankan
--   5. Jalankan BAGIAN 3 → verifikasi hasilnya
--
-- ROLE YANG TERSEDIA:
--   owner      → akses penuh termasuk Penjualan Harian
--   manajer    → akses penuh termasuk Penjualan Harian
--   staff      → akses umum, TIDAK bisa lihat Penjualan Harian
--   kasir      → akses terbatas (sama seperti staff)
-- ════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────
-- BAGIAN 1: CEK USER YANG SUDAH ADA DI SUPABASE AUTH
-- Jalankan ini dulu untuk lihat UUID masing-masing user
-- ────────────────────────────────────────────────────────────────

SELECT
  id          AS "UUID (3a372dd4-e624-4914-8d0d-6b715fbe4664)",
  email,
  created_at  AS "Tgl Daftar",
  last_sign_in_at AS "Login Terakhir"
FROM auth.users
ORDER BY created_at DESC;


-- ────────────────────────────────────────────────────────────────
-- BAGIAN 2: BUAT / UPDATE PROFIL & ROLE USER ARAFAMART
--
-- ⚠️  GANTI PLACEHOLDER di bawah ini:
--     'GANTI-UUID-...'  → UUID dari hasil query Bagian 1
--     'Nama Lengkap'    → nama asli orang tersebut
--     'email@...'       → email login di Supabase Auth
--
-- Script ini aman dijalankan berulang kali (ON CONFLICT = update)
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_store_id UUID;
BEGIN
  -- Ambil store_id ARAFAMART
  SELECT id INTO v_store_id FROM stores WHERE code = 'ARM01' LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Toko ARM01 (ARAFAMART) tidak ditemukan. '
      'Jalankan 20260407000001_insert_arafamart.sql terlebih dahulu.';
  END IF;

  -- ── OWNER ────────────────────────────────────────────────────
  INSERT INTO user_profiles (id, name, email, role, store_id, is_active)
  VALUES (
    'a827ef07-2ad8-411b-8526-a26c80d3cb9c',
    'Pemilik Arafamart',
    'owner@arafamart.com',
    'owner',
    v_store_id,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    role       = 'owner',
    store_id   = v_store_id,
    is_active  = true,
    name       = EXCLUDED.name,
    email      = EXCLUDED.email;

  RAISE NOTICE 'Setup role ARAFAMART selesai untuk store_id: %', v_store_id;
END $$;


-- ────────────────────────────────────────────────────────────────
-- BAGIAN 3: VERIFIKASI HASIL
-- Jalankan setelah Bagian 2 untuk cek apakah sudah benar
-- ────────────────────────────────────────────────────────────────

SELECT
  up.name                     AS "Nama",
  up.email,
  up.role                     AS "Role",
  CASE up.role
    WHEN 'owner'    THEN 'Bisa akses Penjualan'
    WHEN 'manajer'  THEN 'Bisa akses Penjualan'
    WHEN 'direktur' THEN 'Bisa akses Penjualan'
    WHEN 'gm'       THEN 'Bisa akses Penjualan'
    ELSE                 'TIDAK bisa akses Penjualan'
  END                         AS "Hak Akses Penjualan",
  s.name                      AS "Toko",
  up.is_active                AS "Aktif"
FROM user_profiles up
LEFT JOIN stores s ON s.id = up.store_id
WHERE s.code = 'ARM01'
ORDER BY
  CASE up.role
    WHEN 'owner'   THEN 1
    WHEN 'manajer' THEN 2
    ELSE 3
  END;

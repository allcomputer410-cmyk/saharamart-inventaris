-- ════════════════════════════════════════════════════════════════
-- SETUP USER ROLES — SAHARAMART
-- Migration ini aman untuk clone (placeholder UUID di-skip otomatis)
-- Untuk production: isi UUID asli via Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM stores WHERE code = 'SM01' LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE 'Toko SM01 tidak ditemukan, skip setup user roles.';
    RETURN;
  END IF;

  -- Skip jika masih ada placeholder UUID (clone/fresh environment)
  -- Untuk production: ganti placeholder di bawah dengan UUID asli dari auth.users
  BEGIN
    INSERT INTO user_profiles (id, name, email, role, store_id, is_active)
    VALUES (
      'GANTI-UUID-OWNER',
      'Nama Pemilik Toko',
      'owner@email.com',
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skip insert owner (placeholder UUID): %', SQLERRM;
  END;

  BEGIN
    INSERT INTO user_profiles (id, name, email, role, store_id, is_active)
    VALUES (
      'GANTI-UUID-MANAJER',
      'Nama Manajer',
      'manajer@email.com',
      'manajer',
      v_store_id,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      role       = 'manajer',
      store_id   = v_store_id,
      is_active  = true,
      name       = EXCLUDED.name,
      email      = EXCLUDED.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skip insert manajer (placeholder UUID): %', SQLERRM;
  END;

  BEGIN
    INSERT INTO user_profiles (id, name, email, role, store_id, is_active)
    VALUES (
      'GANTI-UUID-STAFF-1',
      'Nama Staff 1',
      'staff1@email.com',
      'staff',
      v_store_id,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      role       = 'staff',
      store_id   = v_store_id,
      is_active  = true,
      name       = EXCLUDED.name,
      email      = EXCLUDED.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skip insert staff-1 (placeholder UUID): %', SQLERRM;
  END;

  BEGIN
    INSERT INTO user_profiles (id, name, email, role, store_id, is_active)
    VALUES (
      'GANTI-UUID-STAFF-2',
      'Nama Staff 2',
      'staff2@email.com',
      'staff',
      v_store_id,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      role       = 'staff',
      store_id   = v_store_id,
      is_active  = true,
      name       = EXCLUDED.name,
      email      = EXCLUDED.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skip insert staff-2 (placeholder UUID): %', SQLERRM;
  END;

  RAISE NOTICE 'Setup user roles SM01 selesai.';
END $$;

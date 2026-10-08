-- ════════════════════════════════════════════════════════════════
-- SETUP USER ROLES — ARAFAMART
-- Migration ini aman untuk clone (user tidak ada di clone = di-skip)
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM stores WHERE code = 'ARM01' LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE 'Toko ARM01 tidak ditemukan, skip setup user roles Arafamart.';
    RETURN;
  END IF;

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skip insert owner Arafamart (user tidak ada di auth): %', SQLERRM;
  END;

  RAISE NOTICE 'Setup role ARAFAMART selesai.';
END $$;

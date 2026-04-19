-- Tambah kolom permissions per-user ke user_profiles
-- NULL = akses penuh (tidak ada pembatasan)
-- JSON { "menus": ["dashboard", "pesanan", ...] } = hanya menu yang terdaftar yang bisa diakses

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;

-- Tambah role baru: owner, manajer
-- (kolom role sudah VARCHAR, tidak perlu enum migration)
-- Cukup pastikan constraint lama tidak memblokir nilai baru
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

COMMENT ON COLUMN user_profiles.permissions IS
  'Per-user menu permissions. NULL = full access. {"menus":["dashboard","pesanan",...]} = restricted.';

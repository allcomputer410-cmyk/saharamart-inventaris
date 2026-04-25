-- Tambah kolom status ke user_profiles untuk alur registrasi dengan persetujuan
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'rejected'));

-- Index untuk query pending
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON user_profiles(status);

-- Update semua akun yang sudah ada ke status active
UPDATE user_profiles SET status = 'active' WHERE status IS NULL OR status = '';

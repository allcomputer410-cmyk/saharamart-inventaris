-- ════════════════════════════════════════════════════════
-- CEK STOK SESSIONS (2026-04-17)
-- ════════════════════════════════════════════════════════
-- Menyimpan sesi cek stok ke database supaya data tidak
-- hilang saat halaman di-refresh atau pindah page.
-- User bisa pause dan lanjut dari device manapun.
-- ════════════════════════════════════════════════════════

-- ── Tabel sesi cek stok ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cek_stok_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'exported')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tabel item per sesi ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cek_stok_session_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES cek_stok_sessions(id) ON DELETE CASCADE,
  store_product_id  UUID NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  barcode           TEXT NOT NULL,
  name              TEXT NOT NULL,
  unit              TEXT,
  stok_sistem       NUMERIC NOT NULL DEFAULT 0,
  stok_fisik        NUMERIC NOT NULL DEFAULT 0,
  hpp               NUMERIC NOT NULL DEFAULT 0,
  sell_price        NUMERIC NOT NULL DEFAULT 0,
  supplier          TEXT NOT NULL DEFAULT '-',
  kategori          TEXT NOT NULL DEFAULT '-',
  merek             TEXT NOT NULL DEFAULT '-',
  rak               TEXT NOT NULL DEFAULT '-',
  max_qty           NUMERIC NOT NULL DEFAULT 0,
  min_qty           NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Satu produk hanya bisa muncul sekali per sesi
  UNIQUE (session_id, store_product_id)
);

-- ── Kolom selisih sebagai generated column ────────────────────────────────────
ALTER TABLE cek_stok_session_items
  ADD COLUMN IF NOT EXISTS selisih NUMERIC GENERATED ALWAYS AS (stok_fisik - stok_sistem) STORED;

-- ── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cks_store_status  ON cek_stok_sessions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cks_user          ON cek_stok_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cksi_session      ON cek_stok_session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_cksi_product      ON cek_stok_session_items(store_product_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE cek_stok_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cek_stok_session_items ENABLE ROW LEVEL SECURITY;

-- Sessions: bisa diakses oleh authenticated user yang punya akses ke store tsb
CREATE POLICY "cek_stok_sessions_select" ON cek_stok_sessions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cek_stok_sessions_insert" ON cek_stok_sessions
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "cek_stok_sessions_update" ON cek_stok_sessions
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "cek_stok_sessions_delete" ON cek_stok_sessions
  FOR DELETE TO authenticated
  USING (true);

-- Items: ikut session
CREATE POLICY "cek_stok_session_items_select" ON cek_stok_session_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cek_stok_session_items_insert" ON cek_stok_session_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "cek_stok_session_items_update" ON cek_stok_session_items
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "cek_stok_session_items_delete" ON cek_stok_session_items
  FOR DELETE TO authenticated
  USING (true);

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cekstok_item_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cksi_updated_at
  BEFORE UPDATE ON cek_stok_session_items
  FOR EACH ROW EXECUTE FUNCTION update_cekstok_item_updated_at();

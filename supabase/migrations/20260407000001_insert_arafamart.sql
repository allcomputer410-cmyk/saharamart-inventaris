-- ════════════════════════════════════════════════════════════════
-- INSERT: Toko ARAFAMART
-- Jalankan di: Supabase Dashboard → SQL Editor
--
-- LANGKAH SEBELUM MENJALANKAN:
--   1. Hubungkan ke iPOS PostgreSQL Arafamart (pgAdmin atau psql)
--   2. Jalankan query ini untuk tahu kodekantor:
--        SELECT kodekantor, namakantor FROM tbl_kantor ORDER BY kodekantor;
--   3. Isi GANTI_* di bawah dengan nilai yang didapat
-- ════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────
-- LANGKAH 1: INSERT TOKO ARAFAMART
--
-- ⚠️  GANTI PLACEHOLDER sebelum dijalankan:
--   GANTI_KODE_KANTOR  → hasil query tbl_kantor di iPOS Arafamart
--                         contoh: '02', 'ARM', 'ARAFAMART'
--   GANTI_NAMA_DATABASE → nama database di pgAdmin (Databases)
--                          contoh: 'i4_arafamart', 'i4_ARAFAMART'
--   GANTI_IP_ATAU_LOCALHOST → 'localhost' kalau sync agent jalan di PC
--                              kasir Arafamart yang sama; atau IP LAN
--                              contoh: '192.168.1.12'
--   GANTI_PORT          → port PostgreSQL iPOS Arafamart
--                          biasanya 5444 (InspirasiBiz) atau 5432
-- ────────────────────────────────────────────────────────────────

INSERT INTO stores (
  code,
  name,
  address,
  phone,
  type,
  ipos_kodekantor,
  ipos_db_host,
  ipos_db_port,
  ipos_db_name,
  is_active
) VALUES (
  'ARM01',
  'ARAFAMART',
  NULL,                          -- Isi alamat toko nanti
  NULL,                          -- Isi nomor telepon nanti
  'toko',
  'GANTI_KODE_KANTOR',          -- ⚠️ dari query tbl_kantor
  'GANTI_IP_ATAU_LOCALHOST',    -- ⚠️ host PC kasir Arafamart
  5444,                          -- ⚠️ GANTI_PORT (default iPOS: 5444)
  'GANTI_NAMA_DATABASE',        -- ⚠️ nama DB di pgAdmin
  true
)
ON CONFLICT (code) DO UPDATE SET
  name            = EXCLUDED.name,
  ipos_kodekantor = EXCLUDED.ipos_kodekantor,
  ipos_db_host    = EXCLUDED.ipos_db_host,
  ipos_db_port    = EXCLUDED.ipos_db_port,
  ipos_db_name    = EXCLUDED.ipos_db_name,
  is_active       = EXCLUDED.is_active;


-- ────────────────────────────────────────────────────────────────
-- LANGKAH 2: VERIFIKASI
-- Jalankan ini setelah insert untuk memastikan data benar
-- ────────────────────────────────────────────────────────────────

SELECT
  id,
  code,
  name,
  ipos_kodekantor,
  ipos_db_host,
  ipos_db_port,
  ipos_db_name,
  is_active
FROM stores
ORDER BY created_at;


-- ────────────────────────────────────────────────────────────────
-- CATATAN: SETELAH INSERT SELESAI
--
-- Jalankan sync agent dari PC kasir Arafamart:
--   cd sync-agent
--   python sync_agent.py --type products
--   python sync_agent.py --type stock
--   python sync_agent.py --type sales --days 90
--
-- ATAU full sync sekaligus (lebih lama, tapi lengkap):
--   python sync_agent.py --type full
--
-- ⚠️  PENTING: sync agent di PC Arafamart WAJIB punya .env yang
-- sudah diset. File .env contoh:
--   SUPABASE_URL=https://xxxxx.supabase.co
--   SUPABASE_SERVICE_KEY=eyJ...
--   IPOS_DB_HOST=localhost
--   IPOS_DB_PORT=5444
--   IPOS_DB_NAME=i4_ARAFAMART   ← sesuaikan
--   IPOS_DB_USER=postgres
--   IPOS_DB_PASS=password_ipos
--   SALES_DAYS_BACK=90           ← pakai 90 untuk sync historis pertama
--
-- Sync agent membaca stores dari Supabase dan terhubung ke iPOS
-- berdasarkan ipos_db_host/port/name per toko. Pastikan kolom ini
-- terisi benar, bukan NULL.
-- ────────────────────────────────────────────────────────────────

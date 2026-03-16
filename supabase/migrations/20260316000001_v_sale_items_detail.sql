-- View: v_sale_items_detail
-- Dipakai oleh halaman Analisis Keuangan (Section C Top 10 + Section D Kategori)
-- JOIN: daily_sale_items → daily_sales (store_id, sale_date)
--                        → store_products (barcode, name, hpp, sell_price)
--                        → categories (code, name)

CREATE OR REPLACE VIEW v_sale_items_detail AS
SELECT
  dsi.id,
  ds.store_id,
  ds.sale_date,
  dsi.store_product_id,
  COALESCE(sp.barcode, '')        AS barcode,
  COALESCE(sp.name, '')           AS nama_produk,
  COALESCE(sp.hpp, 0)             AS hpp,
  COALESCE(sp.sell_price, 0)      AS sell_price,
  COALESCE(c.code, 'LAIN')        AS kategori_kode,
  COALESCE(c.name, 'Lain-lain')   AS kategori_nama,
  COALESCE(dsi.qty_sold, 0)       AS qty_sold,
  COALESCE(dsi.revenue, 0)        AS revenue,
  COALESCE(dsi.hpp_total, 0)      AS hpp_total,
  COALESCE(dsi.revenue - dsi.hpp_total, 0) AS profit
FROM daily_sale_items dsi
JOIN  daily_sales     ds  ON ds.id  = dsi.daily_sale_id
LEFT JOIN store_products sp  ON sp.id  = dsi.store_product_id
LEFT JOIN categories     c   ON c.id   = sp.category_id;

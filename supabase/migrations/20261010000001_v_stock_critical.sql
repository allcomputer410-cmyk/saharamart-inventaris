-- Stok kritis dihitung di database (dashboard toko).
-- Sebelumnya dashboard menarik semua baris stock per 1000 dengan ORDER BY current_qty
-- saja; urutan yang seri (banyak qty=0) membuat halaman tumpang tindih sehingga
-- jumlah stok kritis tidak akurat dan lambat.
-- PostgREST tidak bisa membandingkan dua kolom (current_qty <= min_qty), jadi pakai view.
-- security_invoker: RLS tabel stock tetap berlaku untuk user yang memanggil.

CREATE OR REPLACE VIEW public.v_stock_critical
WITH (security_invoker = on) AS
SELECT st.store_id,
       st.store_product_id,
       st.current_qty,
       st.min_qty,
       st.max_qty
FROM public.stock st
WHERE st.min_qty > 0
  AND st.current_qty <= st.min_qty;

GRANT SELECT ON public.v_stock_critical TO authenticated, service_role;

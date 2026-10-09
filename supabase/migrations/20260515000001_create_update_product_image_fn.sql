-- Function untuk update image_url store_products
-- Dipakai oleh banner-generator app via supabase.rpc()
-- SECURITY DEFINER agar bisa bypass RLS dari anon key

CREATE OR REPLACE FUNCTION update_product_image(
  p_product_id UUID,
  p_image_url  TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE store_products
  SET image_url = p_image_url
  WHERE id = p_product_id;
END;
$$;

-- Izinkan anon & authenticated memanggil function ini
GRANT EXECUTE ON FUNCTION update_product_image(UUID, TEXT) TO anon, authenticated;

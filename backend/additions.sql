CREATE TABLE IF NOT EXISTS app_private.invitations (
  token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
-- This table exists in the repository migrations but was absent from the supplied backup.
CREATE TABLE IF NOT EXISTS public.operational_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES public.stores(id),bulan date NOT NULL,
  gaji_karyawan numeric(20,3) DEFAULT 0,listrik numeric(20,3) DEFAULT 0,sewa_tempat numeric(20,3) DEFAULT 0,
  plastik_kemasan numeric(20,3) DEFAULT 0,transportasi numeric(20,3) DEFAULT 0,lain_lain numeric(20,3) DEFAULT 0,
  total_biaya numeric(20,3) GENERATED ALWAYS AS(gaji_karyawan+listrik+sewa_tempat+plastik_kemasan+transportasi+lain_lain) STORED,
  modal_investasi numeric(20,3) DEFAULT 0,catatan text,updated_at timestamptz DEFAULT now(),UNIQUE(store_id,bulan)
);
ALTER TABLE public.operational_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_costs ON public.operational_costs;
CREATE POLICY inventory_costs ON public.operational_costs TO authenticated
  USING(public.inventory_store(store_id) AND public.inventory_role() IN ('direktur','owner','manajer','gm'))
  WITH CHECK(public.inventory_store(store_id) AND public.inventory_role() IN ('direktur','owner','manajer','gm'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.operational_costs TO authenticated;
GRANT ALL ON public.operational_costs TO service_role;
NOTIFY pgrst,'reload schema';

-- One transaction per sales day: network retries replace the same day without duplicates.
CREATE OR REPLACE FUNCTION public.sync_daily_sales(p_daily jsonb,p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE sale_id uuid; target_store uuid := (p_daily->>'store_id')::uuid;
BEGIN
  IF auth.role() <> 'sync_agent' OR NOT public.inventory_store(target_store) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)>20000 THEN
    RAISE EXCEPTION 'Invalid item batch';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE NOT EXISTS(
    SELECT 1 FROM public.store_products p WHERE p.id=(x->>'store_product_id')::uuid AND p.store_id=target_store)) THEN
    RAISE EXCEPTION 'Product does not belong to store' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.daily_sales(store_id,sale_date,total_transactions,total_revenue,total_items_sold,total_profit,synced_at)
  VALUES(target_store,(p_daily->>'sale_date')::date,(p_daily->>'total_transactions')::integer,
    (p_daily->>'total_revenue')::numeric,(p_daily->>'total_items_sold')::numeric,(p_daily->>'total_profit')::numeric,now())
  ON CONFLICT(store_id,sale_date) DO UPDATE SET total_transactions=excluded.total_transactions,
    total_revenue=excluded.total_revenue,total_items_sold=excluded.total_items_sold,total_profit=excluded.total_profit,synced_at=now()
  RETURNING id INTO sale_id;
  DELETE FROM public.daily_sale_items WHERE daily_sale_id=sale_id;
  INSERT INTO public.daily_sale_items(daily_sale_id,store_product_id,qty_sold,revenue,hpp_total,profit,avg_sell_price)
  SELECT sale_id,(x->>'store_product_id')::uuid,(x->>'qty_sold')::numeric,(x->>'revenue')::numeric,(x->>'hpp_total')::numeric,
    (x->>'revenue')::numeric-(x->>'hpp_total')::numeric,
    COALESCE((x->>'avg_sell_price')::numeric,(x->>'revenue')::numeric/NULLIF((x->>'qty_sold')::numeric,0),0)
  FROM jsonb_array_elements(p_items) x;
  RETURN sale_id;
END $$;
REVOKE ALL ON FUNCTION public.sync_daily_sales(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_daily_sales(jsonb,jsonb) TO sync_agent;
NOTIFY pgrst,'reload schema';

-- Applied after restoring into a new database. Only Next.js reaches private tables.
CREATE TABLE app_private.sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app_private.sessions(user_id);
CREATE TABLE app_private.sync_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id),
  token_hash text UNIQUE NOT NULL, label text NOT NULL, created_at timestamptz DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE app_private.rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE UNIQUE INDEX inventory_users_email ON auth.users(lower(email)) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.auth_is_global() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active AND status='active'
    AND role IN ('direktur','owner','manajer','gm'))
$$;
CREATE OR REPLACE FUNCTION public.auth_store_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT store_id FROM public.user_profiles WHERE id=auth.uid() AND is_active AND status='active'
$$;
CREATE FUNCTION public.inventory_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT role::text FROM public.user_profiles WHERE id=auth.uid() AND is_active AND status='active'
$$;
CREATE FUNCTION public.inventory_store(store uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN auth.role()='sync_agent' THEN store=(auth.jwt()->>'store_id')::uuid
    ELSE public.auth_is_global() OR store=public.auth_store_id() END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_global(),public.auth_store_id(),public.inventory_role(),public.inventory_store(uuid)
  TO authenticated,sync_agent;

-- Restore no source grants/policies. Explicit allowlist; unlisted tables remain private.
DO $$
DECLARE t text; expr text; write_expr text; parent text; fk text;
  tables text[] := ARRAY['audit_log','brands','categories','cek_stok_session_items','cek_stok_sessions',
    'daily_sale_items','daily_sales','notifications','order_items','orders','payment_method_overrides',
    'promo_products','promo_recommendations','promo_rules','promotions','purchase_items','purchases',
    'sales_transactions','stock','stock_movements','stock_opname_items','stock_opnames','store_item_discounts',
    'store_products','store_suppliers','stores','suppliers','sync_log','units','user_profiles',
    'warehouse_transfer_items','warehouse_transfers'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    expr := NULL;
    IF t='user_profiles' THEN
      expr := 'id=auth.uid()';
    ELSIF t='stores' THEN expr := 'public.inventory_store(id)';
    ELSIF t='warehouse_transfers' THEN expr := '(public.inventory_store(from_store_id) OR public.inventory_store(to_store_id))';
    ELSIF t='warehouse_transfer_items' THEN
      expr := 'EXISTS(SELECT 1 FROM public.warehouse_transfers p WHERE p.id=transfer_id)';
    ELSIF t IN ('brands','categories','suppliers','units') THEN expr := 'true';
    ELSIF t='payment_method_overrides' THEN
      expr := 'EXISTS(SELECT 1 FROM public.sales_transactions p WHERE p.notransaksi=payment_method_overrides.notransaksi)';
    ELSIF t IN ('daily_sale_items','order_items','promo_products','promo_rules','purchase_items','stock_opname_items','cek_stok_session_items') THEN
      SELECT v.p,v.f INTO parent,fk FROM (VALUES
        ('daily_sale_items','daily_sales','daily_sale_id'),('order_items','orders','order_id'),
        ('promo_products','promotions','promo_id'),('promo_rules','promotions','promo_id'),
        ('purchase_items','purchases','purchase_id'),('stock_opname_items','stock_opnames','opname_id'),
        ('cek_stok_session_items','cek_stok_sessions','session_id')) v(n,p,f) WHERE v.n=t;
      expr := format('EXISTS(SELECT 1 FROM public.%I p WHERE p.id=%I.%I)',parent,t,fk);
    ELSE expr := 'public.inventory_store(store_id)';
    END IF;
    IF t IN ('notifications','promotions') THEN expr := '('||expr||' OR (store_id IS NULL AND public.inventory_role() IS NOT NULL))'; END IF;
    EXECUTE format('CREATE POLICY inventory_read ON public.%I FOR SELECT TO authenticated USING (%s)',t,expr);
    -- User management runs transactionally in Next.js, never via arbitrary profile updates.
    IF t IN ('user_profiles','daily_sales','daily_sale_items','purchases','purchase_items','sales_transactions','sync_log','brands','categories','units','store_item_discounts') THEN CONTINUE; END IF;
    write_expr := expr;
    IF t IN ('promotions','notifications') THEN write_expr := 'public.inventory_store(store_id) OR (store_id IS NULL AND public.auth_is_global())'; END IF;
    IF t IN ('stores','suppliers','store_suppliers','store_products') THEN
      write_expr := '('||expr||') AND public.inventory_role() IN (''direktur'',''owner'',''manajer'')';
    ELSIF t IN ('promo_products','promo_rules','promotions','promo_recommendations') THEN
      write_expr := '('||write_expr||') AND public.inventory_role() IN (''direktur'',''owner'',''manajer'',''gm'')';
    END IF;
    EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY inventory_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',t,write_expr);
    IF t <> 'audit_log' AND t <> 'stock_movements' THEN
      EXECUTE format('CREATE POLICY inventory_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,write_expr,write_expr);
      EXECUTE format('CREATE POLICY inventory_delete ON public.%I FOR DELETE TO authenticated USING (%s)',t,write_expr);
    END IF;
  END LOOP;
END $$;

DO $$ DECLARE t text; expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stores','brands','categories','suppliers','store_suppliers','store_products','stock','stock_movements',
    'daily_sales','daily_sale_items','purchases','purchase_items','sales_transactions','store_item_discounts','sync_log','audit_log'] LOOP
    expr := CASE
      WHEN t='stores' THEN 'public.inventory_store(id)'
      WHEN t IN ('brands','categories','suppliers') THEN 'true'
      WHEN t='daily_sale_items' THEN 'EXISTS(SELECT 1 FROM public.daily_sales p WHERE p.id=daily_sale_id)'
      WHEN t='purchase_items' THEN 'EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=purchase_id)'
      ELSE 'public.inventory_store(store_id)' END;
    EXECUTE format('GRANT SELECT ON public.%I TO sync_agent',t);
    EXECUTE format('CREATE POLICY sync_read ON public.%I FOR SELECT TO sync_agent USING (%s)',t,expr);
    IF t IN ('stores','brands','categories') THEN CONTINUE; END IF;
    EXECUTE format('GRANT INSERT,UPDATE ON public.%I TO sync_agent',t);
    EXECUTE format('CREATE POLICY sync_insert ON public.%I FOR INSERT TO sync_agent WITH CHECK (%s)',t,expr);
    EXECUTE format('CREATE POLICY sync_update ON public.%I FOR UPDATE TO sync_agent USING (%s) WITH CHECK (%s)',t,expr,expr);
    IF t='daily_sale_items' THEN
      GRANT DELETE ON public.daily_sale_items TO sync_agent;
      EXECUTE format('CREATE POLICY sync_delete ON public.%I FOR DELETE TO sync_agent USING (%s)',t,expr);
    END IF;
  END LOOP;
END $$;

-- Views must respect the requesting user's store policies rather than the owner's privileges.
ALTER VIEW public.v_critical_stock SET (security_invoker=true);
ALTER VIEW public.v_margin_rendah SET (security_invoker=true);
ALTER VIEW public.v_rekap_kasir SET (security_invoker=true);
ALTER VIEW public.v_sale_items_detail SET (security_invoker=true);
GRANT SELECT ON public.v_critical_stock,public.v_margin_rendah,public.v_rekap_kasir,public.v_sale_items_detail TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,sync_agent;
NOTIFY pgrst, 'reload schema';

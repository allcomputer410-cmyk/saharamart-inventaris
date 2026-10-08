-- Role tingkat-cluster untuk PostgREST + RLS. Jalankan SEBELUM restore dump.
-- Idempoten: aman diulang.
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE sync_agent NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticator LOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT authenticated, sync_agent, service_role TO authenticator;

-- Migration: 044_enable_rls_public_tables
-- Description: Habilita Row Level Security en todas las tablas del schema public.
--   Supabase expone el schema public por la Data API (PostgREST) con las claves
--   anon/authenticated. Sin RLS, cualquiera con la anon key podría leer o escribir
--   tablas como users (password_hash) o refresh_tokens.
--
--   Sin políticas, RLS deniega todo a anon/authenticated. El backend no se ve
--   afectado: conecta con pg como el rol postgres (dueño de las tablas, BYPASSRLS)
--   y Supabase se usa solo para Storage con la service key (que también bypassa RLS).
--
--   Las tablas que se creen después de esta migración NO heredan RLS: cada migración
--   nueva con CREATE TABLE debe agregar ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
--
-- Created: 2026-11-15

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Rollback SQL (commented for reference)
-- DO $$
-- DECLARE t RECORD;
-- BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
--   END LOOP;
-- END $$;

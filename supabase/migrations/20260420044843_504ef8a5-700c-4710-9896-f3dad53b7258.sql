-- Ensure vault extension is available
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Store the app base URL in vault (idempotent)
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'app_base_url';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret('https://eaglefootballcrm.com', 'app_base_url', 'Base URL for cron-invoked edge functions');
  ELSE
    PERFORM vault.update_secret(v_existing, 'https://eaglefootballcrm.com', 'app_base_url', 'Base URL for cron-invoked edge functions');
  END IF;
END $$;

-- Helper function for cron jobs to read app base URL
CREATE OR REPLACE FUNCTION public.get_app_base_url()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1;
$$;

-- Helper function for cron jobs to read service role key
CREATE OR REPLACE FUNCTION public.get_service_role_key()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
$$;

-- Lock down: only service_role / postgres should call these
REVOKE ALL ON FUNCTION public.get_app_base_url() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_service_role_key() FROM PUBLIC, anon, authenticated;
-- Helper RPC callable only by service_role to seed the service_role_key into Vault.
CREATE OR REPLACE FUNCTION public.vault_seed_service_role_key(p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'service_role_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(p_value, 'service_role_key', 'Service role key for pg_cron edge function calls');
  ELSE
    PERFORM vault.update_secret(v_existing, p_value, 'service_role_key', 'Service role key for pg_cron edge function calls');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_seed_service_role_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_seed_service_role_key(text) TO service_role;
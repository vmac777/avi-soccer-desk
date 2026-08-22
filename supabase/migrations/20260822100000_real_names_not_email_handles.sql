-- Stop seeding a person's name with their email handle.
--
-- `handle_new_user` set `full_name = split_part(email, '@', 1)`, so the desk
-- opened with "Morning, vmachado194." That is not a missing name — it is a
-- wrong one, which is worse, because every fallback downstream sees a value
-- and trusts it. Greeting only when a name exists did not help for exactly
-- that reason.
--
-- A name we were never told should be absent. The app now greets by name when
-- there is one and says only "Morning." when there is not, and anyone can set
-- their own from the sidebar.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'intern',
    -- Supabase carries an invite's display name here. Use it when it is there;
    -- otherwise leave it null rather than inventing one from the address.
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Clear the names that were never names: a full_name identical to the email
-- local-part was written by the old trigger, not chosen by a person. Anyone
-- whose handle genuinely is their name can set it back in one click, which is
-- a better trade than greeting everybody by their login.
UPDATE public.profiles p
SET full_name = NULL
FROM auth.users u
WHERE u.id = p.id
  AND p.full_name IS NOT NULL
  AND p.full_name = split_part(u.email, '@', 1);

-- The one name we do know.
UPDATE public.profiles p
SET full_name = 'Vitor'
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = 'vmachado194@gmail.com';

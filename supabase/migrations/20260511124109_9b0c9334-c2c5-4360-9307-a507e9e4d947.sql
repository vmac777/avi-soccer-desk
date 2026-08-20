CREATE OR REPLACE FUNCTION public.propagate_qatar_sporting_directors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.market = 'Qatar - Stars League'
     AND NEW.club = 'Sporting Directors'
     AND NEW.last_contact IS DISTINCT FROM OLD.last_contact
  THEN
    -- Mirror to placeholder Qatar clubs (no real contact person)
    UPDATE contacts
    SET last_contact = NEW.last_contact
    WHERE market = 'Qatar - Stars League'
      AND id <> NEW.id
      AND (contact_person IS NULL OR btrim(contact_person) = '');
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: sync placeholder Qatar clubs to current Sporting Directors date
UPDATE contacts
SET last_contact = (
  SELECT last_contact FROM contacts
  WHERE market = 'Qatar - Stars League' AND club = 'Sporting Directors'
)
WHERE market = 'Qatar - Stars League'
  AND club <> 'Sporting Directors'
  AND (contact_person IS NULL OR btrim(contact_person) = '');
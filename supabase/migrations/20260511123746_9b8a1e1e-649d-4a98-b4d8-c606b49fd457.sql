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
     AND NEW.last_contact IS NOT NULL
  THEN
    UPDATE contacts
    SET last_contact = NEW.last_contact
    WHERE market = 'Qatar - Stars League'
      AND id <> NEW.id
      AND (last_contact IS NULL OR last_contact < NEW.last_contact);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_qatar_sporting_directors ON contacts;
CREATE TRIGGER trg_propagate_qatar_sporting_directors
AFTER UPDATE OF last_contact ON contacts
FOR EACH ROW
EXECUTE FUNCTION public.propagate_qatar_sporting_directors();

-- Backfill: propagate the existing Sporting Directors last_contact now
UPDATE contacts
SET last_contact = (
  SELECT last_contact FROM contacts
  WHERE market = 'Qatar - Stars League' AND club = 'Sporting Directors'
)
WHERE market = 'Qatar - Stars League'
  AND club <> 'Sporting Directors'
  AND (last_contact IS NULL OR last_contact < (
    SELECT last_contact FROM contacts
    WHERE market = 'Qatar - Stars League' AND club = 'Sporting Directors'
  ));
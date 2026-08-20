
CREATE OR REPLACE FUNCTION public.recalculate_last_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE contacts
  SET last_contact = (
    SELECT MAX(created_at::date)
    FROM interactions
    WHERE contact_id = OLD.contact_id
  )
  WHERE id = OLD.contact_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_recalculate_last_contact
AFTER DELETE ON public.interactions
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_last_contact();

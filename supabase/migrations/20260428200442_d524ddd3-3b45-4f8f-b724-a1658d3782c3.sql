CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_news_item_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO news_items_audit (news_item_id, action, changed_by, new_values)
    VALUES (NEW.id, 'insert', COALESCE(auth.uid(), NEW.submitted_by), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_actor := COALESCE(auth.uid(), NEW.submitted_by);
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO news_items_audit (news_item_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'delete', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO news_items_audit (news_item_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'restore', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    ELSE
      INSERT INTO news_items_audit (news_item_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, 'update', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;
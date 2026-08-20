-- Polymorphic follow-ups: allow reminders to target contacts, players, scouted targets, or pitches.

-- 1. Add new columns (nullable initially so we can backfill safely)
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS target_label text,
  ADD COLUMN IF NOT EXISTS target_sublabel text;

-- 2. Backfill existing rows from contact_* columns
UPDATE public.follow_ups
SET target_type = 'contact',
    target_id = contact_id,
    target_label = contact_name,
    target_sublabel = contact_club
WHERE target_type IS NULL;

-- 3. Enforce NOT NULL on the new fields and add a CHECK for valid types
ALTER TABLE public.follow_ups
  ALTER COLUMN target_type SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN target_label SET NOT NULL;

ALTER TABLE public.follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_target_type_check;

ALTER TABLE public.follow_ups
  ADD CONSTRAINT follow_ups_target_type_check
  CHECK (target_type IN ('contact', 'squad_player', 'scouted_target', 'sell_pitch', 'buy_pitch'));

-- 4. Relax legacy contact columns so non-contact reminders can omit them
ALTER TABLE public.follow_ups
  ALTER COLUMN contact_id DROP NOT NULL,
  ALTER COLUMN contact_name DROP NOT NULL,
  ALTER COLUMN contact_club DROP NOT NULL;

-- 5. Indexes for fast lookup by target
CREATE INDEX IF NOT EXISTS idx_follow_ups_target ON public.follow_ups(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON public.follow_ups(due_date) WHERE completed = false;

-- 6. Cross-link table for optional secondary references
CREATE TABLE IF NOT EXISTS public.follow_up_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('contact', 'squad_player', 'scouted_target', 'sell_pitch', 'buy_pitch')),
  link_id text NOT NULL,
  link_label text NOT NULL,
  link_sublabel text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_links_follow_up ON public.follow_up_links(follow_up_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_links_target ON public.follow_up_links(link_type, link_id);

-- 7. RLS: mirror follow_ups (shared across the team, restricted to admins)
ALTER TABLE public.follow_up_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read follow_up_links"
  ON public.follow_up_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert follow_up_links"
  ON public.follow_up_links FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update follow_up_links"
  ON public.follow_up_links FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete follow_up_links"
  ON public.follow_up_links FOR DELETE TO authenticated USING (true);

CREATE POLICY "restrict_follow_up_links_select_admin"
  ON public.follow_up_links AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "restrict_follow_up_links_insert_admin"
  ON public.follow_up_links AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "restrict_follow_up_links_update_admin"
  ON public.follow_up_links AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "restrict_follow_up_links_delete_admin"
  ON public.follow_up_links AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());
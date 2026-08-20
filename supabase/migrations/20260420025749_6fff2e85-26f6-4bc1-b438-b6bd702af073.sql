-- Section 1: profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'intern')) DEFAULT 'admin',
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Section 2: auto-create profile on new auth signup
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
    split_part(NEW.email, '@', 1)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Section 3: Backfill existing users as admins
INSERT INTO public.profiles (id, role, full_name)
SELECT id, 'admin', split_part(email, '@', 1)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Section 4: clubs table
CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  league text,
  tier integer CHECK (tier IN (1, 2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clubs_name_unique UNIQUE (name)
);

CREATE INDEX idx_clubs_tier ON clubs(tier);
CREATE INDEX idx_clubs_league ON clubs(league);
CREATE INDEX idx_clubs_country ON clubs(country);

-- Section 5: News-feature tables
CREATE TABLE club_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  CONSTRAINT club_sources_unique_url UNIQUE (club_id, url),
  CONSTRAINT club_sources_url_format CHECK (url ~ '^https?://')
);
CREATE INDEX idx_club_sources_club_id ON club_sources(club_id);

CREATE TABLE news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  blurb text NOT NULL CHECK (char_length(blurb) BETWEEN 1 AND 300),
  urgency text NOT NULL CHECK (urgency IN ('relevant', 'urgent', 'super_urgent')),
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  digest_emailed_at timestamptz,
  super_urgent_emailed_at timestamptz,
  last_email_attempt_at timestamptz,
  blurb_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', blurb)) STORED,
  CONSTRAINT news_items_url_format CHECK (url ~ '^https?://')
);
CREATE INDEX idx_news_items_urgency ON news_items(urgency) WHERE deleted_at IS NULL;
CREATE INDEX idx_news_items_created_at ON news_items(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_news_items_digest_pending ON news_items(created_at)
  WHERE urgency = 'urgent' AND digest_emailed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_news_items_blurb_tsv ON news_items USING GIN (blurb_tsv);

CREATE TABLE news_items_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id uuid NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  CONSTRAINT news_items_clubs_unique UNIQUE (news_item_id, club_id)
);
CREATE INDEX idx_news_items_clubs_club_id ON news_items_clubs(club_id);
CREATE INDEX idx_news_items_clubs_news_item_id ON news_items_clubs(news_item_id);

CREATE TABLE news_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id uuid NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_reads_unique UNIQUE (news_item_id, user_id)
);
CREATE INDEX idx_news_reads_user_id ON news_reads(user_id);

CREATE TABLE email_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id uuid REFERENCES news_items(id) ON DELETE SET NULL,
  email_type text NOT NULL CHECK (email_type IN ('super_urgent', 'digest')),
  error_message text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_email_failures_unresolved ON email_failures(attempted_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE news_items_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_item_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'restore')),
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX idx_news_items_audit_item ON news_items_audit(news_item_id);
CREATE INDEX idx_news_items_audit_time ON news_items_audit(changed_at DESC);

CREATE TABLE submission_rate_limits (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  submission_count integer NOT NULL DEFAULT 1,
  super_urgent_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX idx_submission_rate_limits_recent ON submission_rate_limits(user_id, window_start DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER news_items_updated_at
  BEFORE UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_news_item_audit()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER news_items_audit_trigger
  AFTER INSERT OR UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION log_news_item_audit();

-- Section 6: helper functions
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION get_submitter_names(p_user_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM profiles p
  WHERE p.id = ANY(p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION get_submitter_names(uuid[]) TO authenticated;

-- Section 6b: prevent role self-escalation
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
      RAISE EXCEPTION 'Role changes require admin privilege' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_role_self_escalation
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();

-- Section 7: RLS on new tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "news_items_select" ON news_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR is_admin());

CREATE POLICY "news_items_insert" ON news_items
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "news_items_update_admin" ON news_items
  FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "news_items_clubs_select" ON news_items_clubs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "news_items_clubs_insert" ON news_items_clubs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM news_items
            WHERE id = news_item_id AND submitted_by = auth.uid())
  );

CREATE POLICY "news_items_clubs_delete_admin" ON news_items_clubs
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "news_reads_select_own" ON news_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "news_reads_insert_own" ON news_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "news_reads_delete_own" ON news_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "club_sources_select" ON club_sources
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "club_sources_admin_write" ON club_sources
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "email_failures_admin_only" ON email_failures
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "news_items_audit_admin_read" ON news_items_audit
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "rate_limits_own_read" ON submission_rate_limits
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());

-- Section 8: RLS on clubs
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clubs_select_authed" ON clubs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clubs_admin_write" ON clubs
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "clubs_admin_update" ON clubs
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "clubs_admin_delete" ON clubs
  FOR DELETE TO authenticated USING (is_admin());

-- Section 9: Restrictive policies on existing CRM tables
CREATE POLICY "restrict_buy_negotiation_entries_select_admin" ON buy_negotiation_entries
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_buy_negotiation_entries_insert_admin" ON buy_negotiation_entries
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_negotiation_entries_update_admin" ON buy_negotiation_entries
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_negotiation_entries_delete_admin" ON buy_negotiation_entries
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_buy_pitch_documents_select_admin" ON buy_pitch_documents
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_buy_pitch_documents_insert_admin" ON buy_pitch_documents
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitch_documents_update_admin" ON buy_pitch_documents
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitch_documents_delete_admin" ON buy_pitch_documents
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_buy_pitch_notes_select_admin" ON buy_pitch_notes
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_buy_pitch_notes_insert_admin" ON buy_pitch_notes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitch_notes_update_admin" ON buy_pitch_notes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitch_notes_delete_admin" ON buy_pitch_notes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_buy_pitches_select_admin" ON buy_pitches
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_buy_pitches_insert_admin" ON buy_pitches
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitches_update_admin" ON buy_pitches
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_buy_pitches_delete_admin" ON buy_pitches
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_contacts_select_admin" ON contacts
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_contacts_insert_admin" ON contacts
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_contacts_update_admin" ON contacts
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_contacts_delete_admin" ON contacts
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_follow_ups_select_admin" ON follow_ups
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_follow_ups_insert_admin" ON follow_ups
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_follow_ups_update_admin" ON follow_ups
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_follow_ups_delete_admin" ON follow_ups
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_interactions_select_admin" ON interactions
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_interactions_insert_admin" ON interactions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_interactions_update_admin" ON interactions
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_interactions_delete_admin" ON interactions
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_pitch_documents_select_admin" ON pitch_documents
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_pitch_documents_insert_admin" ON pitch_documents
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_pitch_documents_update_admin" ON pitch_documents
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_pitch_documents_delete_admin" ON pitch_documents
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_pitch_notes_select_admin" ON pitch_notes
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_pitch_notes_insert_admin" ON pitch_notes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_pitch_notes_update_admin" ON pitch_notes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_pitch_notes_delete_admin" ON pitch_notes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_pitches_select_admin" ON pitches
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_pitches_insert_admin" ON pitches
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_pitches_update_admin" ON pitches
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_pitches_delete_admin" ON pitches
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_player_club_links_select_admin" ON player_club_links
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_player_club_links_insert_admin" ON player_club_links
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_player_club_links_update_admin" ON player_club_links
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_player_club_links_delete_admin" ON player_club_links
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_player_notes_select_admin" ON player_notes
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_player_notes_insert_admin" ON player_notes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_player_notes_update_admin" ON player_notes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_player_notes_delete_admin" ON player_notes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_player_recommendations_select_admin" ON player_recommendations
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_player_recommendations_insert_admin" ON player_recommendations
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_player_recommendations_update_admin" ON player_recommendations
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_player_recommendations_delete_admin" ON player_recommendations
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_players_tracking_select_admin" ON players_tracking
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_players_tracking_insert_admin" ON players_tracking
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_players_tracking_update_admin" ON players_tracking
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_players_tracking_delete_admin" ON players_tracking
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_scouted_targets_select_admin" ON scouted_targets
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_scouted_targets_insert_admin" ON scouted_targets
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_scouted_targets_update_admin" ON scouted_targets
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_scouted_targets_delete_admin" ON scouted_targets
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "restrict_settings_select_admin" ON settings
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "restrict_settings_insert_admin" ON settings
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "restrict_settings_update_admin" ON settings
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "restrict_settings_delete_admin" ON settings
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());
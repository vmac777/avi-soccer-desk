-- Somewhere for a crash to land.
--
-- The app had no error reporting at all. When the player page went blank the
-- only reason anyone knew was that a screenshot got sent — the desk could have
-- been broken for a week and nobody would have had a way to tell. For a pilot
-- somebody runs live deals on, "the user told us" is not a detection strategy.
--
-- Deliberately a table in this project rather than a third-party service. A
-- crash report carries whatever was on screen — a player's name, a club
-- contact — and sending that to another processor is a decision the agency
-- should make on purpose, with a DPA behind it, not one that arrives as a
-- dependency. This keeps it inside the database they already own.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- Who hit it. Set from auth.uid() by the insert policy, so it cannot be
  -- forged into somebody else's name.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- How it reached us. A render crash is caught by the error boundary; the
  -- other two are the global handlers, which is where an await with no catch
  -- ends up — the failure mode that produced dead-looking buttons.
  kind text NOT NULL CHECK (kind IN ('render', 'unhandled_rejection', 'window_error')),

  message text NOT NULL,
  stack text,
  component_stack text,

  -- Where the user was. Path only, never the query string: that carries
  -- contact ids and search terms.
  route text,
  user_agent text,

  -- Set once an admin has looked at it, so a triaged crash stops shouting.
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- The dashboard reads "recent, unacknowledged, newest first".
CREATE INDEX IF NOT EXISTS idx_client_errors_recent
  ON public.client_errors (occurred_at DESC);

-- Grouping identical crashes: one bug hit fifty times is one line, not fifty.
CREATE INDEX IF NOT EXISTS idx_client_errors_message
  ON public.client_errors (message, occurred_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may file a crash, but only as themselves. An intern hitting
-- a bug is exactly the report we want and the one we would otherwise never see.
CREATE POLICY "client_errors_insert_own" ON public.client_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Reading them is another matter: a stack trace can quote whatever was on
-- screen. Admins only, and RESTRICTIVE so it ANDs with the permissive policy
-- rather than being OR-ed away by it.
CREATE POLICY "client_errors_select" ON public.client_errors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "restrict_client_errors_select_admin" ON public.client_errors
  AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin());

-- Acknowledging is an admin action.
CREATE POLICY "client_errors_update" ON public.client_errors
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "restrict_client_errors_update_admin" ON public.client_errors
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "client_errors_delete" ON public.client_errors
  FOR DELETE TO authenticated USING (true);
CREATE POLICY "restrict_client_errors_delete_admin" ON public.client_errors
  AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin());

COMMENT ON TABLE public.client_errors IS
  'Front-end crashes. Written by src/lib/reportError.ts, read on the System Health page.';

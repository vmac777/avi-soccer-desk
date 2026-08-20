-- Create contacts table
CREATE TABLE public.contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  market text NOT NULL,
  club text NOT NULL,
  contact_person text DEFAULT '',
  who_spoke text DEFAULT '',
  last_contact date,
  stage text DEFAULT 'Lead' CHECK (stage IN ('Lead','Offered','Negotiating','Closed Won','Closed Lost','Dormant')),
  players_offered text DEFAULT '',
  club_interest text DEFAULT '',
  needs text DEFAULT '',
  priority text DEFAULT 'Normal' CHECK (priority IN ('High','Normal','Low')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contacts"
  ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts"
  ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts"
  ON public.contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contacts"
  ON public.contacts FOR DELETE TO authenticated USING (true);

-- Create interactions table
CREATE TABLE public.interactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  note text NOT NULL,
  interaction_type text DEFAULT 'Note' CHECK (interaction_type IN ('Call','Meeting','WhatsApp','Email','TransferRoom','Note')),
  logged_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read interactions"
  ON public.interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert interactions"
  ON public.interactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update interactions"
  ON public.interactions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete interactions"
  ON public.interactions FOR DELETE TO authenticated USING (true);

-- Create players_tracking table
CREATE TABLE public.players_tracking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  current_club text DEFAULT '',
  position text DEFAULT '',
  status text DEFAULT 'Available' CHECK (status IN ('Available','Offered','In Negotiation','Sold','Withdrawn')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.players_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read players"
  ON public.players_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert players"
  ON public.players_tracking FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update players"
  ON public.players_tracking FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete players"
  ON public.players_tracking FOR DELETE TO authenticated USING (true);

-- Create player_club_links table
CREATE TABLE public.player_club_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES public.players_tracking(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  link_type text CHECK (link_type IN ('Offered','Interest','Rejected','Sold')),
  date_linked date DEFAULT current_date,
  notes text DEFAULT ''
);

ALTER TABLE public.player_club_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read links"
  ON public.player_club_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert links"
  ON public.player_club_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update links"
  ON public.player_club_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete links"
  ON public.player_club_links FOR DELETE TO authenticated USING (true);

-- Create enriched contacts view
CREATE VIEW public.contacts_enriched AS
SELECT c.*,
  current_date - c.last_contact AS days_since_contact,
  CASE
    WHEN c.last_contact IS NULL THEN 'unknown'
    WHEN current_date - c.last_contact < 90 THEN 'hot'
    WHEN current_date - c.last_contact < 180 THEN 'warm'
    WHEN current_date - c.last_contact < 365 THEN 'cold'
    ELSE 'frozen'
  END AS health_status,
  (SELECT count(*) FROM public.interactions i WHERE i.contact_id = c.id) AS interaction_count
FROM public.contacts c;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_contacts_market ON public.contacts(market);
CREATE INDEX idx_contacts_stage ON public.contacts(stage);
CREATE INDEX idx_contacts_last_contact ON public.contacts(last_contact);
CREATE INDEX idx_interactions_contact_id ON public.interactions(contact_id);
CREATE INDEX idx_interactions_created_at ON public.interactions(created_at);
CREATE INDEX idx_player_club_links_player ON public.player_club_links(player_id);
CREATE INDEX idx_player_club_links_contact ON public.player_club_links(contact_id);
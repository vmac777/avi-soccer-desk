// Re-export the auto-generated Supabase client
export { supabase } from '@/integrations/supabase/client';

export type Contact = {
  id: string;
  market: string;
  club: string;
  contact_person: string;
  who_spoke: string;
  last_contact: string | null;
  stage: '' | 'Contacted - No Answer' | 'Contacted' | 'Offered' | 'Negotiating' | 'Closed Won' | 'Closed Lost' | 'Dormant';
  players_offered: string;
  club_interest: string;
  needs: string;
  priority: 'High' | 'Normal' | 'Low';
  role: string;
  linkedin: string;
  phone1: string;
  phone2: string;
  phone3: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_primary: boolean;
};

export type ContactEnriched = Contact & {
  days_since_contact: number | null;
  health_status: 'active' | 'recent' | 'stale' | 'unknown';
  interaction_count: number;
};

export type Interaction = {
  id: string;
  contact_id: string;
  note: string;
  interaction_type: 'Call' | 'Meeting' | 'WhatsApp' | 'Email' | 'TransferRoom' | 'Note';
  logged_by: string;
  created_at: string;
};

export type Player = {
  id: string;
  player_name: string;
  current_club: string;
  position: string;
  status: 'Available' | 'Offered' | 'In Negotiation' | 'Sold' | 'Withdrawn';
  notes: string;
  created_at: string;
};

export type PlayerClubLink = {
  id: string;
  player_id: string;
  contact_id: string;
  link_type: 'Offered' | 'Interest' | 'Rejected' | 'Sold';
  date_linked: string;
  notes: string;
};

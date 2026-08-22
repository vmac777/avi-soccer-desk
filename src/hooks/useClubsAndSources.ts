import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export type Club = {
  id: string;
  name: string;
  country: string | null;
  league: string | null;
  tier: number | null;
  /** Override for the crest derived from the Transfermarkt id. Usually null. */
  crest_url: string | null;
};

export type ClubSource = {
  id: string;
  club_id: string;
  url: string;
  label: string | null;
  created_at: string;
  created_by: string | null;
};

export function useClubs() {
  return useQuery({
    queryKey: ['clubs-repo'],
    queryFn: () =>
      fetchAllRows<Club>((from, to) =>
        supabase
          .from('clubs')
          .select('id, name, country, league, tier, crest_url')
          .order('name', { ascending: true })
          .range(from, to)
      ),
  });
}

export function useClubSources() {
  return useQuery({
    queryKey: ['club-sources'],
    queryFn: () =>
      fetchAllRows<ClubSource>((from, to) =>
        supabase
          .from('club_sources')
          .select('id, club_id, url, label, created_at, created_by')
          .order('label', { ascending: true })
          .range(from, to)
      ),
  });
}

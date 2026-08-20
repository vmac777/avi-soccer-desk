import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Club = {
  id: string;
  name: string;
  country: string | null;
  league: string | null;
  tier: number | null;
};

export type ClubSource = {
  id: string;
  club_id: string;
  url: string;
  label: string | null;
  created_at: string;
  created_by: string | null;
};

async function fetchAll<T>(
  build: (from: number, to: number) => any
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useClubs() {
  return useQuery({
    queryKey: ['clubs-repo'],
    queryFn: () =>
      fetchAll<Club>((from, to) =>
        supabase
          .from('clubs')
          .select('id, name, country, league, tier')
          .order('name', { ascending: true })
          .range(from, to)
      ),
  });
}

export function useClubSources() {
  return useQuery({
    queryKey: ['club-sources'],
    queryFn: () =>
      fetchAll<ClubSource>((from, to) =>
        supabase
          .from('club_sources')
          .select('id, club_id, url, label, created_at, created_by')
          .order('label', { ascending: true })
          .range(from, to)
      ),
  });
}

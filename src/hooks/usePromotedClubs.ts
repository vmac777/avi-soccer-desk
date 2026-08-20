import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

type ClubRef = { market: string; club: string };

function useClubListSetting(key: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async (): Promise<ClubRef[]> => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return [];
      try {
        const parsed = JSON.parse(data.value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePromotedClubs() {
  const query = useClubListSetting('promoted_clubs_2025');
  const set = useMemo(() => {
    const s = new Set<string>();
    (query.data ?? []).forEach((p) => s.add(`${p.market}::${p.club}`));
    return s;
  }, [query.data]);
  const isPromoted = (market: string, club: string) => set.has(`${market}::${club}`);
  return { ...query, isPromoted };
}

export function useRelegatedClubs() {
  const query = useClubListSetting('relegated_clubs_2025');
  const set = useMemo(() => {
    const s = new Set<string>();
    (query.data ?? []).forEach((p) => s.add(`${p.market}::${p.club}`));
    return s;
  }, [query.data]);
  const isRelegated = (market: string, club: string) => set.has(`${market}::${club}`);
  return { ...query, isRelegated };
}

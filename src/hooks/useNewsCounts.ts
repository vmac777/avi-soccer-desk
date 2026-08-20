import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type NewsUrgency = 'super_urgent' | 'urgent' | 'relevant' | null;

export interface LeagueNewsCount {
  league: string;
  unread_count: number;
  max_urgency: NewsUrgency;
}

export interface ClubNewsCount {
  club_id: string;
  club_name: string;
  unread_count: number;
  max_urgency: NewsUrgency;
}

const LEAGUE_KEY = ['news-counts', 'league'] as const;
const clubKey = (league: string) => ['news-counts', 'club', league] as const;

/** Subscribe to news_items + news_reads, debounced refetch of given query keys. */
function useNewsRealtime(invalidateKeys: readonly unknown[][]) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const debouncedInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      }, 500);
    };

    const channel = supabase
      .channel('news-counts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_items' }, debouncedInvalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'news_items' }, debouncedInvalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_reads' }, debouncedInvalidate)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Imperatively invalidate all news-count queries. Call after marking items as read. */
export function useInvalidateNewsCounts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['news-counts'] });
  };
}

export function useLeagueNewsCounts(enabled = true) {
  const query = useQuery({
    queryKey: LEAGUE_KEY,
    enabled,
    queryFn: async (): Promise<Record<string, LeagueNewsCount>> => {
      const { data, error } = await supabase.rpc('league_news_counts_for_user' as any);
      if (error) throw error;
      const map: Record<string, LeagueNewsCount> = {};
      (data as LeagueNewsCount[] | null)?.forEach((row) => {
        if (row.league) map[row.league] = row;
      });
      return map;
    },
    staleTime: 60_000,
  });
  useNewsRealtime([LEAGUE_KEY as unknown as unknown[]]);
  return query;
}

export function useClubNewsCounts(league: string | null | undefined) {
  const enabled = !!league;
  const query = useQuery({
    queryKey: clubKey(league || ''),
    enabled,
    queryFn: async (): Promise<Record<string, ClubNewsCount>> => {
      const { data, error } = await supabase.rpc('club_news_counts_for_user' as any, { p_league: league });
      if (error) throw error;
      const map: Record<string, ClubNewsCount> = {};
      (data as ClubNewsCount[] | null)?.forEach((row) => {
        // Key by club_name (case-insensitive) so frontend can look up by club string
        if (row.club_name) map[row.club_name.toLowerCase()] = row;
      });
      return map;
    },
    staleTime: 60_000,
  });
  useNewsRealtime([clubKey(league || '') as unknown as unknown[]]);
  return query;
}

export function urgencyClasses(urgency: NewsUrgency): { border: string; badge: string } {
  if (urgency === 'super_urgent') {
    return {
      border: 'border-red-500/70',
      badge: 'bg-red-600 text-white',
    };
  }
  if (urgency === 'urgent') {
    return {
      border: 'border-[#c8952a]',
      badge: 'bg-[#c8952a] text-white',
    };
  }
  // 'relevant' or null → no visual treatment
  return { border: '', badge: '' };
}

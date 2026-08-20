import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The people on this desk, read from `profiles`.
 *
 * Replaces a hardcoded list of names. Anything that asks "who spoke to this
 * club?" should offer the accounts that actually exist in this deployment,
 * not a list baked in at build time.
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .order('full_name');
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.full_name)
        .filter((n): n is string => !!n && n.trim().length > 0);
    },
    staleTime: 5 * 60 * 1000,
  });
}

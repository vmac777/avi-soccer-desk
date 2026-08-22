import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  parseReport, parseSourceStatus,
  type ClubNewsReport, type SourceStatus,
} from '@/lib/clubNewsReport';

/**
 * Generating and reading back a club's news reports.
 *
 * Generation is a mutation rather than a query on purpose: it costs real money
 * every time it runs, so it must happen when somebody clicks and never because
 * a component remounted or a window regained focus.
 */

export interface StoredReport {
  id: string;
  generated_at: string;
  duration_ms: number | null;
  model: string | null;
  web_search_calls: number | null;
  report: ClubNewsReport | null;
  sourceStatus: SourceStatus[];
}

const reportsKey = (clubId: string) => ['club-news-reports', clubId];

export function useClubNewsReports(clubId: string | undefined) {
  return useQuery({
    queryKey: reportsKey(clubId ?? ''),
    enabled: !!clubId,
    queryFn: async (): Promise<StoredReport[]> => {
      const { data, error } = await supabase
        .from('club_news_reports')
        .select('id, generated_at, duration_ms, model, web_search_calls, report_json, source_status')
        .eq('club_id', clubId!)
        .order('generated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        generated_at: row.generated_at,
        duration_ms: row.duration_ms,
        model: row.model,
        web_search_calls: row.web_search_calls,
        // A row written before the schema changed reads as null here and shows
        // as unreadable, rather than crashing the page it appears on.
        report: parseReport(row.report_json),
        sourceStatus: parseSourceStatus(row.source_status),
      }));
    },
  });
}

/**
 * Why the report could not be written, in words an agent can act on.
 *
 * Each of these has a different fix — add a source, set a secret, wait and
 * retry — and a single "generation failed" would hide which one applies.
 */
function messageFor(reason: string | undefined, detail?: string | null): string {
  switch (reason) {
    case 'no_sources':
      return 'This club has no news sources yet. Add one first — a report needs something to read.';
    case 'missing_anthropic_key':
      return 'No Anthropic API key is set on the server. Set the ANTHROPIC_API_KEY secret and redeploy.';
    case 'anthropic_timeout':
      return 'The report took too long to write. Try again, or trim the club down to its best few sources.';
    case 'report_parse_failed':
      return "The model's answer didn't fit the report format. Try again.";
    case 'refused':
      return detail ? `Declined: ${detail}` : 'The model declined to write this report.';
    case 'club_not_found':
      return 'That club no longer exists.';
    case 'forbidden':
    case 'unauthorized':
      return 'You need an admin account to generate reports.';
    default:
      return detail || 'Could not generate the report.';
  }
}

export function useGenerateClubNewsReport(clubId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('club-news-report', {
        body: { club_id: clubId },
      });
      /**
       * The function answers a refusal with a non-2xx status carrying a body
       * that names the reason. supabase-js turns that into `error` and leaves
       * `data` null, so reading only `data.reason` would report every one of
       * them as an unexplained failure. Pull the body back out of the error.
       */
      if (error) {
        const ctx = (error as { context?: { body?: unknown } }).context;
        let parsed: { reason?: string; detail?: string } = {};
        try {
          parsed = typeof ctx?.body === 'string' ? JSON.parse(ctx.body) : (ctx?.body as typeof parsed) ?? {};
        } catch { /* body was not JSON — fall through to the generic message */ }
        throw new Error(messageFor(parsed.reason, parsed.detail ?? error.message));
      }
      if (!data?.ok) throw new Error(messageFor(data?.reason, data?.detail));

      const report = parseReport(data.report);
      if (!report) throw new Error(messageFor('report_parse_failed'));
      return report;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKey(clubId ?? '') });
      toast.success('Report ready');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

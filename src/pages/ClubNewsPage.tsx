import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Loader2, Newspaper, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useClubs, type ClubSource } from '@/hooks/useClubsAndSources';
import { useClubNewsReports, useGenerateClubNewsReport } from '@/hooks/useClubNewsReport';
import { resolveClubNews } from '@/lib/clubNewsSources';
import ClubNewsReport from '@/components/club/ClubNewsReport';

/**
 * One club's news: where we read about them, and what the last read said.
 *
 * The button is the point of the page. Everything above it exists so that when
 * a report comes out thin, it is obvious whether the club had a quiet week or
 * we are pointing at two dead URLs.
 */

function useClubSourcesFor(clubId: string | undefined) {
  return useQuery({
    queryKey: ['club-sources', clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<ClubSource[]> => {
      const { data, error } = await supabase
        .from('club_sources')
        .select('id, club_id, url, label, created_at, created_by')
        .eq('club_id', clubId!)
        .order('label', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ClubNewsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: clubs = [], isLoading: clubsLoading } = useClubs();
  const club = useMemo(() => clubs.find((c) => c.id === id), [clubs, id]);

  const { data: sources = [], isLoading: sourcesLoading } = useClubSourcesFor(id);
  const { data: reports = [], isLoading: reportsLoading } = useClubNewsReports(id);
  const generate = useGenerateClubNewsReport(id);

  const [showing, setShowing] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const current = showing
    ? reports.find((r) => r.id === showing) ?? reports[0]
    : reports[0];

  /**
   * The bundled Sky / BBC / ESPN URLs for this club, if we have them.
   *
   * They are written into `club_sources` rather than passed to the function at
   * call time: the server accepts no URLs from the client, so a default only
   * counts once it is a row somebody can see and edit.
   */
  const defaults = club ? resolveClubNews(club.name) : null;

  const seedDefaults = async () => {
    if (!club || !defaults) return;
    setSeeding(true);
    try {
      const rows = [
        { label: 'Sky Sports', url: defaults.skySports },
        { label: 'BBC Sport', url: defaults.bbc },
        { label: 'ESPN', url: defaults.espn },
      ].map((r) => ({ club_id: club.id, ...r }));
      // `club_sources_unique_url` makes this safe to run twice.
      const { error } = await supabase.from('club_sources').upsert(rows, {
        onConflict: 'club_id,url',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['club-sources'] });
      toast.success('Added the standard sources for this club');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add those sources");
    } finally {
      setSeeding(false);
    }
  };

  if (clubsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Club not found.</p>
        <button onClick={() => navigate('/news/repository')} className="mt-2 text-sm text-primary underline">
          ← Back to the repository
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <button
        onClick={() => navigate('/news/repository')}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Repository
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">{club.name}</h1>
          <p className="text-xs text-muted-foreground">
            {[club.league, club.country].filter(Boolean).join(' · ') || 'No league or country recorded'}
          </p>
        </div>

        <Button
          onClick={() => generate.mutate()}
          disabled={generate.isPending || sources.length === 0}
          className="h-9 gap-1.5 text-xs"
          title={sources.length === 0 ? 'Add a source first' : undefined}
        >
          {generate.isPending
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the sources…</>
            : <><Sparkles className="h-3.5 w-3.5" /> Generate report</>}
        </Button>
      </div>

      {/* Sources */}
      <div className="rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sources ({sources.length})
          </h2>
          <button
            onClick={() => navigate(`/news/repository?club=${club.id}`)}
            className="text-[10px] text-primary hover:underline"
          >
            Manage
          </button>
        </div>

        {sourcesLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : sources.length === 0 ? (
          /*
            An empty state that says what to do, rather than a disabled button
            with no explanation. Firing the request anyway would spend money to
            produce a report about nothing.
          */
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No sources yet. A report is written from the pages listed here, so there is nothing to read.
            </p>
            {defaults ? (
              <Button
                variant="outline"
                onClick={seedDefaults}
                disabled={seeding}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                {seeding ? 'Adding…' : 'Add Sky Sports, BBC and ESPN'}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => navigate(`/news/repository?club=${club.id}`)}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" /> Add a source
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{s.label || 'Source'}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-0.5 truncate text-primary hover:underline"
                >
                  <span className="truncate">{s.url}</span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Report */}
      {reportsLoading ? (
        <p className="text-xs text-muted-foreground">Loading reports…</p>
      ) : reports.length === 0 ? (
        <div className="rounded border border-dashed border-border p-8 text-center">
          <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No report yet. Generating one reads every source above and searches the web,
            then writes what it means for us.
          </p>
        </div>
      ) : current?.report ? (
        <div className="rounded border border-border p-4">
          <ClubNewsReport report={current.report} sourceStatus={current.sourceStatus} />
        </div>
      ) : (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-500/90">
          This report can't be read — it was saved in a format the app no longer understands.
          Generate a new one.
        </div>
      )}

      {/* History. Only worth showing once there is a choice to make. */}
      {reports.length > 1 && (
        <div className="space-y-1">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Earlier reports
          </h2>
          {reports.map((r) => {
            const active = r.id === (current?.id ?? '');
            return (
              <button
                key={r.id}
                onClick={() => setShowing(r.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs',
                  active ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <span className="truncate">
                  {new Date(r.generated_at).toLocaleString()}
                  {r.report?.headline ? ` — ${r.report.headline}` : ' — unreadable'}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {r.sourceStatus.filter((s) => s.status === 'ok').length}/{r.sourceStatus.length} sources
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

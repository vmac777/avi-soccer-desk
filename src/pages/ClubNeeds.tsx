import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAllRequirements, REQUIREMENT_STATUSES, type RequirementRow } from '@/hooks/useClubRequirements';
import { useShortlistEntries } from '@/hooks/useShortlist';
import { useClubs } from '@/hooks/useClubsAndSources';
import { useContacts } from '@/hooks/useData';
import { useScoutedTargets } from '@/hooks/useBuyData';
import { toRosterPlayer } from '@/lib/rosterMapping';
import { matchRosterToRequirement } from '@/lib/matching';
import { requirementSummary } from '@/lib/shortlistToPitch';

/**
 * What the network wants, in one place.
 *
 * Until now the desk could tell you who you had and who you had spoken to, but
 * never what any of them were actually looking for — that lived in a notebook
 * or in the agent's head. This is the other half of a contact book: not "who do
 * I know" but "what is open right now, and do I hold anybody for it".
 */

const POSITION_FILTERS = ['All', 'GK', 'DEF', 'MID', 'FWD'] as const;

const GROUPS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MID: ['DM', 'CM', 'AM', 'RM', 'LM'],
  FWD: ['CF', 'ST', 'SS', 'LW', 'RW', 'FW'],
};

const statusPill = (status: string) =>
  status === 'open'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
    : 'bg-muted text-muted-foreground border-border';

export default function ClubNeedsPage() {
  const navigate = useNavigate();
  const { data: requirements = [], isLoading } = useAllRequirements();
  const { data: entries = [] } = useShortlistEntries();
  const { data: clubs = [] } = useClubs();
  const { data: contacts = [] } = useContacts();
  const { data: targets = [] } = useScoutedTargets();

  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<typeof POSITION_FILTERS[number]>('All');
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const roster = useMemo(() => targets.map(toRosterPlayer), [targets]);
  const clubById = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);
  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  /** Whose need this is, however it was filed. */
  const clubNameOf = useCallback(
    (r: RequirementRow) =>
      (r.club_id && clubById[r.club_id]?.name)
      || (r.contact_id && contactById[r.contact_id]?.club)
      || 'Unattributed',
    [clubById, contactById],
  );

  const shortlistCount = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach((e) => { m[e.requirement_id] = (m[e.requirement_id] ?? 0) + 1; });
    return m;
  }, [entries]);

  /**
   * How many of ours fit each open need.
   *
   * Computed live rather than stored: the roster changes under it, and a stale
   * count on this page would send an agent into a need that has nothing behind
   * it any more. Only open requirements are scanned — the engine returns
   * nothing for the others anyway.
   */
  const matchCount = useMemo(() => {
    const m: Record<string, number> = {};
    requirements.forEach((r) => {
      m[r.id] = r.status === 'open' ? matchRosterToRequirement(roster, r).length : 0;
    });
    return m;
  }, [requirements, roster]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return requirements
      .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
      .filter((r) => {
        if (posFilter === 'All') return true;
        return GROUPS[posFilter]?.includes(r.position.toUpperCase()) ?? false;
      })
      .filter((r) => {
        if (!s) return true;
        return clubNameOf(r).toLowerCase().includes(s)
          || r.position.toLowerCase().includes(s)
          || (r.notes ?? '').toLowerCase().includes(s);
      })
      .sort((a, b) => clubNameOf(a).localeCompare(clubNameOf(b)));
  }, [requirements, search, posFilter, statusFilter, clubNameOf]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground font-mono text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[11px] tracking-[0.15em] font-bold text-primary uppercase">CLUB NEEDS</h1>
          <p className="text-xs text-muted-foreground">
            What clubs told us they are looking for, and who we hold for it
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search club, position, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 h-8 text-xs bg-card border-border pl-7"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          {POSITION_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setPosFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                posFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5">
          {['open', ...REQUIREMENT_STATUSES.filter((s) => s !== 'open'), 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2 py-1 rounded text-[11px] font-medium uppercase tracking-wider transition-colors',
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No needs recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Open a club contact and add one after your next call.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((r) => {
            const matches = matchCount[r.id] ?? 0;
            const listed = shortlistCount[r.id] ?? 0;
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/needs/${r.id}`)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{clubNameOf(r)}</span>
                  <span className={cn(
                    'shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
                    statusPill(r.status),
                  )}>
                    {r.status}
                  </span>
                </div>

                <p className="mt-1 text-xs text-foreground">{requirementSummary(r)}</p>

                {(r.window_target || r.notes) && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {[r.window_target, r.notes].filter(Boolean).join(' · ')}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3 font-mono text-[10px]">
                  <span className={matches > 0 ? 'text-status-hot' : 'text-muted-foreground'}>
                    {matches} fit
                  </span>
                  {listed > 0 && <span className="text-muted-foreground">{listed} shortlisted</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

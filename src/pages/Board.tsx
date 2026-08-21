import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Clock, PhoneOff, Target, TrendingUp, CalendarClock, Inbox,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useContacts } from '@/hooks/useData';
import { useScoutedTargets, useBuyPitches, BUY_ACTIVE_STAGES } from '@/hooks/useBuyData';
import { useAllRequirements } from '@/hooks/useClubRequirements';
import { useShortlistEntries } from '@/hooks/useShortlist';
import { useFollowUps } from '@/hooks/useFollowUps';
import { useClubs } from '@/hooks/useClubsAndSources';
import { toRosterPlayer } from '@/lib/rosterMapping';
import { buildBoard, rosterCoverage, type Opportunity, type OpportunityKind } from '@/lib/deskBoard';
import { todayKey } from '@/lib/dateKeys';

/**
 * What to do next, rather than how tidy the book is.
 *
 * This replaced a contact-hygiene dashboard inherited from the club product it
 * was seeded from — market heatmap, staleness donuts, a count of contacts. All
 * true, none of it anybody's first question in the morning.
 *
 * An agent's first question is where money is about to move and what is late.
 * Every card here answers that by joining things no single screen held
 * together: what clubs asked for, who we represent, whose contracts are running
 * down, and who owes whom an answer. And every card links to the record it came
 * from, because a claim you cannot check is worth less than no claim.
 */

const KIND_ICON: Record<OpportunityKind, LucideIcon> = {
  ball_in_court: Inbox,
  deadline_near: CalendarClock,
  unworked_match: Target,
  contract_clock: Clock,
  quiet_club: PhoneOff,
  value_moved: TrendingUp,
};

/** Urgency as a left edge. The eye finds the top of the list without reading. */
const edgeFor = (urgency: number) =>
  urgency >= 90 ? 'border-l-status-cold'
  : urgency >= 70 ? 'border-l-primary'
  : 'border-l-border';

function OpportunityCard({ item, onOpen }: { item: Opportunity; onOpen: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      onClick={onOpen}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg border border-l-[3px] border-border bg-card p-4 text-left transition-colors hover:border-primary/40',
        edgeFor(item.urgency),
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{item.headline}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export default function BoardPage() {
  const navigate = useNavigate();
  const { displayName } = useAuth();

  const { data: requirements = [], isLoading: reqLoading } = useAllRequirements();
  const { data: shortlistEntries = [] } = useShortlistEntries();
  const { data: targets = [], isLoading: rosterLoading } = useScoutedTargets();
  const { data: pitches = [] } = useBuyPitches();
  const { data: contacts = [] } = useContacts();
  const { data: followUps = [] } = useFollowUps();
  const { data: clubs = [] } = useClubs();

  const today = todayKey();
  const roster = useMemo(() => targets.map(toRosterPlayer), [targets]);

  const board = useMemo(() => buildBoard({
    requirements,
    shortlistEntries,
    roster,
    pitches,
    contacts,
    clubNames: Object.fromEntries(clubs.map((c) => [c.id, c.name])),
    contactClubs: Object.fromEntries(contacts.map((c) => [c.id, c.club])),
    today,
  }), [requirements, shortlistEntries, roster, pitches, contacts, clubs, today]);

  const coverage = useMemo(() => rosterCoverage(targets), [targets]);

  /** The two sentences at the top. Numbers only where a number is the point. */
  const line = useMemo(() => {
    const due = followUps.filter((f) => !f.completed && f.due_date <= today).length;
    const closing = pitches.filter((p) => p.stage === 'Closing').length;
    const active = pitches.filter((p) =>
      (BUY_ACTIVE_STAGES as readonly string[]).includes(p.stage)).length;
    const quiet = new Set(
      contacts.filter((c) => (c.days_since_contact ?? 0) > 90).map((c) => c.club),
    ).size;
    return { due, closing, active, quiet };
  }, [followUps, pitches, contacts, today]);

  const isLoading = reqLoading || rosterLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="font-mono text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const firstName = (displayName || '').trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── The line ── */}
      <div>
        <h1 className="text-lg font-medium tracking-tight text-foreground">
          {firstName ? `Morning, ${firstName}.` : 'Morning.'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {line.due > 0 ? (
            <>
              <button onClick={() => navigate('/pending-actions')} className="text-foreground underline-offset-2 hover:underline">
                {line.due} {line.due === 1 ? 'thing needs' : 'things need'} you today
              </button>
              {' and '}
            </>
          ) : 'Nothing is late, and '}
          <button onClick={() => navigate('/pitches')} className="text-foreground underline-offset-2 hover:underline">
            {line.active} {line.active === 1 ? 'placement is' : 'placements are'} live
          </button>
          {line.closing > 0 && `, ${line.closing} at closing`}.
          {line.quiet > 0 && (
            <>
              {' '}
              <button onClick={() => navigate('/contacts')} className="text-foreground underline-offset-2 hover:underline">
                {line.quiet} clubs
              </button>
              {' have gone quiet past ninety days.'}
            </>
          )}
        </p>
      </div>

      {/* ── Opportunities ── */}
      <div>
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
          WHERE TO SPEND TODAY
        </h2>

        {board.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-foreground">Nothing to flag yet.</p>
            {/* Reads as a setup checklist rather than a blank screen: the page
                has nothing to say because it has not been told anything. */}
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {requirements.filter((r) => r.status === 'open').length === 0 && (
                <li>
                  ·{' '}
                  <button onClick={() => navigate('/contacts')} className="underline-offset-2 hover:text-foreground hover:underline">
                    Record what a club is looking for
                  </button>
                  {' '}and the roster gets matched against it.
                </li>
              )}
              {roster.length === 0 && (
                <li>
                  ·{' '}
                  <button onClick={() => navigate('/roster')} className="underline-offset-2 hover:text-foreground hover:underline">
                    Add a player
                  </button>
                  {' '}to represent.
                </li>
              )}
              {coverage.missing > 0 && (
                <li>
                  · {coverage.missing} of {coverage.total} players have not been enriched,
                  so contract dates and valuations are missing.
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            {board.map((item) => (
              <OpportunityCard key={item.id} item={item} onOpen={() => navigate(item.href)} />
            ))}
          </div>
        )}

        {/* ── What it could not see ── */}
        {board.length > 0 && coverage.missing > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Working from {coverage.enriched} of {coverage.total} players — {coverage.missing} not
            yet enriched, so contract dates and valuations may be missing.
          </p>
        )}
      </div>

      {/* ── Jump back in ── */}
      {pitches.length > 0 && (
        <div>
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
            PICK UP WHERE YOU LEFT OFF
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[...pitches]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 3)
              .map((p) => {
                const name = roster.find((r) => r.id === p.scouted_target_id)?.name;
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate('/pitches')}
                    className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                  >
                    <p className="truncate text-xs font-medium text-foreground">
                      {name ?? 'Placement'}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.stage}
                    </p>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

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
import { getAge, getLatestXtvM } from '@/lib/rosterData';
import { formatMoneyShort } from '@/lib/money';
import { buildBoard, rosterCoverage, type Opportunity, type OpportunityKind } from '@/lib/deskBoard';
import { todayKey, parseDateKey } from '@/lib/dateKeys';

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

/**
 * The first card is bigger.
 *
 * Six identical cards read as a list to work through. Something has to tell the
 * eye where to start, and the ranking already knows — so the top of it looks
 * like the top of it.
 */
function OpportunityCard({ item, onOpen, hero = false }: {
  item: Opportunity; onOpen: () => void; hero?: boolean;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      onClick={onOpen}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg border border-l-[3px] border-border bg-card text-left transition-colors hover:border-primary/40',
        hero ? 'p-5 xl:col-span-2' : 'px-4 py-3',
        edgeFor(item.urgency),
      )}
    >
      <Icon className={cn('shrink-0 text-muted-foreground', hero ? 'mt-0.5 h-5 w-5' : 'mt-0.5 h-4 w-4')} />
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium text-foreground', hero ? 'text-base' : 'text-sm')}>
          {item.headline}
        </p>
        <p className={cn('mt-0.5 text-muted-foreground', hero ? 'text-xs' : 'text-[11px]')}>
          {item.detail}
        </p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export default function BoardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

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

  /** Reminders actually due, not a count of them. */
  const dueToday = useMemo(
    () => followUps
      .filter((f) => !f.completed && f.due_date <= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5),
    [followUps, today],
  );

  /**
   * The top of the book by valuation, with how long each contract has left.
   *
   * Sorted by value because that is the order an agent thinks in, and the
   * contract chip is here rather than only in a card so the page shows
   * leverage running out at a glance.
   */
  const topOfBook = useMemo(() => roster
    .map((p) => {
      const xtv = getLatestXtvM(p);
      const monthsLeft = p.contractEndDate
        ? Math.round(
          (parseDateKey(p.contractEndDate.slice(0, 10)).getTime() - parseDateKey(today).getTime())
          / (86_400_000 * 30))
        : null;
      return { player: p, xtv, monthsLeft: monthsLeft != null && monthsLeft >= 0 ? monthsLeft : null };
    })
    .sort((a, b) => (b.xtv ?? -1) - (a.xtv ?? -1))
    .slice(0, 8),
  [roster, today]);

  const recentPitches = useMemo(
    () => [...pitches].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4),
    [pitches],
  );

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

  /**
   * Greet by name, or not at all.
   *
   * `displayName` falls back to the email local-part when a profile has no
   * full name, so this page opened with "Morning, vmachado194." An email handle
   * is never the right way to address anybody — better to say nothing.
   */
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
          <div className="grid gap-2 xl:grid-cols-2">
            {board.map((item, i) => (
              <OpportunityCard
                key={item.id}
                item={item}
                hero={i === 0}
                onOpen={() => navigate(item.href)}
              />
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

      {/* ── The book ──
          Who he actually represents, biggest first. Not a count of the roster —
          the names, which is the thing an agent points at. It carries the
          contract chip too, so the page shows leverage running out rather than
          only telling you about it in a card. */}
      {topOfBook.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
              THE BOOK
            </h2>
            <button
              onClick={() => navigate('/roster')}
              className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              all {roster.length} →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            {topOfBook.map(({ player: p, xtv, monthsLeft }) => (
              <button
                key={p.id}
                onClick={() => navigate(`/roster/${p.id}`)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {[p.position, getAge(p.dob) ?? p.age, p.currentClub].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground">
                    {xtv != null ? formatMoneyShort(xtv * 1_000_000) : '—'}
                  </span>
                  {monthsLeft != null && monthsLeft <= 12 && (
                    <span className={cn(
                      'shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
                      monthsLeft <= 6
                        ? 'border-status-cold/30 bg-status-cold/10 text-status-cold'
                        : 'border-primary/30 bg-primary/10 text-primary',
                    )}>
                      {monthsLeft}m left
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── What is due, and what you were last in ──
          A footer strip rather than a side rail: DUE is usually one line, and a
          third of the screen given to one line reads worse than no rail. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
            DUE
          </h2>
          {dueToday.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">Nothing due.</p>
          ) : (
            <div className="space-y-1.5">
              {dueToday.map((f) => (
                <button
                  key={f.id}
                  onClick={() => navigate('/pending-actions')}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <p className="truncate text-xs font-medium text-foreground">{f.target_label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{f.action_text}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {recentPitches.length > 0 && (
          <div>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
              LAST WORKED
            </h2>
            <div className="space-y-1.5">
              {recentPitches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate('/pitches')}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <span className="truncate text-xs font-medium text-foreground">
                    {roster.find((r) => r.id === p.scouted_target_id)?.name ?? 'Placement'}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {p.stage}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

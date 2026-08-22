import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useContacts } from '@/hooks/useData';
import { useScoutedTargets, useBuyPitches, BUY_ACTIVE_STAGES } from '@/hooks/useBuyData';
import { useAllRequirements } from '@/hooks/useClubRequirements';
import { useShortlistEntries } from '@/hooks/useShortlist';
import { useClubs } from '@/hooks/useClubsAndSources';
import { toRosterPlayer } from '@/lib/rosterMapping';
import { getLatestXtvM } from '@/lib/rosterData';
import {
  buildBoard, rosterCoverage, needsNobodyPitched, totalUnpitchedFits,
  type Opportunity,
} from '@/lib/deskBoard';
import { todayKey, parseDateKey } from '@/lib/dateKeys';
import BoardHero, { type HeroClub } from '@/components/board/BoardHero';
import NeedCard from '@/components/board/NeedCard';
import DeskStrip from '@/components/board/DeskStrip';
import ContractRunway, { type RunwayPin } from '@/components/board/ContractRunway';
import TheBook, { type BookCard } from '@/components/board/TheBook';

/**
 * What to do next, rather than how tidy the book is.
 *
 * The board used to rank six kinds of opportunity as equals, which read as a
 * list to work through. It now leads with one thing — clubs that asked for a
 * player, have someone of ours who fits, and have heard nothing back — because
 * that is the only item on the page where the agency is the one holding things
 * up. Everything else it used to rank above those is still here, demoted to a
 * strip.
 *
 * Desktop and mobile are one screen, not two: same sections, same order, same
 * data. Hovering a need opens its fit panel and dims the book to the players
 * who answer it; on a phone the same panel opens on tap and the book is
 * off-screen anyway.
 */

const SECTION_LABEL = 'font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]';

function Section({ label, helper, gold = true, children }: {
  label: string; helper?: string; gold?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={`${SECTION_LABEL} ${gold ? 'text-primary' : 'text-foreground/45'}`}>{label}</h2>
        {helper && <span className="hidden text-[11px] text-foreground/40 md:block">{helper}</span>}
      </div>
      {children}
    </section>
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
  const { data: clubs = [] } = useClubs();

  /**
   * One id drives both the fit panel and the book dimming, on every input
   * method. Hover sets it, focus sets it, a tap toggles it — so a keyboard and
   * a thumb reach the same behaviour a mouse does rather than a lesser one.
   */
  const [openNeedId, setOpenNeedId] = useState<string | null>(null);

  const today = todayKey();
  const roster = useMemo(() => targets.map(toRosterPlayer), [targets]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const boardInput = useMemo(() => ({
    requirements,
    shortlistEntries,
    roster,
    pitches,
    contacts,
    clubNames: Object.fromEntries(clubs.map((c) => [c.id, c.name])),
    contactClubs: Object.fromEntries(contacts.map((c) => [c.id, c.club])),
    today,
  }), [requirements, shortlistEntries, roster, pitches, contacts, clubs, today]);

  const needs = useMemo(() => needsNobodyPitched(boardInput), [boardInput]);
  const board = useMemo(() => buildBoard(boardInput), [boardInput]);
  const coverage = useMemo(() => rosterCoverage(targets), [targets]);

  /** Everything the board ranks that is not one of the hero needs. */
  const rest = useMemo(
    () => board.filter((o) => o.kind !== 'unworked_match').slice(0, 4),
    [board],
  );

  const openNeed = needs.find((n) => n.requirementId === openNeedId) ?? null;
  const fittingIds = useMemo(
    () => new Set(openNeed?.rows.filter((r) => r.ok).map((r) => r.playerId) ?? []),
    [openNeed],
  );

  const monthsLeftFor = useMemo(() => {
    const now = parseDateKey(today).getTime();
    return (end?: string) => {
      if (!end) return null;
      const m = Math.round((parseDateKey(end.slice(0, 10)).getTime() - now) / (86_400_000 * 30));
      return m >= 0 ? m : null;
    };
  }, [today]);

  const bookCards: BookCard[] = useMemo(() => roster
    .map((p) => ({ p, xtv: getLatestXtvM(p) }))
    .sort((a, b) => (b.xtv ?? -1) - (a.xtv ?? -1))
    .slice(0, 4)
    .map(({ p }) => ({
      player: p,
      monthsLeft: monthsLeftFor(p.contractEndDate),
      flag: openNeed && fittingIds.has(p.id) ? openNeed.club : null,
      dimmed: !!openNeed && !fittingIds.has(p.id),
    })),
  [roster, monthsLeftFor, openNeed, fittingIds]);

  /**
   * Contracts running down on players nobody is already working.
   *
   * Capped hard: past five, the pins on the desktop band overlap into an
   * unreadable smear, so the rest are counted rather than crammed. Saying "+3
   * more" is honest; drawing eight labels on top of each other is not.
   */
  const runway = useMemo(() => {
    const beingWorked = new Set(
      pitches
        .filter((p) => (BUY_ACTIVE_STAGES as readonly string[]).includes(p.stage))
        .map((p) => p.scouted_target_id),
    );
    const all: RunwayPin[] = roster
      .filter((p) => !beingWorked.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, months: monthsLeftFor(p.contractEndDate) }))
      .filter((p): p is RunwayPin => p.months != null && p.months <= 12)
      .sort((a, b) => a.months - b.months);
    return { pins: all.slice(0, 5), hidden: Math.max(0, all.length - 5) };
  }, [roster, pitches, monthsLeftFor]);

  const heroFitClubs: HeroClub[] = useMemo(() => needs.map((n) => ({
    id: n.requirementId,
    name: n.club,
    crest: n.clubId ? clubById.get(n.clubId)?.crest_url : null,
  })), [needs, clubById]);

  /** Placements where they are waiting on us, not the other way round. */
  const waiting = useMemo(() => pitches.filter((p) =>
    p.ball_in_court === 'us' && (BUY_ACTIVE_STAGES as readonly string[]).includes(p.stage)),
  [pitches]);

  const waitingClubs: HeroClub[] = useMemo(() => waiting.slice(0, 4).map((p) => ({
    id: p.id,
    // The buying side is the counterparty on a placement; fall back to the
    // selling club when nobody has been approached yet.
    name: contacts.find((c) => c.id === (p.buying_contact_id ?? p.contact_id))?.club ?? '',
    crest: null,
  })).filter((c) => c.name), [waiting, contacts]);

  const bookValue = useMemo(
    () => roster.reduce((sum, p) => sum + (getLatestXtvM(p) ?? 0) * 1_000_000, 0),
    [roster],
  );

  const openNeedCount = requirements.filter((r) => r.status === 'open').length;
  const fitCount = totalUnpitchedFits(needs);
  const maxFits = Math.max(1, ...needs.map((n) => n.fitCount));

  const isLoading = reqLoading || rosterLoading;
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="font-mono text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  /**
   * Greet by name, or not at all. `displayName` used to fall back to the email
   * local-part, so the desk opened with "MORNING, VMACHADO194".
   */
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0];
  const nothingYet = needs.length === 0 && rest.length === 0 && roster.length === 0;

  return (
    <div className="mx-auto max-w-[1180px] space-y-7 pb-4 md:space-y-8">
      <BoardHero
        greeting={firstName ? `Morning, ${firstName}` : 'Morning'}
        fitCount={fitCount}
        fitClubs={heroFitClubs}
        waitingCount={waiting.length}
        waitingClubs={waitingClubs}
        openNeeds={openNeedCount}
        bookValue={bookValue}
      />

      {needs.length > 0 && (
        <Section label="Needs nobody has pitched" helper="oldest ask first · every one links to the need">
          <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">
            {needs.map((need, i) => (
              <NeedCard
                key={need.requirementId}
                need={need}
                rank={i}
                maxFits={maxFits}
                /* The first card opens on load so the interaction is
                   discoverable — on a phone there is no hover to hint at it. */
                open={openNeedId === null ? i === 0 : openNeedId === need.requirementId}
                onOpen={() => setOpenNeedId(need.requirementId)}
                onClose={() => setOpenNeedId(null)}
                onToggle={() => setOpenNeedId(
                  openNeedId === need.requirementId ? null : need.requirementId,
                )}
                onPutForward={() => navigate(`/needs/${need.requirementId}#shortlist`)}
                onOpenNeed={() => navigate(`/needs/${need.requirementId}`)}
              />
            ))}
          </div>
        </Section>
      )}

      {rest.length > 0 && (
        <Section label="Also on the desk" gold={false}>
          <DeskStrip items={rest} onOpen={(item: Opportunity) => navigate(item.href)} />
        </Section>
      )}

      {runway.pins.length > 0 && (
        <Section label="Contract runway · next 12 months" helper="leverage peaks inside six months">
          <ContractRunway
            pins={runway.pins}
            hidden={runway.hidden}
            onOpen={(id) => navigate(`/roster/${id}`)}
          />
        </Section>
      )}

      {bookCards.length > 0 && (
        <Section
          label={`The book · top of ${roster.length}`}
          helper="hover a need above to see who fits it"
        >
          <TheBook cards={bookCards} onOpen={(id) => navigate(`/roster/${id}`)} />
        </Section>
      )}

      {/* What it could not see. Said once, at the bottom, rather than hedged
          into every card above it. */}
      {coverage.missing > 0 && !nothingYet && (
        <p className="text-[10px] text-foreground/40">
          Working from {coverage.enriched} of {coverage.total} players — {coverage.missing} not yet
          enriched, so contract dates and valuations may be missing.
        </p>
      )}

      {/* The page has nothing to say because it has not been told anything.
          A setup checklist reads better than a blank screen. */}
      {nothingYet && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-foreground">Nothing to flag yet.</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {openNeedCount === 0 && (
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
          </ul>
        </div>
      )}
    </div>
  );
}

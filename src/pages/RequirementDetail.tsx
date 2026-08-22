import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Printer, SendHorizonal, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useRequirement, useUpdateRequirement, useDeleteRequirement, REQUIREMENT_STATUSES, type RequirementStatus } from '@/hooks/useClubRequirements';
import {
  useShortlist, useAddToShortlist, useUpdateShortlistEntry,
  useRemoveFromShortlist, useMarkShortlistPresented,
  SHORTLIST_STATUS_LABELS, type ShortlistEntry,
} from '@/hooks/useShortlist';
import { useClubs } from '@/hooks/useClubsAndSources';
import { useContacts } from '@/hooks/useData';
import { useScoutedTargets, useAddBuyPitch } from '@/hooks/useBuyData';
import { toRosterPlayer } from '@/lib/rosterMapping';
import { matchRosterToRequirement, unmatchableFields, isPricedOut, type MatchReason } from '@/lib/matching';
import { getAge, getLatestXtvM, type RosterPlayer } from '@/lib/rosterData';
import { pitchArgsFromShortlist, requirementSummary } from '@/lib/shortlistToPitch';
import { formatMoneyShort } from '@/lib/money';
import { exportShortlistPdf } from '@/lib/exportShortlistPdf';

/**
 * One club's need, everyone we hold who fits it, and the four we chose.
 *
 * The two halves are deliberately different things. The left is the engine's
 * answer — every roster player who fits, ranked, with its reasoning shown so
 * an agent can disagree with it. The right is the agent's answer, which is
 * shorter, in their order, and carries a line per player that no score
 * produces. The ranking is an input to judgement, not a replacement for it.
 */

const verdictClass = (v: MatchReason['verdict']) => {
  switch (v) {
    case 'fits': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    case 'close': return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
    case 'misses': return 'bg-red-500/15 text-red-300 border-red-500/25';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const scoreColour = (score: number) =>
  score >= 80 ? 'text-status-hot' : score >= 55 ? 'text-status-warm' : 'text-muted-foreground';

/**
 * Scroll to the fragment in the URL once the page has content.
 *
 * React Router owns navigation and does not honour `#hash` — a link to
 * `/needs/x#shortlist` lands at the top of the page, so the board's "Put N
 * forward" would look like it had ignored the click. The frame's delay is not
 * decoration: the target does not exist until the requirement query resolves
 * and the column renders.
 */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    let raf = 0;
    let tries = 0;
    const find = () => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (tries++ < 40) raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [hash]);
}

export default function RequirementDetailPage() {
  useScrollToHash();
  const { id = null } = useParams();
  const navigate = useNavigate();

  const { requirement, isLoading } = useRequirement(id);
  const { entries } = useShortlist(id);
  const { data: clubs = [] } = useClubs();
  const { data: contacts = [] } = useContacts();
  const { data: targets = [] } = useScoutedTargets();

  const updateRequirement = useUpdateRequirement();
  const deleteRequirement = useDeleteRequirement();
  const addToShortlist = useAddToShortlist();
  const updateEntry = useUpdateShortlistEntry();
  const removeEntry = useRemoveFromShortlist();
  const markPresented = useMarkShortlistPresented();
  const addPitch = useAddBuyPitch();

  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [showPricedOut, setShowPricedOut] = useState(false);

  const roster = useMemo(() => targets.map(toRosterPlayer), [targets]);
  const playerById = useMemo(
    () => Object.fromEntries(roster.map((p) => [p.id, p])) as Record<string, RosterPlayer>,
    [roster],
  );
  const rowById = useMemo(() => Object.fromEntries(targets.map((t) => [t.id, t])), [targets]);

  const clubName = useMemo(() => {
    if (!requirement) return '';
    if (requirement.club_id) return clubs.find((c) => c.id === requirement.club_id)?.name ?? '';
    if (requirement.contact_id) return contacts.find((c) => c.id === requirement.contact_id)?.club ?? '';
    return '';
  }, [requirement, clubs, contacts]);

  const shortlistedIds = useMemo(
    () => new Set(entries.map((e) => e.scouted_target_id)),
    [entries],
  );

  const allMatches = useMemo(
    () => (requirement ? matchRosterToRequirement(roster, requirement) : []),
    [roster, requirement],
  );

  /**
   * Everyone the club could not sign at the price.
   *
   * Split out rather than scored low and left in the list: a €70m player
   * against a €5m brief is not a weak match, he is not a match. Only clear
   * misses go — a player inside the negotiable band still shows, and a player
   * we hold no valuation for is never hidden, because not knowing what he is
   * worth is not evidence he is too dear.
   */
  const pricedOut = useMemo(() => allMatches.filter(isPricedOut), [allMatches]);
  const matches = useMemo(
    () => (showPricedOut ? allMatches : allMatches.filter((m) => !isPricedOut(m))),
    [allMatches, showPricedOut],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground font-mono text-sm">Loading...</span>
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => navigate('/needs')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Club needs
        </button>
        <p className="text-sm text-muted-foreground">Requirement not found.</p>
      </div>
    );
  }

  const handleAdd = (playerId: string, score: number) => {
    addToShortlist.mutate({
      requirement_id: requirement.id,
      scouted_target_id: playerId,
      match_score: score,
      rank: entries.length,
    });
  };

  /** Swap two entries' ranks. Small lists, so a swap beats a reindex. */
  const move = (entry: ShortlistEntry, direction: -1 | 1) => {
    const i = entries.findIndex((e) => e.id === entry.id);
    const j = i + direction;
    if (j < 0 || j >= entries.length) return;
    updateEntry.mutate({ id: entry.id, rank: entries[j].rank });
    updateEntry.mutate({ id: entries[j].id, rank: entry.rank });
  };

  const handleCreatePitch = async (entry: ShortlistEntry) => {
    const row = rowById[entry.scouted_target_id];
    const player = playerById[entry.scouted_target_id];
    if (!row || !player) {
      toast.error('That player is no longer on the roster.');
      return;
    }

    const args = pitchArgsFromShortlist({
      player: {
        id: row.id,
        name: row.name,
        owner_club: (row as { owner_club?: string | null }).owner_club ?? null,
        current_club: row.current_club ?? null,
      },
      buyingClubName: clubName || null,
      reportedByContactId: requirement.contact_id,
      contacts,
      requirementSummary: requirementSummary(requirement),
    });

    if (!args.contact_id && !args.buying_contact_id) {
      toast.error('No contact at either club yet — add one before pitching.');
      return;
    }

    try {
      const { pitch, action } = await addPitch.mutateAsync(args);
      updateEntry.mutate({ id: entry.id, status: 'pitched', buy_pitch_id: pitch.id });
      if (action === 'reopened') toast.success('Pitch re-opened');
      else if (action === 'opened') toast.info('Already pitched — opening the existing one');
      else toast.success('Pitch created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the pitch');
    }
  };

  const handleDelete = () => {
    const listed = entries.length;
    const warning = listed > 0
      ? ` Its shortlist of ${listed} goes too.`
      : '';
    if (!window.confirm(`Delete this ${requirement.position} need?${warning}`)) return;
    deleteRequirement.mutate(requirement.id, {
      onSuccess: () => {
        toast.success('Need deleted');
        navigate('/needs');
      },
    });
  };

  const handlePrint = () => {
    if (entries.length === 0) {
      toast.error('Nothing on the shortlist to print yet.');
      return;
    }
    exportShortlistPdf({
      clubName: clubName || 'Club',
      requirement,
      players: entries
        .map((e) => ({ entry: e, player: playerById[e.scouted_target_id] }))
        .filter((x): x is { entry: ShortlistEntry; player: RosterPlayer } => !!x.player),
    });
    markPresented.mutate(entries.filter((e) => e.status === 'shortlisted').map((e) => e.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate('/needs')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Club needs
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {REQUIREMENT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => updateRequirement.mutate({ id: requirement.id, status: s as RequirementStatus })}
              className={cn(
                'rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors',
                requirement.status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>

          {/* Deleting was only possible from the club contact panel, which is
              not where anyone looks for it. Withdrawn keeps the record; this
              removes it, and the shortlist with it. */}
          <Button
            variant="outline"
            onClick={handleDelete}
            className="h-8 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete need
          </Button>
        </div>
      </div>

      {/* The brief */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h1 className="text-lg font-medium tracking-tight text-foreground">{clubName || 'Unattributed club'}</h1>
        <p className="mt-0.5 text-sm text-foreground">{requirementSummary(requirement)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {requirement.salary_max != null && (
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              wages ≤ {formatMoneyShort(requirement.salary_max)}/yr
            </span>
          )}
          {requirement.needs_eu_passport && (
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">EU passport</span>
          )}
          {requirement.league_experience.map((l) => (
            <span key={l} className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{l}</span>
          ))}
          {requirement.window_target && (
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{requirement.window_target}</span>
          )}
        </div>
        {requirement.notes && (
          <p className="mt-2 text-xs text-muted-foreground">{requirement.notes}</p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Who fits */}
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
              WHO WE HOLD ({matches.length})
            </h2>
            {/* Never hide players without saying how many, or the list quietly
                becomes the whole truth. */}
            {pricedOut.length > 0 && (
              <button
                onClick={() => setShowPricedOut((v) => !v)}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showPricedOut
                  ? `hide ${pricedOut.length} over the fee`
                  : `${pricedOut.length} over the fee — show`}
              </button>
            )}
          </div>
          {requirement.status !== 'open' ? (
            <p className="font-mono text-xs text-muted-foreground">
              Matching only runs on open requirements.
            </p>
          ) : matches.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              {pricedOut.length > 0
                ? `Everyone who plays this position is over the fee ceiling (${pricedOut.length}).`
                : 'Nobody on the roster plays this position.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {matches.map((m) => {
                const player = playerById[m.playerId];
                if (!player) return null;
                const unmatchable = unmatchableFields(player);
                const already = shortlistedIds.has(m.playerId);
                const age = getAge(player.dob) ?? player.age;
                const xtv = getLatestXtvM(player);
                return (
                  <div key={m.playerId} className="rounded border border-border bg-card p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => navigate(`/roster/${m.playerId}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-sm font-medium text-foreground">{player.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {[player.position, age != null ? `${age}` : null, player.currentClub]
                            .filter(Boolean).join(' · ')}
                          {xtv != null ? ` · €${xtv.toFixed(1)}m` : ''}
                        </span>
                      </button>
                      <span className={cn('shrink-0 font-mono text-sm font-semibold', scoreColour(m.score))}>
                        {m.score}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.reasons.map((r) => (
                        <span
                          key={r.factor}
                          title={r.detail}
                          className={cn('rounded border px-1.5 py-0.5 text-[9px]', verdictClass(r.verdict))}
                        >
                          {r.detail}
                        </span>
                      ))}
                    </div>

                    {/* The scorer does not consult provenance, so a guessed
                        value still feeds a score. Say so rather than let the
                        number imply a confidence the data does not support. */}
                    {unmatchable.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        Scored on unverified {unmatchable.join(', ')}
                      </p>
                    )}

                    <div className="mt-2 flex justify-end">
                      <Button
                        onClick={() => handleAdd(m.playerId, m.score)}
                        disabled={already}
                        variant="outline"
                        className="h-6 text-[10px]"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {already ? 'On the list' : 'Shortlist'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* What we send.
            `id` is the board's target: its "Put N forward" links here rather
            than to the top of the page, so the button lands on the thing it
            names instead of somewhere the reader has to go looking. */}
        <div id="shortlist" className="scroll-mt-20">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
              SHORTLIST ({entries.length})
            </h2>
            <Button
              onClick={handlePrint}
              variant="outline"
              className="h-6 text-[10px]"
              disabled={entries.length === 0}
            >
              <Printer className="mr-1 h-3 w-3" /> Print one-pager
            </Button>
          </div>

          {entries.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              Nothing chosen yet. Add from the left, then reorder and write a line each.
            </p>
          ) : (
            <div className="space-y-1.5">
              {entries.map((e, i) => {
                const player = playerById[e.scouted_target_id];
                return (
                  <div key={e.id} className="rounded border border-border bg-card p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">
                            {player?.name ?? 'Player removed from roster'}
                          </span>
                          {e.match_score != null && (
                            <span className={cn('font-mono text-[10px]', scoreColour(e.match_score))}>
                              {e.match_score}
                            </span>
                          )}
                          <span className="rounded border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                            {SHORTLIST_STATUS_LABELS[e.status]}
                          </span>
                        </div>

                        <Input
                          value={noteDraft[e.id] ?? e.note ?? ''}
                          onChange={(ev) => setNoteDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                          onBlur={(ev) => {
                            const next = ev.target.value.trim() || null;
                            if (next !== (e.note ?? null)) updateEntry.mutate({ id: e.id, note: next });
                          }}
                          placeholder="Why him — the line you would say on the phone"
                          className="mt-1.5 h-7 border-border bg-background text-xs"
                        />
                      </div>

                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          onClick={() => move(e, -1)}
                          disabled={i === 0}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => move(e, 1)}
                          disabled={i === entries.length - 1}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {e.buy_pitch_id ? (
                        <button
                          onClick={() => navigate('/pitches')}
                          className="text-[10px] text-primary hover:underline"
                        >
                          View pitch →
                        </button>
                      ) : (
                        <Button
                          onClick={() => handleCreatePitch(e)}
                          variant="outline"
                          className="h-6 text-[10px]"
                          disabled={addPitch.isPending}
                        >
                          <SendHorizonal className="mr-1 h-3 w-3" /> Create pitch
                        </Button>
                      )}
                      <button
                        onClick={() => removeEntry.mutate(e.id)}
                        className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Remove from shortlist"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

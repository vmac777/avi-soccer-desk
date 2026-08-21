import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { matchRequirementsToPlayer } from '@/lib/matching';
import type { RosterPlayer } from '@/lib/rosterData';
import { useAllRequirements } from '@/hooks/useClubRequirements';
import { useClubs } from '@/hooks/useClubsAndSources';
import { useContacts } from '@/hooks/useData';
import { requirementSummary } from '@/lib/shortlistToPitch';

/**
 * Which clubs are looking for what this player is.
 *
 * The same engine as the needs page, read the other way round — and it costs
 * almost nothing, because `matchRequirementsToPlayer` was written alongside
 * `matchRosterToRequirement` and has been sitting unused just as long.
 *
 * It is how the job actually goes when a player rings you rather than the
 * other way about: he wants to move, and the question is who is in the market
 * for him right now.
 */

const scoreColour = (score: number) =>
  score >= 80 ? 'text-status-hot' : score >= 55 ? 'text-status-warm' : 'text-muted-foreground';

export default function WhoWantsThisSection({ player }: { player: RosterPlayer }) {
  const navigate = useNavigate();
  const { data: requirements = [] } = useAllRequirements();
  const { data: clubs = [] } = useClubs();
  const { data: contacts = [] } = useContacts();

  const byId = useMemo(
    () => Object.fromEntries(requirements.map((r) => [r.id, r])),
    [requirements],
  );

  // The engine filters to open requirements itself and sorts best first.
  const matches = useMemo(
    () => matchRequirementsToPlayer(requirements, player),
    [requirements, player],
  );

  const clubNameOf = (requirementId: string) => {
    const r = byId[requirementId];
    if (!r) return 'Unknown club';
    if (r.club_id) return clubs.find((c) => c.id === r.club_id)?.name ?? 'Unknown club';
    if (r.contact_id) return contacts.find((c) => c.id === r.contact_id)?.club ?? 'Unknown club';
    return 'Unattributed';
  };

  if (matches.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
        WHO WANTS THIS PROFILE ({matches.length})
      </h2>
      <div className="space-y-1.5">
        {matches.map((m) => {
          const r = byId[m.requirementId];
          if (!r) return null;
          return (
            <button
              key={m.requirementId}
              onClick={() => navigate(`/needs/${m.requirementId}`)}
              className="flex w-full items-center justify-between gap-3 rounded border border-border px-2.5 py-2 text-left transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <span className="text-xs font-medium text-foreground">{clubNameOf(m.requirementId)}</span>
                <p className="truncate text-[10px] text-muted-foreground">{requirementSummary(r)}</p>
              </div>
              <span className={cn('shrink-0 font-mono text-sm font-semibold', scoreColour(m.score))}>
                {m.score}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

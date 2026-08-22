import { cn } from '@/lib/utils';
import { formatMoneyShort } from '@/lib/money';
import { getAge, getLatestXtvM, type RosterPlayer } from '@/lib/rosterData';
import { playerInitials } from '@/lib/deskBoard';

/**
 * Who he actually represents, biggest first.
 *
 * Not a count of the roster — the faces, because that is the thing an agent
 * points at. Each card carries the asking price and the direction it has moved,
 * so the page shows a book rather than describing one.
 *
 * When a need above is open, this grid answers it: the players who fit that
 * need keep full opacity and take a gold flag; everyone else drops back. The
 * connection between "6 of yours fit" and *which* six is otherwise something
 * the reader has to hold in their head.
 */

/**
 * The sparkline comes from `player.xtvHistory`, which is already on the roster
 * row. The handoff called for `useSquadXtvHistory`, which is a query per
 * player — four extra round trips on every board load for a 90×30 graphic.
 * Same numbers, same source table, no requests.
 */
function sparkPoints(player: RosterPlayer, w = 90, h = 30): { d: string; rising: boolean } | null {
  const hist = [...(player.xtvHistory ?? [])]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-7);
  if (hist.length < 2) return null;

  const vals = hist.map((p) => p.xtv);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      // Inset by 2px top and bottom so a flat line is not drawn on the edge.
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return { d, rising: vals[vals.length - 1] >= vals[0] };
}

export interface BookCard {
  player: RosterPlayer;
  monthsLeft: number | null;
  /** Set when a need is open above and this player fits it. */
  flag: string | null;
  /** True when a need is open above and this player does not fit it. */
  dimmed: boolean;
}

function Card({ card, onOpen, compact = false }: {
  card: BookCard; onOpen: () => void; compact?: boolean;
}) {
  const { player: p, monthsLeft, flag, dimmed } = card;
  const xtv = getLatestXtvM(p);
  const value = xtv != null ? formatMoneyShort(xtv * 1_000_000) : '—';
  const meta = [p.position, getAge(p.dob) ?? p.age, p.currentClub].filter(Boolean).join(' · ');
  const spark = compact ? null : sparkPoints(p);

  const photo = (
    <div className={cn('relative w-full overflow-hidden bg-sidebar', compact ? 'h-[188px]' : 'h-[126px]')}>
      {p.photoUrl
        ? <img src={p.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        : (
          <span className="flex h-full w-full items-center justify-center font-display text-3xl text-foreground/25">
            {playerInitials(p.name)}
          </span>
        )}
      {flag && (
        <span className="absolute left-2 top-2 rounded-[3px] bg-primary px-[7px] py-[3px] font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] text-primary-foreground">
          Fits {flag}
        </span>
      )}
      {compact && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-b from-transparent to-[hsl(var(--sidebar-background)/0.94)]" />
          <div className="absolute inset-x-2.5 bottom-2">
            <p className="font-display text-xl leading-none text-foreground">{p.name}</p>
            <p className="mt-1 font-mono text-sm text-primary">{value}</p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <button
      onClick={onOpen}
      className={cn(
        'board-rise overflow-hidden rounded-lg border bg-card text-left transition-[opacity,border-color,transform] duration-200',
        'hover:-translate-y-0.5 hover:border-primary/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        flag ? 'border-primary/85' : 'border-border',
        dimmed ? 'opacity-[0.28]' : 'opacity-100',
        compact ? 'w-[152px] shrink-0 snap-start rounded-[9px]' : 'w-full',
      )}
    >
      {photo}
      {compact ? (
        <p className="truncate px-2.5 py-2 text-[10.5px] text-foreground/50">{meta}</p>
      ) : (
        <div className="px-3.5 pb-3.5 pt-3">
          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
          <p className="mt-[3px] truncate text-[11px] text-foreground/50">{meta}</p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <span className="font-mono text-[19px] font-medium tabular-nums text-foreground">{value}</span>
            <div className="flex items-center gap-2">
              {monthsLeft != null && monthsLeft <= 12 && (
                <span className={cn(
                  'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
                  monthsLeft <= 6
                    ? 'border-status-cold/30 bg-status-cold/10 text-status-cold'
                    : 'border-primary/30 bg-primary/10 text-primary',
                )}>
                  {monthsLeft}m
                </span>
              )}
              {/* Only when there is a trend to draw. One data point is not a
                  direction, and a flat stub implies a stability we did not
                  measure. */}
              {spark && (
                <svg viewBox="0 0 90 30" className="h-[30px] w-[90px] overflow-visible" aria-hidden>
                  <polyline
                    points={spark.d}
                    fill="none"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    className={cn('board-draw', spark.rising ? 'stroke-glow-them' : 'stroke-status-cold')}
                  />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

export default function TheBook({ cards, onOpen }: {
  cards: BookCard[];
  onOpen: (playerId: string) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <>
      <div className="-mx-[18px] flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[18px] pb-1 md:hidden">
        {cards.map((c) => (
          <Card key={c.player.id} card={c} compact onOpen={() => onOpen(c.player.id)} />
        ))}
      </div>
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.player.id} card={c} onOpen={() => onOpen(c.player.id)} />
        ))}
      </div>
    </>
  );
}

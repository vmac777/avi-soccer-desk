import { cn } from '@/lib/utils';
import { formatMoneyShort } from '@/lib/money';
import type { UnpitchedNeed, FitRow } from '@/lib/deskBoard';

/**
 * One club's open ask, and who of ours answers it.
 *
 * The card is the hero of the board, so it carries its own evidence: hovering
 * it (or focusing it, or tapping it on a phone) opens a panel listing every
 * player the scorer considered — those who fit and those who do not, each with
 * the reason. A card that only claimed "6 of yours fit" would be asking to be
 * believed; this one shows the working.
 *
 * `open` is driven by the parent rather than local state because the same flag
 * dims the book below. One component, three input methods: `onMouseEnter` on a
 * pointer, `onFocus` for a keyboard, `onClick` for a thumb.
 */

/** Rank by fit strength, strongest first. The left edge is the ranking. */
const RANK_EDGE = ['border-l-primary', 'border-l-primary/70', 'border-l-primary/45', 'border-l-primary/30'];
const RANK_TEXT = ['text-primary', 'text-primary/70', 'text-primary/60', 'text-primary/50'];
const RANK_BAR = ['bg-primary', 'bg-primary/70', 'bg-primary/60', 'bg-primary/50'];

function FitLine({ row }: { row: FitRow }) {
  return (
    <div className="grid grid-cols-[16px_1fr_auto] items-baseline gap-2.5 border-b border-foreground/[0.07] py-1.5 last:border-0 md:py-1.5">
      <span className={cn('font-mono text-[11px] font-semibold', row.ok ? 'text-glow-them' : 'text-foreground/40')}>
        {row.ok ? '✓' : '×'}
      </span>
      <div className="min-w-0">
        <p className={cn('text-[13px] font-medium leading-snug md:text-[12.5px]', row.ok ? 'text-foreground' : 'text-foreground/55')}>
          {row.name}
          {row.meta && <span className="ml-1 text-[11px] font-normal text-foreground/40">· {row.meta}</span>}
        </p>
        {/* Only when the scorer produced one. A blank line is the honest
            rendering of "we could not work this out". */}
        {row.verdict && (
          <p className={cn('mt-0.5 font-mono text-[10.5px]', row.ok ? 'text-glow-them' : 'text-foreground/40')}>
            {row.verdict}
          </p>
        )}
      </div>
      <span className="font-mono text-xs tabular-nums text-foreground/70">
        {row.value != null ? formatMoneyShort(row.value) : '—'}
      </span>
    </div>
  );
}

export default function NeedCard({
  need,
  rank,
  maxFits,
  open,
  onHover,
  onUnhover,
  onToggle,
  onPutForward,
  onOpenNeed,
}: {
  need: UnpitchedNeed;
  rank: number;
  maxFits: number;
  open: boolean;
  /** Pointer or focus. Dims the book to this need's fits; opens nothing. */
  onHover: () => void;
  onUnhover: () => void;
  /** A deliberate click, Enter or Space. The only thing that opens the panel. */
  onToggle: () => void;
  onPutForward: () => void;
  onOpenNeed: () => void;
}) {
  const edge = RANK_EDGE[Math.min(rank, RANK_EDGE.length - 1)];
  const text = RANK_TEXT[Math.min(rank, RANK_TEXT.length - 1)];
  const bar = RANK_BAR[Math.min(rank, RANK_BAR.length - 1)];
  const fits = need.rows.filter((r) => r.ok);
  const avatars = fits.slice(0, 3);
  const barPct = maxFits > 0 ? Math.round((need.fitCount / maxFits) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      /*
        Hover dims the book; it does not open anything. Panels unfolding as the
        pointer crosses the grid read as the page twitching, and focus is worse:
        tabbing four cards would leave four panels open behind you. Enter is
        right there for a keyboard, and it goes through the same path a click
        and a tap do.
      */
      onMouseEnter={onHover}
      onMouseLeave={onUnhover}
      onFocus={onHover}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onUnhover(); }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      className={cn(
        'board-rise cursor-pointer rounded-[10px] border border-l-[3px] p-3 transition-colors duration-200 md:rounded-lg md:p-[18px_20px]',
        'bg-gradient-to-br from-primary/10 via-transparent to-transparent',
        edge,
        open ? 'border-primary/70 from-primary/[0.17]' : 'border-border',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* Display type, not copy — it can lose a few pixels on a phone without
            costing anyone legibility, which the body text cannot. */}
        <p className="font-display text-[24px] leading-none tracking-[0.03em] text-foreground md:text-[30px]">
          {need.club || 'A club'}
        </p>
        {/* Silence rather than a guess: a need with no recorded ask date says
            nothing about its age instead of implying it arrived today. */}
        {need.askedDaysAgo != null && (
          <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
            asked {need.askedDaysAgo === 0 ? 'today' : `${need.askedDaysAgo}d ago`}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-foreground/[0.78]">{need.want}</p>

      <div className="mt-3 flex items-center gap-3 md:mt-4">
        <div className="flex shrink-0">
          {avatars.map((r) => (
            <span
              key={r.playerId}
              title={r.name}
              className="-ml-2 flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-background bg-[#152744] shadow-[inset_0_0_0_1px_rgba(240,235,221,0.14)] first:ml-0 md:h-[38px] md:w-[38px]"
            >
              {/* Same crop anchor as the book, so a face is framed the same way
                  wherever it appears on the page. */}
              {r.photoUrl
                ? <img src={r.photoUrl} alt="" className="h-full w-full object-cover object-[center_22%]" loading="lazy" />
                : <span className="font-mono text-[11px] font-semibold text-foreground/70">{r.initials}</span>}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            {/* The label is the number, and the number must never be the thing
                that wraps — "4 OF YOURS / FIT" across two lines was the note
                beside it taking the width. It truncates instead. */}
            <span className={cn('shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.12em]', text)}>
              {need.fitCount} of yours fit
            </span>
            <span className="truncate text-[11px] text-foreground/40">
              {need.alsoAtClub > 0
                ? `${need.alsoAtClub} more open need${need.alsoAtClub === 1 ? '' : 's'} at the club`
                : 'nobody put forward'}
            </span>
          </div>
          <span className="mt-[7px] block h-1 bg-foreground/10">
            <span className={cn('board-grow block h-1', bar)} style={{ width: `${barPct}%` }} />
          </span>
          <p className="mt-1.5 truncate text-[11.5px] text-foreground/50">
            {fits.map((r) => r.name).join(', ')}
          </p>
        </div>

        {/* On every screen now. With nothing opening on hover, this is the only
            thing saying the card has more inside it. */}
        <span className="shrink-0 font-mono text-xl leading-none text-foreground/40" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </div>

      {/*
        The evidence and the actions arrive together.

        Two full-width buttons were forty per cent of a collapsed card — the
        largest thing on a summary nobody had decided to act on yet — so two
        cards filled a phone. They now sit under the panel, which also means
        nobody puts four players forward without having seen which four.
      */}
      {open && (
        <div className="board-panel mt-3 border-t border-foreground/[0.14] pt-3">
          <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
            Who of yours fits
          </p>
          {need.rows.map((r) => <FitLine key={r.playerId} row={r} />)}

          <div className="mt-3 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onPutForward(); }}
              className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:flex-none md:rounded-[5px] md:py-[9px] md:text-[11.5px]"
            >
              Put {need.fitCount} forward
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenNeed(); }}
              className="flex-1 rounded-md border border-foreground/20 px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-primary hover:text-primary md:flex-none md:rounded-[5px] md:px-3.5 md:py-[9px] md:text-[11.5px]"
            >
              Open the need
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import type { Opportunity, OpportunityKind } from '@/lib/deskBoard';

/**
 * Everything the board used to rank above club needs, demoted to one strip.
 *
 * These are still real — someone owes us an answer, a contract is running
 * down, a valuation moved — but each is a fact to glance at rather than a
 * decision to make, and giving six of them equal weight with the needs was
 * what made the old board read as a list to work through.
 *
 * Four across on a desk, a swipe shelf on a phone. Same cards either way; the
 * shelf is a real overflow-scroll rather than a transform carousel so a
 * keyboard and a screen reader can still reach the fourth one.
 */

const METER: Record<OpportunityKind, string> = {
  ball_in_court: 'bg-status-cold',
  contract_clock: 'bg-status-cold',
  deadline_near: 'bg-status-warm',
  value_moved: 'bg-glow-them',
  unworked_match: 'bg-primary',
  quiet_club: 'bg-primary',
};

const TEXT: Record<OpportunityKind, string> = {
  ball_in_court: 'text-status-cold',
  contract_clock: 'text-status-cold',
  deadline_near: 'text-status-warm',
  value_moved: 'text-glow-them',
  unworked_match: 'text-primary',
  quiet_club: 'text-primary',
};

/** The three or four characters that say what kind of thing this is. */
const TAG: Record<OpportunityKind, string> = {
  ball_in_court: 'ON US',
  deadline_near: 'DEADLINE',
  contract_clock: 'CONTRACT',
  value_moved: 'VALUE',
  unworked_match: 'FITS',
  quiet_club: 'QUIET',
};

function Cell({ item, onOpen }: { item: Opportunity; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        'board-rise flex w-[228px] shrink-0 snap-start flex-col bg-card p-[14px_16px] text-left',
        'transition-colors hover:bg-[#182b47] md:w-auto md:shrink',
      )}
    >
      <span className="mb-[11px] block h-[3px] w-full bg-foreground/[0.12]">
        <span
          className={cn('board-grow block h-[3px]', METER[item.kind])}
          style={{ width: `${Math.min(100, item.urgency)}%` }}
        />
      </span>
      <p className="text-[13.5px] font-medium leading-[1.35] text-foreground md:text-[13px]">
        {item.headline}
      </p>
      <p className="mt-[5px] text-[11px] text-foreground/[0.48]">{item.detail}</p>
      <p className={cn('mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]', TEXT[item.kind])}>
        {TAG[item.kind]}
      </p>
    </button>
  );
}

export default function DeskStrip({ items, onOpen }: {
  items: Opportunity[];
  onOpen: (item: Opportunity) => void;
}) {
  if (items.length === 0) return null;

  return (
    <>
      {/* Phone: a snap shelf, padded so the first card lines up with the text
          column rather than with the screen edge. */}
      <div className="-mx-[18px] flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[18px] pb-1 md:hidden">
        {items.map((item) => <Cell key={item.id} item={item} onOpen={() => onOpen(item)} />)}
      </div>

      {/* Desk: four across, the 1px gaps reading as rules against the border. */}
      <div className="hidden overflow-hidden rounded-[7px] border border-foreground/[0.12] bg-foreground/[0.12] md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-px">
        {items.map((item) => <Cell key={item.id} item={item} onOpen={() => onOpen(item)} />)}
      </div>
    </>
  );
}

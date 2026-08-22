import { cn } from '@/lib/utils';

/**
 * Whose leverage is running out, and when.
 *
 * A contract's last year is the only window in which an agent has real power,
 * and the old board mentioned it one player at a time in a card. Laid out on a
 * twelve-month axis it becomes a shape: everything crowded at the left is
 * money that has to be moved this window.
 *
 * On a phone the axis is abandoned rather than shrunk. Twelve months of pins
 * inside 357px collide into an unreadable smear, so it becomes a list of bars
 * — same data, same ordering, a layout that fits.
 */

export interface RunwayPin {
  id: string;
  name: string;
  months: number;
}

/** Red inside a quarter, amber inside a half-year, gold beyond. */
const pinColour = (m: number) =>
  m <= 3 ? { dot: 'bg-status-cold', text: 'text-status-cold', bar: 'bg-status-cold' }
  : m <= 6 ? { dot: 'bg-status-warm', text: 'text-status-warm', bar: 'bg-status-warm' }
  : { dot: 'bg-primary', text: 'text-primary', bar: 'bg-primary' };

export default function ContractRunway({ pins, hidden = 0, onOpen }: {
  pins: RunwayPin[];
  /** How many more were dropped so the labels do not collide. */
  hidden?: number;
  onOpen: (id: string) => void;
}) {
  if (pins.length === 0) return null;

  return (
    <>
      {/* Desk: the twelve-month band. */}
      <div className="board-rise relative hidden h-[118px] overflow-hidden rounded-lg border border-foreground/[0.12] px-5 pt-4 md:block"
           style={{ background: 'linear-gradient(90deg, hsl(var(--status-cold) / 0.16), hsl(var(--primary) / 0.08) 45%, transparent 75%)' }}>
        <div className="absolute left-5 right-5 top-16 h-px bg-foreground/[0.16]" />
        {pins.map((p) => {
          const c = pinColour(p.months);
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              style={{ left: `${Math.min(96, Math.max(4, (p.months / 12) * 100))}%` }}
              className="absolute top-5 flex -translate-x-1/2 flex-col items-center gap-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <span className="whitespace-nowrap text-[13px] text-foreground">{p.name}</span>
              <span className={cn('font-mono text-[9.5px] font-semibold', c.text)}>
                {p.months}m left
              </span>
              <span className={cn('h-[9px] w-[9px] rounded-full shadow-[0_0_0_4px_hsl(var(--background))]', c.dot)} />
            </button>
          );
        })}
        <div className="absolute bottom-3 left-5 right-5 flex justify-between font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/[0.35]">
          <span>Now</span><span>3M</span><span>6M</span><span>9M</span><span>12M</span>
        </div>
        {hidden > 0 && (
          <span className="absolute right-5 top-5 font-mono text-[9px] text-foreground/40">
            +{hidden} more
          </span>
        )}
      </div>

      {/* Phone: the same players as bars. */}
      <div className="board-rise md:hidden">
        {pins.map((p) => {
          const c = pinColour(p.months);
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="flex w-full items-center gap-3 border-b border-foreground/[0.1] py-2.5 text-left last:border-0"
            >
              <span className="w-[88px] shrink-0 truncate text-[13.5px] text-foreground">{p.name}</span>
              <span className="h-1.5 flex-1 bg-foreground/10">
                <span className={cn('board-grow block h-1.5', c.bar)} style={{ width: `${(p.months / 12) * 100}%` }} />
              </span>
              <span className={cn('w-12 shrink-0 text-right font-mono text-[10.5px] font-semibold', c.text)}>
                {p.months}m
              </span>
            </button>
          );
        })}
        <p className="mt-3 text-[11.5px] text-foreground/40">
          Leverage peaks inside six months.
          {hidden > 0 && ` ${hidden} more not shown.`}
        </p>
      </div>
    </>
  );
}

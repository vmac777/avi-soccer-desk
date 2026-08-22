import { cn } from '@/lib/utils';
import { assignLanes, type RunwayPin } from '@/lib/runwayLanes';

/**
 * Whose leverage is running out, and when.
 *
 * A contract's last year is the only window in which an agent has real power,
 * and the old board mentioned it one player at a time in a card. Laid out on a
 * twelve-month axis it becomes a shape: everything crowded at the left is
 * money that has to be moved this window.
 *
 * Crowding is the normal case, not the exception — contracts expire on the same
 * few dates — so the labels stack into lanes and the dots stay on their true
 * months. `assignLanes` owns that rule and is tested on its own.
 *
 * On a phone the axis is abandoned rather than shrunk. Twelve months of pins
 * inside 357px collide whatever the lane rule does, so it becomes a list of
 * bars — same data, same ordering, a layout that fits.
 */

export type { RunwayPin };

/** Vertical room one lane of label needs. */
const LANE_HEIGHT = 26;
/** Baseline to the bottom of the band — room for the month axis. */
const AXIS_ROOM = 34;
/** Name, months and the dot itself, before any leader line. */
const LABEL_BLOCK = 42;

/** Red inside a quarter, amber inside a half-year, gold beyond. */
const pinColour = (m: number) =>
  m <= 3 ? { dot: 'bg-status-cold', text: 'text-status-cold', bar: 'bg-status-cold' }
  : m <= 6 ? { dot: 'bg-status-warm', text: 'text-status-warm', bar: 'bg-status-warm' }
  : { dot: 'bg-primary', text: 'text-primary', bar: 'bg-primary' };

export default function ContractRunway({ pins, hidden = 0, onOpen }: {
  pins: RunwayPin[];
  /** How many more the caller had already set aside before laning. */
  hidden?: number;
  onOpen: (id: string) => void;
}) {
  if (pins.length === 0) return null;

  const { laned, hidden: crowded } = assignLanes(pins);
  const notShown = hidden + crowded;
  const lanesUsed = laned.reduce((n, p) => Math.max(n, p.lane + 1), 1);

  /*
    Every pin's column is anchored at the same distance from the bottom, so
    every dot lands on the baseline. What varies is the leader line inside the
    column, which pushes that pin's name and months up by its lane. The band
    grows only as tall as the lanes actually in use.
  */
  const columnBottom = AXIS_ROOM - 4;
  const bandHeight = columnBottom + LABEL_BLOCK + (lanesUsed - 1) * LANE_HEIGHT + 14;

  return (
    <>
      {/* Desk: the twelve-month band. */}
      <div className="board-rise relative hidden overflow-hidden rounded-lg border border-foreground/[0.12] px-5 md:block"
           style={{
             height: bandHeight,
             background: 'linear-gradient(90deg, hsl(var(--status-cold) / 0.16), hsl(var(--primary) / 0.08) 45%, transparent 75%)',
           }}>
        <div className="absolute left-5 right-5 h-px bg-foreground/[0.16]" style={{ bottom: AXIS_ROOM }} />

        {laned.map((p) => {
          const c = pinColour(p.months);
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              style={{ left: `${p.x}%`, bottom: columnBottom }}
              className="absolute flex -translate-x-1/2 flex-col items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <span className="whitespace-nowrap text-[13px] leading-tight text-foreground">{p.name}</span>
              <span className={cn('font-mono text-[9.5px] font-semibold leading-tight', c.text)}>
                {p.months}m left
              </span>
              {/* Leader down to the dot, so a label two lanes up still clearly
                  belongs to its own contract. */}
              <span
                className="w-px bg-foreground/20"
                style={{ height: p.lane * LANE_HEIGHT + 4 }}
              />
              <span className={cn('h-[9px] w-[9px] shrink-0 rounded-full shadow-[0_0_0_4px_hsl(var(--background))]', c.dot)} />
            </button>
          );
        })}

        <div className="absolute bottom-3 left-5 right-5 flex justify-between font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/[0.35]">
          <span>Now</span><span>3M</span><span>6M</span><span>9M</span><span>12M</span>
        </div>
        {notShown > 0 && (
          <span className="absolute right-5 top-4 font-mono text-[9px] text-foreground/40">
            +{notShown} more
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

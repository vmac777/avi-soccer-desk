import { useCountUp } from '@/hooks/useCountUp';
import { formatMoneyShort } from '@/lib/money';
import Crest from '@/components/board/Crest';

/**
 * The two sentences the morning starts with.
 *
 * Numerals rather than prose because these are counts and a count should look
 * like one, and crests under each clause because "14 fit open needs" means
 * nothing until you can see whose needs they are. The three stat blocks on the
 * right are desktop only — on a phone the two numerals carry it, and a row of
 * six numbers on a 393px screen is a wall.
 *
 * Every number here counts up from zero, which is decoration; with reduced
 * motion on it simply appears, which is the point.
 */

export interface HeroClub { id: string; name: string; crest?: string | null }

function Clause({
  value, text, clubs, small = false,
}: {
  value: number; text: string; clubs: HeroClub[]; small?: boolean;
}) {
  const shown = useCountUp(value);
  const visible = clubs.slice(0, 4);
  const extra = clubs.length - visible.length;

  return (
    <div className="flex items-start gap-3">
      <span className={small
        ? 'font-display text-[40px] leading-[0.8] text-foreground md:text-[66px]'
        : 'font-display text-[60px] leading-[0.8] text-foreground md:text-[66px]'}>
        {shown}
      </span>
      <div>
        <p className="max-w-[210px] text-sm leading-[1.35] text-foreground/[0.78] md:text-[15px]">{text}</p>
        {visible.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5">
            {visible.map((c) => <Crest key={c.id} club={c.name} crest={c.crest} />)}
            {extra > 0 && (
              <span className="font-mono text-[10px] text-foreground/40">+{extra}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, gold = false, money = false }: {
  label: string; value: number; gold?: boolean; money?: boolean;
}) {
  const shown = useCountUp(value);
  return (
    <div className="bg-background px-[22px] pb-3 pt-3.5">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
        {label}
      </p>
      <p className={`mt-1.5 font-mono text-[30px] font-medium tabular-nums ${gold ? 'text-primary' : 'text-foreground'}`}>
        {money ? formatMoneyShort(shown) : shown}
      </p>
    </div>
  );
}

export default function BoardHero({
  greeting, fitCount, fitClubs, waitingCount, waitingClubs, openNeeds, bookValue,
}: {
  greeting: string;
  fitCount: number;
  fitClubs: HeroClub[];
  waitingCount: number;
  waitingClubs: HeroClub[];
  openNeeds: number;
  bookValue: number;
}) {
  return (
    <div className="board-rise flex flex-wrap items-end justify-between gap-8 md:flex-nowrap md:gap-10">
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-primary">
          {greeting}
        </p>

        <div className="mt-4 flex flex-col md:flex-row md:items-start md:gap-[26px]">
          <Clause
            value={fitCount}
            text={fitCount === 1
              ? 'of your players fits a need that is sitting open'
              : 'of your players fit needs that are sitting open'}
            clubs={fitClubs}
          />
          <span className="hidden w-px self-stretch bg-foreground/[0.16] md:block" />
          {/* On a phone this sits under a rule instead of beside a divider —
              the two clauses stack rather than compete for 393px. */}
          <div className="mt-[18px] border-t border-foreground/[0.16] pt-4 md:mt-0 md:border-0 md:pt-0">
            <Clause
              small
              value={waitingCount}
              text={waitingCount === 1
                ? 'placement is waiting on you'
                : 'placements are waiting on you'}
              clubs={waitingClubs}
            />
          </div>
        </div>
      </div>

      <div className="hidden gap-px bg-foreground/[0.12] md:flex">
        <Stat label="Open needs" value={openNeeds} gold />
        <Stat label="Fits unpitched" value={fitCount} />
        <Stat label="Book value" value={bookValue} money />
      </div>
    </div>
  );
}

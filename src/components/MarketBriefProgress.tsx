import { useEffect, useState } from 'react';

const STEPS = [
  'Resolving player and target market',
  'Pulling TransferRoom data across competitions',
  'Reading news, press, and prior pitch history',
  'Anthropic synthesis',
  'Persisting and returning',
];

// Cumulative ms at which step i becomes "current". Step 0 starts immediately.
const TIMINGS_MS = [0, 5_000, 15_000, 25_000, 110_000];

export default function MarketBriefProgress() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timers = TIMINGS_MS.slice(1).map((ms, i) =>
      setTimeout(() => setCurrent(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-2 font-mono text-sm">
      {STEPS.map((label, i) => {
        const status = i < current ? '✓' : i === current ? '⠋' : '·';
        const colorClass =
          i < current
            ? 'text-primary'
            : i === current
            ? 'text-foreground'
            : 'text-muted-foreground';
        return (
          <div key={i} className={`flex items-center gap-2 ${colorClass}`}>
            <span className="w-10 text-xs">[{i + 1}/{STEPS.length}]</span>
            <span className="flex-1">{label}</span>
            <span className={i === current ? 'animate-pulse' : ''}>{status}</span>
          </div>
        );
      })}
      <div className="pt-2 text-[10px] text-muted-foreground">
        Typical run: 60–110s. Hard ceiling: 120s.
      </div>
    </div>
  );
}

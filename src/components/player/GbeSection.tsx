import { useState } from 'react';
import { RosterPlayer as Player, hasTrData } from '@/lib/rosterData';
import { cn } from '@/lib/utils';
import SectionWrapper from './SectionWrapper';
import { ChevronDown, ChevronUp } from 'lucide-react';

function resultColor(result: string | undefined) {
  if (!result) return 'bg-muted text-muted-foreground';
  const r = result.toLowerCase();
  if (r.includes('exceeds') || r === 'pass') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (r.startsWith('fail')) return 'bg-red-500/15 text-red-400 border-red-500/25';
  if (r.includes('settled') || r.includes('auto')) return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  return 'bg-muted text-muted-foreground';
}

interface BreakdownRow {
  label: string;
  value: number | undefined;
}

export default function GbeSection({ player }: { player: Player }) {
  const hasTr = hasTrData(player);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const rows: BreakdownRow[] = [
    { label: 'International Appearances', value: player.trGbeIntAppPts },
    { label: 'Domestic League Minutes', value: player.trGbeDomMinsPts },
    { label: 'Continental Comp. Minutes', value: player.trGbeContMinsPts },
    { label: 'League Position', value: player.trGbeLeaguePosPts },
    { label: 'Continental Progression', value: player.trGbeContProgPts },
    { label: 'League Standard', value: player.trGbeLeagueStdPts },
  ];

  return (
    <SectionWrapper title="GBE (UK WORK PERMIT)" defaultOpen={true}>
      {!hasTr || player.trGbeResult == null ? (
        <p className="text-sm text-muted-foreground font-mono">No GBE data available.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', resultColor(player.trGbeResult))}>
              {player.trGbeResult}
            </span>
            {player.trGbeScore != null && (
              <span className="text-sm text-foreground font-medium">{player.trGbeScore} pts</span>
            )}
          </div>

          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showBreakdown ? 'Hide' : 'Show'} breakdown
          </button>

          {showBreakdown && (
            <table className="w-full text-xs max-w-md">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-1.5 font-medium">Category</th>
                  <th className="text-right py-1.5 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-border/50">
                    <td className="py-1.5 text-muted-foreground">{r.label}</td>
                    <td className="py-1.5 text-right text-foreground">{r.value ?? '—'}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1.5 text-foreground">Total</td>
                  <td className="py-1.5 text-right text-foreground">{player.trGbeScore ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </SectionWrapper>
  );
}
